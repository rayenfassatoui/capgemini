import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { statisticsChatRequestSchema } from "@/features/recruitment/schemas";
import {
  getOrCreateChatConversation,
  saveChatMessage,
  getChatHistory,
  listChatConversations,
  createChatConversation,
  deleteChatConversation,
  classifyChatIntent,
  buildGreetingResponse,
  compareCandidatesDirect,
  searchResumesByName,
  buildDeterministicToolFallback,
} from "@/features/recruitment/services";
import {
  getToolsForRole,
  executeAgentTool,
  getToolDefinition,
} from "@/features/recruitment/services/agent-tools";
import {
  compactToolResult,
  makeToolCallCacheKey,
} from "@/features/recruitment/services/agent-tools/utils";
import {
  getModelForTask,
  getNvidiaClient,
} from "@/features/recruitment/services/ai";
import {
  groundAssistantResponse,
  isCandidateSearchOrRankingIntent,
  maskUserIdForTelemetry,
} from "@/features/recruitment/services/candidate-grounding";
import type { UserRole } from "@/features/recruitment/types";
import { SlidingWindowRateLimiter } from "@/lib/rate-limit";

const MAX_AGENT_STEPS = 8;
const MAX_OUTPUT_TOKENS = 2048;
const LLM_REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
const STREAM_CHUNK_SIZE = 12;

const chatLimiter = new SlidingWindowRateLimiter(15, 60_000);

type AttachmentPayload = {
  filename: string;
  contentType: string;
  size: number;
  rawBytes: string;
};

type LLMMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolExecutionRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: { success: boolean; data?: unknown; error?: string };
  mutating: boolean;
}

type ToolTraceJson =
  | null
  | boolean
  | number
  | string
  | ToolTraceJson[]
  | { [key: string]: ToolTraceJson };

const SENSITIVE_TRACE_KEY_RE =
  /password|token|apiKey|apikey|api_key|secret|authorization|rawBytes|base64|binaryData|_attachment/i;

const SIMPLE_EXCHANGE_RE =
  /^(?:hi|hello|hey|thanks|thank you|thx|ok|okay|cool|great|nice|salam|aslema|bonjour|bonsoir)[!.?,\s]*$/i;
const AGENTIC_HEADING_RE =
  /(^|\n)##\s*(fhemtek|goal|plan|execution|result|next\s*steps?)/i;
const RECRUITMENT_SIGNAL_RE =
  /\b(recruit(?:ment|ing)?|talent|candidate|candidates|cv|cvs|resume|resumes|job|jobs|pipeline|screening|interview|interviews|hire|hiring|onboarding|offer|skills?|seniority|position|vacancy|profile|profiles)\b/i;
const CREATIVE_OFFTOPIC_RE =
  /\b(poem|poetry|joke|story|song|rap|haiku|riddle|quote|lyrics?)\b/i;

interface AgenticResponseParams {
  text: string;
  userMessage: string;
  role: UserRole;
  records: ToolExecutionRecord[];
}

function isRecruitmentWorkRequest(message: string): boolean {
  return RECRUITMENT_SIGNAL_RE.test(message);
}

function isCreativeOffTopicRequest(message: string): boolean {
  return CREATIVE_OFFTOPIC_RE.test(message);
}

function buildOutOfScopeResponse(role: UserRole): string {
  const roleHint =
    role === "ta"
      ? "search CVs, compare candidates, and generate screening support"
      : role === "manager"
        ? "review top matches, interview decisions, and pipeline summaries"
        : role === "hr"
          ? "handle HR-stage candidate decisions and onboarding workflows"
          : "oversee cross-team recruitment analytics and operations";

  return `I am focused on recruitment work in this workspace, so I cannot handle general creative writing requests here.\n\nI can help you ${roleHint}.`;
}

async function getAuthSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) return null;
  const role = session.user.role ?? "ta";
  if (!["ta", "admin", "manager", "hr"].includes(role)) return null;
  return session;
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (conversationId) {
    try {
      const history = await getChatHistory(conversationId, session.user.id);
      return Response.json(history);
    } catch {
      return new Response("Not found or unauthorized", { status: 404 });
    }
  }

  const conversations = await listChatConversations(session.user.id);
  return Response.json({ conversations });
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return new Response("conversationId is required", { status: 400 });
  }

  await deleteChatConversation(conversationId, session.user.id);
  return Response.json({ success: true });
}

export async function PUT() {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const conversation = await createChatConversation(session.user.id);
  return Response.json(conversation);
}

function createTimeoutError(): Error {
  return new Error("TIMEOUT");
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "TIMEOUT" ||
      error.message === "LLM_TIMEOUT" ||
      error.message === "TOOL_TIMEOUT")
  );
}

async function streamText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string,
) {
  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    controller.enqueue(encoder.encode(text.slice(i, i + STREAM_CHUNK_SIZE)));
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

async function streamImmediateText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string,
) {
  controller.enqueue(encoder.encode(text));
}

function getToolSummary(result: {
  success: boolean;
  data?: unknown;
  error?: string;
}): string {
  if (!result.success) {
    return result.error ?? "Failed";
  }

  if (Array.isArray(result.data)) {
    return `Returned ${result.data.length} result(s)`;
  }

  if (result.data && typeof result.data === "object") {
    return "Completed successfully";
  }

  return "Done";
}

function sanitizeToolTraceValue(value: unknown): ToolTraceJson {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolTraceValue(item));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, ToolTraceJson> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      sanitized[key] = SENSITIVE_TRACE_KEY_RE.test(key)
        ? "[REDACTED]"
        : sanitizeToolTraceValue(nestedValue);
    }

    return sanitized;
  }

  return String(value);
}

function inferToolPurpose(
  toolName: string,
  args: Record<string, unknown>,
): string {
  if (toolName.includes("search")) {
    const query = typeof args.query === "string" ? args.query : undefined;
    return query
      ? `Search recruitment data for "${query}"`
      : "Search recruitment data";
  }

  if (toolName.startsWith("list_")) return "List available recruitment records";
  if (toolName.startsWith("get_")) return "Fetch detailed recruitment data";
  if (toolName.includes("compare")) return "Compare candidate fit and ranking";
  if (toolName.includes("match")) return "Score candidate/job fit";
  if (toolName.includes("upload")) return "Process an uploaded CV file";
  if (toolName.includes("generate"))
    return "Generate AI-assisted recruitment output";
  if (toolName.includes("update")) return "Update recruitment workflow state";
  if (toolName.includes("delete")) return "Delete recruitment data";

  return `Run ${toolName.replace(/_/g, " ")}`;
}

function buildDeterministicFallbackFromRecords(
  records: ToolExecutionRecord[],
): string | null {
  const successful = records.filter((record) => record.result.success);
  if (successful.length === 0) {
    return null;
  }

  const prioritizedToolNames = [
    "compare_candidates",
    "hybrid_search_cvs",
    "rag_search_cvs",
    "semantic_search_cvs",
    "match_cvs_to_job",
    "match_cvs_to_job_with_filters",
    "get_dashboard_stats",
    "get_smart_insights",
    "get_cv_pool_stats",
    "get_jobs_stats",
  ];

  const prioritized =
    prioritizedToolNames
      .map((name) =>
        [...successful].reverse().find((record) => record.toolName === name),
      )
      .find(Boolean) ?? [...successful].reverse()[0];

  if (!prioritized || !prioritized.result.data) {
    return null;
  }

  const fallback = buildDeterministicToolFallback(
    prioritized.toolName,
    prioritized.result.data,
  );

  if (fallback) {
    return fallback;
  }

  return `I’m returning a deterministic fallback summary from the data that was already fetched successfully. Latest successful tool: **${prioritized.toolName}**.`;
}

function logGroundingGuardBlock({
  requestId,
  userId,
  rejectedNames,
  toolNames,
}: {
  requestId: string;
  userId: string;
  rejectedNames: string[];
  toolNames: string[];
}) {
  console.warn("[candidate-grounding] blocked ungrounded assistant output", {
    requestId,
    userId: maskUserIdForTelemetry(userId),
    rejectedNames,
    toolNames,
  });
}

function formatGoalText(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "You asked for recruitment assistance.";
  }

  const clipped =
    compact.length > 180 ? `${compact.slice(0, 177).trimEnd()}...` : compact;
  const sentence = `${clipped.charAt(0).toUpperCase()}${clipped.slice(1)}`;

  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function buildExecutionSteps(records: ToolExecutionRecord[]): string[] {
  if (records.length === 0) {
    return ["1. No tool call was required for this response."];
  }

  return records.slice(-5).map((record, index) => {
    const status = record.result.success ? "success" : "error";
    const summary = getToolSummary(record.result);
    return `${index + 1}. ${record.toolName} (${status}) - ${summary}`;
  });
}

function buildNextStepOptions(
  records: ToolExecutionRecord[],
  role: UserRole,
): string[] {
  const options: string[] = [];
  const toolNames = records.map((record) => record.toolName);

  if (
    toolNames.some(
      (name) =>
        name.includes("search") ||
        name.includes("match") ||
        name.includes("compare"),
    )
  ) {
    options.push("Compare the top 3 shortlisted candidates with trade-offs.");
  }

  if (
    toolNames.some(
      (name) => name.includes("dashboard") || name.includes("insights"),
    )
  ) {
    options.push("Drill down on pipeline bottlenecks by stage and owner.");
  }

  if (
    toolNames.some(
      (name) =>
        name.startsWith("create_") ||
        name.startsWith("update_") ||
        name.startsWith("schedule_"),
    )
  ) {
    options.push("Run the next workflow action and confirm the impact.");
  }

  const roleOption =
    role === "ta"
      ? "Generate screening questions for the best-fit candidate."
      : role === "manager"
        ? "Request a ranked hiring recommendation for your open role."
        : role === "hr"
          ? "Prepare offer or rejection messaging for the selected candidate."
          : "Review cross-team recruitment KPI anomalies for this week.";

  const fallbackOptions = [
    roleOption,
    "Run a tighter search with explicit skills, seniority, and location.",
    "Ask for a concise action plan for the next 48 hours.",
  ];

  for (const option of fallbackOptions) {
    if (!options.includes(option)) {
      options.push(option);
    }
    if (options.length === 3) {
      break;
    }
  }

  return options.slice(0, 3);
}

function ensureAgenticResponseStructure({
  text,
  userMessage,
  role,
  records,
}: AgenticResponseParams): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  const shouldApplyAgenticWorkflow =
    records.length > 0 || isRecruitmentWorkRequest(userMessage);

  if (!shouldApplyAgenticWorkflow) {
    return trimmed;
  }

  const isSimpleExchange =
    records.length === 0 &&
    trimmed.length < 220 &&
    SIMPLE_EXCHANGE_RE.test(userMessage.trim());

  if (isSimpleExchange) {
    return trimmed;
  }

  const nextOptions = buildNextStepOptions(records, role);
  const nextStepsHeadingRe = /(^|\n)##\s*next\s*steps?/i;

  if (AGENTIC_HEADING_RE.test(trimmed)) {
    if (nextStepsHeadingRe.test(trimmed)) {
      return trimmed;
    }

    return [
      trimmed,
      "",
      "## Next Steps",
      ...nextOptions.map((option, index) => `${index + 1}. ${option}`),
    ].join("\n");
  }

  const planSteps =
    records.length > 0
      ? [
          "Interpret your request and identify the required data/actions.",
          `Execute relevant tool calls (${records.length} total) within role permissions.`,
          "Synthesize evidence into a practical recommendation.",
        ]
      : [
          "Interpret your request and clarify the expected outcome.",
          "Use available context and role constraints to build the best answer.",
          "Return a concise result with clear follow-up options.",
        ];

  return [
    "## Fhemtek",
    formatGoalText(userMessage),
    "",
    "## Plan",
    ...planSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Execution",
    ...buildExecutionSteps(records),
    "",
    "## Result",
    trimmed,
    "",
    "## Next Steps",
    ...nextOptions.map((option, index) => `${index + 1}. ${option}`),
  ].join("\n");
}

type AgentCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ResponseToolCall[];
    };
  }>;
};

type ResponseToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

async function callAgentCompletion(
  nvidiaClient: ReturnType<typeof getNvidiaClient>,
  messages: LLMMessage[],
  tools: ReturnType<typeof getToolsForRole>,
): Promise<AgentCompletionResponse> {
  const completionPromise = nvidiaClient.chat.completions.create({
    model: getModelForTask("agent"),
    messages: messages as Parameters<
      typeof nvidiaClient.chat.completions.create
    >[0]["messages"],
    stream: false,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: "auto",
    temperature: 0.15,
    max_tokens: MAX_OUTPUT_TOKENS,
  }) as Promise<AgentCompletionResponse>;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(createTimeoutError()), LLM_REQUEST_TIMEOUT_MS),
  );

  return Promise.race([completionPromise, timeoutPromise]);
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

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

        controller.enqueue(
          encoder.encode(
            `@@META@@${JSON.stringify({
              groundingGuard: {
                blocked: grounded.blocked,
                deterministic: grounded.deterministic,
                candidateCount: grounded.candidateCount,
                rejectedCount: grounded.rejectedNames.length,
                sourceToolCount: grounded.sourceTools.length,
              },
            })}\n`,
          ),
        );

        return grounded.text;
      };

      try {
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

        const today = new Date().toISOString().split("T")[0];
        const roleDescriptions: Record<string, string> = {
          ta: "Talent Acquisition specialist with full access to CV pool, jobs, candidates, screening, interviews, and matching.",
          manager:
            "Hiring Manager who can see candidates at manager-stage and beyond, interviews they conduct, and jobs.",
          hr: "HR representative who can see candidates at HR-stage and beyond, hiring decisions, interviews, and recruitment metrics.",
          admin:
            "Admin user with full access to all recruitment data, operations, user management, and analytics.",
        };

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
8. Prefer lightweight intent handling. For greetings or small talk, reply directly without tools.
9. For candidate comparisons, prefer the dedicated compare flow and avoid unnecessary extra tool hops.
10. If an exact name is unavailable but close matches exist, acknowledge the fuzzy match and use the closest valid result.
11. NEVER mention a candidate/person name unless that exact person appears in the current response cycle's tool outputs. Prior chat text is not a valid source for candidate names.
12. For rankings, transferable-skills lists, top candidates, best-fit, and shortlist requests, table rows must come from structured tool results only. Do not synthesize candidate rows.
13. If candidate tools return zero candidates, say no accessible candidates matched and suggest a safe next query. Do not infer or echo ungrounded names.

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
| cvId        | list_cv_pool, get_cv_details, rag_search_cvs, semantic_search_cvs, search_cv_pool |
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
  → DO: rag_search_cvs(query="[skill] developer", limit=15)
  → FALLBACK: semantic_search_cvs if rag_search_cvs fails
  → NEVER: list_cv_pool (it doesn't search by meaning)

"find candidates with [specific experience]" or "search CVs for [complex query]"
  → DO: rag_search_cvs(query="[full description]") — best for complex multi-criteria searches
  → FALLBACK: semantic_search_cvs for simpler queries
  → NEVER: list_cv_pool alone

"top candidates for [job]" or "best matches for [job]"
  → DO: list_jobs → hybrid_search_cvs(jobId) → present ranked table
  → NEVER: list_cv_pool alone (ignores job requirements)

"who should I interview next?"
  → DO: get_candidates_by_stage("ta_screening" or "ta_accepted") → present with scores
  → NEVER: rag_search_cvs (wrong tool — this is about pipeline, not search)

"create a job" or "create a [title] job"
  → DO: generate_job_description(title, seniority) → create_job(using AI output)
  → NEVER: create_job without description (always generate it first)
  → IF MISSING DETAILS: If the user didn't specify a title or seniority, ASK THEM for the missing info before acting. Never invent a job title out of nowhere.

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
(Use real data from current tool results only. Never fabricate rows or reuse candidate names from chat history.)

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
- Never invent data — every number must come from a tool result
- Round percentages to whole numbers
- For mutating actions (create, delete, update), confirm the result after the tool completes
- Highlight the most actionable insights first
- After showing results, always suggest 2-3 possible next steps

═══════════════════════════════════════
SECTION 10: AGENTIC RESPONSE WORKFLOW
═══════════════════════════════════════

For non-trivial tasks and any response that required tools, use this exact structure:

## Fhemtek
One short sentence that rephrases the user goal.

## Plan
Numbered list (3 steps max) describing what you did.

## Execution
Numbered list summarizing key tool actions and outcomes.

## Result
Final answer with data-driven insights.

## Next Steps
Exactly 3 numbered options the user can pick from.

For simple small talk, reply normally without forcing this format.

═══════════════════════════════════════
SECTION 9: DATA ACCESS (ON-DEMAND ONLY)
═══════════════════════════════════════

All business data is fetched through tools at runtime. You have NO pre-loaded data.
For any query about CVs, jobs, candidates, or statistics, you MUST call the appropriate tool first.

Quick reference:
- CVs/Search: rag_search_cvs (preferred for search), semantic_search_cvs (fallback), list_cv_pool, search_cv_pool, get_cv_details
- Jobs: list_jobs, get_job
- Candidates: get_candidates_by_job, get_candidates_by_stage, get_candidate
- Matching: match_cvs_to_job, hybrid_search_cvs
- Dashboard: get_dashboard_stats, get_smart_insights
${
  attachments && attachments.length > 0
    ? `\n═══════════════════════════════════════\nATTACHMENTS\n═══════════════════════════════════════\nThe user has attached ${attachments.length} file(s). Process them with upload_cv(attachmentIndex).\n${attachments
        .map(
          (a, i) =>
            `[${i}] ${a.filename} (${a.contentType}, ${Math.round(a.size / 1024)}KB)`,
        )
        .join("\n")}`
    : ""
}`;

        const shouldMinimizeHistory =
          isCandidateSearchOrRankingIntent(lastMessageText);
        const contextualHistory = shouldMinimizeHistory
          ? dbHistory.slice(-8).filter((message) => message.role === "user")
          : dbHistory.slice(-20);

        const llmMessages: LLMMessage[] = [
          { role: "system", content: systemPrompt },
          ...contextualHistory.map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
        ];

        const toolExecutionCache = new Map<string, ToolExecutionRecord>();
        let consecutiveToolFailures = 0;
        let sawMutatingTool = false;
        let llmRetryUsed = false;

        let step = 0;
        while (step < MAX_AGENT_STEPS) {
          step++;

          let llmResponse: AgentCompletionResponse | null = null;
          try {
            llmResponse = await callAgentCompletion(
              nvidiaClient,
              llmMessages,
              tools,
            );
          } catch (error) {
            if (isTimeoutError(error) && !sawMutatingTool && !llmRetryUsed) {
              llmRetryUsed = true;
              try {
                llmResponse = await callAgentCompletion(
                  nvidiaClient,
                  llmMessages,
                  tools,
                );
              } catch {
                const fallback =
                  buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
                  "The AI service took too long to respond. Please try a simpler query.";
                fullResponse = prepareGroundedResponse(fallback);
                await streamImmediateText(controller, encoder, fullResponse);
                break;
              }
            } else {
              const fallback =
                buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
                (isTimeoutError(error)
                  ? "The AI service took too long to respond. Please try a simpler query."
                  : "Failed to connect to AI service. Please try again.");
              fullResponse = prepareGroundedResponse(fallback);
              await streamImmediateText(controller, encoder, fullResponse);
              break;
            }
          }

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

          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            let queuedArgs: Record<string, unknown> = {};

            try {
              queuedArgs = JSON.parse(tc.function.arguments) as Record<
                string,
                unknown
              >;
            } catch {
              queuedArgs = {};
            }

            if (toolName === "upload_cv" && attachments) {
              const idx = parseInt(
                String(queuedArgs.attachmentIndex ?? "0"),
                10,
              );
              if (idx >= 0 && idx < attachments.length) {
                queuedArgs._attachment = attachments[idx] as AttachmentPayload;
              }
            }

            const queuedCacheKey = makeToolCallCacheKey(toolName, queuedArgs);
            if (toolExecutionCache.has(queuedCacheKey)) {
              continue;
            }

            const queuedInputPayload = sanitizeToolTraceValue(queuedArgs);
            controller.enqueue(
              encoder.encode(
                `@@TOOL_START@@${JSON.stringify({
                  id: tc.id,
                  tool: toolName,
                  status: "queued",
                  summary: "Queued",
                  args: queuedInputPayload,
                  input: queuedInputPayload,
                  startedAt: new Date().toISOString(),
                  purpose: inferToolPurpose(toolName, queuedArgs),
                  retry: {
                    attempt: 1,
                    maxAttempts: 1,
                    retried: false,
                  },
                })}\n`,
              ),
            );
          }

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

            if (toolName === "upload_cv" && attachments) {
              const idx = parseInt(String(toolArgs.attachmentIndex ?? "0"), 10);
              if (idx >= 0 && idx < attachments.length) {
                toolArgs._attachment = attachments[idx] as AttachmentPayload;
              }
            }

            const cacheKey = makeToolCallCacheKey(toolName, toolArgs);
            const cached = toolExecutionCache.get(cacheKey);

            if (cached) {
              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: cached.result.success
                  ? JSON.stringify(compactToolResult(cached.result.data))
                  : JSON.stringify({ error: cached.result.error }),
              });

              if (cached.mutating) {
                sawMutatingTool = true;
              }

              if (!cached.result.success) {
                consecutiveToolFailures++;
              } else {
                consecutiveToolFailures = 0;
              }

              continue;
            }

            const traceId = tc.id;
            const startedAt = new Date().toISOString();
            const inputPayload = sanitizeToolTraceValue(toolArgs);
            const purpose = inferToolPurpose(toolName, toolArgs);

            controller.enqueue(
              encoder.encode(
                `@@TOOL_START@@${JSON.stringify({
                  id: traceId,
                  tool: toolName,
                  status: "running",
                  args: inputPayload,
                  input: inputPayload,
                  startedAt,
                  purpose,
                  retry: {
                    attempt: 1,
                    maxAttempts: 1,
                    retried: false,
                  },
                })}\n`,
              ),
            );

            const toolDef = getToolDefinition(toolName);
            const mutating = toolDef?.mutating ?? false;
            if (mutating) {
              sawMutatingTool = true;
            }

            const result = await executeAgentTool(toolName, toolArgs, {
              userId: session.user.id,
              role,
            });

            const record: ToolExecutionRecord = {
              toolName,
              args: toolArgs,
              result,
              mutating,
            };

            toolExecutionCache.set(cacheKey, record);
            toolExecutionHistory.push(record);

            if (
              result.success &&
              result.data &&
              typeof result.data === "object" &&
              "_fileDownload" in (result.data as Record<string, unknown>)
            ) {
              const fileData = (result.data as Record<string, unknown>)
                ._fileDownload;
              controller.enqueue(
                encoder.encode(`@@FILE@@${JSON.stringify(fileData)}\n`),
              );
              const { _fileDownload, ...rest } = result.data as Record<
                string,
                unknown
              >;
              void _fileDownload;
              result.data = rest;
            }

            const summary = getToolSummary(result);
            const endedAt = new Date().toISOString();
            const durationMs = Math.max(
              0,
              new Date(endedAt).getTime() - new Date(startedAt).getTime(),
            );

            controller.enqueue(
              encoder.encode(
                `@@TOOL_END@@${JSON.stringify({
                  id: traceId,
                  tool: toolName,
                  success: result.success,
                  status: result.success ? "success" : "error",
                  summary,
                  purpose,
                  startedAt,
                  endedAt,
                  durationMs,
                  input: inputPayload,
                  output: result.success
                    ? sanitizeToolTraceValue(result.data)
                    : null,
                  error: result.success ? undefined : result.error,
                  retry: {
                    attempt: 1,
                    maxAttempts: 1,
                    retried: false,
                  },
                })}\n`,
              ),
            );

            if (!result.success) {
              consecutiveToolFailures++;
              if (consecutiveToolFailures >= MAX_CONSECUTIVE_TOOL_FAILURES) {
                const fallback =
                  buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
                  `I encountered ${consecutiveToolFailures} consecutive tool failures. Please try rephrasing your request.`;
                fullResponse = prepareGroundedResponse(fallback);
                await streamImmediateText(
                  controller,
                  encoder,
                  `\n\n${fullResponse}`,
                );
                break;
              }
            } else {
              consecutiveToolFailures = 0;
            }

            const toolResultContent = result.success
              ? JSON.stringify(compactToolResult(result.data))
              : JSON.stringify({ error: result.error });

            llmMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: toolResultContent,
            });
          }

          if (consecutiveToolFailures >= MAX_CONSECUTIVE_TOOL_FAILURES) {
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
      } catch {
        if (!fullResponse) {
          const fallback =
            "An error occurred while processing your request. Please try again.";
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
