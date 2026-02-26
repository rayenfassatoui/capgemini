import { count, eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users,
  candidates,
  jobs,
  cvPool,
  interviews,
  activityLogs,
  emailLogs,
  onboardingTasks,
} from '@/db/schema';
import type { CandidateStage } from '../types';

// ---------- Types ----------

export interface SystemOverview {
  totalUsers: number;
  usersByRole: Array<{ role: string; count: number }>;
  totalCandidates: number;
  totalJobs: number;
  totalCvsInPool: number;
  totalInterviews: number;
  recentActivity: Array<{
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    details: string | null;
    createdAt: Date | null;
    userName: string;
    userEmail: string;
  }>;
}

export interface RecruitmentAnalytics {
  pipelineFunnel: Record<CandidateStage, number>;
  hiringRate: number;
  rejectionRate: number;
  candidatesPerJob: Array<{ jobTitle: string; count: number }>;
  interviewsPerStage: Array<{ stage: string; count: number }>;
  monthlyHiringTrend: Array<{ month: string; hired: number; rejected: number }>;
  averageTimeToHire: number | null;
  topRecruiters: Array<{ name: string; email: string; candidatesProcessed: number }>;
}

// ---------- System Overview ----------

export async function getSystemOverview(): Promise<SystemOverview> {
  const [
    [{ value: totalUsers }],
    [{ value: totalCandidates }],
    [{ value: totalJobs }],
    [{ value: totalCvsInPool }],
    [{ value: totalInterviews }],
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(candidates),
    db.select({ value: count() }).from(jobs),
    db.select({ value: count() }).from(cvPool),
    db.select({ value: count() }).from(interviews),
  ]);

  // Users by role
  const roleRows = await db
    .select({ role: users.role, value: count() })
    .from(users)
    .groupBy(users.role);
  const usersByRole = roleRows.map((r) => ({ role: r.role, count: r.value }));

  // Recent activity (last 10)
  const recentActivity = await db
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
    .limit(10);

  return {
    totalUsers,
    usersByRole,
    totalCandidates,
    totalJobs,
    totalCvsInPool,
    totalInterviews,
    recentActivity,
  };
}

// ---------- Recruitment Analytics ----------

export async function getRecruitmentAnalytics(): Promise<RecruitmentAnalytics> {
  // Pipeline funnel
  const allCandidates = await db
    .select({ stage: candidates.stage, createdAt: candidates.createdAt })
    .from(candidates);

  const pipelineFunnel: Record<CandidateStage, number> = {
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
    if (c.stage in pipelineFunnel) {
      pipelineFunnel[c.stage as CandidateStage]++;
    }
  }

  const total = allCandidates.length;
  const hiredCount = pipelineFunnel.hired;
  const rejectedCount =
    pipelineFunnel.ta_rejected +
    pipelineFunnel.manager_rejected +
    pipelineFunnel.hr_rejected;

  const hiringRate = total > 0 ? Math.round((hiredCount / total) * 100) : 0;
  const rejectionRate = total > 0 ? Math.round((rejectedCount / total) * 100) : 0;

  // Candidates per job (top 10)
  const jobCandidateCounts = await db
    .select({
      jobTitle: jobs.title,
      value: count(),
    })
    .from(candidates)
    .innerJoin(jobs, eq(candidates.jobId, jobs.id))
    .groupBy(jobs.title)
    .orderBy(desc(count()))
    .limit(10);

  const candidatesPerJob = jobCandidateCounts.map((r) => ({
    jobTitle: r.jobTitle,
    count: r.value,
  }));

  // Interviews per stage
  const interviewStageCounts = await db
    .select({ stage: interviews.stage, value: count() })
    .from(interviews)
    .groupBy(interviews.stage);

  const interviewsPerStage = interviewStageCounts.map((r) => ({
    stage: r.stage,
    count: r.value,
  }));

  // Monthly hiring trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyHiringTrend: Array<{ month: string; hired: number; rejected: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);
    const monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    const monthCandidates = allCandidates.filter((c) => {
      const created = c.createdAt;
      return created >= monthStart && created < monthEnd;
    });

    const hired = monthCandidates.filter((c) => c.stage === 'hired').length;
    const rejected = monthCandidates.filter((c) =>
      c.stage === 'ta_rejected' || c.stage === 'manager_rejected' || c.stage === 'hr_rejected'
    ).length;

    monthlyHiringTrend.push({ month: monthLabel, hired, rejected });
  }

  // Top recruiters (TAs who assigned most candidates)
  const recruiterCounts = await db
    .select({
      name: users.name,
      email: users.email,
      value: count(),
    })
    .from(candidates)
    .innerJoin(users, eq(candidates.assignedBy, users.id))
    .groupBy(users.name, users.email)
    .orderBy(desc(count()))
    .limit(5);

  const topRecruiters = recruiterCounts.map((r) => ({
    name: r.name,
    email: r.email,
    candidatesProcessed: r.value,
  }));

  return {
    pipelineFunnel,
    hiringRate,
    rejectionRate,
    candidatesPerJob,
    interviewsPerStage,
    monthlyHiringTrend,
    averageTimeToHire: null, // Would need hired_at timestamp to compute
    topRecruiters,
  };
}

// ---------- Email Logs ----------

export interface EmailLogEntry {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: string;
  createdAt: Date;
  sentByName: string;
  sentByEmail: string;
}

export async function getEmailLogs(limit = 100): Promise<EmailLogEntry[]> {
  return db
    .select({
      id: emailLogs.id,
      toEmail: emailLogs.toEmail,
      toName: emailLogs.toName,
      subject: emailLogs.subject,
      status: emailLogs.status,
      createdAt: emailLogs.createdAt,
      sentByName: users.name,
      sentByEmail: users.email,
    })
    .from(emailLogs)
    .innerJoin(users, eq(emailLogs.sentBy, users.id))
    .orderBy(desc(emailLogs.createdAt))
    .limit(limit);
}

// ---------- Onboarding Overview ----------

export interface OnboardingOverviewEntry {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  totalTasks: number;
  completedTasks: number;
  hiredAt: Date;
}

export async function getHiredCandidatesOnboarding(): Promise<OnboardingOverviewEntry[]> {
  const hiredCandidates = await db
    .select({
      candidateId: candidates.id,
      candidateName: candidates.fullName,
      candidateEmail: candidates.email,
      jobTitle: jobs.title,
      hiredAt: candidates.updatedAt,
    })
    .from(candidates)
    .innerJoin(jobs, eq(candidates.jobId, jobs.id))
    .where(eq(candidates.stage, 'hired'))
    .orderBy(desc(candidates.updatedAt));

  if (hiredCandidates.length === 0) return [];

  const allTasks = await db
    .select({
      candidateId: onboardingTasks.candidateId,
      completed: onboardingTasks.completed,
    })
    .from(onboardingTasks);

  const tasksByCand = new Map<string, { total: number; completed: number }>();
  for (const task of allTasks) {
    const entry = tasksByCand.get(task.candidateId) ?? { total: 0, completed: 0 };
    entry.total++;
    if (task.completed) entry.completed++;
    tasksByCand.set(task.candidateId, entry);
  }

  return hiredCandidates.map((c) => {
    const tasks = tasksByCand.get(c.candidateId) ?? { total: 0, completed: 0 };
    return {
      ...c,
      totalTasks: tasks.total,
      completedTasks: tasks.completed,
    };
  });
}
