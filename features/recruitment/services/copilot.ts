/**
 * AI INTERVIEW CO-PILOT — SERVICE LAYER
 * 
 * Business logic for the real-time interview analysis system.
 * Handles:
 * - Session management (active interview sessions)
 * - Transcript accumulation
 * - Live hint generation via LLM
 * - Post-interview report generation via LLM
 */

import { callOpenRouter, cleanJsonResponse } from './ai';
import { db } from '@/lib/db';
import { jobs, candidates, cvPool } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------- Types ----------

interface CopilotSession {
  sessionId: string;
  role: 'ta' | 'manager' | 'hr';
  jobId: string;
  candidateId: string;
  transcript: string[];
  hintsGiven: string[];
  startedAt: Date;
  lastHintAt: number;
}

interface LiveHint {
  type: 'probe' | 'flag' | 'info' | 'redirect';
  urgency: 'low' | 'medium' | 'high';
  message: string;
  context: string;
}

interface CopilotReport {
  calculatedScore: number;
  scoreBreakdown: {
    technicalAccuracy: { score: number; weight: number };
    problemSolving: { score: number; weight: number };
    communication: { score: number; weight: number };
    behavioralFit: { score: number; weight: number };
  };
  penaltiesApplied: string[];
  bonusesApplied: string[];
  decisionRecommendation: 'accepted' | 'rejected' | 'borderline';
  confidenceLevel: 'high' | 'medium' | 'low';
  overallEvaluation: string;
  detailedNotes: {
    technicalProficiency: string;
    problemSolvingAbility: string;
    communicationSkills: string;
    behavioralAssessment: string;
    redFlagsDetected: string[];
    standoutMoments: string[];
  };
  qnaExtracts: Array<{
    timestamp: string;
    questionAsked: string;
    candidateAnswerSummary: string;
    aiEvaluation: string;
    dimensionEvaluated: string;
  }>;
  interviewerFeedback: string;
}

// ---------- Active Sessions Map ----------
const activeSessions = new Map<string, CopilotSession>();

// ---------- Session Management ----------

export function createSession(
  sessionId: string,
  role: 'ta' | 'manager' | 'hr',
  jobId: string,
  candidateId: string
): CopilotSession {
  const session: CopilotSession = {
    sessionId,
    role,
    jobId,
    candidateId,
    transcript: [],
    hintsGiven: [],
    startedAt: new Date(),
    lastHintAt: 0,
  };
  activeSessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): CopilotSession | undefined {
  return activeSessions.get(sessionId);
}

export function removeSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

export function appendTranscript(sessionId: string, text: string): number {
  const session = activeSessions.get(sessionId);
  if (!session) return 0;
  session.transcript.push(text);
  return session.transcript.length;
}

// ---------- Live Hint Generation ----------

const HINT_COOLDOWN_MS = 120_000; // 2 minutes minimum between hints

export async function generateLiveHint(
  sessionId: string
): Promise<LiveHint | null> {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  // Enforce cooldown
  if (Date.now() - session.lastHintAt < HINT_COOLDOWN_MS) {
    return null;
  }

  // Need at least 6 transcript lines before generating hints
  if (session.transcript.length < 6) {
    return null;
  }

  // Sliding window: only send last 25 lines
  const window = session.transcript.slice(-25);

  // Fetch job details for context
  let jobContext = '';
  try {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, session.jobId)).limit(1);
    if (job) {
      jobContext = `Title: ${job.title}\nSeniority: ${job.seniority}\nMust-Have: ${(job.mustHave as string[]).join(', ')}\nNice-To-Have: ${(job.niceToHave as string[]).join(', ')}`;
    }
  } catch {
    jobContext = 'Job details unavailable';
  }

  const systemPrompt = `You are Capgemini's AI Interview Co-Pilot hint engine.
Role of interviewer: ${session.role}
Rules:
- Output ONLY a single JSON object (no markdown, no explanation).
- If no hint is needed, output: {"skip": true}
- If a hint IS needed, output: {"type": "probe|flag|info|redirect", "urgency": "low|medium|high", "message": "max 20 words", "context": "1 sentence why"}
- NEVER reveal answers. Only suggest WHAT to ask, not what the answer should be.
- Adjust language for the ${session.role} role (TA = simple, Manager = technical, HR = compliance).
- Max 20 words in message.`;

  const userPrompt = `<JOB_DETAILS>
${jobContext}

<PREVIOUS_HINTS>
${session.hintsGiven.length > 0 ? session.hintsGiven.join('\n') : 'None given yet.'}

<TRANSCRIPT_WINDOW>
${window.join('\n')}

Analyze the transcript window. Should the interviewer receive a hint right now?`;

  try {
    const raw = await callOpenRouter(systemPrompt, userPrompt, 'structured');
    const cleaned = cleanJsonResponse(raw);
    const parsed = JSON.parse(cleaned);

    if (parsed.skip) return null;

    const hint: LiveHint = {
      type: parsed.type || 'info',
      urgency: parsed.urgency || 'low',
      message: parsed.message || '',
      context: parsed.context || '',
    };

    // Track hint
    session.lastHintAt = Date.now();
    session.hintsGiven.push(hint.message);

    return hint;
  } catch (err) {
    console.error('[CoPilot] Hint generation failed:', err);
    return null;
  }
}

// ---------- Post-Interview Report Generation ----------

export async function generateInterviewReport(
  sessionId: string
): Promise<CopilotReport | null> {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  // Fetch job details
  let jobContext = '';
  try {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, session.jobId)).limit(1);
    if (job) {
      jobContext = `Title: ${job.title}\nSeniority: ${job.seniority}\nBusiness Unit: ${job.businessUnit || 'N/A'}\nMust-Have: ${(job.mustHave as string[]).join(', ')}\nNice-To-Have: ${(job.niceToHave as string[]).join(', ')}`;
    }
  } catch {
    jobContext = 'Job details unavailable';
  }

  // Fetch candidate details
  let candidateContext = '';
  try {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, session.candidateId)).limit(1);
    if (candidate) {
      // Get skills from the CV pool table
      const [cv] = await db.select().from(cvPool).where(eq(cvPool.id, candidate.cvId)).limit(1);
      const skills = (cv?.extractedSkills as string[]) || [];
      candidateContext = `Name: ${candidate.fullName}\nSkills: ${skills.join(', ')}`;
    }
  } catch {
    candidateContext = 'Candidate details unavailable';
  }

  // Build full transcript
  const fullTranscript = session.transcript.join('\n');
  const durationMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);

  // Role-specific weight overrides
  const weightOverrides: Record<string, string> = {
    ta: 'Technical: 25%, Communication: 30%, Behavioral: 30%, Problem Solving: 15%',
    manager: 'Technical: 50%, Problem Solving: 25%, Communication: 15%, Behavioral: 10%',
    hr: 'Behavioral: 40%, Communication: 35%, Problem Solving: 15%, Technical: 10%',
  };

  const systemPrompt = `You are Capgemini's AI Interview Co-Pilot report generator.
Analyze the full interview transcript and generate a comprehensive evaluation report.

SCORING WEIGHTS for this interview (Role: ${session.role}):
${weightOverrides[session.role] || weightOverrides.ta}

SCORING RULES:
- Each dimension scored 0-100, then weighted.
- Penalty: Fabrication = -30 points. Unprofessional conduct = score capped at 30. Plagiarism indicators = -15 points.
- Bonus: Honest gap admission = +5 points.
- Decision: score >= 70 = "accepted", 55-69 = "borderline", < 55 = "rejected".

OUTPUT: ONLY a single valid JSON object matching this exact schema (no markdown, no explanation):
{
  "calculatedScore": number,
  "scoreBreakdown": {
    "technicalAccuracy": { "score": number, "weight": number },
    "problemSolving": { "score": number, "weight": number },
    "communication": { "score": number, "weight": number },
    "behavioralFit": { "score": number, "weight": number }
  },
  "penaltiesApplied": string[],
  "bonusesApplied": string[],
  "decisionRecommendation": "accepted" | "rejected" | "borderline",
  "confidenceLevel": "high" | "medium" | "low",
  "overallEvaluation": "string (1 paragraph, tailored to ${session.role} role)",
  "detailedNotes": {
    "technicalProficiency": "string",
    "problemSolvingAbility": "string",
    "communicationSkills": "string",
    "behavioralAssessment": "string",
    "redFlagsDetected": string[],
    "standoutMoments": string[]
  },
  "qnaExtracts": [{ "timestamp": "string", "questionAsked": "string", "candidateAnswerSummary": "string", "aiEvaluation": "string", "dimensionEvaluated": "string" }],
  "interviewerFeedback": "string"
}`;

  const userPrompt = `<INTERVIEWER_ROLE>
${session.role}

<JOB_DETAILS>
${jobContext}

<CANDIDATE_PROFILE>
${candidateContext}

<INTERVIEW_DURATION>
${durationMinutes} minutes

<FULL_TRANSCRIPT>
${fullTranscript}
[END_OF_INTERVIEW]

Generate the evaluation report now.`;

  try {
    const raw = await callOpenRouter(systemPrompt, userPrompt, 'structured');
    const cleaned = cleanJsonResponse(raw);
    const report: CopilotReport = JSON.parse(cleaned);

    // NOTE: The report is returned to the API route.
    // If an interview record exists in the DB, the caller should save
    // the report via the existing saveInterviewReport service function.
    // The Co-Pilot session ID is NOT the same as an interview table ID.

    return report;
  } catch (err) {
    console.error('[CoPilot] Report generation failed:', err);
    return null;
  }
}
