-- Migration: Add candidate stage history audit trail
-- Tracks every candidate pipeline movement for analytics, SLA alerts, and auditability.

CREATE TABLE IF NOT EXISTS "candidate_stage_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE cascade,
  "previous_stage" "candidate_stage",
  "new_stage" "candidate_stage" NOT NULL,
  "changed_by" text REFERENCES "users"("id") ON DELETE set null,
  "reason" text,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "candidate_stage_history_candidate_id_idx"
  ON "candidate_stage_history" ("candidate_id");

CREATE INDEX IF NOT EXISTS "candidate_stage_history_changed_by_idx"
  ON "candidate_stage_history" ("changed_by");

CREATE INDEX IF NOT EXISTS "candidate_stage_history_created_at_idx"
  ON "candidate_stage_history" ("created_at");
