import { desc, eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { activityLogs, users, candidates, interviews } from '@/db/schema';

export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: string
) {
  const [entry] = await db
    .insert(activityLogs)
    .values({ userId, action, entityType, entityId, details })
    .returning();
  return entry;
}

export async function getActivityLog(limit = 50) {
  return db
    .select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      details: activityLogs.details,
      createdAt: activityLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

export async function getActivityByEntity(entityType: string, entityId: string, limit = 30) {
  return db
    .select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      details: activityLogs.details,
      createdAt: activityLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(and(eq(activityLogs.entityType, entityType), eq(activityLogs.entityId, entityId)))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

export interface EnrichedActivityEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date | null;
  userName: string;
  userEmail: string;
  candidateStage: string | null;
}

export async function getActivityLogEnriched(limit = 100): Promise<EnrichedActivityEntry[]> {
  const entries = await db
    .select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      details: activityLogs.details,
      createdAt: activityLogs.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  if (entries.length === 0) return [];

  // Collect entityIds that need stage resolution
  const candidateEntityIds = entries
    .filter((e) => e.entityType === 'candidate' && e.entityId)
    .map((e) => e.entityId!);
  const interviewEntityIds = entries
    .filter((e) => e.entityType === 'interview' && e.entityId)
    .map((e) => e.entityId!);

  // Batch-resolve candidate stages
  const candidateStageMap = new Map<string, string>();

  if (candidateEntityIds.length > 0) {
    const candidateRows = await db
      .select({ id: candidates.id, stage: candidates.stage })
      .from(candidates)
      .where(inArray(candidates.id, candidateEntityIds));
    for (const c of candidateRows) {
      candidateStageMap.set(c.id, c.stage);
    }
  }

  if (interviewEntityIds.length > 0) {
    const interviewRows = await db
      .select({ id: interviews.id, candidateId: interviews.candidateId })
      .from(interviews)
      .where(inArray(interviews.id, interviewEntityIds));
    const relatedCandidateIds = interviewRows
      .map((i) => i.candidateId)
      .filter((id) => !candidateStageMap.has(id));
    if (relatedCandidateIds.length > 0) {
      const extraCandidates = await db
        .select({ id: candidates.id, stage: candidates.stage })
        .from(candidates)
        .where(inArray(candidates.id, relatedCandidateIds));
      for (const c of extraCandidates) {
        candidateStageMap.set(c.id, c.stage);
      }
    }
    // Map interview IDs to candidate stages
    for (const i of interviewRows) {
      const stage = candidateStageMap.get(i.candidateId);
      if (stage) candidateStageMap.set(i.id, stage);
    }
  }

  return entries.map((e) => ({
    ...e,
    candidateStage: e.entityId ? (candidateStageMap.get(e.entityId) ?? null) : null,
  }));
}
