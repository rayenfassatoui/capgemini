import { describe, expect, it, vi } from 'vitest';

import type { getNvidiaClient } from '../services/ai';
import {
  AGENT_LLM_CONNECTION_FALLBACK,
  AGENT_LLM_TIMEOUT_FALLBACK,
  buildAgentCompletionErrorFallback,
  callAgentCompletion,
  createTimeoutError,
  isTimeoutError,
  requestAgentCompletionWithRetryPolicy,
  withTimeout,
} from '../services/statistics-chat-llm';
import type {
  AgentCompletionResponse,
  LLMMessage,
} from '../services/statistics-chat-types';

const messages: LLMMessage[] = [
  { role: 'system', content: 'You are a recruitment assistant.' },
  { role: 'user', content: 'Summarize pipeline state.' },
];

function createMockClient(create: ReturnType<typeof vi.fn>) {
  return {
    chat: {
      completions: {
        create,
      },
    },
  } as unknown as ReturnType<typeof getNvidiaClient>;
}

function completion(content: string): AgentCompletionResponse {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

describe('statistics chat LLM policy', () => {
  it('classifies timeout errors and rejects timed out work', async () => {
    await expect(withTimeout(new Promise(() => undefined), 1)).rejects.toThrow(
      'TIMEOUT',
    );

    expect(isTimeoutError(createTimeoutError())).toBe(true);
    expect(isTimeoutError(new Error('LLM_TIMEOUT'))).toBe(true);
    expect(isTimeoutError(new Error('network failure'))).toBe(false);
  });

  it('calls the agent model with tool calling enabled and timeout wrapping', async () => {
    const create = vi.fn().mockResolvedValue(completion('ok'));
    const client = createMockClient(create);

    const result = await callAgentCompletion(client, messages, [], 100);

    expect(result.choices?.[0]?.message?.content).toBe('ok');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'stepfun-ai/step-3.7-flash',
        stream: false,
        tools: undefined,
        tool_choice: 'auto',
        temperature: 0.15,
        max_tokens: 2048,
      }),
    );
  });

  it('retries one timeout before any mutating tool has executed', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(createTimeoutError())
      .mockResolvedValueOnce(completion('retry ok'));
    const client = createMockClient(create);

    const result = await requestAgentCompletionWithRetryPolicy({
      nvidiaClient: client,
      messages,
      tools: [],
      sawMutatingTool: false,
      retryUsed: false,
      deterministicFallback: null,
      timeoutMs: 100,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      response: completion('retry ok'),
      retryUsed: true,
      fallback: null,
    });
  });

  it('does not retry timeouts after a mutating tool has executed', async () => {
    const create = vi.fn().mockRejectedValue(createTimeoutError());
    const client = createMockClient(create);

    const result = await requestAgentCompletionWithRetryPolicy({
      nvidiaClient: client,
      messages,
      tools: [],
      sawMutatingTool: true,
      retryUsed: false,
      deterministicFallback: null,
      timeoutMs: 100,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      response: null,
      retryUsed: false,
      fallback: AGENT_LLM_TIMEOUT_FALLBACK,
    });
  });

  it('uses deterministic fallback when retry also fails', async () => {
    const create = vi.fn().mockRejectedValue(createTimeoutError());
    const client = createMockClient(create);

    const result = await requestAgentCompletionWithRetryPolicy({
      nvidiaClient: client,
      messages,
      tools: [],
      sawMutatingTool: false,
      retryUsed: false,
      deterministicFallback: 'Fallback from already fetched records.',
      timeoutMs: 100,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      response: null,
      retryUsed: true,
      fallback: 'Fallback from already fetched records.',
    });
  });

  it('returns connection fallback for non-timeout provider failures', async () => {
    const create = vi.fn().mockRejectedValue(new Error('Provider unavailable'));
    const client = createMockClient(create);

    const result = await requestAgentCompletionWithRetryPolicy({
      nvidiaClient: client,
      messages,
      tools: [],
      sawMutatingTool: false,
      retryUsed: false,
      deterministicFallback: null,
      timeoutMs: 100,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      response: null,
      retryUsed: false,
      fallback: AGENT_LLM_CONNECTION_FALLBACK,
    });
    expect(
      buildAgentCompletionErrorFallback(
        new Error('Provider unavailable'),
        'Existing deterministic summary.',
      ),
    ).toBe('Existing deterministic summary.');
  });
});
