import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cvPool, screenings } from '@/db/schema';
import { aiScreeningOutputSchema, screeningSchema } from '../schemas';
import { callOpenRouter, cleanJsonResponse } from './ai';
import { getJob } from './jobs';
import { getCandidate, updateCandidateStage } from './candidates';

function normalizeRequirement(value: string) {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function getUniqueRequirements(requirements: readonly string[]) {
  const unique = new Map<string, string>();
  for (const requirement of requirements) {
    const key = normalizeRequirement(requirement);
    if (key && !unique.has(key)) {
      unique.set(key, requirement);
    }
  }
  return [...unique.values()];
}

function getMatchPercentage(matchedCount: number, requirementCount: number) {
  return requirementCount === 0
    ? 100
    : Math.round((matchedCount / requirementCount) * 100);
}

export function deriveScreeningScores(
  mustHave: readonly string[],
  niceToHave: readonly string[],
  aiMatchedMustHave: readonly string[],
  aiMatchedNiceToHave: readonly string[]
) {
  const mustRequirements = getUniqueRequirements(mustHave);
  const niceRequirements = getUniqueRequirements(niceToHave);
  const aiMustMatches = new Set(aiMatchedMustHave.map(normalizeRequirement));
  const aiNiceMatches = new Set(aiMatchedNiceToHave.map(normalizeRequirement));
  const matchedMustHave = mustRequirements.filter((requirement) =>
    aiMustMatches.has(normalizeRequirement(requirement))
  );
  const matchedNiceToHave = niceRequirements.filter((requirement) =>
    aiNiceMatches.has(normalizeRequirement(requirement))
  );
  const gaps = mustRequirements.filter(
    (requirement) => !aiMustMatches.has(normalizeRequirement(requirement))
  );
  const mustMatchScore = getMatchPercentage(
    matchedMustHave.length,
    mustRequirements.length
  );
  const niceMatchScore = getMatchPercentage(
    matchedNiceToHave.length,
    niceRequirements.length
  );

  let score = 100;
  if (mustRequirements.length > 0 && niceRequirements.length > 0) {
    score = Math.round(mustMatchScore * 0.7 + niceMatchScore * 0.3);
  } else if (mustRequirements.length > 0) {
    score = mustMatchScore;
  } else if (niceRequirements.length > 0) {
    score = niceMatchScore;
  }

  return {
    score,
    mustMatchScore,
    niceMatchScore,
    gaps,
    matchedMustHave,
    matchedNiceToHave,
  };
}

export async function generateScreeningWithAI(candidateId: string, jobId: string, userId: string) {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');
  if (candidate.jobId !== jobId) {
    throw new Error('Candidate does not belong to this job');
  }
  if (candidate.stage !== 'new' && candidate.stage !== 'ta_screening') {
    throw new Error('Screening can only run before the TA interview stage');
  }

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
The matchedMustHave and matchedNiceToHave arrays must contain exact, unmodified strings copied from the corresponding Job Requirements arrays. Do not paraphrase requirement names.

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

  const derived = deriveScreeningScores(
    job.mustHave,
    job.niceToHave,
    parsed.matchedMustHave,
    parsed.matchedNiceToHave
  );
  const alignment =
    derived.score >= 75 ? 'Strong' : derived.score >= 50 ? 'Partial' : 'Limited';
  const aiSummary =
    job.mustHave.length === 0 && job.niceToHave.length === 0
      ? 'No job skill requirements are configured, so alignment cannot be assessed.'
      : `${alignment} alignment based on the extracted CV: matched ${derived.matchedMustHave.length}/${job.mustHave.length} must-have and ${derived.matchedNiceToHave.length}/${job.niceToHave.length} nice-to-have requirements.`;
  const validated = screeningSchema.parse({
    ...parsed,
    ...derived,
    aiSummary,
  });
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

  await updateCandidateStage(candidateId, 'ta_screening', {
    changedBy: userId,
    source: 'screening',
    reason: 'AI screening generated',
  });

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
