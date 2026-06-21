import type { GovernanceAuditStatus } from '../types';

export type GovernanceAuditKind =
  | 'stage_transition'
  | 'agent_action'
  | 'activity_log';

export interface GovernanceAuditFilters {
  from?: string;
  to?: string;
  actorId?: string;
  candidateId?: string;
  action?: string;
  status?: GovernanceAuditStatus;
  limit: number;
}

export type GovernanceJsonValue =
  | null
  | boolean
  | number
  | string
  | GovernanceJsonValue[]
  | { [key: string]: GovernanceJsonValue };

export interface GovernanceActorOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface GovernanceCandidateOption {
  id: string;
  fullName: string;
  email: string;
  stage: string;
}

export interface GovernanceStageTransitionDetail {
  type: 'stage_transition';
  previousStage: string | null;
  newStage: string;
  reason: string | null;
}

export interface GovernanceAgentActionDetail {
  type: 'agent_action';
  toolName: string;
  args: GovernanceJsonValue;
  summary: string;
  error: string | null;
  conversationId: string;
  expiresAtIso: string;
  confirmedAtIso: string | null;
  cancelledAtIso: string | null;
  executedAtIso: string | null;
}

export interface GovernanceActivityLogDetail {
  type: 'activity_log';
  entityType: string;
  entityId: string | null;
  details: string | null;
}

export type GovernanceAuditDetail =
  | GovernanceStageTransitionDetail
  | GovernanceAgentActionDetail
  | GovernanceActivityLogDetail;

export interface GovernanceAuditRow {
  id: string;
  kind: GovernanceAuditKind;
  status: GovernanceAuditStatus;
  action: string;
  source: string;
  summary: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  candidateId: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  occurredAtIso: string;
  detail: GovernanceAuditDetail;
}

export interface GovernanceAuditStats {
  totalRows: number;
  stageTransitions: number;
  agentActions: number;
  activityLogs: number;
  pendingAgentActions: number;
  failedAgentActions: number;
}

export interface GovernanceAuditOptions {
  actors: GovernanceActorOption[];
  candidates: GovernanceCandidateOption[];
}

export interface GovernanceAuditReport {
  filters: GovernanceAuditFilters;
  rows: GovernanceAuditRow[];
  stats: GovernanceAuditStats;
  options: GovernanceAuditOptions;
}
