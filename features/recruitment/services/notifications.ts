import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, interviews, jobs, notifications } from '@/db/schema';

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string
) {
  const [notification] = await db
    .insert(notifications)
    .values({ userId, type, title, message, entityType, entityId })
    .returning();
  return notification;
}

export async function getNotifications(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(userId: string) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return rows.length;
}

export async function ensureTodayInterviewReminders(userId: string) {
  const today = new Date().toISOString().split('T')[0];

  const todayInterviews = await db
    .select({
      interviewId: interviews.id,
      stage: interviews.stage,
      scheduledTime: interviews.scheduledTime,
      candidateName: candidates.fullName,
      jobTitle: jobs.title,
    })
    .from(interviews)
    .innerJoin(candidates, eq(interviews.candidateId, candidates.id))
    .innerJoin(jobs, eq(interviews.jobId, jobs.id))
    .where(
      and(
        eq(interviews.interviewerId, userId),
        eq(interviews.scheduledDate, today),
        eq(interviews.status, 'scheduled')
      )
    );

  if (todayInterviews.length === 0) {
    return 0;
  }

  const existingReminders = await db
    .select({ entityId: notifications.entityId })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'interview_today_reminder'),
        eq(notifications.entityType, 'interview')
      )
    );

  const existingInterviewIds = new Set(
    existingReminders
      .map((item) => item.entityId)
      .filter((entityId): entityId is string => Boolean(entityId))
  );

  let createdCount = 0;
  for (const interview of todayInterviews) {
    if (existingInterviewIds.has(interview.interviewId)) {
      continue;
    }

    await createNotification(
      userId,
      'interview_today_reminder',
      'Interview Reminder',
      `You have a ${interview.stage.toUpperCase()} interview with ${interview.candidateName} (${interview.jobTitle}) today at ${interview.scheduledTime}`,
      'interview',
      interview.interviewId
    );
    createdCount += 1;
  }

  return createdCount;
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
  return updated;
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}

export async function notifyStageChange(
  candidateId: string,
  candidateName: string,
  oldStage: string,
  newStage: string,
  actorUserId: string,
  targetUserIds: string[]
) {
  for (const uid of targetUserIds) {
    if (uid === actorUserId) continue;
    await createNotification(
      uid,
      'stage_change',
      'Candidate Stage Updated',
      `${candidateName} moved from ${oldStage} to ${newStage}`,
      'candidate',
      candidateId
    );
  }
}

export async function notifyInterviewScheduled(
  interviewId: string,
  candidateName: string,
  jobTitle: string,
  scheduledDate: string,
  scheduledTime: string,
  targetUserIds: string[]
) {
  for (const uid of targetUserIds) {
    await createNotification(
      uid,
      'interview_scheduled',
      'Interview Scheduled',
      `Interview for ${candidateName} (${jobTitle}) on ${scheduledDate} at ${scheduledTime}`,
      'interview',
      interviewId
    );
  }
}
