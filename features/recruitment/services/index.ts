// Barrel re-export from all service modules
export { ensureEnv, cleanJsonResponse, normalizeContent, callOpenRouter } from './ai';

export {
  uploadCv,
  parseCvDocument,
  extractCvDataWithAI,
  updateCvExtraction,
  updateCvRawText,
  listCvPool,
  deleteCv,
  getCvDetails,
  getCvFile,
  searchCvPool,
} from './cv-pool';

export { createJob, listJobs, getJob, closeJob, saveJobAsTemplate, listJobTemplates, createJobFromTemplate } from './jobs';

export { matchCvsToJob, matchCvsToJobWithFilters } from './cv-matching';

export {
  assignCvToJob,
  getCandidatesByJob,
  getCandidatesByStage,
  getCandidate,
  updateCandidateStage,
  bulkUpdateCandidateStage,
  assignManagerToCandidate,
  assignHrToCandidate,
  getCandidatesByStageAndAssignee,
} from './candidates';

export { generateScreeningWithAI, getScreening } from './screening';

export {
  generateInterviewQuestionsWithAI,
  getInterviewGuide,
  updateInterviewQuestions,
} from './interview-guides';

export {
  scheduleInterview,
  getInterview,
  getInterviewByCandidateAndStage,
  getTodayInterviews,
  markInterviewCompleted,
  cancelInterview,
  rescheduleInterview,
} from './interviews';

export {
  saveInterviewReport,
  getInterviewReport,
  getInterviewReportsByCandidate,
} from './interview-reports';

export {
  sendInterviewEmail,
  generateHRDecisionEmailWithAI,
  sendHRDecisionEmail,
} from './email';

export {
  exportAcceptedCandidatesToExcel,
  exportCvPoolToExcel,
  exportSingleCvToExcel,
  exportMultipleCvsAsZip,
  exportEmailLogsToExcel,
  exportActivityLogToExcel,
  exportOnboardingToExcel,
  generateCandidateAcceptExcel,
} from './export';

export { getDashboardStats, getTodayInterviewSchedule } from './dashboard';

export { getCvPoolStats, getJobsStats, getSmartInsights } from './statistics';

export {
  getStatisticsChatContext,
  askAiAboutStatistics,
  listChatConversations,
  createChatConversation,
  getOrCreateChatConversation,
  getChatHistory,
  saveChatMessage,
  deleteChatConversation,
  clearChatConversation,
} from './chat';

export {
  generateInterviewDebrief,
  compareCandidates,
  generateJobDescription,
  generateCandidateEmail,
  predictPipelineScore,
  summarizeCandidate,
  analyzeTalentInsights,
  generateFollowupQuestions,
  optimizeJobRequirements,
} from './ai-features';

export {
  createNotification,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  notifyStageChange,
  notifyInterviewScheduled,
} from './notifications';

export {
  addCandidateNote,
  getCandidateNotes,
  deleteCandidateNote,
} from './candidate-notes';

export {
  logActivity,
  getActivityLog,
  getActivityByEntity,
  getActivityLogEnriched,
} from './activity-log';

export {
  createOnboardingChecklist,
  getOnboardingChecklist,
  toggleOnboardingTask,
  addOnboardingTask,
} from './onboarding';

export {
  checkDuplicateCv,
  scanPoolForDuplicates,
} from './duplicate-detection';

export { listUsersByRole } from './users';

export { getSystemOverview, getRecruitmentAnalytics, getEmailLogs, getHiredCandidatesOnboarding, getHiredCandidatesOnboardingDetailed } from './admin';
export type { SystemOverview, RecruitmentAnalytics, EmailLogEntry, OnboardingOverviewEntry, OnboardingDetailedEntry } from './admin';
export type { EnrichedActivityEntry } from './activity-log';
