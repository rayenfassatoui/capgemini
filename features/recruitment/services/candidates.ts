import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidateStageHistory, candidates, cvPool, interviews, jobs, users } from '@/db/schema';
import type { CandidateStage, UserRole } from '../types';
import { getJob } from './jobs';
import { logActivity } from './activity-log';
import { notifyStageChange } from './notifications';

export type CandidateStageTransitionSource =
  | 'assignment'
  | 'manual'
  | 'bulk'
  | 'screening'
  | 'interview_scheduled'
  | 'interview_report'
  | 'manager_assignment'
  | 'hr_assignment'
  | 'agent';

export interface CandidateStageTransitionOptions {
  changedBy: string;
  source: CandidateStageTransitionSource;
  reason?: string;
  allowInvalidTransition?: boolean;
  actorRole?: UserRole;
}

interface IdRow extends Record<string, unknown> {
  id: string;
}

export const CANDIDATE_STAGE_TRANSITIONS: Record<CandidateStage, readonly CandidateStage[]> = {
  new: ['ta_screening', 'ta_rejected'],
  ta_screening: ['ta_interview', 'ta_accepted', 'ta_rejected'],
  ta_interview: ['ta_screening', 'ta_accepted', 'ta_rejected'],
  ta_accepted: ['manager_interview', 'ta_rejected'],
  ta_rejected: ['new'],
  manager_interview: ['manager_accepted', 'manager_rejected'],
  manager_accepted: ['hr_interview', 'manager_rejected'],
  manager_rejected: ['new'],
  hr_interview: ['hr_accepted', 'hr_rejected'],
  hr_accepted: ['hired', 'hr_rejected'],
  hr_rejected: ['new'],
  hired: [],
};

export function isCandidateStageTransitionAllowed(
  previousStage: CandidateStage,
  newStage: CandidateStage
): boolean {
  return previousStage === newStage || CANDIDATE_STAGE_TRANSITIONS[previousStage].includes(newStage);
}

const MANUAL_STAGE_TARGETS_BY_ROLE: Record<
  Exclude<UserRole, 'admin'>,
  readonly CandidateStage[]
> = {
  ta: ['ta_interview', 'ta_rejected'],
  manager: ['manager_rejected'],
  hr: ['hr_accepted', 'hr_rejected', 'hired'],
};

export function isManualCandidateStageTargetAllowed(
  role: UserRole,
  stage: CandidateStage
) {
  return role === 'admin' || MANUAL_STAGE_TARGETS_BY_ROLE[role].includes(stage);
}

function getStageChangeRecipients(candidate: typeof candidates.$inferSelect): string[] {
  const recipients = [
    candidate.assignedBy,
    candidate.assignedManagerId,
    candidate.assignedHrId,
  ].filter((id): id is string => Boolean(id));

  return Array.from(new Set(recipients));
}

function formatStage(stage: CandidateStage): string {
  return stage.replace(/_/g, ' ');
}

function getExecuteRows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

export async function assignCvToJob(cvId: string, jobId: string, userId: string) {
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, cvId));
  if (!cv) throw new Error('CV not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const existing = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.cvId, cvId), eq(candidates.jobId, jobId)));

  if (existing.length > 0) {
    throw new Error('CV is already assigned to this job');
  }

  const createdResult = await db.execute<IdRow>(sql`
    WITH created AS (
      INSERT INTO "candidates" (
        "full_name",
        "email",
        "phone",
        "cv_id",
        "job_id",
        "stage",
        "assigned_by"
      )
      VALUES (
        ${cv.extractedName ?? 'Unknown Candidate'},
        ${cv.extractedEmail ?? 'unknown@example.com'},
        ${cv.extractedPhone ?? null},
        ${cvId},
        ${jobId},
        'ta_interview'::candidate_stage,
        ${userId}
      )
      RETURNING "id"
    ),
    stage_history AS (
      INSERT INTO "candidate_stage_history" (
        "candidate_id",
        "previous_stage",
        "new_stage",
        "changed_by",
        "reason",
        "source"
      )
      SELECT
        "id",
        NULL::candidate_stage,
        'ta_interview'::candidate_stage,
        ${userId},
        'CV assigned directly to interview',
        'assignment'
      FROM created
    )
    SELECT "id" FROM created
  `);

  const createdId = getExecuteRows<IdRow>(createdResult)[0]?.id;
  if (!createdId) {
    throw new Error('Failed to assign CV to job');
  }

  const candidate = await getCandidate(createdId);
  if (!candidate) {
    throw new Error('Failed to load assigned candidate');
  }

  await logActivity(
    userId,
    'candidate_assigned',
    'candidate',
    candidate.id,
    `${candidate.fullName} assigned to ${job.title}`
  ).catch(() => {});

  return candidate;
}

export async function getCandidatesByJob(jobId: string) {
  const candidateRows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.jobId, jobId))
    .orderBy(desc(candidates.createdAt));

  const enriched = await Promise.all(
    candidateRows.map(async (c) => {
      const candidateInterviews = await db
        .select()
        .from(interviews)
        .where(eq(interviews.candidateId, c.id))
        .orderBy(desc(interviews.createdAt));

      return {
        ...c,
        interviews: candidateInterviews,
      };
    })
  );

  return enriched;
}

export async function getCandidatesByStage(stages: CandidateStage[]) {
  if (stages.length === 0) return [];
  return db
    .select()
    .from(candidates)
    .where(inArray(candidates.stage, stages))
    .orderBy(desc(candidates.createdAt));
}

export async function getCandidate(candidateId: string) {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));

  return candidate ?? null;
}

export async function updateCandidateStage(
  candidateId: string,
  newStage: CandidateStage,
  options: CandidateStageTransitionOptions
) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) {
    throw new Error('Candidate not found');
  }

  const previousStage = candidate.stage as CandidateStage;
  if (previousStage === newStage) {
    return candidate;
  }
  if (
    ['manual', 'bulk', 'agent'].includes(options.source) &&
    (!options.actorRole ||
      !isManualCandidateStageTargetAllowed(options.actorRole, newStage))
  ) {
    throw new Error(
      `The ${options.actorRole ?? 'unknown'} role cannot manually move a candidate to ${newStage}`
    );
  }

  if (
    !options.allowInvalidTransition &&
    !isCandidateStageTransitionAllowed(previousStage, newStage)
  ) {
    throw new Error(
      `Invalid candidate stage transition: ${formatStage(previousStage)} → ${formatStage(newStage)}`
    );
  }

  const updatedResult = await db.execute<IdRow>(sql`
    WITH updated AS (
      UPDATE "candidates"
      SET
        "stage" = ${newStage}::candidate_stage,
        "updated_at" = now()
      WHERE "id" = ${candidateId}
      RETURNING "id"
    ),
    stage_history AS (
      INSERT INTO "candidate_stage_history" (
        "candidate_id",
        "previous_stage",
        "new_stage",
        "changed_by",
        "reason",
        "source"
      )
      SELECT
        "id",
        ${previousStage}::candidate_stage,
        ${newStage}::candidate_stage,
        ${options.changedBy},
        ${options.reason ?? null},
        ${options.source}
      FROM updated
    )
    SELECT "id" FROM updated
  `);

  const updatedId = getExecuteRows<IdRow>(updatedResult)[0]?.id;
  if (!updatedId) {
    throw new Error('Candidate not found');
  }

  const updated = await getCandidate(updatedId);
  if (!updated) {
    throw new Error('Candidate not found');
  }

  const details = options.reason
    ? `${updated.fullName} moved from ${formatStage(previousStage)} to ${formatStage(newStage)}: ${options.reason}`
    : `${updated.fullName} moved from ${formatStage(previousStage)} to ${formatStage(newStage)}`;

  await logActivity(
    options.changedBy,
    'candidate_stage_changed',
    'candidate',
    candidateId,
    details
  ).catch(() => {});

  await notifyStageChange(
    candidateId,
    updated.fullName,
    previousStage,
    newStage,
    options.changedBy,
    getStageChangeRecipients(updated)
  ).catch(() => {});

  return updated;
}

export async function bulkUpdateCandidateStage(
  candidateIds: string[],
  newStage: CandidateStage,
  options: CandidateStageTransitionOptions
) {
  if (candidateIds.length === 0) return [];

  const updated = [];
  for (const candidateId of candidateIds) {
    updated.push(
      await updateCandidateStage(candidateId, newStage, {
        ...options,
        source: 'bulk',
      })
    );
  }

  return updated;
}

export async function assignManagerToCandidate(
  candidateId: string,
  managerId: string,
  changedBy: string
) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) {
    throw new Error('Candidate not found');
  }
  if (candidate.stage !== 'ta_accepted') {
    throw new Error('Candidate must have an accepted TA interview before manager assignment');
  }

  const [manager] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, managerId), eq(users.role, 'manager')));
  if (!manager) {
    throw new Error('Selected user is not a manager');
  }

  const [updatedAssignment] = await db
    .update(candidates)
    .set({
      assignedManagerId: managerId,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId))
    .returning();

  if (!updatedAssignment) {
    throw new Error('Candidate not found');
  }

  return updateCandidateStage(candidateId, 'manager_interview', {
    changedBy,
    source: 'manager_assignment',
    reason: 'Manager assigned to candidate',
  });
}

export async function assignHrToCandidate(
  candidateId: string,
  hrId: string,
  changedBy: string
) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) {
    throw new Error('Candidate not found');
  }
  if (candidate.stage !== 'manager_accepted') {
    throw new Error(
      'Candidate needs an accepted manager interview report before HR assignment'
    );
  }

  const [hrUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, hrId), eq(users.role, 'hr')));
  if (!hrUser) {
    throw new Error('Selected user is not an HR representative');
  }

  const [updatedAssignment] = await db
    .update(candidates)
    .set({
      assignedHrId: hrId,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId))
    .returning();

  if (!updatedAssignment) {
    throw new Error('Candidate not found');
  }

  return updateCandidateStage(candidateId, 'hr_interview', {
    changedBy,
    source: 'hr_assignment',
    reason: 'Candidate forwarded to HR interview',
  });
}

export async function getCandidateStageHistory(candidateId: string) {
  return db
    .select({
      id: candidateStageHistory.id,
      candidateId: candidateStageHistory.candidateId,
      previousStage: candidateStageHistory.previousStage,
      newStage: candidateStageHistory.newStage,
      changedBy: candidateStageHistory.changedBy,
      changedByName: users.name,
      changedByEmail: users.email,
      reason: candidateStageHistory.reason,
      source: candidateStageHistory.source,
      createdAt: candidateStageHistory.createdAt,
    })
    .from(candidateStageHistory)
    .leftJoin(users, eq(candidateStageHistory.changedBy, users.id))
    .where(eq(candidateStageHistory.candidateId, candidateId))
    .orderBy(asc(candidateStageHistory.createdAt));
}

export type CandidateScopeField =
  | 'assignedBy'
  | 'assignedManagerId'
  | 'assignedHrId';

export interface CandidateAccessContext {
  userId: string;
  role: UserRole;
}
export const CANDIDATE_VISIBLE_STAGES_BY_ROLE: Record<
  UserRole,
  readonly CandidateStage[] | null
> = {
  ta: null,
  manager: ['manager_interview', 'manager_accepted', 'manager_rejected'],
  hr: ['hr_interview', 'hr_accepted', 'hr_rejected', 'hired'],
  admin: null,
};


interface CandidateAccessFilters {
  candidateId?: string;
  jobId?: string;
  stages?: CandidateStage[];
}

export function getCandidateScopeField(role: UserRole): CandidateScopeField | null {
  switch (role) {
    case 'ta':
      return 'assignedBy';
    case 'manager':
      return 'assignedManagerId';
    case 'hr':
      return 'assignedHrId';
    case 'admin':
      return null;
  }
}

export async function getCandidatesForActor(
  context: CandidateAccessContext,
  filters: CandidateAccessFilters = {}
) {
  const visibleStages = CANDIDATE_VISIBLE_STAGES_BY_ROLE[context.role];
  const effectiveStages = visibleStages
    ? filters.stages
      ? filters.stages.filter((stage) => visibleStages.includes(stage))
      : [...visibleStages]
    : filters.stages;
  if (effectiveStages?.length === 0) return [];

  const scopeField = getCandidateScopeField(context.role);

  return db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
      phone: candidates.phone,
      cvId: candidates.cvId,
      jobId: candidates.jobId,
      jobTitle: jobs.title,
      stage: candidates.stage,
      assignedBy: candidates.assignedBy,
      assignedManagerId: candidates.assignedManagerId,
      assignedHrId: candidates.assignedHrId,
      createdAt: candidates.createdAt,
      updatedAt: candidates.updatedAt,
    })
    .from(candidates)
    .innerJoin(jobs, eq(candidates.jobId, jobs.id))
    .where(
      and(
        filters.candidateId ? eq(candidates.id, filters.candidateId) : undefined,
        filters.jobId ? eq(candidates.jobId, filters.jobId) : undefined,
        effectiveStages ? inArray(candidates.stage, effectiveStages) : undefined,
        scopeField ? eq(candidates[scopeField], context.userId) : undefined
      )
    )
    .orderBy(desc(candidates.createdAt));
}

export async function getCandidateForActor(
  candidateId: string,
  context: CandidateAccessContext
): Promise<Awaited<ReturnType<typeof getCandidatesForActor>>[number] | null> {
  const [candidate] = await getCandidatesForActor(context, { candidateId });
  return candidate ?? null;
}


