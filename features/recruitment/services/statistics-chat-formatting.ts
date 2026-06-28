import { buildDeterministicToolFallback } from "./chat-orchestration";
import { maskUserIdForTelemetry } from "./candidate-grounding";
import {
  type ToolExecutionRecord,
  type ToolTraceJson,
} from "./statistics-chat-types";

const SENSITIVE_TRACE_KEY_RE =
  /password|token|apiKey|apikey|api_key|secret|authorization|rawBytes|base64|binaryData|_attachment/i;

export function getToolSummary(result: {
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

export function sanitizeToolTraceValue(value: unknown): ToolTraceJson {
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

export function inferToolPurpose(
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
  if (toolName.includes("generate")) {
    return "Generate AI-assisted recruitment output";
  }
  if (toolName.includes("update")) return "Update recruitment workflow state";
  if (toolName.includes("delete")) return "Delete recruitment data";

  return `Run ${toolName.replace(/_/g, " ")}`;
}

export function buildDeterministicFallbackFromRecords(
  records: ToolExecutionRecord[],
): string | null {
  const successful = records.filter((record) => record.result.success);
  if (successful.length === 0) {
    return null;
  }

  const analyticsFallback = buildAnalyticsFallbackFromRecords(successful);
  if (analyticsFallback) {
    return analyticsFallback;
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

function buildAnalyticsFallbackFromRecords(
  records: ToolExecutionRecord[],
): string | null {
  const dashboard = getToolRecordData(records, "get_dashboard_stats");
  const insights = getToolRecordData(records, "get_smart_insights");
  if (!dashboard && !insights) {
    return null;
  }

  const dashboardRecord = toRecord(dashboard);
  const insightsRecord = toRecord(insights);
  const totalCandidates = getNumber(dashboardRecord, "totalCandidates");
  const totalJobs = getNumber(dashboardRecord, "totalJobs");
  const pendingScreenings = getNumber(dashboardRecord, "pendingScreenings");
  const stageBreakdown = toNumberRecord(dashboardRecord?.stageBreakdown);
  const pipelineFunnel = toNumberRecord(insightsRecord?.pipelineFunnel);
  const bottleneck = findTopEntry(stageBreakdown ?? pipelineFunnel);
  const skillGap = findLargestSkillGap(insightsRecord?.skillGapAnalysis);
  const topRole = findTopCount(insightsRecord?.mostDemandedJobProfiles, "title");

  const rootCauseParts: string[] = [];
  if (bottleneck) {
    rootCauseParts.push(
      `${formatStageLabel(bottleneck.key)} is the largest visible stage with ${bottleneck.value} candidate${bottleneck.value === 1 ? "" : "s"}`,
    );
  }
  if (skillGap) {
    rootCauseParts.push(
      `${skillGap.skill} demand is ${skillGap.demand} while CV supply is ${skillGap.supply}`,
    );
  }

  const lobb =
    rootCauseParts.length > 0
      ? rootCauseParts.join("; ")
      : "the fetched dashboard does not expose a single dominant bottleneck";

  const evidence = [
    totalCandidates === null ? null : `Assigned pipeline candidates: **${totalCandidates}**.`,
    totalJobs === null ? null : `Open jobs / job records: **${totalJobs}**.`,
    pendingScreenings === null
      ? null
      : `Pending screenings: **${pendingScreenings}**.`,
    bottleneck
      ? `Largest stage: **${formatStageLabel(bottleneck.key)}** with **${bottleneck.value}** candidate${bottleneck.value === 1 ? "" : "s"}.`
      : null,
    skillGap
      ? `Largest skill gap: **${skillGap.skill}** demand **${skillGap.demand}** vs supply **${skillGap.supply}**.`
      : null,
    topRole
      ? `Most demanded role: **${topRole.label}** with **${topRole.count}** signal${topRole.count === 1 ? "" : "s"}.`
      : null,
  ].filter((line): line is string => Boolean(line));

  return [
    "# My read",
    `Lobb el mochkol: ${lobb}.`,
    "",
    "# Evidence",
    ...evidence.map((line) => `- ${line}`),
    "",
    "# Charts and diagram",
    "I fetched dashboard and insight tools first. The UI renders the Mermaid pipeline and chart cards below from those exact tool records.",
    "",
    "# Actions",
    "1. Clear the largest stage first; assign an owner and daily exit target.",
    skillGap
      ? `2. Source or reskill for **${skillGap.skill}** before opening more similar demand.`
      : "2. Compare job demand against CV supply before opening more requisitions.",
    "3. Re-check the funnel after the next hiring-cycle update and keep only evidence-backed claims.",
    "",
    "# Caveats",
    "- This is deterministic recovery output because the model skipped required tool calls.",
    "- Recommendations are inferred from fetched dashboard and insight data only.",
  ].join("\n");
}

function getToolRecordData(
  records: ToolExecutionRecord[],
  toolName: string,
): unknown {
  return [...records].reverse().find((record) => record.toolName === toolName)
    ?.result.data;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNumberRecord(value: unknown): Record<string, number> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const result: Record<string, number> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      result[key] = nestedValue;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function findTopEntry(
  record: Record<string, number> | null,
): { key: string; value: number } | null {
  if (!record) {
    return null;
  }

  const [key, value] =
    Object.entries(record)
      .filter(([, count]) => count > 0)
      .sort(([, left], [, right]) => right - left)[0] ?? [];
  return typeof key === "string" && typeof value === "number"
    ? { key, value }
    : null;
}

function findLargestSkillGap(value: unknown): {
  skill: string;
  demand: number;
  supply: number;
} | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const skill = record?.skill;
      const demand = record?.demand;
      const supply = record?.supply;
      if (
        typeof skill !== "string" ||
        typeof demand !== "number" ||
        typeof supply !== "number"
      ) {
        return null;
      }

      return { skill, demand, supply };
    })
    .filter((item): item is { skill: string; demand: number; supply: number } =>
      Boolean(item),
    )
    .sort(
      (left, right) =>
        right.demand - right.supply - (left.demand - left.supply),
    )[0] ?? null;
}

function findTopCount(
  value: unknown,
  labelKey: string,
): { label: string; count: number } | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const label = record?.[labelKey];
      const count = record?.count;
      if (typeof label !== "string" || typeof count !== "number") {
        return null;
      }

      return { label, count };
    })
    .filter((item): item is { label: string; count: number } => Boolean(item))
    .sort((left, right) => right.count - left.count)[0] ?? null;
}

function formatStageLabel(stage: string): string {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function logGroundingGuardBlock({
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

export function buildActionConfirmationResponse(summary: string): string {
  return [
    "Confirmation required.",
    "",
    summary,
    "",
    "Review the action card below, then choose Confirm or Cancel.",
  ].join("\n");
}

export function buildConfirmedActionResponse(
  toolName: string,
  result: { success: boolean; error?: string },
): string {
  if (!result.success) {
    return `I couldn't complete **${toolName.replace(/_/g, " ")}** because: ${result.error ?? "the tool failed"}.`;
  }

  return `Done. Confirmed action **${toolName.replace(/_/g, " ")}** was executed.`;
}
