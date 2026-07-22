import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.create,
      },
    };
  },
}));

import { callOpenRouter } from '../services/ai';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('NVIDIA_API_KEY', 'test-key');
  mocks.create.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('AI request deadline', () => {
  it('aborts an unresponsive provider without SDK retries', async () => {
    mocks.create.mockImplementation(
      (_request: unknown, options?: { signal?: AbortSignal }) => {
        const pendingRequest = Promise.withResolvers<never>();
        options?.signal?.addEventListener('abort', () => {
          pendingRequest.reject(new Error('provider request aborted'));
        });
        return pendingRequest.promise;
      },
    );

    const request = callOpenRouter(
      'Return JSON.',
      'Analyze these candidates.',
      'structured',
      { timeoutMs: 20 },
    );
    const rejection = expect(request).rejects.toThrow('TIMEOUT');

    await vi.advanceTimersByTimeAsync(20);
    await rejection;

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        maxRetries: 0,
        signal: expect.any(AbortSignal),
      }),
    );

  });

  it('stops the provider request when its caller disconnects', async () => {
    mocks.create.mockImplementation(
      (_request: unknown, options?: { signal?: AbortSignal }) => {
        const pendingRequest = Promise.withResolvers<never>();
        options?.signal?.addEventListener('abort', () => {
          pendingRequest.reject(new Error('provider request aborted'));
        });
        return pendingRequest.promise;
      },
    );
    const caller = new AbortController();
    const request = callOpenRouter(
      'Return JSON.',
      'Analyze these candidates.',
      'structured',
      { timeoutMs: 20_000, signal: caller.signal },
    );
    const rejection = expect(request).rejects.toThrow(
      'provider request aborted',
    );

    caller.abort();
    await rejection;

    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
