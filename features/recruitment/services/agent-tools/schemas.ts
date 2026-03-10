import { z } from 'zod';

const candidateAnswerSchema = z
  .object({
    question: z.string(),
    answer: z.string(),
  })
  .passthrough();

export const TOOL_ARG_SCHEMAS: Record<string, z.ZodType> = {
  // CV Pool
  upload_cv: z
    .object({
      attachmentIndex: z.coerce.number(),
    })
    .passthrough(),
  list_cv_pool: z.object({}).passthrough(),
  get_cv_details: z
    .object({
      cvId: z.string(),
    })
    .passthrough(),
  delete_cv: z
    .object({
      cvId: z.string(),
    })
    .passthrough(),
  search_cv_pool: z
    .object({
      skills: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      minExperience: z.coerce.number().optional(),
      location: z.string().optional(),
    })
    .passthrough(),
  check_duplicate_cv: z
    .object({
      cvId: z.string(),
    })
    .passthrough(),
  scan_pool_duplicates: z.object({}).passthrough(),

  // Jobs
  list_jobs: z.object({}).passthrough(),
  get_job: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),
  create_job: z
    .object({
      title: z.string(),
      description: z.string(),
      mustHave: z.array(z.string()),
      niceToHave: z.array(z.string()).optional(),
      seniority: z.string(),
      businessUnit: z.string().optional(),
    })
    .passthrough(),
  close_job: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),
  save_job_as_template: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),
  list_job_templates: z.object({}).passthrough(),
  create_job_from_template: z
    .object({
      templateId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),

  // Candidates
  get_candidates_by_job: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),
  get_candidates_by_stage: z
    .object({
      stages: z.array(z.string()),
    })
    .passthrough(),
  get_candidate: z
    .object({
      candidateId: z.string(),
    })
    .passthrough(),
  update_candidate_stage: z
    .object({
      candidateId: z.string(),
      newStage: z.string(),
    })
    .passthrough(),
  assign_cv_to_job: z
    .object({
      cvId: z.string(),
      jobId: z.string(),
    })
    .passthrough(),
  add_candidate_note: z
    .object({
      candidateId: z.string(),
      content: z.string(),
    })
    .passthrough(),
  get_candidate_notes: z
    .object({
      candidateId: z.string(),
    })
    .passthrough(),
  bulk_update_candidate_stage: z
    .object({
      candidateIds: z.array(z.string()),
      newStage: z.string(),
    })
    .passthrough(),

  // Matching
  match_cvs_to_job: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),
  hybrid_search_cvs: z
    .object({
      jobId: z.string(),
      limit: z.coerce.number().optional(),
    })
    .passthrough(),
  match_cvs_to_job_with_filters: z
    .object({
      jobId: z.string(),
      skills: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      minPositions: z.coerce.number().optional(),
    })
    .passthrough(),
  generate_screening: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
    })
    .passthrough(),
  get_screening: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
    })
    .passthrough(),
  bulk_assign_cvs_to_job: z
    .object({
      jobId: z.string(),
      count: z.coerce.number().optional(),
    })
    .passthrough(),
  semantic_search_cvs: z
    .object({
      query: z.string(),
      limit: z.coerce.number().optional(),
      threshold: z.coerce.number().optional(),
    })
    .passthrough(),

  // Interviews
  generate_interview_questions: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
      stage: z.string(),
    })
    .passthrough(),
  get_interview_guide: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
      stage: z.string(),
    })
    .passthrough(),
  schedule_interview: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
      stage: z.string(),
      scheduledDate: z.string(),
      scheduledTime: z.string(),
      meetLink: z.string(),
    })
    .passthrough(),
  get_interview: z
    .object({
      interviewId: z.string(),
    })
    .passthrough(),
  get_today_interviews: z.object({}).passthrough(),
  get_interview_report: z
    .object({
      interviewId: z.string(),
    })
    .passthrough(),
  get_interview_reports_by_candidate: z
    .object({
      candidateId: z.string(),
    })
    .passthrough(),
  reschedule_interview: z
    .object({
      interviewId: z.string(),
      newDate: z.string(),
      newTime: z.string(),
    })
    .passthrough(),
  cancel_interview: z
    .object({
      interviewId: z.string(),
    })
    .passthrough(),
  create_interview_report: z
    .object({
      interviewId: z.string(),
      candidateId: z.string(),
      stage: z.string(),
      notes: z.string().optional(),
      candidateAnswers: z.array(candidateAnswerSchema).optional(),
      overallEvaluation: z.string().optional(),
      score: z.coerce.number(),
      decision: z.string(),
    })
    .passthrough(),
  get_interview_calendar: z
    .object({
      startDate: z.string(),
      endDate: z.string(),
    })
    .passthrough(),

  // Communication
  send_interview_invite_email: z
    .object({
      interviewId: z.string(),
      candidateEmail: z.string(),
      candidateName: z.string(),
      jobTitle: z.string(),
      scheduledDate: z.string(),
      scheduledTime: z.string(),
      meetLink: z.string(),
      interviewerName: z.string(),
      stage: z.string(),
    })
    .passthrough(),
  send_rejection_email: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
    })
    .passthrough(),
  export_candidates_csv: z.object({}).passthrough(),
  get_notifications: z.object({}).passthrough(),
  mark_notification_read: z
    .object({
      notificationId: z.string(),
    })
    .passthrough(),
  mark_all_notifications_read: z.object({}).passthrough(),

  // AI Features
  ai_interview_debrief: z
    .object({
      interviewId: z.string(),
    })
    .passthrough(),
  compare_candidates: z
    .object({
      candidateIds: z.array(z.string()),
      jobId: z.string(),
    })
    .passthrough(),
  generate_job_description: z
    .object({
      title: z.string(),
      seniority: z.string(),
      businessUnit: z.string().optional(),
      additionalContext: z.string().optional(),
    })
    .passthrough(),
  generate_candidate_email: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
      emailType: z.string(),
    })
    .passthrough(),
  predict_pipeline_score: z
    .object({
      candidateId: z.string(),
      jobId: z.string(),
    })
    .passthrough(),
  ai_summarize_candidate: z
    .object({
      candidateId: z.string(),
      jobId: z.string().optional(),
    })
    .passthrough(),
  ai_talent_insights: z.object({}).passthrough(),
  ai_followup_questions: z
    .object({
      interviewId: z.string(),
    })
    .passthrough(),
  ai_optimize_job_requirements: z
    .object({
      jobId: z.string(),
    })
    .passthrough(),

  // Dashboard
  get_dashboard_stats: z.object({}).passthrough(),
  get_cv_pool_stats: z.object({}).passthrough(),
  get_jobs_stats: z.object({}).passthrough(),
  get_smart_insights: z.object({}).passthrough(),

  // Activity
  get_activity_log: z
    .object({
      limit: z.coerce.number().optional(),
    })
    .passthrough(),
  get_activity_by_entity: z
    .object({
      entityType: z.string(),
      entityId: z.string(),
    })
    .passthrough(),
  get_onboarding_checklist: z
    .object({
      candidateId: z.string(),
    })
    .passthrough(),
  toggle_onboarding_task: z
    .object({
      taskId: z.string(),
      completed: z.coerce.boolean(),
    })
    .passthrough(),
  add_onboarding_task: z
    .object({
      candidateId: z.string(),
      title: z.string(),
      description: z.string().optional(),
    })
    .passthrough(),
  get_activity_log_enriched: z
    .object({
      limit: z.coerce.number().optional(),
    })
    .passthrough(),
  export_activity_log: z.object({}).passthrough(),

  // Admin
  get_system_overview: z.object({}).passthrough(),
  get_recruitment_analytics: z.object({}).passthrough(),
  get_email_logs: z
    .object({
      limit: z.coerce.number().optional(),
    })
    .passthrough(),
  get_onboarding_overview: z.object({}).passthrough(),
  get_onboarding_detailed: z.object({}).passthrough(),
  export_email_logs: z.object({}).passthrough(),
  export_onboarding: z.object({}).passthrough(),
  generate_candidate_accept_excel: z
    .object({
      candidateId: z.string(),
      stage: z.string(),
    })
    .passthrough(),
};
