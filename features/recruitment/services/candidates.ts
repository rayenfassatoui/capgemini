import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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

  const candidate = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(candidates)
      .values({
        fullName: cv.extractedName ?? 'Unknown Candidate',
        email: cv.extractedEmail ?? 'unknown@example.com',
        phone: cv.extractedPhone ?? null,
        cvId,
        jobId,
        stage: 'new',
        assignedBy: userId,
      })
      .returning();

    await tx.insert(candidateStageHistory).values({
      candidateId: created.id,
      previousStage: null,
      newStage: 'new',
      changedBy: userId,
      reason: 'CV assigned to job',
      source: 'assignment',
    });

    return created;
  });

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

  const updated = await db.transaction(async (tx) => {
    const [updatedCandidate] = await tx
      .update(candidates)
      .set({ stage: newStage, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId))
      .returning();

    if (!updatedCandidate) {
      throw new Error('Candidate not found');
    }

    await tx.insert(candidateStageHistory).values({
      candidateId,
      previousStage,
      newStage,
      changedBy: options.changedBy,
      reason: options.reason ?? null,
      source: options.source,
    });

    return updatedCandidate;
  });

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

