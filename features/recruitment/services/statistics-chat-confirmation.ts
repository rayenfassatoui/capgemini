import "server-only";
import type { UserRole } from "@/features/recruitment/types";
import { appendChatArtifactsToContent } from "../chat-artifact-events";
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
  locale?: "en" | "fr";
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
  locale?: "en" | "fr";
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  persistAssistantMessage: (text: string) => Promise<void>;
}

export async function executeConfirmedActionIfRequested({
  confirmation,
  conversationId,
  userId,
  role,
  locale = "en",
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
    const fullResponse =
      locale === "fr"
        ? `Annule. Je n'ai pas execute **${action.toolName.replace(/_/g, " ")}**.`
        : `Cancelled. I did not execute **${action.toolName.replace(/_/g, " ")}**.`;
    const persistedResponse = appendChatArtifactsToContent(fullResponse, {
      confirmations: [
        {
          id: action.id,
          toolName: action.toolName,
          summary: action.summary,
          args: sanitizeToolTraceValue(action.args),
          expiresAt: action.expiresAt.toISOString(),
          status: "cancelled",
        },
      ],
    });
    await streamImmediateText(controller, encoder, fullResponse);
    await persistAssistantMessage(persistedResponse);
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
  const purpose = inferToolPurpose(action.toolName, action.args, locale);

  emitToolStartEvent(controller, encoder, {
    id: traceId,
    tool: action.toolName,
    status: "running",
    args: inputPayload,
    input: inputPayload,
    startedAt,
    purpose,
    summary: locale === "fr" ? "Confirme par l'utilisateur" : "Confirmed by user",
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

  const summary = getToolSummary(result);
  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(startedAt).getTime(),
  );
  const trace = {
    id: traceId,
    tool: action.toolName,
    status: result.success ? ("success" as const) : ("error" as const),
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
  };
  const record: ToolExecutionRecord = {
    toolName: action.toolName,
    args: action.args,
    result,
    mutating,
    trace,
    fileDownload,
  };
  toolExecutionHistory.push(record);

  emitToolEndEvent(controller, encoder, {
    ...trace,
    success: result.success,
  });

  const fullResponse = prepareGroundedResponse(
    buildConfirmedActionResponse(action.toolName, result, locale),
  );
  const persistedResponse = appendChatArtifactsToContent(fullResponse, {
    confirmations: [
      {
        id: action.id,
        toolName: action.toolName,
        summary: action.summary,
        args: inputPayload,
        expiresAt: action.expiresAt.toISOString(),
        status: "confirmed",
      },
    ],
  });
  await streamImmediateText(controller, encoder, fullResponse);
  await persistAssistantMessage(persistedResponse);
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
  locale = "en",
  encoder,
  persistAssistantMessage,
}: RequestActionConfirmationParams): Promise<string> {
  const confirmationSummary =
    locale === "fr"
      ? `${purpose}. Cette action peut modifier les donnees de recrutement et requiert votre confirmation explicite.`
      : `${purpose}. This action can change recruitment data and needs your explicit confirmation.`;
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
  const trace = {
    id: traceId,
    tool: toolName,
    status: "pending_confirmation" as const,
    summary:
      locale === "fr"
        ? "En attente de confirmation utilisateur"
        : "Awaiting user confirmation",
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
  };

  emitToolEndEvent(controller, encoder, {
    ...trace,
    success: true,
  });

  const fullResponse = buildActionConfirmationResponse(
    confirmationSummary,
    locale,
  );
  await streamImmediateText(controller, encoder, fullResponse);
  await persistAssistantMessage(
    appendChatArtifactsToContent(fullResponse, {
      toolEvents: [trace],
      confirmations: [
        {
          id: pendingAction.id,
          toolName: pendingAction.toolName,
          summary: pendingAction.summary,
          args: inputPayload,
          expiresAt: pendingAction.expiresAt.toISOString(),
          status: "pending",
        },
      ],
    }),
  );
  return fullResponse;
}
