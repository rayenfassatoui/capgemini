import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { jobs } from '@/db/schema';
import { createJobSchema } from '../schemas';
import type { CreateJobInput } from '../types';

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
