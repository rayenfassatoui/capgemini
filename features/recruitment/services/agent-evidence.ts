import type {
  AgentEvidenceBlock,
  AgentEvidenceItem,
  AgentEvidenceMetadata,
  AgentNavigationLink,
  AgentSourceKind,
  AgentSourceReference,
  UserRole,
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

interface BuildAgentEvidenceOptions {
  role?: UserRole;
}

interface EvidenceContext {
  toolName: string;
  args?: Record<string, unknown>;
  role: UserRole;
}

interface ResolvedEntity {
  kind: 'activity' | 'candidate' | 'cv' | 'email' | 'interview' | 'job' | 'onboarding';
  id?: string;
  candidateId?: string;
  candidateStage?: string;
  cvId?: string;
  interviewId?: string;
  jobId?: string;
}

const MAX_SOURCES = 6;
const MAX_EVIDENCE_BLOCKS = 4;
const MAX_EVIDENCE_ITEMS = 5;
const MAX_TEXT_LENGTH = 140;

const ARRAY_EVIDENCE_KEYS = [
  'activities',
  'byBusinessUnit',
  'bySeniority',
  'byStatus',
  'candidates',
  'chunks',
  'citations',
  'comparedCandidates',
  'duplicates',
  'interviews',
  'items',
  'jobs',
  'languageDistribution',
  'logs',
  'matches',
  'monthlyHiringTrend',
  'mostCommonCvSkills',
  'mostDemandedJobProfiles',
  'notifications',
  'recentActivity',
  'results',
  'skillGapAnalysis',
  'tasks',
  'topRecruiters',
  'topSkills',
  'topSkillsDemand',
  'uploadTrend',
  'users',
  'usersByRole',
] as const;

const TITLE_KEYS = [
  'action',
  'candidateName',
  'displayName',
  'email',
  'entityType',
  'extractedName',
  'filename',
  'fullName',
  'jobTitle',
  'language',
  'name',
  'role',
  'seniority',
  'skill',
  'stage',
  'status',
  'subject',
  'title',
  'toEmail',
  'toName',
  'unit',
  'userName',
] as const;

const SCORE_KEYS = [
  'combinedScore',
  'finalScore',
  'keywordScore',
  'matchScore',
  'overallFit',
  'rrfScore',
  'score',
  'screeningScore',
  'semanticScore',
  'similarityScore',
] as const;

const SKILL_KEYS = [
  'candidateSkills',
  'extractedSkills',
  'matchedMustHave',
  'matchedNiceToHave',
  'skills',
] as const;

const DETAIL_ARGUMENT_KEYS = [
  'emailType',
  'query',
  'requestedName',
  'seniority',
  'stage',
  'status',
  'targetRoleQuery',
  'title',
] as const;

export function buildAgentEvidenceMetadata(
  records: AgentEvidenceToolRecord[],
  options: BuildAgentEvidenceOptions = {},
): AgentEvidenceMetadata {
  const role = options.role ?? 'ta';
  const sources: AgentSourceReference[] = [];
  const evidenceBlocks: AgentEvidenceBlock[] = [];

  for (
    let index = 0;
    index < records.length && sources.length < MAX_SOURCES;
    index += 1
  ) {
    const record = records[index];
    const source = buildSourceReference(record, index, role);
    sources.push(source);

    if (!record.result.success) {
      continue;
    }

    const evidenceItems = extractEvidenceItems(record.result.data, {
      toolName: record.toolName,
      args: record.args,
      role,
    })
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((item, itemIndex) => ({
        ...item,
        id: `${source.id}-item-${itemIndex}`,
      }));

    if (
      evidenceItems.length > 0 &&
      evidenceBlocks.length < MAX_EVIDENCE_BLOCKS
    ) {
      evidenceBlocks.push({
        id: `${source.id}-evidence`,
        sourceId: source.id,
        title: `${source.label} evidence`,
        items: evidenceItems,
      });
    }
  }

  const observedFacts = buildObservedEvidenceLinesFromSources(sources);
  const inferenceLimits = buildInferenceLimitLinesFromSources(
    sources,
    evidenceBlocks,
  );

  return {
    sources,
    evidenceBlocks,
    observedFacts,
    inferenceLimits,
  };
}

export function buildObservedEvidenceLines(
  records: AgentEvidenceToolRecord[],
  options: BuildAgentEvidenceOptions = {},
): string[] {
  return buildAgentEvidenceMetadata(records, options).observedFacts;
}

export function buildInferenceLimitLines(
  records: AgentEvidenceToolRecord[],
  options: BuildAgentEvidenceOptions = {},
): string[] {
  return buildAgentEvidenceMetadata(records, options).inferenceLimits;
}

const FRIENDLY_TOOL_LABELS: Record<string, string> = {
  semantic_search_cvs: 'CV similarity search',
  rag_search_cvs: 'CV knowledge search',
  hybrid_search_cvs: 'Job-fit CV search',
  search_cv_pool: 'CV pool search',
  list_cv_pool: 'CV pool',
  get_cv_details: 'CV profile details',
  get_candidates_by_stage: 'Candidate stage list',
  get_candidates_by_job: 'Job candidate list',
  get_candidate: 'Candidate profile',
  compare_candidates: 'Candidate comparison',
  direct_named_search: 'Named candidate search',
  direct_compare_candidates: 'Candidate comparison',
  match_cvs_to_job: 'Job match scoring',
  match_cvs_to_job_with_filters: 'Filtered job match scoring',
  get_dashboard_stats: 'Recruitment dashboard',
  get_smart_insights: 'Recruitment insights',
  get_cv_pool_stats: 'CV pool analytics',
  get_jobs_stats: 'Job analytics',
};

export function formatToolEvidenceLabel(toolName: string): string {
  const friendlyLabel = FRIENDLY_TOOL_LABELS[toolName];
  if (friendlyLabel) return friendlyLabel;

  return toolName
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function buildSourceReference(
  record: AgentEvidenceToolRecord,
  index: number,
  role: UserRole,
): AgentSourceReference {
  const label = formatToolEvidenceLabel(record.toolName);
  const count = record.result.success
    ? countToolItems(record.result.data)
    : undefined;
  const context: EvidenceContext = {
    toolName: record.toolName,
    args: record.args,
    role,
  };

  return {
    id: `${record.toolName}-${index}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
    label,
    kind: inferSourceKind(record.toolName),
    tool: record.toolName,
    status: record.result.success ? 'success' : 'error',
    detail: buildSourceDetail(record),
    count,
    link: buildSourceLink(record.result.data, context),
  };
}

function inferSourceKind(toolName: string): AgentSourceKind {
  if (/dashboard|stats|insights|analytics|funnel|metric/i.test(toolName)) {
    return 'analytics';
  }
  if (/candidate|screening|stage/i.test(toolName)) return 'candidate';
  if (/cv|resume|rag|semantic/i.test(toolName)) return 'cv';
  if (/job|requirement|template/i.test(toolName)) return 'job';
  if (/interview|calendar|debrief|scorecard/i.test(toolName)) {
    return 'interview';
  }
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

  return record.result.success
    ? 'Role-scoped tool output'
    : 'Tool did not return usable evidence';
}

function buildDetailFromArgs(
  args: Record<string, unknown> | undefined,
): string | undefined {
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
    const count =
      typeof source.count === 'number'
        ? ` (${source.count} item${source.count === 1 ? '' : 's'})`
        : '';
    const detail = source.detail ? ` — ${source.detail}` : '';
    return `${source.label} ${status}${count}${detail}.`;
  });
}

function buildInferenceLimitLinesFromSources(
  sources: AgentSourceReference[],
  evidenceBlocks: AgentEvidenceBlock[],
): string[] {
  const successfulSources = sources.filter(
    (source) => source.status === 'success',
  );
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
    limits.push(
      'No row-level evidence was returned, so conclusions should stay at summary level.',
    );
  }

  if (failedSources > 0) {
    limits.push(
      `${failedSources} failed tool result${failedSources === 1 ? '' : 's'} ${failedSources === 1 ? 'was' : 'were'} excluded from factual claims.`,
    );
  }

  return limits;
}

function countToolItems(data: unknown): number | undefined {
  if (Array.isArray(data)) return data.length;
  if (!isRecord(data)) return undefined;

  const total = readNumber(data, [
    'count',
    'total',
    'totalUsers',
    'totalCandidates',
    'totalCvs',
    'totalCvsInPool',
    'totalJobs',
    'totalInterviews',
    'totalResults',
  ]);
  if (typeof total === 'number') return total;

  for (const key of ARRAY_EVIDENCE_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) return value.length;
  }

  return undefined;
}

function hasCollection(data: unknown): boolean {
  if (Array.isArray(data)) return true;
  if (!isRecord(data)) return false;

  return ARRAY_EVIDENCE_KEYS.some(
    (key) => Array.isArray(data[key]) && data[key].length > 0,
  );
}

function buildSourceLink(
  data: unknown,
  context: EvidenceContext,
): AgentNavigationLink | undefined {
  const scopedSurfaceLink = buildScopedSurfaceLink(context);
  const surfaceLink = scopedSurfaceLink ?? buildSurfaceLink(context);
  if (hasCollection(data)) return surfaceLink;

  const entity =
    resolveEntityFromValue(data, context) ?? resolveEntityFromArgs(context);
  return buildEntityLink(entity, context.role, context.toolName) ?? surfaceLink;
}

function extractEvidenceItems(
  data: unknown,
  context: EvidenceContext,
): AgentEvidenceItem[] {
  if (data === null || data === undefined) return [];

  if (Array.isArray(data)) {
    return data
      .map((item) => summarizeEvidenceValue(item, context))
      .filter(isEvidenceItem);
  }

  if (!isRecord(data)) {
    const summary = summarizeEvidenceValue(data, context);
    return summary ? [summary] : [];
  }

  const directSummaries = summarizeMetricObject(data);
  if (directSummaries.length > 0 && !hasCollection(data)) {
    return directSummaries.map((text) => ({ text }));
  }

  for (const key of ARRAY_EVIDENCE_KEYS) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map((item) => summarizeEvidenceValue(item, context))
        .filter(isEvidenceItem);
    }
  }

  const summary = summarizeEvidenceRecord(data, context);
  return summary ? [summary] : [];
}

function summarizeMetricObject(value: Record<string, unknown>): string[] {
  const metricKeys = [
    'pendingScreenings',
    'totalCandidates',
    'totalCvs',
    'totalInterviewsToday',
    'totalJobs',
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

function summarizeEvidenceValue(
  value: unknown,
  context: EvidenceContext,
): AgentEvidenceItem | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return { text: clipText(value) };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value) };
  }
  if (Array.isArray(value)) {
    const nested = value
      .map((item) => summarizeEvidenceValue(item, context)?.text ?? null)
      .filter(isNonEmptyString);
    return nested.length > 0 ? { text: nested.slice(0, 3).join('; ') } : null;
  }
  if (isRecord(value)) return summarizeEvidenceRecord(value, context);
  return null;
}

function summarizeEvidenceRecord(
  value: Record<string, unknown>,
  context: EvidenceContext,
): AgentEvidenceItem | null {
  const nestedProfile = readNestedRecord(value, ['profile', 'candidate', 'job', 'cv']);
  if (nestedProfile) {
    const nestedSummary = summarizeEvidenceRecord(nestedProfile, context);
    if (nestedSummary) return nestedSummary;
  }

  const text =
    summarizeActivityRecord(value) ??
    summarizeEmailRecord(value) ??
    summarizeOnboardingRecord(value) ??
    summarizeGenericRecord(value);

  if (!text) return null;

  return {
    text,
    link: buildEntityLink(
      resolveEntityFromValue(value, context) ?? resolveEntityFromArgs(context),
      context.role,
      context.toolName,
    ),
  };
}

function summarizeActivityRecord(value: Record<string, unknown>): string | null {
  const action = readString(value, ['action']);
  const entityType = readString(value, ['entityType']);
  if (!action || !entityType) return null;

  const actor = readString(value, ['userName']) ?? 'Unknown actor';
  const details = readString(value, ['details']);
  const stage = readString(value, ['candidateStage']);
  const parts = [
    `${actor} — ${action} ${entityType}`,
    stage ? `stage: ${stage}` : null,
    details ? clipText(details) : null,
  ].filter(isNonEmptyString);

  return parts.join('; ');
}

function summarizeEmailRecord(value: Record<string, unknown>): string | null {
  const subject = readString(value, ['subject']);
  const recipient =
    readString(value, ['toName']) ?? readString(value, ['toEmail']);
  if (!subject || !recipient) return null;

  const status = readString(value, ['status']);
  const stage = readString(value, ['candidateStage']);
  const details = [
    `${clipText(subject)} — to ${clipText(recipient)}`,
    status ? `status: ${status}` : null,
    stage ? `stage: ${stage}` : null,
  ].filter(isNonEmptyString);

  return details.join('; ');
}

function summarizeOnboardingRecord(value: Record<string, unknown>): string | null {
  const candidateName = readString(value, ['candidateName']);
  const totalTasks = readNumber(value, ['totalTasks']);
  const completedTasks = readNumber(value, ['completedTasks']);
  if (!candidateName || totalTasks === undefined || completedTasks === undefined) {
    return null;
  }

  return `${candidateName} — onboarding ${completedTasks}/${totalTasks}; job: ${readString(value, ['jobTitle']) ?? 'unknown'}`;
}

function summarizeGenericRecord(value: Record<string, unknown>): string | null {
  const title = readString(value, TITLE_KEYS);
  const score = readNumber(value, SCORE_KEYS);
  const skills = readStringArray(value, SKILL_KEYS).slice(0, 4);
  const status = readString(value, ['candidateStage', 'decision', 'stage', 'status']);
  const count = readNumber(value, [
    'count',
    'demand',
    'experienceCount',
    'extractedExperiences',
    'supply',
  ]);

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

function resolveEntityFromValue(
  value: unknown,
  context: EvidenceContext,
): ResolvedEntity | undefined {
  if (!isRecord(value)) return undefined;

  const nestedProfile = readNestedRecord(value, ['profile', 'candidate', 'job', 'cv']);
  if (nestedProfile) {
    const nestedEntity = resolveEntityFromValue(nestedProfile, context);
    if (nestedEntity) return nestedEntity;
  }

  if (isAdminActivityRecord(value, context.toolName)) {
    const id = readString(value, ['id']);
    if (id) return { kind: 'activity', id };
  }

  if (isAdminEmailRecord(value, context.toolName)) {
    const id = readString(value, ['id']);
    if (id) return { kind: 'email', id };
  }

  if (isOnboardingRecord(value, context.toolName)) {
    const candidateId = readString(value, ['candidateId']);
    if (candidateId) return { kind: 'onboarding', candidateId };
  }

  const candidateId = readString(value, ['candidateId']);
  const jobId = readString(value, ['jobId']);
  const cvId = readString(value, ['cvId']);
  const interviewId = readString(value, ['interviewId']);
  const id = readString(value, ['id']);
  const stage = readString(value, ['candidateStage', 'stage']);

  if (candidateId) {
    return {
      kind: 'candidate',
      candidateId,
      candidateStage: stage,
      cvId,
      jobId,
    };
  }

  if (interviewId) {
    return {
      kind: 'interview',
      interviewId,
      candidateId,
      candidateStage: stage,
      jobId,
    };
  }

  if (/interview|calendar/i.test(context.toolName) && id) {
    return {
      kind: 'interview',
      interviewId: id,
      candidateId,
      candidateStage: stage,
      jobId,
    };
  }

  if (cvId) {
    return { kind: 'cv', cvId };
  }

  if (jobId) {
    return { kind: 'job', jobId };
  }

  if (/candidate/i.test(context.toolName) && id) {
    return {
      kind: 'candidate',
      candidateId: id,
      candidateStage: stage,
      jobId,
      cvId,
    };
  }

  if (/cv|resume|search|match|compare/i.test(context.toolName) && id) {
    const hasCvIdentity =
      Boolean(readString(value, ['candidateName', 'extractedName', 'filename'])) ||
      Array.isArray(value.extractedSkills);
    if (hasCvIdentity) {
      return { kind: 'cv', cvId: id };
    }
  }

  if (/job|requirement|template/i.test(context.toolName) && id) {
    const hasJobIdentity = Boolean(readString(value, ['title', 'jobTitle']));
    if (hasJobIdentity) {
      return { kind: 'job', jobId: id };
    }
  }

  return undefined;
}

function resolveEntityFromArgs(
  context: EvidenceContext,
): ResolvedEntity | undefined {
  const args = context.args;
  if (!args) return undefined;

  const candidateId = readString(args, ['candidateId']);
  const jobId = readString(args, ['jobId']);
  const cvId = readString(args, ['cvId']);
  const interviewId = readString(args, ['interviewId']);
  const stage = readString(args, ['candidateStage', 'stage']);

  if (candidateId) {
    return {
      kind: 'candidate',
      candidateId,
      candidateStage: stage,
      cvId,
      jobId,
    };
  }

  if (interviewId) {
    return {
      kind: 'interview',
      interviewId,
      candidateId,
      candidateStage: stage,
      jobId,
    };
  }

  if (cvId) return { kind: 'cv', cvId };
  if (jobId) return { kind: 'job', jobId };

  return undefined;
}

function buildEntityLink(
  entity: ResolvedEntity | undefined,
  role: UserRole,
  toolName: string,
): AgentNavigationLink | undefined {
  if (!entity) return undefined;

  if (entity.kind === 'activity') {
    return entity.id
      ? { href: `/admin/activity?activityId=${entity.id}`, label: 'Open audit row' }
      : { href: '/admin/activity', label: 'Open audit' };
  }

  if (entity.kind === 'email') {
    return entity.id
      ? { href: `/admin/emails?emailId=${entity.id}`, label: 'Open email log' }
      : { href: '/admin/emails', label: 'Open email audit' };
  }

  if (entity.kind === 'onboarding') {
    return entity.candidateId
      ? {
          href: `/admin/onboarding?candidateId=${entity.candidateId}`,
          label: 'Open onboarding row',
        }
      : { href: '/admin/onboarding', label: 'Open onboarding' };
  }

  if (entity.kind === 'cv') {
    return entity.cvId
      ? { href: `/ta/cv-pool?reviewCvId=${entity.cvId}`, label: 'Open CV' }
      : { href: '/ta/cv-pool', label: 'Open CV pool' };
  }

  if (entity.kind === 'job') {
    if (entity.jobId) {
      const tab = /match/i.test(toolName) ? '?tab=cv-matching' : '';
      return { href: `/ta/jobs/${entity.jobId}${tab}`, label: 'Open job' };
    }
    return { href: '/ta/jobs', label: 'Open jobs' };
  }

  if (entity.kind === 'interview') {
    if ((role === 'manager' || role === 'admin') && entity.candidateId && isManagerStage(entity.candidateStage)) {
      return {
        href: `/manager/candidates/${entity.candidateId}`,
        label: 'Open candidate',
      };
    }

    if ((role === 'hr' || role === 'admin') && entity.candidateId && isHrStage(entity.candidateStage)) {
      return { href: `/hr/candidates/${entity.candidateId}`, label: 'Open candidate' };
    }

    if (entity.jobId) {
      const params = new URLSearchParams({ tab: 'interviews' });
      if (entity.candidateId) params.set('candidateId', entity.candidateId);
      return {
        href: `/ta/jobs/${entity.jobId}?${params.toString()}`,
        label: 'Open interview workflow',
      };
    }

    return { href: '/ta/calendar', label: 'Open calendar' };
  }

  if (entity.kind === 'candidate') {
    if (role === 'manager' || isManagerStage(entity.candidateStage)) {
      return entity.candidateId
        ? { href: `/manager/candidates/${entity.candidateId}`, label: 'Open candidate' }
        : undefined;
    }

    if (role === 'hr' || isHrStage(entity.candidateStage)) {
      return entity.candidateId
        ? { href: `/hr/candidates/${entity.candidateId}`, label: 'Open candidate' }
        : undefined;
    }

    if (entity.jobId && entity.candidateId) {
      const params = new URLSearchParams({
        tab: 'candidates',
        candidateId: entity.candidateId,
      });
      return {
        href: `/ta/jobs/${entity.jobId}?${params.toString()}`,
        label: 'Open candidate',
      };
    }

    if (entity.cvId) {
      return { href: `/ta/cv-pool?reviewCvId=${entity.cvId}`, label: 'Open CV' };
    }
  }

  return undefined;
}

function buildScopedSurfaceLink(
  context: EvidenceContext,
): AgentNavigationLink | undefined {
  const argsEntity = resolveEntityFromArgs(context);
  if (!argsEntity) return undefined;

  if (argsEntity.jobId && /match/i.test(context.toolName)) {
    return {
      href: `/ta/jobs/${argsEntity.jobId}?tab=cv-matching`,
      label: 'Open matching workflow',
    };
  }

  if (argsEntity.jobId && /candidate|stage/i.test(context.toolName)) {
    return {
      href: `/ta/jobs/${argsEntity.jobId}?tab=candidates`,
      label: 'Open candidates',
    };
  }

  if (
    argsEntity.jobId &&
    /interview|calendar|report|question/i.test(context.toolName)
  ) {
    return {
      href: `/ta/jobs/${argsEntity.jobId}?tab=interviews`,
      label: 'Open interviews',
    };
  }

  return buildEntityLink(argsEntity, context.role, context.toolName);
}

function buildSurfaceLink(
  context: EvidenceContext,
): AgentNavigationLink | undefined {
  const toolName = context.toolName;
  const role = context.role;

  if (/activity/i.test(toolName)) {
    return { href: '/admin/activity', label: 'Open audit' };
  }
  if (/email/i.test(toolName)) {
    return { href: '/admin/emails', label: 'Open email audit' };
  }
  if (/onboarding/i.test(toolName)) {
    return { href: '/admin/onboarding', label: 'Open onboarding' };
  }
  if (/system_overview/i.test(toolName)) {
    return { href: '/admin/dashboard', label: 'Open dashboard' };
  }
  if (/recruitment_analytics/i.test(toolName)) {
    return { href: '/admin/analytics', label: 'Open analytics' };
  }
  if (/cv_pool_stats/i.test(toolName) || /cv|resume/i.test(toolName)) {
    return { href: '/ta/cv-pool', label: 'Open CV pool' };
  }
  if (/jobs_stats/i.test(toolName) || /job|requirement|template/i.test(toolName)) {
    return { href: '/ta/jobs', label: 'Open jobs' };
  }
  if (/dashboard_stats|smart_insights/i.test(toolName)) {
    if (role === 'manager') return { href: '/manager/dashboard', label: 'Open dashboard' };
    if (role === 'hr') return { href: '/hr/dashboard', label: 'Open dashboard' };
    if (role === 'admin') return { href: '/admin/dashboard', label: 'Open dashboard' };
    return { href: '/ta/dashboard', label: 'Open dashboard' };
  }
  if (/candidate|screening|match|compare/i.test(toolName)) {
    return role === 'manager'
      ? { href: '/manager/candidates', label: 'Open candidates' }
      : role === 'hr'
        ? { href: '/hr/candidates', label: 'Open candidates' }
        : { href: '/ta/jobs', label: 'Open candidate workflow' };
  }
  if (/interview|calendar|debrief|scorecard/i.test(toolName)) {
    return role === 'manager'
      ? { href: '/manager/dashboard', label: 'Open interview workspace' }
      : role === 'hr'
        ? { href: '/hr/dashboard', label: 'Open interview workspace' }
        : { href: '/ta/calendar', label: 'Open calendar' };
  }

  return undefined;
}

function isManagerStage(stage: string | undefined): boolean {
  return typeof stage === 'string' && /^manager_|^hr_|^hired$/i.test(stage);
}

function isHrStage(stage: string | undefined): boolean {
  return typeof stage === 'string' && /^hr_|^hired$/i.test(stage);
}

function isAdminActivityRecord(
  value: Record<string, unknown>,
  toolName: string,
): boolean {
  return (
    /activity/i.test(toolName) ||
    ('action' in value && 'entityType' in value && 'userName' in value)
  );
}

function isAdminEmailRecord(
  value: Record<string, unknown>,
  toolName: string,
): boolean {
  return /email/i.test(toolName) || ('subject' in value && 'toEmail' in value);
}

function isOnboardingRecord(
  value: Record<string, unknown>,
  toolName: string,
): boolean {
  return (
    /onboarding/i.test(toolName) ||
    ('candidateName' in value && 'totalTasks' in value && 'completedTasks' in value)
  );
}

function readNestedRecord(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const nested = value[key];
    if (isRecord(nested)) return nested;
  }
  return undefined;
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

function isEvidenceItem(
  value: AgentEvidenceItem | null,
): value is AgentEvidenceItem {
  return Boolean(value && value.text);
}
