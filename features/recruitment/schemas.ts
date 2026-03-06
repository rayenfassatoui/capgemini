import { z } from 'zod';

// ---------- Enums ----------

export const userRoleSchema = z.enum(['ta', 'manager', 'hr', 'admin']);

export const candidateStageSchema = z.enum([
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'ta_rejected',
  'manager_interview',
  'manager_accepted',
  'manager_rejected',
  'hr_interview',
  'hr_accepted',
  'hr_rejected',
  'hired',
]);

export const interviewStageSchema = z.enum(['ta', 'manager', 'hr']);

export const interviewStatusSchema = z.enum(['scheduled', 'completed', 'cancelled']);

export const interviewDecisionSchema = z.enum(['pending', 'accepted', 'rejected']);

// ---------- Job Schemas ----------

export const createJobSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(20),
  mustHave: z.array(z.string().min(1)).min(1),
  niceToHave: z.array(z.string().min(1)).default([]),
  seniority: z.string().min(2),
  businessUnit: z.string().min(2).nullable().optional(),
});

// ---------- CV Pool Schemas ----------

export const uploadCvSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().positive(),
  rawText: z.string().nullable().optional(),
  rawBytes: z.string().nullable().optional(),
});

export const cvExtractionSchema = z.object({
  extractedName: z.string().nullable().optional(),
  extractedEmail: z.string().email().nullable().optional(),
  extractedPhone: z.string().nullable().optional(),
  extractedSkills: z.array(z.string()).default([]),
  extractedExperiences: z.array(z.record(z.string(), z.string())).default([]),
  extractedEducation: z.array(z.record(z.string(), z.string())).default([]),
  extractedLanguages: z.array(z.string()).default([]),
  extractedSummary: z.string().nullable().optional(),
});

// ---------- Candidate Schemas ----------

export const assignCvToJobSchema = z.object({
  cvId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const assignManagerToCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  managerId: z.string().min(1),
});

export const assignHrToCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  hrId: z.string().min(1),
});

// ---------- Screening Schemas ----------

export const screeningSchema = z.object({
  score: z.number().min(0).max(100),
  mustMatchScore: z.number().min(0).max(100),
  niceMatchScore: z.number().min(0).max(100),
  gaps: z.array(z.string()).default([]),
  matchedMustHave: z.array(z.string()).default([]),
  matchedNiceToHave: z.array(z.string()).default([]),
  aiSummary: z.string().nullable().optional(),
});

export const aiScreeningOutputSchema = z.object({
  score: z.number().min(0).max(100),
  mustMatchScore: z.number().min(0).max(100),
  niceMatchScore: z.number().min(0).max(100),
  gaps: z.array(z.string()).default([]),
  matchedMustHave: z.array(z.string()).default([]),
  matchedNiceToHave: z.array(z.string()).default([]),
  aiSummary: z.string().optional(),
});

// ---------- Interview Guide Schemas ----------

export const interviewGuideQuestionsSchema = z.object({
  questions: z.array(z.string().min(3)).min(3).max(10),
});

export const updateQuestionsSchema = z.object({
  guideId: z.string().uuid(),
  questions: z.array(z.string().min(3)).min(1),
});

// ---------- Interview Schemas ----------

export const scheduleInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  jobId: z.string().uuid(),
  stage: interviewStageSchema,
  scheduledDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Date must be in DD/MM/YYYY format'),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  meetLink: z.string().url(),
});

// ---------- Interview Report Schemas ----------

export const interviewReportSchema = z.object({
  interviewId: z.string().uuid(),
  candidateId: z.string().uuid(),
  stage: interviewStageSchema,
  notes: z.string().nullable().optional(),
  candidateAnswers: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string(),
    })
  ).default([]),
  overallEvaluation: z.string().nullable().optional(),
  score: z.number().min(0).max(100),
  decision: interviewDecisionSchema,
});

// ---------- Email Schemas ----------

export const sendInterviewEmailSchema = z.object({
  interviewId: z.string().uuid(),
  candidateEmail: z.string().email(),
  candidateName: z.string().min(1),
  jobTitle: z.string().min(1),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
  meetLink: z.string().url(),
  interviewerName: z.string().min(1),
  stage: interviewStageSchema,
});

// ---------- AI CV Extraction Output ----------

export const aiCvExtractionOutputSchema = z.object({
  name: z.string().nullish(),
  email: z.preprocess(
    (val) => val === null || val === undefined || val === '' ? undefined : val,
    z.string().email().optional()
  ),
  phone: z.string().nullish(),
  skills: z.array(z.string()).default([]),
  experiences: z.array(z.record(z.string(), z.string())).default([]),
  education: z.array(z.record(z.string(), z.string())).default([]),
  languages: z.array(z.string()).default([]),
  summary: z.string().nullish(),
});

// ---------- CV Match Filter Schemas ----------

export const cvMatchFiltersSchema = z.object({
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  minPositions: z.number().min(0).default(0),
});

export const aiMatchRecommendationItemSchema = z.object({
  cvId: z.string(),
  score: z.number().min(0).max(100),
  recommendation: z.string(),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

export const aiMatchRecommendationOutputSchema = z.array(aiMatchRecommendationItemSchema);

// ---------- AI Interview Debrief ----------

export const aiInterviewDebriefOutputSchema = z.object({
  recommendation: z.enum(['accept', 'reject', 'hold']),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  suggestedNextSteps: z.string(),
});

// ---------- AI Candidate Comparison ----------

export const aiCandidateComparisonOutputSchema = z.object({
  candidates: z.array(
    z.object({
      candidateId: z.string(),
      name: z.string(),
      stage: z.string(),
      screeningScore: z.number().nullable(),
      interviewScore: z.number().nullable(),
      pros: z.array(z.string()).default([]),
      cons: z.array(z.string()).default([]),
      overallFit: z.number().min(0).max(100),
    })
  ),
  recommendation: z.string(),
  rankingOrder: z.array(z.string()),
});

// ---------- AI Job Description Writer ----------

export const aiJobDescriptionOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  mustHave: z.array(z.string()).min(1),
  niceToHave: z.array(z.string()).default([]),
  seniority: z.string(),
  businessUnit: z.string().nullable().default(null),
});

// ---------- AI Candidate Email ----------

export const aiCandidateEmailOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

// ---------- AI Predictive Pipeline Score ----------

export const aiPredictivePipelineOutputSchema = z.object({
  hiringProbability: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  factors: z.array(
    z.object({
      factor: z.string(),
      impact: z.enum(['positive', 'negative', 'neutral']),
      detail: z.string(),
    })
  ).default([]),
  riskLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
});

// ---------- AI Candidate Summary ----------

export const aiCandidateSummaryOutputSchema = z.object({
  summary: z.string(),
  keyStrengths: z.array(z.string()).default([]),
  keyRisks: z.array(z.string()).default([]),
  fitScore: z.number().min(0).max(100),
  recommendedActions: z.array(z.string()).default([]),
});

// ---------- AI Talent Insights ----------

export const aiTalentInsightsOutputSchema = z.object({
  totalCandidates: z.number(),
  topSkills: z.array(z.object({
    skill: z.string(),
    count: z.number(),
    percentage: z.number(),
  })).default([]),
  skillGaps: z.array(z.object({
    skill: z.string(),
    demandCount: z.number(),
    supplyCount: z.number(),
    gapSeverity: z.enum(['low', 'medium', 'high', 'critical']),
  })).default([]),
  marketTrends: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  pipelineHealth: z.object({
    activeJobs: z.number(),
    avgTimeInPipeline: z.string(),
    bottleneckStage: z.string().nullable(),
    overallHealth: z.enum(['healthy', 'warning', 'critical']),
  }),
});

// ---------- AI Follow-up Questions ----------

export const aiFollowupQuestionsOutputSchema = z.object({
  followupQuestions: z.array(z.object({
    question: z.string(),
    rationale: z.string(),
    targetArea: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
  })).default([]),
  areasToProbe: z.array(z.string()).default([]),
  overallAssessment: z.string(),
});

// ---------- AI Job Requirements Optimizer ----------

export const aiJobRequirementsOptimizerOutputSchema = z.object({
  analysis: z.object({
    clarity: z.number().min(0).max(100),
    competitiveness: z.number().min(0).max(100),
    inclusivity: z.number().min(0).max(100),
    overallScore: z.number().min(0).max(100),
  }),
  suggestions: z.array(z.object({
    area: z.string(),
    issue: z.string(),
    recommendation: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  })).default([]),
  optimizedMustHave: z.array(z.string()).default([]),
  optimizedNiceToHave: z.array(z.string()).default([]),
  optimizedDescription: z.string(),
  marketInsights: z.array(z.string()).default([]),
});

// ---------- Inferred Types ----------

export type CreateJobSchema = z.infer<typeof createJobSchema>;
export type UploadCvSchema = z.infer<typeof uploadCvSchema>;
export type CvExtractionSchema = z.infer<typeof cvExtractionSchema>;
export type AssignCvToJobSchema = z.infer<typeof assignCvToJobSchema>;
export type ScreeningSchema = z.infer<typeof screeningSchema>;
export type AiScreeningOutput = z.infer<typeof aiScreeningOutputSchema>;
export type InterviewGuideQuestionsSchema = z.infer<typeof interviewGuideQuestionsSchema>;
export type UpdateQuestionsSchema = z.infer<typeof updateQuestionsSchema>;
export type ScheduleInterviewSchema = z.infer<typeof scheduleInterviewSchema>;
export type InterviewReportSchema = z.infer<typeof interviewReportSchema>;
export type SendInterviewEmailSchema = z.infer<typeof sendInterviewEmailSchema>;
export type AiCvExtractionOutput = z.infer<typeof aiCvExtractionOutputSchema>;
export type AiCandidateSummaryOutput = z.infer<typeof aiCandidateSummaryOutputSchema>;
export type AiTalentInsightsOutput = z.infer<typeof aiTalentInsightsOutputSchema>;
export type AiFollowupQuestionsOutput = z.infer<typeof aiFollowupQuestionsOutputSchema>;
export type AiJobRequirementsOptimizerOutput = z.infer<typeof aiJobRequirementsOptimizerOutputSchema>;

// ---------- AI Statistics Chat Schema ----------

export const aiStatisticsChatSchema = z.object({
  question: z.string().min(3, 'Question must be at least 3 characters').max(500, 'Question must be at most 500 characters'),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

export const chatAttachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().positive().max(5 * 1024 * 1024), // 5 MB limit
  rawBytes: z.string().min(1), // base64
});

export const statisticsChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  messages: z.array(chatMessageSchema).min(1).max(20),
  attachments: z.array(chatAttachmentSchema).max(5).optional(),
});
