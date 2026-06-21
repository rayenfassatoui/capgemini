import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
  type AnyColumn,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  activityLogs,
  candidateStageHistory,
  candidates,
  pendingAgentActions,
  users,
} from '@/db/schema';
import type { GovernanceAuditStatus } from '../types';
import {
  buildGovernanceAuditCsv,
  normalizeGovernanceFilters,
  sanitizeGovernancePayload,
} from './governance-utils';
import type {
  GovernanceAuditFilters,
  GovernanceAuditOptions,
  GovernanceAuditReport,
  GovernanceAuditRow,
  GovernanceJsonValue,
} from './governance-types';

function combineConditions(conditions: SQL[]): SQL | undefined {
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function parseStartDate(value?: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function parseEndDate(value?: string): Date | null {
  return value ? new Date(`${value}T23:59:59.999Z`) : null;
}

function dateConditions(
  column: AnyColumn,
  filters: GovernanceAuditFilters,
): SQL[] {
  const conditions: SQL[] = [];
  const from = parseStartDate(filters.from);
  const to = parseEndDate(filters.to);

  if (from) {
    conditions.push(gte(column, from));
  }

  if (to) {
    conditions.push(lte(column, to));
  }

  return conditions;
}

function formatStage(stage: string | null): string {
  if (!stage) return 'Pipeline created';
  return stage
    .split('_')
    .map((part) => {
      const lower = part.toLowerCase();
      return lower === 'ta' || lower === 'hr'
        ? lower.toUpperCase()
        : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function toIso(date: Date | null | undefined): string {
  return date ? date.toISOString() : new Date(0).toISOString();
}

function extractCandidateIdsFromArgs(args: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const candidateId = args.candidateId;
  if (typeof candidateId === 'string') {
    ids.push(candidateId);
  }

  const candidateIds = args.candidateIds;
  if (Array.isArray(candidateIds)) {
    for (const id of candidateIds) {
      if (typeof id === 'string') {
        ids.push(id);
      }
    }
  }

  return Array.from(new Set(ids));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

async function getGovernanceOptions(): Promise<GovernanceAuditOptions> {
  const [actors, candidateRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .orderBy(asc(users.name)),
    db
      .select({
        id: candidates.id,
        fullName: candidates.fullName,
        email: candidates.email,
        stage: candidates.stage,
      })
      .from(candidates)
      .orderBy(desc(candidates.updatedAt))
      .limit(250),
  ]);

  return { actors, candidates: candidateRows };
}

async function getCandidateMap(candidateIds: string[]): Promise<Map<string, { fullName: string; email: string }>> {
  if (candidateIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
    })
    .from(candidates)
    .where(inArray(candidates.id, candidateIds));

  return new Map(rows.map((candidate) => [candidate.id, candidate]));
}

async function getStageTransitionRows(
  filters: GovernanceAuditFilters,
): Promise<GovernanceAuditRow[]> {
  if (filters.status && filters.status !== 'recorded') {
    return [];
  }

  const conditions: SQL[] = [
    ...dateConditions(candidateStageHistory.createdAt, filters),
  ];

  if (filters.actorId) {
    conditions.push(eq(candidateStageHistory.changedBy, filters.actorId));
  }

  if (filters.candidateId) {
    conditions.push(eq(candidateStageHistory.candidateId, filters.candidateId));
  }

  if (filters.action) {
    const pattern = `%${filters.action}%`;
    conditions.push(
      or(
        ilike(candidateStageHistory.source, pattern),
        ilike(candidateStageHistory.reason, pattern),
        ilike(candidates.fullName, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      id: candidateStageHistory.id,
      candidateId: candidateStageHistory.candidateId,
      previousStage: candidateStageHistory.previousStage,
      newStage: candidateStageHistory.newStage,
      changedBy: candidateStageHistory.changedBy,
      reason: candidateStageHistory.reason,
      source: candidateStageHistory.source,
      createdAt: candidateStageHistory.createdAt,
      actorName: users.name,
      actorEmail: users.email,
      candidateName: candidates.fullName,
      candidateEmail: candidates.email,
    })
    .from(candidateStageHistory)
    .leftJoin(users, eq(candidateStageHistory.changedBy, users.id))
    .innerJoin(candidates, eq(candidateStageHistory.candidateId, candidates.id))
    .where(combineConditions(conditions))
    .orderBy(desc(candidateStageHistory.createdAt))
    .limit(filters.limit);

  return rows.map((row) => ({
    id: row.id,
    kind: 'stage_transition',
    status: 'recorded',
    action: `${formatStage(row.previousStage)} → ${formatStage(row.newStage)}`,
    source: row.source,
    summary: `${row.candidateName} moved from ${formatStage(row.previousStage)} to ${formatStage(row.newStage)}`,
    actorId: row.changedBy,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail,
    occurredAtIso: toIso(row.createdAt),
    detail: {
      type: 'stage_transition',
      previousStage: row.previousStage,
      newStage: row.newStage,
      reason: row.reason,
    },
  }));
}

async function getAgentActionRows(
  filters: GovernanceAuditFilters,
): Promise<GovernanceAuditRow[]> {
  if (filters.status === 'recorded' || filters.status === 'logged') {
    return [];
  }

  const conditions: SQL[] = [
    ...dateConditions(pendingAgentActions.createdAt, filters),
  ];

  if (filters.actorId) {
    conditions.push(eq(pendingAgentActions.userId, filters.actorId));
  }

  if (filters.status) {
    conditions.push(eq(pendingAgentActions.status, filters.status));
  }

  if (filters.candidateId) {
    conditions.push(sql<boolean>`(
      ${pendingAgentActions.args}->>'candidateId' = ${filters.candidateId}
      OR (${pendingAgentActions.args}->'candidateIds') ? ${filters.candidateId}
    )`);
  }

  if (filters.action) {
    const pattern = `%${filters.action}%`;
    conditions.push(
      or(
        ilike(pendingAgentActions.toolName, pattern),
        ilike(pendingAgentActions.summary, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      id: pendingAgentActions.id,
      userId: pendingAgentActions.userId,
      conversationId: pendingAgentActions.conversationId,
      toolName: pendingAgentActions.toolName,
      args: pendingAgentActions.args,
      summary: pendingAgentActions.summary,
      status: pendingAgentActions.status,
      expiresAt: pendingAgentActions.expiresAt,
      confirmedAt: pendingAgentActions.confirmedAt,
      cancelledAt: pendingAgentActions.cancelledAt,
      executedAt: pendingAgentActions.executedAt,
      error: pendingAgentActions.error,
      createdAt: pendingAgentActions.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(pendingAgentActions)
    .innerJoin(users, eq(pendingAgentActions.userId, users.id))
    .where(combineConditions(conditions))
    .orderBy(desc(pendingAgentActions.createdAt))
    .limit(filters.limit);

  const candidateIds = Array.from(
    new Set(rows.flatMap((row) => extractCandidateIdsFromArgs(asRecord(row.args)))),
  );
  const candidateMap = await getCandidateMap(candidateIds);

  return rows.map((row) => {
    const args = asRecord(row.args);
    const ids = extractCandidateIdsFromArgs(args);
    const primaryCandidateId = ids[0] ?? null;
    const candidate = primaryCandidateId ? candidateMap.get(primaryCandidateId) : null;
    const status = row.status as GovernanceAuditStatus;
    const actionLabel = row.toolName.replace(/_/g, ' ');

    return {
      id: row.id,
      kind: 'agent_action',
      status,
      action: actionLabel,
      source: row.toolName,
      summary: row.summary,
      actorId: row.userId,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      candidateId: primaryCandidateId,
      candidateName: candidate?.fullName ?? (ids.length > 1 ? `${ids.length} candidates` : null),
      candidateEmail: candidate?.email ?? null,
      occurredAtIso: toIso(row.createdAt),
      detail: {
        type: 'agent_action',
        toolName: row.toolName,
        args: sanitizeGovernancePayload(args) as GovernanceJsonValue,
        summary: row.summary,
        error: row.error,
        conversationId: row.conversationId,
        expiresAtIso: toIso(row.expiresAt),
        confirmedAtIso: row.confirmedAt ? toIso(row.confirmedAt) : null,
        cancelledAtIso: row.cancelledAt ? toIso(row.cancelledAt) : null,
        executedAtIso: row.executedAt ? toIso(row.executedAt) : null,
      },
    };
  });
}

async function getActivityRows(
  filters: GovernanceAuditFilters,
): Promise<GovernanceAuditRow[]> {
  if (filters.status && filters.status !== 'logged') {
    return [];
  }

  const conditions: SQL[] = [
    ...dateConditions(activityLogs.createdAt, filters),
  ];

  if (filters.actorId) {
    conditions.push(eq(activityLogs.userId, filters.actorId));
  }

  if (filters.candidateId) {
    conditions.push(
      and(eq(activityLogs.entityType, 'candidate'), eq(activityLogs.entityId, filters.candidateId))!,
    );
  }

  if (filters.action) {
    const pattern = `%${filters.action}%`;
    conditions.push(
      or(
        ilike(activityLogs.action, pattern),
        ilike(activityLogs.entityType, pattern),
        ilike(activityLogs.details, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      details: activityLogs.details,
      createdAt: activityLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(combineConditions(conditions))
    .orderBy(desc(activityLogs.createdAt))
    .limit(filters.limit);

  const candidateIds = rows
    .filter((row) => row.entityType === 'candidate' && row.entityId)
    .map((row) => row.entityId as string);
  const candidateMap = await getCandidateMap(Array.from(new Set(candidateIds)));

  return rows.map((row) => {
    const candidate = row.entityType === 'candidate' && row.entityId
      ? candidateMap.get(row.entityId)
      : null;

    return {
      id: row.id,
      kind: 'activity_log',
      status: 'logged',
      action: row.action,
      source: row.entityType,
      summary: row.details ?? `${row.action} on ${row.entityType}`,
      actorId: row.userId,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      candidateId: row.entityType === 'candidate' ? row.entityId : null,
      candidateName: candidate?.fullName ?? null,
      candidateEmail: candidate?.email ?? null,
      occurredAtIso: toIso(row.createdAt),
      detail: {
        type: 'activity_log',
        entityType: row.entityType,
        entityId: row.entityId,
        details: row.details,
      },
    };
  });
}

function buildStats(rows: GovernanceAuditRow[]) {
  return {
    totalRows: rows.length,
    stageTransitions: rows.filter((row) => row.kind === 'stage_transition').length,
    agentActions: rows.filter((row) => row.kind === 'agent_action').length,
    activityLogs: rows.filter((row) => row.kind === 'activity_log').length,
    pendingAgentActions: rows.filter(
      (row) => row.kind === 'agent_action' && row.status === 'pending',
    ).length,
    failedAgentActions: rows.filter(
      (row) => row.kind === 'agent_action' && row.status === 'failed',
    ).length,
  };
}

export async function getGovernanceAuditReport(
  input: unknown,
): Promise<GovernanceAuditReport> {
  const filters = normalizeGovernanceFilters(input);
  const [options, stageRows, agentRows, activityRows] = await Promise.all([
    getGovernanceOptions(),
    getStageTransitionRows(filters),
    getAgentActionRows(filters),
    getActivityRows(filters),
  ]);

  const rows = [...stageRows, ...agentRows, ...activityRows]
    .sort((a, b) => b.occurredAtIso.localeCompare(a.occurredAtIso))
    .slice(0, filters.limit);

  return {
    filters,
    rows,
    stats: buildStats(rows),
    options,
  };
}

export async function exportGovernanceAuditCsv(input: unknown): Promise<string> {
  const report = await getGovernanceAuditReport({
    ...normalizeGovernanceFilters(input),
    limit: 500,
  });

  return buildGovernanceAuditCsv(report.rows);
}
