import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { activityLogs, users } from '@/db/schema';

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
