import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviewReports } from '@/db/schema';
import { interviewReportSchema } from '../schemas';
import type {
  CandidateStage,
  InterviewReportInput,
  InterviewStage,
  UserRole,
} from '../types';
import { getCandidateForActor, updateCandidateStage } from './candidates';
import { getInterview, markInterviewCompleted } from './interviews';
import { logActivity } from './activity-log';
import { generateCandidateAcceptExcel } from './export';

export async function saveInterviewReport(
  input: InterviewReportInput,
  userId: string,
  actorRole: UserRole
) {
  const validated = interviewReportSchema.parse(input);
  if (actorRole !== 'admin' && actorRole !== validated.stage) {
    throw new Error('Interview stage is outside your role');
  }

  const interview = await getInterview(validated.interviewId);
  if (!interview) {
    throw new Error('Interview not found');
  }
  if (
    interview.candidateId !== validated.candidateId ||
    interview.stage !== validated.stage
  ) {
    throw new Error('Interview does not match this candidate and stage');
  }
  if (interview.status === 'cancelled') {
    throw new Error('A cancelled interview cannot receive a report');
  }
  const candidate = await getCandidateForActor(validated.candidateId, {
    userId,
    role: actorRole,
  });
  if (!candidate) {
    throw new Error('Candidate not found or not accessible');
  }
  const reportableStageByInterview: Record<InterviewStage, CandidateStage> = {
    ta: 'ta_interview',
    manager: 'manager_interview',
    hr: 'hr_interview',
  };
  if (candidate.stage !== reportableStageByInterview[validated.stage]) {
    throw new Error(
      `Candidate is not at the ${validated.stage} interview stage`
    );
  }

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
  const candidateName = candidate.fullName;
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
    await updateCandidateStage(validated.candidateId, acceptedStageMap[validated.stage], {
      changedBy: userId,
      source: 'interview_report',
      reason: `${validated.stage.toUpperCase()} interview accepted`,
    });

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

  } else if (validated.decision === 'rejected') {
    const rejectedStageMap: Record<InterviewStage, CandidateStage> = {
      ta: 'ta_rejected',
      manager: 'manager_rejected',
      hr: 'hr_rejected',
    };
    await updateCandidateStage(validated.candidateId, rejectedStageMap[validated.stage], {
      changedBy: userId,
      source: 'interview_report',
      reason: `${validated.stage.toUpperCase()} interview rejected`,
    });
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
