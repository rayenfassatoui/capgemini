import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviews } from '@/db/schema';
import { scheduleInterviewSchema } from '../schemas';
import type {
  CandidateStage,
  InterviewStage,
  ScheduleInterviewInput,
  TodayInterview,
} from '../types';
import { getCandidate, updateCandidateStage } from './candidates';
import { getJob } from './jobs';
import { logActivity } from './activity-log';

export async function scheduleInterview(
  input: ScheduleInterviewInput,
  userId: string
) {
  const validated = scheduleInterviewSchema.parse(input);

    const dbDate = validated.scheduledDate;

  const [interview] = await db
    .insert(interviews)
    .values({
      candidateId: validated.candidateId,
      jobId: validated.jobId,
      interviewerId: userId,
      stage: validated.stage,
      scheduledDate: dbDate,
      scheduledTime: validated.scheduledTime,
      meetLink: validated.meetLink,
    })
    .returning();

  const stageMap: Record<InterviewStage, CandidateStage> = {
    ta: 'ta_interview',
    manager: 'manager_interview',
    hr: 'hr_interview',
  };
  await updateCandidateStage(validated.candidateId, stageMap[validated.stage]);

  // Activity log
  const candidate = await getCandidate(validated.candidateId);
  const job = await getJob(validated.jobId);
  await logActivity(
    userId,
    'interview_scheduled',
    'interview',
    interview.id,
    `${validated.stage.toUpperCase()} interview for ${candidate?.fullName ?? 'Unknown'} (${job?.title ?? 'Unknown'}) on ${validated.scheduledDate} at ${validated.scheduledTime}`
  ).catch(() => {});

  return interview;
}

export async function getInterview(interviewId: string) {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId));

  return interview ?? null;
}

export async function getInterviewByCandidateAndStage(
  candidateId: string,
  stage: InterviewStage
) {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(
      and(
        eq(interviews.candidateId, candidateId),
        eq(interviews.stage, stage)
      )
    )
    .orderBy(interviews.createdAt)
    .limit(1);

  return interview ?? null;
}

export async function getTodayInterviews(userId: string): Promise<TodayInterview[]> {
  const today = new Date().toISOString().split('T')[0];

  const rows = await db
    .select({
      interviewId: interviews.id,
      candidateId: interviews.candidateId,
      jobId: interviews.jobId,
      stage: interviews.stage,
      scheduledTime: interviews.scheduledTime,
      meetLink: interviews.meetLink,
      status: interviews.status,
    })
    .from(interviews)
    .where(
      and(eq(interviews.interviewerId, userId), eq(interviews.scheduledDate, today))
    )
    .orderBy(interviews.scheduledTime);

  const enriched: TodayInterview[] = [];
  for (const row of rows) {
    const candidate = await getCandidate(row.candidateId);
    const job = await getJob(row.jobId);

    enriched.push({
      interviewId: row.interviewId,
      candidateId: row.candidateId,
      candidateName: candidate?.fullName ?? 'Unknown',
      candidateEmail: candidate?.email ?? '',
      jobTitle: job?.title ?? 'Unknown',
      stage: row.stage,
      scheduledTime: row.scheduledTime,
      meetLink: row.meetLink,
      status: row.status,
    });
  }

  return enriched;
}

export async function markInterviewCompleted(interviewId: string) {
  const [updated] = await db
    .update(interviews)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(interviews.id, interviewId))
    .returning();

  return updated;
}

export async function cancelInterview(interviewId: string) {
  const [updated] = await db
    .update(interviews)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(interviews.id, interviewId))
    .returning();

  return updated;
}

export async function rescheduleInterview(
  interviewId: string,
  newDate: string,
  newTime: string
) {
  const dbDate = newDate;

  const [updated] = await db
    .update(interviews)
    .set({
      scheduledDate: dbDate,
      scheduledTime: newTime,
      status: 'scheduled',
      updatedAt: new Date(),
    })
    .where(eq(interviews.id, interviewId))
    .returning();

  return updated;
}

export async function getInterviewCalendar(
  userId: string,
  startDate: string,
  endDate: string
) {
  const rows = await db
    .select({
      interviewId: interviews.id,
      candidateId: interviews.candidateId,
      jobId: interviews.jobId,
      stage: interviews.stage,
      scheduledDate: interviews.scheduledDate,
      scheduledTime: interviews.scheduledTime,
      meetLink: interviews.meetLink,
      status: interviews.status,
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.interviewerId, userId),
        gte(interviews.scheduledDate, startDate),
        lte(interviews.scheduledDate, endDate)
      )
    )
    .orderBy(interviews.scheduledDate, interviews.scheduledTime);

  const enriched = [];
  for (const row of rows) {
    const candidate = await getCandidate(row.candidateId);
    const job = await getJob(row.jobId);
    enriched.push({
      ...row,
      candidateName: candidate?.fullName ?? 'Unknown',
      candidateEmail: candidate?.email ?? '',
      jobTitle: job?.title ?? 'Unknown',
    });
  }

  return enriched;
}
