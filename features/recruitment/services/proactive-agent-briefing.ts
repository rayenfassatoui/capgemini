import type {
  AgentProactiveBriefing,
  AgentProactiveBriefingCard,
  AgentProactiveBriefingTone,
  CandidateStage,
  CvPoolStats,
  DashboardStats,
  JobsStats,
  SmartInsights,
  UserRole,
} from '../types';

export interface BuildAgentProactiveBriefingInput {
  role: UserRole;
  dashboardStats?: DashboardStats | null;
  cvPoolStats?: CvPoolStats | null;
  jobsStats?: JobsStats | null;
  smartInsights?: SmartInsights | null;
  unreadNotificationCount?: number | null;
}

const STAGE_LABELS: Record<CandidateStage, string> = {
  new: 'New',
  ta_screening: 'TA screening',
  ta_interview: 'TA interview',
  ta_accepted: 'TA accepted',
  ta_rejected: 'TA rejected',
  manager_interview: 'Manager interview',
  manager_accepted: 'Manager accepted',
  manager_rejected: 'Manager rejected',
  hr_interview: 'HR interview',
  hr_accepted: 'HR accepted',
  hr_rejected: 'HR rejected',
  hired: 'Hired',
};

const ROLE_PROMPTS: Record<UserRole, string> = {
  ta: 'Run a proactive TA production audit: fetch dashboard stats, CV pool stats, job demand, smart insights, today interviews, and notifications. Identify the biggest blocker, explain lobb el ghalta from evidence, render charts or Mermaid if useful, and give the 3 actions to execute today.',
  manager: 'Run a proactive manager production audit: fetch my assigned pipeline, interviews, and candidate evidence. Identify the decision blocking progress, explain the evidence, and give the next best actions.',
  hr: 'Run a proactive HR production audit: fetch my HR-stage candidates, interviews, onboarding signals, and notifications. Identify the operational risk, cite evidence, and give next actions.',
  admin: 'Run a proactive admin production audit: fetch dashboard stats, recruitment analytics, system overview, activity signals, and smart insights. Identify lobb el ghalta, chart the relevant evidence, flag governance risks, and give next actions.',
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function findLargestStage(stageBreakdown?: Record<CandidateStage, number>) {
  if (!stageBreakdown) return null;

  let selected: { stage: CandidateStage; count: number } | null = null;
  for (const [stage, count] of Object.entries(stageBreakdown) as Array<[
    CandidateStage,
    number,
  ]>) {
    if (count <= 0) continue;
    if (!selected || count > selected.count) {
      selected = { stage, count };
    }
  }

  return selected;
}

function findLargestSkillGap(gaps?: SmartInsights['skillGapAnalysis']) {
  if (!gaps || gaps.length === 0) return null;

  let selected: SmartInsights['skillGapAnalysis'][number] | null = null;
  for (const gap of gaps) {
    const delta = gap.demand - gap.supply;
    if (delta <= 0) continue;
    const selectedDelta = selected ? selected.demand - selected.supply : -Infinity;
    if (!selected || delta > selectedDelta) {
      selected = gap;
    }
  }

  return selected;
}

function getOpenJobsCount(jobsStats?: JobsStats | null) {
  if (!jobsStats) return null;
  const openRow = jobsStats.byStatus.find((item) =>
    item.status.toLowerCase().includes('open'),
  );
  return openRow?.count ?? jobsStats.totalJobs;
}

function pushCard(
  cards: AgentProactiveBriefingCard[],
  card: AgentProactiveBriefingCard,
) {
  if (!cards.some((item) => item.id === card.id)) {
    cards.push(card);
  }
}

function toneForCount(count: number): AgentProactiveBriefingTone {
  if (count >= 10) return 'danger';
  if (count >= 3) return 'warning';
  return 'neutral';
}

function buildDefaultCards(role: UserRole): AgentProactiveBriefingCard[] {
  return [
    {
      id: 'proactive-live-audit',
      title: 'Run a live operating audit',
      metric: 'Fresh tools required',
      description:
        'No complete briefing data was available in the page preload, so the safest proactive move is a tool-first audit inside the agent.',
      tone: 'neutral',
      priorityLabel: 'Start here',
      evidence: ['The agent will fetch live dashboard, pipeline, and role-scoped evidence before answering.'],
      prompt: ROLE_PROMPTS[role],
    },
  ];
}

export function buildAgentProactiveBriefing({
  role,
  dashboardStats,
  cvPoolStats,
  jobsStats,
  smartInsights,
  unreadNotificationCount,
}: BuildAgentProactiveBriefingInput): AgentProactiveBriefing {
  const cards: AgentProactiveBriefingCard[] = [];
  const largestStage = findLargestStage(
    dashboardStats?.stageBreakdown ?? smartInsights?.pipelineFunnel,
  );
  const largestSkillGap = findLargestSkillGap(smartInsights?.skillGapAnalysis);
  const openJobs = getOpenJobsCount(jobsStats);

  if (dashboardStats && dashboardStats.pendingScreenings > 0) {
    pushCard(cards, {
      id: 'pending-screenings',
      title: 'Screening backlog needs action',
      metric: formatCount(dashboardStats.pendingScreenings, 'pending screening'),
      description:
        'New candidates are waiting at the first decision gate. Clearing this queue improves every downstream stage.',
      tone: toneForCount(dashboardStats.pendingScreenings),
      priorityLabel: dashboardStats.pendingScreenings >= 3 ? 'High priority' : 'Watch',
      evidence: [
        `Dashboard pendingScreenings = ${dashboardStats.pendingScreenings}.`,
        `Assigned pipeline candidates = ${dashboardStats.totalCandidates}.`,
      ],
      prompt:
        'Fetch dashboard stats and candidates in the new stage. Explain the screening bottleneck, rank what to process first, and give 3 next actions with charts if useful.',
    });
  }

  if (largestStage) {
    pushCard(cards, {
      id: 'largest-pipeline-stage',
      title: `${STAGE_LABELS[largestStage.stage]} is the visible bottleneck`,
      metric: formatCount(largestStage.count, 'candidate'),
      description:
        'This is the largest non-empty stage in the fetched funnel, so it is the best first place to inspect for stuck work.',
      tone: toneForCount(largestStage.count),
      priorityLabel: 'Bottleneck',
      evidence: [`${largestStage.stage} = ${largestStage.count}.`],
      prompt: `Analyze the ${STAGE_LABELS[largestStage.stage]} bottleneck. Fetch dashboard stats and smart insights, explain lobb el ghalta, render the pipeline chart or Mermaid diagram, and give 3 actions.`,
    });
  }

  if (largestSkillGap) {
    const gapDelta = largestSkillGap.demand - largestSkillGap.supply;
    pushCard(cards, {
      id: 'largest-skill-gap',
      title: `${largestSkillGap.skill} demand is ahead of supply`,
      metric: `+${gapDelta} gap`,
      description:
        'Demand exceeds parsed CV supply. This should drive sourcing, reskilling, or requirement calibration before adding more similar demand.',
      tone: gapDelta >= 5 ? 'danger' : 'warning',
      priorityLabel: 'Skill gap',
      evidence: [
        `${largestSkillGap.skill}: demand ${largestSkillGap.demand}.`,
        `${largestSkillGap.skill}: supply ${largestSkillGap.supply}.`,
      ],
      prompt: `Analyze the ${largestSkillGap.skill} skill gap. Fetch smart insights, CV pool stats, and jobs stats. Show demand vs supply charts, lobb el ghalta, and 3 sourcing actions.`,
    });
  }

  if (dashboardStats && dashboardStats.totalInterviewsToday > 0) {
    pushCard(cards, {
      id: 'interviews-today',
      title: 'Today has interview decisions to protect',
      metric: formatCount(dashboardStats.totalInterviewsToday, 'interview'),
      description:
        'Interview activity creates follow-up work. The proactive path is to check reports, decisions, and candidate movement.',
      tone: 'warning',
      priorityLabel: 'Today',
      evidence: [`totalInterviewsToday = ${dashboardStats.totalInterviewsToday}.`],
      prompt:
        'Fetch today interviews and candidate evidence. Tell me which interview follow-ups are highest priority and what action should happen next.',
    });
  }

  if (cvPoolStats && cvPoolStats.totalCvs === 0 && openJobs && openJobs > 0) {
    pushCard(cards, {
      id: 'empty-cv-pool',
      title: 'Open demand has no CV pool supply',
      metric: `${openJobs} jobs / 0 CVs`,
      description:
        'There are job records but no accessible CV pool supply, so matching and screening will stay blocked until CVs are uploaded or sourced.',
      tone: 'danger',
      priorityLabel: 'Supply risk',
      evidence: [`totalCvs = 0.`, `Open jobs = ${openJobs}.`],
      prompt:
        'Explain the CV supply risk. Fetch CV pool stats and jobs stats, then give a sourcing and upload plan with the highest impact first.',
    });
  }

  if (typeof unreadNotificationCount === 'number' && unreadNotificationCount > 0) {
    pushCard(cards, {
      id: 'unread-notifications',
      title: 'Unread notifications may hide blockers',
      metric: formatCount(unreadNotificationCount, 'unread notification'),
      description:
        'Notifications are operational signals. Reviewing them before new analysis prevents missed handoffs.',
      tone: unreadNotificationCount >= 5 ? 'warning' : 'neutral',
      priorityLabel: 'Inbox',
      evidence: [`Unread notifications = ${unreadNotificationCount}.`],
      prompt:
        'Fetch my notifications, group them by risk and urgency, then tell me what to handle first before I continue recruitment work.',
    });
  }

  const selectedCards = (cards.length > 0 ? cards : buildDefaultCards(role)).slice(0, 4);
  const leadCard = selectedCards[0];
  const defaultPrompt = ROLE_PROMPTS[role];
  const suggestedPrompts = [
    defaultPrompt,
    leadCard.prompt,
    'Show me the pipeline as a Mermaid diagram and explain the largest bottleneck from live data.',
    'Compare CV supply versus job demand, identify the biggest skill gap, and give 3 actions.',
  ].filter((prompt, index, prompts) => prompts.indexOf(prompt) === index);

  return {
    headline: leadCard.title,
    summary: `${leadCard.description} The cards below are precomputed from role-scoped page data; the agent prompts still fetch fresh tools before acting.`,
    cards: selectedCards,
    suggestedPrompts,
  };
}
