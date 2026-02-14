import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  real,
  boolean,
  integer,
  date,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============ AUTH TABLES (Better-Auth managed) ============

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  role: text('role').notNull().default('ta'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// ============ ENUMS ============

export const candidateStageEnum = pgEnum('candidate_stage', [
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

export const interviewStageEnum = pgEnum('interview_stage', [
  'ta',
  'manager',
  'hr',
]);

export const interviewStatusEnum = pgEnum('interview_status', [
  'scheduled',
  'completed',
  'cancelled',
]);

// ============ BUSINESS TABLES ============

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  mustHave: jsonb('must_have').$type<string[]>().notNull(),
  niceToHave: jsonb('nice_to_have').$type<string[]>().notNull(),
  seniority: text('seniority').notNull(),
  businessUnit: text('business_unit'),
  status: text('status').notNull().default('open'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * CVs are uploaded independently into a pool.
 * TA can then assign CVs to jobs, which creates a candidate record.
 */
export const cvPool = pgTable('cv_pool', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: real('size').notNull(),
  rawText: text('raw_text'),
  rawBytes: text('raw_bytes'),
  extractedName: text('extracted_name'),
  extractedEmail: text('extracted_email'),
  extractedPhone: text('extracted_phone'),
  extractedSkills: jsonb('extracted_skills').$type<string[]>().default([]),
  extractedExperiences: jsonb('extracted_experiences').$type<Array<Record<string, string>>>().default([]),
  extractedEducation: jsonb('extracted_education').$type<Array<Record<string, string>>>().default([]),
  extractedLanguages: jsonb('extracted_languages').$type<string[]>().default([]),
  extractedSummary: text('extracted_summary'),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Candidates are created when a TA assigns a CV to a job.
 * They flow through the pipeline: TA -> Manager -> HR -> Hired
 */
export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  cvId: uuid('cv_id')
    .notNull()
    .references(() => cvPool.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  stage: candidateStageEnum('stage').default('new').notNull(),
  assignedBy: text('assigned_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Screenings: AI-generated match score between a CV and a job.
 */
export const screenings = pgTable('screenings', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  score: real('score').notNull(),
  mustMatchScore: real('must_match_score').notNull(),
  niceMatchScore: real('nice_match_score').notNull(),
  gaps: jsonb('gaps').$type<string[]>().notNull(),
  matchedMustHave: jsonb('matched_must_have').$type<string[]>().notNull(),
  matchedNiceToHave: jsonb('matched_nice_to_have').$type<string[]>().notNull(),
  aiSummary: text('ai_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Interview questions generated by AI per stage (ta/manager/hr).
 * Questions are fully editable after generation.
 */
export const interviewGuides = pgTable('interview_guides', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  stage: interviewStageEnum('stage').notNull(),
  questions: jsonb('questions').$type<string[]>().notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Interviews: scheduled meetings between interviewers and candidates.
 * Each interview has a date, time, Google Meet link.
 */
export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  interviewerId: text('interviewer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stage: interviewStageEnum('stage').notNull(),
  status: interviewStatusEnum('status').default('scheduled').notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledTime: text('scheduled_time').notNull(),
  meetLink: text('meet_link').notNull(),
  emailSent: boolean('email_sent').default(false).notNull(),
  emailSentAt: timestamp('email_sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Interview reports: filled by the interviewer after the interview.
 * Contains notes, candidate answers (mapped to questions), and evaluation.
 */
export const interviewReports = pgTable('interview_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id')
    .notNull()
    .references(() => interviews.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  interviewerId: text('interviewer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stage: interviewStageEnum('stage').notNull(),
  notes: text('notes'),
  candidateAnswers: jsonb('candidate_answers')
    .$type<Array<{ question: string; answer: string }>>()
    .notNull()
    .default([]),
  overallEvaluation: text('overall_evaluation'),
  score: integer('score'),
  decision: text('decision').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Chat conversations: one active analytics conversation per user.
 */
export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Analytics Chat'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Chat messages: individual messages in a conversation.
 */
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Email log: tracks all emails sent from the system.
 */
export const emailLogs = pgTable('email_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  toEmail: text('to_email').notNull(),
  toName: text('to_name'),
  subject: text('subject').notNull(),
  body: text('body'),
  sentBy: text('sent_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  interviewId: uuid('interview_id').references(() => interviews.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('sent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  jobs: many(jobs),
  candidates: many(candidates),
  interviewGuides: many(interviewGuides),
  interviews: many(interviews),
  interviewReports: many(interviewReports),
  uploadedCvs: many(cvPool),
  emailLogs: many(emailLogs),
  chatConversations: many(chatConversations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  createdByUser: one(users, { fields: [jobs.createdBy], references: [users.id] }),
  candidates: many(candidates),
  screenings: many(screenings),
  interviewGuides: many(interviewGuides),
  interviews: many(interviews),
}));

export const cvPoolRelations = relations(cvPool, ({ one, many }) => ({
  uploadedByUser: one(users, { fields: [cvPool.uploadedBy], references: [users.id] }),
  candidates: many(candidates),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  cv: one(cvPool, { fields: [candidates.cvId], references: [cvPool.id] }),
  job: one(jobs, { fields: [candidates.jobId], references: [jobs.id] }),
  assignedByUser: one(users, { fields: [candidates.assignedBy], references: [users.id] }),
  screenings: many(screenings),
  interviewGuides: many(interviewGuides),
  interviews: many(interviews),
  interviewReports: many(interviewReports),
}));

export const screeningsRelations = relations(screenings, ({ one }) => ({
  candidate: one(candidates, { fields: [screenings.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [screenings.jobId], references: [jobs.id] }),
}));

export const interviewGuidesRelations = relations(interviewGuides, ({ one }) => ({
  candidate: one(candidates, { fields: [interviewGuides.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [interviewGuides.jobId], references: [jobs.id] }),
  createdByUser: one(users, { fields: [interviewGuides.createdBy], references: [users.id] }),
}));

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  candidate: one(candidates, { fields: [interviews.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [interviews.jobId], references: [jobs.id] }),
  interviewer: one(users, { fields: [interviews.interviewerId], references: [users.id] }),
  reports: many(interviewReports),
}));

export const interviewReportsRelations = relations(interviewReports, ({ one }) => ({
  interview: one(interviews, { fields: [interviewReports.interviewId], references: [interviews.id] }),
  candidate: one(candidates, { fields: [interviewReports.candidateId], references: [candidates.id] }),
  interviewer: one(users, { fields: [interviewReports.interviewerId], references: [users.id] }),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  sentByUser: one(users, { fields: [emailLogs.sentBy], references: [users.id] }),
  interview: one(interviews, { fields: [emailLogs.interviewId], references: [interviews.id] }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  user: one(users, { fields: [chatConversations.userId], references: [users.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
}));
