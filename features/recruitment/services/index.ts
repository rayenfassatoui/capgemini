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
} from './cv-pool';

export { createJob, listJobs, getJob } from './jobs';

export { matchCvsToJob, matchCvsToJobWithFilters } from './cv-matching';

export {
  assignCvToJob,
  getCandidatesByJob,
  getCandidatesByStage,
  getCandidate,
  updateCandidateStage,
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
