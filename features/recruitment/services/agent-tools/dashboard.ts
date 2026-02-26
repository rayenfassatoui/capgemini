import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== DASHBOARD & STATISTICS ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'get_dashboard_stats',
    description:
      "Get recruitment dashboard statistics: total candidates, total jobs, today's interviews, pending screenings, and stage breakdown.",
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_cv_pool_stats',
    description:
      'Get CV pool statistics: total CVs, top skills, language distribution, and upload trend.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_jobs_stats',
    description:
      'Get job statistics: total jobs, by seniority, by status, by business unit, and top skills demand.',
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
