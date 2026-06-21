import { governanceAuditFilterSchema } from '../schemas';
import type {
  GovernanceAuditFilters,
  GovernanceAuditRow,
  GovernanceJsonValue,
} from './governance-types';

const SENSITIVE_KEYS = new Set([
  '_attachment',
  'attachment',
  'base64',
  'binarydata',
  'embedding',
  'password',
  'rawbytes',
  'rawhtml',
  'rawjson',
  'rawtext',
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'token',
]);

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_DEPTH = 8;

function normalizeSensitiveKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH - 1)}…`;
}

export function normalizeGovernanceFilters(input: unknown): GovernanceAuditFilters {
  return governanceAuditFilterSchema.parse(input) as GovernanceAuditFilters;
}

export function sanitizeGovernancePayload(
  value: unknown,
  depth = 0,
): GovernanceJsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeGovernancePayload(item, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`… ${value.length - MAX_ARRAY_ITEMS} more item(s) redacted from export`);
    }

    return items;
  }

  if (typeof value === 'object') {
    if (depth >= MAX_OBJECT_DEPTH) {
      return '[Max depth reached]';
    }

    const sanitized: Record<string, GovernanceJsonValue> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(normalizeSensitiveKey(key))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      sanitized[key] = sanitizeGovernancePayload(nestedValue, depth + 1);
    }

    return sanitized;
  }

  return String(value);
}

function csvCell(value: unknown): string {
  const raw =
    typeof value === 'string'
      ? value
      : value === null || value === undefined
        ? ''
        : JSON.stringify(value);

  return `"${raw.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

export function buildGovernanceAuditCsv(rows: GovernanceAuditRow[]): string {
  const header = [
    'id',
    'type',
    'status',
    'action_or_tool',
    'source',
    'summary',
    'actor_name',
    'actor_email',
    'candidate_id',
    'candidate_name',
    'candidate_email',
    'occurred_at',
    'detail',
  ];

  const lines = rows.map((row) =>
    [
      row.id,
      row.kind,
      row.status,
      row.action,
      row.source,
      row.summary,
      row.actorName,
      row.actorEmail,
      row.candidateId,
      row.candidateName,
      row.candidateEmail,
      row.occurredAtIso,
      row.detail,
    ]
      .map(csvCell)
      .join(','),
  );

  return [header.map(csvCell).join(','), ...lines].join('\n');
}
