import { and, count, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, interviews, jobs } from '@/db/schema';
import type { CandidateStage, DashboardStats, TodayInterview } from '../types';
import { getTodayInterviews } from './interviews';

export async function getDashboardStats(
  userId: string,
  role: 'ta' | 'manager' | 'hr' | 'admin'
): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  // Build assignee filter: managers see only their assigned candidates,
  // HR sees only their assigned candidates, TA/admin see all.
  const assigneeFilter: SQL | undefined =
    role === 'manager'
      ? eq(candidates.assignedManagerId, userId)
      : role === 'hr'
        ? eq(candidates.assignedHrId, userId)
        : undefined;

  const [{ value: totalJobs }] = await db.select({ value: count() }).from(jobs);

  const [{ value: totalCandidates }] = await db
    .select({ value: count() })
    .from(candidates)
    .where(assigneeFilter);

  const [{ value: totalInterviewsToday }] = await db
    .select({ value: count() })
    .from(interviews)
    .where(
      and(eq(interviews.interviewerId, userId), eq(interviews.scheduledDate, today))
    );

  const [{ value: pendingScreenings }] = await db
    .select({ value: count() })
    .from(candidates)
    .where(assigneeFilter ? and(eq(candidates.stage, 'new'), assigneeFilter) : eq(candidates.stage, 'new'));

  const allCandidates = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(assigneeFilter);

  const stageBreakdown: Record<CandidateStage, number> = {
    new: 0,
    ta_screening: 0,
    ta_interview: 0,
    ta_accepted: 0,
    ta_rejected: 0,
    manager_interview: 0,
    manager_accepted: 0,
    manager_rejected: 0,
    hr_interview: 0,
    hr_accepted: 0,
    hr_rejected: 0,
    hired: 0,
  };

  for (const c of allCandidates) {
    if (c.stage in stageBreakdown) {
      stageBreakdown[c.stage as CandidateStage]++;
    }
  }

  return {
    totalCandidates,
    totalJobs,
    totalInterviewsToday,
    pendingScreenings,
    stageBreakdown,
  };
}

export async function getTodayInterviewSchedule(
  userId: string
): Promise<TodayInterview[]> {
  return getTodayInterviews(userId);
}
