import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== ACTIVITY LOG + ONBOARDING CHECKLIST ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'get_activity_log',
    description:
      'Get the global activity log showing recent actions across the platform (stage changes, interviews, reports, etc.).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'string',
          description: 'Maximum number of entries to return (default 50)',
        },
      },
      required: [],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_activity_by_entity',
    description:
      'Get activity log entries for a specific entity (candidate, job, interview).',
    parameters: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          description: 'Type of entity',
          enum: ['candidate', 'job', 'interview'],
        },
        entityId: {
          type: 'string',
          description: 'UUID of the entity',
        },
      },
      required: ['entityType', 'entityId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_onboarding_checklist',
    description:
      'Get the onboarding checklist for a hired candidate. Creates default tasks if none exist.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate (must be at "hired" stage)',
        },
      },
      required: ['candidateId'],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'toggle_onboarding_task',
    description: 'Mark an onboarding task as completed or uncompleted.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'UUID of the onboarding task',
        },
        completed: {
          type: 'string',
          description: 'true or false',
        },
      },
      required: ['taskId', 'completed'],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'add_onboarding_task',
    description:
      "Add a custom onboarding task to a candidate's checklist.",
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        title: {
          type: 'string',
          description: 'Task title',
        },
        description: {
          type: 'string',
          description: 'Task description (optional)',
        },
      },
      required: ['candidateId', 'title'],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'get_activity_log_enriched',
    description:
      'Get the enriched activity log with candidate stage information resolved for each entry.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'string',
          description: 'Maximum number of entries to return (default 50)',
        },
      },
      required: [],
    },
    allowedRoles: ['admin'],
    mutating: false,
  },
  {
    name: 'export_activity_log',
    description:
      'Export the activity log to an Excel file. Returns base64-encoded .xlsx data.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  get_activity_log: async (args, { services, sanitizeForJson, truncateArray }) => {
    const limit = Number(args.limit ?? 50);
    const entries = await services.getActivityLog(limit);
    return truncateArray(
      entries.map((e) => sanitizeForJson(e)),
      50
    );
  },

  get_activity_by_entity: async (args, { services, sanitizeForJson, truncateArray }) => {
    const entries = await services.getActivityByEntity(
      args.entityType as string,
      args.entityId as string
    );
    return truncateArray(
      entries.map((e) => sanitizeForJson(e)),
      30
    );
  },

  get_onboarding_checklist: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const tasks = await services.createOnboardingChecklist(candidateId);
    return truncateArray(
      tasks.map((t) => sanitizeForJson(t)),
      20
    );
  },

  toggle_onboarding_task: async (args, { services, sanitizeForJson, ctx }) => {
    const completed = String(args.completed).toLowerCase() === 'true';
    const task = await services.toggleOnboardingTask(
      args.taskId as string,
      completed,
      ctx.userId
    );
    return sanitizeForJson(task);
  },

  add_onboarding_task: async (args, { services, resolveId, sanitizeForJson }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const task = await services.addOnboardingTask(
      candidateId,
      args.title as string,
      (args.description as string) ?? undefined
    );
    return sanitizeForJson(task);
  },

  get_activity_log_enriched: async (args, { sanitizeForJson, truncateArray }) => {
    const { getActivityLogEnriched } = await import('../activity-log');
    const limit = Number(args.limit ?? 50);
    const entries = await getActivityLogEnriched(limit);
    return truncateArray(
      entries.map((e) => sanitizeForJson(e)),
      50
    );
  },

  export_activity_log: async () => {
    const { exportActivityLogToExcel } = await import('../export');
    const buffer = await exportActivityLogToExcel();
    return { base64: Buffer.from(buffer).toString('base64'), filename: 'activity-log.xlsx' };
  },
};
