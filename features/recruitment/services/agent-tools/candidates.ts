import type { CandidateStage } from '../../types';
import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== CANDIDATES + NOTES + BULK STAGE UPDATE ====================

export const definitions: AgentToolDefinition[] = [
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
  {
    name: 'add_candidate_note',
    description:
      "Add a text note to a candidate's profile. Notes are visible to all team members working on that candidate.",
    parameters: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'UUID of the candidate',
        },
        content: {
          type: 'string',
          description: 'Note text content',
        },
      },
      required: ['candidateId', 'content'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
  {
    name: 'get_candidate_notes',
    description:
      'Get all notes for a candidate, with author name and timestamp.',
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
    name: 'bulk_update_candidate_stage',
    description:
      'Move multiple candidates to a new pipeline stage in one operation. Provide an array of candidate IDs and the target stage.',
    parameters: {
      type: 'object',
      properties: {
        candidateIds: {
          type: 'array',
          description: 'Array of candidate UUIDs',
          items: { type: 'string' },
        },
        newStage: {
          type: 'string',
          description: 'Target stage',
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
      required: ['candidateIds', 'newStage'],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating: true,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  get_candidates_by_job: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const cands = await services.getCandidatesByJob(
      await resolveId(args.jobId, 'jobId')
    );
    return truncateArray(
      cands.map((c) => sanitizeForJson(c)),
      30
    );
  },

  get_candidates_by_stage: async (args, { services, sanitizeForJson, truncateArray }) => {
    const cands = await services.getCandidatesByStage(
      args.stages as CandidateStage[]
    );
    return truncateArray(
      cands.map((c) => sanitizeForJson(c)),
      30
    );
  },

  get_candidate: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getCandidate(
        await resolveId(args.candidateId, 'candidateId')
      )
    );
  },

  update_candidate_stage: async (args, { services, resolveId, sanitizeForJson }) => {
    const updated = await services.updateCandidateStage(
      await resolveId(args.candidateId, 'candidateId'),
      args.newStage as CandidateStage
    );
    return sanitizeForJson(updated);
  },

  assign_cv_to_job: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const candidate = await services.assignCvToJob(
      await resolveId(args.cvId, 'cvId'),
      await resolveId(args.jobId, 'jobId'),
      ctx.userId
    );
    return sanitizeForJson(candidate);
  },

  add_candidate_note: async (args, { services, resolveId, sanitizeForJson, ctx }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const note = await services.addCandidateNote(
      candidateId,
      ctx.userId,
      args.content as string
    );
    return sanitizeForJson(note);
  },

  get_candidate_notes: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const candidateId = await resolveId(args.candidateId, 'candidateId');
    const notes = await services.getCandidateNotes(candidateId);
    return truncateArray(
      notes.map((n) => sanitizeForJson(n)),
      30
    );
  },

  bulk_update_candidate_stage: async (args, { services, resolveId, sanitizeForJson, truncateArray }) => {
    const rawIds = args.candidateIds as string[];
    const resolvedIds: string[] = [];
    for (const id of rawIds) {
      resolvedIds.push(await resolveId(id, 'candidateId'));
    }
    const updated = await services.bulkUpdateCandidateStage(
      resolvedIds,
      args.newStage as CandidateStage
    );
    return {
      updatedCount: updated.length,
      candidates: truncateArray(
        updated.map((c) => sanitizeForJson(c)),
        20
      ),
    };
  },
};
