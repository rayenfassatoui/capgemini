import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cvPool, screenings } from '@/db/schema';
import { aiScreeningOutputSchema, screeningSchema } from '../schemas';
import { callOpenRouter, cleanJsonResponse } from './ai';
import { getJob } from './jobs';
import { getCandidate, updateCandidateStage } from './candidates';

export async function generateScreeningWithAI(candidateId: string, jobId: string) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));
  if (!cv) throw new Error('CV not found');

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences. Return strictly valid JSON matching the requested schema.';

  const userPrompt = `You are an expert technical recruiter. Compare the candidate profile to the job requirements.
Return a JSON object with:
- score (0-100): overall match score
- mustMatchScore (0-100): how many must-have skills the candidate has
- niceMatchScore (0-100): how many nice-to-have skills matched
- gaps: string[] of missing must-have skills
- matchedMustHave: string[] of matched must-have skills
- matchedNiceToHave: string[] of matched nice-to-have skills
- aiSummary: a brief text summary of the screening result

Job Requirements:
Title: ${job.title}
Description: ${job.description}
Must Have: ${JSON.stringify(job.mustHave)}
Nice To Have: ${JSON.stringify(job.niceToHave)}
Seniority: ${job.seniority}

Candidate Profile:
Name: ${candidate.fullName}
Skills: ${JSON.stringify(cv.extractedSkills ?? [])}
Experiences: ${JSON.stringify(cv.extractedExperiences ?? [])}
Education: ${JSON.stringify(cv.extractedEducation ?? [])}
Languages: ${JSON.stringify(cv.extractedLanguages ?? [])}
Summary: ${cv.extractedSummary ?? 'N/A'}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = aiScreeningOutputSchema.parse(JSON.parse(cleanJsonResponse(content)));

  const validated = screeningSchema.parse(parsed);
  const [screening] = await db
    .insert(screenings)
    .values({
      candidateId,
      jobId,
      score: validated.score,
      mustMatchScore: validated.mustMatchScore,
      niceMatchScore: validated.niceMatchScore,
      gaps: validated.gaps,
      matchedMustHave: validated.matchedMustHave,
      matchedNiceToHave: validated.matchedNiceToHave,
      aiSummary: validated.aiSummary ?? null,
    })
    .returning();

  await updateCandidateStage(candidateId, 'ta_screening');

  return screening;
}

export async function getScreening(candidateId: string, jobId: string) {
  const [screening] = await db
    .select()
    .from(screenings)
    .where(and(eq(screenings.candidateId, candidateId), eq(screenings.jobId, jobId)))
    .orderBy(desc(screenings.createdAt));

  return screening ?? null;
}
