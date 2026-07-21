import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== DASHBOARD & STATISTICS ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'get_dashboard_stats',
    description:
      "Get recruitment dashboard statistics. totalJobs is platform-wide. totalCandidates, pendingScreenings, and stageBreakdown are platform-wide for TA/admin but limited to assigned candidates for Manager/HR. totalInterviewsToday is for the current user. This does not count uploaded CV pool size.",
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_cv_pool_stats',
    description:
      'Get statistics only for CVs uploaded by the current user: total CVs, top skills, language distribution, and upload trend.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_jobs_stats',
    description:
      'Get statistics only for jobs created by the current user: total jobs, by seniority, by status, by business unit, and top skills demand.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_smart_insights',
    description:
      'Get smart recruitment insights: most demanded job profiles, most common CV skills, skill gap analysis (demand vs supply), and pipeline funnel.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  get_dashboard_stats: async (_args, { services, sanitizeForJson, ctx }) => {
    return sanitizeForJson(
      await services.getDashboardStats(ctx.userId, ctx.role)
    );
  },

  get_cv_pool_stats: async (_args, { services, sanitizeForJson, ctx }) => {
    return sanitizeForJson(await services.getCvPoolStats(ctx.userId));
  },

  get_jobs_stats: async (_args, { services, sanitizeForJson, ctx }) => {
    return sanitizeForJson(await services.getJobsStats(ctx.userId));
  },

  get_smart_insights: async (_args, { services, sanitizeForJson, ctx }) => {
    return sanitizeForJson(await services.getSmartInsights(ctx.userId));
  },
};
