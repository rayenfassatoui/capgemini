'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { waitUntil } from '@vercel/functions';
import { ZodError } from 'zod';
import type {
  CreateJobInput,
  UploadCvInput,
  ScheduleInterviewInput,
  InterviewReportInput,
  SendInterviewEmailInput,
  InterviewStage,
  CandidateStage,
  UserRole,
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

      // Generate semantic embedding asynchronously in the background
      // This prevents UI blocking and slow uploads
      waitUntil(services.generateCvEmbeddingAfterUpload(cv.id));

      // Check for duplicates after extraction
      const duplicates = await services.checkDuplicateCv(cv.id, session.user.id);
      revalidatePath('/ta/cv-pool');
      return { ...cv, duplicates };
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

export async function closeJobAction(jobId: string) {
  try {
    const session = await requireRole(['ta', 'admin']);
    const services = await getServices();
    const job = await services.closeJob(
      jobId,
      session.user.id,
      (session.user.role ?? 'ta') as UserRole
    );
    revalidatePath('/ta/jobs');
    revalidatePath(`/ta/jobs/${jobId}`);
    return job;
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== CV MATCHING ACTIONS ====================

export async function matchCvsToJobAction(jobId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.matchCvsToJob(jobId);
}

export async function matchCvsToJobWithFiltersAction(
  jobId: string,
  filters: { skills: string[]; languages: string[]; minPositions: number }
) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.matchCvsToJobWithFilters(jobId, filters);
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

// ==================== INTERVIEW AUTO-PILOT ACTIONS ====================

export async function generateInterviewAutoPilotAction(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const guide = await services.generateInterviewAutoPilotGuide(
      candidateId,
      jobId,
      stage,
      session.user.id
    );
    revalidatePath(`/ta/jobs/${jobId}`);
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return guide;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getInterviewAutoPilotAction(
  candidateId: string,
  jobId: string,
  stage: InterviewStage
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getInterviewAutoPilotGuide(candidateId, jobId, stage);
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

// ==================== SINGLE/MULTI CV EXCEL EXPORT ACTIONS ====================

export async function exportSingleCvExcelAction(cvId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  const buffer = await services.exportSingleCvToExcel(cvId);
  return Buffer.from(buffer).toString('base64');
}

export async function exportMultipleCvsZipAction(cvIds: string[]) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  const buffer = await services.exportMultipleCvsAsZip(cvIds);
  return Buffer.from(buffer).toString('base64');
}

// ==================== STATISTICS ACTIONS ====================

export async function getCvPoolStatsAction() {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.getCvPoolStats(session.user.id);
}

export async function getJobsStatsAction() {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.getJobsStats(session.user.id);
}

export async function getSmartInsightsAction() {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.getSmartInsights(session.user.id);
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

// ==================== AI STATISTICS CHAT ACTIONS ====================

export async function askAiStatisticsAction(question: string) {
  try {
    const session = await requireRole(['ta', 'admin']);
    const { aiStatisticsChatSchema } = await import('./schemas');
    const validated = aiStatisticsChatSchema.parse({ question });
    const services = await getServices();
    return { answer: await services.askAiAboutStatistics(validated.question, session.user.id) };
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== NOTIFICATION ACTIONS ====================

export async function getNotificationsAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getNotifications(session.user.id);
}

export async function getUnreadNotificationCountAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getUnreadCount(session.user.id);
}

export async function markNotificationReadAction(notificationId: string) {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.markNotificationRead(notificationId, session.user.id);
}

export async function markAllNotificationsReadAction() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  await services.markAllNotificationsRead(session.user.id);
}

// ==================== CANDIDATE NOTE ACTIONS ====================

export async function addCandidateNoteAction(candidateId: string, content: string) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const note = await services.addCandidateNote(candidateId, session.user.id, content);
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return note;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getCandidateNotesAction(candidateId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getCandidateNotes(candidateId);
}

export async function deleteCandidateNoteAction(noteId: string) {
  try {
    const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    return services.deleteCandidateNote(noteId, session.user.id);
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== ACTIVITY LOG ACTIONS ====================

export async function getActivityLogAction(limit?: number) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getActivityLog(limit);
}

export async function getActivityByEntityAction(entityType: string, entityId: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getActivityByEntity(entityType, entityId);
}

// ==================== ONBOARDING ACTIONS ====================

export async function getOnboardingChecklistAction(candidateId: string) {
  await requireRole(['ta', 'hr', 'admin']);
  const services = await getServices();
  return services.getOnboardingChecklist(candidateId);
}

export async function createOnboardingChecklistAction(candidateId: string) {
  await requireRole(['ta', 'hr', 'admin']);
  const services = await getServices();
  return services.createOnboardingChecklist(candidateId);
}

export async function toggleOnboardingTaskAction(taskId: string, completed: boolean) {
  const session = await requireRole(['ta', 'hr', 'admin']);
  const services = await getServices();
  return services.toggleOnboardingTask(taskId, completed, session.user.id);
}

export async function addOnboardingTaskAction(candidateId: string, title: string, description?: string) {
  await requireRole(['ta', 'hr', 'admin']);
  const services = await getServices();
  return services.addOnboardingTask(candidateId, title, description);
}

// ==================== JOB TEMPLATE ACTIONS ====================

export async function saveJobAsTemplateAction(jobId: string) {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  const result = await services.saveJobAsTemplate(jobId);
  revalidatePath('/ta/jobs');
  return result;
}

export async function listJobTemplatesAction() {
  await requireRole(['ta', 'admin']);
  const services = await getServices();
  return services.listJobTemplates();
}

export async function createJobFromTemplateAction(
  templateId: string,
  overrides?: { title?: string; description?: string }
) {
  const session = await requireRole(['ta', 'admin']);
  const services = await getServices();
  const job = await services.createJobFromTemplate(templateId, session.user.id, overrides);
  revalidatePath('/ta/jobs');
  return job;
}

// ==================== BULK STAGE UPDATE ACTIONS ====================

export async function bulkUpdateCandidateStageAction(
  candidateIds: string[],
  newStage: CandidateStage
) {
  try {
    await requireRole(['ta', 'manager', 'hr', 'admin']);
    const services = await getServices();
    const result = await services.bulkUpdateCandidateStage(candidateIds, newStage);
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

// ==================== INTERVIEW CALENDAR ACTIONS ====================

export async function getInterviewCalendarAction(startDate: string, endDate: string) {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const { getInterviewCalendar } = await import('./services/interviews');
  return getInterviewCalendar(session.user.id, startDate, endDate);
}

// ==================== USER LIST ACTIONS ====================

export async function listUsersByRoleAction(role: string) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.listUsersByRole(role);
}

// ==================== CANDIDATE ASSIGNMENT ACTIONS ====================

export async function assignManagerToCandidateAction(
  candidateId: string,
  managerId: string
) {
  try {
    await requireRole(['ta', 'admin']);
    const services = await getServices();
    const result = await services.assignManagerToCandidate(candidateId, managerId);
    revalidatePath('/ta/jobs');
    revalidatePath('/manager/candidates');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

export async function assignHrToCandidateAction(
  candidateId: string,
  hrId: string
) {
  try {
    await requireRole(['manager', 'admin']);
    const services = await getServices();
    const result = await services.assignHrToCandidate(candidateId, hrId);
    revalidatePath('/manager/candidates');
    revalidatePath('/hr/candidates');
    return result;
  } catch (error) {
    handleActionError(error);
  }
}

export async function getCandidatesByStageAndAssigneeAction(
  stages: CandidateStage[],
  assigneeField: 'assignedManagerId' | 'assignedHrId',
  assigneeId: string
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  return services.getCandidatesByStageAndAssignee(stages, assigneeField, assigneeId);
}

// ==================== ADMIN ACTIONS ====================

export async function getSystemOverviewAction() {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getSystemOverview();
}

export async function getRecruitmentAnalyticsAction() {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getRecruitmentAnalytics();
}

export async function getEmailLogsAction(limit = 100) {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getEmailLogs(limit);
}

export async function getHiredCandidatesOnboardingAction() {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getHiredCandidatesOnboarding();
}

// ==================== ADMIN ENRICHED DATA ACTIONS ====================

export async function getActivityLogEnrichedAction(limit?: number) {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getActivityLogEnriched(limit);
}

export async function getHiredCandidatesOnboardingDetailedAction() {
  await requireRole(['admin']);
  const services = await getServices();
  return services.getHiredCandidatesOnboardingDetailed();
}

// ==================== ADMIN EXCEL EXPORT ACTIONS ====================

export async function exportEmailLogsExcelAction() {
  await requireRole(['admin']);
  const services = await getServices();
  const buffer = await services.exportEmailLogsToExcel();
  return Buffer.from(buffer).toString('base64');
}

export async function exportActivityLogExcelAction() {
  await requireRole(['admin']);
  const services = await getServices();
  const buffer = await services.exportActivityLogToExcel();
  return Buffer.from(buffer).toString('base64');
}

export async function exportOnboardingExcelAction() {
  await requireRole(['admin']);
  const services = await getServices();
  const buffer = await services.exportOnboardingToExcel();
  return Buffer.from(buffer).toString('base64');
}

export async function generateCandidateAcceptExcelAction(
  candidateId: string,
  stage: 'ta' | 'manager' | 'hr'
) {
  await requireRole(['ta', 'manager', 'hr', 'admin']);
  const services = await getServices();
  const buffer = await services.generateCandidateAcceptExcel(candidateId, stage);
  return Buffer.from(buffer).toString('base64');
}
