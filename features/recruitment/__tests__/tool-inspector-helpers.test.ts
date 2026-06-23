import { describe, expect, it } from 'vitest';

import type { ToolEvent } from '../components/chat/chat-types';
import {
  classifyToolTracePhase,
  getToolEventDurationMs,
  getToolTracePhaseLabel,
  groupToolEventsByPhase,
} from '../components/chat/tool-inspector-helpers';

function event(overrides: Partial<ToolEvent> & Pick<ToolEvent, 'id' | 'tool'>): ToolEvent {
  return {
    status: 'success',
    ...overrides,
  };
}

describe('tool inspector phase helpers', () => {
  it('classifies tool events into stable recruitment workflow phases', () => {
    expect(classifyToolTracePhase(event({ id: 'plan-1', tool: 'unknown_tool' }))).toBe('planning');
    expect(classifyToolTracePhase(event({ id: 'retrieval-1', tool: 'list_jobs' }))).toBe('retrieval');
    expect(classifyToolTracePhase(event({ id: 'analysis-1', tool: 'match_cvs_to_job' }))).toBe('analysis');
    expect(classifyToolTracePhase(event({ id: 'confirmation-1', tool: 'update_candidate_stage', status: 'pending_confirmation' }))).toBe('confirmation');
    expect(classifyToolTracePhase(event({ id: 'execution-1', tool: 'schedule_interview' }))).toBe('execution');
    expect(classifyToolTracePhase(event({ id: 'verification-1', tool: 'get_activity_log_enriched' }))).toBe('verification');
  });

  it('groups phases in timeline order and summarizes status plus duration', () => {
    const grouped = groupToolEventsByPhase(
      [
        event({
          id: 'retrieval-1',
          tool: 'list_jobs',
          startedAt: '2026-06-22T10:00:00.000Z',
          endedAt: '2026-06-22T10:00:01.200Z',
        }),
        event({
          id: 'analysis-1',
          tool: 'match_cvs_to_job',
          durationMs: 3200,
        }),
        event({
          id: 'analysis-2',
          tool: 'compare_candidates',
          status: 'running',
          startedAt: '2026-06-22T10:00:02.000Z',
        }),
        event({
          id: 'verification-1',
          tool: 'get_activity_log_enriched',
          status: 'error',
          error: 'Audit source unavailable',
        }),
      ],
      new Date('2026-06-22T10:00:04.000Z').getTime(),
    );

    expect(grouped.map((phase) => phase.id)).toEqual([
      'retrieval',
      'analysis',
      'verification',
    ]);
    expect(grouped[0]).toMatchObject({
      label: 'Retrieval',
      status: 'success',
      durationMs: 1200,
    });
    expect(grouped[1]).toMatchObject({
      label: 'Analysis',
      status: 'running',
      durationMs: 5200,
    });
    expect(grouped[2]).toMatchObject({
      label: 'Verification',
      status: 'error',
    });
  });

  it('exposes readable labels for individual tool events', () => {
    expect(getToolTracePhaseLabel(event({ id: 'tool-1', tool: 'hybrid_search_cvs' }))).toBe('Retrieval');
    expect(getToolEventDurationMs(event({ id: 'tool-2', tool: 'list_jobs' }))).toBeUndefined();
  });
});
