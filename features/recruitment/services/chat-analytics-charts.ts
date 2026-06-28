import * as z from 'zod/v3';

import type {
  RecruitmentAnalyticsChart,
  RecruitmentAnalyticsChartDatum,
} from '../types';

export interface AnalyticsChartToolRecord {
  toolName: string;
  result: {
    success: boolean;
    data?: unknown;
  };
}

interface ChartCandidate {
  chart: RecruitmentAnalyticsChart;
  priority: number;
  keywords: readonly string[];
  order: number;
}

interface BuildAnalyticsChartsOptions {
  question?: string;
  maxCharts?: number;
}

const DEFAULT_MAX_CHARTS = 4;

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

const CANDIDATE_STAGE_LABELS: Record<string, string> = {
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

const CANDIDATE_STAGE_ORDER = Object.keys(CANDIDATE_STAGE_LABELS);

const countBySkillSchema = z.object({
  skill: z.string(),
  count: z.number().finite().nonnegative(),
});

const countByLanguageSchema = z.object({
  language: z.string(),
  count: z.number().finite().nonnegative(),
});

const uploadTrendSchema = z.object({
  date: z.string(),
  count: z.number().finite().nonnegative(),
});

const cvPoolStatsSchema = z.object({
  totalCvs: z.number().finite().nonnegative(),
  topSkills: z.array(countBySkillSchema),
  languageDistribution: z.array(countByLanguageSchema),
  uploadTrend: z.array(uploadTrendSchema),
});

const jobsStatsSchema = z.object({
  totalJobs: z.number().finite().nonnegative(),
  bySeniority: z.array(
    z.object({
      seniority: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  byStatus: z.array(
    z.object({
      status: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  byBusinessUnit: z.array(
    z.object({
      unit: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  topSkillsDemand: z.array(countBySkillSchema),
});

const smartInsightsSchema = z.object({
  mostDemandedJobProfiles: z.array(
    z.object({
      title: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  mostCommonCvSkills: z.array(countBySkillSchema),
  skillGapAnalysis: z.array(
    z.object({
      skill: z.string(),
      demand: z.number().finite().nonnegative(),
      supply: z.number().finite().nonnegative(),
    })
  ),
  pipelineFunnel: z.record(z.string(), z.number().finite().nonnegative()),
});

const dashboardStatsSchema = z.object({
  totalCandidates: z.number().finite().nonnegative(),
  totalJobs: z.number().finite().nonnegative(),
  totalInterviewsToday: z.number().finite().nonnegative(),
  pendingScreenings: z.number().finite().nonnegative(),
  stageBreakdown: z.record(z.string(), z.number().finite().nonnegative()),
});

const adminRecruitmentAnalyticsSchema = z.object({
  pipelineFunnel: z.record(z.string(), z.number().finite().nonnegative()),
  hiringRate: z.number().finite().nonnegative(),
  rejectionRate: z.number().finite().nonnegative(),
  candidatesPerJob: z.array(
    z.object({
      jobTitle: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  interviewsPerStage: z.array(
    z.object({
      stage: z.string(),
      count: z.number().finite().nonnegative(),
    })
  ),
  monthlyHiringTrend: z.array(
    z.object({
      month: z.string(),
      hired: z.number().finite().nonnegative(),
      rejected: z.number().finite().nonnegative(),
    })
  ),
});

function hasPositiveValue(data: readonly RecruitmentAnalyticsChartDatum[], keys: readonly string[]): boolean {
  for (const datum of data) {
    for (const key of keys) {
      if (typeof datum[key] === 'number' && datum[key] > 0) {
        return true;
      }
    }
  }

  return false;
}

function pushCandidate(
  candidates: ChartCandidate[],
  chart: RecruitmentAnalyticsChart,
  priority: number,
  keywords: readonly string[]
) {
  if (!hasPositiveValue(chart.data, chart.series.map((series) => series.key))) {
    return;
  }

  const existingIndex = candidates.findIndex((candidate) => candidate.chart.id === chart.id);
  const candidate = {
    chart,
    priority,
    keywords,
    order: existingIndex === -1 ? candidates.length : candidates[existingIndex].order,
  };

  if (existingIndex === -1) {
    candidates.push(candidate);
    return;
  }

  candidates[existingIndex] = candidate;
}

function toCountData<T extends Record<string, string | number>>(
  items: readonly T[],
  labelKey: keyof T,
  countKey: keyof T,
  limit: number
): RecruitmentAnalyticsChartDatum[] {
  const data: RecruitmentAnalyticsChartDatum[] = [];

  for (const item of items.slice(0, limit)) {
    const label = String(item[labelKey]).trim();
    const value = item[countKey];
    if (!label || typeof value !== 'number') {
      continue;
    }

    data.push({ label, count: value });
  }

  return data;
}

function buildPipelineData(funnel: Record<string, number>): RecruitmentAnalyticsChartDatum[] {
  const data: RecruitmentAnalyticsChartDatum[] = [];

  for (const stage of CANDIDATE_STAGE_ORDER) {
    const count = funnel[stage] ?? 0;
    data.push({ label: CANDIDATE_STAGE_LABELS[stage], count });
  }

  return data;
}

function createCountChart({
  id,
  title,
  description,
  data,
  kind = 'bar',
  summary,
}: {
  id: string;
  title: string;
  description: string;
  data: RecruitmentAnalyticsChartDatum[];
  kind?: RecruitmentAnalyticsChart['kind'];
  summary?: string;
}): RecruitmentAnalyticsChart {
  return {
    id,
    kind,
    title,
    description,
    xKey: 'label',
    series: [{ key: 'count', label: 'Count', color: CHART_COLORS[0] }],
    data,
    ...(summary ? { summary } : {}),
  };
}

function addCvPoolCharts(candidates: ChartCandidate[], data: z.infer<typeof cvPoolStatsSchema>) {
  pushCandidate(
    candidates,
    createCountChart({
      id: 'cv-upload-trend',
      kind: 'line',
      title: 'CV upload trend',
      description: 'CVs uploaded over the last 7 days.',
      data: data.uploadTrend.map((item) => ({
        label: item.date.includes('-') ? item.date.slice(5) : item.date,
        count: item.count,
      })),
      summary: `${data.uploadTrend.reduce((sum, item) => sum + item.count, 0)} CV uploads in the visible window.`,
    }),
    78,
    ['trend', 'courbe', 'curve', 'line', 'upload', 'uploads', 'evolution', 'cv', 'cvs']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'cv-top-skills',
      title: 'Top CV skills',
      description: 'Most frequent skills found in the accessible CV pool.',
      data: toCountData(data.topSkills, 'skill', 'count', 8),
    }),
    58,
    ['skill', 'skills', 'competence', 'competences', 'cv', 'cvs', 'pool', 'talent']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'cv-languages',
      title: 'Language distribution',
      description: 'Languages detected across the accessible CV pool.',
      data: toCountData(data.languageDistribution, 'language', 'count', 8),
    }),
    42,
    ['language', 'languages', 'langue', 'langues', 'cv', 'cvs']
  );
}

function addJobsCharts(candidates: ChartCandidate[], data: z.infer<typeof jobsStatsSchema>) {
  pushCandidate(
    candidates,
    createCountChart({
      id: 'jobs-status',
      title: 'Jobs by status',
      description: 'Open and closed job requirements in the accessible workspace.',
      data: toCountData(data.byStatus, 'status', 'count', 8),
    }),
    54,
    ['job', 'jobs', 'status', 'open', 'closed', 'requirement', 'requirements']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'jobs-business-unit',
      title: 'Jobs by business unit',
      description: 'Job demand split by business unit.',
      data: toCountData(data.byBusinessUnit, 'unit', 'count', 8),
    }),
    50,
    ['business', 'unit', 'bu', 'department', 'jobs', 'demand']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'job-skill-demand',
      title: 'Most demanded skills',
      description: 'Skills appearing most often in job requirements.',
      data: toCountData(data.topSkillsDemand, 'skill', 'count', 8),
    }),
    62,
    ['skill', 'skills', 'demand', 'demanded', 'job', 'jobs', 'gap']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'jobs-seniority',
      title: 'Jobs by seniority',
      description: 'Role seniority distribution across job requirements.',
      data: toCountData(data.bySeniority, 'seniority', 'count', 8),
    }),
    46,
    ['seniority', 'senior', 'junior', 'lead', 'jobs']
  );
}

function addSmartInsightCharts(candidates: ChartCandidate[], data: z.infer<typeof smartInsightsSchema>) {
  pushCandidate(
    candidates,
    createCountChart({
      id: 'pipeline-funnel',
      title: 'Pipeline funnel',
      description: 'Candidates distributed across recruitment stages.',
      data: buildPipelineData(data.pipelineFunnel),
    }),
    90,
    ['pipeline', 'funnel', 'stage', 'stages', 'candidate', 'candidates', 'hiring', 'dashboard']
  );

  const skillGapData: RecruitmentAnalyticsChartDatum[] = [];
  for (const item of data.skillGapAnalysis.slice(0, 8)) {
    const label = item.skill.trim();
    if (!label) {
      continue;
    }

    skillGapData.push({
      label,
      demand: item.demand,
      supply: item.supply,
    });
  }

  pushCandidate(
    candidates,
    {
      id: 'skill-gap-demand-supply',
      kind: 'comparison-bar',
      title: 'Skill gap: demand vs supply',
      description: 'Job demand compared with CV pool supply for the largest gaps.',
      xKey: 'label',
      series: [
        { key: 'demand', label: 'Demand', color: CHART_COLORS[0] },
        { key: 'supply', label: 'Supply', color: CHART_COLORS[3] },
      ],
      data: skillGapData,
      summary: 'Higher demand than supply marks skills to prioritize in sourcing.',
    },
    82,
    ['skill', 'skills', 'gap', 'demand', 'supply', 'talent', 'analytics', 'insight', 'insights']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'demanded-job-profiles',
      title: 'Most demanded job profiles',
      description: 'Job profiles with the highest observed demand.',
      data: toCountData(data.mostDemandedJobProfiles, 'title', 'count', 8),
    }),
    64,
    ['profile', 'profiles', 'job', 'jobs', 'demand', 'demanded', 'role', 'roles']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'common-cv-skills',
      title: 'Common CV skills',
      description: 'Most frequent skills available in CV data.',
      data: toCountData(data.mostCommonCvSkills, 'skill', 'count', 8),
    }),
    56,
    ['skill', 'skills', 'cv', 'cvs', 'supply', 'pool']
  );
}

function addDashboardCharts(candidates: ChartCandidate[], data: z.infer<typeof dashboardStatsSchema>) {
  pushCandidate(
    candidates,
    createCountChart({
      id: 'dashboard-kpis',
      title: 'Recruitment KPI overview',
      description: 'Current high-level recruitment counters. Candidate count means assigned pipeline candidates, not uploaded CVs.',
      data: [
        { label: 'Pipeline candidates', count: data.totalCandidates },
        { label: 'Jobs', count: data.totalJobs },
        { label: 'Interviews today', count: data.totalInterviewsToday },
        { label: 'Pending screenings', count: data.pendingScreenings },
      ],
    }),
    70,
    ['dashboard', 'overview', 'kpi', 'kpis', 'analytics', 'stats', 'statistics']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'pipeline-funnel',
      title: 'Pipeline funnel',
      description: 'Candidates distributed across recruitment stages.',
      data: buildPipelineData(data.stageBreakdown),
    }),
    88,
    ['pipeline', 'funnel', 'stage', 'stages', 'candidate', 'candidates', 'hiring', 'dashboard']
  );
}

function addAdminAnalyticsCharts(
  candidates: ChartCandidate[],
  data: z.infer<typeof adminRecruitmentAnalyticsSchema>
) {
  pushCandidate(
    candidates,
    createCountChart({
      id: 'pipeline-funnel',
      title: 'Pipeline funnel',
      description: 'Candidates distributed across all recruitment stages.',
      data: buildPipelineData(data.pipelineFunnel),
    }),
    92,
    ['pipeline', 'funnel', 'stage', 'stages', 'candidate', 'candidates', 'hiring', 'dashboard', 'admin']
  );

  pushCandidate(
    candidates,
    {
      id: 'admin-hiring-trend',
      kind: 'line',
      title: 'Hiring trend',
      description: 'Hired and rejected candidates over the last 6 months.',
      xKey: 'label',
      series: [
        { key: 'hired', label: 'Hired', color: CHART_COLORS[3] },
        { key: 'rejected', label: 'Rejected', color: CHART_COLORS[0] },
      ],
      data: data.monthlyHiringTrend.map((item) => ({
        label: item.month,
        hired: item.hired,
        rejected: item.rejected,
      })),
      summary: `Current hiring rate ${data.hiringRate}% and rejection rate ${data.rejectionRate}%.`,
    },
    84,
    ['hiring', 'trend', 'month', 'monthly', 'rejected', 'rejection', 'courbe', 'analytics']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'admin-candidates-per-job',
      title: 'Candidates per job',
      description: 'Open workload concentration by job.',
      data: toCountData(data.candidatesPerJob, 'jobTitle', 'count', 8),
      summary: 'Jobs with more candidates may need faster screening decisions.',
    }),
    68,
    ['candidate', 'candidates', 'job', 'jobs', 'workload', 'analytics']
  );

  pushCandidate(
    candidates,
    createCountChart({
      id: 'admin-interviews-per-stage',
      title: 'Interviews by stage',
      description: 'Interview volume split by workflow stage.',
      data: toCountData(data.interviewsPerStage, 'stage', 'count', 8),
    }),
    60,
    ['interview', 'interviews', 'stage', 'stages', 'analytics']
  );
}

function countKeywordHits(question: string, keywords: readonly string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (question.includes(keyword)) {
      hits += 1;
    }
  }

  return hits;
}

function rankCharts(
  candidates: ChartCandidate[],
  question: string,
  maxCharts: number
): RecruitmentAnalyticsChart[] {
  const normalizedQuestion = question.toLowerCase();

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: candidate.priority + countKeywordHits(normalizedQuestion, candidate.keywords) * 18,
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, maxCharts)
    .map((candidate) => candidate.chart);
}

export function buildAnalyticsChartsFromToolRecords(
  records: readonly AnalyticsChartToolRecord[],
  options: BuildAnalyticsChartsOptions = {}
): RecruitmentAnalyticsChart[] {
  const candidates: ChartCandidate[] = [];

  for (const record of records) {
    if (!record.result.success) {
      continue;
    }

    if (record.toolName === 'get_cv_pool_stats') {
      const parsed = cvPoolStatsSchema.safeParse(record.result.data);
      if (parsed.success) {
        addCvPoolCharts(candidates, parsed.data);
      }
      continue;
    }

    if (record.toolName === 'get_jobs_stats') {
      const parsed = jobsStatsSchema.safeParse(record.result.data);
      if (parsed.success) {
        addJobsCharts(candidates, parsed.data);
      }
      continue;
    }

    if (record.toolName === 'get_smart_insights') {
      const parsed = smartInsightsSchema.safeParse(record.result.data);
      if (parsed.success) {
        addSmartInsightCharts(candidates, parsed.data);
      }
      continue;
    }

    if (record.toolName === 'get_dashboard_stats') {
      const parsed = dashboardStatsSchema.safeParse(record.result.data);
      if (parsed.success) {
        addDashboardCharts(candidates, parsed.data);
      }
      continue;
    }

    if (record.toolName === 'get_recruitment_analytics') {
      const parsed = adminRecruitmentAnalyticsSchema.safeParse(record.result.data);
      if (parsed.success) {
        addAdminAnalyticsCharts(candidates, parsed.data);
      }
    }
  }

  return rankCharts(
    candidates,
    options.question ?? '',
    options.maxCharts ?? DEFAULT_MAX_CHARTS
  );
}
