import "server-only";

import type { getToolsForRole } from "./agent-tools";
import { getModelForTask, type getNvidiaClient } from "./ai";
import {
  LLM_REQUEST_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  type AgentCompletionResponse,
  type LLMMessage,
} from "./statistics-chat-types";

export const AGENT_LLM_TIMEOUT_FALLBACK =
  "The AI service took too long to respond. Please try a simpler query.";
export const AGENT_LLM_CONNECTION_FALLBACK =
  "Failed to connect to AI service. Please try again.";

export function createTimeoutError(): Error {
  return new Error("TIMEOUT");
}

export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "TIMEOUT" ||
      error.message === "LLM_TIMEOUT" ||
      error.message === "TOOL_TIMEOUT")
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

type NvidiaClient = ReturnType<typeof getNvidiaClient>;
type AgentTools = ReturnType<typeof getToolsForRole>;

export async function callAgentCompletion(
  nvidiaClient: NvidiaClient,
  messages: LLMMessage[],
  tools: AgentTools,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS,
): Promise<AgentCompletionResponse> {
  const completionPromise = nvidiaClient.chat.completions.create({
    model: getModelForTask("agent"),
    messages: messages as Parameters<
      typeof nvidiaClient.chat.completions.create
    >[0]["messages"],
    stream: false,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: "auto",
    temperature: 0.15,
    max_tokens: MAX_OUTPUT_TOKENS,
  }) as Promise<AgentCompletionResponse>;

  return withTimeout(completionPromise, timeoutMs);
}

export function buildAgentCompletionErrorFallback(
  error: unknown,
  deterministicFallback: string | null,
): string {
  return (
    deterministicFallback ??
    (isTimeoutError(error)
      ? AGENT_LLM_TIMEOUT_FALLBACK
      : AGENT_LLM_CONNECTION_FALLBACK)
  );
}

export function buildAgentRetryFailureFallback(
  deterministicFallback: string | null,
): string {
  return deterministicFallback ?? AGENT_LLM_TIMEOUT_FALLBACK;
}

interface RequestAgentCompletionParams {
  nvidiaClient: NvidiaClient;
  messages: LLMMessage[];
  tools: AgentTools;
  sawMutatingTool: boolean;
  retryUsed: boolean;
  deterministicFallback: string | null;
  timeoutMs?: number;
}

export interface RequestAgentCompletionResult {
  response: AgentCompletionResponse | null;
  retryUsed: boolean;
  fallback: string | null;
}

export async function requestAgentCompletionWithRetryPolicy({
  nvidiaClient,
  messages,
  tools,
  sawMutatingTool,
  retryUsed,
  deterministicFallback,
  timeoutMs,
}: RequestAgentCompletionParams): Promise<RequestAgentCompletionResult> {
  try {
    return {
      response: await callAgentCompletion(nvidiaClient, messages, tools, timeoutMs),
      retryUsed,
      fallback: null,
    };
  } catch (error) {
    if (isTimeoutError(error) && !sawMutatingTool && !retryUsed) {
      try {
        return {
          response: await callAgentCompletion(
            nvidiaClient,
            messages,
            tools,
            timeoutMs,
          ),
          retryUsed: true,
          fallback: null,
        };
      } catch {
        return {
          response: null,
          retryUsed: true,
          fallback: buildAgentRetryFailureFallback(deterministicFallback),
        };
      }
    }

    return {
      response: null,
      retryUsed,
      fallback: buildAgentCompletionErrorFallback(error, deterministicFallback),
    };
  }
}
