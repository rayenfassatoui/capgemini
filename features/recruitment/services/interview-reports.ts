import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviewReports } from '@/db/schema';
import { interviewReportSchema } from '../schemas';
import type { CandidateStage, InterviewReportInput, InterviewStage } from '../types';
import { getCandidate, updateCandidateStage } from './candidates';
import { markInterviewCompleted } from './interviews';
import { logActivity } from './activity-log';
import { createOnboardingChecklist } from './onboarding';
import { generateCandidateAcceptExcel } from './export';

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

  // Activity log
  const candidate = await getCandidate(validated.candidateId);
  const candidateName = candidate?.fullName ?? 'Unknown';
  await logActivity(
    userId,
    'interview_report_saved',
    'interview',
    validated.interviewId,
    `Report for ${candidateName} (${validated.stage}) - Score: ${validated.score}, Decision: ${validated.decision}`
  ).catch(() => {});

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

    // Generate acceptance Excel with CV + formation + report data
    generateCandidateAcceptExcel(validated.candidateId, validated.stage).then(() => {
      logActivity(
        userId,
        'accept_excel_generated',
        'candidate',
        validated.candidateId,
        `Accept Excel generated for ${candidateName} at ${validated.stage} stage`
      ).catch(() => {});
    }).catch(() => {});

    const nextStageMap: Record<InterviewStage, CandidateStage | null> = {
      ta: 'manager_interview',
      manager: 'hr_interview',
      hr: 'hired',
    };
    const nextStage = nextStageMap[validated.stage];
    if (nextStage) {
      await updateCandidateStage(validated.candidateId, nextStage);

      // Auto-create onboarding checklist when candidate is hired
      if (nextStage === 'hired') {
        await createOnboardingChecklist(validated.candidateId).catch(() => {});
        await logActivity(
          userId,
          'candidate_hired',
          'candidate',
          validated.candidateId,
          `${candidateName} has been hired - onboarding checklist created`
        ).catch(() => {});
      }
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
