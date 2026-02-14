import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool } from '@/db/schema';
import { cvMatchFiltersSchema, aiMatchRecommendationOutputSchema } from '../schemas';
import type { CvMatchFilters, CvMatchResult } from '../types';
import { getJob } from './jobs';
import { callOpenRouter, cleanJsonResponse } from './ai';

export async function matchCvsToJob(jobId: string): Promise<CvMatchResult[]> {
  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const allCvs = await db.select().from(cvPool);

  const existingCandidates = await db
    .select({ cvId: candidates.cvId })
    .from(candidates)
    .where(eq(candidates.jobId, jobId));

  const assignedCvIds = new Set(existingCandidates.map((c) => c.cvId));
  const mustHaveLower = job.mustHave.map((s) => s.toLowerCase());
  const niceToHaveLower = job.niceToHave.map((s) => s.toLowerCase());

  const results: CvMatchResult[] = allCvs.map((cv) => {
    const cvSkills = (cv.extractedSkills ?? []).map((s) => s.toLowerCase());

    const matchedMustHave = mustHaveLower.filter((skill) =>
      cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );
    const matchedNiceToHave = niceToHaveLower.filter((skill) =>
      cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );

    const mustScore =
      mustHaveLower.length > 0
        ? (matchedMustHave.length / mustHaveLower.length) * 100
        : 100;
    const niceScore =
      niceToHaveLower.length > 0
        ? (matchedNiceToHave.length / niceToHaveLower.length) * 100
        : 100;
    const matchScore = Math.round(mustScore * 0.7 + niceScore * 0.3);

    const gaps = mustHaveLower.filter(
      (skill) => !cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );

    return {
      cvId: cv.id,
      cvFilename: cv.filename,
      candidateName: cv.extractedName ?? 'Unknown',
      candidateEmail: cv.extractedEmail ?? '',
      matchScore,
      matchedMustHave: matchedMustHave.map(
        (s) => job.mustHave.find((m) => m.toLowerCase() === s) ?? s
      ),
      matchedNiceToHave: matchedNiceToHave.map(
        (s) => job.niceToHave.find((n) => n.toLowerCase() === s) ?? s
      ),
      gaps: gaps.map((s) => job.mustHave.find((m) => m.toLowerCase() === s) ?? s),
      alreadyAssigned: assignedCvIds.has(cv.id),
    };
  });

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

export async function matchCvsToJobWithFilters(
  jobId: string,
  filters: CvMatchFilters
): Promise<CvMatchResult[]> {
  const validated = cvMatchFiltersSchema.parse(filters);
  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  let allCvs = await db.select().from(cvPool);

  const existingCandidates = await db
    .select({ cvId: candidates.cvId })
    .from(candidates)
    .where(eq(candidates.jobId, jobId));

  const assignedCvIds = new Set(existingCandidates.map((c) => c.cvId));

  // Pre-filter by skills
  if (validated.skills.length > 0) {
    const filterSkillsLower = validated.skills.map((s) => s.toLowerCase());
    allCvs = allCvs.filter((cv) => {
      const cvSkills = (cv.extractedSkills ?? []).map((s) => s.toLowerCase());
      return filterSkillsLower.some((fs) =>
        cvSkills.some((cs) => cs.includes(fs) || fs.includes(cs))
      );
    });
  }

  // Pre-filter by languages
  if (validated.languages.length > 0) {
    const filterLangsLower = validated.languages.map((l) => l.toLowerCase());
    allCvs = allCvs.filter((cv) => {
      const cvLangs = (cv.extractedLanguages ?? []).map((l) => l.toLowerCase());
      return filterLangsLower.some((fl) =>
        cvLangs.some((cl) => cl.includes(fl) || fl.includes(cl))
      );
    });
  }

  // Pre-filter by minimum positions
  if (validated.minPositions > 0) {
    allCvs = allCvs.filter(
      (cv) => (cv.extractedExperiences ?? []).length >= validated.minPositions
    );
  }

  // Keyword scoring
  const mustHaveLower = job.mustHave.map((s) => s.toLowerCase());
  const niceToHaveLower = job.niceToHave.map((s) => s.toLowerCase());

  const results: CvMatchResult[] = allCvs.map((cv) => {
    const cvSkills = (cv.extractedSkills ?? []).map((s) => s.toLowerCase());

    const matchedMustHave = mustHaveLower.filter((skill) =>
      cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );
    const matchedNiceToHave = niceToHaveLower.filter((skill) =>
      cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );

    const mustScore =
      mustHaveLower.length > 0
        ? (matchedMustHave.length / mustHaveLower.length) * 100
        : 100;
    const niceScore =
      niceToHaveLower.length > 0
        ? (matchedNiceToHave.length / niceToHaveLower.length) * 100
        : 100;
    const keywordScore = Math.round(mustScore * 0.7 + niceScore * 0.3);

    const gaps = mustHaveLower.filter(
      (skill) => !cvSkills.some((cs) => cs.includes(skill) || skill.includes(cs))
    );

    return {
      cvId: cv.id,
      cvFilename: cv.filename,
      candidateName: cv.extractedName ?? 'Unknown',
      candidateEmail: cv.extractedEmail ?? '',
      matchScore: keywordScore,
      matchedMustHave: matchedMustHave.map(
        (s) => job.mustHave.find((m) => m.toLowerCase() === s) ?? s
      ),
      matchedNiceToHave: matchedNiceToHave.map(
        (s) => job.niceToHave.find((n) => n.toLowerCase() === s) ?? s
      ),
      gaps: gaps.map((s) => job.mustHave.find((m) => m.toLowerCase() === s) ?? s),
      alreadyAssigned: assignedCvIds.has(cv.id),
      candidateSkills: cv.extractedSkills ?? [],
      candidateLanguages: cv.extractedLanguages ?? [],
      experienceCount: (cv.extractedExperiences ?? []).length,
    };
  });

  // Sort by keyword score
  results.sort((a, b) => b.matchScore - a.matchScore);

  // Get AI recommendations for top 10
  const topResults = results.slice(0, 10);
  if (topResults.length > 0) {
    try {
      const candidateSummaries = topResults.map((r) => {
        const cv = allCvs.find((c) => c.id === r.cvId);
        const experiences = (cv?.extractedExperiences ?? [])
          .map((e) => Object.values(e).join(' at '))
          .slice(0, 3)
          .join('; ');
        return `- ID: ${r.cvId}\n  Name: ${r.candidateName}\n  Skills: ${(r.candidateSkills ?? []).join(', ')}\n  Experience: ${experiences || 'N/A'}\n  Languages: ${(r.candidateLanguages ?? []).join(', ') || 'N/A'}`;
      });

      const systemPrompt =
        'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences. Return strictly valid JSON array.';

      const userPrompt = `You are an expert technical recruiter at Capgemini. Analyze these candidates against the job requirements and provide a recommendation for each.

Job: ${job.title}
Seniority: ${job.seniority}
Must-Have Skills: ${job.mustHave.join(', ')}
Nice-to-Have: ${job.niceToHave.join(', ')}
Description: ${job.description.slice(0, 400)}

Candidates:
${candidateSummaries.join('\n')}

Return a JSON array where each object has:
- "cvId": string (the candidate ID from above)
- "score": number (0-100, your honest overall assessment considering skills, experience depth, and seniority fit)
- "recommendation": string (2-3 sentences about the candidate's fit for this specific role)
- "strengths": string[] (top 2-3 strengths relative to this job)
- "concerns": string[] (top 1-3 concerns or gaps)`;

      const content = await callOpenRouter(systemPrompt, userPrompt);
      const aiResults = aiMatchRecommendationOutputSchema.parse(
        JSON.parse(cleanJsonResponse(content))
      );

      for (const aiResult of aiResults) {
        const match = topResults.find((m) => m.cvId === aiResult.cvId);
        if (match) {
          match.matchScore = Math.round(match.matchScore * 0.3 + aiResult.score * 0.7);
          match.aiRecommendation = aiResult.recommendation;
          match.aiStrengths = aiResult.strengths;
          match.aiConcerns = aiResult.concerns;
        }
      }

      topResults.sort((a, b) => b.matchScore - a.matchScore);
    } catch {
      // AI failed, continue with keyword-only scores
    }
  }

  const topCvIds = new Set(topResults.map((r) => r.cvId));
  const remaining = results.filter((r) => !topCvIds.has(r.cvId));
  return [...topResults, ...remaining];
}
