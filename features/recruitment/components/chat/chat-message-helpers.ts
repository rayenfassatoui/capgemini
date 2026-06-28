import type { AgentEvidenceMetadata, AgentSourceKind, RecruitmentAnalyticsChart, RecruitmentResponseCard } from "../../types";
import type {
  AgentActionConfirmation,
  ChatResponseMetadata,
  ToolEvent,
  ToolTraceJson,
} from "./chat-types";

export interface FollowUpSuggestionContext {
  content: string;
  metadata?: ChatResponseMetadata;
  charts?: RecruitmentAnalyticsChart[];
  cards?: RecruitmentResponseCard[];
  confirmations?: AgentActionConfirmation[];
  toolEvents?: ToolEvent[];
}

export interface EvidenceConfidenceSummary {
  level: "high" | "medium" | "low";
  verifiedSources: number;
  failedSources: number;
  inferenceLimitCount: number;
  observedFactCount: number;
  summary: string;
  issues: string[];
}

export interface ConfirmationEntityChip {
  label: string;
  value: string;
}

export interface ConfirmationPreview {
  riskLevel: "high" | "medium" | "low";
  riskLabel: string;
  entities: ConfirmationEntityChip[];
  impact: string[];
}

const CV_FOLLOW_UPS = [
  "Compare the top matching candidates",
  "List the main hiring risks",
  "Generate interview questions for this profile",
] as const;

const JOB_FOLLOW_UPS = [
  "Tighten the job requirements",
  "Show the strongest matching profiles",
  "List the main matching gaps",
] as const;

const INTERVIEW_FOLLOW_UPS = [
  "Turn this into an interview scorecard",
  "List the red flags to probe next",
  "Draft a candidate follow-up email",
] as const;

const ANALYTICS_FOLLOW_UPS = [
  "Explain the main bottleneck behind this",
  "Turn this into role-specific next actions",
  "Compare this trend with another segment",
] as const;

const GOVERNANCE_FOLLOW_UPS = [
  "Summarize the governance risk here",
  "Show only the failed or pending actions",
  "Draft an audit-ready summary",
] as const;

const CONFIRMATION_FOLLOW_UPS = [
  "Explain the impact of this action before I confirm",
  "Show the affected records for this action",
  "List the risks if I approve this change",
] as const;

const GENERAL_FOLLOW_UPS = [
  "Turn this into next actions",
  "Show the evidence and risks",
  "Summarize this for a hiring manager",
] as const;

const HIGH_RISK_TOOL_RE = /(delete|close|cancel|reject|bulk|hired|mark_.*read)/i;
const MEDIUM_RISK_TOOL_RE = /(update|assign|create|add|send|schedule|upload)/i;

function isRecord(value: ToolTraceJson | undefined): value is Record<string, ToolTraceJson> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(args: Record<string, ToolTraceJson>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactValue(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function uniquePush(values: string[], next: string | null) {
  if (!next || values.includes(next)) return;
  values.push(next);
}

function hasSourceKind(
  evidence: AgentEvidenceMetadata | undefined,
  kinds: readonly AgentSourceKind[],
): boolean {
  if (!evidence) return false;
  const kindSet = new Set(kinds);
  return evidence.sources.some((source) => kindSet.has(source.kind));
}

function hasToolName(toolEvents: ToolEvent[] | undefined, pattern: RegExp): boolean {
  return toolEvents?.some((event) => pattern.test(event.tool)) ?? false;
}

function fallbackFollowUps(content: string): readonly string[] {
  const normalized = content.toLowerCase();
  if (normalized.includes("interview")) return INTERVIEW_FOLLOW_UPS;
  if (normalized.includes("job") || normalized.includes("requirement")) return JOB_FOLLOW_UPS;
  if (normalized.includes("candidate") || normalized.includes("cv")) return CV_FOLLOW_UPS;
  return GENERAL_FOLLOW_UPS;
}

export function getFollowUpSuggestions({
  content,
  metadata,
  charts,
  cards,
  confirmations,
  toolEvents,
}: FollowUpSuggestionContext): string[] {
  const pendingConfirmations = confirmations?.some((item) => item.status === "pending") ?? false;
  if (pendingConfirmations) {
    return [...CONFIRMATION_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "governance")) {
    return [...GOVERNANCE_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "pipeline")) {
    return [...ANALYTICS_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "candidate")) {
    return [...CV_FOLLOW_UPS];
  }
  const evidence = metadata?.evidence;
  if ((charts?.length ?? 0) > 0 || hasSourceKind(evidence, ["analytics", "search", "system"])) {
    return [...ANALYTICS_FOLLOW_UPS];
  }

  if (
    hasSourceKind(evidence, ["operation", "onboarding"]) ||
    hasToolName(toolEvents, /(governance|activity|onboarding|notification|email|audit)/i)
  ) {
    return [...GOVERNANCE_FOLLOW_UPS];
  }

  if (hasSourceKind(evidence, ["interview"]) || hasToolName(toolEvents, /(interview|scorecard)/i)) {
    return [...INTERVIEW_FOLLOW_UPS];
  }

  if (hasSourceKind(evidence, ["job"]) || hasToolName(toolEvents, /(job|requirement)/i)) {
    return [...JOB_FOLLOW_UPS];
  }

  if (
    hasSourceKind(evidence, ["candidate", "cv"]) ||
    hasToolName(toolEvents, /(candidate|cv|screening|matching)/i)
  ) {
    return [...CV_FOLLOW_UPS];
  }

  return [...fallbackFollowUps(content)];
}

export function summarizeEvidenceConfidence(
  evidence?: AgentEvidenceMetadata,
): EvidenceConfidenceSummary | null {
  if (!evidence) return null;

  const verifiedSources = evidence.sources.filter((source) => source.status === "success").length;
  const failedSources = evidence.sources.length - verifiedSources;
  const inferenceLimitCount = evidence.inferenceLimits.length;
  const observedFactCount = evidence.observedFacts.length;

  const issues: string[] = [];
  if (failedSources > 0) {
    issues.push(
      `${failedSources} source${failedSources === 1 ? " was" : "s were"} unavailable or excluded.`,
    );
  }
  for (const limit of evidence.inferenceLimits.slice(0, 2)) {
    uniquePush(issues, limit);
  }

  if (verifiedSources === 0) {
    return {
      level: "low",
      verifiedSources,
      failedSources,
      inferenceLimitCount,
      observedFactCount,
      summary: "No verified live source supports this answer yet.",
      issues,
    };
  }

  if (failedSources === 0 && inferenceLimitCount <= 1 && verifiedSources >= 2) {
    return {
      level: "high",
      verifiedSources,
      failedSources,
      inferenceLimitCount,
      observedFactCount,
      summary: `${verifiedSources} verified sources support the recommendation.`,
      issues,
    };
  }

  return {
    level: "medium",
    verifiedSources,
    failedSources,
    inferenceLimitCount,
    observedFactCount,
    summary: "Useful evidence exists, but the answer still has limits worth checking.",
    issues,
  };
}

export function buildConfirmationPreview(
  confirmation: AgentActionConfirmation,
): ConfirmationPreview {
  const args = isRecord(confirmation.args) ? confirmation.args : {};
  const entities: ConfirmationEntityChip[] = [];
  const impact: string[] = [];

  const toolName = confirmation.toolName;
  const candidateId = readString(args, "candidateId");
  const jobId = readString(args, "jobId");
  const cvId = readString(args, "cvId");
  const interviewId = readString(args, "interviewId");
  const managerId = readString(args, "managerId");
  const hrId = readString(args, "hrId");
  const newStage = readString(args, "newStage");
  const status = readString(args, "status");
  const title = readString(args, "title") ?? readString(args, "taskTitle");
  const email = readString(args, "email") ?? readString(args, "toEmail");
  const seniority = readString(args, "seniority");
  const mustHaveCount = Array.isArray(args.mustHave)
    ? args.mustHave.filter((value): value is string => typeof value === "string").length
    : 0;
  const candidateIds = Array.isArray(args.candidateIds)
    ? args.candidateIds.filter((value): value is string => typeof value === "string")
    : [];

  if (candidateId) entities.push({ label: "Candidate", value: compactValue(candidateId) });
  if (candidateIds.length > 0) {
    entities.push({ label: "Candidates", value: String(candidateIds.length) });
  }
  if (jobId) entities.push({ label: "Job", value: compactValue(jobId) });
  if (cvId) entities.push({ label: "CV", value: compactValue(cvId) });
  if (interviewId) entities.push({ label: "Interview", value: compactValue(interviewId) });
  if (email) entities.push({ label: "Recipient", value: email });
  if (seniority) entities.push({ label: "Seniority", value: seniority });
  if (mustHaveCount > 0) entities.push({ label: "Must-have", value: String(mustHaveCount) });

  uniquePush(
    impact,
    newStage ? `Stage will change to ${formatToken(newStage)}.` : null,
  );
  uniquePush(
    impact,
    status ? `Status will become ${formatToken(status)}.` : null,
  );
  uniquePush(
    impact,
    managerId ? `Responsibility will move to manager ${compactValue(managerId)}.` : null,
  );
  uniquePush(
    impact,
    hrId ? `Responsibility will move to HR ${compactValue(hrId)}.` : null,
  );
  uniquePush(
    impact,
    title ? `A new item titled “${title}” will be created or updated.` : null,
  );
  if (/assign_cv_to_job/i.test(toolName)) {
    uniquePush(impact, "This links a CV to a job and creates a pipeline candidate record.");
  }
  if (/create_job/i.test(toolName)) {
    uniquePush(
      impact,
      mustHaveCount > 0
        ? `A job requirement will be created with ${mustHaveCount} must-have item${mustHaveCount === 1 ? "" : "s"}.`
        : "A job requirement will be created from the generated description.",
    );
  }
  if (/schedule_interview/i.test(toolName)) {
    uniquePush(impact, "Interview planning data will be persisted and can trigger notifications.");
  }
  if (/send_/i.test(toolName)) {
    uniquePush(impact, "A candidate-facing communication will be logged and sent.");
  }
  if (/delete|close|cancel/i.test(toolName)) {
    uniquePush(impact, "This change can hide, close, or reverse an existing workflow item.");
  }
  if (impact.length === 0) {
    impact.push("This action changes recruitment data and will be written to the audit trail.");
  }

  const riskLevel = HIGH_RISK_TOOL_RE.test(toolName)
    ? "high"
    : MEDIUM_RISK_TOOL_RE.test(toolName)
      ? "medium"
      : "low";

  return {
    riskLevel,
    riskLabel: riskLevel === "high" ? "High risk" : riskLevel === "medium" ? "Medium risk" : "Low risk",
    entities,
    impact,
  };
}

export function getConfirmationExpiryState(
  expiresAt: string,
  now: number = Date.now(),
): { expired: boolean; label: string } {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return { expired: false, label: "Expiration unavailable" };
  }

  const diffMs = expiresAtMs - now;
  if (diffMs <= 0) {
    return { expired: true, label: "Expired" };
  }

  const totalSeconds = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return {
      expired: false,
      label: `Expires in ${hours}h ${minutes}m`,
    };
  }

  if (minutes > 0) {
    return {
      expired: false,
      label: `Expires in ${minutes}m ${seconds}s`,
    };
  }

  return {
    expired: false,
    label: `Expires in ${seconds}s`,
  };
}
