import type { UserRole } from "../types";
import { normalizeJobSkillLabels } from "../job-skills";
import type { ResponseToolCall, ToolExecutionRecord } from "./statistics-chat-types";

export type AgentRuntimeSkillId =
  | "evidence-discipline"
  | "recruitment-triage"
  | "proactive-operations"
  | "analytics-visualization"
  | "cv-search"
  | "job-matching"
  | "job-authoring"
  | "workflow-actions"
  | "interview-operations"
  | "communication"
  | "governance-admin"
  | "attachment-processing"
  | "onboarding";

export interface AgentRuntimeSkill {
  id: AgentRuntimeSkillId;
  title: string;
  description: string;
  triggers: readonly RegExp[];
  toolNames: readonly string[];
  instructions: readonly string[];
  requiresFreshTools: boolean;
  roles?: readonly UserRole[];
}

interface SelectAgentRuntimeSkillsParams {
  message: string;
  role: UserRole;
  hasAttachments: boolean;
}

interface MissingToolRetryParams {
  message: string;
  skills: readonly AgentRuntimeSkill[];
  availableToolNames: readonly string[];
  toolExecutionCount: number;
}

interface MissingToolRecoveryParams {
  skills: readonly AgentRuntimeSkill[];
  availableToolNames: readonly string[];
}

interface MissingCreateJobRecoveryParams {
  message: string;
  skills: readonly AgentRuntimeSkill[];
  availableToolNames: readonly string[];
  records: readonly ToolExecutionRecord[];
  step: number;
}

interface MissingCloseJobRecoveryParams {
  message: string;
  skills: readonly AgentRuntimeSkill[];
  availableToolNames: readonly string[];
  records: readonly ToolExecutionRecord[];
  step: number;
}
interface MissingCandidateStageRecoveryParams {
  message: string;
  availableToolNames: readonly string[];
  records: readonly ToolExecutionRecord[];
  step: number;
}


interface ExplicitMutationToolCallParams {
  message: string;
  availableToolNames: readonly string[];
}

const RECRUITMENT_TRIAGE_RE =
  /\b(recruit(?:ment|ing)?|talent|candidate|candidates|cv|cvs|resume|resumes|job|jobs|pipeline|screening|interview|interviews|hire|hiring|onboarding|offer|skills?|seniority|profile|profiles)\b/i;

const EVIDENCE_DISCIPLINE_SKILL: AgentRuntimeSkill = {
  id: "evidence-discipline",
  title: "Evidence-first reasoning",
  description:
    "Separate observed tool evidence from inference and refuse unsupported claims.",
  triggers: [/.*/],
  toolNames: [],
  instructions: [
    "State the decision first, then cite the concrete tool values that support it.",
    "Mark missing data as a caveat instead of filling gaps from prior chat text.",
    "If the answer would mention candidates, jobs, CVs, interviews, or statistics, use fresh tools first.",
  ],
  requiresFreshTools: false,
};

const DOMAIN_SKILLS: readonly AgentRuntimeSkill[] = [
  {
    id: "proactive-operations",
    title: "Proactive operations audit",
    description:
      "Start from live operational signals, identify the biggest blocker, and propose the next best actions before the user has to enumerate them.",
    triggers: [
      /\b(proactive|proactively|next\s+steps?|what\s+should\s+i\s+do|where\s+to\s+start|prioriti[sz]e|prioriti[sz]ation|priority|priorities|urgent|blocker|bottleneck|risk|risks?|lobb|ghalta|ghalet|mochkol|problem|actions?|today|daily)\b/i,
      /\b(chbowa|chnowa|chneya|aamel|naamel|tawa|taw)\b.*\b(next|action|priority|audit|analyse|analyze)\b/i,
    ],
    toolNames: [
      "get_dashboard_stats",
      "get_smart_insights",
      "get_today_interviews",
      "get_notifications",
      "get_jobs_stats",
      "get_cv_pool_stats",
      "get_recruitment_analytics",
      "get_candidates_by_stage",
      "get_candidates_by_job",
      "get_candidate",
      "get_screening",
    ],
    instructions: [
      "Fetch the smallest role-allowed live signal set before advising what to do next.",
      "If the request is broad, fetch dashboard/insights first; if it mentions a stage, candidate, screening, or interview, fetch the matching pipeline records next.",
      "Treat the response as a production operating workflow using role-scoped live data, not a staged walkthrough.",
      "Follow this mechanical playbook even when the model is uncertain: 1) Objective, 2) Evidence pulled, 3) lobb el ghalta / biggest blocker, 4) impact, 5) exactly 3 prioritized actions.",
      "Boss use case: if the user asks who needs attention in TA screening, call get_candidates_by_stage, then get_screening for visible candidates with candidateId+jobId, rank by score/staleness, and give the first safe action.",
      "Each action must include owner, action, and why-now; never output vague advice such as 'monitor the pipeline'.",
      "When analytics records exist, produce chart-friendly wording and ask for no extra confirmation unless a mutating action is needed.",
      "If a draft answer conflicts with tool records, discard the draft and trust the deterministic tool evidence.",
      "End with exactly 3 prioritized actions the user can execute today.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "analytics-visualization",
    title: "Analytics and diagram generation",
    description:
      "Fetch dashboard/statistics evidence and let deterministic chart or Mermaid renderers visualize it.",
    triggers: [
      /\b(dashboard|overview|stat(?:s|istics)?|analytics?|kpi|trend|tendance|courbe|chart|graph|graphique|diagram|diagramme|diagrames|mermaid|visuali[sz]e|pipeline|funnel|skill gap|gap)\b/i,
    ],
    toolNames: [
      "get_dashboard_stats",
      "get_smart_insights",
      "get_cv_pool_stats",
      "get_jobs_stats",
      "get_recruitment_analytics",
    ],
    instructions: [
      "Call analytics tools before writing any metric, chart, diagram, trend, or funnel answer.",
      "For chart requests, rely on deterministic chart cards generated from tool records; do not invent chart JSON.",
      "For diagram requests, fetch pipeline data so the renderer can build a valid Mermaid flowchart from real counts.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "cv-search",
    title: "CV and profile search",
    description:
      "Search CVs semantically and ground candidate rows in retrieved profile data.",
    triggers: [
      /\b(cv|cvs|resume|resumes|profile|profiles|candidate|candidates|skill|skills|competence|talent|developer|engineer|consultant|find|search|rank|top|best|shortlist)\b/i,
    ],
    toolNames: [
      "rag_search_cvs",
      "semantic_search_cvs",
      "search_cv_pool",
      "list_cv_pool",
      "get_cv_details",
      "get_candidates_by_stage",
      "get_candidate",
    ],
    instructions: [
      "Prefer rag_search_cvs for natural-language searches; fall back to semantic_search_cvs only if needed.",
      "Candidate table rows must come from current tool results only.",
      "For pipeline candidate questions, get_candidates_by_stage and get_candidate are valid candidate evidence sources; never report zero candidates if those tools returned rows.",
      "Use get_cv_details or get_candidate when a single profile needs deeper evidence.",
      "When the user asks for priority, rank by available screening score first, then stale workflow age, then missing evidence.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "job-matching",
    title: "Job matching and shortlist scoring",
    description:
      "Resolve jobs, match CVs against requirements, compare candidates, and explain fit gaps.",
    triggers: [
      /\b(match|matching|fit|score|shortlist|best\s+match|top\s+candidates?|requirements?|must-have|nice-to-have|assign|screening|screen)\b/i,
    ],
    toolNames: [
      "list_jobs",
      "get_job",
      "match_cvs_to_job",
      "match_cvs_to_job_with_filters",
      "hybrid_search_cvs",
      "compare_candidates",
      "get_candidates_by_stage",
      "get_candidates_by_job",
      "get_candidate",
      "generate_screening",
      "get_screening",
      "bulk_assign_cvs_to_job",
      "assign_cv_to_job",
    ],
    instructions: [
      "Resolve job IDs through list_jobs or get_job before match tools.",
      "Use match_cvs_to_job or hybrid_search_cvs before ranking fit.",
      "For TA screening prioritization, call get_candidates_by_stage and then get_screening for visible candidates before recommending next action.",
      "Use compare_candidates for explicit comparisons instead of manually synthesizing rankings.",
      "If score data is missing, say what is missing and still propose the next safe non-mutating diagnostic step.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "job-authoring",
    title: "Job authoring and optimization",
    description:
      "Generate, create, template, close, or optimize job requirements with validation.",
    triggers: [
      /\b(create|new|generate|write|publish|close|template|optimi[sz]e|improve|review).*\b(job|requirement|description|role|position)\b/i,
      /\b(job|requirement|description|role|position).*\b(create|new|generate|write|publish|close|template|optimi[sz]e|improve|review)\b/i,
    ],
    toolNames: [
      "list_jobs",
      "get_job",
      "generate_job_description",
      "create_job",
      "ai_optimize_job_requirements",
      "save_job_as_template",
      "list_job_templates",
      "create_job_from_template",
      "close_job",
    ],
    instructions: [
      "Ask for missing title or seniority before creating a job; do not invent core fields.",
      "Generate a job description before create_job when the user asks for a new job from a short brief.",
      "Before create_job, convert mustHave and niceToHave into atomic skill labels such as Figma, Accessibility, User research; never send full requirement sentences.",
      "For optimization, fetch the existing job before recommending edits.",
      "To close a named job, resolve its exact ID from list_jobs or get_job, then call close_job. The runtime presents a confirmation before any change; never substitute a candidate lookup.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "workflow-actions",
    title: "Candidate workflow actions",
    description:
      "Move candidates, add notes, assign CVs, and keep mutating operations confirmation-safe.",
    triggers: [
      /\b(move|update|stage|advance|reject|accept|assign|bulk|note|notes|workflow|pipeline action)\b/i,
    ],
    toolNames: [
      "get_candidates_by_job",
      "get_candidates_by_stage",
      "get_candidate",
      "update_candidate_stage",
      "bulk_update_candidate_stage",
      "assign_cv_to_job",
      "add_candidate_note",
      "get_candidate_notes",
      "list_jobs",
    ],
    instructions: [
      "Resolve candidate IDs through candidate list/detail tools before mutating tools.",
      "Summarize exactly what will change before a confirmation-gated mutating action.",
      "Never use display names as IDs.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "interview-operations",
    title: "Interview operations",
    description:
      "Generate interview kits, inspect calendars/reports, and schedule or reschedule interviews.",
    triggers: [
      /\b(interview|calendar|schedule|reschedule|cancel|question|questions|guide|scorecard|report|debrief|meeting|meet)\b/i,
    ],
    toolNames: [
      "get_candidates_by_job",
      "get_candidates_by_stage",
      "get_candidate",
      "generate_interview_questions",
      "get_interview_guide",
      "schedule_interview",
      "get_interview",
      "get_today_interviews",
      "get_interview_calendar",
      "get_interview_report",
      "get_interview_reports_by_candidate",
      "reschedule_interview",
      "cancel_interview",
      "create_interview_report",
      "ai_interview_debrief",
      "predict_pipeline_score",
    ],
    instructions: [
      "Resolve candidate and job IDs before generating interview material or scheduling.",
      "Ask for missing date, time, stage, or meeting link before scheduling.",
      "Use reports/debrief tools for post-interview analysis instead of guessing from memory.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "communication",
    title: "Recruitment communication",
    description:
      "Generate candidate emails, send interview/rejection messages, inspect notifications, and export communication data.",
    triggers: [
      /\b(email|mail|message|invite|invitation|offer|rejection|notification|notify|export|csv|excel|xlsx|download)\b/i,
    ],
    toolNames: [
      "generate_candidate_email",
      "send_interview_invite_email",
      "send_rejection_email",
      "get_notifications",
      "mark_notification_read",
      "mark_all_notifications_read",
      "export_candidates_csv",
      "get_candidate",
      "get_job",
    ],
    instructions: [
      "Generate or fetch message context before sending communication.",
      "Do not claim delivery beyond logged tool results.",
      "Use export tools for file requests instead of describing a file manually.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "governance-admin",
    title: "Admin governance and audit",
    description:
      "Inspect system overview, recruitment analytics, email logs, onboarding, and audit activity for admins.",
    triggers: [
      /\b(admin|governance|audit|activity|logs?|users?|roles?|permission|email logs?|system|onboarding overview|risk|risks?)\b/i,
    ],
    roles: ["admin"],
    toolNames: [
      "get_system_overview",
      "get_recruitment_analytics",
      "get_email_logs",
      "get_onboarding_overview",
      "get_onboarding_detailed",
      "get_activity_log_enriched",
      "get_activity_log",
      "export_email_logs",
      "export_onboarding",
      "generate_candidate_accept_excel",
    ],
    instructions: [
      "Separate observed audit facts from inferred governance risks.",
      "Call admin evidence tools before drawing conclusions about users, email delivery, onboarding, or activity.",
      "State source limits when logs do not include provider, bounce, SLA, or before/after data.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "attachment-processing",
    title: "Attachment and CV upload processing",
    description:
      "Process attached CV files, upload them, and check duplicate risk.",
    triggers: [/\b(upload|attach|attached|file|pdf|docx|process\s+cv|parse\s+cv)\b/i],
    toolNames: [
      "upload_cv",
      "check_duplicate_cv",
      "scan_pool_duplicates",
      "get_cv_details",
      "list_cv_pool",
    ],
    instructions: [
      "When attachments exist and the user asks to process a CV, call upload_cv with attachmentIndex 0 unless they specify another attachment.",
      "After upload, check duplicate risk before recommending next actions.",
      "Never expose raw attachment bytes in the final answer.",
    ],
    requiresFreshTools: true,
  },
  {
    id: "onboarding",
    title: "Onboarding checklist operations",
    description:
      "Inspect and update onboarding tasks for hired candidates.",
    triggers: [/\b(onboarding|checklist|task|tasks|hired|starter|start date)\b/i],
    toolNames: [
      "get_candidates_by_stage",
      "get_candidate",
      "get_onboarding_checklist",
      "toggle_onboarding_task",
      "add_onboarding_task",
    ],
    instructions: [
      "Resolve the hired candidate before checklist operations.",
      "Use checklist tools for task state; do not infer task completion from chat text.",
      "Confirmation-gated updates must say which task changes.",
    ],
    requiresFreshTools: true,
  },
];

const TRIAGE_SKILL: AgentRuntimeSkill = {
  id: "recruitment-triage",
  title: "Recruitment triage",
  description:
    "Default recruitment investigation path when the user asks a broad domain question.",
  triggers: [RECRUITMENT_TRIAGE_RE],
  toolNames: [
    "get_dashboard_stats",
    "get_smart_insights",
    "list_jobs",
    "get_candidates_by_stage",
    "rag_search_cvs",
  ],
  instructions: [
    "Start with the smallest evidence set that can answer the question.",
    "If the user asks a broad status question, fetch dashboard and insight tools first.",
    "If the user asks about people or profiles, switch to CV/candidate search tools.",
  ],
  requiresFreshTools: true,
};

const MISSING_TOOL_RECOVERY_PLAN: Partial<
  Record<AgentRuntimeSkillId, readonly string[]>
> = {
  "proactive-operations": [
    "get_dashboard_stats",
    "get_smart_insights",
    "get_candidates_by_stage",
    "get_today_interviews",
    "get_notifications",
  ],
  "analytics-visualization": [
    "get_dashboard_stats",
    "get_smart_insights",
  ],
  "recruitment-triage": [
    "get_dashboard_stats",
    "get_smart_insights",
  ],
  "cv-search": ["list_cv_pool"],
  "job-matching": ["list_jobs"],
  "job-authoring": ["list_jobs"],
  "workflow-actions": ["get_candidates_by_stage"],
  "interview-operations": ["get_today_interviews"],
  communication: ["get_email_logs"],
  "governance-admin": ["get_system_overview"],
  onboarding: ["get_candidates_by_stage"],
};

function pushUniqueSkill(
  skills: AgentRuntimeSkill[],
  skill: AgentRuntimeSkill,
) {
  if (!skills.some((item) => item.id === skill.id)) {
    skills.push(skill);
  }
}


export function selectAgentRuntimeSkills({
  message,
  role,
  hasAttachments,
}: SelectAgentRuntimeSkillsParams): AgentRuntimeSkill[] {
  const skills: AgentRuntimeSkill[] = [EVIDENCE_DISCIPLINE_SKILL];
  const normalized = message.trim();

  for (const skill of DOMAIN_SKILLS) {
    if (skill.roles && !skill.roles.includes(role)) {
      continue;
    }

    const attachmentTriggered =
      skill.id === "attachment-processing" && hasAttachments;
    const textTriggered = skill.triggers.some((trigger) =>
      trigger.test(normalized),
    );

    if (attachmentTriggered || textTriggered) {
      pushUniqueSkill(skills, skill);
    }
  }

  const hasFreshToolSkill = skills.some((skill) => skill.requiresFreshTools);
  if (!hasFreshToolSkill && RECRUITMENT_TRIAGE_RE.test(normalized)) {
    pushUniqueSkill(skills, TRIAGE_SKILL);
  }

  return skills;
}

export function selectToolNamesForSkills(
  skills: readonly AgentRuntimeSkill[],
): string[] {
  const names = new Set<string>();
  for (const skill of skills) {
    for (const toolName of skill.toolNames) {
      names.add(toolName);
    }
  }

  return Array.from(names);
}

export function selectMissingToolRecoveryToolNames({
  skills,
  availableToolNames,
}: MissingToolRecoveryParams): string[] {
  const availableTools = new Set(availableToolNames);
  const recoveryToolNames = new Set<string>();

  for (const skill of skills) {
    if (!skill.requiresFreshTools) {
      continue;
    }

    const plannedToolNames = MISSING_TOOL_RECOVERY_PLAN[skill.id] ?? [];
    for (const toolName of plannedToolNames) {
      if (availableTools.has(toolName)) {
        recoveryToolNames.add(toolName);
      }
    }
  }

  return Array.from(recoveryToolNames);
}

export function buildAgentSkillPrompt(
  skills: readonly AgentRuntimeSkill[],
  availableToolNames: readonly string[],
): string {
  const availableTools = new Set(availableToolNames);
  const activeSkills = skills.filter(
    (skill) =>
      !skill.requiresFreshTools ||
      skill.toolNames.some((toolName) => availableTools.has(toolName)),
  );

  if (activeSkills.length === 0) {
    return "";
  }

  const blocks = activeSkills.map((skill) => {
    const tools = skill.toolNames.filter((toolName) => availableTools.has(toolName));
    const toolLine =
      tools.length > 0 ? `Available tools: ${tools.join(", ")}` : "Available tools: none";

    return [
      `Skill: ${skill.title} (${skill.id})`,
      `Purpose: ${skill.description}`,
      toolLine,
      "Steps:",
      ...skill.instructions.map((instruction, index) =>
        `${index + 1}. ${instruction}`,
      ),
    ].join("\n");
  });

  return [
    "",
    "═══════════════════════════════════════",
    "SECTION 11: DYNAMIC AGENT SKILLS",
    "═══════════════════════════════════════",
    "The application selected these runtime skills for this user request. Follow them in order; they are not optional style guidance.",
    "If the model is unsure, weak, or tempted to answer generically, execute the selected skill steps literally before writing the final answer.",
    "",
    ...blocks,
  ].join("\n\n");
}

export function shouldRetryForMissingToolUse({
  message,
  skills,
  availableToolNames,
  toolExecutionCount,
}: MissingToolRetryParams): boolean {
  if (toolExecutionCount > 0 || availableToolNames.length === 0) {
    return false;
  }

  const hasToolRequiredSkill = skills.some(
    (skill) =>
      skill.requiresFreshTools &&
      skill.toolNames.some((toolName) => availableToolNames.includes(toolName)),
  );

  return (
    hasToolRequiredSkill &&
    (RECRUITMENT_TRIAGE_RE.test(message) ||
      skills.some((skill) => skill.id === "proactive-operations"))
  );
}

const EXPLICIT_MUTATION_TOOL_NAMES = new Set([
  "upload_cv",
  "delete_cv",
  "create_job",
  "close_job",
  "save_job_as_template",
  "create_job_from_template",
  "update_candidate_stage",
  "assign_cv_to_job",
  "add_candidate_note",
  "bulk_update_candidate_stage",
  "generate_screening",
  "bulk_assign_cvs_to_job",
  "generate_interview_questions",
  "schedule_interview",
  "reschedule_interview",
  "cancel_interview",
  "create_interview_report",
  "send_interview_invite_email",
  "send_rejection_email",
  "mark_notification_read",
  "mark_all_notifications_read",
  "toggle_onboarding_task",
  "add_onboarding_task",
]);

const EXPLICIT_TOOL_INVOCATION_RE =
  /\b(?:invoke|run|execute|use|call|lancer|executer|exécuter|utiliser|appeler)\s+(?:the\s+|le\s+|l['’])?(?:tool\s+|outil\s+)?([a-z][a-z0-9_]+)(?:\s+(?:tool|outil))?\b/i;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CANDIDATE_STAGE_RE =
  /\b(new|ta_screening|ta_interview|ta_accepted|ta_rejected|manager_interview|manager_accepted|manager_rejected|hr_interview|hr_accepted|hr_rejected|hired)\b/i;
const CANDIDATE_STAGE_MUTATION_RE =
  /\b(move|change|update|set|reset|return|advance|transition|execute|remet(?:s|tre)?|mettre|passe(?:r)?|deplace(?:r)?|déplace(?:r)?|baddel|radd)\b/i;

function extractRequestedCandidateStage(message: string): string | undefined {
  const explicitTarget = message.match(
    /\b(?:newStage|new\s+stage|target\s+stage|to|into|vers|a|à)\s*[:=]?\s*(new|ta_screening|ta_interview|ta_accepted|ta_rejected|manager_interview|manager_accepted|manager_rejected|hr_interview|hr_accepted|hr_rejected|hired)\b/i,
  )?.[1];
  if (explicitTarget) return explicitTarget.toLowerCase();

  const stages = Array.from(
    message.matchAll(new RegExp(CANDIDATE_STAGE_RE.source, "gi")),
    (match) => match[1]?.toLowerCase(),
  ).filter((stage): stage is string => Boolean(stage));
  return stages.at(-1);
}

function isCandidateStageMutationRequest(message: string): boolean {
  return (
    CANDIDATE_STAGE_RE.test(message) &&
    (CANDIDATE_STAGE_MUTATION_RE.test(message) ||
      /\bupdate_candidate_stage\b/i.test(message))
  );
}


function parseExplicitJsonArguments(
  message: string,
): Record<string, unknown> | null {
  const rawJson = message.match(/\barguments?\s*[:=]\s*(\{[\s\S]*\})\s*$/i)?.[1];
  if (!rawJson) return null;

  try {
    const parsed: unknown = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildExplicitMutationArgs(
  toolName: string,
  message: string,
): Record<string, unknown> | null {
  const explicitJson = parseExplicitJsonArguments(message);
  if (explicitJson) return explicitJson;

  const ids = message.match(UUID_RE) ?? [];
  const firstId = ids[0];
  const secondId = ids[1];

  if (toolName === "mark_all_notifications_read") return {};
  if (toolName === "delete_cv" && firstId) return { cvId: firstId };
  if (toolName === "close_job" && firstId) return { jobId: firstId };
  if (toolName === "save_job_as_template" && firstId) {
    return { jobId: firstId };
  }
  if (toolName === "cancel_interview" && firstId) {
    return { interviewId: firstId };
  }
  if (toolName === "mark_notification_read" && firstId) {
    return { notificationId: firstId };
  }
  if (toolName === "update_candidate_stage" && firstId) {
    const newStage = extractRequestedCandidateStage(message);
    return newStage ? { candidateId: firstId, newStage } : null;
  }
  if (toolName === "assign_cv_to_job" && firstId && secondId) {
    return { cvId: firstId, jobId: secondId };
  }
  if (toolName === "generate_screening" && firstId && secondId) {
    return { candidateId: firstId, jobId: secondId };
  }
  if (toolName === "send_rejection_email" && firstId && secondId) {
    return { candidateId: firstId, jobId: secondId };
  }

  return null;
}

export function buildExplicitMutationToolCall({
  message,
  availableToolNames,
}: ExplicitMutationToolCallParams): ResponseToolCall | null {
  const invokedToolName = message
    .match(EXPLICIT_TOOL_INVOCATION_RE)?.[1]
    ?.toLowerCase();
  const toolName =
    invokedToolName ??
    (isCandidateStageMutationRequest(message) &&
    availableToolNames.includes("update_candidate_stage")
      ? "update_candidate_stage"
      : undefined);
  if (
    !toolName ||
    !EXPLICIT_MUTATION_TOOL_NAMES.has(toolName) ||
    !availableToolNames.includes(toolName)
  ) {
    return null;
  }

  const args = buildExplicitMutationArgs(toolName, message);
  if (!args) return null;

  return {
    id: `explicit-mutation-${crypto.randomUUID()}`,
    type: "function",
    function: {
      name: toolName,
      arguments: JSON.stringify(args),
    },
  };
}

export function buildMissingCandidateStageToolCall({
  message,
  availableToolNames,
  records,
  step,
}: MissingCandidateStageRecoveryParams): ResponseToolCall | null {
  if (
    !isCandidateStageMutationRequest(message) ||
    !availableToolNames.includes("update_candidate_stage") ||
    records.some((record) => record.toolName === "update_candidate_stage")
  ) {
    return null;
  }

  const newStage = extractRequestedCandidateStage(message);
  if (!newStage) return null;

  const candidateRecord = [...records]
    .reverse()
    .find(
      (record) =>
        record.toolName === "get_candidate" &&
        record.result.success &&
        record.result.data &&
        typeof record.result.data === "object" &&
        !Array.isArray(record.result.data),
    );
  if (
    !candidateRecord?.result.data ||
    typeof candidateRecord.result.data !== "object" ||
    Array.isArray(candidateRecord.result.data)
  ) {
    return null;
  }

  const candidate = candidateRecord.result.data as Record<string, unknown>;
  const candidateId =
    typeof candidate.candidateId === "string"
      ? candidate.candidateId
      : typeof candidate.id === "string"
        ? candidate.id
        : undefined;
  if (!candidateId) return null;

  return {
    id: `missing-stage-recovery-${step}`,
    type: "function",
    function: {
      name: "update_candidate_stage",
      arguments: JSON.stringify({ candidateId, newStage }),
    },
  };
}

const CREATE_JOB_REQUEST_RE =
  /\b(create|new|generate|write|publish)\b.*\b(job|requirement|description|role|position)\b|\b(job|requirement|description|role|position)\b.*\b(create|new|generate|write|publish)\b/i;

export function buildMissingCreateJobToolCall({
  message,
  skills,
  availableToolNames,
  records,
  step,
}: MissingCreateJobRecoveryParams): ResponseToolCall | null {
  if (
    !CREATE_JOB_REQUEST_RE.test(message) ||
    !availableToolNames.includes("create_job") ||
    !skills.some((skill) => skill.id === "job-authoring") ||
    records.some((record) => record.toolName === "create_job")
  ) {
    return null;
  }

  const generatedRecord = [...records]
    .reverse()
    .find(
      (record) =>
        record.toolName === "generate_job_description" &&
        record.result.success &&
        record.result.data &&
        typeof record.result.data === "object" &&
        !Array.isArray(record.result.data),
    );

  if (!generatedRecord?.result.data) {
    return null;
  }

  const generated = generatedRecord.result.data as Record<string, unknown>;
  const generatedArgs = generatedRecord.args;
  const requestedTitle =
    typeof generatedArgs.title === "string" && generatedArgs.title.trim().length > 0
      ? generatedArgs.title.trim()
      : "";
  const requestedSeniority =
    typeof generatedArgs.seniority === "string" && generatedArgs.seniority.trim().length > 0
      ? generatedArgs.seniority.trim()
      : "";
  const requestedBusinessUnit =
    typeof generatedArgs.businessUnit === "string" && generatedArgs.businessUnit.trim().length > 0
      ? generatedArgs.businessUnit.trim()
      : undefined;
  const title =
    requestedTitle || (typeof generated.title === "string" ? generated.title.trim() : "");
  const description =
    typeof generated.description === "string" ? generated.description.trim() : "";
  const seniority =
    requestedSeniority ||
    (typeof generated.seniority === "string" ? generated.seniority.trim() : "");
  const mustHave = Array.isArray(generated.mustHave)
    ? normalizeJobSkillLabels(
        generated.mustHave.filter(
          (value): value is string => typeof value === "string",
        ),
      )
    : [];
  const niceToHave = Array.isArray(generated.niceToHave)
    ? normalizeJobSkillLabels(
        generated.niceToHave.filter(
          (value): value is string => typeof value === "string",
        ),
      )
    : [];
  const businessUnit =
    requestedBusinessUnit ??
    (typeof generated.businessUnit === "string" && generated.businessUnit.trim().length > 0
      ? generated.businessUnit.trim()
      : undefined);

  if (!title || !description || mustHave.length === 0 || !seniority) {
    return null;
  }

  return {
    id: `missing-create-job-recovery-${step}`,
    type: "function",
    function: {
      name: "create_job",
      arguments: JSON.stringify({
        title,
        description,
        mustHave,
        niceToHave,
        seniority,
        ...(businessUnit ? { businessUnit } : {}),
      }),
    },
  };
}

const CLOSE_JOB_REQUEST_RE =
  /\bclose\b(?:\s+(?:the|this|that))?\s+["“]([^"”]+)["”]\s+(?:job|requirement|role|position)\b/i;

export function buildMissingCloseJobToolCall({
  message,
  skills,
  availableToolNames,
  records,
  step,
}: MissingCloseJobRecoveryParams): ResponseToolCall | null {
  const requestedTitle = message.match(CLOSE_JOB_REQUEST_RE)?.[1]?.trim();
  if (
    !requestedTitle ||
    !availableToolNames.includes("close_job") ||
    !skills.some((skill) => skill.id === "job-authoring") ||
    records.some((record) => record.toolName === "close_job")
  ) {
    return null;
  }

  const normalizedTitle = requestedTitle.toLocaleLowerCase();
  for (const record of [...records].reverse()) {
    if (
      !record.result.success ||
      (record.toolName !== "list_jobs" && record.toolName !== "get_job")
    ) {
      continue;
    }

    const jobs = Array.isArray(record.result.data)
      ? record.result.data
      : record.result.data === undefined
        ? []
        : [record.result.data];
    const exactMatches = jobs.filter(
      (job): job is Record<string, unknown> =>
        typeof job === "object" &&
        job !== null &&
        !Array.isArray(job) &&
        typeof job.id === "string" &&
        job.id.trim().length > 0 &&
        typeof job.title === "string" &&
        job.title.trim().toLocaleLowerCase() === normalizedTitle &&
        typeof job.status === "string" &&
        job.status.toLocaleLowerCase() === "open",
    );

    if (exactMatches.length !== 1) {
      continue;
    }

    return {
      id: `missing-close-job-recovery-${step}`,
      type: "function",
      function: {
        name: "close_job",
        arguments: JSON.stringify({ jobId: exactMatches[0].id }),
      },
    };
  }

  return null;
}

export function buildMissingToolRetryMessage(
  skills: readonly AgentRuntimeSkill[],
  availableToolNames: readonly string[],
): string {
  const requiredSkillNames = skills
    .filter((skill) => skill.requiresFreshTools)
    .map((skill) => skill.title);

  return [
    "The previous draft used no tools, so it is not grounded enough to send.",
    `Selected skills: ${requiredSkillNames.join(", ") || "Evidence-first reasoning"}.`,
    `Available tools: ${availableToolNames.join(", ")}.`,
    "Call the smallest necessary tool set now, execute the selected skill steps literally, then answer from those results. Do not provide another final answer before tool evidence exists.",
  ].join("\n");
}
