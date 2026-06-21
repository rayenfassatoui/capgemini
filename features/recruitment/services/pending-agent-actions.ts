import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pendingAgentActions } from '@/db/schema';

export type PendingAgentActionDecision = 'confirm' | 'cancel';
export type PendingAgentActionStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'executed'
  | 'failed';

export interface PendingAgentActionClientView {
  id: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
  expiresAt: Date;
}

interface CreatePendingAgentActionInput {
  userId: string;
  conversationId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  ttlMs?: number;
}

export const PENDING_AGENT_ACTION_TTL_MS = 5 * 60 * 1000;

function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

function stripNonPersistableArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === '_attachment') continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function toClientView(action: typeof pendingAgentActions.$inferSelect): PendingAgentActionClientView {
  return {
    id: action.id,
    toolName: action.toolName,
    summary: action.summary,
    args: action.args,
    expiresAt: action.expiresAt,
  };
}

export function requiresAgentActionConfirmation(toolName: string, mutating: boolean): boolean {
  if (!mutating) return false;

  // Uploads already require an explicit user-attached file. Persisting attachment
  // bytes inside a pending confirmation would create a larger data exposure risk
  // than executing the requested upload immediately.
  return toolName !== 'upload_cv';
}

export async function createPendingAgentAction({
  userId,
  conversationId,
  toolName,
  args,
  summary,
  ttlMs = PENDING_AGENT_ACTION_TTL_MS,
}: CreatePendingAgentActionInput): Promise<PendingAgentActionClientView> {
  const persistedArgs = stripNonPersistableArgs(args);
  const expiresAt = new Date(Date.now() + ttlMs);

  const [action] = await db
    .insert(pendingAgentActions)
    .values({
      userId,
      conversationId,
      toolName,
      args: persistedArgs,
      summary,
      status: 'pending',
      expiresAt,
    })
    .returning();

  return toClientView(action);
}

export async function cancelPendingAgentAction(
  actionId: string,
  userId: string,
  conversationId: string
): Promise<PendingAgentActionClientView> {
  const action = await getPendingAction(actionId, userId, conversationId);

  const [cancelled] = await db
    .update(pendingAgentActions)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(pendingAgentActions.id, action.id))
    .returning();

  return toClientView(cancelled);
}

export async function confirmPendingAgentAction(
  actionId: string,
  userId: string,
  conversationId: string
): Promise<PendingAgentActionClientView> {
  const action = await getPendingAction(actionId, userId, conversationId);

  const [confirmed] = await db
    .update(pendingAgentActions)
    .set({ status: 'confirmed', confirmedAt: new Date() })
    .where(eq(pendingAgentActions.id, action.id))
    .returning();

  return toClientView(confirmed);
}

export async function markPendingAgentActionExecuted(
  actionId: string,
  success: boolean,
  error?: string
): Promise<void> {
  await db
    .update(pendingAgentActions)
    .set({
      status: success ? 'executed' : 'failed',
      executedAt: new Date(),
      error: success ? null : error ?? 'Execution failed',
    })
    .where(eq(pendingAgentActions.id, actionId));
}

async function getPendingAction(
  actionId: string,
  userId: string,
  conversationId: string
): Promise<typeof pendingAgentActions.$inferSelect> {
  const [action] = await db
    .select()
    .from(pendingAgentActions)
    .where(
      and(
        eq(pendingAgentActions.id, actionId),
        eq(pendingAgentActions.userId, userId),
        eq(pendingAgentActions.conversationId, conversationId)
      )
    );

  if (!action) {
    throw new Error('Pending action not found');
  }

  if (action.status !== 'pending') {
    throw new Error(`Pending action is already ${action.status}`);
  }

  if (isExpired(action.expiresAt, new Date())) {
    await db
      .update(pendingAgentActions)
      .set({ status: 'expired' })
      .where(eq(pendingAgentActions.id, action.id));
    throw new Error('Pending action expired');
  }

  return action;
}
