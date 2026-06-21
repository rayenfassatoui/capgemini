import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidateStageHistory, candidates, cvPool, interviews, jobs, users } from '@/db/schema';
import type { CandidateStage } from '../types';
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
}

interface IdRow extends Record<string, unknown> {
  id: string;
}

export const CANDIDATE_STAGE_TRANSITIONS: Record<CandidateStage, readonly CandidateStage[]> = {
  new: ['ta_screening', 'ta_interview', 'ta_rejected'],
  ta_screening: ['ta_interview', 'ta_accepted', 'ta_rejected'],
  ta_interview: ['ta_screening', 'ta_accepted', 'ta_rejected'],
  ta_accepted: ['manager_interview', 'ta_rejected'],
  ta_rejected: ['new'],
  manager_interview: ['manager_accepted', 'manager_rejected', 'hr_interview'],
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
        'new'::candidate_stage,
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
        'new'::candidate_stage,
        ${userId},
        'CV assigned to job',
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

  let current = updatedAssignment;
  if (current.stage === 'manager_interview') {
    current = await updateCandidateStage(candidateId, 'manager_accepted', {
      changedBy,
      source: 'hr_assignment',
      reason: 'Manager accepted candidate and selected HR representative',
    });
  }

  if (current.stage === 'hr_interview') {
    return current;
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

export async function getCandidatesByStageAndAssignee(
  stages: CandidateStage[],
  assigneeField: 'assignedManagerId' | 'assignedHrId',
  assigneeId: string
) {
  if (stages.length === 0) return [];
  return db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
      stage: candidates.stage,
      createdAt: candidates.createdAt,
      jobId: candidates.jobId,
      jobTitle: jobs.title,
    })
    .from(candidates)
    .innerJoin(jobs, eq(candidates.jobId, jobs.id))
    .where(
      and(
        inArray(candidates.stage, stages),
        eq(candidates[assigneeField], assigneeId)
      )
    )
    .orderBy(desc(candidates.createdAt));
}

