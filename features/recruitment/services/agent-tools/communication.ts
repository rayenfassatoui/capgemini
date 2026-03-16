import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== EMAIL + EXPORT + NOTIFICATIONS ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'send_interview_invite_email',
    description:
      'Send an interview invitation email to a candidate with date, time, and Google Meet link details.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description: 'UUID of the interview',
        },
        candidateEmail: {
          type: 'string',
          description: 'Candidate email address',
        },
        candidateName: {
          type: 'string',
          description: 'Candidate full name',
        },
        jobTitle: {
          type: 'string',
          description: 'Job title',
        },
        scheduledDate: {
          type: 'string',
          description: 'Interview date (YYYY-MM-DD)',
        },
        scheduledTime: {
          type: 'string',
          description: 'Interview time (HH:mm)',
        },
        meetLink: {
          type: 'string',
          description: 'Google Meet link',
        },
        interviewerName: {
          type: 'string',
          description: 'Name of the interviewer',
        },
        stage: {
          type: 'string',
          description: 'Interview stage',
          enum: ['ta', 'manager', 'hr'],
        },
      },
      required: [
        'interviewId',
        'candidateEmail',
        'candidateName',
        'jobTitle',
        'scheduledDate',
        'scheduledTime',
        'meetLink',
        'interviewerName',
        'stage',
      ],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'send_rejection_email',
    description:
      'Generate and send a professional rejection email to a candidate using AI. The email is warm, respectful, and encourages future applications.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        jobId: {
          type: 'string',
          description: 'UUID of the job',
        },
      },
      required: ['candidateId', 'jobId'],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'export_candidates_csv',
    description:
      'Export accepted/hired candidates to an Excel file. Returns a confirmation message with the count of exported candidates. The file is generated server-side.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_notifications',
    description:
      "Get the current user's notifications (latest 20). Each includes type, title, message, read status, and timestamp.",
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: [],
    mutating: false,
  },
  {
    name: 'mark_notification_read',
    description: 'Mark a specific notification as read.',
    parameters: {
      type: 'object',
      properties: {
        notificationId: {
          type: 'string',
          description: 'UUID of the notification',
        },
      },
      required: ['notificationId'],
    },
    allowedRoles: [],
    mutating: true,
  },
  {
    name: 'mark_all_notifications_read',
    description:
      "Mark all of the current user's unread notifications as read.",
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: [],
    mutating: true,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  send_interview_invite_email: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const emailLog = await services.sendInterviewEmail(
      {
        interviewId: await resolveId(args.interviewId, 'interviewId'),
        candidateEmail: args.candidateEmail as string,
        candidateName: args.candidateName as string,
        jobTitle: args.jobTitle as string,
        scheduledDate: args.scheduledDate as string,
        scheduledTime: args.scheduledTime as string,
        meetLink: args.meetLink as string,
        interviewerName: args.interviewerName as string,
        stage: args.stage as 'ta' | 'manager' | 'hr',
      },
      ctx.userId
    );
    return sanitizeForJson(emailLog);
  },

  send_rejection_email: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const jobId = await resolveId(args.jobId, 'jobId');
    const candidate = await services.getCandidate(candidateId);
    if (!candidate) {
      throw new Error('Candidate not found');
    }
    const emailContent = await services.generateHRDecisionEmailWithAI(
      candidateId,
      jobId,
      'rejected'
    );
    const emailLog = await services.sendHRDecisionEmail(
      {
        toEmail: candidate.email,
        toName: candidate.fullName,
        subject: emailContent.subject,
        body: emailContent.body,
      },
      ctx.userId
    );
    return sanitizeForJson(emailLog);
  },

  export_candidates_csv: async (_args, { services }) => {
    const buffer = await services.exportAcceptedCandidatesToExcel();
    return {
      message: 'Export generated successfully',
      sizeBytes: buffer.length,
      format: 'xlsx',
      _fileDownload: {
        filename: `accepted-candidates-${new Date().toISOString().split('T')[0]}.xlsx`,
        base64: Buffer.from(buffer).toString('base64'),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    };
  },

  get_notifications: async (_args, { services, sanitizeForJson, truncateArray, ctx }) => {
    const notifs = await services.getNotifications(ctx.userId);
    return truncateArray(
      notifs.map((n) => sanitizeForJson(n)),
      20
    );
  },

  mark_notification_read: async (args, { services, sanitizeForJson, ctx }) => {
    const updated = await services.markNotificationRead(
      args.notificationId as string,
      ctx.userId
    );
    return sanitizeForJson(updated);
  },

  mark_all_notifications_read: async (_args, { services, ctx }) => {
    await services.markAllNotificationsRead(ctx.userId);
    return { message: 'All notifications marked as read' };
  },
};

