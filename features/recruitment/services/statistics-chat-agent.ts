import "server-only";

import { statisticsChatRequestSchema, type AgentReferencePayload } from "../schemas";
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
import {
  buildRecruitmentMermaidDiagramFromToolRecords,
  normalizeMermaidCodeFences,
  stripMermaidCodeFences,
} from "./chat-analytics-diagrams";
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
  buildAgentSkillPrompt,
  buildMissingCloseJobToolCall,
  buildMissingCreateJobToolCall,
  buildMissingToolRetryMessage,
  selectMissingToolRecoveryToolNames,
  selectAgentRuntimeSkills,
  selectToolNamesForSkills,
  shouldRetryForMissingToolUse,
} from "./statistics-chat-skills";
import {
  MAX_AGENT_STEPS,
  type LLMMessage,
  type ResponseToolCall,
  type StatisticsChatSession,
  type ToolExecutionRecord,
} from "./statistics-chat-types";
import { SlidingWindowRateLimiter } from "@/lib/rate-limit";
const chatLimiter = new SlidingWindowRateLimiter(15, 60_000);

function appendReferencesContextToUserMessage(
  content: string,
  references: AgentReferencePayload[] | undefined,
): string {
  if (!references?.length) return content;

  const referenceLines = references.flatMap((reference, index) => [
    `${index + 1}. CV reference`,
    `- cvId: ${reference.id}`,
    `- title: ${reference.title}`,
    ...(reference.subtitle ? [`- subtitle: ${reference.subtitle}`] : []),
    ...(reference.facts?.map((fact) => `- ${fact.label}: ${fact.value}`) ?? []),
  ]);

  return [
    content,
    "",
    "APP-SUPPLIED ACTIVE REFERENCES:",
    ...referenceLines,
    "- These references were selected from the application UI, not typed by the user.",
    "- Before answering about any referenced CV, call get_cv_details with that exact cvId.",
    "- If the user asks to compare, rank, or summarize all selected CVs, call get_cv_details for every listed cvId.",
    "- Treat visible reference labels as UI preview only; tool results are the source of truth.",
  ].join("\n");
}

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
    references,
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

  const hasAttachments = Boolean(attachments?.length);
  const preflight = classifyChatIntent(
    lastMessageText,
    hasAttachments,
  );
  const selectedSkills = selectAgentRuntimeSkills({
    message: lastMessageText,
    role,
    hasAttachments,
  });

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

        const responseText = normalizeMermaidCodeFences(
          ensureAgenticResponseStructure({
            text: grounded.text,
            userMessage: lastMessageText,
            role,
            records: toolExecutionHistory,
          }),
        );

        const diagram = buildRecruitmentMermaidDiagramFromToolRecords(
          toolExecutionHistory,
          { question: lastMessageText },
        );
        const responseWithDiagram = diagram
          ? `${stripMermaidCodeFences(responseText)}\n\n${diagram}`
          : responseText;

        return appendChatResponseCardsToContent(
          appendChatChartsToContent(responseWithDiagram, charts),
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

        const selectedToolNames = selectToolNamesForSkills(selectedSkills);
        let tools = getToolsForRole(role, { toolNames: selectedToolNames });
        if (tools.length === 0) {
          tools = getToolsForRole(role);
        }
        const activeToolNames = tools.map((tool) => tool.function.name);
        const systemPrompt = buildStatisticsChatSystemPrompt({
          role,
          today: new Date().toISOString().split("T")[0],
          attachments,
          skillInstructions: buildAgentSkillPrompt(
            selectedSkills,
            activeToolNames,
          ),
        });

        const shouldMinimizeHistory =
          isCandidateSearchOrRankingIntent(lastMessageText);
        const contextualHistory = shouldMinimizeHistory
          ? dbHistory.slice(-8).filter((message) => message.role === "user")
          : dbHistory.slice(-20);

        let referenceMessageIndex = -1;
        if (references?.length) {
          for (let index = contextualHistory.length - 1; index >= 0; index--) {
            if (contextualHistory[index].role === "user") {
              referenceMessageIndex = index;
              break;
            }
          }
        }

        const llmMessages: LLMMessage[] = [
          { role: "system", content: systemPrompt },
          ...contextualHistory.map((message, index) => {
            const withoutCards = extractChatResponseCardsFromContent(message.content);
            const visibleContent = extractChatChartsFromContent(withoutCards.content).content;
            return {
              role: message.role as "user" | "assistant",
              content:
                index === referenceMessageIndex
                  ? appendReferencesContextToUserMessage(visibleContent, references)
                  : visibleContent,
            };
          }),
        ];

        const toolExecutionCache = new Map<string, ToolExecutionRecord>();
        let consecutiveToolFailures = 0;
        let sawMutatingTool = false;
        let llmRetryUsed = false;
        let missingToolRetryUsed = false;
        let missingToolRecoveryUsed = false;

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
            if (
              !missingToolRetryUsed &&
              shouldRetryForMissingToolUse({
                message: lastMessageText,
                skills: selectedSkills,
                availableToolNames: activeToolNames,
                toolExecutionCount: toolExecutionHistory.length,
              })
            ) {
              missingToolRetryUsed = true;
              llmMessages.push({
                role: "assistant",
                content: textContent || "I attempted to answer without tools.",
              });
              llmMessages.push({
                role: "user",
                content: buildMissingToolRetryMessage(
                  selectedSkills,
                  activeToolNames,
                ),
              });
              continue;
            }

            const missingJobActionToolCall =
              buildMissingCloseJobToolCall({
                message: lastMessageText,
                skills: selectedSkills,
                availableToolNames: activeToolNames,
                records: toolExecutionHistory,
                step,
              }) ??
              buildMissingCreateJobToolCall({
                message: lastMessageText,
                skills: selectedSkills,
                availableToolNames: activeToolNames,
                records: toolExecutionHistory,
                step,
              });
            if (!missingToolRecoveryUsed && missingJobActionToolCall) {
              missingToolRecoveryUsed = true;
              const recoveryToolCalls: ResponseToolCall[] = [
                missingJobActionToolCall,
              ];

              llmMessages.push({
                role: "assistant",
                content: null,
                tool_calls: recoveryToolCalls,
              });

              queueToolCalls({
                toolCalls: recoveryToolCalls,
                attachments,
                toolExecutionCache,
                controller,
                encoder,
              });

              const recoveryResult = await executeToolCalls({
                toolCalls: recoveryToolCalls,
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

              consecutiveToolFailures = recoveryResult.consecutiveToolFailures;
              sawMutatingTool = recoveryResult.sawMutatingTool;
              if (recoveryResult.fullResponse) {
                fullResponse = recoveryResult.fullResponse;
              }

              if (recoveryResult.shouldReturn) {
                return;
              }

              if (recoveryResult.shouldBreakLoop) {
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

            const recoveryToolNames = selectMissingToolRecoveryToolNames({
              skills: selectedSkills,
              availableToolNames: activeToolNames,
            });
            if (
              !missingToolRecoveryUsed &&
              toolExecutionHistory.length === 0 &&
              recoveryToolNames.length > 0
            ) {
              missingToolRecoveryUsed = true;
              const recoveryToolCalls: ResponseToolCall[] = recoveryToolNames.map(
                (toolName, index) => ({
                  id: `missing-tool-recovery-${step}-${index}`,
                  type: "function",
                  function: { name: toolName, arguments: "{}" },
                }),
              );

              llmMessages.push({
                role: "assistant",
                content: null,
                tool_calls: recoveryToolCalls,
              });

              queueToolCalls({
                toolCalls: recoveryToolCalls,
                attachments,
                toolExecutionCache,
                controller,
                encoder,
              });

              const recoveryResult = await executeToolCalls({
                toolCalls: recoveryToolCalls,
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

              consecutiveToolFailures = recoveryResult.consecutiveToolFailures;
              sawMutatingTool = recoveryResult.sawMutatingTool;
              if (recoveryResult.fullResponse) {
                fullResponse = recoveryResult.fullResponse;
              }

              if (recoveryResult.shouldReturn) {
                return;
              }

              if (recoveryResult.shouldBreakLoop) {
                if (fullResponse) {
                  await streamImmediateText(
                    controller,
                    encoder,
                    `\n\n${fullResponse}`,
                  );
                }
                break;
              }

              const recoveryFallback =
                buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
                "I fetched the required tools, but could not build a deterministic summary.";
              fullResponse = prepareGroundedResponse(recoveryFallback);
              await streamImmediateText(controller, encoder, fullResponse);
              break;
            }

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

          const missingJobActionAfterToolCall =
            buildMissingCloseJobToolCall({
              message: lastMessageText,
              skills: selectedSkills,
              availableToolNames: activeToolNames,
              records: toolExecutionHistory,
              step,
            }) ??
            buildMissingCreateJobToolCall({
              message: lastMessageText,
              skills: selectedSkills,
              availableToolNames: activeToolNames,
              records: toolExecutionHistory,
              step,
            });
          if (!missingToolRecoveryUsed && missingJobActionAfterToolCall) {
            missingToolRecoveryUsed = true;
            const recoveryToolCalls: ResponseToolCall[] = [
              missingJobActionAfterToolCall,
            ];

            llmMessages.push({
              role: "assistant",
              content: null,
              tool_calls: recoveryToolCalls,
            });

            queueToolCalls({
              toolCalls: recoveryToolCalls,
              attachments,
              toolExecutionCache,
              controller,
              encoder,
            });

            const recoveryResult = await executeToolCalls({
              toolCalls: recoveryToolCalls,
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

            consecutiveToolFailures = recoveryResult.consecutiveToolFailures;
            sawMutatingTool = recoveryResult.sawMutatingTool;
            if (recoveryResult.fullResponse) {
              fullResponse = recoveryResult.fullResponse;
            }

            if (recoveryResult.shouldReturn) {
              return;
            }

            if (recoveryResult.shouldBreakLoop) {
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
