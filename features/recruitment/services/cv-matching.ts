import { eq, sql, isNotNull, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, cvPool } from '@/db/schema';
import { cvMatchFiltersSchema, aiMatchRecommendationOutputSchema } from '../schemas';
import type { CvMatchFilters, CvMatchResult, HybridSearchResult } from '../types';
import { getJob } from './jobs';
import { callOpenRouter, cleanJsonResponse } from './ai';

function skillsMatch(cvSkill: string, jobSkill: string): boolean {
  if (cvSkill === jobSkill) return true;
  
  // Normalize: remove dots, dashes, spaces
  const normalize = (s: string) => s.replace(/[\s.\-_]/g, '').toLowerCase();
  const cvNorm = normalize(cvSkill);
  const jobNorm = normalize(jobSkill);
  
  if (cvNorm === jobNorm) return true;
  
  // Only allow prefix match if job skill is 4+ chars (blocks "c" matching "docker")
  if (jobSkill.length >= 4 && cvSkill.startsWith(jobSkill)) return true;
  if (cvSkill.length >= 4 && jobSkill.startsWith(cvSkill)) return true;
  
  return false;
}

export async function matchCvsToJob(jobId: string): Promise<CvMatchResult[]> {
  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const allCvs = await db.select({
    id: cvPool.id,
    filename: cvPool.filename,
    extractedName: cvPool.extractedName,
    extractedEmail: cvPool.extractedEmail,
    extractedSkills: cvPool.extractedSkills,
    extractedExperiences: cvPool.extractedExperiences,
    extractedLanguages: cvPool.extractedLanguages,
    extractedSummary: cvPool.extractedSummary,
  }).from(cvPool);

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
      cvSkills.some((cs) => skillsMatch(cs, skill))
    );
    const matchedNiceToHave = niceToHaveLower.filter((skill) =>
      cvSkills.some((cs) => skillsMatch(cs, skill))
    );

    let mustScore =
      mustHaveLower.length > 0
        ? (matchedMustHave.length / mustHaveLower.length) * 100
        : 100;
        
    // Experience Bonus: +2 points per role, max +10
    const experienceCount = (cv.extractedExperiences ?? []).length;
    const experienceBonus = Math.min(experienceCount * 2, 10);
    mustScore = Math.min(mustScore + experienceBonus, 100);

    const niceScore =
      niceToHaveLower.length > 0
        ? (matchedNiceToHave.length / niceToHaveLower.length) * 100
        : 100;
    const matchScore = Math.round(mustScore * 0.7 + niceScore * 0.3);

    const gaps = mustHaveLower.filter(
      (skill) => !cvSkills.some((cs) => skillsMatch(cs, skill))
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

  let allCvs = await db.select({
    id: cvPool.id,
    filename: cvPool.filename,
    extractedName: cvPool.extractedName,
    extractedEmail: cvPool.extractedEmail,
    extractedSkills: cvPool.extractedSkills,
    extractedExperiences: cvPool.extractedExperiences,
    extractedLanguages: cvPool.extractedLanguages,
    extractedSummary: cvPool.extractedSummary,
  }).from(cvPool);

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
      cvSkills.some((cs) => skillsMatch(cs, skill))
    );
    const matchedNiceToHave = niceToHaveLower.filter((skill) =>
      cvSkills.some((cs) => skillsMatch(cs, skill))
    );

    let mustScore =
      mustHaveLower.length > 0
        ? (matchedMustHave.length / mustHaveLower.length) * 100
        : 100;

    // Experience Bonus: +2 points per role, max +10
    const experienceCount = (cv.extractedExperiences ?? []).length;
    const experienceBonus = Math.min(experienceCount * 2, 10);
    mustScore = Math.min(mustScore + experienceBonus, 100);

    const niceScore =
      niceToHaveLower.length > 0
        ? (matchedNiceToHave.length / niceToHaveLower.length) * 100
        : 100;
    const keywordScore = Math.round(mustScore * 0.7 + niceScore * 0.3);

    const gaps = mustHaveLower.filter(
      (skill) => !cvSkills.some((cs) => skillsMatch(cs, skill))
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
          const aiScoreIsValid = aiResult.score > 5 && aiResult.score <= 100;
          if (aiScoreIsValid) {
            match.matchScore = Math.round(match.matchScore * 0.3 + aiResult.score * 0.7);
          }
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

// ---------------------------------------------------------------------------
// Semantic (vector) search using pgvector + NVIDIA NV-EmbedQA E5 V5
// ---------------------------------------------------------------------------

export interface SemanticSearchResult {
  cvId: string;
  cvFilename: string;
  candidateName: string;
  candidateEmail: string;
  distance: number;
  similarityScore: number;
  extractedSkills: string[];
  extractedLanguages: string[];
  extractedSummary: string | null;
  experienceCount: number;
}

export async function searchCvsSemantically(
  queryText: string,
  options: { threshold?: number; limit?: number } = {}
): Promise<SemanticSearchResult[]> {
  const { threshold = 0.6, limit = 15 } = options;

  // 1. Generate a query embedding via NVIDIA NV-EmbedQA E5 V5
  const { generateTextEmbedding } = await import('./embeddings');
  const queryEmbedding = await generateTextEmbedding(queryText, 'query');

  if (!queryEmbedding) {
    throw new Error('Failed to generate query embedding \u2014 check NVIDIA_API_KEY and API availability');
  }

  // 2. Serialize the embedding array to a pgvector-compatible string
  //    This avoids Drizzle array serialization issues with cosineDistance()
  const embeddingStr = JSON.stringify(queryEmbedding);

  // 3. Perform cosine distance search using raw SQL <=> operator
  //    <=> returns cosine distance (0 = identical, 2 = opposite)
  //    Filter out rows with NULL embeddings and apply distance threshold
  const distance = sql<number>`(${cvPool.embedding} <=> ${embeddingStr}::vector)`;

  const results = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      extractedName: cvPool.extractedName,
      extractedEmail: cvPool.extractedEmail,
      extractedSkills: cvPool.extractedSkills,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
      extractedExperiences: cvPool.extractedExperiences,
      distance,
    })
    .from(cvPool)
    .where(
      sql`${cvPool.embedding} IS NOT NULL AND (${cvPool.embedding} <=> ${embeddingStr}::vector) < ${threshold}`
    )
    .orderBy(asc(distance))
    .limit(limit);

  return results.map((row) => {
    const rawSimilarity = 1 - Number(row.distance);
    const clampedSimilarity = Math.max(0, Math.min(1, rawSimilarity));
    
    return {
      cvId: row.id,
      cvFilename: row.filename,
      candidateName: row.extractedName ?? 'Unknown',
      candidateEmail: row.extractedEmail ?? '',
      distance: Number(row.distance),
      similarityScore: Math.round(clampedSimilarity * 100),
      extractedSkills: row.extractedSkills ?? [],
      extractedLanguages: row.extractedLanguages ?? [],
      extractedSummary: row.extractedSummary ?? null,
      experienceCount: (row.extractedExperiences ?? []).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Advanced: Hybrid Search combining Keyword Mathing and Semantic Search
// Uses Reciprocal Rank Fusion (RRF) to merge the ranked lists.
// ---------------------------------------------------------------------------

export async function hybridMatchCvsToJob(
  jobId: string,
  limit: number = 20
): Promise<HybridSearchResult[]> {
  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  // 1. Get Keyword Matches (Lexical)
  const keywordResults = await matchCvsToJob(jobId);

  // 2. Build Semantic Query from Job
  const semanticQuery = `Job Title: ${job.title}. Seniority: ${job.seniority}. Skills required: ${job.mustHave.join(', ')}. Domain: ${job.businessUnit ?? 'Technology'}`;
  
  // 3. Get Semantic Matches (Vector) - we fetch more than limit to ensure good overlap
  const semanticResults = await searchCvsSemantically(semanticQuery, { limit: 100, threshold: 0.8 });

  // 4. Reciprocal Rank Fusion (RRF) constants
  const K = 60; // Standard constant used in RRF
  
  // Maps to store ranks
  const keywordRanks = new Map<string, number>();
  keywordResults.forEach((res, idx) => keywordRanks.set(res.cvId, idx + 1));
  
  const semanticRanks = new Map<string, number>();
  semanticResults.forEach((res, idx) => semanticRanks.set(res.cvId, idx + 1));

  // Combine all unique CV IDs
  const allCvIds = new Set([...keywordRanks.keys(), ...semanticRanks.keys()]);
  
  // Calculate RRF Scores
  const rrfResults: HybridSearchResult[] = [];
  
  for (const cvId of allCvIds) {
    const kRank = keywordRanks.get(cvId) || 1000; // Penalize if missing from top 1000
    const sRank = semanticRanks.get(cvId) || 1000;
    
    // RRF Formula: 1 / (K + Rank_1) + 1 / (K + Rank_2)
    const rrfScoreRaw = (1 / (K + kRank)) + (1 / (K + sRank));
    
    // Normalize RRF Score to 0-100 scale (max possible score is roughly 2/61 ≈ 0.0327 = 100%)
    const maxRrf = (1 / (K + 1)) + (1 / (K + 1)); // 0.032786
    const rrfScore = Math.round((rrfScoreRaw / maxRrf) * 100);

    // Retrieve original cv data
    const kRes = keywordResults.find(r => r.cvId === cvId);
    const sRes = semanticResults.find(r => r.cvId === cvId);
    
    const cvFilename = kRes?.cvFilename || sRes?.cvFilename || '';
    const candidateName = kRes?.candidateName || sRes?.candidateName || 'Unknown';
    const candidateEmail = kRes?.candidateEmail || sRes?.candidateEmail || '';
    const alreadyAssigned = kRes?.alreadyAssigned || false;
    const extractedSkills = sRes?.extractedSkills || [];
    const extractedExperiences = sRes?.experienceCount || 0;

    rrfResults.push({
      cvId,
      cvFilename,
      candidateName,
      candidateEmail,
      rrfScore,
      keywordScore: kRes?.matchScore || 0,
      semanticScore: sRes?.similarityScore || 0,
      keywordRank: kRank,
      semanticRank: sRank,
      extractedSkills,
      extractedExperiences,
      alreadyAssigned,
    });
  }

  // 5. Sort by RRF Score and Limit
  return rrfResults.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit);
}
