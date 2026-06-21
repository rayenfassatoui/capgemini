-- Migration: Add pending agent action confirmations
-- Server-side confirmation gate for mutating AI tool calls.

CREATE TABLE IF NOT EXISTS "pending_agent_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE cascade,
  "tool_name" text NOT NULL,
  "args" jsonb NOT NULL,
  "summary" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "confirmed_at" timestamp,
  "cancelled_at" timestamp,
  "executed_at" timestamp,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pending_agent_actions_user_status_idx"
  ON "pending_agent_actions" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "pending_agent_actions_conversation_idx"
  ON "pending_agent_actions" ("conversation_id");

CREATE INDEX IF NOT EXISTS "pending_agent_actions_expires_at_idx"
  ON "pending_agent_actions" ("expires_at");
