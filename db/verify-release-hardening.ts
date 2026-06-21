import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  candidateStageHistory,
  candidates,
  chatConversations,
  cvPool,
  jobs,
  pendingAgentActions,
  users,
} from '@/db/schema';
import { db } from '@/lib/db';
import {
  assignCvToJob,
  getCandidateStageHistory,
  updateCandidateStage,
} from '@/features/recruitment/services/candidates';
import { executeAgentTool } from '@/features/recruitment/services/agent-tools';
import {
  confirmPendingAgentAction,
  createPendingAgentAction,
  markPendingAgentActionExecuted,
} from '@/features/recruitment/services/pending-agent-actions';

interface ColumnRow extends Record<string, unknown> {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

interface IndexRow extends Record<string, unknown> {
  tablename: string;
  indexname: string;
}

interface TableCheckResult {
  tableName: string;
  tableExists: boolean;
  missingColumns: string[];
  missingIndexes: string[];
}

const REQUIRED_SCHEMA = [
  {
    tableName: 'candidate_stage_history',
    migrationFile: 'db/migrations/0004_candidate_stage_history.sql',
    columns: [
      'id',
      'candidate_id',
      'previous_stage',
      'new_stage',
      'changed_by',
      'reason',
      'source',
      'created_at',
    ],
    indexes: [
      'candidate_stage_history_candidate_id_idx',
      'candidate_stage_history_changed_by_idx',
      'candidate_stage_history_created_at_idx',
    ],
  },
  {
    tableName: 'pending_agent_actions',
    migrationFile: 'db/migrations/0005_pending-agent-actions.sql',
    columns: [
      'id',
      'user_id',
      'conversation_id',
      'tool_name',
      'args',
      'summary',
      'status',
      'expires_at',
      'confirmed_at',
      'cancelled_at',
      'executed_at',
      'error',
      'created_at',
    ],
    indexes: [
      'pending_agent_actions_user_status_idx',
      'pending_agent_actions_conversation_idx',
      'pending_agent_actions_expires_at_idx',
    ],
  },
] as const;

function getRows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

function splitSqlStatements(migrationSql: string): string[] {
  return migrationSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function getTableColumns(tableName: string): Promise<ColumnRow[]> {
  const result = await db.execute<ColumnRow>(sql`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `);

  return getRows<ColumnRow>(result);
}

async function getTableIndexes(tableName: string): Promise<IndexRow[]> {
  const result = await db.execute<IndexRow>(sql`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${tableName}
    ORDER BY indexname
  `);

  return getRows<IndexRow>(result);
}

async function checkTable(definition: (typeof REQUIRED_SCHEMA)[number]): Promise<TableCheckResult> {
  const [columns, indexes] = await Promise.all([
    getTableColumns(definition.tableName),
    getTableIndexes(definition.tableName),
  ]);

  const columnNames = new Set(columns.map((column) => column.column_name));
  const indexNames = new Set(indexes.map((index) => index.indexname));

  return {
    tableName: definition.tableName,
    tableExists: columns.length > 0,
    missingColumns: definition.columns.filter((column) => !columnNames.has(column)),
    missingIndexes: definition.indexes.filter((index) => !indexNames.has(index)),
  };
}

async function checkLiveSchema(): Promise<TableCheckResult[]> {
  return Promise.all(REQUIRED_SCHEMA.map((definition) => checkTable(definition)));
}

function schemaIsComplete(checks: TableCheckResult[]): boolean {
  return checks.every(
    (check) =>
      check.tableExists &&
      check.missingColumns.length === 0 &&
      check.missingIndexes.length === 0,
  );
}

function printSchemaChecks(checks: TableCheckResult[]): void {
  for (const check of checks) {
    console.log(
      `[schema] ${check.tableName}: ${check.tableExists ? 'present' : 'missing'}`,
    );
    if (check.missingColumns.length > 0) {
      console.log(`  missing columns: ${check.missingColumns.join(', ')}`);
    }
    if (check.missingIndexes.length > 0) {
      console.log(`  missing indexes: ${check.missingIndexes.join(', ')}`);
    }
  }
}

async function applyMigrationFile(path: string): Promise<void> {
  const file = await readFile(path, 'utf8');
  const statements = splitSqlStatements(file);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

async function applyMissingTableMigrations(checks: TableCheckResult[]): Promise<void> {
  for (const definition of REQUIRED_SCHEMA) {
    const check = checks.find((entry) => entry.tableName === definition.tableName);
    if (!check) {
      throw new Error(`No schema check found for ${definition.tableName}`);
    }

    if (check.tableExists && (check.missingColumns.length > 0 || check.missingIndexes.length > 0)) {
      throw new Error(
        `${definition.tableName} exists but is incomplete. Refusing to apply CREATE TABLE migration over partial schema drift.`,
      );
    }

    if (!check.tableExists) {
      console.log(`[migration] applying ${definition.migrationFile}`);
      await applyMigrationFile(definition.migrationFile);
    }
  }
}

async function insertVerificationUser(userId: string, runId: string): Promise<void> {
  const now = new Date();
  await db.insert(users).values({
    id: userId,
    name: 'Release Verification User',
    email: `release-verification-${runId}@example.invalid`,
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  });
}

async function runCandidateTransitionVerification(userId: string, runId: string): Promise<{
  candidateId: string;
  manualStageHistoryCount: number;
}> {
  const [job] = await db
    .insert(jobs)
    .values({
      title: `Release Verification Job ${runId}`,
      description: 'Temporary job used for live migration verification.',
      mustHave: ['verification'],
      niceToHave: ['audit'],
      seniority: 'verification',
      businessUnit: 'release-hardening',
      status: 'open',
      createdBy: userId,
    })
    .returning({ id: jobs.id });

  const [cv] = await db
    .insert(cvPool)
    .values({
      filename: `release-verification-${runId}.pdf`,
      contentType: 'application/pdf',
      size: 1,
      rawText: null,
      rawBytes: null,
      extractedName: 'Release Verification Candidate',
      extractedEmail: `release-candidate-${runId}@example.invalid`,
      extractedPhone: null,
      extractedSkills: ['verification'],
      extractedExperiences: [],
      extractedEducation: [],
      extractedLanguages: [],
      extractedSummary: 'Temporary candidate for release hardening verification.',
      uploadedBy: userId,
    })
    .returning({ id: cvPool.id });

  const candidate = await assignCvToJob(cv.id, job.id, userId);
  const updated = await updateCandidateStage(candidate.id, 'ta_screening', {
    changedBy: userId,
    source: 'manual',
    reason: 'Live release verification candidate transition',
  });

  if (updated.stage !== 'ta_screening') {
    throw new Error(`Expected candidate to reach ta_screening, got ${updated.stage}`);
  }

  const history = await getCandidateStageHistory(candidate.id);
  const hasAssignment = history.some(
    (entry) => entry.previousStage === null && entry.newStage === 'new',
  );
  const hasManualTransition = history.some(
    (entry) =>
      entry.previousStage === 'new' &&
      entry.newStage === 'ta_screening' &&
      entry.source === 'manual',
  );

  if (!hasAssignment || !hasManualTransition) {
    throw new Error('Candidate stage history did not record assignment and manual transition.');
  }

  return {
    candidateId: candidate.id,
    manualStageHistoryCount: history.length,
  };
}

async function runAiConfirmationVerification(
  userId: string,
  candidateId: string,
): Promise<{
  pendingActionId: string;
  finalCandidateStage: string;
  pendingActionStatus: string;
  agentHistoryRecorded: boolean;
}> {
  const [conversation] = await db
    .insert(chatConversations)
    .values({
      userId,
      title: 'Release Verification AI Confirmation',
    })
    .returning({ id: chatConversations.id });

  const pendingAction = await createPendingAgentAction({
    userId,
    conversationId: conversation.id,
    toolName: 'update_candidate_stage',
    args: {
      candidateId,
      newStage: 'ta_interview',
    },
    summary: 'Live release verification AI confirmation transition',
    ttlMs: 60_000,
  });

  const confirmedAction = await confirmPendingAgentAction(
    pendingAction.id,
    userId,
    conversation.id,
  );

  const executionResult = await executeAgentTool(
    confirmedAction.toolName,
    confirmedAction.args,
    {
      userId,
      role: 'admin',
    },
  );

  await markPendingAgentActionExecuted(
    pendingAction.id,
    executionResult.success,
    executionResult.error,
  );

  if (!executionResult.success) {
    throw new Error(`Confirmed agent action failed: ${executionResult.error ?? 'unknown error'}`);
  }

  const [candidate] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId));

  if (!candidate) {
    throw new Error('Verification candidate disappeared before AI confirmation check completed.');
  }

  const [pendingRow] = await db
    .select({ status: pendingAgentActions.status })
    .from(pendingAgentActions)
    .where(eq(pendingAgentActions.id, pendingAction.id));

  const history = await getCandidateStageHistory(candidateId);
  const agentHistoryRecorded = history.some(
    (entry) =>
      entry.previousStage === 'ta_screening' &&
      entry.newStage === 'ta_interview' &&
      entry.source === 'agent',
  );

  if (candidate.stage !== 'ta_interview') {
    throw new Error(`Expected AI-confirmed transition to ta_interview, got ${candidate.stage}`);
  }

  if (pendingRow?.status !== 'executed') {
    throw new Error(`Expected pending action to be executed, got ${pendingRow?.status ?? 'missing'}`);
  }

  if (!agentHistoryRecorded) {
    throw new Error('AI-confirmed transition was not recorded in candidate stage history.');
  }

  return {
    pendingActionId: pendingAction.id,
    finalCandidateStage: candidate.stage,
    pendingActionStatus: pendingRow.status,
    agentHistoryRecorded,
  };
}

async function cleanupVerificationUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));

  const [remainingCandidateHistory] = await db
    .select({ id: candidateStageHistory.id })
    .from(candidateStageHistory)
    .where(eq(candidateStageHistory.changedBy, userId))
    .limit(1);

  const [remainingPendingAction] = await db
    .select({ id: pendingAgentActions.id })
    .from(pendingAgentActions)
    .where(eq(pendingAgentActions.userId, userId))
    .limit(1);

  const [remainingCandidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.assignedBy, userId))
    .limit(1);

  if (remainingCandidateHistory || remainingPendingAction || remainingCandidate) {
    throw new Error('Verification cleanup left temporary rows behind.');
  }
}

async function runBehaviorVerification(): Promise<void> {
  const runId = randomUUID();
  const userId = `release-verification-${runId}`;

  await insertVerificationUser(userId, runId);

  try {
    const candidateTransition = await runCandidateTransitionVerification(userId, runId);
    console.log(
      `[behavior] candidate transition ok: candidate=${candidateTransition.candidateId} historyRows=${candidateTransition.manualStageHistoryCount}`,
    );

    const confirmation = await runAiConfirmationVerification(
      userId,
      candidateTransition.candidateId,
    );
    console.log(
      `[behavior] AI confirmation ok: pendingAction=${confirmation.pendingActionId} status=${confirmation.pendingActionStatus} finalStage=${confirmation.finalCandidateStage}`,
    );
  } finally {
    await cleanupVerificationUser(userId);
    console.log('[cleanup] temporary verification rows removed');
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const applyMissing = args.has('--apply-missing');
  const skipBehavior = args.has('--skip-behavior');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const initialChecks = await checkLiveSchema();
  printSchemaChecks(initialChecks);

  if (!schemaIsComplete(initialChecks)) {
    if (!applyMissing) {
      throw new Error('Live schema is missing required migration artifacts. Re-run with --apply-missing to apply missing migration files.');
    }

    await applyMissingTableMigrations(initialChecks);
    const postApplyChecks = await checkLiveSchema();
    printSchemaChecks(postApplyChecks);

    if (!schemaIsComplete(postApplyChecks)) {
      throw new Error('Live schema is still incomplete after applying missing migrations.');
    }
  }

  if (!skipBehavior) {
    await runBehaviorVerification();
  }

  console.log('[done] release hardening database verification passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
