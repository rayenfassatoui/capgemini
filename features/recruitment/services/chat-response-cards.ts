import * as z from 'zod/v3';

import type {
  RecruitmentResponseCard,
  RecruitmentResponseCardAction,
  RecruitmentResponseCardMetric,
  RecruitmentResponseCardTone,
  UserRole,
} from '../types';
import type { ToolExecutionRecord } from './statistics-chat-types';

interface BuildResponseCardsOptions {
  question?: string;
  role?: UserRole;
  locale?: "en" | "fr";
  maxCards?: number;
}

interface CandidateSummary {
  name: string;
  cvId?: string;
  candidateId?: string;
  score?: number;
  stage?: string;
  jobTitle?: string;
  owner?: string;
  skills: string[];
  gaps: string[];
  concerns: string[];
  alreadyAssigned?: boolean;
  sourceTool: string;
}

const DEFAULT_MAX_CARDS = 3;
const JOB_CARD_TOOL_NAMES: ReadonlySet<string> = new Set([
  'list_jobs',
  'get_job',
  'create_job',
  'close_job',
  'save_job_as_template',
  'list_job_templates',
  'create_job_from_template',
  'generate_job_description',
]);


const dashboardStatsSchema = z.object({
  totalCandidates: z.number().finite().nonnegative(),
  totalJobs: z.number().finite().nonnegative(),
  totalInterviewsToday: z.number().finite().nonnegative(),
  pendingScreenings: z.number().finite().nonnegative(),
  stageBreakdown: z.record(z.string(), z.number().finite().nonnegative()),
});

const smartInsightsSchema = z.object({
  mostDemandedJobProfiles: z.array(
    z.object({
      title: z.string(),
      count: z.number().finite().nonnegative(),
    }),
  ),
  mostCommonCvSkills: z.array(
    z.object({
      skill: z.string(),
      count: z.number().finite().nonnegative(),
    }),
  ),
  skillGapAnalysis: z.array(
    z.object({
      skill: z.string(),
      demand: z.number().finite().nonnegative(),
      supply: z.number().finite().nonnegative(),
    }),
  ),
  pipelineFunnel: z.record(z.string(), z.number().finite().nonnegative()),
});

const recordArraySchema = z.array(z.record(z.string(), z.unknown()));

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  ta_screening: 'TA Screening',
  ta_interview: 'TA Interview',
  ta_accepted: 'TA Accepted',
  ta_rejected: 'TA Rejected',
  manager_interview: 'Manager Interview',
  manager_accepted: 'Manager Accepted',
  manager_rejected: 'Manager Rejected',
  hr_interview: 'HR Interview',
  hr_accepted: 'HR Accepted',
  hr_rejected: 'HR Rejected',
  hired: 'Hired',
};

const FR_STAGE_LABELS: Readonly<Record<string, string>> = {
  new: 'Nouveau',
  ta_screening: 'Preselection TA',
  ta_interview: 'Entretien TA',
  ta_accepted: 'Accepte par TA',
  ta_rejected: 'Refuse par TA',
  manager_interview: 'Entretien manager',
  manager_accepted: 'Accepte par le manager',
  manager_rejected: 'Refuse par le manager',
  hr_interview: 'Entretien RH',
  hr_accepted: 'Accepte par les RH',
  hr_rejected: 'Refuse par les RH',
  hired: 'Embauche',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  return undefined;
}

function readCandidateOwner(record: Record<string, unknown>): string | undefined {
  const namedOwner = readString(record, [
    'ownerName',
    'assignedToName',
    'assignedManagerName',
    'assignedHrName',
    'assignedByName',
  ]);
  if (namedOwner) return namedOwner;
  if (readString(record, ['assignedHrId'])) return 'hr';
  if (readString(record, ['assignedManagerId'])) return 'manager';
  if (readString(record, ['assignedBy'])) return 'ta';
  return undefined;
}

function formatOwner(
  owner: string | undefined,
  locale: "en" | "fr",
): string | undefined {
  if (!owner) return undefined;
  if (owner === 'ta') return locale === "fr" ? "Responsable TA" : "TA assignee";
  if (owner === 'manager') {
    return locale === "fr" ? "Manager assigne" : "Manager assignee";
  }
  if (owner === 'hr') return locale === "fr" ? "Responsable RH" : "HR assignee";
  return owner;
}

function readNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function readBoolean(record: Record<string, unknown>, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }

  return undefined;
}

function readStringArray(record: Record<string, unknown>, keys: readonly string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;

    const strings = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    if (strings.length > 0) return strings;
  }

  return [];
}

function formatStage(
  value: string | undefined,
  locale: "en" | "fr" = "en",
): string | undefined {
  if (!value) return undefined;
  const labels = locale === "fr" ? FR_STAGE_LABELS : STAGE_LABELS;
  return labels[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScore(value: number): string {
  const normalized = value > 0 && value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function compactList(values: readonly string[], limit: number): string {
  return values.slice(0, limit).join(', ');
}

function pushUnique(values: string[], value: string | undefined) {
  if (!value || values.includes(value)) return;
  values.push(value);
}

function pushMetric(
  metrics: RecruitmentResponseCardMetric[],
  label: string,
  value: string | undefined,
  detail?: string,
  tone?: RecruitmentResponseCardTone,
) {
  if (!value) return;
  metrics.push({ label, value, ...(detail ? { detail } : {}), ...(tone ? { tone } : {}) });
}

function extractResultItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) return [];

  for (const key of ['matches', 'results', 'candidates', 'comparedCandidates', 'chunks', 'items']) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [data];
}

function chooseBestCandidateItem(items: readonly Record<string, unknown>[]): Record<string, unknown> | undefined {
  let best: Record<string, unknown> | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const score = readNumber(item, [
      'matchScore',
      'combinedScore',
      'finalScore',
      'screeningScore',
      'score',
      'similarityScore',
      'rrfScore',
      'semanticScore',
    ]);
    const comparableScore = score ?? 0;
    if (!best || comparableScore > bestScore) {
      best = item;
      bestScore = comparableScore;
    }
  }

  return best;
}

function summarizeCandidate(record: ToolExecutionRecord): CandidateSummary | null {
  if (!record.result.success) return null;
  if (!/(candidate|cv|resume|search|match|screening|compare)/i.test(record.toolName)) {
    return null;
  }

  const best = chooseBestCandidateItem(extractResultItems(record.result.data));
  if (!best) return null;

  const name = readString(best, [
    'candidateName',
    'extractedName',
    'fullName',
    'name',
    'filename',
    'cvFilename',
  ]);
  if (!name) return null;

  const skills = readStringArray(best, [
    'matchedMustHave',
    'matchedNiceToHave',
    'candidateSkills',
    'extractedSkills',
    'skills',
  ]);
  const gaps = readStringArray(best, ['gaps', 'missingSkills']);
  const concerns = readStringArray(best, ['aiConcerns', 'concerns', 'riskFlags']);
  const fallbackId = readString(best, ['id']);
  const candidateId =
    readString(best, ['candidateId']) ??
    (/candidate|screening/i.test(record.toolName) ? fallbackId : undefined);
  const cvId =
    readString(best, ['cvId']) ??
    (/cv|resume|search|match|rag|semantic|hybrid/i.test(record.toolName)
      ? fallbackId
      : undefined);


  return {
    name,
    cvId,
    candidateId,
    score: readNumber(best, [
      'matchScore',
      'combinedScore',
      'finalScore',
      'screeningScore',
      'score',
      'similarityScore',
      'rrfScore',
    ]),
    stage: readString(best, ['candidateStage', 'stage', 'status']),
    jobTitle: readString(best, ['jobTitle', 'title']),
    owner: readCandidateOwner(best),
    skills,
    gaps,
    concerns,
    alreadyAssigned: readBoolean(best, ['alreadyAssigned']),
    sourceTool: record.toolName,
  };
}

function candidateDetailLink(
  candidate: CandidateSummary,
  role: UserRole,
  locale: "en" | "fr",
): RecruitmentResponseCardAction | null {
  const openCandidate = locale === "fr" ? "Ouvrir le candidat" : "Open candidate";
  if (candidate.candidateId && role === 'manager') {
    return { label: openCandidate, href: `/manager/candidates/${candidate.candidateId}` };
  }

  if (candidate.candidateId && role === 'hr') {
    return { label: openCandidate, href: `/hr/candidates/${candidate.candidateId}` };
  }

  if (candidate.cvId) {
    return {
      label: locale === "fr" ? "Ouvrir le CV" : "Open CV",
      href: `/ta/cv-pool?reviewCvId=${candidate.cvId}`,
    };
  }

  return null;
}

function buildCandidateCard(
  candidate: CandidateSummary,
  role: UserRole,
  locale: "en" | "fr",
): RecruitmentResponseCard | null {
  const isRoleScopedRoster =
    candidate.sourceTool === 'get_candidates_by_stage' ||
    candidate.sourceTool === 'get_candidates_by_job';
  const metrics: RecruitmentResponseCardMetric[] = [];
  pushMetric(
    metrics,
    locale === "fr" ? "Adequation" : "Fit",
    candidate.score === undefined ? undefined : formatScore(candidate.score),
    undefined,
    candidate.score !== undefined && (candidate.score > 80 || (candidate.score > 0 && candidate.score <= 1 && candidate.score > 0.8))
      ? 'success'
      : undefined,
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Etape" : "Stage",
    formatStage(candidate.stage, locale),
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Proprietaire" : "Owner",
    formatOwner(candidate.owner, locale),
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Competences" : "Skills",
    candidate.skills.length > 0 ? String(candidate.skills.length) : undefined,
    compactList(candidate.skills, 4),
  );
  if (!isRoleScopedRoster || candidate.gaps.length > 0) {
    pushMetric(
      metrics,
      locale === "fr" ? "Ecarts" : "Gaps",
      candidate.gaps.length > 0 ? String(candidate.gaps.length) : '0',
      candidate.gaps.length > 0
        ? compactList(candidate.gaps, 3)
        : locale === "fr"
          ? "Aucun ecart explicite retourne."
          : "No explicit gap returned.",
      candidate.gaps.length > 0 ? 'warning' : 'success',
    );
  }

  if (metrics.length === 0) return null;

  const bullets: string[] = [];
  pushUnique(
    bullets,
    candidate.jobTitle
      ? `${isRoleScopedRoster
          ? locale === "fr"
            ? "Assigne a"
            : "Assigned to"
          : locale === "fr"
            ? "Compare a"
            : "Matched against"} ${candidate.jobTitle}.`
      : undefined,
  );
  pushUnique(
    bullets,
    candidate.alreadyAssigned
      ? locale === "fr"
        ? "Ce CV est deja assigne a un poste."
        : "This CV is already assigned to a job."
      : undefined,
  );
  pushUnique(
    bullets,
    candidate.concerns[0]
      ? `${locale === "fr" ? "Point de vigilance" : "Concern"}: ${candidate.concerns[0]}`
      : undefined,
  );

  const actions: RecruitmentResponseCardAction[] = [];
  const detailLink = candidateDetailLink(candidate, role, locale);
  if (detailLink) actions.push(detailLink);
  if (!isRoleScopedRoster) {
    actions.push({
      label: locale === "fr" ? "Comparer les meilleurs candidats" : "Compare top candidates",
      prompt:
        locale === "fr"
          ? "Comparer les meilleurs candidats correspondants de ce resultat"
          : "Compare the top matching candidates from this result",
    });
  }

  return {
    id: `candidate-${candidate.sourceTool}`,
    kind: 'candidate',
    title: candidate.name,
    description: isRoleScopedRoster
      ? locale === "fr"
        ? "Candidat retourne par la requete pipeline limitee au role courant."
        : "Candidate returned by the current role-scoped pipeline query."
      : locale === "fr"
        ? "Meilleur candidat issu du dernier resultat d'outil fonde sur les donnees."
        : "Best surfaced candidate from the latest grounded tool result.",
    tone: candidate.gaps.length > 0 ? 'warning' : 'success',
    sourceTool: candidate.sourceTool,
    metrics,
    ...(bullets.length > 0 ? { bullets } : {}),
    actions,
  };
}

function buildJobCards(
  record: ToolExecutionRecord,
  role: UserRole,
  locale: "en" | "fr",
): RecruitmentResponseCard[] {
  if (!JOB_CARD_TOOL_NAMES.has(record.toolName) || !record.result.success) {
    return [];
  }

  return extractResultItems(record.result.data).map((job, index) => {
    const id = readString(job, ['id', 'jobId']);
    const title =
      readString(job, ['title', 'name']) ??
      (locale === "fr" ? `Poste ${index + 1}` : `Job ${index + 1}`);
    const seniority =
      readString(job, ['seniority']) ??
      (locale === "fr" ? "Non precise" : "Not specified");
    const businessUnit =
      readString(job, ['businessUnit', 'business_unit']) ??
      (locale === "fr" ? "Non precise" : "Not specified");
    const isDraft = record.toolName === 'generate_job_description';
    const isTemplate =
      record.toolName === 'list_job_templates' ||
      record.toolName === 'save_job_as_template' ||
      readBoolean(job, ['isTemplate']) === true;
    const rawStatus =
      readString(job, ['status']) ??
      (isDraft ? 'draft' : isTemplate ? 'template' : 'not_specified');
    const normalizedStatus = rawStatus.toLowerCase();
    const status =
      locale === "fr"
        ? normalizedStatus === "open"
          ? "Ouvert"
          : normalizedStatus === "closed"
            ? "Ferme"
            : normalizedStatus === "draft"
              ? "Brouillon"
              : normalizedStatus === "template"
                ? "Modele"
                : normalizedStatus === "not_specified"
                  ? "Non precise"
                  : rawStatus
        : normalizedStatus === "not_specified"
          ? "Not specified"
          : rawStatus.replace(/\b\w/g, (character) => character.toUpperCase());
    const mustHave = readStringArray(job, ['mustHave', 'must_have']);
    const niceToHave = readStringArray(job, ['niceToHave', 'nice_to_have']);
    const metrics: RecruitmentResponseCardMetric[] = [
      { label: locale === "fr" ? "Seniorite" : "Seniority", value: seniority },
      {
        label: locale === "fr" ? "Unite commerciale" : "Business unit",
        value: businessUnit,
      },
      {
        label: locale === "fr" ? "Statut" : "Status",
        value: status,
        tone: normalizedStatus === 'open' ? 'success' : 'neutral',
      },
    ];
    const bullets = [
      mustHave.length > 0
        ? `${locale === "fr" ? "Indispensables" : "Must-have"}: ${compactList(mustHave, 5)}.`
        : locale === "fr"
          ? "Aucune competence indispensable n'a ete retournee."
          : 'No must-have skills were returned.',
      ...(niceToHave.length > 0
        ? [`${locale === "fr" ? "Souhaitees" : "Nice-to-have"}: ${compactList(niceToHave, 4)}.`]
        : []),
    ];
    const actions: RecruitmentResponseCardAction[] = [];
    if (id && (role === 'ta' || role === 'admin')) {
      actions.push({
        label: locale === "fr" ? "Ouvrir le poste" : "Open job",
        href: `/ta/jobs/${id}`,
      });
    }

    return {
      id: id
        ? `job-${id}`
        : `job-${record.toolName}-${index}-${title}`,
      kind: 'job',
      title,
      description:
        isDraft
          ? locale === "fr"
            ? "Description de poste generee, pas encore publiee."
            : "Generated job description that has not been published yet."
          : locale === "fr"
            ? "Poste retourne par la source limitee au role courant."
            : "Job returned by the current role-scoped job source.",
      tone: normalizedStatus === 'open' ? 'success' : 'neutral',
      sourceTool: record.toolName,
      metrics,
      bullets,
      actions,
    };
  });
}

function topStageLabel(
  stageBreakdown: Record<string, number>,
  locale: "en" | "fr",
): string | undefined {
  let selectedStage: string | undefined;
  let selectedCount = Number.NEGATIVE_INFINITY;

  for (const [stage, count] of Object.entries(stageBreakdown)) {
    if (count > selectedCount) {
      selectedStage = stage;
      selectedCount = count;
    }
  }

  if (!selectedStage || selectedCount <= 0) return undefined;
  const stageLabel = formatStage(selectedStage, locale) ?? selectedStage;
  return locale === "fr"
    ? `${stageLabel} compte ${formatCount(selectedCount)} candidat${selectedCount === 1 ? "" : "s"}.`
    : `${stageLabel} has ${formatCount(selectedCount)} candidate${selectedCount === 1 ? "" : "s"}.`;
}

function roleDashboardHref(role: UserRole): string {
  if (role === 'admin') return '/admin/analytics';
  if (role === 'manager') return '/manager/dashboard';
  if (role === 'hr') return '/hr/dashboard';
  return '/ta/dashboard';
}

function buildDashboardCard(
  record: ToolExecutionRecord,
  role: UserRole,
  locale: "en" | "fr",
): RecruitmentResponseCard | null {
  const parsed = dashboardStatsSchema.safeParse(record.result.data);
  if (!record.result.success || !parsed.success) return null;

  const metrics: RecruitmentResponseCardMetric[] = [];
  pushMetric(
    metrics,
    locale === "fr" ? "Candidats du pipeline" : "Pipeline candidates",
    formatCount(parsed.data.totalCandidates),
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Postes" : "Jobs",
    formatCount(parsed.data.totalJobs),
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Preselections en attente" : "Pending screenings",
    formatCount(parsed.data.pendingScreenings),
    undefined,
    parsed.data.pendingScreenings > 0 ? 'warning' : 'success',
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Entretiens aujourd'hui" : "Interviews today",
    formatCount(parsed.data.totalInterviewsToday),
  );

  const bullets: string[] = [];
  pushUnique(bullets, topStageLabel(parsed.data.stageBreakdown, locale));
  pushUnique(
    bullets,
    parsed.data.pendingScreenings > 0
      ? locale === "fr"
        ? `${formatCount(parsed.data.pendingScreenings)} preselection${parsed.data.pendingScreenings === 1 ? "" : "s"} reste${parsed.data.pendingScreenings === 1 ? "" : "nt"} a verifier.`
        : `${formatCount(parsed.data.pendingScreenings)} screening${parsed.data.pendingScreenings === 1 ? '' : 's'} still need review.`
      : locale === "fr"
        ? "Aucun retard de preselection en attente n'a ete retourne."
        : "No pending screening backlog was returned.",
  );

  return {
    id: 'pipeline-dashboard',
    kind: 'pipeline',
    title: locale === "fr" ? "Apercu du pipeline" : "Pipeline snapshot",
    description:
      locale === "fr"
        ? "Compteurs de recrutement en direct issus du tableau de bord."
        : "Live recruitment counters from the dashboard source.",
    tone: parsed.data.pendingScreenings > 0 ? 'warning' : 'success',
    sourceTool: record.toolName,
    metrics,
    bullets,
    actions: [
      {
        label: locale === "fr" ? "Ouvrir le tableau de bord" : "Open dashboard",
        href: roleDashboardHref(role),
      },
      {
        label: locale === "fr" ? "Expliquer le blocage" : "Explain bottleneck",
        prompt:
          locale === "fr"
            ? "Expliquer le principal blocage du pipeline et les prochaines actions"
            : "Explain the main pipeline bottleneck and next actions",
      },
    ],
  };
}

function buildSmartInsightsCard(
  record: ToolExecutionRecord,
  locale: "en" | "fr",
): RecruitmentResponseCard | null {
  const parsed = smartInsightsSchema.safeParse(record.result.data);
  if (!record.result.success || !parsed.success) return null;

  const pipelineTotal = Object.values(parsed.data.pipelineFunnel).reduce((sum, count) => sum + count, 0);
  const largestGap = parsed.data.skillGapAnalysis.reduce<z.infer<typeof smartInsightsSchema>['skillGapAnalysis'][number] | undefined>(
    (selected, item) => {
      if (!selected) return item;
      return item.demand - item.supply > selected.demand - selected.supply ? item : selected;
    },
    undefined,
  );
  const topProfile = parsed.data.mostDemandedJobProfiles[0];
  const topSkill = parsed.data.mostCommonCvSkills[0];

  const metrics: RecruitmentResponseCardMetric[] = [];
  pushMetric(
    metrics,
    locale === "fr" ? "Total du pipeline" : "Pipeline total",
    formatCount(pipelineTotal),
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Role principal" : "Top role",
    topProfile ? topProfile.title : undefined,
    topProfile
      ? locale === "fr"
        ? `${formatCount(topProfile.count)} signal${topProfile.count === 1 ? "" : "s"} de demande`
        : `${formatCount(topProfile.count)} demand signal${topProfile.count === 1 ? '' : 's'}`
      : undefined,
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Ecart principal" : "Largest gap",
    largestGap ? largestGap.skill : undefined,
    largestGap
      ? locale === "fr"
        ? `Demande ${formatCount(largestGap.demand)} contre offre ${formatCount(largestGap.supply)}`
        : `Demand ${formatCount(largestGap.demand)} vs supply ${formatCount(largestGap.supply)}`
      : undefined,
    largestGap && largestGap.demand > largestGap.supply ? 'warning' : undefined,
  );
  pushMetric(
    metrics,
    locale === "fr" ? "Competence courante" : "Common skill",
    topSkill ? topSkill.skill : undefined,
    topSkill ? `${formatCount(topSkill.count)} CV` : undefined,
  );

  if (metrics.length === 0) return null;

  const bullets: string[] = [];
  pushUnique(bullets, topStageLabel(parsed.data.pipelineFunnel, locale));
  pushUnique(
    bullets,
    largestGap && largestGap.demand > largestGap.supply
      ? locale === "fr"
        ? `${largestGap.skill} presente plus de demande que d'offre dans les donnees observees.`
        : `${largestGap.skill} has more demand than supply in the observed data.`
      : undefined,
  );

  return {
    id: 'pipeline-insights',
    kind: 'pipeline',
    title: locale === "fr" ? "Intelligence du pipeline" : "Pipeline intelligence",
    description:
      locale === "fr"
        ? "Signaux de demande, d'offre et d'etapes issus des analyses intelligentes."
        : "Demand, supply, and stage signals from smart insights.",
    tone: bullets.length > 1 ? 'warning' : 'neutral',
    sourceTool: record.toolName,
    metrics,
    ...(bullets.length > 0 ? { bullets } : {}),
    actions: [
      {
        label: locale === "fr" ? "Ouvrir les analyses" : "Open analytics",
        href: '/admin/analytics',
      },
      {
        label: locale === "fr" ? "Transformer en actions" : "Turn into actions",
        prompt:
          locale === "fr"
            ? "Transformer ces analyses du pipeline en prochaines actions par role"
            : "Turn these pipeline insights into role-specific next actions",
      },
    ],
  };
}

function countDistinctStrings(items: readonly Record<string, unknown>[], keys: readonly string[]): number {
  const values = new Set<string>();
  for (const item of items) {
    const value = readString(item, keys);
    if (value) values.add(value);
  }

  return values.size;
}

function countMatching(items: readonly Record<string, unknown>[], keys: readonly string[], pattern: RegExp): number {
  let count = 0;
  for (const item of items) {
    const value = readString(item, keys);
    if (value && pattern.test(value)) count += 1;
  }

  return count;
}

function buildActivityGovernanceCard(record: ToolExecutionRecord): RecruitmentResponseCard | null {
  if (!record.result.success || !/activity|audit/i.test(record.toolName)) return null;

  const parsed = recordArraySchema.safeParse(extractResultItems(record.result.data));
  if (!parsed.success || parsed.data.length === 0) return null;

  const destructiveCount = countMatching(parsed.data, ['action'], /delete|reject|cancel|close|bulk|hired/i);
  const actorCount = countDistinctStrings(parsed.data, ['userName', 'actorName', 'actorId', 'userId']);
  const stageChangeCount = countMatching(parsed.data, ['action'], /stage|candidate/i);
  const metrics: RecruitmentResponseCardMetric[] = [];
  pushMetric(metrics, 'Audit rows', formatCount(parsed.data.length));
  pushMetric(metrics, 'Actors', actorCount > 0 ? formatCount(actorCount) : undefined);
  pushMetric(metrics, 'Stage events', formatCount(stageChangeCount));
  pushMetric(metrics, 'High-risk events', formatCount(destructiveCount), undefined, destructiveCount > 0 ? 'warning' : 'success');

  const bullets: string[] = [];
  pushUnique(bullets, destructiveCount > 0 ? `${formatCount(destructiveCount)} destructive or terminal action${destructiveCount === 1 ? '' : 's'} should be reviewed.` : 'No destructive action was visible in the returned audit slice.');
  pushUnique(bullets, actorCount > 0 ? `${formatCount(actorCount)} distinct actor${actorCount === 1 ? '' : 's'} in the returned rows.` : undefined);

  return {
    id: 'governance-activity',
    kind: 'governance',
    title: 'Governance audit pulse',
    description: 'Operational risk indicators from the activity log.',
    tone: destructiveCount > 0 ? 'warning' : 'success',
    sourceTool: record.toolName,
    metrics,
    bullets,
    actions: [
      { label: 'Open audit', href: '/admin/activity' },
      { label: 'Draft audit summary', prompt: 'Draft an audit-ready summary of these governance risks' },
    ],
  };
}

function buildEmailGovernanceCard(record: ToolExecutionRecord): RecruitmentResponseCard | null {
  if (!record.result.success || !/email|notification/i.test(record.toolName)) return null;

  const parsed = recordArraySchema.safeParse(extractResultItems(record.result.data));
  if (!parsed.success || parsed.data.length === 0) return null;

  const failedCount = countMatching(parsed.data, ['status'], /fail|error|bounce|rejected/i);
  const sentCount = countMatching(parsed.data, ['status'], /sent|delivered|success/i);
  const recipientCount = countDistinctStrings(parsed.data, ['toEmail', 'recipientEmail', 'email']);
  const metrics: RecruitmentResponseCardMetric[] = [];
  pushMetric(metrics, 'Email rows', formatCount(parsed.data.length));
  pushMetric(metrics, 'Sent', formatCount(sentCount), undefined, 'success');
  pushMetric(metrics, 'Failed', formatCount(failedCount), undefined, failedCount > 0 ? 'warning' : 'success');
  pushMetric(metrics, 'Recipients', recipientCount > 0 ? formatCount(recipientCount) : undefined);

  return {
    id: 'governance-email',
    kind: 'governance',
    title: 'Communication audit',
    description: 'Email delivery evidence from the returned log slice.',
    tone: failedCount > 0 ? 'warning' : 'success',
    sourceTool: record.toolName,
    metrics,
    bullets: [
      failedCount > 0
        ? `${formatCount(failedCount)} email${failedCount === 1 ? '' : 's'} need delivery review.`
        : 'No failed delivery status was visible in the returned log slice.',
    ],
    actions: [
      { label: 'Open email audit', href: '/admin/emails' },
      { label: 'Show failed only', prompt: 'Show only failed or pending email actions' },
    ],
  };
}

function addUniqueCard(cards: RecruitmentResponseCard[], next: RecruitmentResponseCard | null) {
  if (!next) return;
  const existingIndex = cards.findIndex((card) => card.id === next.id);
  if (existingIndex === -1) {
    cards.push(next);
    return;
  }

  cards[existingIndex] = next;
}
export function buildResponseCardsFromToolRecords(
  records: readonly ToolExecutionRecord[],
  options: BuildResponseCardsOptions = {},
): RecruitmentResponseCard[] {
  const role = options.role ?? 'ta';
  const locale = options.locale ?? "en";
  const cards: RecruitmentResponseCard[] = [];

  let bestCandidate: CandidateSummary | null = null;
  for (const record of records) {
    const candidate = summarizeCandidate(record);
    if (!candidate) continue;
    if (!bestCandidate) {
      bestCandidate = candidate;
      continue;
    }

    const currentScore = candidate.score ?? 0;
    const bestScore = bestCandidate.score ?? 0;
    if (currentScore > bestScore) bestCandidate = candidate;
  }
  addUniqueCard(
    cards,
    bestCandidate ? buildCandidateCard(bestCandidate, role, locale) : null,
  );

  for (const record of records) {
    for (const jobCard of buildJobCards(record, role, locale)) {
      addUniqueCard(cards, jobCard);
    }
    addUniqueCard(cards, buildDashboardCard(record, role, locale));
    addUniqueCard(cards, buildSmartInsightsCard(record, locale));
    addUniqueCard(cards, buildActivityGovernanceCard(record));
    addUniqueCard(cards, buildEmailGovernanceCard(record));
  }

  return cards.slice(0, options.maxCards ?? DEFAULT_MAX_CARDS);
}
