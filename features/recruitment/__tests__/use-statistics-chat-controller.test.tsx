import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStatisticsChatController } from '../components/chat/use-statistics-chat-controller';
import { serializeChatChartEvent } from '../chat-chart-events';
import { serializeChatResponseCardEvent } from '../chat-card-events';
import type { RecruitmentAnalyticsChart, RecruitmentResponseCard } from '../types';

const conversation = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'New Chat',
  createdAt: '2026-06-28T00:00:00.000Z',
  updatedAt: '2026-06-28T00:00:00.000Z',
};

const chart: RecruitmentAnalyticsChart = {
  id: 'pipeline-funnel',
  kind: 'bar',
  title: 'Pipeline funnel',
  description: 'Candidates by stage.',
  xKey: 'label',
  series: [{ key: 'count', label: 'Candidates', color: 'var(--chart-1)' }],
  data: [{ label: 'TA screening', count: 6 }],
  summary: 'TA screening is largest.',
};

const card: RecruitmentResponseCard = {
  id: 'pipeline-dashboard',
  kind: 'pipeline',
  title: 'Pipeline snapshot',
  description: 'Live counters.',
  tone: 'warning',
  sourceTool: 'get_dashboard_stats',
  metrics: [{ label: 'Pending screenings', value: '4', tone: 'warning' }],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function streamResponse(text: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}

describe('useStatisticsChatController stream parsing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url === '/api/chat/statistics' && method === 'GET') {
          return Promise.resolve(jsonResponse({ conversations: [] }));
        }

        if (url === '/api/chat/statistics' && method === 'PUT') {
          return Promise.resolve(jsonResponse(conversation));
        }

        if (url === '/api/chat/statistics' && method === 'POST') {
          return Promise.resolve(
            streamResponse(
              [
                '@@META@@' +
                  JSON.stringify({
                    evidence: {
                      sources: [],
                      evidenceBlocks: [],
                      observedFacts: ['Dashboard pendingScreenings = 4.'],
                      inferenceLimits: [],
                    },
                    charts: [chart],
                    cards: [card],
                  }),
                '## My read',
                'TA screening is the current bottleneck.',
                serializeChatChartEvent(chart),
                serializeChatResponseCardEvent(card),
              ].join('\n') + '\n',
            ),
          );
        }

        return Promise.resolve(new Response('Not found', { status: 404 }));
      }),
    );
  });

  it('hydrates metadata, chart cards, response cards, and visible text from the stream', async () => {
    const { result } = renderHook(() =>
      useStatisticsChatController({ enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingHistory).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('show proactive pipeline analysis');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.content).toContain('TA screening is the current bottleneck.');
    expect(assistantMessage.metadata?.evidence?.observedFacts).toEqual([
      'Dashboard pendingScreenings = 4.',
    ]);
    expect(assistantMessage.charts).toEqual([chart]);
    expect(assistantMessage.cards).toEqual([card]);
  });
});
