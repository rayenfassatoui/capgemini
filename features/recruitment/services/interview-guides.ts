import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cvPool, interviewGuides } from '@/db/schema';
import { updateQuestionsSchema } from '../schemas';
import type { InterviewStage } from '../types';
import { callOpenRouter, cleanJsonResponse } from './ai';
import { getJob } from './jobs';
import { getCandidate } from './candidates';

export async function generateInterviewQuestionsWithAI(
  candidateId: string,
  jobId: string,
  stage: InterviewStage,
  userId: string
) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));

  const stageDescriptions: Record<InterviewStage, string> = {
    ta: 'Talent Acquisition (TA) - Focus on technical skills, culture fit, motivation, and basic qualifications.',
    manager:
      'Hiring Manager - Focus on deep technical expertise, problem-solving abilities, team fit, and project experience.',
    hr: 'HR - Focus on behavioral competencies, salary expectations, availability, career goals, and company values alignment.',
  };

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations. Return a JSON object with a "questions" field containing an array of 5-8 interview question strings.';

  const userPrompt = `Generate interview questions for the ${stageDescriptions[stage]} interview stage.

Job: ${job.title} (${job.seniority})
Requirements: ${JSON.stringify(job.mustHave)}
Nice to have: ${JSON.stringify(job.niceToHave)}

Candidate: ${candidate.fullName}
Skills: ${JSON.stringify(cv?.extractedSkills ?? [])}
Experience: ${JSON.stringify(cv?.extractedExperiences ?? [])}

Generate exactly 5-8 thoughtful, specific interview questions for this stage.`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = JSON.parse(cleanJsonResponse(content)) as Record<string, unknown>;
  const questions: string[] = Array.isArray(parsed.questions)
    ? (parsed.questions as string[])
    : Array.isArray(parsed)
      ? (parsed as string[])
      : [];

  const existing = await db
    .select()
    .from(interviewGuides)
    .where(
      and(
        eq(interviewGuides.candidateId, candidateId),
        eq(interviewGuides.jobId, jobId),
        eq(interviewGuides.stage, stage)
      )
    );

  if (existing.length > 0) {
    const [updated] = await db
      .update(interviewGuides)
      .set({ questions, updatedAt: new Date() })
      .where(eq(interviewGuides.id, existing[0].id))
      .returning();
    return updated;
  }

  const [guide] = await db
    .insert(interviewGuides)
    .values({
      candidateId,
      jobId,
      stage,
      questions,
      createdBy: userId,
    })
    .returning();

  return guide;
}

export async function getInterviewGuide(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
) {
  const [guide] = await db
    .select()
    .from(interviewGuides)
    .where(
      and(
        eq(interviewGuides.candidateId, candidateId),
        eq(interviewGuides.jobId, jobId),
        eq(interviewGuides.stage, stage)
      )
    )
    .orderBy(desc(interviewGuides.createdAt));

  return guide ?? null;
}

export async function updateInterviewQuestions(
  guideId: string,
  questions: string[],
  _userId: string
) {
  const validated = updateQuestionsSchema.parse({ guideId, questions });
  const [updated] = await db
    .update(interviewGuides)
    .set({ questions: validated.questions, updatedAt: new Date() })
    .where(eq(interviewGuides.id, validated.guideId))
    .returning();

  return updated;
}
