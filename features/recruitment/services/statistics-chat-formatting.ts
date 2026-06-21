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
