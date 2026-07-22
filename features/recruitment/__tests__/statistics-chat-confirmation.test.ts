import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendChatArtifactsToContent,
  extractChatArtifactsFromContent,
} from '../chat-artifact-events';


vi.mock('server-only', () => ({}));


import * as agentTools from '../services/agent-tools';
import * as pendingAgentActions from '../services/pending-agent-actions';
import {
  executeConfirmedActionIfRequested,
  requestAgentActionConfirmation,
} from '../services/statistics-chat-confirmation';
import type { ToolExecutionRecord } from '../services/statistics-chat-types';

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

const executeAgentToolMock = vi.spyOn(agentTools, 'executeAgentTool');
const getToolDefinitionMock = vi.spyOn(agentTools, 'getToolDefinition');
const cancelPendingAgentActionMock = vi.spyOn(
  pendingAgentActions,
  'cancelPendingAgentAction',
);
const confirmPendingAgentActionMock = vi.spyOn(
  pendingAgentActions,
  'confirmPendingAgentAction',
);
const createPendingAgentActionMock = vi.spyOn(
  pendingAgentActions,
  'createPendingAgentAction',
);
const markPendingAgentActionExecutedMock = vi.spyOn(
  pendingAgentActions,
  'markPendingAgentActionExecuted',
);

describe('statistics chat confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markPendingAgentActionExecutedMock.mockResolvedValue(undefined);
  });

  it('ignores requests without a confirmation decision', async () => {
    const { controller, chunks } = createStreamCapture();
    const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();

    const result = await executeConfirmedActionIfRequested({
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'ta',
      controller,
      encoder: new TextEncoder(),
      prepareGroundedResponse: (text) => `grounded:${text}`,
      persistAssistantMessage,
      toolExecutionHistory: [],
    });

    expect(result).toEqual({ handled: false, fullResponse: '' });
    expect(decodeChunks(chunks)).toBe('');
    expect(persistAssistantMessage).not.toHaveBeenCalled();
  });

  it('cancels pending actions without executing a tool', async () => {
    cancelPendingAgentActionMock.mockResolvedValue({
      id: 'action-1',
      toolName: 'close_job',
      summary: 'Close job',
      args: {},
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const { controller, chunks } = createStreamCapture();
    const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();

    const result = await executeConfirmedActionIfRequested({
      confirmation: { actionId: 'action-1', decision: 'cancel' },
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'admin',
      controller,
      encoder: new TextEncoder(),
      prepareGroundedResponse: (text) => `grounded:${text}`,
      persistAssistantMessage,
      toolExecutionHistory: [],
    });

    expect(cancelPendingAgentActionMock).toHaveBeenCalledWith(
      'action-1',
      'user-1',
      'conversation-1',
    );
    expect(executeAgentToolMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      fullResponse: 'Cancelled. I did not execute **close job**.',
    });
    expect(decodeChunks(chunks)).toBe(result.fullResponse);
    const persistedContent = persistAssistantMessage.mock.calls[0]?.[0];
    expect(persistedContent).toContain(result.fullResponse);
    const { artifacts } = extractChatArtifactsFromContent(
      persistedContent ?? '',
    );
    expect(artifacts.confirmations).toMatchObject([
      {
        id: 'action-1',
        toolName: 'close_job',
        status: 'cancelled',
      },
    ]);
  });

  it('executes confirmed actions, strips file payloads from persisted tool history, and emits stream events', async () => {
    confirmPendingAgentActionMock.mockResolvedValue({
      id: 'action-1',
      toolName: 'export_candidate_report',
      summary: 'Export candidate report',
      args: { candidateId: 'candidate-1' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    getToolDefinitionMock.mockReturnValue({
      name: 'export_candidate_report',
      description: 'Export candidate report',
      parameters: { type: 'object', properties: {}, required: [] },
      allowedRoles: ['admin'],
      mutating: false,
    });
    executeAgentToolMock.mockResolvedValue({
      success: true,
      data: {
        exported: true,
        _fileDownload: {
          filename: 'candidate-report.csv',
          base64: 'Y2FuZGlkYXRl',
          contentType: 'text/csv',
        },
      },
    });

    const { controller, chunks } = createStreamCapture();
    const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();
    const toolExecutionHistory: ToolExecutionRecord[] = [];

    const result = await executeConfirmedActionIfRequested({
      confirmation: { actionId: 'action-1', decision: 'confirm' },
      conversationId: 'conversation-1',
      userId: 'user-1',
      role: 'admin',
      controller,
      encoder: new TextEncoder(),
      prepareGroundedResponse: (text) =>
        appendChatArtifactsToContent(`grounded:${text}`, {
          toolEvents: toolExecutionHistory.flatMap((record) =>
            record.trace ? [record.trace] : [],
          ),
          fileDownloads: toolExecutionHistory.flatMap((record) =>
            record.fileDownload ? [record.fileDownload] : [],
          ),
        }),
      persistAssistantMessage,
      toolExecutionHistory,
    });

    expect(confirmPendingAgentActionMock).toHaveBeenCalledWith(
      'action-1',
      'user-1',
      'conversation-1',
    );
    expect(executeAgentToolMock).toHaveBeenCalledWith(
      'export_candidate_report',
      { candidateId: 'candidate-1' },
      { userId: 'user-1', role: 'admin' },
    );
    expect(markPendingAgentActionExecutedMock).toHaveBeenCalledWith(
      'action-1',
      true,
      undefined,
    );
    expect(toolExecutionHistory).toHaveLength(1);
    expect(toolExecutionHistory[0]).toMatchObject({
      toolName: 'export_candidate_report',
      args: { candidateId: 'candidate-1' },
      mutating: false,
      result: {
        success: true,
        data: { exported: true },
      },
    });

    const streamed = decodeChunks(chunks);
    const events = readEvents(streamed);
    expect(events.map((event) => event.prefix)).toEqual([
      '@@TOOL_START@@',
      '@@FILE@@',
      '@@TOOL_END@@',
      '@@ARTIFACTS@@',
    ]);
    expect(events[1].payload).toEqual({
      filename: 'candidate-report.csv',
      base64: 'Y2FuZGlkYXRl',
      contentType: 'text/csv',
    });
    expect(result.handled).toBe(true);
    const { content: visibleResponse, artifacts: responseArtifacts } =
      extractChatArtifactsFromContent(result.fullResponse);
    expect(visibleResponse).toBe(
      'grounded:Done. Confirmed action **export candidate report** was executed.',
    );
    expect(responseArtifacts.fileDownloads).toHaveLength(1);
    expect(streamed.endsWith(result.fullResponse)).toBe(true);
    const persistedContent = persistAssistantMessage.mock.calls[0]?.[0];
    const {
      content: persistedVisibleResponse,
      artifacts: persistedArtifacts,
    } = extractChatArtifactsFromContent(persistedContent ?? '');
    expect(persistedVisibleResponse).toBe(visibleResponse);
    expect(persistedArtifacts.fileDownloads).toEqual([
      {
        filename: 'candidate-report.csv',
        base64: 'Y2FuZGlkYXRl',
        contentType: 'text/csv',
      },
    ]);
    expect(persistedArtifacts.confirmations).toMatchObject([
      {
        id: 'action-1',
        toolName: 'export_candidate_report',
        status: 'confirmed',
      },
    ]);
    expect(persistedArtifacts.toolEvents).toMatchObject([
      {
        tool: 'export_candidate_report',
        status: 'success',
      },
    ]);
  });

  it('does not execute tools when confirmation lookup fails', async () => {
    confirmPendingAgentActionMock.mockRejectedValue(new Error('Pending action expired'));

    const { controller } = createStreamCapture();
    const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();

    await expect(
      executeConfirmedActionIfRequested({
        confirmation: { actionId: 'expired-action', decision: 'confirm' },
        conversationId: 'conversation-1',
        userId: 'user-1',
        role: 'admin',
        controller,
        encoder: new TextEncoder(),
        prepareGroundedResponse: (text) => `grounded:${text}`,
        persistAssistantMessage,
        toolExecutionHistory: [],
      }),
    ).rejects.toThrow('Pending action expired');

    expect(executeAgentToolMock).not.toHaveBeenCalled();
    expect(markPendingAgentActionExecutedMock).not.toHaveBeenCalled();
    expect(persistAssistantMessage).not.toHaveBeenCalled();
  });

  it('creates a pending action and emits confirmation stream state', async () => {
    createPendingAgentActionMock.mockResolvedValue({
      id: 'pending-1',
      toolName: 'bulk_update_candidate_stage',
      summary:
        'Update recruitment workflow state. This action can change recruitment data and needs your explicit confirmation.',
      args: { candidateIds: ['candidate-1'], stage: 'hr_interview' },
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const { controller, chunks } = createStreamCapture();
    const persistAssistantMessage = vi.fn<(text: string) => Promise<void>>();

    const response = await requestAgentActionConfirmation({
      toolName: 'bulk_update_candidate_stage',
      toolArgs: { candidateIds: ['candidate-1'], stage: 'hr_interview' },
      purpose: 'Update recruitment workflow state',
      inputPayload: { candidateIds: ['candidate-1'], stage: 'hr_interview' },
      traceId: 'tool-call-1',
      startedAt: '2026-06-21T00:00:00.000Z',
      conversationId: 'conversation-1',
      userId: 'user-1',
      controller,
      encoder: new TextEncoder(),
      persistAssistantMessage,
    });

    expect(createPendingAgentActionMock).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      toolName: 'bulk_update_candidate_stage',
      args: { candidateIds: ['candidate-1'], stage: 'hr_interview' },
      summary:
        'Update recruitment workflow state. This action can change recruitment data and needs your explicit confirmation.',
    });

    const events = readEvents(decodeChunks(chunks));
    expect(events.map((event) => event.prefix)).toEqual([
      '@@CONFIRMATION@@',
      '@@TOOL_END@@',
    ]);
    expect(events[0].payload).toMatchObject({
      id: 'pending-1',
      toolName: 'bulk_update_candidate_stage',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(events[1].payload).toMatchObject({
      id: 'tool-call-1',
      tool: 'bulk_update_candidate_stage',
      success: true,
      status: 'pending_confirmation',
      output: {
        pendingActionId: 'pending-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
    expect(response).toContain('Confirmation required.');
    expect(response).toContain('Review the action card below');
    const persistedContent = persistAssistantMessage.mock.calls[0]?.[0];
    expect(persistedContent).toContain(response);
    const { artifacts: persistedArtifacts } =
      extractChatArtifactsFromContent(persistedContent ?? '');
    expect(persistedArtifacts.confirmations).toMatchObject([
      {
        id: 'pending-1',
        toolName: 'bulk_update_candidate_stage',
        status: 'pending',
      },
    ]);
    expect(persistedArtifacts.toolEvents).toMatchObject([
      {
        id: 'tool-call-1',
        tool: 'bulk_update_candidate_stage',
        status: 'pending_confirmation',
      },
    ]);
  });
});
