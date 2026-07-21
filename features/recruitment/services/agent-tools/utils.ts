import type { CandidateStage } from "../../types";
import type { AgentToolContext } from "./types";
import { findBestLookupMatch, normalizeLookupText } from "../name-matching";

type Services = typeof import("../index");

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALL_CANDIDATE_STAGES: CandidateStage[] = [
  "new",
  "ta_screening",
  "ta_interview",
  "ta_accepted",
  "ta_rejected",
  "manager_interview",
  "manager_accepted",
  "manager_rejected",
  "hr_interview",
  "hr_accepted",
  "hr_rejected",
  "hired",
];

type ResolvableParamName = "cvId" | "jobId" | "candidateId" | "interviewId";

function normalizeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHashValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (key.startsWith("_")) return acc;
        const normalized = normalizeHashValue(
          (value as Record<string, unknown>)[key],
        );
        if (normalized !== undefined) {
          acc[key] = normalized;
        }
        return acc;
      }, {});
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeHashValue(value));
}

export function normalizeArgsForHash(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = normalizeHashValue(args) as Record<string, unknown>;

  const sortStringArray = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) return undefined;
    return input
      .map((item) => String(item).trim())
      .sort((a, b) => a.localeCompare(b));
  };

  if (toolName === "compare_candidates" && normalized.candidateIds) {
    normalized.candidateIds = sortStringArray(normalized.candidateIds);
  }

  if (toolName === "get_candidates_by_stage" && normalized.stages) {
    normalized.stages = sortStringArray(normalized.stages);
  }

  if (normalized.skills) {
    normalized.skills = sortStringArray(normalized.skills);
  }

  if (normalized.languages) {
    normalized.languages = sortStringArray(normalized.languages);
  }

  return normalized;
}

export function makeToolCallCacheKey(
  toolName: string,
  args: Record<string, unknown>,
): string {
  return `${toolName}:${stableStringify(normalizeArgsForHash(toolName, args))}`;
}

function formatSuggestion(label: string, score: number): string {
  return `${label} (${Math.round(score * 100)}% match)`;
}

function buildNoMatchError(
  raw: string,
  paramName: ResolvableParamName,
  suggestions: string[],
): Error {
  const suffix =
    suggestions.length > 0 ? ` Close matches: ${suggestions.join(", ")}.` : "";

  return new Error(
    `No ${paramName.replace("Id", "")} found matching "${raw}". Provide a UUID, index, or a clearer name/title.${suffix}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 1: Tool Output Compaction
// Reduces token cost by stripping non-essential fields and truncating values
// ---------------------------------------------------------------------------

/** Max characters for string values before truncation */
const MAX_STRING_LENGTH = 500;

/** Max items in arrays before truncation */
const MAX_ARRAY_ITEMS = 20;

/** Fields to always strip from tool outputs (large blobs, binary data) */
const STRIP_FIELDS = new Set([
  "rawBytes",
  "rawText",
  "embedding",
  "rawHtml",
  "rawJson",
  "base64",
  "binaryData",
]);

/** Fields to truncate more aggressively (long text fields) */
const TRUNCATE_FIELDS = new Set([
  "description",
  "summary",
  "extractedSummary",
  "aiRecommendation",
  "recommendation",
  "content",
  "notes",
  "body",
]);

/**
 * Truncate a string to max length with ellipsis indicator
 */
function truncateString(
  str: string,
  maxLen: number = MAX_STRING_LENGTH,
): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Deep sanitization and compaction of tool results.
 * - Strips large binary/text fields
 * - Truncates long strings
 * - Limits array lengths
 * - Converts dates to ISO strings
 */
export function sanitizeForJson(obj: unknown, depth: number = 0): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();

  if (Array.isArray(obj)) {
    const sanitized = obj
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForJson(item, depth + 1));
    if (obj.length > MAX_ARRAY_ITEMS) {
      sanitized.push(
        `... and ${obj.length - MAX_ARRAY_ITEMS} more items (${obj.length} total)`,
      );
    }
    return sanitized;
  }

  if (typeof obj === "string") {
    return truncateString(obj);
  }

  if (typeof obj === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip fields that should be stripped entirely
      if (STRIP_FIELDS.has(key)) continue;

      // Truncate known long text fields more aggressively
      if (TRUNCATE_FIELDS.has(key) && typeof value === "string") {
        clean[key] = truncateString(value, 200);
        continue;
      }

      clean[key] = sanitizeForJson(value, depth + 1);
    }
    return clean;
  }

  return obj;
}

/**
 * Truncate array with summary message
 */
export function truncateArray(arr: unknown[], max: number): unknown[] {
  if (arr.length <= max) return arr;
  return [
    ...arr.slice(0, max),
    `... and ${arr.length - max} more items (${arr.length} total)`,
  ];
}

/**
 * Compact a tool result for model consumption.
 * For large result sets, returns a summary + top items instead of full data.
 */
export function compactToolResult(
  result: unknown,
  options: { maxItems?: number; includeSummary?: boolean } = {},
): unknown {
  const { maxItems = 15, includeSummary = true } = options;

  // Handle arrays - add summary for large lists
  if (Array.isArray(result)) {
    const total = result.length;
    const truncated = result
      .slice(0, maxItems)
      .map((item) => sanitizeForJson(item));

    if (total > maxItems && includeSummary) {
      return {
        _summary: `Showing top ${maxItems} of ${total} results`,
        _totalCount: total,
        results: truncated,
      };
    }
    return truncated;
  }

  // Handle objects with nested arrays
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const compacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        compacted[key] = compactToolResult(value, {
          maxItems,
          includeSummary: false,
        });
        if (value.length > maxItems) {
          compacted[`_${key}Count`] = value.length;
        }
      } else {
        compacted[key] = sanitizeForJson(value);
      }
    }

    return compacted;
  }

  return sanitizeForJson(result);
}

export function createResolveId(services: Services, ctx: AgentToolContext) {
  return async (
    value: unknown,
    paramName: ResolvableParamName,
  ): Promise<string> => {
    const raw = String(value ?? "").trim();
    if (UUID_RE.test(raw)) {
      if (paramName === "candidateId") {
        const candidate = await services.getCandidateForActor(raw, ctx);
        if (!candidate) {
          throw new Error("Candidate not found or not accessible.");
        }
      }
      return raw;
    }

    const index = Number(raw);
    const isIndex = Number.isInteger(index) && index >= 0;

    if (!raw) {
      throw new Error(`Invalid ${paramName}: expected a UUID, index, or name.`);
    }

    // --- Name-based lookup when value is a non-numeric string ---
    if (!isIndex) {
      const needle = normalizeLookupText(raw);

      if (paramName === "candidateId") {
        const rows = await services.getCandidatesForActor(ctx, {
          stages: ALL_CANDIDATE_STAGES,
        });
        const exactMatch =
          rows.find((r) => normalizeLookupText(r.fullName ?? "") === needle) ??
          rows.find((r) =>
            normalizeLookupText(r.fullName ?? "").includes(needle),
          );

        if (exactMatch) return exactMatch.id;

        const ranked = findBestLookupMatch(
          raw,
          rows,
          (row) => [row.fullName, row.email].filter(Boolean) as string[],
          {
            autoResolveScore: 0.91,
            ambiguityGap: 0.05,
            minSuggestionScore: 0.58,
            suggestionLimit: 5,
          },
        );

        if (ranked.match) {
          return ranked.match.item.id;
        }

        throw buildNoMatchError(
          raw,
          paramName,
          ranked.suggestions.map((item) =>
            formatSuggestion(
              `${item.item.fullName}${item.item.email ? ` — ${item.item.email}` : ""}`,
              item.score,
            ),
          ),
        );
      }

      if (paramName === "jobId") {
        const rows = await services.listJobs(ctx.userId);
        const exactMatch =
          rows.find((r) => normalizeLookupText(r.title ?? "") === needle) ??
          rows.find((r) => normalizeLookupText(r.title ?? "").includes(needle));

        if (exactMatch) return exactMatch.id;

        const ranked = findBestLookupMatch(
          raw,
          rows,
          (row) =>
            [row.title, row.seniority, row.businessUnit]
              .filter(Boolean)
              .map((item) => String(item)),
          {
            autoResolveScore: 0.9,
            ambiguityGap: 0.05,
            minSuggestionScore: 0.6,
            suggestionLimit: 5,
          },
        );

        if (ranked.match) {
          return ranked.match.item.id;
        }

        throw buildNoMatchError(
          raw,
          paramName,
          ranked.suggestions.map((item) =>
            formatSuggestion(
              `${item.item.title}${item.item.seniority ? ` — ${item.item.seniority}` : ""}`,
              item.score,
            ),
          ),
        );
      }

      if (paramName === "cvId") {
        const rows = await services.listCvPool(ctx.userId);
        const exactMatch =
          rows.find(
            (r) => normalizeLookupText(r.extractedName ?? "") === needle,
          ) ??
          rows.find((r) =>
            normalizeLookupText(r.extractedName ?? "").includes(needle),
          ) ??
          rows.find((r) =>
            normalizeLookupText(r.filename ?? "").includes(needle),
          );

        if (exactMatch) return exactMatch.id;

        const ranked = findBestLookupMatch(
          raw,
          rows,
          (row) =>
            [row.extractedName, row.filename, row.extractedEmail]
              .filter(Boolean)
              .map((item) => String(item)),
          {
            autoResolveScore: 0.91,
            ambiguityGap: 0.05,
            minSuggestionScore: 0.58,
            suggestionLimit: 5,
          },
        );

        if (ranked.match) {
          return ranked.match.item.id;
        }

        throw buildNoMatchError(
          raw,
          paramName,
          ranked.suggestions.map((item) =>
            formatSuggestion(
              `${item.item.extractedName ?? item.item.filename}${item.item.extractedEmail ? ` — ${item.item.extractedEmail}` : ""}`,
              item.score,
            ),
          ),
        );
      }

      throw new Error(
        `Invalid ${paramName}: expected a UUID or non-negative index, got "${raw}"`,
      );
    }

    // --- Index-based lookup ---
    if (paramName === "cvId") {
      const rows = await services.listCvPool(ctx.userId);
      if (index >= rows.length) {
        throw new Error(
          `Invalid cvId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`,
        );
      }
      return rows[index].id;
    }

    if (paramName === "jobId") {
      const rows = await services.listJobs(ctx.userId);
      if (index >= rows.length) {
        throw new Error(
          `Invalid jobId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`,
        );
      }
      return rows[index].id;
    }

    if (paramName === "candidateId") {
      const rows = await services.getCandidatesForActor(ctx, {
        stages: ALL_CANDIDATE_STAGES,
      });
      if (index >= rows.length) {
        throw new Error(
          `Invalid candidateId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`,
        );
      }
      return rows[index].id;
    }

    const rows = await services.getTodayInterviews(ctx.userId);
    if (index >= rows.length) {
      throw new Error(
        `Invalid interviewId index ${index}. Available range for today's interviews is 0-${Math.max(rows.length - 1, 0)}.`,
      );
    }
    return rows[index].interviewId;
  };
}
