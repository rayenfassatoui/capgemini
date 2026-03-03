import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== AI-POWERED FEATURES ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'ai_interview_debrief',
    description:
      'After an interview report is submitted, analyze the candidate answers, score, and evaluation with AI. Returns a recommendation (accept/reject/hold), confidence level, strengths, weaknesses, and suggested next steps.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description:
            'UUID of the interview (must have a completed report)',
        },
      },
      required: ['interviewId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'compare_candidates',
    description:
      'Compare 2-5 candidates for the same job. Returns a detailed pros/cons table, overall fit scores, ranking, and a recommendation of the best candidate. Requires candidate IDs and a job ID.',
    parameters: {
      type: 'object',
      properties: {
        candidateIds: {
          type: 'array',
          description: 'Array of 2-5 candidate UUIDs to compare',
          items: { type: 'string' },
        },
        jobId: {
          type: 'string',
          description: 'UUID of the job to compare against',
        },
      },
      required: ['candidateIds', 'jobId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'generate_job_description',
    description:
      'Generate a complete, professional job description from a title and seniority. Returns a full JD with description, must-have skills, nice-to-have skills, ready to be used with create_job.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Job title, e.g. "Senior React Developer", "Data Engineer"',
        },
        seniority: {
          type: 'string',
          description:
            'Seniority level: Junior, Mid, Senior, Lead, Principal',
        },
        businessUnit: {
          type: 'string',
          description: 'Business unit (optional)',
        },
        additionalContext: {
          type: 'string',
          description:
            'Any additional context or specific requirements (optional)',
        },
      },
      required: ['title', 'seniority'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'generate_candidate_email',
    description:
      'Generate a professional offer or rejection email for a candidate using AI. Returns subject and body ready to send. For offers, includes onboarding document requirements.',
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
        emailType: {
          type: 'string',
          description: 'Type of email to generate',
          enum: ['offer', 'rejection'],
        },
      },
      required: ['candidateId', 'jobId', 'emailType'],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'predict_pipeline_score',
    description:
      'Predict the hiring probability for a candidate based on screening scores, interview reports, skill gaps, and pipeline stage. Returns probability, confidence, risk level, key factors, and a summary.',
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
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'ai_summarize_candidate',
    description:
      'Generate an executive summary of a candidate including key strengths, risks, fit score, and recommended next actions. Useful for hiring committee reviews or quick candidate overviews.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate to summarize',
        },
        jobId: {
          type: 'string',
          description:
            'UUID of the job to evaluate fit against (optional — if omitted, gives a general summary)',
        },
      },
      required: ['candidateId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'ai_talent_insights',
    description:
      'Analyze the entire talent pool to identify skill trends, skill gaps between supply and demand, pipeline health, and strategic recommendations. No parameters needed — analyzes all data.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'ai_followup_questions',
    description:
      'After an interview report is submitted, generate targeted follow-up questions that probe deeper into areas of concern or interest based on the candidate\'s answers. Great for preparing the next interview stage.',
    parameters: {
      type: 'object',
      properties: {
        interviewId: {
          type: 'string',
          description:
            'UUID of the interview (must have a completed report with candidate answers)',
        },
      },
      required: ['interviewId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'ai_optimize_job_requirements',
    description:
      'Analyze a job description and its screening performance data to suggest improvements. Returns clarity/competitiveness/inclusivity scores, specific suggestions, optimized requirements, and market insights.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to analyze and optimize',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  ai_interview_debrief: async (args, { services, resolveId, sanitizeForJson }) => {
    const interviewId = await resolveId(args.interviewId, 'interviewId');
    return sanitizeForJson(
      await services.generateInterviewDebrief(interviewId)
    );
  },

  compare_candidates: async (args, { services, resolveId, sanitizeForJson }) => {
    const rawIds = args.candidateIds as string[];
    const resolvedIds: string[] = [];
    for (const id of rawIds) {
      resolvedIds.push(await resolveId(id, 'candidateId'));
    }
    const jobId = await resolveId(args.jobId, 'jobId');
    return sanitizeForJson(
      await services.compareCandidates(resolvedIds, jobId)
    );
  },

  generate_job_description: async (args, { services, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.generateJobDescription(
        args.title as string,
        args.seniority as string,
        (args.businessUnit as string) ?? undefined,
        (args.additionalContext as string) ?? undefined
      )
    );
  },

  generate_candidate_email: async (args, { services, resolveId, sanitizeForJson }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const jobId = await resolveId(args.jobId, 'jobId');
    return sanitizeForJson(
      await services.generateCandidateEmail(
        candidateId,
        jobId,
        args.emailType as 'offer' | 'rejection'
      )
    );
  },

  predict_pipeline_score: async (args, { services, resolveId, sanitizeForJson }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const jobId = await resolveId(args.jobId, 'jobId');
    return sanitizeForJson(
      await services.predictPipelineScore(candidateId, jobId)
    );
  },

  ai_summarize_candidate: async (args, { services, resolveId, sanitizeForJson }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const jobId = args.jobId ? await resolveId(args.jobId, 'jobId') : undefined;
    return sanitizeForJson(
      await services.summarizeCandidate(candidateId, jobId)
    );
  },

  ai_talent_insights: async (_args, { services, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.analyzeTalentInsights()
    );
  },

  ai_followup_questions: async (args, { services, resolveId, sanitizeForJson }) => {
    const interviewId = await resolveId(args.interviewId, 'interviewId');
    return sanitizeForJson(
      await services.generateFollowupQuestions(interviewId)
    );
  },

  ai_optimize_job_requirements: async (args, { services, resolveId, sanitizeForJson }) => {
    const jobId = await resolveId(args.jobId, 'jobId');
    return sanitizeForJson(
      await services.optimizeJobRequirements(jobId)
    );
  },
};
