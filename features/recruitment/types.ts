export type UserRole = 'ta' | 'manager' | 'hr' | 'admin';

export type CandidateStage =
  | 'new'
  | 'ta_screening'
  | 'ta_interview'
  | 'ta_accepted'
  | 'ta_rejected'
  | 'manager_interview'
  | 'manager_accepted'
  | 'manager_rejected'
  | 'hr_interview'
  | 'hr_accepted'
  | 'hr_rejected'
  | 'hired';

export type InterviewStage = 'ta' | 'manager' | 'hr';

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled';

export type InterviewDecision = 'pending' | 'accepted' | 'rejected';

// ---------- Input Types ----------

export interface CreateJobInput {
  title: string;
  description: string;
  mustHave: string[];
  niceToHave: string[];
  seniority: string;
  businessUnit?: string | null;
}

export interface UploadCvInput {
  filename: string;
  contentType: string;
  size: number;
  rawText?: string | null;
  rawBytes?: string | null;
}

export interface CvExtractionResult {
  extractedName?: string | null;
  extractedEmail?: string | null;
  extractedPhone?: string | null;
  extractedSkills: string[];
  extractedExperiences: Array<Record<string, string>>;
  extractedEducation: Array<Record<string, string>>;
  extractedLanguages: string[];
  extractedSummary?: string | null;
}

export interface AssignCvToJobInput {
  cvId: string;
  jobId: string;
}

export interface AssignManagerToCandidateInput {
  candidateId: string;
  managerId: string;
}

export interface AssignHrToCandidateInput {
  candidateId: string;
  hrId: string;
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface ScreeningResultData {
  score: number;
  mustMatchScore: number;
  niceMatchScore: number;
  gaps: string[];
  matchedMustHave: string[];
  matchedNiceToHave: string[];
  aiSummary?: string | null;
}

export interface ScheduleInterviewInput {
  candidateId: string;
  jobId: string;
  stage: InterviewStage;
  scheduledDate: string; // DD/MM/YYYY
  scheduledTime: string; // HH:mm
  meetLink: string;
}

export interface InterviewReportInput {
  interviewId: string;
  candidateId: string;
  stage: InterviewStage;
  notes?: string | null;
  candidateAnswers: Array<{ question: string; answer: string }>;
  overallEvaluation?: string | null;
  score: number;
  decision: InterviewDecision;
}

export interface UpdateInterviewQuestionsInput {
  guideId: string;
  questions: string[];
}

export interface SendInterviewEmailInput {
  interviewId: string;
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  scheduledDate: string;
  scheduledTime: string;
  meetLink: string;
  interviewerName: string;
  stage: InterviewStage;
}

// ---------- Pipeline Dashboard Types ----------

export interface DashboardStats {
  totalCandidates: number;
  totalJobs: number;
  totalInterviewsToday: number;
  pendingScreenings: number;
  stageBreakdown: Record<CandidateStage, number>;
}

export interface TodayInterview {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stage: InterviewStage;
  scheduledTime: string;
  meetLink: string;
  status: InterviewStatus;
}

// ---------- CV Matching Types ----------

export interface CvMatchFilters {
  skills: string[];
  languages: string[];
  minPositions: number;
}

export interface CvMatchResult {
  cvId: string;
  cvFilename: string;
  candidateName: string;
  candidateEmail: string;
  matchScore: number;
  matchedMustHave: string[];
  matchedNiceToHave: string[];
  gaps: string[];
  alreadyAssigned: boolean;
  aiRecommendation?: string;
  aiStrengths?: string[];
  aiConcerns?: string[];
  candidateSkills?: string[];
  candidateLanguages?: string[];
  experienceCount?: number;
}

// ---------- HR Email Types ----------

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export interface SendHRDecisionEmailInput {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
}

// ---------- Statistics Types ----------

export interface CvPoolStats {
  totalCvs: number;
  topSkills: Array<{ skill: string; count: number }>;
  languageDistribution: Array<{ language: string; count: number }>;
  uploadTrend: Array<{ date: string; count: number }>;
}

export interface JobsStats {
  totalJobs: number;
  bySeniority: Array<{ seniority: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byBusinessUnit: Array<{ unit: string; count: number }>;
  topSkillsDemand: Array<{ skill: string; count: number }>;
}

export interface SmartInsights {
  mostDemandedJobProfiles: Array<{ title: string; count: number }>;
  mostCommonCvSkills: Array<{ skill: string; count: number }>;
  skillGapAnalysis: Array<{ skill: string; demand: number; supply: number }>;
  pipelineFunnel: Record<CandidateStage, number>;
}
