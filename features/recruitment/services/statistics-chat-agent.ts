import "server-only";

import { statisticsChatRequestSchema } from "../schemas";
import {
  appendChatChartsToContent,
  extractChatChartsFromContent,
} from "../chat-chart-events";
import {
  appendChatResponseCardsToContent,
  extractChatResponseCardsFromContent,
} from "../chat-card-events";
import type { UserRole } from "../types";
import {
  getChatHistory,
  getOrCreateChatConversation,
  saveChatMessage,
} from "./chat";
import {
  buildGreetingResponse,
  classifyChatIntent,
  compareCandidatesDirect,
  searchResumesByName,
} from "./chat-orchestration";
import { getToolsForRole } from "./agent-tools";
import { getNvidiaClient } from "./ai";
import { buildAgentEvidenceMetadata } from "./agent-evidence";
import { buildAnalyticsChartsFromToolRecords } from "./chat-analytics-charts";
import { buildResponseCardsFromToolRecords } from "./chat-response-cards";
import {
  executeConfirmedActionIfRequested,
} from "./statistics-chat-confirmation";
import {
  groundAssistantResponse,
  isCandidateSearchOrRankingIntent,
} from "./candidate-grounding";
import {
  buildDeterministicFallbackFromRecords,
  logGroundingGuardBlock,
} from "./statistics-chat-formatting";
import { requestAgentCompletionWithRetryPolicy } from "./statistics-chat-llm";
import {
  emitMetaEvent,
  streamImmediateText,
  streamText,
} from "./statistics-chat-stream";
import {
  executeToolCalls,
  queueToolCalls,
} from "./statistics-chat-tool-loop";
import {
  buildOutOfScopeResponse,
  buildStatisticsChatSystemPrompt,
  ensureAgenticResponseStructure,
  isCreativeOffTopicRequest,
  isRecruitmentWorkRequest,
} from "./statistics-chat-prompt";
import {
  MAX_AGENT_STEPS,
  type LLMMessage,
  type ResponseToolCall,
  type StatisticsChatSession,
  type ToolExecutionRecord,
} from "./statistics-chat-types";
import { SlidingWindowRateLimiter } from "@/lib/rate-limit";
const chatLimiter = new SlidingWindowRateLimiter(15, 60_000);

export async function handleStatisticsChatPost(
  request: Request,
  session: StatisticsChatSession,
) {
  if (!chatLimiter.isAllowed(session.user.id)) {
    return Response.json(
      {
        error: "Too many requests. Please wait before sending another message.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": "15",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const role = (session.user.role ?? "ta") as UserRole;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = statisticsChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.errors.map((e) => e.message).join(", "),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    messages,
    conversationId: reqConversationId,
    attachments,
    confirmation,
  } = parsed.data;

  const conversation = await getOrCreateChatConversation(
    session.user.id,
    reqConversationId,
  );

  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === "user") {
    await saveChatMessage(
      conversation.id,
      session.user.id,
      "user",
      lastUserMessage.content,
    );
  }

  const { messages: dbHistory } = await getChatHistory(
    conversation.id,
    session.user.id,
  );

  const lastMessageText =
    lastUserMessage?.role === "user" ? lastUserMessage.content : "";

  const preflight = classifyChatIntent(
    lastMessageText,
    Boolean(attachments?.length),
  );

  const encoder = new TextEncoder();
  const conversationId = conversation.id;

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      const toolExecutionHistory: ToolExecutionRecord[] = [];
      const finalizeResponse = (text: string) =>
        ensureAgenticResponseStructure({
          text,
          userMessage: lastMessageText,
          role,
          records: toolExecutionHistory,
        });

      const prepareGroundedResponse = (text: string) => {
        const finalizedText = finalizeResponse(text);
        const grounded = groundAssistantResponse(
          finalizedText,
          toolExecutionHistory,
          {
            userMessage: lastMessageText,
            forceDeterministicRanking:
              isCandidateSearchOrRankingIntent(lastMessageText),
          },
        );

        if (grounded.blocked) {
          logGroundingGuardBlock({
            requestId,
            userId: session.user.id,
            rejectedNames: grounded.rejectedNames,
            toolNames: grounded.sourceTools,
          });
        }

        const evidence = buildAgentEvidenceMetadata(toolExecutionHistory, {
          role,
        });
        const charts = buildAnalyticsChartsFromToolRecords(
          toolExecutionHistory,
          {
            question: lastMessageText,
          },
        );
        const cards = buildResponseCardsFromToolRecords(toolExecutionHistory, {
          question: lastMessageText,
          role,
        });
        emitMetaEvent(controller, encoder, {
          groundingGuard: {
            blocked: grounded.blocked,
            deterministic: grounded.deterministic,
            candidateCount: grounded.candidateCount,
            rejectedCount: grounded.rejectedNames.length,
            sourceToolCount: grounded.sourceTools.length,
          },
          evidence,
          charts,
          cards,
        });

        const responseText = ensureAgenticResponseStructure({
          text: grounded.text,
          userMessage: lastMessageText,
          role,
          records: toolExecutionHistory,
        });

        return appendChatResponseCardsToContent(
          appendChatChartsToContent(responseText, charts),
          cards,
        );
      };

      const executeConfirmedAction = async () => {
        const result = await executeConfirmedActionIfRequested({
          confirmation,
          conversationId,
          userId: session.user.id,
          role,
          controller,
          encoder,
          prepareGroundedResponse,
          persistAssistantMessage: async (text: string) => {
            await saveChatMessage(
              conversationId,
              session.user.id,
              "assistant",
              text,
            );
          },
          toolExecutionHistory,
        });

        fullResponse = result.fullResponse;
        return result.handled;
      };

      try {
        if (await executeConfirmedAction()) {
          return;
        }
        if (preflight.intent === "greeting") {
          fullResponse = prepareGroundedResponse(buildGreetingResponse(role));
          await streamText(controller, encoder, fullResponse);
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
          return;
        }

        if (preflight.intent === "named_search" && preflight.requestedName) {
          const result = await searchResumesByName(
            session.user.id,
            preflight.requestedName,
            preflight.targetRoleQuery,
          );
          toolExecutionHistory.push({
            toolName: "direct_named_search",
            args: {
              requestedName: preflight.requestedName,
              targetRoleQuery: preflight.targetRoleQuery,
            },
            result: { success: true, data: result },
            mutating: false,
          });
          fullResponse = prepareGroundedResponse(result.responseText);
          await streamText(controller, encoder, fullResponse);
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
          return;
        }

        if (preflight.intent === "compare" && preflight.candidateRefs?.length) {
          const result = await compareCandidatesDirect(
            session.user.id,
            preflight.candidateRefs,
            role,
            preflight.targetRoleQuery,
          );
          toolExecutionHistory.push({
            toolName: "direct_compare_candidates",
            args: {
              candidateRefs: preflight.candidateRefs,
              targetRoleQuery: preflight.targetRoleQuery,
            },
            result: { success: true, data: result },
            mutating: false,
          });
          fullResponse = prepareGroundedResponse(result.responseText);
          await streamText(controller, encoder, fullResponse);
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
          return;
        }

        const hasAttachments = Boolean(attachments?.length);
        const isOffTopicCreative =
          !hasAttachments &&
          preflight.intent === "agent" &&
          isCreativeOffTopicRequest(lastMessageText) &&
          !isRecruitmentWorkRequest(lastMessageText);

        if (isOffTopicCreative) {
          fullResponse = prepareGroundedResponse(buildOutOfScopeResponse(role));
          await streamText(controller, encoder, fullResponse);
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
          return;
        }

        let nvidiaClient: ReturnType<typeof getNvidiaClient>;
        try {
          nvidiaClient = getNvidiaClient();
        } catch {
          fullResponse = prepareGroundedResponse("AI service not configured");
          await streamImmediateText(controller, encoder, fullResponse);
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
          return;
        }

        const tools = getToolsForRole(role);
        const systemPrompt = buildStatisticsChatSystemPrompt({
          role,
          today: new Date().toISOString().split("T")[0],
          attachments,
        });

        const shouldMinimizeHistory =
          isCandidateSearchOrRankingIntent(lastMessageText);
        const contextualHistory = shouldMinimizeHistory
          ? dbHistory.slice(-8).filter((message) => message.role === "user")
          : dbHistory.slice(-20);

        const llmMessages: LLMMessage[] = [
          { role: "system", content: systemPrompt },
          ...contextualHistory.map((message) => {
            const withoutCards = extractChatResponseCardsFromContent(message.content);
            return {
              role: message.role as "user" | "assistant",
              content: extractChatChartsFromContent(withoutCards.content).content,
            };
          }),
        ];

        const toolExecutionCache = new Map<string, ToolExecutionRecord>();
        let consecutiveToolFailures = 0;
        let sawMutatingTool = false;
        let llmRetryUsed = false;

        let step = 0;
        while (step < MAX_AGENT_STEPS) {
          step++;

          const completionResult = await requestAgentCompletionWithRetryPolicy({
            nvidiaClient,
            messages: llmMessages,
            tools,
            sawMutatingTool,
            retryUsed: llmRetryUsed,
            deterministicFallback:
              buildDeterministicFallbackFromRecords(toolExecutionHistory),
          });
          llmRetryUsed = completionResult.retryUsed;

          if (completionResult.fallback) {
            fullResponse = prepareGroundedResponse(completionResult.fallback);
            await streamImmediateText(controller, encoder, fullResponse);
            break;
          }

          const llmResponse = completionResult.response;

          if (!llmResponse) {
            const fallback =
              buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
              "No response from AI. Please try again.";
            fullResponse = prepareGroundedResponse(fallback);
            await streamImmediateText(controller, encoder, fullResponse);
            break;
          }

          const choice = llmResponse.choices?.[0];
          if (!choice) {
            const fallback =
              buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
              "No response from AI. Please try again.";
            fullResponse = prepareGroundedResponse(fallback);
            await streamImmediateText(controller, encoder, fullResponse);
            break;
          }

          const message = choice.message;
          const rawToolCalls = message?.tool_calls;
          const toolCalls = rawToolCalls?.filter(
            (tc: ResponseToolCall): tc is ResponseToolCall =>
              tc.type === "function" && "function" in tc,
          );

          if (!toolCalls || toolCalls.length === 0) {
            const textContent = message?.content ?? "";
            if (textContent) {
              const finalizedText = prepareGroundedResponse(textContent);
              llmMessages.push({
                role: "assistant",
                content: finalizedText,
              });
              fullResponse = finalizedText;
              await streamText(controller, encoder, finalizedText);
            } else {
              const fallback =
                buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
                "No response from AI. Please try again.";
              fullResponse = prepareGroundedResponse(fallback);
              await streamImmediateText(controller, encoder, fullResponse);
            }
            break;
          }

          llmMessages.push({
            role: "assistant",
            content: message?.content ?? null,
            tool_calls: toolCalls,
          });

          queueToolCalls({
            toolCalls,
            attachments,
            toolExecutionCache,
            controller,
            encoder,
          });

          const toolCallResult = await executeToolCalls({
            toolCalls,
            attachments,
            toolExecutionCache,
            toolExecutionHistory,
            llmMessages,
            controller,
            encoder,
            userId: session.user.id,
            role,
            conversationId,
            prepareGroundedResponse,
            persistAssistantMessage: async (text: string) => {
              await saveChatMessage(
                conversationId,
                session.user.id,
                "assistant",
                text,
              );
            },
            consecutiveToolFailures,
            sawMutatingTool,
          });

          consecutiveToolFailures = toolCallResult.consecutiveToolFailures;
          sawMutatingTool = toolCallResult.sawMutatingTool;
          if (toolCallResult.fullResponse) {
            fullResponse = toolCallResult.fullResponse;
          }

          if (toolCallResult.shouldReturn) {
            return;
          }

          if (toolCallResult.shouldBreakLoop) {
            if (fullResponse) {
              await streamImmediateText(
                controller,
                encoder,
                `\n\n${fullResponse}`,
              );
            }
            break;
          }
        }

        if (step >= MAX_AGENT_STEPS && !fullResponse) {
          const fallback =
            buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
            "I reached the maximum number of steps for this request. Please ask a more specific question if you need additional details.";
          fullResponse = prepareGroundedResponse(fallback);
          await streamImmediateText(controller, encoder, fullResponse);
        }

        if (fullResponse.trim()) {
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          );
        }
      } catch (error) {
        if (!fullResponse) {
          const message = error instanceof Error ? error.message : "Unknown error";
          const fallback = confirmation
            ? `I couldn't process that confirmation because: ${message}.`
            : "An error occurred while processing your request. Please try again.";
          fullResponse = prepareGroundedResponse(fallback);
          await streamImmediateText(controller, encoder, fullResponse);
        }

        if (fullResponse.trim()) {
          await saveChatMessage(
            conversationId,
            session.user.id,
            "assistant",
            fullResponse,
          ).catch(() => {});
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
      "X-Candidate-Grounding-Guard": "enabled",
    },
  });
}
