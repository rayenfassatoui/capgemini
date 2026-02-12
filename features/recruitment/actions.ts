'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { ZodError } from 'zod';
import type {
  CreateJobInput,
  UploadCvInput,
  ScheduleInterviewInput,
  InterviewReportInput,
  SendInterviewEmailInput,
  InterviewStage,
  CandidateStage,
} from './types';

// ---------- Error Handling Utility ----------

function handleActionError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
  }
  if (error instanceof Error) {
    throw new Error(error.message);
  }
  throw new Error('An unexpected error occurred');
}

// ---------- Re-exports from services (lazy-loaded to avoid circular) ----------

async function getServices() {
  return import('./services');
}

// ==================== CV POOL ACTIONS ====================

export async function uploadCvAction(input: UploadCvInput) {
  try {
    const session = await requireRole(['ta', 'admin']);
    const services = await getServices();
    const cv = await services.uploadCv(input, session.user.id);

    // Parse and extract data from the CV
    if (input.rawBytes) {
      const rawText = await services.parseCvDocument(
        input.filename,
        input.contentType,
        input.rawBytes
      );
      const extraction = await services.extractCvDataWithAI(rawText);
      await services.updateCvExtraction(cv.id, {
        extractedName: extraction.extractedName,
        extractedEmail: extraction.extractedEmail,
        extractedPhone: extraction.extractedPhone,
        extractedSkills: extraction.extractedSkills,
        extractedExperiences: extraction.extractedExperiences,
        extractedEducation: extraction.extractedEducation,
        extractedLanguages: extraction.extractedLanguages,
        extractedSummary: extraction.extractedSummary,
      });
      // Also store rawText on the CV
      await services.updateCvRawText(cv.id, rawText);
    }

    revalidatePath('/ta/cv-pool');
    return cv;
  } catch (error) {
    handleActionError(error);
  }
}

export async function listCvPoolAction() {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.listCvPool(session.user.id);
}

export async function deleteCvAction(cvId: string) {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  await services.deleteCv(cvId, session.user.id);
  revalidatePath('/ta/cv-pool');
}

// ==================== JOB ACTIONS ====================

export async function createJobAction(input: CreateJobInput) {
  try {
    const session = await requireRole(['ta', 'admin']);
    const services = await getServices();
    const job = await services.createJob(input, session.user.id);
    revalidatePath('/ta/jobs');
    return job;
  } catch (error) {
    handleActionError(error);
  }
}

export async function listJobsAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.listJobs(session.user.id);
}

export async function getJobAction(jobId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getJob(jobId);
}

// ==================== CV MATCHING ACTIONS ====================

export async function matchCvsToJobAction(jobId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.matchCvsToJob(jobId);
}

// ==================== CANDIDATE PIPELINE ACTIONS ====================

export async function assignCvToJobAction(cvId: string, jobId: string) {
  try {
    const session = await requireRole(['ta', 'admin']);
    const services = await getServices();
    const candidate = await services.assignCvToJob(cvId, jobId, session.user.id);
    revalidatePath(`/ta/jobs/${jobId}`);
    return candidate;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getCandidatesByJobAction(jobId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getCandidatesByJob(jobId);
}

export async function getCandidatesByStageAction(stages: CandidateStage[]) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getCandidatesByStage(stages);
}

export async function getCandidateAction(candidateId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getCandidate(candidateId);
}

export async function updateCandidateStageAction(
  candidateId: string,
  newStage: CandidateStage
) {
  try {
    await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const result = await services.updateCandidateStage(candidateId, newStage);
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== SCREENING ACTIONS ====================

export async function generateScreeningAction(
  candidateId: string,
  jobId: string
) {
  try {
    await requireRole(['ta', 'admin']);
    const services = await getServices();
    const result = await services.generateScreeningWithAI(candidateId, jobId);
    revalidatePath(`/ta/jobs/${jobId}`);
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getScreeningAction(candidateId: string, jobId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getScreening(candidateId, jobId);
}

// ==================== INTERVIEW GUIDE ACTIONS ====================

export async function generateInterviewQuestionsAction(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const guide = await services.generateInterviewQuestionsWithAI(
      candidateId,
      jobId,
      stage,
      session.user.id
    );
    revalidatePath(`/ta/jobs/${jobId}`);
    revalidatePath(`/manager/candidates`);
    revalidatePath(`/hr/candidates`);
    return guide;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getInterviewGuideAction(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterviewGuide(candidateId, jobId, stage);
}

export async function updateInterviewQuestionsAction(
  guideId: string,
  questions: string[]
) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const result = await services.updateInterviewQuestions(
      guideId,
      questions,
      session.user.id
    );
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== INTERVIEW ACTIONS ====================

export async function scheduleInterviewAction(input: ScheduleInterviewInput) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const interview = await services.scheduleInterview(input, session.user.id);
    revalidatePath('/ta/dashboard');
    revalidatePath('/manager/dashboard');
    revalidatePath('/hr/dashboard');
    return interview;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getInterviewAction(interviewId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterview(interviewId);
}

export async function getInterviewByCandidateAndStageAction(
  candidateId: string,
  stage: InterviewStage
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterviewByCandidateAndStage(candidateId, stage);
}

export async function getTodayInterviewsAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getTodayInterviews(session.user.id);
}

export async function markInterviewCompletedAction(interviewId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  const result = await services.markInterviewCompleted(interviewId);
  revalidatePath('/ta/dashboard');
  revalidatePath('/manager/dashboard');
  revalidatePath('/hr/dashboard');
  return result;
}

// ==================== INTERVIEW REPORT ACTIONS ====================

export async function saveInterviewReportAction(input: InterviewReportInput) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const report = await services.saveInterviewReport(input, session.user.id);
    revalidatePath('/ta/dashboard');
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/dashboard');
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/dashboard');
    revalidatePath('/hr/candidates');
    return report;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getInterviewReportAction(interviewId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterviewReport(interviewId);
}

export async function getInterviewReportsByCandidateAction(
  candidateId: string
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterviewReportsByCandidate(candidateId);
}

// ==================== EMAIL ACTIONS ====================

export async function sendInterviewEmailAction(input: SendInterviewEmailInput) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const result = await services.sendInterviewEmail(input, session.user.id);
    revalidatePath('/ta/dashboard');
    revalidatePath('/manager/dashboard');
    revalidatePath('/hr/dashboard');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== EXCEL EXPORT ACTIONS ====================

export async function exportAcceptedCandidatesAction() {
  await requireRole(['hr', 'admin']);
  const services = await getServices();
  const buffer = await services.exportAcceptedCandidatesToExcel();
  // Convert Buffer to base64 string for client transport
  return Buffer.from(buffer).toString('base64');
}

// ==================== DASHBOARD ACTIONS ====================

export async function getDashboardStatsAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  const role = (session.user.role ?? 'ta') as 'ta' | 'manager' | 'hr' | 'admin';
  return services.getDashboardStats(session.user.id, role);
}

export async function getTodayInterviewScheduleAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getTodayInterviewSchedule(session.user.id);
}

// ==================== CV POOL EXTRAS ====================

export async function exportCvPoolAction() {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  const buffer = await services.exportCvPoolToExcel(session.user.id);
  return Buffer.from(buffer).toString('base64');
}

export async function getCvDetailsAction(cvId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.getCvDetails(cvId);
}

export async function getCvFileAction(cvId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.getCvFile(cvId);
}

// ==================== HR DECISION EMAIL ACTIONS ====================

export async function generateHRDecisionEmailAction(
  candidateId: string,
  jobId: string,
  decision: 'accepted' | 'rejected'
) {
  await requireRole(['hr', 'admin']);
  const services = await getServices();
  return services.generateHRDecisionEmailWithAI(candidateId, jobId, decision);
}

export async function sendHRDecisionEmailAction(input: {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
}) {
  const session = await requireRole(['hr', 'admin']);
  const services = await getServices();
  return services.sendHRDecisionEmail(input, session.user.id);
}
