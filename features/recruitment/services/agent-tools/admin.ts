import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== ADMIN TOOLS ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'get_system_overview',
    description:
      'Get a high-level system overview: total users (with per-role breakdown), total jobs, candidates, CVs in pool, interviews, and the 10 most recent activity entries.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'get_recruitment_analytics',
    description:
      'Get detailed recruitment analytics: full pipeline funnel (all 12 stages), hiring rate, rejection rate, candidates per job (top 10), interviews per stage, monthly hiring trend (last 6 months), and top recruiters leaderboard.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'get_email_logs',
    description:
      'Get the audit trail of all emails sent from the platform (interview invites, rejections, offers). Returns recipient, subject, sender, status, and timestamp.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'string',
          description: 'Maximum number of entries to return (default 100)',
        },
      },
      required: [],
    },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'get_onboarding_overview',
    description:
      'Get onboarding progress for all hired candidates. Returns each candidate with their job title, total onboarding tasks, completed tasks count, and hired date.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  get_system_overview: async (_args, { sanitizeForJson }) => {
    const { getSystemOverview } = await import('../admin');
    return sanitizeForJson(await getSystemOverview());
  },

  get_recruitment_analytics: async (_args, { sanitizeForJson }) => {
    const { getRecruitmentAnalytics } = await import('../admin');
    return sanitizeForJson(await getRecruitmentAnalytics());
  },

  get_email_logs: async (args, { sanitizeForJson, truncateArray }) => {
    const { getEmailLogs } = await import('../admin');
    const limit = Number(args.limit ?? 100);
    const logs = await getEmailLogs(limit);
    return truncateArray(
      logs.map((e) => sanitizeForJson(e)),
      50
    );
  },

  get_onboarding_overview: async (_args, { sanitizeForJson, truncateArray }) => {
    const { getHiredCandidatesOnboarding } = await import('../admin');
    const entries = await getHiredCandidatesOnboarding();
    return truncateArray(
      entries.map((e) => sanitizeForJson(e)),
      30
    );
  },
};
