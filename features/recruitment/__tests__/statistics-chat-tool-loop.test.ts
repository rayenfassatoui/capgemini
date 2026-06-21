import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('../services/agent-tools', () => ({
  executeAgentTool: vi.fn(),
  getToolDefinition: vi.fn(),
}));

vi.mock('../services/pending-agent-actions', () => ({
  requiresAgentActionConfirmation: vi.fn(),
}));

vi.mock('../services/statistics-chat-confirmation', () => ({
  requestAgentActionConfirmation: vi.fn(),
}));

import { executeAgentTool, getToolDefinition } from '../services/agent-tools';
import type { AgentToolDefinition } from '../services/agent-tools';
import { makeToolCallCacheKey } from '../services/agent-tools/utils';
import { requiresAgentActionConfirmation } from '../services/pending-agent-actions';
import { requestAgentActionConfirmation } from '../services/statistics-chat-confirmation';
import {
  executeToolCalls,
  queueToolCalls,
} from '../services/statistics-chat-tool-loop';
import type {
  AttachmentPayload,
  LLMMessage,
  ResponseToolCall,
  ToolExecutionRecord,
} from '../services/statistics-chat-types';

type CapturedEvent = {
  prefix: string;
  payload: unknown;
};

function createStreamCapture(): {
  controller: ReadableStreamDefaultController<Uint8Array>;
  chunks: Uint8Array[];
} {
  const chunks: Uint8Array[] = [];
  const controller = {
    enqueue(chunk: Uint8Array) {
      chunks.push(chunk);
    },
  } as unknown as ReadableStreamDefaultController<Uint8Array>;

  return { controller, chunks };
}

function decodeChunks(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk)).join('');
}

function readEvents(text: string): CapturedEvent[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('@@'))
    .map((line) => {
      const end = line.indexOf('@@', 2);
      const prefix = line.slice(0, end + 2);
      const payload = JSON.parse(line.slice(end + 2)) as unknown;
      return { prefix, payload };
    });
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
): ResponseToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

function toolDefinition(name: string, mutating: boolean): AgentToolDefinition {
  return {
    name,
    description: name,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    allowedRoles: ['ta', 'manager', 'hr', 'admin'],
    mutating,
  };
}

function baseExecuteParams(overrides: {
  toolCalls: ResponseToolCall[];
  attachments?: AttachmentPayload[];
  toolExecutionCache?: Map<string, ToolExecutionRecord>;
  toolExecutionHistory?: ToolExecutionRecord[];
  llmMessages?: LLMMessage[];
  consecutiveToolFailures?: number;
  sawMutatingTool?: boolean;
}) {
  const { controller, chunks } = createStreamCapture();
  const toolExecutionHistory = overrides.toolExecutionHistory ?? [];
  const llmMessages = overrides.llmMessages ?? [];
  const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();

  return {
    params: {
      toolCalls: overrides.toolCalls,
      attachments: overrides.attachments,
      toolExecutionCache: overrides.toolExecutionCache ??
        new Map<string, ToolExecutionRecord>(),
      toolExecutionHistory,
      llmMessages,
      controller,
      encoder: new TextEncoder(),
      userId: 'user-1',
      role: 'ta' as const,
      conversationId: 'conversation-1',
      prepareGroundedResponse: (text: string) => `grounded:${text}`,
      persistAssistantMessage,
      consecutiveToolFailures: overrides.consecutiveToolFailures ?? 0,
      sawMutatingTool: overrides.sawMutatingTool ?? false,
    },
    chunks,
    toolExecutionHistory,
    llmMessages,
    persistAssistantMessage,
  };
}

const executeAgentToolMock = vi.mocked(executeAgentTool);
const getToolDefinitionMock = vi.mocked(getToolDefinition);
const requiresAgentActionConfirmationMock = vi.mocked(
  requiresAgentActionConfirmation,
);
const requestAgentActionConfirmationMock = vi.mocked(
  requestAgentActionConfirmation,
);

describe('statistics chat tool loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToolDefinitionMock.mockReturnValue(toolDefinition('list_jobs', false));
    requiresAgentActionConfirmationMock.mockReturnValue(false);
  });

  it('queues only uncached tool calls', () => {
    const { controller, chunks } = createStreamCapture();
    const cachedArgs = { status: 'open' };
    const toolExecutionCache = new Map<string, ToolExecutionRecord>([
      [
        makeToolCallCacheKey('list_jobs', cachedArgs),
        {
          toolName: 'list_jobs',
          args: cachedArgs,
          result: { success: true, data: [{ id: 'job-1' }] },
          mutating: false,
        },
      ],
    ]);

    queueToolCalls({
      toolCalls: [
        toolCall('cached-call', 'list_jobs', cachedArgs),
        toolCall('fresh-call', 'list_jobs', { status: 'closed' }),
      ],
      toolExecutionCache,
      controller,
      encoder: new TextEncoder(),
    });

    const events = readEvents(decodeChunks(chunks));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prefix: '@@TOOL_START@@',
      payload: {
        id: 'fresh-call',
        tool: 'list_jobs',
        status: 'queued',
        summary: 'Queued',
      },
    });
  });

  it('reuses cached tool results without executing tools again', async () => {
    const args = { status: 'open' };
    const cachedRecord: ToolExecutionRecord = {
      toolName: 'list_jobs',
      args,
      result: { success: true, data: [{ id: 'job-1', title: 'Engineer' }] },
      mutating: true,
    };
    const toolExecutionCache = new Map<string, ToolExecutionRecord>([
      [makeToolCallCacheKey('list_jobs', args), cachedRecord],
    ]);
    const { params, llmMessages } = baseExecuteParams({
      toolCalls: [toolCall('tool-call-1', 'list_jobs', args)],
      toolExecutionCache,
    });

    const result = await executeToolCalls(params);

    expect(executeAgentToolMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      consecutiveToolFailures: 0,
      sawMutatingTool: true,
      fullResponse: '',
      shouldBreakLoop: false,
      shouldReturn: false,
    });
    expect(llmMessages).toHaveLength(1);
    expect(llmMessages[0]).toMatchObject({
      role: 'tool',
      tool_call_id: 'tool-call-1',
    });
    expect(JSON.parse(llmMessages[0].content) as unknown).toEqual([
      { id: 'job-1', title: 'Engineer' },
    ]);
  });

  it('routes confirmation-gated mutating tools to pending confirmation without executing them', async () => {
    getToolDefinitionMock.mockReturnValue(
      toolDefinition('bulk_update_candidate_stage', true),
    );
    requiresAgentActionConfirmationMock.mockReturnValue(true);
    requestAgentActionConfirmationMock.mockResolvedValue('confirmation required');
    const args = { candidateIds: ['candidate-1'], stage: 'hr_interview' };
    const { params } = baseExecuteParams({
      toolCalls: [toolCall('tool-call-1', 'bulk_update_candidate_stage', args)],
    });

    const result = await executeToolCalls(params);

    expect(executeAgentToolMock).not.toHaveBeenCalled();
    expect(requestAgentActionConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'bulk_update_candidate_stage',
        toolArgs: args,
        traceId: 'tool-call-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
      }),
    );
    expect(result).toMatchObject({
      consecutiveToolFailures: 0,
      sawMutatingTool: true,
      fullResponse: 'confirmation required',
      shouldBreakLoop: false,
      shouldReturn: true,
    });
  });

  it('executes read-only tools, emits file events, and strips file payloads before LLM reuse', async () => {
    getToolDefinitionMock.mockReturnValue(toolDefinition('export_candidates', false));
    executeAgentToolMock.mockResolvedValue({
      success: true,
      data: {
        rows: 2,
        _fileDownload: {
          filename: 'candidates.csv',
          contentType: 'text/csv',
        },
      },
    });
    const { params, chunks, toolExecutionHistory, llmMessages } = baseExecuteParams({
      toolCalls: [toolCall('tool-call-1', 'export_candidates', { format: 'csv' })],
    });

    const result = await executeToolCalls(params);

    expect(result).toMatchObject({
      consecutiveToolFailures: 0,
      sawMutatingTool: false,
      shouldBreakLoop: false,
      shouldReturn: false,
    });
    expect(toolExecutionHistory).toHaveLength(1);
    expect(toolExecutionHistory[0].result.data).toEqual({ rows: 2 });
    expect(JSON.parse(llmMessages[0].content) as unknown).toEqual({ rows: 2 });

    const events = readEvents(decodeChunks(chunks));
    expect(events.map((event) => event.prefix)).toEqual([
      '@@TOOL_START@@',
      '@@FILE@@',
      '@@TOOL_END@@',
    ]);
    expect(events[1].payload).toEqual({
      filename: 'candidates.csv',
      contentType: 'text/csv',
    });
  });

  it('injects upload attachments for immediate upload execution without leaking raw bytes to stream events', async () => {
    getToolDefinitionMock.mockReturnValue(toolDefinition('upload_cv', true));
    requiresAgentActionConfirmationMock.mockReturnValue(false);
    executeAgentToolMock.mockResolvedValue({
      success: true,
      data: { uploaded: true },
    });
    const attachment: AttachmentPayload = {
      filename: 'candidate.pdf',
      contentType: 'application/pdf',
      size: 12,
      rawBytes: 'base64-encoded-pdf',
    };
    const { params, chunks } = baseExecuteParams({
      toolCalls: [toolCall('tool-call-1', 'upload_cv', { attachmentIndex: 0 })],
      attachments: [attachment],
    });

    const result = await executeToolCalls(params);

    expect(executeAgentToolMock).toHaveBeenCalledWith(
      'upload_cv',
      { attachmentIndex: 0, _attachment: attachment },
      { userId: 'user-1', role: 'ta' },
    );
    expect(result).toMatchObject({
      sawMutatingTool: true,
      shouldReturn: false,
      shouldBreakLoop: false,
    });
    expect(decodeChunks(chunks)).not.toContain('base64-encoded-pdf');
    expect(decodeChunks(chunks)).not.toContain('rawBytes');
  });

  it('cuts off execution at the consecutive failure threshold with a grounded fallback', async () => {
    getToolDefinitionMock.mockReturnValue(toolDefinition('list_jobs', false));
    executeAgentToolMock.mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });
    const { params, toolExecutionHistory, llmMessages } = baseExecuteParams({
      toolCalls: [toolCall('tool-call-1', 'list_jobs', { status: 'open' })],
      consecutiveToolFailures: 2,
    });

    const result = await executeToolCalls(params);

    expect(toolExecutionHistory).toHaveLength(1);
    expect(llmMessages).toHaveLength(0);
    expect(result).toMatchObject({
      consecutiveToolFailures: 3,
      sawMutatingTool: false,
      shouldBreakLoop: true,
      shouldReturn: false,
      fullResponse:
        'grounded:I encountered 3 consecutive tool failures. Please try rephrasing your request.',
    });
  });
});
