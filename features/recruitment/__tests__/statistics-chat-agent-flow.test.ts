import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getOrCreateChatConversation: vi.fn(),
  getChatHistory: vi.fn(),
  saveChatMessage: vi.fn(),
  requestCompletion: vi.fn(),
  queueToolCalls: vi.fn(),
  executeToolCalls: vi.fn(),
  classifyChatIntent: vi.fn(),
  buildGreetingResponse: vi.fn(),
}));

vi.mock('../services/chat', () => ({
  getOrCreateChatConversation: mocks.getOrCreateChatConversation,
  getChatHistory: mocks.getChatHistory,
  saveChatMessage: mocks.saveChatMessage,
}));

vi.mock('@/features/recruitment/services/chat', () => ({
  getOrCreateChatConversation: mocks.getOrCreateChatConversation,
  getChatHistory: mocks.getChatHistory,
  saveChatMessage: mocks.saveChatMessage,
}));

vi.mock('../services/chat-orchestration', () => ({
  buildGreetingResponse: mocks.buildGreetingResponse,
  classifyChatIntent: mocks.classifyChatIntent,
  compareCandidatesDirect: vi.fn(),
  searchResumesByName: vi.fn(),
}));

vi.mock('@/features/recruitment/services/chat-orchestration', () => ({
  buildGreetingResponse: mocks.buildGreetingResponse,
  classifyChatIntent: mocks.classifyChatIntent,
  compareCandidatesDirect: vi.fn(),
  searchResumesByName: vi.fn(),
}));

vi.mock('../services/ai', () => ({
  getNvidiaClient: vi.fn(() => ({ chat: { completions: { create: vi.fn() } } })),
}));

vi.mock('@/features/recruitment/services/ai', () => ({
  getNvidiaClient: vi.fn(() => ({ chat: { completions: { create: vi.fn() } } })),
}));

vi.mock('../services/statistics-chat-llm', () => ({
  requestAgentCompletionWithRetryPolicy: mocks.requestCompletion,
}));

vi.mock('@/features/recruitment/services/statistics-chat-llm', () => ({
  requestAgentCompletionWithRetryPolicy: mocks.requestCompletion,
}));

vi.mock('../services/statistics-chat-tool-loop', () => ({
  queueToolCalls: mocks.queueToolCalls,
  executeToolCalls: mocks.executeToolCalls,
}));

vi.mock('@/features/recruitment/services/statistics-chat-tool-loop', () => ({
  queueToolCalls: mocks.queueToolCalls,
  executeToolCalls: mocks.executeToolCalls,
}));

import { handleStatisticsChatPost } from '../services/statistics-chat-agent';
import type { ResponseToolCall, ToolExecutionRecord } from '../services/statistics-chat-types';

function makeRequest(message: string) {
  return new Request('http://localhost/api/chat/statistics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
    }),
  });
}

function completionWithoutTools(content: string) {
  return {
    response: {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    },
    retryUsed: false,
    fallback: null,
  };
}

describe('statistics chat agent flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateChatConversation.mockResolvedValue({ id: crypto.randomUUID() });
    mocks.getChatHistory.mockResolvedValue({ messages: [] });
    mocks.saveChatMessage.mockResolvedValue(undefined);
    mocks.buildGreetingResponse.mockReturnValue('Hello. I can help with recruitment work.');
    mocks.classifyChatIntent.mockReturnValue({ intent: 'agent' });
  });

  it('answers greetings directly without LLM or tool calls', async () => {
    mocks.classifyChatIntent.mockReturnValue({ intent: 'greeting' });

    const response = await handleStatisticsChatPost(makeRequest('hello'), {
      user: { id: crypto.randomUUID(), role: 'ta' },
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('Hello. I can help with recruitment work.');
    expect(mocks.requestCompletion).not.toHaveBeenCalled();
    expect(mocks.queueToolCalls).not.toHaveBeenCalled();
    expect(mocks.executeToolCalls).not.toHaveBeenCalled();
  });

  it('recovers with proactive tools when the model ignores required tool use', async () => {
    mocks.requestCompletion
      .mockResolvedValueOnce(completionWithoutTools('Draft answer without evidence.'))
      .mockResolvedValueOnce(completionWithoutTools('Second unsupported answer.'));
    mocks.executeToolCalls.mockImplementation(async (params: {
      toolCalls: ResponseToolCall[];
      toolExecutionHistory: ToolExecutionRecord[];
    }) => {
      params.toolExecutionHistory.push(
        {
          toolName: 'get_dashboard_stats',
          args: {},
          mutating: false,
          result: {
            success: true,
            data: {
              totalCandidates: 12,
              totalJobs: 5,
              totalInterviewsToday: 1,
              pendingScreenings: 4,
              stageBreakdown: {
                new: 4,
                ta_screening: 6,
                ta_interview: 0,
                ta_accepted: 0,
                ta_rejected: 0,
                manager_interview: 2,
                manager_accepted: 0,
                manager_rejected: 0,
                hr_interview: 0,
                hr_accepted: 0,
                hr_rejected: 0,
                hired: 0,
              },
            },
          },
        },
        {
          toolName: 'get_smart_insights',
          args: {},
          mutating: false,
          result: {
            success: true,
            data: {
              mostDemandedJobProfiles: [{ title: 'UI/UX Designer', count: 3 }],
              mostCommonCvSkills: [{ skill: 'Figma', count: 2 }],
              skillGapAnalysis: [{ skill: 'UX Research', demand: 5, supply: 1 }],
              pipelineFunnel: {
                new: 4,
                ta_screening: 6,
                ta_interview: 0,
                ta_accepted: 0,
                ta_rejected: 0,
                manager_interview: 2,
                manager_accepted: 0,
                manager_rejected: 0,
                hr_interview: 0,
                hr_accepted: 0,
                hr_rejected: 0,
                hired: 0,
              },
            },
          },
        },
      );

      return {
        consecutiveToolFailures: 0,
        sawMutatingTool: false,
        fullResponse: '',
        shouldBreakLoop: false,
        shouldReturn: false,
      };
    });

    const response = await handleStatisticsChatPost(
      makeRequest('chbowa next step tawa lobb el ghalta'),
      { user: { id: crypto.randomUUID(), role: 'ta' } },
    );
    const text = await response.text();
    const recoveredToolNames = mocks.executeToolCalls.mock.calls[0]?.[0].toolCalls.map(
      (toolCall: ResponseToolCall) => toolCall.function.name,
    );

    expect(response.status).toBe(200);
    expect(mocks.requestCompletion).toHaveBeenCalledTimes(2);
    expect(recoveredToolNames).toEqual([
      'get_dashboard_stats',
      'get_smart_insights',
      'get_today_interviews',
      'get_notifications',
    ]);
    expect(text).toContain('Lobb el mochkol');
    expect(text).toContain('TA Screening');
    expect(text).toContain('UX Research');
    expect(text).toContain('@@META@@');
  });

});
