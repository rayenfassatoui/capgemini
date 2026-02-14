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

// ============ POST: Send message and stream response ============

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const role = session.user.role ?? 'ta';

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = statisticsChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.errors.map((e) => e.message).join(', ') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, conversationId: reqConversationId } = parsed.data;

  // Get or create conversation and save the user message
  const conversation = await getOrCreateChatConversation(session.user.id, reqConversationId);
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    await saveChatMessage(conversation.id, 'user', lastUserMessage.content);
  }

  // Gather data context scoped to user role
  const dataContext = await getStatisticsChatContext(session.user.id, role);

  const today = new Date().toISOString().split('T')[0];

  const roleDescriptions: Record<string, string> = {
    ta: 'You are answering a Talent Acquisition specialist. They can see CV pool data, job requirements, candidate pipeline, screening results, interviews, and skill gaps.',
    manager: 'You are answering a Hiring Manager. They can see candidate pipeline data (especially manager-stage candidates), interviews they conduct, and job requirements. They cannot see raw CV pool uploads or TA-specific screening details.',
    hr: 'You are answering an HR representative. They can see candidate pipeline data (especially HR-stage candidates and hired candidates), interviews, and overall recruitment metrics. They cannot see raw CV pool uploads.',
    admin: 'You are answering an Admin user. They have full access to all recruitment data.',
  };

  const systemPrompt = `You are an AI recruitment analytics assistant at Capgemini. You analyze recruitment data and provide actionable insights.

ROLE CONTEXT:
${roleDescriptions[role] ?? roleDescriptions.ta}
Current user role: ${role}

RULES:
- Answer ONLY based on the data provided below
- When asked to name or list candidates, use EXACTLY the names from the "Candidates by Stage" section - never guess or substitute names
- Be concise, data-driven, and actionable
- Use markdown formatting for readability (tables, lists, bold, headers)
- If the data doesn't contain information to answer the question, say so clearly
- Never invent or extrapolate data that isn't provided
- Round percentages to whole numbers
- For date-range queries, filter the interview data by the requested dates
- Always include specific numbers when available
- Keep responses focused and avoid filler text
- When the user asks for a chart or visual, or when a chart would help illustrate the data, generate a Mermaid diagram using a fenced code block with language "mermaid". Supported chart types: pie, xychart-beta (bar/line), flowchart, gantt. Examples:
  \`\`\`mermaid
  pie title Pipeline Distribution
    "New" : 6
    "TA Interview" : 3
    "Hired" : 3
  \`\`\`
  \`\`\`mermaid
  xychart-beta
    title "Top Skills"
    x-axis ["Git", "Python", "SQL"]
    bar [20, 16, 14]
  \`\`\`
- Prefer pie charts for distributions, xychart-beta bar for comparisons, gantt for timelines

DATA:
${dataContext}

Today's date: ${today}`;

  // Build message array for OpenRouter
  const llmMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) {
    return new Response('AI service not configured', { status: 503 });
  }

  // Stream from OpenRouter
  const openRouterResponse = await fetch(
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
        stream: true,
        temperature: 0.3,
      }),
    }
  );

  if (!openRouterResponse.ok) {
    return new Response(
      JSON.stringify({ error: `AI service error: ${openRouterResponse.status}` }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!openRouterResponse.body) {
    return new Response('No response stream', { status: 502 });
  }

  // Parse SSE stream from OpenRouter and forward text content
  const reader = openRouterResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const conversationId = conversation.id;

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      let fullResponse = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string };
                }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim().startsWith('data: ')) {
          const data = buffer.trim().slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string };
                }>;
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Skip
            }
          }
        }

        // Save complete assistant response to DB
        if (fullResponse.trim()) {
          await saveChatMessage(conversationId, 'assistant', fullResponse);
        }
      } catch {
        // Stream read error - still try to save partial response
        if (fullResponse.trim()) {
          await saveChatMessage(conversationId, 'assistant', fullResponse).catch(() => {});
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
