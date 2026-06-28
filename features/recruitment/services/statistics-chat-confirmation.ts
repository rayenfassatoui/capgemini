import "server-only";
import type { UserRole } from "@/features/recruitment/types";
import { executeAgentTool, getToolDefinition } from "./agent-tools";
import * as pendingAgentActions from "./pending-agent-actions";
import {
  buildActionConfirmationResponse,
  buildConfirmedActionResponse,
  getToolSummary,
  inferToolPurpose,
  sanitizeToolTraceValue,
} from "./statistics-chat-formatting";
import {
  emitConfirmationEvent,
  emitFileEvent,
  emitToolEndEvent,
  emitToolStartEvent,
  streamImmediateText,
  takeFileDownloadPayload,
} from "./statistics-chat-stream";
import type {
  ToolExecutionRecord,
  ToolTraceJson,
} from "./statistics-chat-types";

interface ConfirmationDecision {
  actionId: string;
  decision: "confirm" | "cancel";
}

interface BaseConfirmationParams {
  confirmation?: ConfirmationDecision;
  conversationId: string;
  userId: string;
  role: UserRole;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  persistAssistantMessage: (text: string) => Promise<void>;
}

interface ExecuteConfirmedActionParams extends BaseConfirmationParams {
  prepareGroundedResponse: (text: string) => string;
  toolExecutionHistory: ToolExecutionRecord[];
}

interface RequestActionConfirmationParams {
  toolName: string;
  toolArgs: Record<string, unknown>;
  purpose: string;
  inputPayload: ToolTraceJson;
  traceId: string;
  startedAt: string;
  conversationId: string;
  userId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  persistAssistantMessage: (text: string) => Promise<void>;
}

export async function executeConfirmedActionIfRequested({
  confirmation,
  conversationId,
  userId,
  role,
  controller,
  encoder,
  prepareGroundedResponse,
  persistAssistantMessage,
  toolExecutionHistory,
}: ExecuteConfirmedActionParams): Promise<{
  handled: boolean;
  fullResponse: string;
}> {
  if (!confirmation) {
    return { handled: false, fullResponse: "" };
  }

  if (confirmation.decision === "cancel") {
    const action = await pendingAgentActions.cancelPendingAgentAction(
      confirmation.actionId,
      userId,
      conversationId,
    );
    const fullResponse = `Cancelled. I did not execute **${action.toolName.replace(/_/g, " ")}**.`;
    await streamImmediateText(controller, encoder, fullResponse);
    await persistAssistantMessage(fullResponse);
    return { handled: true, fullResponse };
  }

  const action = await pendingAgentActions.confirmPendingAgentAction(
    confirmation.actionId,
    userId,
    conversationId,
  );
  const traceId = `confirmed-${action.id}`;
  const startedAt = new Date().toISOString();
  const inputPayload = sanitizeToolTraceValue(action.args);
  const purpose = inferToolPurpose(action.toolName, action.args);

  emitToolStartEvent(controller, encoder, {
    id: traceId,
    tool: action.toolName,
    status: "running",
    args: inputPayload,
    input: inputPayload,
    startedAt,
    purpose,
    summary: "Confirmed by user",
    retry: {
      attempt: 1,
      maxAttempts: 1,
      retried: false,
    },
  });

  const toolDef = getToolDefinition(action.toolName);
  const mutating = toolDef?.mutating ?? false;
  const result = await executeAgentTool(action.toolName, action.args, {
    userId,
    role,
  });

  await pendingAgentActions.markPendingAgentActionExecuted(action.id, result.success, result.error);

  const { fileDownload, data } = takeFileDownloadPayload(result.data);
  if (fileDownload) {
    emitFileEvent(controller, encoder, fileDownload);
    result.data = data;
  }

  const record: ToolExecutionRecord = {
    toolName: action.toolName,
    args: action.args,
    result,
    mutating,
  };
  toolExecutionHistory.push(record);

  const summary = getToolSummary(result);
  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(startedAt).getTime(),
  );

  emitToolEndEvent(controller, encoder, {
    id: traceId,
    tool: action.toolName,
    success: result.success,
    status: result.success ? "success" : "error",
    summary,
    purpose,
    startedAt,
    endedAt,
    durationMs,
    input: inputPayload,
    output: result.success ? sanitizeToolTraceValue(result.data) : null,
    error: result.success ? undefined : result.error,
    retry: {
      attempt: 1,
      maxAttempts: 1,
      retried: false,
    },
  });

  const fullResponse = prepareGroundedResponse(
    buildConfirmedActionResponse(action.toolName, result),
  );
  await streamImmediateText(controller, encoder, fullResponse);
  await persistAssistantMessage(fullResponse);
  return { handled: true, fullResponse };
}

export async function requestAgentActionConfirmation({
  toolName,
  toolArgs,
  purpose,
  inputPayload,
  traceId,
  startedAt,
  conversationId,
  userId,
  controller,
  encoder,
  persistAssistantMessage,
}: RequestActionConfirmationParams): Promise<string> {
  const confirmationSummary = `${purpose}. This action can change recruitment data and needs your explicit confirmation.`;
  const pendingAction = await pendingAgentActions.createPendingAgentAction({
    userId,
    conversationId,
    toolName,
    args: toolArgs,
    summary: confirmationSummary,
  });

  emitConfirmationEvent(controller, encoder, {
    id: pendingAction.id,
    toolName: pendingAction.toolName,
    summary: pendingAction.summary,
    args: inputPayload,
    expiresAt: pendingAction.expiresAt.toISOString(),
  });

  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(startedAt).getTime(),
  );

  emitToolEndEvent(controller, encoder, {
    id: traceId,
    tool: toolName,
    success: true,
    status: "pending_confirmation",
    summary: "Awaiting user confirmation",
    purpose,
    startedAt,
    endedAt,
    durationMs,
    input: inputPayload,
    output: {
      pendingActionId: pendingAction.id,
      expiresAt: pendingAction.expiresAt.toISOString(),
    },
    retry: {
      attempt: 1,
      maxAttempts: 1,
      retried: false,
    },
  });

  const fullResponse = buildActionConfirmationResponse(confirmationSummary);
  await streamImmediateText(controller, encoder, fullResponse);
  await persistAssistantMessage(fullResponse);
  return fullResponse;
}
