import type { UserRole } from '../../types';

// ---- Tool definition types ----

export interface AgentToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AgentToolParameter>;
    required: string[];
  };
  /** Roles that may invoke this tool. Empty = all roles. */
  allowedRoles: UserRole[];
  /** If true the tool mutates data (create/update/delete). */
  mutating: boolean;
}

export interface AgentToolContext {
  userId: string;
  role: UserRole;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: AgentToolContext
) => Promise<unknown>;

// ---- Executor dependencies ----

type Services = typeof import('../index');

export interface ExecutorDeps {
  services: Services;
  resolveId: (
    value: unknown,
    paramName: 'cvId' | 'jobId' | 'candidateId' | 'interviewId'
  ) => Promise<string>;
  sanitizeForJson: (obj: unknown) => unknown;
  truncateArray: (arr: unknown[], max: number) => unknown[];
  ctx: AgentToolContext;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  deps: ExecutorDeps
) => Promise<unknown>;
