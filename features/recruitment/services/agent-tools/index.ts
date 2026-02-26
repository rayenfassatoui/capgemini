/**
 * Agent Tool Registry
 *
 * Central barrel that assembles all tool definitions and executors from
 * domain-specific modules. Exports the same public API as the original
 * monolithic file so all consumers remain unchanged.
 */

import type { UserRole } from '../../types';
import type {
  AgentToolDefinition,
  AgentToolContext,
  ToolHandler,
} from './types';
import { sanitizeForJson, truncateArray, createResolveId } from './utils';

// Re-export types for consumers
export type {
  AgentToolParameter,
  AgentToolDefinition,
  AgentToolContext,
  ToolExecutor,
} from './types';

// ---- Import domain modules ----

import {
  definitions as cvPoolDefs,
  executors as cvPoolExec,
} from './cv-pool';
import {
  definitions as jobsDefs,
  executors as jobsExec,
} from './jobs';
import {
  definitions as candidatesDefs,
  executors as candidatesExec,
} from './candidates';
import {
  definitions as matchingDefs,
  executors as matchingExec,
} from './matching';
import {
  definitions as interviewsDefs,
  executors as interviewsExec,
} from './interviews';
import {
  definitions as communicationDefs,
  executors as communicationExec,
} from './communication';
import {
  definitions as aiFeaturesDefs,
  executors as aiFeaturesExec,
} from './ai-features';
import {
  definitions as dashboardDefs,
  executors as dashboardExec,
} from './dashboard';
import {
  definitions as activityDefs,
  executors as activityExec,
} from './activity';
import {
  definitions as adminDefs,
  executors as adminExec,
} from './admin';

// ---- Combined registry ----

export const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  ...cvPoolDefs,
  ...jobsDefs,
  ...candidatesDefs,
  ...matchingDefs,
  ...interviewsDefs,
  ...communicationDefs,
  ...aiFeaturesDefs,
  ...dashboardDefs,
  ...activityDefs,
  ...adminDefs,
];

const ALL_EXECUTORS: Record<string, ToolHandler> = {
  ...cvPoolExec,
  ...jobsExec,
  ...candidatesExec,
  ...matchingExec,
  ...interviewsExec,
  ...communicationExec,
  ...aiFeaturesExec,
  ...dashboardExec,
  ...activityExec,
  ...adminExec,
};

// ---- Main executor ----

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const def = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!def) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // RBAC check
  if (def.allowedRoles.length > 0 && !def.allowedRoles.includes(ctx.role)) {
    return {
      success: false,
      error: `Access denied: your role (${ctx.role}) cannot use ${toolName}`,
    };
  }

  try {
    const services = await import('..');
    const resolveId = createResolveId(services, ctx);

    const handler = ALL_EXECUTORS[toolName];
    if (!handler) {
      return { success: false, error: `Unimplemented tool: ${toolName}` };
    }

    const result = await handler(args, {
      services,
      resolveId,
      sanitizeForJson,
      truncateArray,
      ctx,
    });

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Build the OpenAI-compatible `tools` array for the LLM request,
 * filtered to only include tools the user's role can access.
 */
export function getToolsForRole(role: UserRole) {
  return TOOL_DEFINITIONS.filter(
    (t) => t.allowedRoles.length === 0 || t.allowedRoles.includes(role)
  ).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
