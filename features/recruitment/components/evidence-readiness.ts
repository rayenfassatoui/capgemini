export type EvidenceReadinessStatus = 'ready' | 'partial' | 'needs-evidence';

export interface EvidenceReadinessMetric {
  label: string;
  value: string;
  detail: string;
}

export interface EvidenceReadinessModel {
  status: EvidenceReadinessStatus;
  statusLabel: string;
  summary: string;
  metrics: EvidenceReadinessMetric[];
  observedFacts: string[];
  missingEvidence: string[];
  riskFlags: string[];
}

interface ReadinessReport {
  stage?: string;
  score: number | null;
  decision: string;
  notes?: string | null;
  overallEvaluation?: string | null;
  createdAt?: Date | string | null;
}

interface ReadinessInterview {
  scheduledDate: string;
  scheduledTime: string;
  status?: string;
}

interface ReadinessScreening {
  score: number;
  mustMatchScore: number;
  niceMatchScore: number;
  gaps: string[];
  matchedMustHave: string[];
  matchedNiceToHave: string[];
  aiSummary?: string | null;
}

interface CandidateReadinessInput {
  workflow: 'manager' | 'hr';
  candidateName: string;
  stage: string;
  jobTitle?: string | null;
  screening?: ReadinessScreening | null;
  reports: ReadinessReport[];
  currentInterview?: ReadinessInterview | null;
  hasInterviewGuide: boolean;
  hasAutoPilotGuide?: boolean;
}

interface CvReadinessInput {
  filename: string;
  extractedName?: string | null;
  extractedEmail?: string | null;
  extractedPhone?: string | null;
  extractedSkills?: string[] | null;
  extractedExperiences?: Array<Record<string, string>> | null;
  extractedEducation?: Array<Record<string, string>> | null;
  extractedLanguages?: string[] | null;
  extractedSummary?: string | null;
}

const MAX_PROMPT_ITEMS = 6;

export function buildCandidateEvidenceReadiness({
  workflow,
  candidateName,
  stage,
  jobTitle,
  screening,
  reports,
  currentInterview,
  hasInterviewGuide,
  hasAutoPilotGuide = false,
}: CandidateReadinessInput): EvidenceReadinessModel {
  const sortedReports = [...reports].sort((left, right) => {
    const leftTime = getReportTime(left);
    const rightTime = getReportTime(right);
    if (leftTime !== rightTime) return rightTime - leftTime;

    const leftScore = typeof left.score === 'number' ? left.score : -1;
    const rightScore = typeof right.score === 'number' ? right.score : -1;
    return rightScore - leftScore;
  });
  const latestReport = sortedReports[0];
  const reportScores = reports
    .map((report) => report.score)
    .filter((score): score is number => typeof score === 'number');
  const averageReportScore = reportScores.length > 0
    ? Math.round(reportScores.reduce((total, score) => total + score, 0) / reportScores.length)
    : null;
  const workflowLabel = workflow === 'manager' ? 'Manager' : 'HR';
  const priorDecision = latestReport
    ? `${normalizeStageLabel(latestReport.stage)}: ${normalizeStageLabel(latestReport.decision)}`
    : 'No prior decision recorded';
  const lastInterview = currentInterview
    ? `${normalizeStageLabel(currentInterview.status ?? 'scheduled')} on ${currentInterview.scheduledDate} at ${currentInterview.scheduledTime}`
    : `${workflowLabel} interview not scheduled`;

  const observedFacts = compactStrings([
    `${candidateName} is at ${normalizeStageLabel(stage)} stage${jobTitle ? ` for ${jobTitle}` : ''}.`,
    screening
      ? `Screening score is ${Math.round(screening.score)}/100 with ${screening.gaps.length} gap${screening.gaps.length === 1 ? '' : 's'}.`
      : 'No screening score is available in this view.',
    reports.length > 0
      ? `${reports.length} prior report${reports.length === 1 ? '' : 's'} available${averageReportScore !== null ? `, average score ${averageReportScore}/100` : ''}.`
      : 'No prior interview reports are available.',
    currentInterview ? `${workflowLabel} interview status: ${lastInterview}.` : null,
    hasInterviewGuide ? `${workflowLabel} interview guide is ready.` : `${workflowLabel} interview guide is missing.`,
    hasAutoPilotGuide ? 'Auto-Pilot guide is available.' : null,
  ]);

  const missingEvidence = compactStrings([
    screening ? null : 'Screening score and skill-gap analysis',
    reports.length > 0 ? null : 'Prior TA/manager evaluation report',
    hasInterviewGuide ? null : `${workflowLabel} interview guide`,
    currentInterview ? null : `${workflowLabel} interview status`,
    currentInterview?.status === 'completed' ? null : `${workflowLabel} completed interview evidence`,
    reports.some(hasReportNarrative) ? null : 'Written evaluation notes',
  ]);

  const riskFlags = compactStrings([
    screening && screening.score < 60 ? `Low screening score (${Math.round(screening.score)}/100)` : null,
    screening && screening.gaps.length > 0 ? `Open skill gaps: ${screening.gaps.slice(0, 3).join(', ')}` : null,
    latestReport?.decision && /reject|rejected/i.test(latestReport.decision)
      ? `Prior ${normalizeStageLabel(latestReport.stage)} decision was ${normalizeStageLabel(latestReport.decision)}`
      : null,
    reports.length === 0 ? 'No previous human assessment to triangulate' : null,
    currentInterview && currentInterview.status !== 'completed' ? 'Current-stage interview is not completed' : null,
    missingEvidence.length >= 3 ? 'Decision would rely on incomplete evidence' : null,
  ]);

  const metrics: EvidenceReadinessMetric[] = [
    {
      label: screening ? 'Screening score' : 'Screening',
      value: screening ? `${Math.round(screening.score)}/100` : 'Missing',
      detail: screening
        ? `${Math.round(screening.mustMatchScore)}% must-have, ${Math.round(screening.niceMatchScore)}% nice-to-have`
        : 'Run or fetch candidate screening before relying on fit claims.',
    },
    {
      label: 'Last interview',
      value: currentInterview ? normalizeStageLabel(currentInterview.status ?? 'scheduled') : 'Not scheduled',
      detail: currentInterview
        ? `${currentInterview.scheduledDate} at ${currentInterview.scheduledTime}`
        : `${workflowLabel} interview evidence is not present yet.`,
    },
    {
      label: 'Prior decision',
      value: latestReport ? normalizeStageLabel(latestReport.decision) : 'Missing',
      detail: priorDecision,
    },
  ];

  const status = getStatus(missingEvidence.length, riskFlags.length);
  const statusLabel = status === 'ready'
    ? 'Decision-ready'
    : status === 'partial'
      ? 'Partially grounded'
      : 'Needs evidence';

  return {
    status,
    statusLabel,
    summary: `${statusLabel}: ${candidateName} has ${observedFacts.length} observed signal${observedFacts.length === 1 ? '' : 's'}, ${missingEvidence.length} missing evidence item${missingEvidence.length === 1 ? '' : 's'}, and ${riskFlags.length} risk flag${riskFlags.length === 1 ? '' : 's'}.`,
    metrics,
    observedFacts,
    missingEvidence,
    riskFlags,
  };
}

export function buildCvEvidenceReadiness({
  filename,
  extractedName,
  extractedEmail,
  extractedPhone,
  extractedSkills,
  extractedExperiences,
  extractedEducation,
  extractedLanguages,
  extractedSummary,
}: CvReadinessInput): EvidenceReadinessModel {
  const candidateName = extractedName || filename;
  const skillCount = extractedSkills?.length ?? 0;
  const experienceCount = extractedExperiences?.length ?? 0;
  const educationCount = extractedEducation?.length ?? 0;
  const languageCount = extractedLanguages?.length ?? 0;
  const completedSections = [
    Boolean(extractedName),
    Boolean(extractedEmail),
    skillCount > 0,
    experienceCount > 0,
    educationCount > 0,
    languageCount > 0,
    Boolean(extractedSummary),
  ].filter(Boolean).length;

  const observedFacts = compactStrings([
    `CV source file: ${filename}.`,
    extractedName ? `Extracted candidate name: ${extractedName}.` : 'Candidate name was not extracted.',
    extractedEmail ? `Extracted email: ${extractedEmail}.` : null,
    extractedPhone ? `Extracted phone: ${extractedPhone}.` : null,
    skillCount > 0 ? `${skillCount} extracted skill${skillCount === 1 ? '' : 's'} available.` : 'No skills were extracted.',
    experienceCount > 0 ? `${experienceCount} experience entr${experienceCount === 1 ? 'y' : 'ies'} extracted.` : 'No experience entries were extracted.',
    languageCount > 0 ? `${languageCount} language${languageCount === 1 ? '' : 's'} extracted.` : null,
  ]);

  const missingEvidence = compactStrings([
    extractedName ? null : 'Candidate name',
    extractedEmail ? null : 'Candidate email',
    skillCount > 0 ? null : 'Extracted skills',
    experienceCount > 0 ? null : 'Experience history',
    educationCount > 0 ? null : 'Education history',
    languageCount > 0 ? null : 'Language evidence',
    extractedSummary ? null : 'Profile summary',
    'Job-specific match score',
    'Human screening decision',
  ]);

  const riskFlags = compactStrings([
    extractedName ? null : 'Identity is unresolved',
    extractedEmail ? null : 'No email for candidate follow-up',
    skillCount < 3 ? 'Skill extraction is thin' : null,
    experienceCount === 0 ? 'Experience history is missing' : null,
    missingEvidence.length >= 5 ? 'Profile is not ready for confident matching' : null,
  ]);

  const metrics: EvidenceReadinessMetric[] = [
    {
      label: 'Profile evidence',
      value: `${completedSections}/7`,
      detail: 'Identity, contact, skills, experience, education, languages, and summary.',
    },
    {
      label: 'Match score',
      value: 'Not assigned',
      detail: 'Assign this CV to a job or run matching to produce a score.',
    },
    {
      label: 'Prior decision',
      value: 'None',
      detail: 'No TA/manager/HR decision exists for a pool CV.',
    },
  ];

  const status = getStatus(missingEvidence.length, riskFlags.length);
  const statusLabel = status === 'ready'
    ? 'Review-ready'
    : status === 'partial'
      ? 'Partially extracted'
      : 'Needs extraction';

  return {
    status,
    statusLabel,
    summary: `${statusLabel}: ${candidateName} has ${completedSections}/7 profile evidence sections, ${missingEvidence.length} missing evidence item${missingEvidence.length === 1 ? '' : 's'}, and ${riskFlags.length} risk flag${riskFlags.length === 1 ? '' : 's'}.`,
    metrics,
    observedFacts,
    missingEvidence,
    riskFlags,
  };
}

export function formatEvidenceReadinessForAgent(readiness: EvidenceReadinessModel): string {
  return [
    'Evidence readiness context:',
    `Status: ${readiness.statusLabel}.`,
    `Observed facts: ${formatPromptList(readiness.observedFacts)}.`,
    `Missing evidence: ${formatPromptList(readiness.missingEvidence)}.`,
    `Risk flags: ${formatPromptList(readiness.riskFlags)}.`,
    'Instruction: separate observed facts from inferred recommendations and do not invent unavailable evidence.',
  ].join(' ');
}

function hasReportNarrative(report: ReadinessReport): boolean {
  return Boolean(report.overallEvaluation?.trim() || report.notes?.trim());
}

function getStatus(missingCount: number, riskCount: number): EvidenceReadinessStatus {
  if (missingCount === 0 && riskCount <= 1) return 'ready';
  if (missingCount <= 3 && riskCount <= 2) return 'partial';
  return 'needs-evidence';
}

function normalizeStageLabel(value: string | undefined): string {
  if (!value) return 'Unknown';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getReportTime(report: ReadinessReport): number {
  if (!report.createdAt) return 0;
  const time = new Date(report.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function formatPromptList(values: string[]): string {
  if (values.length === 0) return 'none';
  return values.slice(0, MAX_PROMPT_ITEMS).join(' | ');
}
