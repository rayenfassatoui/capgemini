import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== JOBS + JOB TEMPLATES ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'list_jobs',
    description:
      'List all jobs created by the current user. Returns id, title, description, mustHave, niceToHave, seniority, businessUnit, status, createdAt.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_job',
    description: 'Get full details of a specific job by its ID.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'UUID of the job to retrieve' },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'create_job',
    description:
      'Create a new job posting. Requires title, description, atomic mustHave skill labels, and seniority level. Optionally atomic niceToHave skill labels and businessUnit.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Job title (2-120 chars)' },
        description: {
          type: 'string',
          description: 'Detailed job description (min 20 chars)',
        },
        mustHave: {
          type: 'array',
          description:
            'Atomic must-have skill labels only. Use short terms like Figma, Accessibility, User research. Never send full requirement sentences.',
          items: { type: 'string' },
        },
        niceToHave: {
          type: 'array',
          description:
            'Atomic nice-to-have skill labels only. Use short terms, not qualifications or full sentences.',
          items: { type: 'string' },
        },
        seniority: {
          type: 'string',
          description: 'Seniority level, e.g. Junior, Mid, Senior, Lead',
        },
        businessUnit: {
          type: 'string',
          description: 'Business unit (optional)',
        },
      },
      required: ['title', 'description', 'mustHave', 'seniority'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'close_job',
    description:
      'Close an open job. Allowed only when there are no scheduled interviews and no in-progress candidates for that job.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'UUID of the job to close' },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'save_job_as_template',
    description:
      'Mark an existing job as a template so it can be reused to create new jobs.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to save as template',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'list_job_templates',
    description:
      'List all saved job templates. Returns id, title, description, mustHave, niceToHave, seniority.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'create_job_from_template',
    description:
      'Create a new job from an existing template. Optionally override the title and description.',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'UUID of the template job',
        },
        title: {
          type: 'string',
          description: 'Override title (optional)',
        },
        description: {
          type: 'string',
          description: 'Override description (optional)',
        },
      },
      required: ['templateId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  list_jobs: async (_args, { services, sanitizeForJson, truncateArray, ctx }) => {
    const jobs = await services.listJobs(ctx.userId);
    return truncateArray(
      jobs.map((j) => sanitizeForJson(j)),
      30
    );
  },

  get_job: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getJob(await resolveId(args.jobId, 'jobId'))
    );
  },

  create_job: async (args, { services, sanitizeForJson, ctx }) => {
    const job = await services.createJob(
      {
        title: args.title as string,
        description: args.description as string,
        mustHave: args.mustHave as string[],
        niceToHave: (args.niceToHave as string[]) ?? [],
        seniority: args.seniority as string,
        businessUnit: (args.businessUnit as string) ?? null,
      },
      ctx.userId
    );
    return sanitizeForJson(job);
  },

  close_job: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const closedJob = await services.closeJob(
      await resolveId(args.jobId, 'jobId'),
      ctx.userId,
      ctx.role
    );
    return sanitizeForJson(closedJob);
  },

  save_job_as_template: async (args, { services, resolveId, sanitizeForJson }) => {
    const jobId = await resolveId(args.jobId, 'jobId');
    return sanitizeForJson(await services.saveJobAsTemplate(jobId));
  },

  list_job_templates: async (_args, { services, sanitizeForJson, truncateArray }) => {
    const templates = await services.listJobTemplates();
    return truncateArray(
      templates.map((t) => sanitizeForJson(t)),
      20
    );
  },

  create_job_from_template: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const templateId = await resolveId(args.templateId as string, 'jobId');
    const job = await services.createJobFromTemplate(templateId, ctx.userId, {
      title: (args.title as string) ?? undefined,
      description: (args.description as string) ?? undefined,
    });
    return sanitizeForJson(job);
  },
};
