import type { AgentToolDefinition, ToolHandler } from './types';
import { searchCvsSemantically, hybridMatchCvsToJob } from '../cv-matching';
import { retrieveChunks, assembleContext } from '../retrieval-pipeline';

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
  {
    name: 'hybrid_search_cvs',
    description:
      "Advanced: Run a Hybrid Search (Reciprocal Rank Fusion) combining precise Keyword Matching with NLP-based Semantic Search. Use this when the user wants the absolute best, most accurate ranking of candidates for a specific job, as it neutralizes the weaknesses of both individual algorithms. Returns RRF scores and split rankings.",
    parameters: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'UUID of the job to match against',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results to return (default: 20)',
        },
      },
      required: ['jobId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'rag_search_cvs',
    description:
      'Advanced RAG (Retrieval Augmented Generation) search using chunked CV embeddings. Provides more precise matching by searching individual CV sections (skills, experience, education, summary) rather than whole CVs. Returns cited context with source sections. Use this for complex queries requiring specific section matching.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query describing the ideal candidate',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of chunks to return (default: 15, max: 20)',
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
  match_cvs_to_job: async (args, { services, resolveId, sanitizeForJson, truncateArray, ctx }) => {
    // Phase 1: Pass scope for consistent access control
    const scope = { userId: ctx.userId, role: ctx.role };
    const matches = await services.matchCvsToJob(
      await resolveId(args.jobId, 'jobId'),
      scope
    );
    return truncateArray(
      matches.map((m) => sanitizeForJson(m)),
      15
    );
  },

  hybrid_search_cvs: async (args, { resolveId, sanitizeForJson, truncateArray, ctx }) => {
    // Phase 1: Pass scope for consistent access control
    const scope = { userId: ctx.userId, role: ctx.role };
    const limit = args.limit ? parseInt(String(args.limit), 10) : 20;
    const matches = await hybridMatchCvsToJob(
      await resolveId(args.jobId, 'jobId'),
      limit,
      scope
    );
    return truncateArray(
      matches.map((m) => sanitizeForJson(m)),
      limit
    );
  },

  match_cvs_to_job_with_filters: async (args, { services, resolveId, sanitizeForJson, truncateArray, ctx }) => {
    // Phase 1: Pass scope for consistent access control
    const scope = { userId: ctx.userId, role: ctx.role };
    const matches = await services.matchCvsToJobWithFilters(
      await resolveId(args.jobId, 'jobId'),
      {
        skills: (args.skills as string[]) ?? [],
        languages: (args.languages as string[]) ?? [],
        minPositions: Number(args.minPositions ?? 0),
      },
      scope
    );
    return truncateArray(
      matches.map((m) => sanitizeForJson(m)),
      15
    );
  },

  generate_screening: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const screening = await services.generateScreeningWithAI(
      await resolveId(args.candidateId, 'candidateId'),
      await resolveId(args.jobId, 'jobId'),
      ctx.userId
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
    // Phase 1: Pass scope for consistent access control
    const scope = { userId: ctx.userId, role: ctx.role };
    const jobId = await resolveId(args.jobId, 'jobId');
    const count = Math.min(Math.max(Number(args.count ?? 5), 1), 20);
    const matches = await services.matchCvsToJob(jobId, scope);
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

  semantic_search_cvs: async (args, { sanitizeForJson, truncateArray, ctx }) => {
    // Phase 1: Pass scope for consistent access control
    const scope = { userId: ctx.userId, role: ctx.role };
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('A search query is required for semantic search');
    }

    const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30);
    const threshold = Math.min(Math.max(Number(args.threshold ?? 0.6), 0.1), 1.0);

    const results = await searchCvsSemantically(query, { threshold, limit, scope });

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

  rag_search_cvs: async (args, { sanitizeForJson, ctx }) => {
    const scope = { userId: ctx.userId, role: ctx.role };
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('A search query is required for RAG search');
    }

    const limit = Math.min(Math.max(Number(args.limit ?? 15), 1), 20);

    const result = await retrieveChunks(query, scope, {
      finalTopK: limit,
      enableRewrite: true,
      enableCache: true,
    });

    const context = assembleContext(result.chunks, 6000);

    return {
      query,
      rewrittenQuery: result.rewrittenQuery?.semanticQuery ?? query,
      totalChunks: result.chunks.length,
      totalCvs: context.cvCount,
      metrics: {
        vectorMs: result.metrics.vectorMs,
        lexicalMs: result.metrics.lexicalMs,
        totalMs: result.metrics.totalMs,
        cacheHit: result.metrics.cacheHit,
      },
      citations: context.citations,
      chunks: result.chunks.slice(0, limit).map(c => sanitizeForJson({
        cvId: c.cvId,
        candidateName: c.candidateName,
        sectionType: c.sectionType,
        chunkText: c.chunkText.slice(0, 500),
        score: Math.round(c.finalScore * 100) / 100,
      })),
    };
  },
};
