import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  candidates,
  cvPool,
  emailLogs,
  interviewGuides,
  interviewReports,
  interviews,
  jobs,
  screenings,
} from '@/db/schema';
import {
  aiCvExtractionOutputSchema,
  aiMatchRecommendationOutputSchema,
  aiScreeningOutputSchema,
  createJobSchema,
  cvExtractionSchema,
  cvMatchFiltersSchema,
  interviewReportSchema,
  scheduleInterviewSchema,
  screeningSchema,
  sendInterviewEmailSchema,
  updateQuestionsSchema,
  uploadCvSchema,
} from './schemas';
import type {
  CandidateStage,
  CreateJobInput,
  CvExtractionResult,
  CvMatchFilters,
  CvMatchResult,
  CvPoolStats,
  DashboardStats,
  InterviewReportInput,
  InterviewStage,
  JobsStats,
  ScheduleInterviewInput,
  SendInterviewEmailInput,
  SmartInsights,
  TodayInterview,
  UploadCvInput,
} from './types';

// ============ UTILITIES ============

function ensureEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  const objectStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');

  if (objectStart === -1 && arrayStart === -1) {
    return cleaned;
  }

  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  const isObject = cleaned[start] === '{';
  const openChar = isObject ? '{' : '[';
  const closeChar = isObject ? '}' : ']';
  let depth = 0;
  let end = start;

  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === openChar) depth++;
    if (cleaned[i] === closeChar) depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  return cleaned.substring(start, end + 1);
}

function normalizeContent(
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: string; [key: string]: unknown }>
    | undefined
): string | null {
  if (!content) return null;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const textChunks = content
    .filter((item) => item.type === 'text')
    .map((item) =>
      typeof (item as { text?: string }).text === 'string'
        ? (item as { text: string }).text
        : ''
    )
    .join('')
    .trim();

  return textChunks.length > 0 ? textChunks : null;
}

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
  ensureEnv(process.env.OPENROUTER_KEY, 'OPENROUTER_KEY');

  const { OpenRouter } = await import('@openrouter/sdk');
  const client = new OpenRouter({ apiKey: process.env.OPENROUTER_KEY });

  const response = await client.chat.send({
    model: 'stepfun/step-3.5-flash:free',
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ],
    temperature: 0.2,
  });

  const choice = response.choices[0]?.message?.content;
  const rawContent = typeof choice === 'string' ? choice : null;
  const content = normalizeContent(rawContent ?? undefined);
  if (!content) {
    throw new Error('No content returned from AI');
  }

  return content;
}

// ============ CV POOL ============

export async function uploadCv(input: UploadCvInput, userId: string) {
  const validated = uploadCvSchema.parse(input);
  const [cv] = await db
    .insert(cvPool)
    .values({
      filename: validated.filename,
      contentType: validated.contentType,
      size: validated.size,
      rawText: validated.rawText ?? null,
      rawBytes: validated.rawBytes ?? null,
      uploadedBy: userId,
    })
    .returning();

  return cv;
}

export async function parseCvDocument(
  filename: string,
  contentType: string,
  rawBytes: string
): Promise<string> {
  const buffer = Buffer.from(rawBytes, 'base64');

  if (contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (
    contentType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.toLowerCase().endsWith('.docx')
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString('utf-8');
}

export async function extractCvDataWithAI(text: string): Promise<CvExtractionResult> {
  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences. Return strictly valid JSON.';

  const userPrompt = `Extract structured candidate data from the CV text. Return JSON with fields:
name (string or null), email (string or null), phone (string or null), skills (string[]),
experiences (array of objects with title, company, duration), education (array of objects with degree, school, year),
languages (string[]), summary (string or null).

CV TEXT:
${text}`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = aiCvExtractionOutputSchema.parse(JSON.parse(cleanJsonResponse(content)));

  return {
    extractedName: parsed.name ?? null,
    extractedEmail: parsed.email ?? null,
    extractedPhone: parsed.phone ?? null,
    extractedSkills: parsed.skills,
    extractedExperiences: parsed.experiences,
    extractedEducation: parsed.education,
    extractedLanguages: parsed.languages,
    extractedSummary: parsed.summary ?? null,
  };
}

export async function updateCvExtraction(cvId: string, extraction: CvExtractionResult) {
  const validated = cvExtractionSchema.parse(extraction);
  const [updated] = await db
    .update(cvPool)
    .set({
      extractedName: validated.extractedName ?? null,
      extractedEmail: validated.extractedEmail ?? null,
      extractedPhone: validated.extractedPhone ?? null,
      extractedSkills: validated.extractedSkills,
      extractedExperiences: validated.extractedExperiences,
      extractedEducation: validated.extractedEducation,
      extractedLanguages: validated.extractedLanguages,
      extractedSummary: validated.extractedSummary ?? null,
    })
    .where(eq(cvPool.id, cvId))
    .returning();

  return updated;
}

export async function updateCvRawText(cvId: string, rawText: string) {
  const [updated] = await db
    .update(cvPool)
    .set({ rawText })
    .where(eq(cvPool.id, cvId))
    .returning();

  return updated;
}

export async function listCvPool(userId: string) {
  return db
    .select()
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId))
    .orderBy(desc(cvPool.createdAt));
}

export async function deleteCv(cvId: string, userId: string) {
  await db
    .delete(cvPool)
    .where(and(eq(cvPool.id, cvId), eq(cvPool.uploadedBy, userId)));
}

// ============ JOBS ============

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

// ============ CV MATCHING ============

export async function matchCvsToJob(jobId: string): Promise<CvMatchResult[]> {
  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const allCvs = await db.select().from(cvPool);

  // Check which CVs are already assigned to this job
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

  // Check which CVs are already assigned to this job
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
          // Blend keyword score (30%) with AI score (70%) for final score
          match.matchScore = Math.round(match.matchScore * 0.3 + aiResult.score * 0.7);
          match.aiRecommendation = aiResult.recommendation;
          match.aiStrengths = aiResult.strengths;
          match.aiConcerns = aiResult.concerns;
        }
      }

      // Re-sort top results by blended score
      topResults.sort((a, b) => b.matchScore - a.matchScore);
    } catch {
      // AI failed, continue with keyword-only scores
    }
  }

  // Merge back: top results (AI-enhanced) + remaining results
  const topCvIds = new Set(topResults.map((r) => r.cvId));
  const remaining = results.filter((r) => !topCvIds.has(r.cvId));
  return [...topResults, ...remaining];
}

// ============ CANDIDATES ============

export async function assignCvToJob(cvId: string, jobId: string, userId: string) {
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, cvId));
  if (!cv) throw new Error('CV not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  // Check if already assigned
  const existing = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.cvId, cvId), eq(candidates.jobId, jobId)));

  if (existing.length > 0) {
    throw new Error('CV is already assigned to this job');
  }

  const [candidate] = await db
    .insert(candidates)
    .values({
      fullName: cv.extractedName ?? 'Unknown Candidate',
      email: cv.extractedEmail ?? 'unknown@example.com',
      phone: cv.extractedPhone ?? null,
      cvId,
      jobId,
      stage: 'new',
      assignedBy: userId,
    })
    .returning();

  return candidate;
}

export async function getCandidatesByJob(jobId: string) {
  const candidateRows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.jobId, jobId))
    .orderBy(desc(candidates.createdAt));

  // Enrich each candidate with their interviews
  const enriched = await Promise.all(
    candidateRows.map(async (c) => {
      const candidateInterviews = await db
        .select()
        .from(interviews)
        .where(eq(interviews.candidateId, c.id))
        .orderBy(desc(interviews.createdAt));

      return {
        ...c,
        interviews: candidateInterviews,
      };
    })
  );

  return enriched;
}

export async function getCandidatesByStage(stages: CandidateStage[]) {
  if (stages.length === 0) return [];
  return db
    .select()
    .from(candidates)
    .where(inArray(candidates.stage, stages))
    .orderBy(desc(candidates.createdAt));
}

export async function getCandidate(candidateId: string) {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));

  return candidate ?? null;
}

export async function updateCandidateStage(
  candidateId: string,
  newStage: CandidateStage
) {
  const [updated] = await db
    .update(candidates)
    .set({ stage: newStage, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId))
    .returning();

  return updated;
}

// ============ SCREENING ============

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

// ============ INTERVIEW GUIDES (AI-GENERATED QUESTIONS) ============

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

  // Check if guide already exists for this stage
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

// ============ INTERVIEWS ============

export async function scheduleInterview(
  input: ScheduleInterviewInput,
  userId: string
) {
  const validated = scheduleInterviewSchema.parse(input);

  // Convert DD/MM/YYYY to YYYY-MM-DD for DB storage
  const [day, month, year] = validated.scheduledDate.split('/');
  const dbDate = `${year}-${month}-${day}`;

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

  // Update candidate stage
  const stageMap: Record<InterviewStage, CandidateStage> = {
    ta: 'ta_interview',
    manager: 'manager_interview',
    hr: 'hr_interview',
  };
  await updateCandidateStage(validated.candidateId, stageMap[validated.stage]);

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

// ============ INTERVIEW REPORTS ============

export async function saveInterviewReport(
  input: InterviewReportInput,
  userId: string
) {
  const validated = interviewReportSchema.parse(input);

  const [report] = await db
    .insert(interviewReports)
    .values({
      interviewId: validated.interviewId,
      candidateId: validated.candidateId,
      interviewerId: userId,
      stage: validated.stage,
      notes: validated.notes ?? null,
      candidateAnswers: validated.candidateAnswers,
      overallEvaluation: validated.overallEvaluation ?? null,
      score: validated.score,
      decision: validated.decision,
    })
    .returning();

  // Mark interview as completed
  await markInterviewCompleted(validated.interviewId);

  // If decision is accepted/rejected, update candidate stage
  if (validated.decision === 'accepted') {
    const acceptedStageMap: Record<InterviewStage, CandidateStage> = {
      ta: 'ta_accepted',
      manager: 'manager_accepted',
      hr: 'hr_accepted',
    };
    await updateCandidateStage(
      validated.candidateId,
      acceptedStageMap[validated.stage]
    );

    // Auto-advance to next pipeline stage
    const nextStageMap: Record<InterviewStage, CandidateStage | null> = {
      ta: 'manager_interview',
      manager: 'hr_interview',
      hr: 'hired',
    };
    const nextStage = nextStageMap[validated.stage];
    if (nextStage) {
      await updateCandidateStage(validated.candidateId, nextStage);
    }
  } else if (validated.decision === 'rejected') {
    const rejectedStageMap: Record<InterviewStage, CandidateStage> = {
      ta: 'ta_rejected',
      manager: 'manager_rejected',
      hr: 'hr_rejected',
    };
    await updateCandidateStage(
      validated.candidateId,
      rejectedStageMap[validated.stage]
    );
  }

  return report;
}

export async function getInterviewReport(interviewId: string) {
  const [report] = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.interviewId, interviewId));

  return report ?? null;
}

export async function getInterviewReportsByCandidate(candidateId: string) {
  return db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.candidateId, candidateId))
    .orderBy(desc(interviewReports.createdAt));
}

// ============ EMAIL ============

export async function sendInterviewEmail(
  input: SendInterviewEmailInput,
  userId: string
) {
  const validated = sendInterviewEmailSchema.parse(input);

  const stageLabels: Record<InterviewStage, string> = {
    ta: 'Talent Acquisition',
    manager: 'Hiring Manager',
    hr: 'HR',
  };

  const subject = `Interview Invitation - ${validated.jobTitle} (${stageLabels[validated.stage]})`;
  const body = `Dear ${validated.candidateName},

We are pleased to invite you for an interview for the position of ${validated.jobTitle}.

Interview Details:
- Stage: ${stageLabels[validated.stage]} Interview
- Date: ${validated.scheduledDate}
- Time: ${validated.scheduledTime}
- Interviewer: ${validated.interviewerName}

Please join the interview using the following Google Meet link:
${validated.meetLink}

Please confirm your availability by replying to this email.

Best regards,
${validated.interviewerName}
Capgemini Recruitment Team`;

  let emailStatus = 'sent';
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (emailUser && emailPass) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      await transporter.sendMail({
        from: emailUser,
        to: validated.candidateEmail,
        subject,
        text: body,
      });
    } else {
      emailStatus = 'pending';
    }
  } catch {
    emailStatus = 'failed';
  }

  const [emailLog] = await db
    .insert(emailLogs)
    .values({
      toEmail: validated.candidateEmail,
      toName: validated.candidateName,
      subject,
      body,
      sentBy: userId,
      interviewId: validated.interviewId,
      status: emailStatus,
    })
    .returning();

  await db
    .update(interviews)
    .set({ emailSent: true, emailSentAt: new Date() })
    .where(eq(interviews.id, validated.interviewId));

  return emailLog;
}

// ============ EXCEL EXPORT ============

export async function exportAcceptedCandidatesToExcel(): Promise<Buffer> {
  const acceptedCandidates = await db
    .select()
    .from(candidates)
    .where(inArray(candidates.stage, ['hr_accepted', 'hired']));

  const rows: Array<Record<string, string>> = [];
  for (const candidate of acceptedCandidates) {
    const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));
    const job = await getJob(candidate.jobId);
    const reports = await getInterviewReportsByCandidate(candidate.id);

    rows.push({
      'Candidate Name': candidate.fullName,
      Email: candidate.email,
      Phone: candidate.phone ?? '',
      'Job Title': job?.title ?? '',
      Stage: candidate.stage,
      Skills: (cv?.extractedSkills ?? []).join(', '),
      Languages: (cv?.extractedLanguages ?? []).join(', '),
      Summary: cv?.extractedSummary ?? '',
      'TA Score': reports.find((r) => r.stage === 'ta')?.score?.toString() ?? '',
      'Manager Score': reports.find((r) => r.stage === 'manager')?.score?.toString() ?? '',
      'HR Score': reports.find((r) => r.stage === 'hr')?.score?.toString() ?? '',
    });
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Accepted Candidates');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ============ DASHBOARD ============

export async function getDashboardStats(
  userId: string,
  _role: 'ta' | 'manager' | 'hr' | 'admin'
): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  const [{ value: totalJobs }] = await db.select({ value: count() }).from(jobs);

  const [{ value: totalCandidates }] = await db
    .select({ value: count() })
    .from(candidates);

  const [{ value: totalInterviewsToday }] = await db
    .select({ value: count() })
    .from(interviews)
    .where(
      and(eq(interviews.interviewerId, userId), eq(interviews.scheduledDate, today))
    );

  const [{ value: pendingScreenings }] = await db
    .select({ value: count() })
    .from(candidates)
    .where(eq(candidates.stage, 'new'));

  const allCandidates = await db
    .select({ stage: candidates.stage })
    .from(candidates);

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

// ============ CV POOL EXTRAS ============

export async function getCvDetails(cvId: string) {
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, cvId));
  return cv ?? null;
}

export async function getCvFile(cvId: string) {
  const [cv] = await db
    .select({
      id: cvPool.id,
      filename: cvPool.filename,
      contentType: cvPool.contentType,
      rawBytes: cvPool.rawBytes,
    })
    .from(cvPool)
    .where(eq(cvPool.id, cvId));

  return cv ?? null;
}

export async function exportCvPoolToExcel(userId: string): Promise<Buffer> {
  const cvs = await db
    .select()
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId))
    .orderBy(desc(cvPool.createdAt));

  const rows = cvs.map((cv) => ({
    'Name': cv.extractedName ?? 'Unknown',
    'Email': cv.extractedEmail ?? '',
    'Phone': cv.extractedPhone ?? '',
    'Skills': (cv.extractedSkills ?? []).join(', '),
    'Languages': (cv.extractedLanguages ?? []).join(', '),
    'Education': (cv.extractedEducation ?? [])
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Experience': (cv.extractedExperiences ?? [])
      .map((e) => Object.values(e).join(' - '))
      .join('; '),
    'Summary': cv.extractedSummary ?? '',
    'Filename': cv.filename,
    'Uploaded': cv.createdAt?.toISOString().split('T')[0] ?? '',
  }));

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CV Pool');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ============ FORMATTED SINGLE CV EXCEL EXPORT ============

export async function exportSingleCvToExcel(cvId: string): Promise<Buffer> {
  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, cvId));
  if (!cv) throw new Error('CV not found');

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const rows: string[][] = [];

  // Header section
  rows.push(['CURRICULUM VITAE']);
  rows.push([]);
  rows.push(['Name', cv.extractedName ?? 'Unknown']);
  rows.push(['Email', cv.extractedEmail ?? '']);
  rows.push(['Phone', cv.extractedPhone ?? '']);
  rows.push([]);

  // Summary
  if (cv.extractedSummary) {
    rows.push(['PROFESSIONAL SUMMARY']);
    rows.push([cv.extractedSummary]);
    rows.push([]);
  }

  // Skills
  const skills = cv.extractedSkills ?? [];
  if (skills.length > 0) {
    rows.push(['SKILLS']);
    // Group skills 4 per row
    for (let i = 0; i < skills.length; i += 4) {
      rows.push(skills.slice(i, i + 4));
    }
    rows.push([]);
  }

  // Experience
  const experiences = cv.extractedExperiences ?? [];
  if (experiences.length > 0) {
    rows.push(['PROFESSIONAL EXPERIENCE']);
    for (const exp of experiences) {
      const title = exp.title ?? exp.Title ?? exp.role ?? exp.Role ?? '';
      const company = exp.company ?? exp.Company ?? exp.organization ?? '';
      const duration = exp.duration ?? exp.Duration ?? exp.period ?? exp.dates ?? '';
      rows.push([title, company, duration]);
    }
    rows.push([]);
  }

  // Education
  const education = cv.extractedEducation ?? [];
  if (education.length > 0) {
    rows.push(['EDUCATION']);
    for (const edu of education) {
      const degree = edu.degree ?? edu.Degree ?? edu.diploma ?? '';
      const school = edu.school ?? edu.School ?? edu.institution ?? edu.university ?? '';
      const year = edu.year ?? edu.Year ?? edu.date ?? '';
      rows.push([degree, school, year]);
    }
    rows.push([]);
  }

  // Languages
  const languages = cv.extractedLanguages ?? [];
  if (languages.length > 0) {
    rows.push(['LANGUAGES']);
    rows.push(languages);
    rows.push([]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
  ];

  // Merge the title cell across columns
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
  ];

  const candidateName = cv.extractedName ?? 'candidate';
  const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

export async function exportMultipleCvsToExcel(cvIds: string[]): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  const cvs = await db
    .select()
    .from(cvPool)
    .where(inArray(cvPool.id, cvIds));

  for (const cv of cvs) {
    const rows: string[][] = [];

    rows.push(['CURRICULUM VITAE']);
    rows.push([]);
    rows.push(['Name', cv.extractedName ?? 'Unknown']);
    rows.push(['Email', cv.extractedEmail ?? '']);
    rows.push(['Phone', cv.extractedPhone ?? '']);
    rows.push([]);

    if (cv.extractedSummary) {
      rows.push(['PROFESSIONAL SUMMARY']);
      rows.push([cv.extractedSummary]);
      rows.push([]);
    }

    const skills = cv.extractedSkills ?? [];
    if (skills.length > 0) {
      rows.push(['SKILLS']);
      for (let i = 0; i < skills.length; i += 4) {
        rows.push(skills.slice(i, i + 4));
      }
      rows.push([]);
    }

    const experiences = cv.extractedExperiences ?? [];
    if (experiences.length > 0) {
      rows.push(['PROFESSIONAL EXPERIENCE']);
      for (const exp of experiences) {
        const title = exp.title ?? exp.Title ?? exp.role ?? exp.Role ?? '';
        const company = exp.company ?? exp.Company ?? exp.organization ?? '';
        const duration = exp.duration ?? exp.Duration ?? exp.period ?? exp.dates ?? '';
        rows.push([title, company, duration]);
      }
      rows.push([]);
    }

    const education = cv.extractedEducation ?? [];
    if (education.length > 0) {
      rows.push(['EDUCATION']);
      for (const edu of education) {
        const degree = edu.degree ?? edu.Degree ?? edu.diploma ?? '';
        const school = edu.school ?? edu.School ?? edu.institution ?? edu.university ?? '';
        const year = edu.year ?? edu.Year ?? edu.date ?? '';
        rows.push([degree, school, year]);
      }
      rows.push([]);
    }

    const languages = cv.extractedLanguages ?? [];
    if (languages.length > 0) {
      rows.push(['LANGUAGES']);
      rows.push(languages);
      rows.push([]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
    ];
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    ];

    const candidateName = cv.extractedName ?? cv.filename;
    const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    // Ensure unique sheet name
    const existingNames = workbook.SheetNames;
    let sheetName = safeName;
    let counter = 1;
    while (existingNames.includes(sheetName)) {
      sheetName = `${safeName.slice(0, 27)}_${counter}`;
      counter++;
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  if (workbook.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['No CVs found']]);
    XLSX.utils.book_append_sheet(workbook, ws, 'Empty');
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buffer);
}

// ============ CV POOL STATISTICS ============

export async function getCvPoolStats(userId: string): Promise<CvPoolStats> {
  const cvs = await db
    .select()
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId));

  // Top skills
  const skillCounts: Record<string, number> = {};
  for (const cv of cvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim();
      if (normalized) {
        skillCounts[normalized] = (skillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const topSkills = Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Language distribution
  const langCounts: Record<string, number> = {};
  for (const cv of cvs) {
    for (const lang of cv.extractedLanguages ?? []) {
      const normalized = lang.trim();
      if (normalized) {
        langCounts[normalized] = (langCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const languageDistribution = Object.entries(langCounts)
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  // Upload trend (last 7 days)
  const now = new Date();
  const uploadTrend: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayCount = cvs.filter((cv) => {
      const cvDate = cv.createdAt?.toISOString().split('T')[0];
      return cvDate === dateStr;
    }).length;
    uploadTrend.push({ date: dateStr, count: dayCount });
  }

  return {
    totalCvs: cvs.length,
    topSkills,
    languageDistribution,
    uploadTrend,
  };
}

// ============ JOBS STATISTICS ============

export async function getJobsStats(userId: string): Promise<JobsStats> {
  const allJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.createdBy, userId));

  // By seniority
  const senCounts: Record<string, number> = {};
  for (const j of allJobs) {
    senCounts[j.seniority] = (senCounts[j.seniority] ?? 0) + 1;
  }
  const bySeniority = Object.entries(senCounts)
    .map(([seniority, count]) => ({ seniority, count }))
    .sort((a, b) => b.count - a.count);

  // By status
  const statusCounts: Record<string, number> = {};
  for (const j of allJobs) {
    statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // By business unit
  const buCounts: Record<string, number> = {};
  for (const j of allJobs) {
    const unit = j.businessUnit ?? 'Unspecified';
    buCounts[unit] = (buCounts[unit] ?? 0) + 1;
  }
  const byBusinessUnit = Object.entries(buCounts)
    .map(([unit, count]) => ({ unit, count }))
    .sort((a, b) => b.count - a.count);

  // Top skills demand across all jobs
  const skillDemand: Record<string, number> = {};
  for (const j of allJobs) {
    for (const skill of [...j.mustHave, ...j.niceToHave]) {
      const normalized = skill.trim();
      if (normalized) {
        skillDemand[normalized] = (skillDemand[normalized] ?? 0) + 1;
      }
    }
  }
  const topSkillsDemand = Object.entries(skillDemand)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    bySeniority,
    byStatus,
    byBusinessUnit,
    topSkillsDemand,
  };
}

// ============ SMART INSIGHTS ============

export async function getSmartInsights(userId: string): Promise<SmartInsights> {
  const allJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.createdBy, userId));

  const allCvs = await db
    .select()
    .from(cvPool)
    .where(eq(cvPool.uploadedBy, userId));

  const allCandidates = await db.select({ stage: candidates.stage }).from(candidates);

  // Most demanded job profiles (by title similarity)
  const titleCounts: Record<string, number> = {};
  for (const j of allJobs) {
    // Normalize title - take base role
    const base = j.title.replace(/^(senior|junior|lead|principal|staff)\s+/i, '').trim();
    titleCounts[base] = (titleCounts[base] ?? 0) + 1;
  }
  const mostDemandedJobProfiles = Object.entries(titleCounts)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Most common CV skills
  const cvSkillCounts: Record<string, number> = {};
  for (const cv of allCvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim();
      if (normalized) {
        cvSkillCounts[normalized] = (cvSkillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const mostCommonCvSkills = Object.entries(cvSkillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Skill gap analysis: demand (from jobs) vs supply (from CVs)
  const jobSkillCounts: Record<string, number> = {};
  for (const j of allJobs) {
    for (const skill of j.mustHave) {
      const normalized = skill.trim().toLowerCase();
      if (normalized) {
        jobSkillCounts[normalized] = (jobSkillCounts[normalized] ?? 0) + 1;
      }
    }
  }
  const cvSkillCountsLower: Record<string, number> = {};
  for (const cv of allCvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.trim().toLowerCase();
      if (normalized) {
        cvSkillCountsLower[normalized] = (cvSkillCountsLower[normalized] ?? 0) + 1;
      }
    }
  }
  const allSkillKeys = new Set([...Object.keys(jobSkillCounts), ...Object.keys(cvSkillCountsLower)]);
  const skillGapAnalysis = Array.from(allSkillKeys)
    .map((skill) => ({
      skill,
      demand: jobSkillCounts[skill] ?? 0,
      supply: cvSkillCountsLower[skill] ?? 0,
    }))
    .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply))
    .slice(0, 10);

  // Pipeline funnel
  const pipelineFunnel: Record<string, number> = {
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
      pipelineFunnel[c.stage]++;
    }
  }

  return {
    mostDemandedJobProfiles,
    mostCommonCvSkills,
    skillGapAnalysis,
    pipelineFunnel: pipelineFunnel as SmartInsights['pipelineFunnel'],
  };
}

// ============ HR DECISION EMAIL ============

export async function generateHRDecisionEmailWithAI(
  candidateId: string,
  jobId: string,
  decision: 'accepted' | 'rejected'
): Promise<{ subject: string; body: string }> {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const systemPrompt =
    'You are a professional HR email writer at Capgemini. Write formal but warm emails. Respond ONLY with valid JSON containing "subject" and "body" fields. No markdown, no code fences.';

  let userPrompt: string;

  if (decision === 'accepted') {
    userPrompt = `Write a professional acceptance email for a candidate who has been selected for the position.

Candidate: ${candidate.fullName}
Position: ${job.title}
Company: Capgemini

The email should:
1. Congratulate the candidate warmly
2. Confirm the position title
3. List the required documents they need to prepare:
   - Copy of national ID card (recto/verso)
   - Copy of diplomas and certificates
   - Bank account details (RIB)
   - 2 passport-sized photos
   - Medical certificate of fitness for work
   - Previous employment certificates (if applicable)
   - Social security number
4. Inform them they will be contacted by the onboarding team for next steps
5. Include a warm welcome message

Return JSON with "subject" and "body" fields.`;
  } else {
    userPrompt = `Write a professional and respectful rejection email for a candidate.

Candidate: ${candidate.fullName}
Position: ${job.title}
Company: Capgemini

The email should:
1. Thank the candidate for their time and interest in Capgemini
2. Politely inform them that they were not selected for this particular position
3. Encourage them to apply for future opportunities at Capgemini
4. Be warm, empathetic, and professional

Return JSON with "subject" and "body" fields.`;
  }

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = JSON.parse(cleanJsonResponse(content)) as {
    subject: string;
    body: string;
  };

  return {
    subject: parsed.subject ?? `Application Update - ${job.title}`,
    body: parsed.body ?? 'Email content could not be generated.',
  };
}

export async function sendHRDecisionEmail(
  input: { toEmail: string; toName: string; subject: string; body: string },
  userId: string
) {
  let emailStatus = 'sent';
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (emailUser && emailPass) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      await transporter.sendMail({
        from: emailUser,
        to: input.toEmail,
        subject: input.subject,
        text: input.body,
      });
    } else {
      emailStatus = 'pending';
    }
  } catch {
    emailStatus = 'failed';
  }

  const [emailLog] = await db
    .insert(emailLogs)
    .values({
      toEmail: input.toEmail,
      toName: input.toName,
      subject: input.subject,
      body: input.body,
      sentBy: userId,
      status: emailStatus,
    })
    .returning();

  return emailLog;
}
