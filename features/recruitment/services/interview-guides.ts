import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cvPool, interviewGuides, screenings } from '@/db/schema';
import { updateQuestionsSchema, aiInterviewAutoPilotOutputSchema } from '../schemas';
import type { InterviewStage, InterviewAutoPilotGuide } from '../types';
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
  userId: string
) {
  void userId;
  const validated = updateQuestionsSchema.parse({ guideId, questions });
  const [updated] = await db
    .update(interviewGuides)
    .set({ questions: validated.questions, updatedAt: new Date() })
    .where(eq(interviewGuides.id, validated.guideId))
    .returning();

  return updated;
}

// ==================== AUTO-PILOT INTERVIEW GUIDE ====================

const AUTOPILOT_SYSTEM_PROMPT = `You are an elite Technical Hiring Manager and seasoned Interview Architect at Capgemini. Your objective is to read a candidate's CV data and compare it against the target Job Description to generate a Hyper-Personalized Interview Guide.
You do not ask generic, standard, or theoretical questions. You ask deep, scenario-based, and highly technical questions designed to test actual experience, problem-solving skills, and learning agility.

STRICT CONSTRAINTS & RULES:
1. NO GENERIC QUESTIONS: NEVER ask questions like "What is your greatest weakness?", "Where do you see yourself in 5 years?", or "Explain what API stands for".
2. VERIFY STRENGTHS DEEPLY: For the skills the candidate claims to know well (Strengths), formulate advanced, edge-case, or architecture-level questions to prove they aren't bluffing. Tie it to the Seniority Level.
3. PROBE THE GAPS FAIRLY: For skills the job requires but the candidate lacks (Gaps), DO NOT ask them how to use that specific skill. Instead, ask scenario-based questions to measure their capacity to learn it or their experience with analogous technologies.
4. CONSULTING MINDSET (BEHAVIORAL): Capgemini is a consulting firm. Include 1-2 behavioral questions testing how they handle difficult clients, changing requirements, or communicating technical debt to non-technical stakeholders.
5. JSON ONLY: You must output ONLY valid JSON. No markdown wrappers, no intro text, no outro text.

OUTPUT SCHEMA (strict JSON):
{
  "interviewerBriefing": "A 2-3 sentence summary telling the human interviewer what this candidate is good at, what they lack, and what the main focus of this interview should be.",
  "technicalQuestions": [
    {
      "topic": "[Specific Tech/Concept]",
      "question": "[The advanced technical question]",
      "whatToListenFor": "[1-2 sentences explaining what a Strong vs Weak answer sounds like]",
      "targetSeniority": "[e.g., Senior, Mid-Level]"
    }
  ],
  "gapMitigationQuestions": [
    {
      "missingSkill": "[The specific job requirement they lack]",
      "question": "[A scenario question testing analogous knowledge or learning agility]",
      "whatToListenFor": "[Signs of adaptability, fundamental knowledge, or problem-solving]"
    }
  ],
  "behavioralQuestions": [
    {
      "consultingScenario": "[A real-world Capgemini client scenario]",
      "question": "[The specific question to ask the candidate]",
      "redFlags": ["Array of warning signs"]
    }
  ]
}

EXAMPLES OF WHAT NOT TO DO vs WHAT TO DO:
BAD: "Can you tell me what Docker is and how you used it?" (Too basic, easily memorized from a tutorial)
GOOD: "I see you have extensive experience building microservices with Node.js. If a client reports intermittent memory leaks in one of the services running in production, walk me through your exact debugging process from alert to resolution." (Tests actual production experience, debugging processes, and CI/CD mindset)

Generate 4-6 technicalQuestions, 0-4 gapMitigationQuestions (only if gaps exist), and 1-2 behavioralQuestions.
Respond ONLY with valid JSON matching the schema above.`;

export async function generateInterviewAutoPilotGuide(
  candidateId: string,
  jobId: string,
  stage: InterviewStage,
  userId: string
): Promise<InterviewAutoPilotGuide> {
  const candidate = await getCandidate(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const job = await getJob(jobId);
  if (!job) throw new Error('Job not found');

  const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId));

  // Fetch screening data if available (contains strengths + gaps)
  const [screening] = await db
    .select()
    .from(screenings)
    .where(and(eq(screenings.candidateId, candidateId), eq(screenings.jobId, jobId)))
    .orderBy(desc(screenings.createdAt));

  const candidateSkills = cv?.extractedSkills ?? [];
  const matchedMustHave = screening?.matchedMustHave ?? [];
  const matchedNiceToHave = screening?.matchedNiceToHave ?? [];
  const gaps = screening?.gaps ?? [];

  const stageContext: Record<InterviewStage, string> = {
    ta: 'This is the Talent Acquisition (TA) initial technical screening. Focus on validating core technical claims, assessing communication, and gauging motivation.',
    manager: 'This is the Hiring Manager deep-dive. Focus on architecture decisions, advanced problem-solving, production experience, and team dynamics.',
    hr: 'This is the HR final round. Focus on behavioral competencies, consulting mindset, cultural fit, salary expectations, and long-term career alignment.',
  };

  const userPrompt = `Analyze the following data and generate the Interview Guide JSON.

<JOB_DETAILS>
Title: ${job.title}
Seniority Level: ${job.seniority}
Description: ${job.description}
Must-Have Skills: ${JSON.stringify(job.mustHave)}
Nice-To-Have Skills: ${JSON.stringify(job.niceToHave)}
Business Unit: ${job.businessUnit ?? 'N/A'}
</JOB_DETAILS>

<CANDIDATE_PROFILE>
Candidate Name: ${candidate.fullName}
Claimed Skills: ${JSON.stringify(candidateSkills)}
Experience Points: ${JSON.stringify(cv?.extractedExperiences ?? [])}
Education: ${JSON.stringify(cv?.extractedEducation ?? [])}
Languages: ${JSON.stringify(cv?.extractedLanguages ?? [])}
Summary: ${cv?.extractedSummary ?? 'N/A'}
Identified Strengths (Matched Must-Have): ${JSON.stringify(matchedMustHave)}
Matched Nice-To-Have: ${JSON.stringify(matchedNiceToHave)}
Identified Skill Gaps: ${JSON.stringify(gaps)}
Screening Score: ${screening?.score ?? 'N/A'}/100
Screening AI Summary: ${screening?.aiSummary ?? 'N/A'}
</CANDIDATE_PROFILE>

<INTERVIEW_CONTEXT>
Stage: ${stage.toUpperCase()} - ${stageContext[stage]}
</INTERVIEW_CONTEXT>

Generate the Interview Guide JSON now.`;

  const content = await callOpenRouter(AUTOPILOT_SYSTEM_PROMPT, userPrompt, 'generation');
  const parsed = aiInterviewAutoPilotOutputSchema.parse(
    JSON.parse(cleanJsonResponse(content))
  );

  // Extract flat question strings for backward compatibility with the questions column
  const flatQuestions: string[] = [
    ...parsed.technicalQuestions.map((q) => `[${q.topic}] ${q.question}`),
    ...parsed.gapMitigationQuestions.map((q) => `[Gap: ${q.missingSkill}] ${q.question}`),
    ...parsed.behavioralQuestions.map((q) => `[Behavioral] ${q.question}`),
  ];

  // Upsert: update existing guide or create new one
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
    await db
      .update(interviewGuides)
      .set({
        questions: flatQuestions,
        autoPilotData: parsed,
        updatedAt: new Date(),
      })
      .where(eq(interviewGuides.id, existing[0].id));
  } else {
    await db.insert(interviewGuides).values({
      candidateId,
      jobId,
      stage,
      questions: flatQuestions,
      autoPilotData: parsed,
      createdBy: userId,
    });
  }

  return parsed;
}

export async function getInterviewAutoPilotGuide(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
): Promise<InterviewAutoPilotGuide | null> {
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

  if (!guide?.autoPilotData) return null;
  return guide.autoPilotData as InterviewAutoPilotGuide;
}
