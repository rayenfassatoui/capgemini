import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== CV MATCHING + SCREENING + BULK ASSIGN ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'match_cvs_to_job',
    description:
      "Run basic keyword matching of all CVs in the pool against a job's requirements. Returns ranked list with match scores, matched skills, and gaps.",
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
  {
    name: 'semantic_search_cvs',
    description:
      'Perform semantic (meaning-based) search across all CVs in the pool using AI embeddings. Unlike keyword matching, this finds CVs that are conceptually relevant even if they use different terminology. Use natural language queries like "experienced Java backend developer with microservices" or "bilingual project manager with agile experience". Returns ranked results with similarity scores.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language description of the ideal candidate profile, skills, or experience to search for',
        },
        limit: {
          type: 'string',
          description:
            'Maximum number of results to return (default: 10, max: 30)',
        },
        threshold: {
          type: 'string',
          description:
            'Cosine distance threshold (0-1, lower = stricter match). Default: 0.6. Use 0.4 for strict matches, 0.8 for broad matches.',
        },
      },
      required: ['query'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  match_cvs_to_job: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const matches = await services.matchCvsToJob(
      await resolveId(args.jobId, 'jobId')
    );
    return truncateArray(
      matches.map((m) => sanitizeForJson(m)),
      15
    );
  },

  match_cvs_to_job_with_filters: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const matches = await services.matchCvsToJobWithFilters(
      await resolveId(args.jobId, 'jobId'),
      {
        skills: (args.skills as string[]) ?? [],
        languages: (args.languages as string[]) ?? [],
        minPositions: Number(args.minPositions ?? 0),
      }
    );
    return truncateArray(
      matches.map((m) => sanitizeForJson(m)),
      15
    );
  },

  generate_screening: async (args, { services, resolveId, sanitizeForJson }) => {
    const screening = await services.generateScreeningWithAI(
      await resolveId(args.candidateId, 'candidateId'),
      await resolveId(args.jobId, 'jobId')
    );
    return sanitizeForJson(screening);
  },

  get_screening: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getScreening(
        await resolveId(args.candidateId, 'candidateId'),
        await resolveId(args.jobId, 'jobId')
      )
    );
  },

  bulk_assign_cvs_to_job: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
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
    return {
      assignedCount: assigned.length,
      requestedCount: count,
      totalMatches: matches.length,
      candidates: assigned,
    };
  },

  semantic_search_cvs: async (args, { sanitizeForJson, truncateArray }) => {
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('A search query is required for semantic search');
    }

    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30);
    const threshold = Math.min(Math.max(Number(args.threshold ?? 0.6), 0.1), 1.0);

    const { searchCvsSemantically } = await import('../cv-matching');
    const results = await searchCvsSemantically(query, { threshold, limit });

    return {
      query,
      totalResults: results.length,
      threshold,
      results: truncateArray(
        results.map((r) => sanitizeForJson(r)),
        limit
      ),
    };
  },
};
