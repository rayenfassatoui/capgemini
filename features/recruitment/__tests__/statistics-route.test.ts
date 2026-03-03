import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ---- Module mocks (must be before route import) ----

const mockGetSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetStatisticsChatContext = vi.fn().mockResolvedValue('static context');
const mockGetOrCreateChatConversation = vi
  .fn()
  .mockResolvedValue({ id: 'conv-1' });
const mockSaveChatMessage = vi.fn().mockResolvedValue(undefined);

vi.mock('@/features/recruitment/services', () => ({
  getStatisticsChatContext: (...args: unknown[]) =>
    mockGetStatisticsChatContext(...args),
  getOrCreateChatConversation: (...args: unknown[]) =>
    mockGetOrCreateChatConversation(...args),
  saveChatMessage: (...args: unknown[]) => mockSaveChatMessage(...args),
  getChatHistory: vi.fn().mockResolvedValue([]),
  listChatConversations: vi.fn().mockResolvedValue([]),
  createChatConversation: vi
    .fn()
    .mockResolvedValue({ id: 'conv-new' }),
  deleteChatConversation: vi.fn().mockResolvedValue(undefined),
}));

const mockExecuteAgentTool = vi.fn();
const mockGetToolsForRole = vi.fn().mockReturnValue([]);

vi.mock('@/features/recruitment/services/agent-tools', () => ({
  getToolsForRole: (...args: unknown[]) => mockGetToolsForRole(...args),
  executeAgentTool: (...args: unknown[]) => mockExecuteAgentTool(...args),
}));

// Import route handlers AFTER mocks
import { POST } from '@/app/api/chat/statistics/route';

// ---- Helpers ----

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat/statistics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

interface ToolStartEvent {
  tool: string;
  args: Record<string, unknown>;
}

interface ToolEndEvent {
  tool: string;
  success: boolean;
  summary: string;
}

function parseStreamOutput(raw: string) {
  const lines = raw.split('\n');
  const toolStarts: ToolStartEvent[] = [];
  const toolEnds: ToolEndEvent[] = [];
  let text = '';

  for (const line of lines) {
    if (line.startsWith('@@TOOL_START@@')) {
      toolStarts.push(JSON.parse(line.slice('@@TOOL_START@@'.length)));
    } else if (line.startsWith('@@TOOL_END@@')) {
      toolEnds.push(JSON.parse(line.slice('@@TOOL_END@@'.length)));
    } else {
      text += line;
    }
  }

  return { toolStarts, toolEnds, text };
}

const DEFAULT_SESSION = {
  user: { id: 'user-1', role: 'ta' },
  session: { id: 'session-1' },
};

function mockLLMTextResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content, tool_calls: undefined } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function mockLLMToolCallResponse(
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>,
  content?: string
) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: content ?? null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ---- Tests ----

describe('POST /api/chat/statistics — route layer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    mockGetSession.mockResolvedValue(DEFAULT_SESSION);
    mockGetToolsForRole.mockReturnValue([]);
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
  });

  // ---- Auth & validation ----

  it('returns 401 when session is missing', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/chat/statistics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '<<not-json>>',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages array is empty', async () => {
    const res = await POST(makePostRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when OPENROUTER_API_KEY is not configured', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    expect(res.status).toBe(503);
  });

  // ---- Plain text streaming (no tools) ----

  it('streams plain text when LLM returns no tool calls', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('Hello, how can I help?')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    expect(res.status).toBe(200);

    const raw = await readStream(res);
    const { toolStarts, toolEnds, text } = parseStreamOutput(raw);

    expect(toolStarts).toHaveLength(0);
    expect(toolEnds).toHaveLength(0);
    expect(text).toBe('Hello, how can I help?');
  });

  // ---- SSE tool markers ----

  it('emits @@TOOL_START@@ and @@TOOL_END@@ for a single tool call', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          { id: 'call_1', name: 'list_cv_pool', arguments: {} },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMTextResponse('Here are your CVs.')
      );

    mockExecuteAgentTool.mockResolvedValue({
      success: true,
      data: [{ id: 'cv-1', filename: 'resume.pdf' }],
    });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'list my cvs' }],
    }));

    const raw = await readStream(res);
    const { toolStarts, toolEnds, text } = parseStreamOutput(raw);

    expect(toolStarts).toHaveLength(1);
    expect(toolStarts[0].tool).toBe('list_cv_pool');
    expect(toolStarts[0].args).toEqual({});

    expect(toolEnds).toHaveLength(1);
    expect(toolEnds[0].tool).toBe('list_cv_pool');
    expect(toolEnds[0].success).toBe(true);
    expect(toolEnds[0].summary).toBe('Returned 1 result(s)');

    expect(text).toBe('Here are your CVs.');
  });

  it('marks tool end as failed when executeAgentTool returns an error', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          { id: 'call_fail', name: 'delete_cv', arguments: { cvId: 'bad' } },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMTextResponse('Sorry, could not delete that.')
      );

    mockExecuteAgentTool.mockResolvedValue({
      success: false,
      error: 'CV not found',
    });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'delete cv' }],
    }));

    const raw = await readStream(res);
    const { toolEnds, text } = parseStreamOutput(raw);

    expect(toolEnds[0].success).toBe(false);
    expect(toolEnds[0].summary).toBe('CV not found');
    expect(text).toBe('Sorry, could not delete that.');
  });

  // ---- Multi-step tool loop ----

  it('supports multi-step tool loop (two iterations before text)', async () => {
    // Step 1: LLM calls list_jobs
    // Step 2: LLM calls get_job
    // Step 3: LLM returns text
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          { id: 'call_1', name: 'list_jobs', arguments: {} },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          {
            id: 'call_2',
            name: 'get_job',
            arguments: { jobId: 'job-uuid-1' },
          },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMTextResponse('The Senior Engineer job requires React.')
      );

    mockExecuteAgentTool
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'job-uuid-1', title: 'Senior Engineer' }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'job-uuid-1',
          title: 'Senior Engineer',
          mustHave: ['React'],
        },
      });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'details on engineer job' }],
    }));

    const raw = await readStream(res);
    const { toolStarts, toolEnds, text } = parseStreamOutput(raw);

    expect(toolStarts).toHaveLength(2);
    expect(toolStarts[0].tool).toBe('list_jobs');
    expect(toolStarts[1].tool).toBe('get_job');

    expect(toolEnds).toHaveLength(2);
    expect(toolEnds[0].success).toBe(true);
    expect(toolEnds[1].success).toBe(true);

    expect(text).toBe('The Senior Engineer job requires React.');

    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(2);
    expect(mockExecuteAgentTool).toHaveBeenNthCalledWith(
      1,
      'list_jobs',
      {},
      { userId: 'user-1', role: 'ta' }
    );
    expect(mockExecuteAgentTool).toHaveBeenNthCalledWith(
      2,
      'get_job',
      { jobId: 'job-uuid-1' },
      { userId: 'user-1', role: 'ta' }
    );
  });

  it('handles parallel tool calls in a single LLM response', async () => {
    // LLM returns two tool calls at once
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          { id: 'call_a', name: 'get_cv_pool_stats', arguments: {} },
          { id: 'call_b', name: 'get_jobs_stats', arguments: {} },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMTextResponse('Here are the combined stats.')
      );

    mockExecuteAgentTool
      .mockResolvedValueOnce({ success: true, data: { totalCvs: 42 } })
      .mockResolvedValueOnce({ success: true, data: { totalJobs: 10 } });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'show stats' }],
    }));

    const raw = await readStream(res);
    const { toolStarts, toolEnds, text } = parseStreamOutput(raw);

    expect(toolStarts).toHaveLength(2);
    expect(toolEnds).toHaveLength(2);
    expect(toolEnds[0].summary).toBe('Completed successfully');
    expect(toolEnds[1].summary).toBe('Completed successfully');
    expect(text).toBe('Here are the combined stats.');
  });

  it('emits fallback message when MAX_AGENT_STEPS (8) is reached', async () => {
    // LLM always returns a tool call, never text
    // Must return a NEW Response each call since body is consumed once
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.resolve(
        mockLLMToolCallResponse([
          { id: 'call_loop', name: 'list_cv_pool', arguments: {} },
        ])
      )
    );

    mockExecuteAgentTool.mockResolvedValue({ success: true, data: [] });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'keep going' }],
    }));

    const raw = await readStream(res);
    const { toolStarts, text } = parseStreamOutput(raw);

    // Exactly 8 tool iterations
    expect(toolStarts).toHaveLength(8);
    expect(text).toContain('maximum number of steps');
  });

  // ---- Attachment injection ----

  it('injects _attachment into upload_cv tool args from request attachments', async () => {
    const attachment = {
      filename: 'resume.pdf',
      contentType: 'application/pdf',
      size: 5000,
      rawBytes: 'base64data==',
    };

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          {
            id: 'call_up',
            name: 'upload_cv',
            arguments: { attachmentIndex: '0' },
          },
        ])
      )
      .mockResolvedValueOnce(
        mockLLMTextResponse('CV uploaded successfully!')
      );

    mockExecuteAgentTool.mockResolvedValue({
      success: true,
      data: { cvId: 'new-cv-id', message: 'CV uploaded' },
    });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'upload this cv' }],
      attachments: [attachment],
    }));

    await readStream(res);

    // _attachment injected with full attachment data
    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      'upload_cv',
      expect.objectContaining({
        attachmentIndex: '0',
        _attachment: attachment,
      }),
      expect.objectContaining({ userId: 'user-1', role: 'ta' })
    );
  });

  it('does NOT inject _attachment for non-upload_cv tools', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        mockLLMToolCallResponse([
          { id: 'call_list', name: 'list_cv_pool', arguments: {} },
        ])
      )
      .mockResolvedValueOnce(mockLLMTextResponse('Done.'));

    mockExecuteAgentTool.mockResolvedValue({
      success: true,
      data: [],
    });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'list cvs' }],
      attachments: [
        {
          filename: 'file.pdf',
          contentType: 'application/pdf',
          size: 1000,
          rawBytes: 'data',
        },
      ],
    }));

    await readStream(res);

    const callArgs = mockExecuteAgentTool.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(callArgs._attachment).toBeUndefined();
  });

  it('includes ATTACHMENTS section in system prompt when files are attached', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('I see your attachment.')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'check this' }],
      attachments: [
        {
          filename: 'candidate.pdf',
          contentType: 'application/pdf',
          size: 3000,
          rawBytes: 'base64==',
        },
      ],
    }));

    await readStream(res);

    // Inspect the fetch call to OpenRouter
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const fetchBody = JSON.parse(fetchCall[1]!.body as string);
    const systemMsg = fetchBody.messages[0];

    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('ATTACHMENTS');
    expect(systemMsg.content).toContain('candidate.pdf');
    expect(systemMsg.content).toContain('[0]');
  });

  it('omits ATTACHMENTS section when no files are attached', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('No files.')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    await readStream(res);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const fetchBody = JSON.parse(fetchCall[1]!.body as string);
    const systemMsg = fetchBody.messages[0];

    expect(systemMsg.content).not.toContain('ATTACHMENTS');
  });

  // ---- Message persistence ----

  it('saves user and assistant messages to conversation', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('My response')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hello' }],
    }));

    // Must consume stream for save callbacks to execute
    await readStream(res);

    expect(mockSaveChatMessage).toHaveBeenCalledWith(
      'conv-1',
      'user',
      'hello'
    );
    expect(mockSaveChatMessage).toHaveBeenCalledWith(
      'conv-1',
      'assistant',
      'My response'
    );
  });

  it('saves fallback message when max steps reached', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.resolve(
        mockLLMToolCallResponse([
          { id: 'call_x', name: 'list_cv_pool', arguments: {} },
        ])
      )
    );

    mockExecuteAgentTool.mockResolvedValue({ success: true, data: [] });

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'loop' }],
    }));

    await readStream(res);

    // Assistant message should be the fallback text
    const savedCalls = mockSaveChatMessage.mock.calls;
    const assistantSave = savedCalls.find(
      (c) => c[1] === 'assistant'
    );
    expect(assistantSave).toBeDefined();
    expect(assistantSave![2]).toContain('maximum number of steps');
  });

  // ---- LLM error handling ----

  it('streams error message when LLM returns non-200 status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    const raw = await readStream(res);

    expect(raw).toContain('AI service returned an error');
    expect(raw).toContain('500');
  });

  it('streams error message when LLM returns empty choices', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    const raw = await readStream(res);

    expect(raw).toContain('No response from AI');
  });

  // ---- Role context ----

  it('passes user role to getToolsForRole', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-mgr', role: 'manager' },
      session: { id: 'session-2' },
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('Manager view.')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    await readStream(res);

    expect(mockGetToolsForRole).toHaveBeenCalledWith('manager');
  });

  it('includes role description in system prompt', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-hr', role: 'hr' },
      session: { id: 'session-3' },
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(
      mockLLMTextResponse('HR view.')
    );

    const res = await POST(makePostRequest({
      messages: [{ role: 'user', content: 'hi' }],
    }));

    await readStream(res);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const fetchBody = JSON.parse(fetchCall[1]!.body as string);
    const systemMsg = fetchBody.messages[0];

    expect(systemMsg.content).toContain('HR representative');
  });
});
