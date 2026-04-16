/**
 * AI-Powered Features
 *
 * - Interview Debrief: AI analyzes answers + score → suggests accept/reject
 * - Candidate Comparison: Compare N candidates for a job → pros/cons table
 * - Job Description Writer: Generate full JD from a title/brief
 * - Offer/Rejection Email: AI drafts a professional email
 * - Predictive Pipeline Score: Predict hiring probability from screening + reports
 * - Candidate Summary: Executive summary of a candidate's profile and fit
 * - Talent Insights: Analyze talent pool trends, skill gaps, and market insights
 * - Follow-up Questions: Generate targeted follow-up interview questions
 * - Job Requirements Optimizer: Analyze and improve job descriptions
 */

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidates,
  cvPool,
  interviewGuides,
  interviewReports,
  interviews,
  jobs,
  screenings,
} from "@/db/schema";
import { callOpenRouter, cleanJsonResponse } from "./ai";
import {
  aiInterviewDebriefOutputSchema,
  aiCandidateComparisonOutputSchema,
  aiJobDescriptionOutputSchema,
  aiCandidateEmailOutputSchema,
  aiPredictivePipelineOutputSchema,
  aiCandidateSummaryOutputSchema,
  aiTalentInsightsOutputSchema,
  aiFollowupQuestionsOutputSchema,
  aiJobRequirementsOptimizerOutputSchema,
} from "../schemas";

// ==================== 1. AI Interview Debrief ====================

export async function generateInterviewDebrief(interviewId: string): Promise<{
  recommendation: "accept" | "reject" | "hold";
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
  if (!interview) throw new Error("Interview not found");

  const [report] = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.interviewId, interviewId));
  if (!report)
    throw new Error("Interview report not found — submit a report first");

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, interview.candidateId));
  if (!candidate) throw new Error("Candidate not found");

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, interview.jobId));
  if (!job) throw new Error("Job not found");

  const [cv] = await db
    .select({
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedLanguages: cvPool.extractedLanguages,
    })
    .from(cvPool)
    .where(eq(cvPool.id, candidate.cvId));

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a senior HR analyst at Capgemini. Analyze this interview report and provide a hiring recommendation.

Interview Details:
- Stage: ${interview.stage}
- Candidate: ${candidate.fullName}
- Position: ${job.title} (${job.seniority})
- Interview Score: ${report.score}/100
- Decision by interviewer: ${report.decision}
- Overall Evaluation: ${report.overallEvaluation ?? "None"}
- Notes: ${report.notes ?? "None"}

Candidate Answers:
${(report.candidateAnswers as Array<{ question: string; answer: string }>)
  .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
  .join("\n\n")}

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
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 2. Candidate Comparison ====================

function extractYearNumbers(value: string): number[] {
  const matches = value.match(/\b(19|20)\d{2}\b/g) ?? [];
  return matches
    .map((match) => Number(match))
    .filter((year) => Number.isFinite(year));
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateYearsFromDuration(value: string): number {
  const normalized = normalizeComparisonText(value);
  let total = 0;

  const yearMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s+(?:year|years|yr|yrs|ans|an)/,
  );
  if (yearMatch) {
    total += Number(yearMatch[1]);
  }

  const monthMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s+(?:month|months|mois)/,
  );
  if (monthMatch) {
    total += Number(monthMatch[1]) / 12;
  }

  const years = extractYearNumbers(normalized);
  if (years.length >= 2) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if (maxYear >= minYear) {
      total = Math.max(total, maxYear - minYear);
    }
  } else if (
    years.length === 1 &&
    /\b(current|present|ongoing|actuel|maintenant)\b/.test(normalized)
  ) {
    total = Math.max(total, new Date().getFullYear() - years[0]);
  }

  return Math.max(0, total);
}

function estimateYearsOfExperience(
  experiences: Array<Record<string, string>>,
): number {
  const estimated = experiences.reduce((sum, entry) => {
    const combined = Object.values(entry).join(" ");
    return sum + estimateYearsFromDuration(combined);
  }, 0);

  if (estimated > 0) {
    return Math.min(20, Number(estimated.toFixed(1)));
  }

  return Math.min(15, experiences.length * 1.5);
}

function computeExperienceScore(
  experiences: Array<Record<string, string>>,
  seniority: string,
): { score: number; years: number } {
  const years = estimateYearsOfExperience(experiences);
  const normalizedSeniority = normalizeComparisonText(seniority);

  let targetYears = 6;
  if (/\b(junior|entry)\b/.test(normalizedSeniority)) targetYears = 2;
  if (/\b(mid|intermediate)\b/.test(normalizedSeniority)) targetYears = 4;
  if (/\b(senior|lead|principal|architect)\b/.test(normalizedSeniority)) {
    targetYears = 7;
  }

  return {
    score: Math.max(20, Math.min(100, Math.round((years / targetYears) * 100))),
    years,
  };
}

function computeSkillScore(
  skills: string[],
  experiences: Array<Record<string, string>>,
  mustHave: string[],
): number {
  if (mustHave.length === 0) {
    return Math.max(
      35,
      Math.min(100, skills.length * 10 + experiences.length * 8),
    );
  }

  const normalizedSkills = skills.map((skill) =>
    normalizeComparisonText(skill),
  );
  const experienceCorpus = normalizeComparisonText(
    experiences.map((entry) => Object.values(entry).join(" ")).join(" "),
  );

  let matched = 0;
  for (const requiredSkill of mustHave) {
    const normalizedRequired = normalizeComparisonText(requiredSkill);
    const skillMatch = normalizedSkills.some(
      (skill) =>
        skill === normalizedRequired ||
        skill.includes(normalizedRequired) ||
        normalizedRequired.includes(skill),
    );
    const experienceMatch = experienceCorpus.includes(normalizedRequired);

    if (skillMatch || experienceMatch) {
      matched++;
    }
  }

  return Math.round((matched / mustHave.length) * 100);
}

function computeRecencyScore(
  experiences: Array<Record<string, string>>,
  mustHave: string[],
): number {
  if (experiences.length === 0) return 20;

  const recentEntries = experiences.slice(0, 2);
  let recency = 45;
  let relevance = mustHave.length === 0 ? 55 : 0;

  for (const entry of recentEntries) {
    const entryText = normalizeComparisonText(Object.values(entry).join(" "));

    if (
      /\b(current|present|ongoing|actuel|maintenant)\b/.test(entryText) ||
      extractYearNumbers(entryText).some(
        (year) => year >= new Date().getFullYear() - 2,
      )
    ) {
      recency = 100;
    } else if (
      extractYearNumbers(entryText).some(
        (year) => year >= new Date().getFullYear() - 4,
      )
    ) {
      recency = Math.max(recency, 75);
    }

    if (mustHave.length > 0) {
      let matched = 0;
      for (const requiredSkill of mustHave) {
        const normalizedRequired = normalizeComparisonText(requiredSkill);
        if (entryText.includes(normalizedRequired)) {
          matched++;
        }
      }
      relevance = Math.max(
        relevance,
        Math.round((matched / mustHave.length) * 100),
      );
    }
  }

  return Math.round(recency * 0.35 + relevance * 0.65);
}

function computeEducationScore(
  education: Array<Record<string, string>>,
): number {
  const educationText = normalizeComparisonText(
    education.map((entry) => Object.values(entry).join(" ")).join(" "),
  );

  if (!educationText) return 25;

  let score = 35;
  const educationHints = [
    "bachelor",
    "licence",
    "license",
    "master",
    "msc",
    "mba",
    "phd",
    "doctorate",
    "engineer",
    "ingenieur",
  ];
  const certificationHints = [
    "certified",
    "certification",
    "aws",
    "azure",
    "gcp",
    "scrum",
    "pmp",
    "oracle",
    "microsoft",
    "google",
    "kubernetes",
    "cisco",
    "itil",
  ];

  for (const hint of educationHints) {
    if (educationText.includes(hint)) {
      score += 12;
    }
  }

  for (const hint of certificationHints) {
    if (educationText.includes(hint)) {
      score += 8;
    }
  }

  return Math.min(100, score);
}

function buildComparisonFallback(
  jobTitle: string,
  seniority: string,
  mustHave: string[],
  candidateData: Array<{
    id: string;
    name: string;
    stage: string;
    skills: string[];
    experiences: Array<Record<string, string>>;
    education: Array<Record<string, string>>;
    languages: string[];
    screeningScore: number | null;
    interviewScore: number | null;
    gaps: string[];
    matchedMust: string[];
  }>,
): {
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
} {
  const ranked = candidateData
    .map((candidate) => {
      const experience = computeExperienceScore(
        candidate.experiences,
        seniority,
      );
      const skillScore = computeSkillScore(
        candidate.skills,
        candidate.experiences,
        mustHave,
      );
      const recencyScore = computeRecencyScore(candidate.experiences, mustHave);
      const educationScore = computeEducationScore(candidate.education);

      const overallFit = Math.round(
        experience.score * 0.4 +
          skillScore * 0.3 +
          recencyScore * 0.2 +
          educationScore * 0.1,
      );

      const pros: string[] = [
        `${experience.years.toFixed(1)} estimated years of experience`,
        mustHave.length > 0
          ? `${skillScore}% must-have skill alignment`
          : `${skillScore}% general resume skill-depth score`,
      ];

      if (recencyScore >= 75) {
        pros.push("Recent and relevant role history");
      }
      if (educationScore >= 60) {
        pros.push("Education or certification signals are above average");
      }
      if (candidate.screeningScore !== null) {
        pros.push(
          `Existing screening score: ${Math.round(candidate.screeningScore)}`,
        );
      }

      const cons: string[] = [];
      if (candidate.gaps.length > 0) {
        cons.push(`Skill gaps: ${candidate.gaps.slice(0, 3).join(", ")}`);
      }
      if (candidate.interviewScore !== null && candidate.interviewScore < 70) {
        cons.push(
          `Interview score is currently ${Math.round(candidate.interviewScore)}`,
        );
      }
      if (experience.score < 60) {
        cons.push("Experience depth is below the target seniority level");
      }
      if (educationScore < 45) {
        cons.push("Limited education/certification evidence in the CV");
      }

      return {
        candidateId: candidate.id,
        name: candidate.name,
        stage: candidate.stage,
        screeningScore:
          candidate.screeningScore !== null
            ? Math.round(candidate.screeningScore)
            : null,
        interviewScore:
          candidate.interviewScore !== null
            ? Math.round(candidate.interviewScore)
            : null,
        pros: pros.slice(0, 5),
        cons: cons.slice(0, 4),
        overallFit,
        experienceScore: experience.score,
        skillScore,
        recencyScore,
        educationScore,
        estimatedYears: experience.years,
      };
    })
    .sort((a, b) => b.overallFit - a.overallFit);

  const rankingOrder = ranked.map((candidate) => candidate.candidateId);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  const recommendation = winner
    ? runnerUp
      ? `Fallback mode: ${winner.name} ranks first for ${jobTitle} because their resume shows stronger experience depth, skill alignment, and role relevance than ${runnerUp.name}. This ranking was generated deterministically from available CV and screening data after the AI comparison path did not complete in time.`
      : `Fallback mode: ${winner.name} is the strongest available candidate for ${jobTitle} based on deterministic resume scoring from experience, skills, recency, and education signals.`
    : `Fallback mode: I could not rank candidates because no candidate data was available.`;

  return {
    jobTitle,
    candidates: ranked.map(
      ({
        candidateId,
        name,
        stage,
        screeningScore,
        interviewScore,
        pros,
        cons,
        overallFit,
      }) => ({
        candidateId,
        name,
        stage,
        screeningScore,
        interviewScore,
        pros,
        cons,
        overallFit,
      }),
    ),
    recommendation,
    rankingOrder,
  };
}

export async function compareCandidates(
  candidateIds: string[],
  jobId: string,
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
    throw new Error("At least 2 candidates are required for comparison");
  }
  if (candidateIds.length > 5) {
    throw new Error("Maximum 5 candidates can be compared at once");
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");

  const candidateData: Array<{
    id: string;
    name: string;
    stage: string;
    skills: string[];
    experiences: Array<Record<string, string>>;
    education: Array<Record<string, string>>;
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
        extractedEducation: cvPool.extractedEducation,
        extractedLanguages: cvPool.extractedLanguages,
      })
      .from(cvPool)
      .where(eq(cvPool.id, cand.cvId));

    const [screening] = await db
      .select()
      .from(screenings)
      .where(and(eq(screenings.candidateId, cId), eq(screenings.jobId, jobId)))
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
      experiences:
        (cv?.extractedExperiences as Array<Record<string, string>>) ?? [],
      education:
        (cv?.extractedEducation as Array<Record<string, string>>) ?? [],
      languages: cv?.extractedLanguages ?? [],
      screeningScore: screening?.score ?? null,
      interviewScore: avgInterviewScore,
      gaps: (screening?.gaps as string[]) ?? [],
      matchedMust: (screening?.matchedMustHave as string[]) ?? [],
    });
  }

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

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
- Screening Score: ${c.screeningScore ?? "N/A"}
- Interview Score: ${c.interviewScore?.toFixed(0) ?? "N/A"}
- Matched Must-Have: ${JSON.stringify(c.matchedMust)}
- Skill Gaps: ${JSON.stringify(c.gaps)}`,
  )
  .join("\n")}

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

  try {
    const content = await callOpenRouter(
      systemPrompt,
      userPrompt,
      "structured",
      {
        timeoutMs: 30_000,
        retryOnTimeout: true,
      },
    );
    const parsed = aiCandidateComparisonOutputSchema.parse(
      JSON.parse(cleanJsonResponse(content)),
    );

    return {
      jobTitle: job.title,
      ...parsed,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") {
      return buildComparisonFallback(
        job.title,
        job.seniority,
        job.mustHave as string[],
        candidateData,
      );
    }

    return buildComparisonFallback(
      job.title,
      job.seniority,
      job.mustHave as string[],
      candidateData,
    );
  }
}

// ==================== 3. AI Job Description Writer ====================

export async function generateJobDescription(
  title: string,
  seniority: string,
  businessUnit?: string,
  additionalContext?: string,
): Promise<{
  title: string;
  description: string;
  mustHave: string[];
  niceToHave: string[];
  seniority: string;
  businessUnit: string | null;
}> {
  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a senior technical recruiter at Capgemini. Generate a complete, professional job description.

Requested Position: ${title}
Seniority: ${seniority}
${businessUnit ? `Business Unit: ${businessUnit}` : ""}
${additionalContext ? `Additional Context: ${additionalContext}` : ""}

Return a JSON object with:
- title: refined job title (string)
- description: detailed job description, 3-5 paragraphs covering role overview, responsibilities, team, and what we offer. Be specific to Capgemini as a global consulting/technology company. Do NOT use markdown — plain text with line breaks.
- mustHave: string[] (6-10 essential skills/requirements)
- niceToHave: string[] (4-6 desirable skills/qualifications)
- seniority: the seniority level (string)
- businessUnit: business unit or null`;

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiJobDescriptionOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 4. AI Offer/Rejection Email ====================

export async function generateCandidateEmail(
  candidateId: string,
  jobId: string,
  emailType: "offer" | "rejection",
): Promise<{ subject: string; body: string }> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");

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
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  let userPrompt: string;

  if (emailType === "offer") {
    userPrompt = `Write a professional offer/acceptance email for a candidate who passed all interview stages at Capgemini.

Candidate: ${candidate.fullName}
Position: ${job.title} (${job.seniority})
${avgScore !== null ? `Average Interview Score: ${avgScore.toFixed(0)}/100` : ""}

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
${avgScore !== null ? `Average Interview Score: ${avgScore.toFixed(0)}/100` : ""}

The email should:
1. Thank the candidate sincerely for their time and interest in Capgemini
2. Acknowledge their strengths (be genuine, not generic)
3. Politely inform them they were not selected for this position
4. Encourage them to apply for future opportunities at Capgemini
5. Be empathetic, professional, and leave a positive impression

Return JSON with "subject" and "body" fields. Body should be plain text with line breaks.`;
  }

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiCandidateEmailOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 5. Predictive Pipeline Score ====================

export async function predictPipelineScore(
  candidateId: string,
  jobId: string,
): Promise<{
  hiringProbability: number;
  confidence: number;
  factors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
    detail: string;
  }>;
  riskLevel: "low" | "medium" | "high";
  summary: string;
}> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");

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
      and(eq(screenings.candidateId, candidateId), eq(screenings.jobId, jobId)),
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
    (i) => i.status === "completed",
  ).length;
  const cancelledInterviews = interviewRecords.filter(
    (i) => i.status === "cancelled",
  ).length;

  const avgInterviewScore =
    reports.length > 0
      ? reports.reduce((sum, r) => sum + (r.score ?? 0), 0) / reports.length
      : null;

  const acceptedCount = reports.filter((r) => r.decision === "accepted").length;
  const rejectedCount = reports.filter((r) => r.decision === "rejected").length;

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a recruitment data scientist at Capgemini. Predict the hiring probability for this candidate based on all available data.

Candidate: ${candidate.fullName}
Current Stage: ${candidate.stage}
Position: ${job.title} (${job.seniority})
Must-Have Skills: ${JSON.stringify(job.mustHave)}

Data Points:
- Screening Score: ${screening?.score?.toFixed(0) ?? "N/A"}/100
- Must-Have Match: ${screening?.mustMatchScore?.toFixed(0) ?? "N/A"}%
- Nice-to-Have Match: ${screening?.niceMatchScore?.toFixed(0) ?? "N/A"}%
- Skill Gaps: ${JSON.stringify(screening?.gaps ?? [])}
- Completed Interviews: ${completedInterviews}
- Cancelled Interviews: ${cancelledInterviews}
- Average Interview Score: ${avgInterviewScore?.toFixed(0) ?? "N/A"}/100
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
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 6. AI Candidate Summary ====================

export async function summarizeCandidate(
  candidateId: string,
  jobId?: string,
): Promise<{
  summary: string;
  keyStrengths: string[];
  keyRisks: string[];
  fitScore: number;
  recommendedActions: string[];
}> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");

  const [cv] = await db
    .select({
      extractedSkills: cvPool.extractedSkills,
      extractedExperiences: cvPool.extractedExperiences,
      extractedEducation: cvPool.extractedEducation,
      extractedLanguages: cvPool.extractedLanguages,
      extractedSummary: cvPool.extractedSummary,
    })
    .from(cvPool)
    .where(eq(cvPool.id, candidate.cvId));

  const [screening] = jobId
    ? await db
        .select()
        .from(screenings)
        .where(
          and(
            eq(screenings.candidateId, candidateId),
            eq(screenings.jobId, jobId),
          ),
        )
        .orderBy(desc(screenings.createdAt))
    : [undefined];

  const reports = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.candidateId, candidateId))
    .orderBy(desc(interviewReports.createdAt));

  let job: { title: string; seniority: string; mustHave: string[] } | undefined;
  if (jobId) {
    const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    job = j
      ? {
          title: j.title,
          seniority: j.seniority,
          mustHave: j.mustHave as string[],
        }
      : undefined;
  }

  const avgInterviewScore =
    reports.length > 0
      ? reports.reduce((sum, r) => sum + (r.score ?? 0), 0) / reports.length
      : null;

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a senior executive recruiter at Capgemini. Generate a concise executive summary of this candidate suitable for a hiring committee.

Candidate: ${candidate.fullName}
Current Stage: ${candidate.stage}
Email: ${candidate.email}
${job ? `Position: ${job.title} (${job.seniority})` : "No specific job assigned"}
${job ? `Must-Have Skills: ${JSON.stringify(job.mustHave)}` : ""}

CV Data:
- Skills: ${JSON.stringify(cv?.extractedSkills ?? [])}
- Experience: ${JSON.stringify(cv?.extractedExperiences ?? [])}
- Education: ${JSON.stringify(cv?.extractedEducation ?? [])}
- Languages: ${JSON.stringify(cv?.extractedLanguages ?? [])}
- CV Summary: ${cv?.extractedSummary ?? "Not available"}

Screening: ${screening ? `Score ${screening.score}/100, Gaps: ${JSON.stringify(screening.gaps)}` : "Not screened yet"}
Interviews: ${reports.length} completed, Avg Score: ${avgInterviewScore?.toFixed(0) ?? "N/A"}/100
${reports.map((r, i) => `  Report ${i + 1}: Stage ${r.stage}, Score ${r.score}/100, Decision: ${r.decision}`).join("\n")}

Return a JSON object with:
- summary: 1 paragraph executive summary (4-6 sentences, professional tone)
- keyStrengths: string[] (3-5 top strengths)
- keyRisks: string[] (2-4 risks or concerns)
- fitScore: number 0-100 (overall fit assessment${job ? " for this specific role" : ""})
- recommendedActions: string[] (2-3 concrete next steps)`;

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiCandidateSummaryOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 7. AI Talent Insights ====================

export async function analyzeTalentInsights(): Promise<{
  totalCandidates: number;
  topSkills: Array<{ skill: string; count: number; percentage: number }>;
  skillGaps: Array<{
    skill: string;
    demandCount: number;
    supplyCount: number;
    gapSeverity: "low" | "medium" | "high" | "critical";
  }>;
  marketTrends: string[];
  recommendations: string[];
  pipelineHealth: {
    activeJobs: number;
    avgTimeInPipeline: string;
    bottleneckStage: string | null;
    overallHealth: "healthy" | "warning" | "critical";
  };
}> {
  // Gather aggregated data for the AI to analyze
  const allCandidates = await db.select().from(candidates);
  const allJobs = await db.select().from(jobs).where(eq(jobs.status, "open"));
  const allScreenings = await db.select().from(screenings);
  const allCvs = await db
    .select({
      extractedSkills: cvPool.extractedSkills,
    })
    .from(cvPool);

  // Compute skill frequency across CV pool
  const skillFreq: Record<string, number> = {};
  for (const cv of allCvs) {
    for (const skill of cv.extractedSkills ?? []) {
      const normalized = skill.toLowerCase().trim();
      skillFreq[normalized] = (skillFreq[normalized] ?? 0) + 1;
    }
  }
  const topSkillsSorted = Object.entries(skillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, cnt]) => ({ skill, count: cnt }));

  // Compute demand from job must-haves
  const demandFreq: Record<string, number> = {};
  for (const job of allJobs) {
    for (const skill of job.mustHave as string[]) {
      const normalized = skill.toLowerCase().trim();
      demandFreq[normalized] = (demandFreq[normalized] ?? 0) + 1;
    }
  }

  // Stage distribution
  const stageDistribution: Record<string, number> = {};
  for (const c of allCandidates) {
    stageDistribution[c.stage] = (stageDistribution[c.stage] ?? 0) + 1;
  }

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a workforce analytics expert at Capgemini. Analyze this talent pool data and provide strategic insights.

Pool Statistics:
- Total CVs in Pool: ${allCvs.length}
- Total Candidates (assigned to jobs): ${allCandidates.length}
- Active Open Jobs: ${allJobs.length}
- Total Screenings Performed: ${allScreenings.length}

Top 15 Skills in CV Pool:
${topSkillsSorted.map((s) => `  ${s.skill}: ${s.count} candidates`).join("\n")}

Skills Demanded by Open Jobs:
${Object.entries(demandFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([s, c]) => `  ${s}: ${c} jobs`)
  .join("\n")}

Pipeline Stage Distribution:
${Object.entries(stageDistribution)
  .map(([stage, cnt]) => `  ${stage}: ${cnt}`)
  .join("\n")}

Return a JSON object with:
- totalCandidates: number (total in pipeline)
- topSkills: array of { skill: string, count: number, percentage: number } (top 10, percentage relative to total CVs)
- skillGaps: array of { skill: string, demandCount: number, supplyCount: number, gapSeverity: "low"|"medium"|"high"|"critical" } (skills demanded by jobs but underrepresented in pool)
- marketTrends: string[] (3-5 observations about the talent landscape)
- recommendations: string[] (3-5 actionable recommendations for the recruitment team)
- pipelineHealth: { activeJobs: number, avgTimeInPipeline: string (estimate), bottleneckStage: string or null, overallHealth: "healthy"|"warning"|"critical" }`;

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiTalentInsightsOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 8. AI Follow-up Questions ====================

export async function generateFollowupQuestions(interviewId: string): Promise<{
  followupQuestions: Array<{
    question: string;
    rationale: string;
    targetArea: string;
    difficulty: "easy" | "medium" | "hard";
  }>;
  areasToProbe: string[];
  overallAssessment: string;
}> {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId));
  if (!interview) throw new Error("Interview not found");

  const [report] = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.interviewId, interviewId));
  if (!report)
    throw new Error("Interview report not found — submit a report first");

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, interview.candidateId));
  if (!candidate) throw new Error("Candidate not found");

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, interview.jobId));
  if (!job) throw new Error("Job not found");

  // Get the original interview guide questions if they exist
  const [guide] = await db
    .select()
    .from(interviewGuides)
    .where(
      and(
        eq(interviewGuides.candidateId, interview.candidateId),
        eq(interviewGuides.jobId, interview.jobId),
        eq(interviewGuides.stage, interview.stage),
      ),
    );

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a senior interviewer coach at Capgemini. Based on the previous interview answers, generate targeted follow-up questions that dig deeper into areas of concern or interest.

Interview Context:
- Stage: ${interview.stage}
- Candidate: ${candidate.fullName}
- Position: ${job.title} (${job.seniority})
- Interview Score: ${report.score}/100
- Decision: ${report.decision}
- Overall Evaluation: ${report.overallEvaluation ?? "None"}

Original Questions Asked:
${((guide?.questions as string[]) ?? []).map((q, i) => `Q${i + 1}: ${q}`).join("\n")}

Candidate Answers:
${(report.candidateAnswers as Array<{ question: string; answer: string }>)
  .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
  .join("\n\n")}

Job Requirements:
- Must-Have: ${JSON.stringify(job.mustHave)}
- Nice-To-Have: ${JSON.stringify(job.niceToHave)}

Return a JSON object with:
- followupQuestions: array of 5-8 objects, each with:
  - question: the follow-up question (specific, probing, not generic)
  - rationale: why this question is important (1 sentence)
  - targetArea: what skill/competency this probes (e.g. "technical depth", "leadership", "problem-solving")
  - difficulty: "easy" | "medium" | "hard"
- areasToProbe: string[] (3-5 key areas that need deeper investigation)
- overallAssessment: 2-3 sentence assessment of the candidate's interview performance and what the follow-up should focus on`;

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiFollowupQuestionsOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}

// ==================== 9. AI Job Requirements Optimizer ====================

export async function optimizeJobRequirements(jobId: string): Promise<{
  analysis: {
    clarity: number;
    competitiveness: number;
    inclusivity: number;
    overallScore: number;
  };
  suggestions: Array<{
    area: string;
    issue: string;
    recommendation: string;
    priority: "low" | "medium" | "high";
  }>;
  optimizedMustHave: string[];
  optimizedNiceToHave: string[];
  optimizedDescription: string;
  marketInsights: string[];
}> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");

  // Gather data about how well this job's requirements match the talent pool
  const jobScreenings = await db
    .select()
    .from(screenings)
    .where(eq(screenings.jobId, jobId))
    .orderBy(desc(screenings.createdAt));

  const avgScreeningScore =
    jobScreenings.length > 0
      ? jobScreenings.reduce((sum, s) => sum + s.score, 0) /
        jobScreenings.length
      : null;

  const commonGaps: Record<string, number> = {};
  for (const s of jobScreenings) {
    for (const gap of s.gaps as string[]) {
      const normalized = gap.toLowerCase().trim();
      commonGaps[normalized] = (commonGaps[normalized] ?? 0) + 1;
    }
  }
  const topGaps = Object.entries(commonGaps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const [{ value: candidateCount }] = await db
    .select({ value: count() })
    .from(candidates)
    .where(eq(candidates.jobId, jobId));

  const systemPrompt =
    "You are a JSON API. Respond ONLY with valid JSON. No markdown, no explanations, no code fences.";

  const userPrompt = `You are a job description optimization expert at Capgemini. Analyze this job posting and suggest improvements to attract better candidates and improve screening match rates.

Current Job:
- Title: ${job.title}
- Seniority: ${job.seniority}
- Business Unit: ${job.businessUnit ?? "Not specified"}
- Description: ${job.description}
- Must-Have: ${JSON.stringify(job.mustHave)}
- Nice-To-Have: ${JSON.stringify(job.niceToHave)}

Performance Data:
- Candidates Applied: ${candidateCount}
- Screenings Performed: ${jobScreenings.length}
- Average Screening Score: ${avgScreeningScore?.toFixed(0) ?? "N/A"}/100
- Most Common Skill Gaps: ${topGaps.map(([gap, cnt]) => `${gap} (${cnt} candidates)`).join(", ") || "None yet"}

Analyze the job description for:
1. Clarity: Are requirements clear and specific?
2. Competitiveness: Are the requirements realistic for the market?
3. Inclusivity: Are there unnecessarily restrictive requirements?
4. Optimization: What changes would improve candidate quality?

Return a JSON object with:
- analysis: { clarity: 0-100, competitiveness: 0-100, inclusivity: 0-100, overallScore: 0-100 }
- suggestions: array of { area: string, issue: string, recommendation: string, priority: "low"|"medium"|"high" } (4-8 suggestions)
- optimizedMustHave: string[] (improved must-have list)
- optimizedNiceToHave: string[] (improved nice-to-have list)
- optimizedDescription: string (rewritten, improved job description — plain text with line breaks, no markdown)
- marketInsights: string[] (3-5 insights about how this role competes in the current market)`;

  const content = await callOpenRouter(systemPrompt, userPrompt, "generation");
  return aiJobRequirementsOptimizerOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content)),
  );
}
