import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== INTERVIEWS + GUIDES + REPORTS + CALENDAR + RESCHEDULE/CANCEL ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'generate_interview_questions',
    description:
      'Generate AI-powered interview questions for a candidate at a specific stage (ta, manager, or hr). Creates or updates an interview guide.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        jobId: { type: 'string', description: 'UUID of the job' },
        stage: {
          type: 'string',
          description: 'Interview stage',
          enum: ['ta', 'manager', 'hr'],
        },
      },
      required: ['candidateId', 'jobId', 'stage'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'get_interview_guide',
    description:
      'Get the interview guide (questions) for a candidate at a specific stage.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        jobId: { type: 'string', description: 'UUID of the job' },
        stage: {
          type: 'string',
          description: 'Interview stage',
          enum: ['ta', 'manager', 'hr'],
        },
      },
      required: ['candidateId', 'jobId', 'stage'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'schedule_interview',
    description:
      'Schedule an interview for a candidate. Requires candidate ID, job ID, stage (ta/manager/hr), date (YYYY-MM-DD), time (HH:mm), and Google Meet link. Also updates the candidate stage accordingly.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        jobId: { type: 'string', description: 'UUID of the job' },
        stage: {
          type: 'string',
          description: 'Interview stage',
          enum: ['ta', 'manager', 'hr'],
        },
        scheduledDate: {
          type: 'string',
          description: 'Interview date in YYYY-MM-DD format',
        },
        scheduledTime: {
          type: 'string',
          description: 'Interview time in HH:mm format',
        },
        meetLink: {
          type: 'string',
          description: 'Google Meet or video call link (URL)',
        },
      },
      required: [
        'candidateId',
        'jobId',
        'stage',
        'scheduledDate',
        'scheduledTime',
        'meetLink',
      ],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'get_interview',
    description: 'Get details of a specific interview by ID.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview',
        },
      },
      required: ['interviewId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_today_interviews',
    description:
      "Get all interviews scheduled for today for the current user. Returns candidate name, job title, time, meet link, and status.",
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_interview_report',
    description: 'Get the report for a specific interview.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview',
        },
      },
      required: ['interviewId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_interview_reports_by_candidate',
    description: 'Get all interview reports for a specific candidate.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
      },
      required: ['candidateId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'reschedule_interview',
    description:
      'Reschedule an existing interview to a new date and time. The interview status will be reset to scheduled.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview to reschedule',
        },
        newDate: {
          type: 'string',
          description: 'New interview date in YYYY-MM-DD format',
        },
        newTime: {
          type: 'string',
          description: 'New interview time in HH:mm format',
        },
      },
      required: ['interviewId', 'newDate', 'newTime'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'cancel_interview',
    description:
      'Cancel a scheduled interview. Sets its status to cancelled.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview to cancel',
        },
      },
      required: ['interviewId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'create_interview_report',
    description:
      'Save an interview report with notes, candidate answers, score (0-100), and decision (pending/accepted/rejected). Also marks the interview as completed and updates the candidate stage accordingly.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview',
        },
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        stage: {
          type: 'string',
          description: 'Interview stage',
          enum: ['ta', 'manager', 'hr'],
        },
        notes: {
          type: 'string',
          description: 'Interviewer notes and observations (optional)',
        },
        candidateAnswers: {
          type: 'array',
          description:
            'Array of {question, answer} objects from the interview',
          items: { type: 'object' },
        },
        overallEvaluation: {
          type: 'string',
          description: 'Overall evaluation summary (optional)',
        },
        score: {
          type: 'string',
          description: 'Score from 0-100',
        },
        decision: {
          type: 'string',
          description: 'Decision: pending, accepted, or rejected',
          enum: ['pending', 'accepted', 'rejected'],
        },
      },
      required: ['interviewId', 'candidateId', 'stage', 'score', 'decision'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'get_interview_calendar',
    description:
      'Get all interviews within a date range for calendar display. Returns interviews grouped by date with candidate name, job title, time, meet link, and status.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['startDate', 'endDate'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  generate_interview_questions: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const guide = await services.generateInterviewQuestionsWithAI(
      await resolveId(args.candidateId, 'candidateId'),
      await resolveId(args.jobId, 'jobId'),
      args.stage as 'ta' | 'manager' | 'hr',
      ctx.userId
    );
    return sanitizeForJson(guide);
  },

  get_interview_guide: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getInterviewGuide(
        await resolveId(args.candidateId, 'candidateId'),
        await resolveId(args.jobId, 'jobId'),
        args.stage as 'ta' | 'manager' | 'hr'
      )
    );
  },

  schedule_interview: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const interview = await services.scheduleInterview(
      {
        candidateId: await resolveId(args.candidateId, 'candidateId'),
        jobId: await resolveId(args.jobId, 'jobId'),
        stage: args.stage as 'ta' | 'manager' | 'hr',
        scheduledDate: args.scheduledDate as string,
        scheduledTime: args.scheduledTime as string,
        meetLink: args.meetLink as string,
      },
      ctx.userId
    );
    return sanitizeForJson(interview);
  },

  get_interview: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getInterview(
        await resolveId(args.interviewId, 'interviewId')
      )
    );
  },

  get_today_interviews: async (_args, { services, sanitizeForJson, truncateArray, ctx }) => {
    const interviews = await services.getTodayInterviews(ctx.userId);
    return truncateArray(
      interviews.map((i) => sanitizeForJson(i)),
      20
    );
  },

  get_interview_report: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getInterviewReport(
        await resolveId(args.interviewId, 'interviewId')
      )
    );
  },

  get_interview_reports_by_candidate: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const reports = await services.getInterviewReportsByCandidate(
      await resolveId(args.candidateId, 'candidateId')
    );
    return truncateArray(
      reports.map((r) => sanitizeForJson(r)),
      20
    );
  },

  reschedule_interview: async (args, { services, resolveId, sanitizeForJson }) => {
    const interviewId = await resolveId(args.interviewId, 'interviewId');
    const updated = await services.rescheduleInterview(
      interviewId,
      args.newDate as string,
      args.newTime as string
    );
    return sanitizeForJson(updated);
  },

  cancel_interview: async (args, { services, resolveId, sanitizeForJson }) => {
    const interviewId = await resolveId(args.interviewId, 'interviewId');
    const cancelled = await services.cancelInterview(interviewId);
    return sanitizeForJson(cancelled);
  },

  create_interview_report: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const report = await services.saveInterviewReport(
      {
        interviewId: await resolveId(args.interviewId, 'interviewId'),
        candidateId: await resolveId(args.candidateId, 'candidateId'),
        stage: args.stage as 'ta' | 'manager' | 'hr',
        notes: (args.notes as string) ?? null,
        candidateAnswers:
          (args.candidateAnswers as Array<{
            question: string;
            answer: string;
          }>) ?? [],
        overallEvaluation: (args.overallEvaluation as string) ?? null,
        score: Number(args.score),
        decision: args.decision as 'pending' | 'accepted' | 'rejected',
      },
      ctx.userId
    );
    return sanitizeForJson(report);
  },

  get_interview_calendar: async (args, { sanitizeForJson, truncateArray, ctx }) => {
    const { getInterviewCalendar } = await import('../interviews');
    const events = await getInterviewCalendar(
      ctx.userId,
      args.startDate as string,
      args.endDate as string
    );
    return truncateArray(
      events.map((e) => sanitizeForJson(e)),
      50
    );
  },
};

