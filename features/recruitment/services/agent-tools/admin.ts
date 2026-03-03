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
  {
    name: 'get_onboarding_detailed',
    description:
      'Get detailed onboarding data for all hired candidates including full CV data (skills, languages, education, experiences, summary), onboarding task details, and candidate stage.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'export_email_logs',
    description:
      'Export all email logs to an Excel file. Returns base64-encoded .xlsx data.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'export_onboarding',
    description:
      'Export onboarding data (overview, CV data, tasks) to an Excel file with multiple sheets. Returns base64-encoded .xlsx data.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'generate_candidate_accept_excel',
    description:
      'Generate a comprehensive Excel report for an accepted candidate including candidate info, CV/formation data, interview reports, and Q&A details. Returns base64-encoded .xlsx data.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        stage: {
          type: 'string',
          description: 'Interview stage that accepted the candidate',
          enum: ['ta', 'manager', 'hr'],
        },
      },
      required: ['candidateId', 'stage'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
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

  get_onboarding_detailed: async (_args, { sanitizeForJson, truncateArray }) => {
    const { getHiredCandidatesOnboardingDetailed } = await import('../admin');
    const entries = await getHiredCandidatesOnboardingDetailed();
    return truncateArray(
      entries.map((e) => sanitizeForJson(e)),
      20
    );
  },

  export_email_logs: async () => {
    const { exportEmailLogsToExcel } = await import('../export');
    const buffer = await exportEmailLogsToExcel();
    return { base64: Buffer.from(buffer).toString('base64'), filename: 'email-logs.xlsx' };
  },

  export_onboarding: async () => {
    const { exportOnboardingToExcel } = await import('../export');
    const buffer = await exportOnboardingToExcel();
    return { base64: Buffer.from(buffer).toString('base64'), filename: 'onboarding.xlsx' };
  },

  generate_candidate_accept_excel: async (args, { resolveId }) => {
    const { generateCandidateAcceptExcel } = await import('../export');
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const stage = args.stage as 'ta' | 'manager' | 'hr';
    const buffer = await generateCandidateAcceptExcel(candidateId, stage);
    return { base64: Buffer.from(buffer).toString('base64'), filename: `candidate-accept-${stage}.xlsx` };
  },
};
