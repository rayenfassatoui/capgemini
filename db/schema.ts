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
  index,
  vector,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============ CUSTOM TYPES ============

/**
 * Custom tsvector type for PostgreSQL full-text search.
 * Drizzle ORM doesn't natively support tsvector, so we define it manually.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

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

export const chunkSectionTypeEnum = pgEnum('chunk_section_type', [
  'experience',
  'skills',
  'education',
  'summary',
  'languages',
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
  isTemplate: boolean('is_template').default(false).notNull(),
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
  embedding: vector('embedding', { dimensions: 1024 }).$type<number[]>(),
}, (table) => [
  index('cv_pool_embedding_hnsw_cosine_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
]);

/**
 * CV Chunks: Sectioned embeddings for improved RAG retrieval.
 * Each CV is split into chunks by section type (experience, skills, etc.)
 * for more precise semantic matching.
 * 
 * Includes tsvector column for PostgreSQL full-text search (FTS).
 */
export const cvChunks = pgTable('cv_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  cvId: uuid('cv_id')
    .notNull()
    .references(() => cvPool.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sectionType: chunkSectionTypeEnum('section_type').notNull(),
  sectionOrder: integer('section_order').default(0).notNull(),
  chunkText: text('chunk_text').notNull(),
  tokenEstimate: integer('token_estimate').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }).$type<number[]>(),
  // Full-text search vector - generated from chunkText
  searchVector: tsvector('search_vector'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  indexVersion: integer('index_version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('cv_chunks_embedding_hnsw_cosine_idx')
    .using('hnsw', table.embedding.op('vector_cosine_ops')),
  index('cv_chunks_cv_id_idx').on(table.cvId),
  index('cv_chunks_uploaded_by_idx').on(table.uploadedBy),
  index('cv_chunks_section_type_idx').on(table.sectionType),
  // GIN index for full-text search on searchVector column
  index('cv_chunks_search_vector_gin_idx')
    .using('gin', table.searchVector),
]);

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
  assignedManagerId: text('assigned_manager_id')
    .references(() => users.id, { onDelete: 'set null' }),
  assignedHrId: text('assigned_hr_id')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Candidate stage history: immutable audit trail of pipeline movement.
 */
export const candidateStageHistory = pgTable('candidate_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  previousStage: candidateStageEnum('previous_stage'),
  newStage: candidateStageEnum('new_stage').notNull(),
  changedBy: text('changed_by').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason'),
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('candidate_stage_history_candidate_id_idx').on(table.candidateId),
  index('candidate_stage_history_changed_by_idx').on(table.changedBy),
  index('candidate_stage_history_created_at_idx').on(table.createdAt),
]);

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
 * autoPilotData stores the structured Auto-Pilot interview guide (nullable for backward compat).
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
  autoPilotData: jsonb('auto_pilot_data').$type<{
    interviewerBriefing: string;
    technicalQuestions: Array<{ topic: string; question: string; whatToListenFor: string; targetSeniority: string }>;
    gapMitigationQuestions: Array<{ missingSkill: string; question: string; whatToListenFor: string }>;
    behavioralQuestions: Array<{ consultingScenario: string; question: string; redFlags: string[] }>;
  }>(),
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
 * Pending agent actions: server-enforced confirmation queue for mutating AI tools.
 */
export const pendingAgentActions = pgTable('pending_agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  args: jsonb('args').$type<Record<string, unknown>>().notNull(),
  summary: text('summary').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
  executedAt: timestamp('executed_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('pending_agent_actions_user_status_idx').on(table.userId, table.status),
  index('pending_agent_actions_conversation_idx').on(table.conversationId),
  index('pending_agent_actions_expires_at_idx').on(table.expiresAt),
]);

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

/**
 * Notifications: bell-icon alerts for users.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Candidate notes: comments left by TA/managers/HR on candidates.
 */
export const candidateNotes = pgTable('candidate_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Activity log: audit trail of every action in the system.
 */
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Onboarding tasks: checklist items for hired candidates.
 */
export const onboardingTasks = pgTable('onboarding_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  completed: boolean('completed').default(false).notNull(),
  completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  jobs: many(jobs),
  assignedCandidates: many(candidates, { relationName: 'assignedByUser' }),
  managedCandidates: many(candidates, { relationName: 'assignedManager' }),
  hrCandidates: many(candidates, { relationName: 'assignedHr' }),
  stageChanges: many(candidateStageHistory),
  interviewGuides: many(interviewGuides),
  interviews: many(interviews),
  interviewReports: many(interviewReports),
  uploadedCvs: many(cvPool),
  emailLogs: many(emailLogs),
  chatConversations: many(chatConversations),
  pendingAgentActions: many(pendingAgentActions),
  notifications: many(notifications),
  candidateNotes: many(candidateNotes),
  activityLogs: many(activityLogs),
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
  chunks: many(cvChunks),
}));

export const cvChunksRelations = relations(cvChunks, ({ one }) => ({
  cv: one(cvPool, { fields: [cvChunks.cvId], references: [cvPool.id] }),
  uploadedByUser: one(users, { fields: [cvChunks.uploadedBy], references: [users.id] }),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  cv: one(cvPool, { fields: [candidates.cvId], references: [cvPool.id] }),
  job: one(jobs, { fields: [candidates.jobId], references: [jobs.id] }),
  assignedByUser: one(users, { fields: [candidates.assignedBy], references: [users.id], relationName: 'assignedByUser' }),
  assignedManager: one(users, { fields: [candidates.assignedManagerId], references: [users.id], relationName: 'assignedManager' }),
  assignedHr: one(users, { fields: [candidates.assignedHrId], references: [users.id], relationName: 'assignedHr' }),
  screenings: many(screenings),
  interviewGuides: many(interviewGuides),
  interviews: many(interviews),
  interviewReports: many(interviewReports),
  notes: many(candidateNotes),
  onboardingTasks: many(onboardingTasks),
  stageHistory: many(candidateStageHistory),
}));

export const candidateStageHistoryRelations = relations(candidateStageHistory, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateStageHistory.candidateId], references: [candidates.id] }),
  changedByUser: one(users, { fields: [candidateStageHistory.changedBy], references: [users.id] }),
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
  pendingAgentActions: many(pendingAgentActions),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
}));

export const pendingAgentActionsRelations = relations(pendingAgentActions, ({ one }) => ({
  user: one(users, { fields: [pendingAgentActions.userId], references: [users.id] }),
  conversation: one(chatConversations, { fields: [pendingAgentActions.conversationId], references: [chatConversations.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const candidateNotesRelations = relations(candidateNotes, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateNotes.candidateId], references: [candidates.id] }),
  user: one(users, { fields: [candidateNotes.userId], references: [users.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

export const onboardingTasksRelations = relations(onboardingTasks, ({ one }) => ({
  candidate: one(candidates, { fields: [onboardingTasks.candidateId], references: [candidates.id] }),
  completedByUser: one(users, { fields: [onboardingTasks.completedBy], references: [users.id] }),
}));
