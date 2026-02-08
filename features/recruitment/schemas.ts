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
