/**
 * Agent Tool Registry
 *
 * Defines every tool the agentic chat can call. Each tool maps to an existing
 * service function with explicit parameter schemas (OpenAI function-calling
 * format), RBAC role checks, and an executor that receives validated args +
 * session context.
 */

import type { UserRole, CandidateStage } from '../types';

// ---- Tool definition types ----

export interface AgentToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AgentToolParameter>;
    required: string[];
  };
  /** Roles that may invoke this tool. Empty = all roles. */
  allowedRoles: UserRole[];
  /** If true the tool mutates data (create/update/delete). */
  mutating: boolean;
}

export interface AgentToolContext {
  userId: string;
  role: UserRole;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: AgentToolContext
) => Promise<unknown>;

// ---- Registry ----

export const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  // ==================== CV POOL ====================
  {
    name: 'upload_cv',
    description:
      'Upload a CV file that was attached by the user to this conversation. Provide the attachment index (0-based) from the attachments list. This will store the CV, parse it, and extract candidate data (name, email, skills, experience, etc). Use this when the user attaches a file and asks you to upload or process it.',
    parameters: {
      type: 'object',
      properties: {
        attachmentIndex: {
          type: 'string',
          description:
            'The 0-based index of the attachment from the ATTACHMENTS list in the system prompt',
        },
      },
      required: ['attachmentIndex'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'list_cv_pool',
    description:
      'List all CVs uploaded by the current user in the CV pool. Returns id, filename, extractedName, extractedEmail, extractedSkills, createdAt for each CV.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_cv_details',
    description:
      'Get full details of a specific CV by its ID, including extracted name, email, phone, skills, experiences, education, languages, and summary.',
    parameters: {
      type: 'object',
      properties: {
        cvId: { type: 'string', description: 'UUID of the CV to retrieve' },
      },
      required: ['cvId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'delete_cv',
    description: 'Delete a CV from the pool by its ID.',
    parameters: {
      type: 'object',
      properties: {
        cvId: { type: 'string', description: 'UUID of the CV to delete' },
      },
      required: ['cvId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },

  // ==================== JOBS ====================
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
      'Create a new job posting. Requires title, description, mustHave skills array, and seniority level. Optionally niceToHave skills and businessUnit.',
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
          description: 'Array of must-have skills (at least 1)',
          items: { type: 'string' },
        },
        niceToHave: {
          type: 'array',
          description: 'Array of nice-to-have skills (optional)',
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

  // ==================== CANDIDATES ====================
  {
    name: 'get_candidates_by_job',
    description:
      'Get all candidates assigned to a specific job. Returns candidate info with their interview history.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'UUID of the job' },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_candidates_by_stage',
    description:
      'Get all candidates at specific pipeline stages. Stages: new, ta_screening, ta_interview, ta_accepted, ta_rejected, manager_interview, manager_accepted, manager_rejected, hr_interview, hr_accepted, hr_rejected, hired.',
    parameters: {
      type: 'object',
      properties: {
        stages: {
          type: 'array',
          description: 'Array of stage names to filter by',
          items: { type: 'string' },
        },
      },
      required: ['stages'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: false,
  },
  {
    name: 'get_candidate',
    description: 'Get detailed information about a specific candidate by ID.',
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
    name: 'update_candidate_stage',
    description:
      'Move a candidate to a new pipeline stage. Valid stages: new, ta_screening, ta_interview, ta_accepted, ta_rejected, manager_interview, manager_accepted, manager_rejected, hr_interview, hr_accepted, hr_rejected, hired.',
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        newStage: {
          type: 'string',
          description: 'The stage to move the candidate to',
          enum: [
            'new',
            'ta_screening',
            'ta_interview',
            'ta_accepted',
            'ta_rejected',
            'manager_interview',
            'manager_accepted',
            'manager_rejected',
            'hr_interview',
            'hr_accepted',
            'hr_rejected',
            'hired',
          ],
        },
      },
      required: ['candidateId', 'newStage'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'assign_cv_to_job',
    description:
      'Assign a CV from the pool to a job, creating a new candidate in the pipeline. The candidate will start at the "new" stage.',
    parameters: {
      type: 'object',
      properties: {
        cvId: {
          type: 'string',
          description: 'UUID of the CV from the pool',
        },
        jobId: {
          type: 'string',
          description: 'UUID of the job to assign to',
        },
      },
      required: ['cvId', 'jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },

  // ==================== CV MATCHING ====================
  {
    name: 'match_cvs_to_job',
    description:
      'Run basic keyword matching of all CVs in the pool against a job\'s requirements. Returns ranked list with match scores, matched skills, and gaps.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to match against',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'match_cvs_to_job_with_filters',
    description:
      'Run AI-enhanced matching of CVs against a job with optional filters (skills, languages, minimum experience positions). Returns ranked list with AI recommendations, strengths, and concerns for top candidates.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to match against',
        },
        skills: {
          type: 'array',
          description: 'Filter: only include CVs with these skills',
          items: { type: 'string' },
        },
        languages: {
          type: 'array',
          description: 'Filter: only include CVs speaking these languages',
          items: { type: 'string' },
        },
        minPositions: {
          type: 'string',
          description:
            'Filter: minimum number of past positions/experiences (as number)',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },

  // ==================== SCREENING ====================
  {
    name: 'generate_screening',
    description:
      'Run AI screening for a candidate against their assigned job. Generates a match score, skill analysis, gaps, and AI summary. Also moves candidate to ta_screening stage.',
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
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'get_screening',
    description:
      'Retrieve the latest screening result for a candidate and job.',
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

  // ==================== INTERVIEW GUIDES ====================
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

  // ==================== INTERVIEWS ====================
  {
    name: 'schedule_interview',
    description:
      'Schedule an interview for a candidate. Requires candidate ID, job ID, stage (ta/manager/hr), date (DD/MM/YYYY), time (HH:mm), and Google Meet link. Also updates the candidate stage accordingly.',
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
          description: 'Interview date in DD/MM/YYYY format',
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

  // ==================== INTERVIEW REPORTS ====================
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

  // ==================== DASHBOARD & STATISTICS ====================
  {
    name: 'get_dashboard_stats',
    description:
      'Get recruitment dashboard statistics: total candidates, total jobs, today\'s interviews, pending screenings, and stage breakdown.',
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

  // ==================== SEARCH CV POOL ====================
  {
    name: 'search_cv_pool',
    description:
      'Search and filter CVs in the pool by skills, languages, minimum experience positions, and/or location keyword. Returns matching CVs with extracted data.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          description: 'Filter: only include CVs with at least one of these skills',
          items: { type: 'string' },
        },
        languages: {
          type: 'array',
          description: 'Filter: only include CVs speaking at least one of these languages',
          items: { type: 'string' },
        },
        minExperience: {
          type: 'string',
          description: 'Filter: minimum number of past positions/experiences (as number)',
        },
        location: {
          type: 'string',
          description: 'Filter: keyword to search in CV text (city, country, region)',
        },
      },
      required: [],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },

  // ==================== BULK ASSIGN CVS ====================
  {
    name: 'bulk_assign_cvs_to_job',
    description:
      'Assign the top N matched CVs from the pool to a job in one action. Runs keyword matching first, then assigns the top scoring CVs that are not already assigned.',
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to assign CVs to',
        },
        count: {
          type: 'string',
          description: 'Number of top CVs to assign (default: 5)',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },

  // ==================== RESCHEDULE & CANCEL INTERVIEW ====================
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
          description: 'New interview date in DD/MM/YYYY format',
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

  // ==================== CREATE INTERVIEW REPORT ====================
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
          description: 'Array of {question, answer} objects from the interview',
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

  // ==================== EMAIL TOOLS ====================
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
          description: 'Interview date (DD/MM/YYYY)',
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

  // ==================== EXPORT ====================
  {
    name: 'export_candidates_csv',
    description:
      'Export accepted/hired candidates to an Excel file. Returns a confirmation message with the count of exported candidates. The file is generated server-side.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'hr', 'admin'],
    mutating: false,
  },
];

// ---- Tool executor map ----

function sanitizeForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJson);
  if (typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Strip large binary fields from results to keep token count down
      if (key === 'rawBytes' || key === 'rawText') continue;
      clean[key] = sanitizeForJson(value);
    }
    return clean;
  }
  return obj;
}

function truncateArray(arr: unknown[], max: number): unknown[] {
  if (arr.length <= max) return arr;
  return [
    ...arr.slice(0, max),
    `... and ${arr.length - max} more items (${arr.length} total)`,
  ];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_CANDIDATE_STAGES: CandidateStage[] = [
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'ta_rejected',
  'manager_interview',
  'manager_accepted',
  'manager_rejected',
  'hr_interview',
  'hr_accepted',
  'hr_rejected',
  'hired',
];

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const def = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!def) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // RBAC check
  if (def.allowedRoles.length > 0 && !def.allowedRoles.includes(ctx.role)) {
    return {
      success: false,
      error: `Access denied: your role (${ctx.role}) cannot use ${toolName}`,
    };
  }

  try {
    // Lazy-import services to avoid circular deps
    const services = await import('./index');

    const resolveId = async (
      value: unknown,
      paramName: 'cvId' | 'jobId' | 'candidateId' | 'interviewId'
    ): Promise<string> => {
      const raw = String(value ?? '').trim();
      if (UUID_RE.test(raw)) return raw;

      const index = Number(raw);
      const isIndex = Number.isInteger(index) && index >= 0;
      if (!isIndex) {
        throw new Error(
          `Invalid ${paramName}: expected a UUID or non-negative index, got "${raw}"`
        );
      }

      if (paramName === 'cvId') {
        const rows = await services.listCvPool(ctx.userId);
        if (index >= rows.length) {
          throw new Error(
            `Invalid cvId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
          );
        }
        return rows[index].id;
      }

      if (paramName === 'jobId') {
        const rows = await services.listJobs(ctx.userId);
        if (index >= rows.length) {
          throw new Error(
            `Invalid jobId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
          );
        }
        return rows[index].id;
      }

      if (paramName === 'candidateId') {
        const rows = await services.getCandidatesByStage(ALL_CANDIDATE_STAGES);
        if (index >= rows.length) {
          throw new Error(
            `Invalid candidateId index ${index}. Available range is 0-${Math.max(rows.length - 1, 0)}.`
          );
        }
        return rows[index].id;
      }

      const rows = await services.getTodayInterviews(ctx.userId);
      if (index >= rows.length) {
        throw new Error(
          `Invalid interviewId index ${index}. Available range for today's interviews is 0-${Math.max(rows.length - 1, 0)}.`
        );
      }
      return rows[index].interviewId;
    };

    let result: unknown;

    switch (toolName) {
      // ---- CV Upload (from chat attachment) ----
      case 'upload_cv': {
        // Attachment data is injected by the API route into the tool args
        const attachment = args._attachment as
          | { filename: string; contentType: string; size: number; rawBytes: string }
          | undefined;
        if (!attachment) {
          return {
            success: false,
            error:
              'No attachment data found at that index. Make sure the user attached a file.',
          };
        }

        // Step 1: Upload
        const cv = await services.uploadCv(
          {
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            rawBytes: attachment.rawBytes,
          },
          ctx.userId
        );

        // Step 2: Parse document text
        const rawText = await services.parseCvDocument(
          attachment.filename,
          attachment.contentType,
          attachment.rawBytes
        );

        // Step 3: AI extraction
        const extraction = await services.extractCvDataWithAI(rawText);

        // Step 4: Save extraction
        await services.updateCvExtraction(cv.id, {
          extractedName: extraction.extractedName,
          extractedEmail: extraction.extractedEmail,
          extractedPhone: extraction.extractedPhone,
          extractedSkills: extraction.extractedSkills,
          extractedExperiences: extraction.extractedExperiences,
          extractedEducation: extraction.extractedEducation,
          extractedLanguages: extraction.extractedLanguages,
          extractedSummary: extraction.extractedSummary,
        });
        await services.updateCvRawText(cv.id, rawText);

        result = {
          cvId: cv.id,
          filename: attachment.filename,
          extractedName: extraction.extractedName,
          extractedEmail: extraction.extractedEmail,
          extractedSkills: extraction.extractedSkills,
          extractedLanguages: extraction.extractedLanguages,
          extractedSummary: extraction.extractedSummary,
          message: 'CV uploaded and parsed successfully',
        };
        break;
      }

      // ---- CV Pool ----
      case 'list_cv_pool': {
        const cvs = await services.listCvPool(ctx.userId);
        result = truncateArray(
          cvs.map((cv) => sanitizeForJson(cv)),
          30
        );
        break;
      }
      case 'get_cv_details': {
        result = sanitizeForJson(
          await services.getCvDetails(await resolveId(args.cvId, 'cvId'))
        );
        break;
      }
      case 'delete_cv': {
        const cvId = await resolveId(args.cvId, 'cvId');
        await services.deleteCv(cvId, ctx.userId);
        result = { deleted: true, cvId };
        break;
      }

      // ---- Jobs ----
      case 'list_jobs': {
        const jobs = await services.listJobs(ctx.userId);
        result = truncateArray(
          jobs.map((j) => sanitizeForJson(j)),
          30
        );
        break;
      }
      case 'get_job': {
        result = sanitizeForJson(
          await services.getJob(await resolveId(args.jobId, 'jobId'))
        );
        break;
      }
      case 'create_job': {
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
        result = sanitizeForJson(job);
        break;
      }

      // ---- Candidates ----
      case 'get_candidates_by_job': {
        const cands = await services.getCandidatesByJob(
          await resolveId(args.jobId, 'jobId')
        );
        result = truncateArray(
          cands.map((c) => sanitizeForJson(c)),
          30
        );
        break;
      }
      case 'get_candidates_by_stage': {
        const cands = await services.getCandidatesByStage(
          args.stages as CandidateStage[]
        );
        result = truncateArray(
          cands.map((c) => sanitizeForJson(c)),
          30
        );
        break;
      }
      case 'get_candidate': {
        result = sanitizeForJson(
          await services.getCandidate(
            await resolveId(args.candidateId, 'candidateId')
          )
        );
        break;
      }
      case 'update_candidate_stage': {
        const updated = await services.updateCandidateStage(
          await resolveId(args.candidateId, 'candidateId'),
          args.newStage as CandidateStage
        );
        result = sanitizeForJson(updated);
        break;
      }
      case 'assign_cv_to_job': {
        const candidate = await services.assignCvToJob(
          await resolveId(args.cvId, 'cvId'),
          await resolveId(args.jobId, 'jobId'),
          ctx.userId
        );
        result = sanitizeForJson(candidate);
        break;
      }

      // ---- CV Matching ----
      case 'match_cvs_to_job': {
        const matches = await services.matchCvsToJob(
          await resolveId(args.jobId, 'jobId')
        );
        result = truncateArray(
          matches.map((m) => sanitizeForJson(m)),
          15
        );
        break;
      }
      case 'match_cvs_to_job_with_filters': {
        const matches = await services.matchCvsToJobWithFilters(
          await resolveId(args.jobId, 'jobId'),
          {
            skills: (args.skills as string[]) ?? [],
            languages: (args.languages as string[]) ?? [],
            minPositions: Number(args.minPositions ?? 0),
          }
        );
        result = truncateArray(
          matches.map((m) => sanitizeForJson(m)),
          15
        );
        break;
      }

      // ---- Screening ----
      case 'generate_screening': {
        const screening = await services.generateScreeningWithAI(
          await resolveId(args.candidateId, 'candidateId'),
          await resolveId(args.jobId, 'jobId')
        );
        result = sanitizeForJson(screening);
        break;
      }
      case 'get_screening': {
        result = sanitizeForJson(
          await services.getScreening(
            await resolveId(args.candidateId, 'candidateId'),
            await resolveId(args.jobId, 'jobId')
          )
        );
        break;
      }

      // ---- Interview Guides ----
      case 'generate_interview_questions': {
        const guide = await services.generateInterviewQuestionsWithAI(
          await resolveId(args.candidateId, 'candidateId'),
          await resolveId(args.jobId, 'jobId'),
          args.stage as 'ta' | 'manager' | 'hr',
          ctx.userId
        );
        result = sanitizeForJson(guide);
        break;
      }
      case 'get_interview_guide': {
        result = sanitizeForJson(
          await services.getInterviewGuide(
            await resolveId(args.candidateId, 'candidateId'),
            await resolveId(args.jobId, 'jobId'),
            args.stage as 'ta' | 'manager' | 'hr'
          )
        );
        break;
      }

      // ---- Interviews ----
      case 'schedule_interview': {
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
        result = sanitizeForJson(interview);
        break;
      }
      case 'get_interview': {
        result = sanitizeForJson(
          await services.getInterview(
            await resolveId(args.interviewId, 'interviewId')
          )
        );
        break;
      }
      case 'get_today_interviews': {
        const interviews = await services.getTodayInterviews(ctx.userId);
        result = truncateArray(
          interviews.map((i) => sanitizeForJson(i)),
          20
        );
        break;
      }

      // ---- Interview Reports ----
      case 'get_interview_report': {
        result = sanitizeForJson(
          await services.getInterviewReport(
            await resolveId(args.interviewId, 'interviewId')
          )
        );
        break;
      }
      case 'get_interview_reports_by_candidate': {
        const reports = await services.getInterviewReportsByCandidate(
          await resolveId(args.candidateId, 'candidateId')
        );
        result = truncateArray(
          reports.map((r) => sanitizeForJson(r)),
          20
        );
        break;
      }

      // ---- Dashboard & Statistics ----
      case 'get_dashboard_stats': {
        result = sanitizeForJson(
          await services.getDashboardStats(ctx.userId, ctx.role)
        );
        break;
      }
      case 'get_cv_pool_stats': {
        result = sanitizeForJson(
          await services.getCvPoolStats(ctx.userId)
        );
        break;
      }
      case 'get_jobs_stats': {
        result = sanitizeForJson(
          await services.getJobsStats(ctx.userId)
        );
        break;
      }
      case 'get_smart_insights': {
        result = sanitizeForJson(
          await services.getSmartInsights(ctx.userId)
        );
        break;
      }

      // ---- Search CV Pool ----
      case 'search_cv_pool': {
        const filtered = await services.searchCvPool(ctx.userId, {
          skills: (args.skills as string[]) ?? undefined,
          languages: (args.languages as string[]) ?? undefined,
          minExperience: args.minExperience
            ? Number(args.minExperience)
            : undefined,
          location: (args.location as string) ?? undefined,
        });
        result = truncateArray(
          filtered.map((cv) => sanitizeForJson(cv)),
          30
        );
        break;
      }

      // ---- Bulk Assign CVs to Job ----
      case 'bulk_assign_cvs_to_job': {
        const jobId = await resolveId(args.jobId, 'jobId');
        const count = Math.min(Math.max(Number(args.count ?? 5), 1), 20);
        const matches = await services.matchCvsToJob(jobId);
        const toAssign = matches
          .filter((m) => !m.alreadyAssigned)
          .slice(0, count);

        const assigned: unknown[] = [];
        for (const match of toAssign) {
          try {
            const candidate = await services.assignCvToJob(
              match.cvId,
              jobId,
              ctx.userId
            );
            assigned.push(sanitizeForJson(candidate));
          } catch {
            // Skip already assigned or other errors
          }
        }
        result = {
          assignedCount: assigned.length,
          requestedCount: count,
          totalMatches: matches.length,
          candidates: assigned,
        };
        break;
      }

      // ---- Reschedule Interview ----
      case 'reschedule_interview': {
        const interviewId = await resolveId(args.interviewId, 'interviewId');
        const updated = await services.rescheduleInterview(
          interviewId,
          args.newDate as string,
          args.newTime as string
        );
        result = sanitizeForJson(updated);
        break;
      }

      // ---- Cancel Interview ----
      case 'cancel_interview': {
        const interviewId = await resolveId(args.interviewId, 'interviewId');
        const cancelled = await services.cancelInterview(interviewId);
        result = sanitizeForJson(cancelled);
        break;
      }

      // ---- Create Interview Report ----
      case 'create_interview_report': {
        const report = await services.saveInterviewReport(
          {
            interviewId: await resolveId(args.interviewId, 'interviewId'),
            candidateId: await resolveId(args.candidateId, 'candidateId'),
            stage: args.stage as 'ta' | 'manager' | 'hr',
            notes: (args.notes as string) ?? null,
            candidateAnswers: (args.candidateAnswers as Array<{
              question: string;
              answer: string;
            }>) ?? [],
            overallEvaluation: (args.overallEvaluation as string) ?? null,
            score: Number(args.score),
            decision: args.decision as 'pending' | 'accepted' | 'rejected',
          },
          ctx.userId
        );
        result = sanitizeForJson(report);
        break;
      }

      // ---- Send Interview Invite Email ----
      case 'send_interview_invite_email': {
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
        result = sanitizeForJson(emailLog);
        break;
      }

      // ---- Send Rejection Email ----
      case 'send_rejection_email': {
        const candidateId = await resolveId(args.candidateId, 'candidateId');
        const jobId = await resolveId(args.jobId, 'jobId');
        const candidate = await services.getCandidate(candidateId);
        if (!candidate) {
          return { success: false, error: 'Candidate not found' };
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
        result = sanitizeForJson(emailLog);
        break;
      }

      // ---- Export Candidates CSV ----
      case 'export_candidates_csv': {
        const buffer = await services.exportAcceptedCandidatesToExcel();
        result = {
          message: 'Export generated successfully',
          sizeBytes: buffer.length,
          format: 'xlsx',
        };
        break;
      }

      default:
        return { success: false, error: `Unimplemented tool: ${toolName}` };
    }

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Build the OpenAI-compatible `tools` array for the LLM request,
 * filtered to only include tools the user's role can access.
 */
export function getToolsForRole(role: UserRole) {
  return TOOL_DEFINITIONS.filter(
    (t) => t.allowedRoles.length === 0 || t.allowedRoles.includes(role)
  ).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
