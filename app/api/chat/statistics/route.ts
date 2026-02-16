import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { statisticsChatRequestSchema } from '@/features/recruitment/schemas';
import {
  getStatisticsChatContext,
  getOrCreateChatConversation,
  saveChatMessage,
  getChatHistory,
  listChatConversations,
  createChatConversation,
  deleteChatConversation,
} from '@/features/recruitment/services';
import {
  getToolsForRole,
  executeAgentTool,
} from '@/features/recruitment/services/agent-tools';
import type { UserRole } from '@/features/recruitment/types';

// Max tool-call iterations before we force a final answer
const MAX_AGENT_STEPS = 8;

async function getAuthSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) return null;
  const role = session.user.role ?? 'ta';
  if (!['ta', 'admin', 'manager', 'hr'].includes(role)) return null;
  return session;
}

// ============ GET: List conversations or load messages ============

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');

  if (conversationId) {
    const history = await getChatHistory(conversationId);
    return Response.json(history);
  }

  const conversations = await listChatConversations(session.user.id);
  return Response.json({ conversations });
}

// ============ DELETE: Delete a specific conversation ============

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get('conversationId');

  if (!conversationId) {
    return new Response('conversationId is required', { status: 400 });
  }

  await deleteChatConversation(conversationId, session.user.id);
  return Response.json({ success: true });
}

// ============ PUT: Create a new conversation ============

export async function PUT() {
  const session = await getAuthSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const conversation = await createChatConversation(session.user.id);
  return Response.json(conversation);
}

// ---- Helpers for SSE streaming ----

interface ToolCallDelta {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface LLMChoice {
  delta?: {
    content?: string;
    tool_calls?: ToolCallDelta[];
  };
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
}

interface LLMResponse {
  choices?: LLMChoice[];
}

// ============ POST: Agentic chat with tool calling ============

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const role = (session.user.role ?? 'ta') as UserRole;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = statisticsChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.errors.map((e) => e.message).join(', '),
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, conversationId: reqConversationId, attachments } = parsed.data;

  const conversation = await getOrCreateChatConversation(
    session.user.id,
    reqConversationId
  );
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    await saveChatMessage(conversation.id, 'user', lastUserMessage.content);
  }

  const dataContext = await getStatisticsChatContext(session.user.id, role);
  const today = new Date().toISOString().split('T')[0];

  const roleDescriptions: Record<string, string> = {
    ta: 'You are answering a Talent Acquisition specialist. They have full access to CV pool, jobs, candidates, screening, interviews, and matching.',
    manager:
      'You are answering a Hiring Manager. They can see candidates (especially manager-stage), interviews they conduct, and jobs.',
    hr: 'You are answering an HR representative. They can see candidates (especially HR-stage and hired), interviews, and recruitment metrics.',
    admin:
      'You are answering an Admin user. They have full access to all recruitment data and operations.',
  };

  // Build tool list for this role
  const tools = getToolsForRole(role);

  const systemPrompt = `You are an AI-powered recruitment agent at Capgemini. You can both analyze data AND take actions on behalf of the user by calling tools.

ROLE CONTEXT:
${roleDescriptions[role] ?? roleDescriptions.ta}
Current user role: ${role}

CAPABILITIES:
You have access to tools that let you:
- List, view, and delete CVs in the pool
- Create jobs, list jobs, view job details
- Assign CVs to jobs (creating candidates)
- View candidates by job or pipeline stage, update candidate stages
- Match CVs against job requirements (basic or AI-enhanced)
- Generate AI screening for candidates
- Generate interview questions, schedule interviews
- View interview reports and today's schedule
- Get dashboard stats, CV pool stats, job stats, smart insights

RULES:
- Use tools to fetch real-time data rather than relying only on the static context below
- When the user asks you to DO something (create a job, match CVs, move a candidate), USE the appropriate tool
- When listing data, use tools to get the latest information
- Be concise, data-driven, and actionable
- Use markdown formatting for readability (tables, lists, bold, headers)
- If a tool call fails, explain the error clearly
- Never invent data - use tools or the context below
- Round percentages to whole numbers
- When a chart would help, use Mermaid diagrams in fenced code blocks
- For mutating actions (create, delete, update), confirm what you did after the tool completes
- For ID parameters (cvId, jobId, candidateId, interviewId), prefer UUID values from tool results; numeric indexes are also accepted

STATIC CONTEXT (may be stale - prefer tool calls for fresh data):
${dataContext}

Today's date: ${today}
${attachments && attachments.length > 0 ? `\nATTACHMENTS:\nThe user has attached ${attachments.length} file(s) to this message. You can process them with the upload_cv tool by specifying the attachmentIndex.\n${attachments.map((a, i) => `[${i}] ${a.filename} (${a.contentType}, ${Math.round(a.size / 1024)}KB)`).join('\n')}` : ''}`;

  // Build LLM messages with conversation history
  type LLMMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) {
    return new Response('AI service not configured', { status: 503 });
  }

  const encoder = new TextEncoder();
  const conversationId = conversation.id;

  // We use SSE to send: tool events (as JSON lines) then the final streamed text
  // Format:
  //   @@TOOL_START@@{"tool":"name","args":{...}}
  //   @@TOOL_END@@{"tool":"name","success":true,"summary":"..."}
  //   (then plain text streaming for final response)

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = '';

      try {
        // Agent loop: iterate until we get a text response or hit max steps
        let step = 0;
        while (step < MAX_AGENT_STEPS) {
          step++;

          // Call LLM (non-streaming for tool-call steps)
          const llmResponse = await fetch(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'openai/gpt-4.1-nano',
                messages: llmMessages,
                tools: tools.length > 0 ? tools : undefined,
                tool_choice: 'auto',
                temperature: 0.3,
                stream: false,
              }),
            }
          );

          if (!llmResponse.ok) {
            controller.enqueue(
              encoder.encode(
                `Sorry, the AI service returned an error (${llmResponse.status}). Please try again.`
              )
            );
            break;
          }

          const llmJson = (await llmResponse.json()) as LLMResponse;
          const choice = llmJson.choices?.[0];
          if (!choice) {
            controller.enqueue(
              encoder.encode('No response from AI. Please try again.')
            );
            break;
          }

          const message = choice.message;
          const toolCalls = message?.tool_calls;

          // If no tool calls, we have a final text response
          if (!toolCalls || toolCalls.length === 0) {
            const textContent = message?.content ?? '';

            // Now stream this final response to the client
            // We already have the full text, but we simulate streaming for UI consistency
            if (textContent) {
              // Push the assistant message to llmMessages for context
              llmMessages.push({
                role: 'assistant',
                content: textContent,
              });
              fullResponse = textContent;

              // Stream in chunks for smooth UI
              const chunkSize = 12;
              for (let i = 0; i < textContent.length; i += chunkSize) {
                controller.enqueue(
                  encoder.encode(textContent.slice(i, i + chunkSize))
                );
                // Small delay for stream feel
                await new Promise((r) => setTimeout(r, 8));
              }
            }
            break;
          }

          // We have tool calls - execute them
          // Add assistant message with tool_calls to history
          llmMessages.push({
            role: 'assistant',
            content: message?.content ?? null,
            tool_calls: toolCalls,
          });

          // Execute each tool call
          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            let toolArgs: Record<string, unknown> = {};
            try {
              toolArgs = JSON.parse(tc.function.arguments) as Record<
                string,
                unknown
              >;
            } catch {
              toolArgs = {};
            }

            // Send tool start event to client
            controller.enqueue(
              encoder.encode(
                `@@TOOL_START@@${JSON.stringify({ tool: toolName, args: toolArgs })}\n`
              )
            );

            // Inject attachment data for upload_cv tool
            if (toolName === 'upload_cv' && attachments) {
              const idx = parseInt(String(toolArgs.attachmentIndex ?? '0'), 10);
              if (idx >= 0 && idx < attachments.length) {
                toolArgs._attachment = attachments[idx];
              }
            }

            // Execute tool
            const result = await executeAgentTool(toolName, toolArgs, {
              userId: session.user.id,
              role,
            });

            // Build a compact summary for the UI event
            let summary: string;
            if (result.success) {
              if (Array.isArray(result.data)) {
                summary = `Returned ${result.data.length} result(s)`;
              } else if (result.data && typeof result.data === 'object') {
                summary = 'Completed successfully';
              } else {
                summary = 'Done';
              }
            } else {
              summary = result.error ?? 'Failed';
            }

            // Send tool end event
            controller.enqueue(
              encoder.encode(
                `@@TOOL_END@@${JSON.stringify({ tool: toolName, success: result.success, summary })}\n`
              )
            );

            // Add tool result to LLM history
            const toolResultContent = result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error });

            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: toolResultContent,
            });
          }

          // Continue loop - the LLM will see tool results and decide next step
        }

        // If we hit max steps without a final response, force one
        if (step >= MAX_AGENT_STEPS && !fullResponse) {
          const fallback =
            'I reached the maximum number of steps for this request. Here is what I found so far based on the tool calls above. Please ask a more specific question if you need additional details.';
          controller.enqueue(encoder.encode(fallback));
          fullResponse = fallback;
        }

        // Save assistant response
        if (fullResponse.trim()) {
          await saveChatMessage(conversationId, 'assistant', fullResponse);
        }
      } catch {
        if (!fullResponse) {
          controller.enqueue(
            encoder.encode(
              'An error occurred while processing your request. Please try again.'
            )
          );
        }
        if (fullResponse.trim()) {
          await saveChatMessage(
            conversationId,
            'assistant',
            fullResponse
          ).catch(() => {});
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
