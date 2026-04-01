import type { CandidateStage } from '../../types';
import type { AgentToolContext } from './types';

type Services = typeof import('../index');

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALL_CANDIDATE_STAGES: CandidateStage[] = [
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'ta_rejected',
  'manager_interview',
  'manager_accepted',
  'manager_rejected',
  'hr_interview',
  'hr_accepted',
  'hr_rejected',
  'hired',
];

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
  'rawBytes',
  'rawText',
  'embedding',
  'rawHtml',
  'rawJson',
  'base64',
  'binaryData',
]);

/** Fields to truncate more aggressively (long text fields) */
const TRUNCATE_FIELDS = new Set([
  'description',
  'summary',
  'extractedSummary',
  'aiRecommendation',
  'recommendation',
  'content',
  'notes',
  'body',
]);

/**
 * Truncate a string to max length with ellipsis indicator
 */
function truncateString(str: string, maxLen: number = MAX_STRING_LENGTH): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
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
    const sanitized = obj.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForJson(item, depth + 1));
    if (obj.length > MAX_ARRAY_ITEMS) {
      sanitized.push(`... and ${obj.length - MAX_ARRAY_ITEMS} more items (${obj.length} total)`);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return truncateString(obj);
  }
  
  if (typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip fields that should be stripped entirely
      if (STRIP_FIELDS.has(key)) continue;
      
      // Truncate known long text fields more aggressively
      if (TRUNCATE_FIELDS.has(key) && typeof value === 'string') {
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
  options: { maxItems?: number; includeSummary?: boolean } = {}
): unknown {
  const { maxItems = 15, includeSummary = true } = options;
  
  // Handle arrays - add summary for large lists
  if (Array.isArray(result)) {
    const total = result.length;
    const truncated = result.slice(0, maxItems).map((item) => sanitizeForJson(item));
    
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
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const compacted: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        compacted[key] = compactToolResult(value, { maxItems, includeSummary: false });
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
    paramName: 'cvId' | 'jobId' | 'candidateId' | 'interviewId'
  ): Promise<string> => {
    const raw = String(value ?? '').trim();
    if (UUID_RE.test(raw)) return raw;

    const index = Number(raw);
    const isIndex = Number.isInteger(index) && index >= 0;

    // --- Name-based lookup when value is a non-numeric string ---
    if (!isIndex) {
      const needle = raw.toLowerCase();

      if (paramName === 'candidateId') {
        const rows = await services.getCandidatesByStage(ALL_CANDIDATE_STAGES);
        const match =
          rows.find((r) => (r.fullName ?? '').toLowerCase() === needle) ??
          rows.find((r) => (r.fullName ?? '').toLowerCase().includes(needle));
        if (match) return match.id;
        throw new Error(
          `No candidate found matching "${raw}". Provide a UUID, index, or exact name.`
        );
      }

      if (paramName === 'jobId') {
        const rows = await services.listJobs(ctx.userId);
        const match =
          rows.find((r) => (r.title ?? '').toLowerCase() === needle) ??
          rows.find((r) => (r.title ?? '').toLowerCase().includes(needle));
        if (match) return match.id;
        throw new Error(
          `No job found matching "${raw}". Provide a UUID, index, or exact title.`
        );
      }

      if (paramName === 'cvId') {
        const rows = await services.listCvPool(ctx.userId);
        const match =
          rows.find(
            (r) => (r.extractedName ?? '').toLowerCase() === needle
          ) ??
          rows.find((r) =>
            (r.extractedName ?? '').toLowerCase().includes(needle)
          ) ??
          rows.find((r) =>
            (r.filename ?? '').toLowerCase().includes(needle)
          );
        if (match) return match.id;
        throw new Error(
          `No CV found matching "${raw}". Provide a UUID, index, or candidate name.`
        );
      }

      throw new Error(
        `Invalid ${paramName}: expected a UUID or non-negative index, got "${raw}"`
      );
    }

    // --- Index-based lookup ---
    if (paramName === 'cvId') {
      const rows = await services.listCvPool(ctx.userId);
      if (index >= rows.length) {
        throw new Error(
          `Invalid cvId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
        );
      }
      return rows[index].id;
    }

    if (paramName === 'jobId') {
      const rows = await services.listJobs(ctx.userId);
      if (index >= rows.length) {
        throw new Error(
          `Invalid jobId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
        );
      }
      return rows[index].id;
    }

    if (paramName === 'candidateId') {
      const rows = await services.getCandidatesByStage(ALL_CANDIDATE_STAGES);
      if (index >= rows.length) {
        throw new Error(
          `Invalid candidateId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
        );
      }
      return rows[index].id;
    }

    const rows = await services.getTodayInterviews(ctx.userId);
    if (index >= rows.length) {
      throw new Error(
        `Invalid interviewId index ${index}. Available range for today's interviews is 0-${Math.max(rows.length - 1, 0)}.`
      );
    }
    return rows[index].interviewId;
  };
}
