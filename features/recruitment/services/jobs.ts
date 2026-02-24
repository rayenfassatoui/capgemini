import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, interviews, jobs } from '@/db/schema';
import { createJobSchema } from '../schemas';
import type { CandidateStage, CreateJobInput, UserRole } from '../types';

const ACTIVE_CANDIDATE_STAGES: CandidateStage[] = [
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'manager_interview',
  'manager_accepted',
  'hr_interview',
];

export async function createJob(input: CreateJobInput, userId: string) {
  const validated = createJobSchema.parse(input);
  const [job] = await db
    .insert(jobs)
    .values({
      title: validated.title,
      description: validated.description,
      mustHave: validated.mustHave,
      niceToHave: validated.niceToHave,
      seniority: validated.seniority,
      businessUnit: validated.businessUnit ?? null,
      createdBy: userId,
    })
    .returning();

  return job;
}

export async function listJobs(userId: string) {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.createdBy, userId))
    .orderBy(desc(jobs.createdAt));
}

export async function getJob(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  return job ?? null;
}

export async function closeJob(jobId: string, userId: string, role: UserRole) {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (role !== 'admin' && job.createdBy !== userId) {
    throw new Error('Access denied: you can only close your own jobs');
  }

  if (job.status === 'closed') {
    return job;
  }

  const [scheduledInterviews] = await db
    .select({ count: count() })
    .from(interviews)
    .where(
      and(eq(interviews.jobId, jobId), eq(interviews.status, 'scheduled'))
    );

  if ((scheduledInterviews?.count ?? 0) > 0) {
    throw new Error(
      `Cannot close job: ${scheduledInterviews.count} scheduled interview(s) still pending`
    );
  }

  const [activeCandidates] = await db
    .select({ count: count() })
    .from(candidates)
    .where(
      and(
        eq(candidates.jobId, jobId),
        inArray(candidates.stage, ACTIVE_CANDIDATE_STAGES)
      )
    );

  if ((activeCandidates?.count ?? 0) > 0) {
    throw new Error(
      `Cannot close job: ${activeCandidates.count} candidate(s) are still in progress`
    );
  }

  const [updatedJob] = await db
    .update(jobs)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning();

  return updatedJob;
}

// ── Job Templates ────────────────────────────────────────────

export async function saveJobAsTemplate(jobId: string) {
  const [updated] = await db
    .update(jobs)
    .set({ isTemplate: true, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning();
  return updated;
}

export async function listJobTemplates() {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.isTemplate, true))
    .orderBy(desc(jobs.createdAt));
}

export async function createJobFromTemplate(templateId: string, userId: string, overrides?: { title?: string; description?: string }) {
  const template = await getJob(templateId);
  if (!template) throw new Error('Template not found');

  const [job] = await db
    .insert(jobs)
    .values({
      title: overrides?.title ?? `${template.title} (Copy)`,
      description: overrides?.description ?? template.description,
      mustHave: template.mustHave,
      niceToHave: template.niceToHave,
      seniority: template.seniority,
      businessUnit: template.businessUnit,
      createdBy: userId,
      isTemplate: false,
    })
    .returning();

  return job;
}
