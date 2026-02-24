import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool, interviews } from '@/db/schema';
import type { CandidateStage } from '../types';
import { getJob } from './jobs';

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

  const [candidate] = await db
    .insert(candidates)
    .values({
      fullName: cv.extractedName ?? 'Unknown Candidate',
      email: cv.extractedEmail ?? 'unknown@example.com',
      phone: cv.extractedPhone ?? null,
      cvId,
      jobId,
      stage: 'ta_interview',
      assignedBy: userId,
    })
    .returning();

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
  newStage: CandidateStage
) {
  const [updated] = await db
    .update(candidates)
    .set({ stage: newStage, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId))
    .returning();

  return updated;
}

export async function bulkUpdateCandidateStage(
  candidateIds: string[],
  newStage: CandidateStage
) {
  if (candidateIds.length === 0) return [];

  const updated = await db
    .update(candidates)
    .set({ stage: newStage, updatedAt: new Date() })
    .where(inArray(candidates.id, candidateIds))
    .returning();

  return updated;
}

export async function assignManagerToCandidate(
  candidateId: string,
  managerId: string
) {
  const [updated] = await db
    .update(candidates)
    .set({
      assignedManagerId: managerId,
      stage: 'manager_interview',
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId))
    .returning();

  return updated;
}

export async function assignHrToCandidate(
  candidateId: string,
  hrId: string
) {
  const [updated] = await db
    .update(candidates)
    .set({
      assignedHrId: hrId,
      stage: 'hr_interview',
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId))
    .returning();

  return updated;
}

export async function getCandidatesByStageAndAssignee(
  stages: CandidateStage[],
  assigneeField: 'assignedManagerId' | 'assignedHrId',
  assigneeId: string
) {
  if (stages.length === 0) return [];
  return db
    .select()
    .from(candidates)
    .where(
      and(
        inArray(candidates.stage, stages),
        eq(candidates[assigneeField], assigneeId)
      )
    )
    .orderBy(desc(candidates.createdAt));
}
