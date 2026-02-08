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
  aiScreeningOutputSchema,
  createJobSchema,
  cvExtractionSchema,
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
  CvMatchResult,
  DashboardStats,
  InterviewReportInput,
  InterviewStage,
  ScheduleInterviewInput,
  SendInterviewEmailInput,
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
