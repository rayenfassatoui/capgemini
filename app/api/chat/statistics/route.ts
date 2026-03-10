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
import { getModelForTask } from '@/features/recruitment/services/ai';
import type { UserRole } from '@/features/recruitment/types';
import { SlidingWindowRateLimiter } from '@/lib/rate-limit';

// Max tool-call iterations before we force a final answer
const MAX_AGENT_STEPS = 15;
const chatLimiter = new SlidingWindowRateLimiter(15, 60_000);

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

  if (!chatLimiter.isAllowed(session.user.id)) {
    return Response.json(
      { error: 'Too many requests. Please wait before sending another message.' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '15',
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

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

  // Load full conversation history from DB so the model always has complete memory
  const { messages: dbHistory } = await getChatHistory(conversation.id);

  const dataContext = await getStatisticsChatContext(session.user.id, role);
  const today = new Date().toISOString().split('T')[0];

  const roleDescriptions: Record<string, string> = {
    ta: 'Talent Acquisition specialist with full access to CV pool, jobs, candidates, screening, interviews, and matching.',
    manager: 'Hiring Manager who can see candidates at manager-stage and beyond, interviews they conduct, and jobs.',
    hr: 'HR representative who can see candidates at HR-stage and beyond, hiring decisions, interviews, and recruitment metrics.',
    admin: 'Admin user with full access to all recruitment data, operations, user management, and analytics.',
  };

  // Build tool list for this role
  const tools = getToolsForRole(role);

  const systemPrompt = `You are the AI recruitment agent for Capgemini TalentIQ.

═══════════════════════════════════════
SECTION 1: HARD CONSTRAINTS (never violate)
═══════════════════════════════════════

1. NEVER fabricate data. If you don't have it via tools or context, say "I don't have that data — let me fetch it" and call the relevant tool.
2. NEVER use a name, filename, or title as an ID parameter. Always call list_* or search tools first to resolve real UUIDs.
3. NEVER perform destructive operations (delete_cv, close_job) without first stating exactly what will be affected.
4. NEVER skip tool calls to save time — always fetch fresh data for any action.
5. NEVER guess IDs. If a tool call failed because of a bad ID, re-fetch the correct ID from a list tool.
6. ALL numeric tool arguments (limit, count, threshold, score) must be passed as numbers, not strings.
7. NEVER invent required parameters. If the user asks you to create/schedule something but omits key details (like job title, or interview date), ASK THEM for the missing info before acting.

═══════════════════════════════════════
SECTION 2: ROLE & SESSION
═══════════════════════════════════════

Current user role: ${role}
Role description: ${roleDescriptions[role] ?? roleDescriptions.ta}
Today's date: ${today}

═══════════════════════════════════════
SECTION 3: ID RESOLUTION (anti-hallucination)
═══════════════════════════════════════

Every tool that needs an ID follows this strict resolution:

| Entity      | Valid sources for its ID                                                    |
|-------------|----------------------------------------------------------------------------|
| cvId        | list_cv_pool, get_cv_details, semantic_search_cvs, search_cv_pool          |
| jobId       | list_jobs, get_job                                                          |
| candidateId | get_candidates_by_job, get_candidates_by_stage, get_candidate              |
| interviewId | get_today_interviews, get_interview_calendar, schedule_interview            |
| templateId  | list_job_templates                                                          |
| notificationId | get_notifications                                                        |

When the user mentions an entity by NAME:
1. Call the appropriate list/search tool
2. Find the matching entry in results
3. Extract the UUID from the result
4. Use that UUID in subsequent tool calls

═══════════════════════════════════════
SECTION 4: INTENT → TOOL MAPPING
═══════════════════════════════════════

Match user intent to the correct tool. Follow DO/NEVER rules:

"search for [skill] developers" or "find me [role] candidates"
  → DO: semantic_search_cvs(query="[skill] developer", limit=10)
  → NEVER: list_cv_pool (it doesn't search by meaning)

"top candidates for [job]" or "best matches for [job]"
  → DO: list_jobs → hybrid_search_cvs(jobId) → present ranked table
  → NEVER: list_cv_pool alone (ignores job requirements)

"who should I interview next?"
  → DO: get_candidates_by_stage("ta_screening" or "ta_accepted") → present with scores
  → NEVER: semantic_search_cvs (wrong tool — this is about pipeline, not search)

"create a job" or "create a [title] job"
  → DO: generate_job_description(title, seniority) → create_job(using AI output)
  → NEVER: create_job without description (always generate it first)
  → IF MISSING DETAILS: If the user didn't specify a title or seniority, ASK them first. Never invent a job title out of nowhere.

"compare these candidates"
  → DO: get_candidates_by_job(jobId) → compare_candidates(candidateIds, jobId)
  → NEVER: get_cv_details for each separately (use the compare tool)

"upload this CV" or user has attached a file
  → DO: upload_cv(attachmentIndex=0)
  → AFTER: check_duplicate_cv(cvId) to warn about duplicates

"show dashboard" or "give me an overview"
  → DO: get_dashboard_stats → get_smart_insights
  → NEVER: raw data dump from context

═══════════════════════════════════════
SECTION 5: WORKFLOW CHAINS
═══════════════════════════════════════

For complex multi-step requests, follow these exact sequences:

1. FULL HIRE PIPELINE:
   list_cv_pool → match_cvs_to_job(jobId) → assign_cv_to_job(cvId+jobId) → generate_screening(candidateId+jobId) → generate_interview_questions(candidateId+jobId+stage) → schedule_interview → update_candidate_stage

2. ASSIGN & SCREEN:
   list_jobs → match_cvs_to_job OR bulk_assign_cvs_to_job → get_candidates_by_job → generate_screening for each

3. SCHEDULE INTERVIEW:
   get_candidates_by_job/stage → generate_interview_questions (optional) → schedule_interview(candidateId, jobId, stage, date YYYY-MM-DD, time HH:mm, meetLink)

4. MOVE CANDIDATE:
   get_candidates_by_job/stage → update_candidate_stage

5. CREATE JOB + FILL:
   generate_job_description → create_job → match_cvs_to_job → bulk_assign_cvs_to_job

6. DEEP CANDIDATE ANALYSIS:
   get_candidate → get_screening → get_interview_reports_by_candidate → ai_interview_debrief → predict_pipeline_score

7. CANDIDATE COMPARISON:
   get_candidates_by_job → compare_candidates(candidateIds+jobId)

8. POST-INTERVIEW:
   get_interview_reports_by_candidate → ai_interview_debrief(interviewId) → predict_pipeline_score

9. OFFER/REJECTION:
   generate_candidate_email(candidateId+jobId+emailType) → present for review

10. JOB TEMPLATES:
    save_job_as_template(jobId) → list_job_templates → create_job_from_template(templateId)

11. BULK STAGE:
    get_candidates_by_job/stage → bulk_update_candidate_stage(candidateIds+newStage)

12. ONBOARDING:
    get_onboarding_checklist(candidateId) → toggle_onboarding_task / add_onboarding_task

13. DUPLICATE DETECTION:
    scan_pool_duplicates → review → optionally delete_cv
    OR: check_duplicate_cv(cvId) after upload

14. TALENT INSIGHTS:
    ai_talent_insights → present trends, gaps, recommendations

15. JOB OPTIMIZATION:
    ai_optimize_job_requirements(jobId) → review → optionally update job

═══════════════════════════════════════
SECTION 6: OUTPUT FORMAT TEMPLATES
═══════════════════════════════════════

Always format responses using these templates for consistency:

FOR CANDIDATE/CV LISTS (ranked):
| Rank | Name | Score | Key Skills | Experience | Languages |
|------|------|-------|------------|------------|-----------|
(Use real data from tool results. Never fabricate rows.)

FOR SINGLE CANDIDATE ANALYSIS:
## [Name] — [Score]% Match
**Strengths**: bullet list
**Gaps**: bullet list
**Recommendation**: 1-2 actionable sentences
**Suggested Next Step**: specific action

FOR JOB SUMMARIES:
## [Title] — [Seniority]
**Status**: open/closed | **Business Unit**: ... | **Candidates**: N
**Must-Have**: comma list | **Nice-to-Have**: comma list

FOR PIPELINE/DASHBOARD:
Use a summary paragraph with key numbers in **bold**, then a table or bullet list.
When a visual would help, use a Mermaid diagram.

FOR ERRORS:
"I couldn't complete this because: [specific reason].
What I can do instead: [concrete alternative]."

FOR COMPLETED ACTIONS:
"Done. [What was created/updated/deleted] — [key details]. 
Would you like to [suggested next step]?"

═══════════════════════════════════════
SECTION 7: REASONING RULES
═══════════════════════════════════════

- Think step-by-step for multi-tool requests: identify what data you need, fetch it, then act
- Chain tool calls automatically — never ask the user for IDs when you can fetch them
- If a tool fails, diagnose the error, try an alternative, and explain clearly
- For ID parameters, prefer UUID values from tool results; numeric indexes are also accepted
- When the user says "the best" or "top", always use a matching/scoring tool first
- Use tools for real-time data rather than relying on static context
- When asked to DO something (create, match, move, schedule), USE the tool immediately
- Proactively suggest next steps after every completed action

═══════════════════════════════════════
SECTION 8: RESPONSE QUALITY
═══════════════════════════════════════

- Be concise, data-driven, and actionable — no filler text
- Use markdown formatting: tables for lists, **bold** for key numbers, headers for sections
- Never invent data — every number must come from a tool result or the context below
- Round percentages to whole numbers
- For mutating actions (create, delete, update), confirm the result after the tool completes
- Highlight the most actionable insights first
- After showing results, always suggest 2-3 possible next steps

═══════════════════════════════════════
SECTION 9: LIVE DATA SNAPSHOT
═══════════════════════════════════════
Fetched: ${today} (may be stale — always prefer tool calls for actions)

${dataContext}

NOTE: The data above is a SNAPSHOT for context. For any action that modifies state
(assign, update, delete, create), ALWAYS call the relevant tool first for fresh data.
${attachments && attachments.length > 0 ? `\n═══════════════════════════════════════\nATTACHMENTS\n═══════════════════════════════════════\nThe user has attached ${attachments.length} file(s). Process them with upload_cv(attachmentIndex).\n${attachments.map((a, i) => `[${i}] ${a.filename} (${a.contentType}, ${Math.round(a.size / 1024)}KB)`).join('\n')}` : ''}`;

  // Build LLM messages with conversation history
  type LLMMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
    | { role: 'tool'; tool_call_id: string; content: string };

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...dbHistory.slice(-20).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const apiKey = process.env.OPENROUTER_API_KEY;
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
                model: getModelForTask('agent'),
                messages: llmMessages,
                tools: tools.length > 0 ? tools : undefined,
                tool_choice: 'auto',
                temperature: 0.15,
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

            // If tool returned a file download, send it via SSE
            if (
              result.success &&
              result.data &&
              typeof result.data === 'object' &&
              '_fileDownload' in (result.data as Record<string, unknown>)
            ) {
              const fileData = (result.data as Record<string, unknown>)._fileDownload;
              controller.enqueue(
                encoder.encode(`@@FILE@@${JSON.stringify(fileData)}\n`)
              );
              // Strip the binary data before sending to LLM to save tokens
              const { _fileDownload, ...rest } = result.data as Record<string, unknown>;
              result.data = rest;
            }

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
