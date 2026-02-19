/**
 * AI-Powered Features
 *
 * - Interview Debrief: AI analyzes answers + score → suggests accept/reject
 * - Candidate Comparison: Compare N candidates for a job → pros/cons table
 * - Job Description Writer: Generate full JD from a title/brief
 * - Offer/Rejection Email: AI drafts a professional email
 * - Predictive Pipeline Score: Predict hiring probability from screening + reports
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  candidates,
  cvPool,
  interviewReports,
  interviews,
  jobs,
  screenings,
} from '@/db/schema';
import { callOpenRouter, cleanJsonResponse } from './ai';
import {
  aiInterviewDebriefOutputSchema,
  aiCandidateComparisonOutputSchema,
  aiJobDescriptionOutputSchema,
  aiCandidateEmailOutputSchema,
  aiPredictivePipelineOutputSchema,
} from '../schemas';

// ==================== 1. AI Interview Debrief ====================

export async function generateInterviewDebrief(
  interviewId: string
): Promise<{
  recommendation: 'accept' | 'reject' | 'hold';
  confidence: number;
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  suggestedNextSteps: string;
}> {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId));
  if (!interview) throw new Error('Interview not found');

  const [report] = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.interviewId, interviewId));
  if (!report) throw new Error('Interview report not found — submit a report first');

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, interview.candidateId));
  if (!candidate) throw new Error('Candidate not found');

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, interview.jobId));
  if (!job) throw new Error('Job not found');

  const [cv] = await db
    .select({
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedLanguages: cvPool.extractedLanguages,
    })
    .from(cvPool)
    .where(eq(cvPool.id, candidate.cvId));

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.';

  const userPrompt = `You are a senior HR analyst at Capgemini. Analyze this interview report and provide a hiring recommendation.

Interview Details:
- Stage: ${interview.stage}
- Candidate: ${candidate.fullName}
- Position: ${job.title} (${job.seniority})
- Interview Score: ${report.score}/100
- Decision by interviewer: ${report.decision}
- Overall Evaluation: ${report.overallEvaluation ?? 'None'}
- Notes: ${report.notes ?? 'None'}

Candidate Answers:
${(report.candidateAnswers as Array<{ question: string; answer: string }>)
  .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
  .join('\n\n')}

Job Requirements:
- Must-Have: ${JSON.stringify(job.mustHave)}
- Nice-To-Have: ${JSON.stringify(job.niceToHave)}

Candidate Skills: ${JSON.stringify(cv?.extractedSkills ?? [])}
Candidate Experience: ${JSON.stringify(cv?.extractedExperiences ?? [])}

Return a JSON object with:
- recommendation: "accept" | "reject" | "hold"
- confidence: number 0-100 (how confident the AI is in this recommendation)
- reasoning: detailed explanation (2-4 sentences)
- strengths: string[] (candidate strengths observed in the interview)
- weaknesses: string[] (areas of concern)
- suggestedNextSteps: what should happen next (1-2 sentences)`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return aiInterviewDebriefOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );
}

// ==================== 2. Candidate Comparison ====================

export async function compareCandidates(
  candidateIds: string[],
  jobId: string
): Promise<{
  jobTitle: string;
  candidates: Array<{
    candidateId: string;
    name: string;
    stage: string;
    screeningScore: number | null;
    interviewScore: number | null;
    pros: string[];
    cons: string[];
    overallFit: number;
  }>;
  recommendation: string;
  rankingOrder: string[];
}> {
  if (candidateIds.length < 2) {
    throw new Error('At least 2 candidates are required for comparison');
  }
  if (candidateIds.length > 5) {
    throw new Error('Maximum 5 candidates can be compared at once');
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error('Job not found');

  const candidateData: Array<{
    id: string;
    name: string;
    stage: string;
    skills: string[];
    experiences: Array<Record<string, string>>;
    languages: string[];
    screeningScore: number | null;
    interviewScore: number | null;
    gaps: string[];
    matchedMust: string[];
  }> = [];

  for (const cId of candidateIds) {
    const [cand] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, cId));
    if (!cand) throw new Error(`Candidate ${cId} not found`);

    const [cv] = await db
      .select({
        extractedSkills: cvPool.extractedSkills,
        extractedExperiences: cvPool.extractedExperiences,
        extractedLanguages: cvPool.extractedLanguages,
      })
      .from(cvPool)
      .where(eq(cvPool.id, cand.cvId));

    const [screening] = await db
      .select()
      .from(screenings)
      .where(
        and(eq(screenings.candidateId, cId), eq(screenings.jobId, jobId))
      )
      .orderBy(desc(screenings.createdAt));

    const reports = await db
      .select()
      .from(interviewReports)
      .where(eq(interviewReports.candidateId, cId))
      .orderBy(desc(interviewReports.createdAt));

    const avgInterviewScore =
      reports.length > 0
        ? reports.reduce((sum, r) => sum + (r.score ?? 0), 0) / reports.length
        : null;

    candidateData.push({
      id: cId,
      name: cand.fullName,
      stage: cand.stage,
      skills: cv?.extractedSkills ?? [],
      experiences: (cv?.extractedExperiences as Array<Record<string, string>>) ?? [],
      languages: cv?.extractedLanguages ?? [],
      screeningScore: screening?.score ?? null,
      interviewScore: avgInterviewScore,
      gaps: (screening?.gaps as string[]) ?? [],
      matchedMust: (screening?.matchedMustHave as string[]) ?? [],
    });
  }

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.';

  const userPrompt = `You are a senior recruitment advisor at Capgemini. Compare these candidates for the same job and provide a detailed comparison.

Job: ${job.title} (${job.seniority})
Must-Have: ${JSON.stringify(job.mustHave)}
Nice-To-Have: ${JSON.stringify(job.niceToHave)}

Candidates:
${candidateData
  .map(
    (c, i) => `
Candidate ${i + 1}: ${c.name} (ID: ${c.id})
- Stage: ${c.stage}
- Skills: ${JSON.stringify(c.skills)}
- Experience positions: ${c.experiences.length}
- Languages: ${JSON.stringify(c.languages)}
- Screening Score: ${c.screeningScore ?? 'N/A'}
- Interview Score: ${c.interviewScore?.toFixed(0) ?? 'N/A'}
- Matched Must-Have: ${JSON.stringify(c.matchedMust)}
- Skill Gaps: ${JSON.stringify(c.gaps)}`
  )
  .join('\n')}

Return a JSON object with:
- candidates: array of objects, each with:
  - candidateId: string (the UUID)
  - name: string
  - stage: string
  - screeningScore: number | null
  - interviewScore: number | null
  - pros: string[] (3-5 strengths)
  - cons: string[] (2-4 weaknesses/concerns)
  - overallFit: number 0-100 (overall fit score for this job)
- recommendation: string (2-3 sentence summary of who is the best fit and why)
- rankingOrder: string[] (candidateIds ordered from best to worst fit)`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = aiCandidateComparisonOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );

  return {
    jobTitle: job.title,
    ...parsed,
  };
}

// ==================== 3. AI Job Description Writer ====================

export async function generateJobDescription(
  title: string,
  seniority: string,
  businessUnit?: string,
  additionalContext?: string
): Promise<{
  title: string;
  description: string;
  mustHave: string[];
  niceToHave: string[];
  seniority: string;
  businessUnit: string | null;
}> {
  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.';

  const userPrompt = `You are a senior technical recruiter at Capgemini. Generate a complete, professional job description.

Requested Position: ${title}
Seniority: ${seniority}
${businessUnit ? `Business Unit: ${businessUnit}` : ''}
${additionalContext ? `Additional Context: ${additionalContext}` : ''}

Return a JSON object with:
- title: refined job title (string)
- description: detailed job description, 3-5 paragraphs covering role overview, responsibilities, team, and what we offer. Be specific to Capgemini as a global consulting/technology company. Do NOT use markdown — plain text with line breaks.
- mustHave: string[] (6-10 essential skills/requirements)
- niceToHave: string[] (4-6 desirable skills/qualifications)
- seniority: the seniority level (string)
- businessUnit: business unit or null`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return aiJobDescriptionOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );
}

// ==================== 4. AI Offer/Rejection Email ====================

export async function generateCandidateEmail(
  candidateId: string,
  jobId: string,
  emailType: 'offer' | 'rejection'
): Promise<{ subject: string; body: string }> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error('Job not found');

  // Gather interview report data for more personalized email
  const reports = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.candidateId, candidateId))
    .orderBy(desc(interviewReports.createdAt));

  const avgScore =
    reports.length > 0
      ? reports.reduce((sum, r) => sum + (r.score ?? 0), 0) / reports.length
      : null;

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.';

  let userPrompt: string;

  if (emailType === 'offer') {
    userPrompt = `Write a professional offer/acceptance email for a candidate who passed all interview stages at Capgemini.

Candidate: ${candidate.fullName}
Position: ${job.title} (${job.seniority})
${avgScore !== null ? `Average Interview Score: ${avgScore.toFixed(0)}/100` : ''}

The email should:
1. Congratulate the candidate warmly and personally
2. Confirm the position title at Capgemini
3. List the required onboarding documents:
   - Copy of national ID card (recto/verso)
   - Copy of diplomas and certificates
   - Bank account details (RIB)
   - 2 passport-sized photos
   - Medical certificate of fitness for work
   - Previous employment certificates (if applicable)
   - Social security number
4. Inform them the onboarding team will contact them for next steps
5. Include a warm welcome to Capgemini

Return JSON with "subject" and "body" fields. Body should be plain text with line breaks.`;
  } else {
    userPrompt = `Write a professional, warm, and respectful rejection email for a candidate at Capgemini.

Candidate: ${candidate.fullName}
Position: ${job.title} (${job.seniority})
${avgScore !== null ? `Average Interview Score: ${avgScore.toFixed(0)}/100` : ''}

The email should:
1. Thank the candidate sincerely for their time and interest in Capgemini
2. Acknowledge their strengths (be genuine, not generic)
3. Politely inform them they were not selected for this position
4. Encourage them to apply for future opportunities at Capgemini
5. Be empathetic, professional, and leave a positive impression

Return JSON with "subject" and "body" fields. Body should be plain text with line breaks.`;
  }

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return aiCandidateEmailOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );
}

// ==================== 5. Predictive Pipeline Score ====================

export async function predictPipelineScore(
  candidateId: string,
  jobId: string
): Promise<{
  hiringProbability: number;
  confidence: number;
  factors: Array<{ factor: string; impact: 'positive' | 'negative' | 'neutral'; detail: string }>;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error('Candidate not found');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error('Job not found');

  const [cv] = await db
    .select({
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedLanguages: cvPool.extractedLanguages,
    })
    .from(cvPool)
    .where(eq(cvPool.id, candidate.cvId));

  const [screening] = await db
    .select()
    .from(screenings)
    .where(
      and(eq(screenings.candidateId, candidateId), eq(screenings.jobId, jobId))
    )
    .orderBy(desc(screenings.createdAt));

  const reports = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.candidateId, candidateId))
    .orderBy(desc(interviewReports.createdAt));

  const interviewRecords = await db
    .select()
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId));

  const completedInterviews = interviewRecords.filter(
    (i) => i.status === 'completed'
  ).length;
  const cancelledInterviews = interviewRecords.filter(
    (i) => i.status === 'cancelled'
  ).length;

  const avgInterviewScore =
    reports.length > 0
      ? reports.reduce((sum, r) => sum + (r.score ?? 0), 0) / reports.length
      : null;

  const acceptedCount = reports.filter((r) => r.decision === 'accepted').length;
  const rejectedCount = reports.filter((r) => r.decision === 'rejected').length;

  const systemPrompt =
    'You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.';

  const userPrompt = `You are a recruitment data scientist at Capgemini. Predict the hiring probability for this candidate based on all available data.

Candidate: ${candidate.fullName}
Current Stage: ${candidate.stage}
Position: ${job.title} (${job.seniority})
Must-Have Skills: ${JSON.stringify(job.mustHave)}

Data Points:
- Screening Score: ${screening?.score?.toFixed(0) ?? 'N/A'}/100
- Must-Have Match: ${screening?.mustMatchScore?.toFixed(0) ?? 'N/A'}%
- Nice-to-Have Match: ${screening?.niceMatchScore?.toFixed(0) ?? 'N/A'}%
- Skill Gaps: ${JSON.stringify(screening?.gaps ?? [])}
- Completed Interviews: ${completedInterviews}
- Cancelled Interviews: ${cancelledInterviews}
- Average Interview Score: ${avgInterviewScore?.toFixed(0) ?? 'N/A'}/100
- Accepted Decisions: ${acceptedCount}
- Rejected Decisions: ${rejectedCount}
- Candidate Skills: ${JSON.stringify(cv?.extractedSkills ?? [])}
- Experience Positions: ${(cv?.extractedExperiences as unknown[])?.length ?? 0}
- Languages: ${JSON.stringify(cv?.extractedLanguages ?? [])}

Return a JSON object with:
- hiringProbability: number 0-100 (predicted chance of being hired)
- confidence: number 0-100 (how confident the prediction is, based on data completeness)
- factors: array of { factor: string, impact: "positive" | "negative" | "neutral", detail: string } (5-8 key factors)
- riskLevel: "low" | "medium" | "high" (risk of losing this candidate or bad hire)
- summary: 2-3 sentence summary of the prediction`;

  const content = await callOpenRouter(systemPrompt, userPrompt);
  return aiPredictivePipelineOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );
}
