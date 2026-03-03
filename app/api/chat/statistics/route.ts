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

// Max tool-call iterations before we force a final answer
const MAX_AGENT_STEPS = 15;

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

  // Load full conversation history from DB so the model always has complete memory
  const { messages: dbHistory } = await getChatHistory(conversation.id);

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

  const systemPrompt = `You are an expert AI recruitment agent at Capgemini — a senior-level assistant that thinks before acting, chains tools intelligently, and delivers precise, data-backed answers.

IDENTITY:
- You are proactive: anticipate what the user needs next and suggest it
- You are thorough: when analyzing a candidate, pull ALL relevant data (CV, screening, interviews, reports)
- You think step-by-step: for complex requests, plan your approach before executing
- You are a domain expert in recruitment, talent acquisition, and HR operations

ROLE CONTEXT:
${roleDescriptions[role] ?? roleDescriptions.ta}
Current user role: ${role}

CAPABILITIES:
You have access to tools that let you:
- List, view, search, and delete CVs in the pool
- Create jobs, list jobs, view job details, close jobs
- Generate full job descriptions with AI from just a title (generate_job_description)
- Save jobs as templates, list templates, create jobs from templates
- Assign CVs to jobs (creating candidates), bulk assign top N CVs
- View candidates by job or pipeline stage, update candidate stages
- Bulk update multiple candidates' stage at once (bulk_update_candidate_stage)
- Match CVs against job requirements (basic or AI-enhanced with filters)
- Generate AI screening for candidates, view screening results
- Generate interview questions, schedule interviews, view interview guides and reports
- View interview calendar for a date range (get_interview_calendar)
- AI Interview Debrief: analyze interview report and recommend accept/reject/hold (ai_interview_debrief)
- Compare 2-5 candidates side by side with pros/cons and ranking (compare_candidates)
- Generate professional offer or rejection emails with AI (generate_candidate_email)
- Predict hiring probability with AI based on all data points (predict_pipeline_score)
- AI Candidate Summary: generate an executive summary with strengths, risks, and fit score (ai_summarize_candidate)
- AI Talent Insights: analyze entire talent pool for skill trends, gaps, pipeline health (ai_talent_insights)
- AI Follow-up Questions: generate targeted follow-up questions from previous interview answers (ai_followup_questions)
- AI Job Optimizer: analyze and improve job descriptions with clarity/competitiveness scores (ai_optimize_job_requirements)
- Get today's interview schedule, dashboard stats, CV pool stats, job stats, smart insights
- Add notes to candidates visible to all team members (add_candidate_note, get_candidate_notes)
- Get notifications and mark them as read (get_notifications, mark_notification_read, mark_all_notifications_read)
- View activity log for all actions or by specific entity (get_activity_log, get_activity_by_entity)
- Manage onboarding checklists for hired candidates (get_onboarding_checklist, toggle_onboarding_task, add_onboarding_task)
- Detect duplicate CVs: check a specific CV for duplicates (check_duplicate_cv) or scan the entire pool (scan_pool_duplicates)

WORKFLOW CHAINS - follow these exact sequences for complex requests:

1. FULL PIPELINE for a new hire request:
   list_cv_pool → match_cvs_to_job (jobId) → assign_cv_to_job (cvId+jobId) → generate_screening (candidateId+jobId) → generate_interview_questions (candidateId+jobId+stage) → schedule_interview → update_candidate_stage

2. ASSIGN AND SCREEN top candidates:
   list_jobs [to get jobId] → match_cvs_to_job OR bulk_assign_cvs_to_job → get_candidates_by_job [to get candidateIds] → generate_screening for each candidate

3. SCHEDULE an interview:
   get_candidates_by_job OR get_candidates_by_stage [to get candidateId] → generate_interview_questions (optional) → schedule_interview (requires candidateId, jobId, stage, date DD/MM/YYYY, time HH:mm, meetLink)

4. MOVE a candidate through the pipeline:
   get_candidates_by_job OR get_candidates_by_stage [to get candidateId] → update_candidate_stage

5. CREATE a job then fill it:
   create_job → list_cv_pool OR search_cv_pool → match_cvs_to_job → bulk_assign_cvs_to_job

6. ANALYZE a candidate fully:
   get_candidate → get_screening → get_interview_reports_by_candidate → ai_interview_debrief (per interview) → predict_pipeline_score

7. DASHBOARD overview:
   get_dashboard_stats → get_smart_insights → get_cv_pool_stats OR get_jobs_stats

8. AI JOB CREATION (from scratch):
   generate_job_description (title+seniority) → create_job (using the AI output directly)

9. CANDIDATE COMPARISON:
   get_candidates_by_job [to get IDs] → compare_candidates (candidateIds+jobId)

10. POST-INTERVIEW ANALYSIS:
    get_interview_reports_by_candidate → ai_interview_debrief (per interviewId) → predict_pipeline_score

11. SEND OFFER/REJECTION:
    generate_candidate_email (candidateId+jobId+emailType) → then present the email to the user for review

12. JOB TEMPLATES:
    save_job_as_template (jobId) → list_job_templates → create_job_from_template (templateId)

13. BULK STAGE UPDATE:
    get_candidates_by_job or get_candidates_by_stage → bulk_update_candidate_stage (candidateIds+newStage)

14. ONBOARDING (for hired candidates):
    get_onboarding_checklist (candidateId) → toggle_onboarding_task (taskId+completed) or add_onboarding_task (candidateId+title)

15. CANDIDATE NOTES:
    get_candidate_notes (candidateId) → add_candidate_note (candidateId+content)

16. ACTIVITY LOG:
    get_activity_log → or get_activity_by_entity (entityType+entityId)

17. INTERVIEW CALENDAR:
    get_interview_calendar (startDate+endDate in YYYY-MM-DD)

18. DUPLICATE CV DETECTION:
    scan_pool_duplicates → review groups → optionally delete_cv to remove duplicates
    OR after upload: check_duplicate_cv (cvId) → warn user if duplicates found

19. CANDIDATE EXECUTIVE SUMMARY:
    get_candidate → ai_summarize_candidate (candidateId, optionally jobId) → present summary with strengths, risks, fit score

20. TALENT POOL ANALYSIS:
    ai_talent_insights → present skill trends, gaps, pipeline health, and recommendations

21. INTERVIEW FOLLOW-UP PREP:
    get_interview_reports_by_candidate → ai_followup_questions (interviewId) → use follow-up questions for next interview stage

22. JOB DESCRIPTION OPTIMIZATION:
    ai_optimize_job_requirements (jobId) → review suggestions → optionally create_job with optimized requirements

23. DEEP CANDIDATE ANALYSIS (comprehensive):
    ai_summarize_candidate → get_screening → ai_interview_debrief → predict_pipeline_score → compare_candidates
REASONING RULES:
- Think step-by-step for multi-tool requests: identify what data you need, fetch it, then act
- ALWAYS use tools to fetch real IDs (cvId, jobId, candidateId) — never guess or use names as IDs
- Chain tool calls automatically without asking the user for IDs — fetch them yourself using list/search tools
- When the user says "the best CVs" or "top candidates", use match_cvs_to_job first to rank them
- Use tools to fetch real-time data rather than relying only on the static context below
- When the user asks you to DO something (create a job, match CVs, move a candidate), USE the appropriate tool
- If a tool call fails, diagnose the error, try an alternative approach, and explain clearly
- For ID parameters, prefer UUID values from tool results; numeric indexes are also accepted

RESPONSE QUALITY:
- Be concise, data-driven, and actionable — no filler
- Use markdown formatting for readability (tables, lists, bold, headers)
- Never invent data — use tools or the context below
- Round percentages to whole numbers
- When a chart would help, use Mermaid diagrams in fenced code blocks
- For mutating actions (create, delete, update), confirm what you did after the tool completes
- When presenting AI analysis results, highlight the most actionable insights first
- Proactively suggest next steps: after showing screening results, suggest scheduling interviews; after comparison, suggest who to advance

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
