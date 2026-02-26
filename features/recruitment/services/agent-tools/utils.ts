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

export function sanitizeForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  if (typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>
    )) {
      if (key === 'rawBytes' || key === 'rawText') continue;
      clean[key] = sanitizeForJson(value);
    }
    return clean;
  }
  return obj;
}

export function truncateArray(arr: unknown[], max: number): unknown[] {
  if (arr.length <= max) return arr;
  return [
    ...arr.slice(0, max),
    `... and ${arr.length - max} more items (${arr.length} total)`,
  ];
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
