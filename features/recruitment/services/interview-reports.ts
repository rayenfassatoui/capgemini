import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviewReports } from '@/db/schema';
import { interviewReportSchema } from '../schemas';
import type { CandidateStage, InterviewReportInput, InterviewStage } from '../types';
import { updateCandidateStage } from './candidates';
import { markInterviewCompleted } from './interviews';

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

  await markInterviewCompleted(validated.interviewId);

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
