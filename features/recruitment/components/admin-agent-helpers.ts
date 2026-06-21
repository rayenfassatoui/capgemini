import type {
  EmailLogEntry,
  OnboardingDetailedEntry,
  RecruitmentAnalytics,
  SystemOverview,
} from '@/features/recruitment/services/admin';

export interface AdminEvidenceMetric {
  label: string;
  value: string;
  detail: string;
}

export interface AdminEvidenceSummary {
  title: string;
  description: string;
  metrics: AdminEvidenceMetric[];
  observedFacts: string[];
  missingEvidence: string[];
  riskFlags: string[];
}

export interface AdminActivityRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date | null;
  userName: string;
  userEmail: string;
  candidateStage: string | null;
}

const MAX_PROMPT_ITEMS = 8;

export function buildAdminAgentPrompt({
  task,
  summary,
}: {
  task: string;
  summary: AdminEvidenceSummary;
}): string {
  return [
    `Admin source-backed task: ${task}`,
    `Surface: ${summary.title}.`,
    `Observed admin facts: ${formatPromptList(summary.observedFacts)}.`,
    `Missing operational evidence: ${formatPromptList(summary.missingEvidence)}.`,
    `Risk flags to evaluate: ${formatPromptList(summary.riskFlags)}.`,
    'Instruction: separate Observed from Sources, Inferred / Recommended, and Source Limits. Do not invent records, timestamps, owners, delivery failures, or candidate facts that are not in the observed admin facts above; fetch more data with tools when needed.',
  ].join(' ');
}

export function buildDashboardAdminEvidence(overview: SystemOverview): AdminEvidenceSummary {
  const adminUsers = overview.usersByRole.find((entry) => entry.role === 'admin')?.count ?? 0;
  const taUsers = overview.usersByRole.find((entry) => entry.role === 'ta')?.count ?? 0;
  const managerUsers = overview.usersByRole.find((entry) => entry.role === 'manager')?.count ?? 0;
  const hrUsers = overview.usersByRole.find((entry) => entry.role === 'hr')?.count ?? 0;
  const mutatingActivityCount = overview.recentActivity.filter(isMutatingActivity).length;
  const destructiveActivityCount = overview.recentActivity.filter((entry) => /delete|remove/i.test(entry.action)).length;

  return {
    title: 'Governance snapshot',
    description: 'Role distribution, live workload volume, and recent audited activity from the admin overview.',
    metrics: [
      {
        label: 'Users',
        value: String(overview.totalUsers),
        detail: `${adminUsers} admin, ${taUsers} TA, ${managerUsers} manager, ${hrUsers} HR`,
      },
      {
        label: 'Workload',
        value: String(overview.totalCandidates),
        detail: `${overview.totalJobs} jobs, ${overview.totalCvsInPool} CVs, ${overview.totalInterviews} interviews`,
      },
      {
        label: 'Audited actions',
        value: String(overview.recentActivity.length),
        detail: `${mutatingActivityCount} mutating action${mutatingActivityCount === 1 ? '' : 's'} in latest visible activity`,
      },
    ],
    observedFacts: compactStrings([
      `${overview.totalUsers} users are active in the platform role model.`,
      `Role split: ${overview.usersByRole.map((entry) => `${entry.role}=${entry.count}`).join(', ') || 'no users by role returned'}.`,
      `${overview.totalCandidates} candidates, ${overview.totalJobs} jobs, ${overview.totalCvsInPool} CVs, and ${overview.totalInterviews} interviews are visible to admin.`,
      `${overview.recentActivity.length} recent activity rows are available in the overview.`,
      overview.recentActivity[0]
        ? `Latest activity: ${overview.recentActivity[0].action} on ${overview.recentActivity[0].entityType} by ${overview.recentActivity[0].userName}.`
        : 'No recent activity rows are available.',
    ]),
    missingEvidence: compactStrings([
      'The dashboard contains only the latest activity rows, not a complete audit export.',
      'Session, failed login, permission change, and notification delivery telemetry are not present in this snapshot.',
      overview.totalInterviews > 0 ? null : 'Interview status distribution is not present on this overview.',
    ]),
    riskFlags: compactStrings([
      adminUsers > 1 ? `${adminUsers} admin users should be reviewed for least-privilege access.` : null,
      overview.totalJobs > 0 && overview.totalCandidates === 0 ? 'Jobs exist but no candidates are assigned.' : null,
      destructiveActivityCount > 0 ? `${destructiveActivityCount} destructive action${destructiveActivityCount === 1 ? '' : 's'} in latest activity.` : null,
      overview.recentActivity.length === 0 ? 'No recent activity means audit recency cannot be assessed from this dashboard.' : null,
    ]),
  };
}

export function buildAnalyticsAdminEvidence(analytics: RecruitmentAnalytics): AdminEvidenceSummary {
  const totalInFunnel = Object.values(analytics.pipelineFunnel).reduce((sum, value) => sum + value, 0);
  const rejectedCount = analytics.pipelineFunnel.ta_rejected + analytics.pipelineFunnel.manager_rejected + analytics.pipelineFunnel.hr_rejected;
  const activeCount = Math.max(0, totalInFunnel - rejectedCount - analytics.pipelineFunnel.hired);
  const busiestStage = Object.entries(analytics.pipelineFunnel)
    .filter(([stage]) => !stage.includes('rejected') && stage !== 'hired')
    .sort((left, right) => right[1] - left[1])[0];
  const busiestJob = analytics.candidatesPerJob[0];
  const monthsWithOutcomes = analytics.monthlyHiringTrend.filter((entry) => entry.hired > 0 || entry.rejected > 0).length;

  return {
    title: 'Analytics evidence readiness',
    description: 'Pipeline interpretation based on current funnel counts, outcomes, job load, and recruiter throughput.',
    metrics: [
      {
        label: 'Pipeline total',
        value: String(totalInFunnel),
        detail: `${activeCount} active, ${analytics.pipelineFunnel.hired} hired, ${rejectedCount} rejected`,
      },
      {
        label: 'Hiring rate',
        value: `${analytics.hiringRate}%`,
        detail: `Rejection rate is ${analytics.rejectionRate}%`,
      },
      {
        label: 'Top workload',
        value: busiestJob ? String(busiestJob.count) : '0',
        detail: busiestJob ? busiestJob.jobTitle : 'No candidate/job load returned',
      },
    ],
    observedFacts: compactStrings([
      `Pipeline total is ${totalInFunnel}.`,
      `Current hiring rate is ${analytics.hiringRate}% and rejection rate is ${analytics.rejectionRate}%.`,
      busiestStage ? `Largest active stage is ${formatStage(busiestStage[0])} with ${busiestStage[1]} candidate${busiestStage[1] === 1 ? '' : 's'}.` : null,
      busiestJob ? `Highest candidate load is ${busiestJob.jobTitle} with ${busiestJob.count} candidate${busiestJob.count === 1 ? '' : 's'}.` : null,
      `${analytics.topRecruiters.length} recruiter throughput row${analytics.topRecruiters.length === 1 ? '' : 's'} are visible.`,
      `${monthsWithOutcomes} of ${analytics.monthlyHiringTrend.length} monthly trend bucket${analytics.monthlyHiringTrend.length === 1 ? '' : 's'} contain hiring or rejection outcomes.`,
    ]),
    missingEvidence: compactStrings([
      analytics.averageTimeToHire === null ? 'Average time-to-hire is not available in the current analytics source.' : null,
      'Stage aging, SLA breaches, owner workload by open action, and candidate quality signals are not present in this chart dataset.',
      analytics.interviewsPerStage.length > 0 ? null : 'Interview stage distribution is empty.',
    ]),
    riskFlags: compactStrings([
      analytics.rejectionRate > analytics.hiringRate ? 'Rejection rate is higher than hiring rate.' : null,
      busiestStage && busiestStage[1] > Math.max(3, Math.ceil(totalInFunnel * 0.35)) ? `${formatStage(busiestStage[0])} may be a bottleneck.` : null,
      busiestJob && busiestJob.count > 5 ? `${busiestJob.jobTitle} has concentrated candidate load.` : null,
      monthsWithOutcomes === 0 && totalInFunnel > 0 ? 'Monthly trend has no recorded outcomes despite pipeline volume.' : null,
    ]),
  };
}

export function buildOnboardingAdminEvidence(candidates: OnboardingDetailedEntry[]): AdminEvidenceSummary {
  const totalHired = candidates.length;
  const noChecklist = candidates.filter((candidate) => candidate.totalTasks === 0).length;
  const complete = candidates.filter((candidate) => candidate.totalTasks > 0 && candidate.completedTasks === candidate.totalTasks).length;
  const inProgress = totalHired - noChecklist - complete;
  const missingContact = candidates.filter((candidate) => !candidate.candidateEmail || !candidate.candidatePhone).length;
  const noCvEvidence = candidates.filter((candidate) => candidate.cvSkills.length === 0 && candidate.cvExperiences.length === 0).length;
  const lowestProgress = candidates
    .filter((candidate) => candidate.totalTasks > 0)
    .map((candidate) => ({
      name: candidate.candidateName,
      progress: Math.round((candidate.completedTasks / candidate.totalTasks) * 100),
    }))
    .sort((left, right) => left.progress - right.progress)[0];

  return {
    title: 'Onboarding evidence readiness',
    description: 'Checklist completeness, candidate contact coverage, and onboarding anomaly signals for hired candidates.',
    metrics: [
      {
        label: 'Hired candidates',
        value: String(totalHired),
        detail: `${complete} complete, ${inProgress} in progress, ${noChecklist} without checklist`,
      },
      {
        label: 'Checklist gaps',
        value: String(noChecklist),
        detail: 'Hired candidates without onboarding tasks',
      },
      {
        label: 'Contact gaps',
        value: String(missingContact),
        detail: 'Missing email or phone in onboarding roster',
      },
    ],
    observedFacts: compactStrings([
      `${totalHired} hired candidate${totalHired === 1 ? '' : 's'} are present in onboarding.`,
      `${complete} candidate${complete === 1 ? '' : 's'} have completed all onboarding tasks.`,
      `${inProgress} candidate${inProgress === 1 ? '' : 's'} have onboarding in progress.`,
      `${noChecklist} candidate${noChecklist === 1 ? '' : 's'} have no checklist tasks.`,
      lowestProgress ? `Lowest non-zero checklist progress: ${lowestProgress.name} at ${lowestProgress.progress}%.` : null,
    ]),
    missingEvidence: compactStrings([
      'Task owners, due dates, SLA thresholds, and blocker reasons are not present in this source.',
      noChecklist > 0 ? 'Checklist creation evidence is missing for some hired candidates.' : null,
      missingContact > 0 ? 'Complete candidate contact data is missing for some onboarding records.' : null,
    ]),
    riskFlags: compactStrings([
      noChecklist > 0 ? `${noChecklist} hired candidate${noChecklist === 1 ? '' : 's'} without an onboarding checklist.` : null,
      missingContact > 0 ? `${missingContact} onboarding record${missingContact === 1 ? '' : 's'} with incomplete contact data.` : null,
      noCvEvidence > 0 ? `${noCvEvidence} hired candidate${noCvEvidence === 1 ? '' : 's'} with thin CV evidence in onboarding detail.` : null,
      totalHired > 0 && complete === 0 ? 'No hired candidate is fully onboarded yet.' : null,
    ]),
  };
}

export function buildEmailAdminEvidence(emails: EmailLogEntry[]): AdminEvidenceSummary {
  const totalEmails = emails.length;
  const failed = emails.filter((email) => email.status.toLowerCase() === 'failed').length;
  const sent = emails.filter((email) => email.status.toLowerCase() === 'sent').length;
  const unknownStatus = totalEmails - failed - sent;
  const missingStage = emails.filter((email) => !email.candidateStage).length;
  const missingInterviewLink = emails.filter((email) => !email.interviewId).length;
  const failureRate = totalEmails > 0 ? Math.round((failed / totalEmails) * 100) : 0;
  const latestEmail = emails[0];

  return {
    title: 'Communication evidence readiness',
    description: 'Email delivery audit coverage and missing notification evidence for recruitment communications.',
    metrics: [
      {
        label: 'Emails logged',
        value: String(totalEmails),
        detail: `${sent} sent, ${failed} failed, ${unknownStatus} other status`,
      },
      {
        label: 'Failure rate',
        value: `${failureRate}%`,
        detail: 'Based only on logged email status values',
      },
      {
        label: 'Unlinked logs',
        value: String(missingInterviewLink),
        detail: 'Rows without an interview reference',
      },
    ],
    observedFacts: compactStrings([
      `${totalEmails} email log row${totalEmails === 1 ? '' : 's'} are available.`,
      `${sent} sent and ${failed} failed email${failed === 1 ? '' : 's'} are recorded.`,
      `${missingStage} email row${missingStage === 1 ? '' : 's'} have no candidate stage.`,
      `${missingInterviewLink} email row${missingInterviewLink === 1 ? '' : 's'} have no interview ID.`,
      latestEmail ? `Latest email subject: ${latestEmail.subject} to ${latestEmail.toName || latestEmail.toEmail}.` : null,
    ]),
    missingEvidence: compactStrings([
      'SMTP provider delivery receipts, bounce codes, retry attempts, and notification logs are not present in this table.',
      missingStage > 0 ? 'Candidate-stage context is missing for some communication rows.' : null,
      missingInterviewLink > 0 ? 'Interview linkage is missing for some email rows.' : null,
    ]),
    riskFlags: compactStrings([
      failed > 0 ? `${failed} failed email${failed === 1 ? '' : 's'} ${failed === 1 ? 'requires' : 'require'} delivery review.` : null,
      failureRate >= 10 ? `Email failure rate is ${failureRate}%.` : null,
      missingStage > Math.max(0, Math.floor(totalEmails / 2)) && totalEmails > 0 ? 'Most email rows are missing candidate stage context.' : null,
    ]),
  };
}

export function buildActivityAdminEvidence(activityLog: AdminActivityRecord[]): AdminEvidenceSummary {
  const total = activityLog.length;
  const candidateRows = activityLog.filter((entry) => entry.entityType === 'candidate').length;
  const destructiveRows = activityLog.filter((entry) => /delete|remove/i.test(entry.action)).length;
  const mutatingRows = activityLog.filter(isMutatingActivity).length;
  const uniqueUsers = new Set(activityLog.map((entry) => entry.userEmail)).size;
  const latest = activityLog[0];

  return {
    title: 'Activity audit readiness',
    description: 'Admin audit evidence for recent entity mutations and system activity patterns.',
    metrics: [
      {
        label: 'Activity rows',
        value: String(total),
        detail: `${mutatingRows} mutating, ${destructiveRows} destructive`,
      },
      {
        label: 'Actors',
        value: String(uniqueUsers),
        detail: 'Distinct users in current activity view',
      },
      {
        label: 'Candidate actions',
        value: String(candidateRows),
        detail: 'Rows tied to candidate entities',
      },
    ],
    observedFacts: compactStrings([
      `${total} activity row${total === 1 ? '' : 's'} are loaded in this view.`,
      `${uniqueUsers} distinct actor${uniqueUsers === 1 ? '' : 's'} appear in the loaded audit rows.`,
      `${candidateRows} row${candidateRows === 1 ? '' : 's'} target candidate entities.`,
      `${destructiveRows} destructive row${destructiveRows === 1 ? '' : 's'} are visible.`,
      latest ? `Latest row: ${latest.action} on ${latest.entityType} by ${latest.userName}.` : null,
    ]),
    missingEvidence: compactStrings([
      'This view is limited to the loaded audit rows and does not include authentication/session logs.',
      'Before/after field diffs are not present for updates.',
      'Notification delivery and database transaction traces are not part of this audit table.',
    ]),
    riskFlags: compactStrings([
      destructiveRows > 0 ? `${destructiveRows} destructive action${destructiveRows === 1 ? '' : 's'} should be reviewed.` : null,
      total === 0 ? 'No audit rows are available for review.' : null,
      total > 0 && uniqueUsers === 1 ? 'Only one actor appears in the loaded audit rows; coverage may be narrow.' : null,
    ]),
  };
}

function isMutatingActivity(entry: { action: string }): boolean {
  return /create|update|delete|remove|assign|schedule|send|toggle|close|hire|reject|accept|stage/i.test(entry.action);
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function formatPromptList(values: string[]): string {
  if (values.length === 0) return 'none observed';
  return values.slice(0, MAX_PROMPT_ITEMS).join(' | ');
}

function formatStage(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
