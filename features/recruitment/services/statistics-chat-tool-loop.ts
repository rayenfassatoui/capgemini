import "server-only";
import type { UserRole } from "@/features/recruitment/types";
import { executeAgentTool, getToolDefinition, validateAgentToolArgs } from "./agent-tools";
import {
  compactToolResult,
  makeToolCallCacheKey,
} from "./agent-tools/utils";
import { requestAgentActionConfirmation } from "./statistics-chat-confirmation";
import { requiresAgentActionConfirmation } from "./pending-agent-actions";
import {
  buildDeterministicFallbackFromRecords,
  getToolSummary,
  inferToolPurpose,
  sanitizeToolTraceValue,
} from "./statistics-chat-formatting";
import {
  emitFileEvent,
  emitToolEndEvent,
  emitToolStartEvent,
  takeFileDownloadPayload,
} from "./statistics-chat-stream";
import {
  MAX_CONSECUTIVE_TOOL_FAILURES,
  type AttachmentPayload,
  type LLMMessage,
  type ResponseToolCall,
  type ToolExecutionRecord,
} from "./statistics-chat-types";

function parseToolArgs(rawArgs: string): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function injectUploadAttachment(
  toolName: string,
  toolArgs: Record<string, unknown>,
  attachments?: AttachmentPayload[],
) {
  if (toolName !== "upload_cv" || !attachments) {
    return;
  }

  const idx = parseInt(String(toolArgs.attachmentIndex ?? "0"), 10);
  if (idx >= 0 && idx < attachments.length) {
    toolArgs._attachment = attachments[idx] as AttachmentPayload;
  }
}

interface QueueToolCallsParams {
  toolCalls: ResponseToolCall[];
  attachments?: AttachmentPayload[];
  toolExecutionCache: Map<string, ToolExecutionRecord>;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}

export function queueToolCalls({
  toolCalls,
  attachments,
  toolExecutionCache,
  controller,
  encoder,
}: QueueToolCallsParams) {
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const queuedArgs = parseToolArgs(toolCall.function.arguments);
    injectUploadAttachment(toolName, queuedArgs, attachments);

    const queuedCacheKey = makeToolCallCacheKey(toolName, queuedArgs);
    if (toolExecutionCache.has(queuedCacheKey)) {
      continue;
    }

    const queuedInputPayload = sanitizeToolTraceValue(queuedArgs);
    emitToolStartEvent(controller, encoder, {
      id: toolCall.id,
      tool: toolName,
      status: "queued",
      summary: "Queued",
      args: queuedInputPayload,
      input: queuedInputPayload,
      startedAt: new Date().toISOString(),
      purpose: inferToolPurpose(toolName, queuedArgs),
      retry: {
        attempt: 1,
        maxAttempts: 1,
        retried: false,
      },
    });
  }
}

interface ExecuteToolCallsParams {
  toolCalls: ResponseToolCall[];
  attachments?: AttachmentPayload[];
  toolExecutionCache: Map<string, ToolExecutionRecord>;
  toolExecutionHistory: ToolExecutionRecord[];
  llmMessages: LLMMessage[];
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  userId: string;
  role: UserRole;
  conversationId: string;
  prepareGroundedResponse: (text: string) => string;
  persistAssistantMessage: (text: string) => Promise<void>;
  consecutiveToolFailures: number;
  sawMutatingTool: boolean;
}

export interface ExecuteToolCallsResult {
  consecutiveToolFailures: number;
  sawMutatingTool: boolean;
  fullResponse: string;
  shouldBreakLoop: boolean;
  shouldReturn: boolean;
}

export async function executeToolCalls({
  toolCalls,
  attachments,
  toolExecutionCache,
  toolExecutionHistory,
  llmMessages,
  controller,
  encoder,
  userId,
  role,
  conversationId,
  prepareGroundedResponse,
  persistAssistantMessage,
  consecutiveToolFailures,
  sawMutatingTool,
}: ExecuteToolCallsParams): Promise<ExecuteToolCallsResult> {
  let failureCount = consecutiveToolFailures;
  let sawMutation = sawMutatingTool;
  let fullResponse = "";

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const rawToolArgs = parseToolArgs(toolCall.function.arguments);
    injectUploadAttachment(toolName, rawToolArgs, attachments);
    const validation = validateAgentToolArgs(toolName, rawToolArgs);
    const toolArgs = validation.success ? validation.args : rawToolArgs;

    const cacheKey = makeToolCallCacheKey(toolName, toolArgs);
    const cached = toolExecutionCache.get(cacheKey);

    if (cached) {
      llmMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: cached.result.success
          ? JSON.stringify(compactToolResult(cached.result.data))
          : JSON.stringify({ error: cached.result.error }),
      });

      if (cached.mutating) {
        sawMutation = true;
      }

      failureCount = cached.result.success ? 0 : failureCount + 1;
      if (failureCount >= MAX_CONSECUTIVE_TOOL_FAILURES) {
        fullResponse = prepareGroundedResponse(
          buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
            `I encountered ${failureCount} consecutive tool failures. Please try rephrasing your request.`,
        );
        return {
          consecutiveToolFailures: failureCount,
          sawMutatingTool: sawMutation,
          fullResponse,
          shouldBreakLoop: true,
          shouldReturn: false,
        };
      }

      continue;
    }

    const traceId = toolCall.id;
    const startedAt = new Date().toISOString();
    const inputPayload = sanitizeToolTraceValue(toolArgs);
    const purpose = inferToolPurpose(toolName, toolArgs);

    emitToolStartEvent(controller, encoder, {
      id: traceId,
      tool: toolName,
      status: "running",
      args: inputPayload,
      input: inputPayload,
      startedAt,
      purpose,
      retry: {
        attempt: 1,
        maxAttempts: 1,
        retried: false,
      },
    });

    const toolDef = getToolDefinition(toolName);
    const mutating = toolDef?.mutating ?? false;
    if (mutating) {
      sawMutation = true;
    }

    if (toolDef && requiresAgentActionConfirmation(toolName, mutating) && validation.success) {
      fullResponse = await requestAgentActionConfirmation({
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
      });

      return {
        consecutiveToolFailures: failureCount,
        sawMutatingTool: sawMutation,
        fullResponse,
        shouldBreakLoop: false,
        shouldReturn: true,
      };
    }

    const result = await executeAgentTool(toolName, toolArgs, {
      userId,
      role,
    });

    const record: ToolExecutionRecord = {
      toolName,
      args: toolArgs,
      result,
      mutating,
    };

    toolExecutionCache.set(cacheKey, record);
    toolExecutionHistory.push(record);

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

    emitToolEndEvent(controller, encoder, {
      id: traceId,
      tool: toolName,
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

    if (!result.success) {
      failureCount += 1;
      if (failureCount >= MAX_CONSECUTIVE_TOOL_FAILURES) {
        fullResponse = prepareGroundedResponse(
          buildDeterministicFallbackFromRecords(toolExecutionHistory) ??
            `I encountered ${failureCount} consecutive tool failures. Please try rephrasing your request.`,
        );
        return {
          consecutiveToolFailures: failureCount,
          sawMutatingTool: sawMutation,
          fullResponse,
          shouldBreakLoop: true,
          shouldReturn: false,
        };
      }
    } else {
      failureCount = 0;
    }

    llmMessages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: result.success
        ? JSON.stringify(compactToolResult(result.data))
        : JSON.stringify({ error: result.error }),
    });
  }

  return {
    consecutiveToolFailures: failureCount,
    sawMutatingTool: sawMutation,
    fullResponse,
    shouldBreakLoop: failureCount >= MAX_CONSECUTIVE_TOOL_FAILURES,
    shouldReturn: false,
  };
}
