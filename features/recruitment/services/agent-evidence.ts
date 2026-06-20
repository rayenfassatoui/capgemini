import type {
  AgentEvidenceBlock,
  AgentEvidenceMetadata,
  AgentSourceKind,
  AgentSourceReference,
} from '../types';

export interface AgentEvidenceToolRecord {
  toolName: string;
  args?: Record<string, unknown>;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  mutating?: boolean;
}

const MAX_SOURCES = 6;
const MAX_EVIDENCE_BLOCKS = 4;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_TEXT_LENGTH = 140;

const ARRAY_EVIDENCE_KEYS = [
  'results',
  'candidates',
  'comparedCandidates',
  'matches',
  'items',
  'jobs',
  'interviews',
  'notifications',
  'activities',
  'logs',
  'users',
  'duplicates',
  'citations',
  'chunks',
  'topSkills',
  'languageDistribution',
  'uploadTrend',
  'bySeniority',
  'byStatus',
  'byBusinessUnit',
  'topSkillsDemand',
  'mostDemandedJobProfiles',
  'mostCommonCvSkills',
  'skillGapAnalysis',
] as const;

const TITLE_KEYS = [
  'candidateName',
  'extractedName',
  'displayName',
  'fullName',
  'name',
  'title',
  'jobTitle',
  'filename',
  'subject',
  'email',
  'stage',
  'status',
  'skill',
  'language',
  'unit',
  'seniority',
] as const;

const SCORE_KEYS = [
  'matchScore',
  'similarityScore',
  'rrfScore',
  'finalScore',
  'score',
  'overallFit',
  'screeningScore',
  'combinedScore',
  'keywordScore',
  'semanticScore',
] as const;

const SKILL_KEYS = [
  'matchedMustHave',
  'matchedNiceToHave',
  'extractedSkills',
  'candidateSkills',
  'skills',
] as const;

const DETAIL_ARGUMENT_KEYS = [
  'query',
  'requestedName',
  'targetRoleQuery',
  'title',
  'stage',
  'seniority',
  'emailType',
  'status',
] as const;

export function buildAgentEvidenceMetadata(
  records: AgentEvidenceToolRecord[],
): AgentEvidenceMetadata {
  const sources: AgentSourceReference[] = [];
  const evidenceBlocks: AgentEvidenceBlock[] = [];

  for (let index = 0; index < records.length && sources.length < MAX_SOURCES; index += 1) {
    const record = records[index];
    const source = buildSourceReference(record, index);
    sources.push(source);

    if (!record.result.success) {
      continue;
    }

    const evidenceItems = extractEvidenceItems(record.result.data).slice(
      0,
      MAX_EVIDENCE_ITEMS,
    );

    if (evidenceItems.length > 0 && evidenceBlocks.length < MAX_EVIDENCE_BLOCKS) {
      evidenceBlocks.push({
        id: `${source.id}-evidence`,
        sourceId: source.id,
        title: `${source.label} evidence`,
        items: evidenceItems,
      });
    }
  }

  const observedFacts = buildObservedEvidenceLinesFromSources(sources);
  const inferenceLimits = buildInferenceLimitLinesFromSources(sources, evidenceBlocks);

  return {
    sources,
    evidenceBlocks,
    observedFacts,
    inferenceLimits,
  };
}

export function buildObservedEvidenceLines(
  records: AgentEvidenceToolRecord[],
): string[] {
  return buildAgentEvidenceMetadata(records).observedFacts;
}

export function buildInferenceLimitLines(
  records: AgentEvidenceToolRecord[],
): string[] {
  return buildAgentEvidenceMetadata(records).inferenceLimits;
}

export function formatToolEvidenceLabel(toolName: string): string {
  return toolName
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function buildSourceReference(
  record: AgentEvidenceToolRecord,
  index: number,
): AgentSourceReference {
  const label = formatToolEvidenceLabel(record.toolName);
  const count = record.result.success ? countToolItems(record.result.data) : undefined;

  return {
    id: `${record.toolName}-${index}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
    label,
    kind: inferSourceKind(record.toolName),
    tool: record.toolName,
    status: record.result.success ? 'success' : 'error',
    detail: buildSourceDetail(record),
    count,
  };
}

function inferSourceKind(toolName: string): AgentSourceKind {
  if (/dashboard|stats|insights|analytics|funnel|metric/i.test(toolName)) {
    return 'analytics';
  }
  if (/candidate|screening|stage/i.test(toolName)) return 'candidate';
  if (/cv|resume|rag|semantic/i.test(toolName)) return 'cv';
  if (/job|requirement|template/i.test(toolName)) return 'job';
  if (/interview|calendar|debrief|scorecard/i.test(toolName)) return 'interview';
  if (/onboarding/i.test(toolName)) return 'onboarding';
  if (/create|update|delete|assign|schedule|send|toggle|bulk/i.test(toolName)) {
    return 'operation';
  }
  if (/search|match|compare|rank/i.test(toolName)) return 'search';
  if (/admin|activity|user|notification|email/i.test(toolName)) return 'system';
  return 'tool';
}

function buildSourceDetail(record: AgentEvidenceToolRecord): string | undefined {
  const detailFromArgs = buildDetailFromArgs(record.args);
  if (detailFromArgs) return detailFromArgs;

  if (!record.result.success && record.result.error) {
    return clipText(record.result.error);
  }

  const count = countToolItems(record.result.data);
  if (typeof count === 'number') {
    return `${count} accessible record${count === 1 ? '' : 's'}`;
  }

  return record.result.success ? 'Role-scoped tool output' : 'Tool did not return usable evidence';
}

function buildDetailFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;

  for (const key of DETAIL_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      return `${formatArgumentName(key)}: ${clipText(value.trim())}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${formatArgumentName(key)}: ${value}`;
    }
  }

  return undefined;
}

function formatArgumentName(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function buildObservedEvidenceLinesFromSources(
  sources: AgentSourceReference[],
): string[] {
  if (sources.length === 0) {
    return ['No role-scoped source was fetched for this response.'];
  }

  return sources.map((source) => {
    const status = source.status === 'success' ? 'returned' : 'failed';
    const count = typeof source.count === 'number' ? ` (${source.count} item${source.count === 1 ? '' : 's'})` : '';
    const detail = source.detail ? ` — ${source.detail}` : '';
    return `${source.label} ${status}${count}${detail}.`;
  });
}

function buildInferenceLimitLinesFromSources(
  sources: AgentSourceReference[],
  evidenceBlocks: AgentEvidenceBlock[],
): string[] {
  const successfulSources = sources.filter((source) => source.status === 'success');
  const failedSources = sources.length - successfulSources.length;

  if (successfulSources.length === 0) {
    return [
      'No successful live recruitment source was available, so the answer must stay limited to the user prompt and role rules.',
      'Fetch a concrete CV, job, candidate, or analytics source before making a hiring recommendation.',
    ];
  }

  const limits = [
    'Recommendations are synthesized from the observed sources above; they are not separate database facts.',
  ];

  if (evidenceBlocks.length === 0) {
    limits.push('No row-level evidence was returned, so conclusions should stay at summary level.');
  }

  if (failedSources > 0) {
    limits.push(`${failedSources} failed tool result${failedSources === 1 ? '' : 's'} ${failedSources === 1 ? 'was' : 'were'} excluded from factual claims.`);
  }

  return limits;
}

function countToolItems(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (!isRecord(data)) return undefined;

  for (const key of ARRAY_EVIDENCE_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) return value.length;
  }

  const total = readNumber(data, ['totalResults', 'total', 'count', 'totalCvs', 'totalJobs', 'totalCandidates']);
  return total;
}

function extractEvidenceItems(data: unknown): string[] {
  if (data === null || data === undefined) return [];

  if (Array.isArray(data)) {
    return data.map(summarizeEvidenceValue).filter(isNonEmptyString);
  }

  if (!isRecord(data)) {
    const summary = summarizeEvidenceValue(data);
    return summary ? [summary] : [];
  }

  const directSummaries = summarizeMetricObject(data);
  if (directSummaries.length > 0) {
    return directSummaries;
  }

  for (const key of ARRAY_EVIDENCE_KEYS) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.map(summarizeEvidenceValue).filter(isNonEmptyString);
    }
  }

  const summary = summarizeEvidenceRecord(data);
  return summary ? [summary] : [];
}

function summarizeMetricObject(value: Record<string, unknown>): string[] {
  const metricKeys = [
    'totalCandidates',
    'totalJobs',
    'totalInterviewsToday',
    'pendingScreenings',
    'totalCvs',
  ] as const;

  const metrics: string[] = [];
  for (const key of metricKeys) {
    const metric = value[key];
    if (typeof metric === 'number' && Number.isFinite(metric)) {
      metrics.push(`${formatArgumentName(key)}: ${metric}`);
    }
  }

  return metrics;
}

function summarizeEvidenceValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clipText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const nested = value.map(summarizeEvidenceValue).filter(isNonEmptyString);
    return nested.length > 0 ? nested.slice(0, 3).join('; ') : null;
  }
  if (isRecord(value)) return summarizeEvidenceRecord(value);
  return null;
}

function summarizeEvidenceRecord(value: Record<string, unknown>): string | null {
  const title = readString(value, TITLE_KEYS);
  const score = readNumber(value, SCORE_KEYS);
  const skills = readStringArray(value, SKILL_KEYS).slice(0, 4);
  const status = readString(value, ['status', 'stage', 'decision'] as const);
  const count = readNumber(value, ['count', 'demand', 'supply', 'experienceCount', 'extractedExperiences'] as const);

  const details: string[] = [];
  if (typeof score === 'number') details.push(`score ${formatScore(score)}`);
  if (skills.length > 0) details.push(`skills: ${skills.join(', ')}`);
  if (status && status !== title) details.push(`status: ${status}`);
  if (typeof count === 'number') details.push(`count ${count}`);

  if (title) {
    return details.length > 0
      ? `${clipText(title)} — ${details.join('; ')}`
      : clipText(title);
  }

  if (details.length > 0) return details.join('; ');

  const scalarPairs = Object.entries(value)
    .filter(([key]) => !/id|raw|base64|content|embedding/i.test(key))
    .flatMap(([key, nestedValue]) => {
      if (
        typeof nestedValue === 'string' ||
        typeof nestedValue === 'number' ||
        typeof nestedValue === 'boolean'
      ) {
        return [`${formatArgumentName(key)}: ${String(nestedValue)}`];
      }
      return [];
    })
    .slice(0, 3);

  return scalarPairs.length > 0 ? clipText(scalarPairs.join('; ')) : null;
}

function readString<K extends readonly string[]>(
  value: Record<string, unknown>,
  keys: K,
): string | undefined {
  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return undefined;
}

function readNumber<K extends readonly string[]>(
  value: Record<string, unknown>,
  keys: K,
): number | undefined {
  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  return undefined;
}

function readStringArray<K extends readonly string[]>(
  value: Record<string, unknown>,
  keys: K,
): string[] {
  const strings: string[] = [];
  for (const key of keys) {
    const nested = value[key];
    if (!Array.isArray(nested)) continue;
    for (const item of nested) {
      if (typeof item === 'string' && item.trim()) {
        strings.push(item.trim());
      }
    }
  }
  return Array.from(new Set(strings));
}

function formatScore(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function clipText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_TEXT_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}
