import { describe, expect, it } from 'vitest';

import {
  buildGovernanceAuditCsv,
  normalizeGovernanceFilters,
  sanitizeGovernancePayload,
} from '../services/governance-utils';
import type { GovernanceAuditRow } from '../services/governance-types';

describe('governance utilities', () => {
  it('normalizes URL search params with defaults and all-value removal', () => {
    expect(
      normalizeGovernanceFilters({
        from: ['2026-06-01'],
        to: '2026-06-21',
        actorId: 'all',
        candidateId: '',
        action: ' update_candidate_stage ',
        status: 'executed',
      }),
    ).toEqual({
      from: '2026-06-01',
      to: '2026-06-21',
      action: 'update_candidate_stage',
      status: 'executed',
      limit: 200,
    });
  });

  it('rejects invalid governance filter values', () => {
    expect(() => normalizeGovernanceFilters({ status: 'approved' })).toThrow(
      'Unsupported governance status',
    );
    expect(() => normalizeGovernanceFilters({ candidateId: 'not-a-uuid' })).toThrow(
      'Candidate ID must be a UUID',
    );
    expect(() => normalizeGovernanceFilters({ from: '21-06-2026' })).toThrow(
      'Date must use YYYY-MM-DD format',
    );
  });

  it('redacts sensitive AI action payload fields recursively', () => {
    expect(
      sanitizeGovernancePayload({
        candidateId: 'candidate-1',
        rawBytes: 'base64-file',
        nested: {
          rawText: 'full CV text',
          accessToken: 'secret-token',
          safe: 'visible',
        },
        candidateIds: ['candidate-1', 'candidate-2'],
      }),
    ).toEqual({
      candidateId: 'candidate-1',
      rawBytes: '[REDACTED]',
      nested: {
        rawText: '[REDACTED]',
        accessToken: '[REDACTED]',
        safe: 'visible',
      },
      candidateIds: ['candidate-1', 'candidate-2'],
    });
  });

  it('builds escaped CSV from sanitized governance rows', () => {
    const rows: GovernanceAuditRow[] = [
      {
        id: 'audit-1',
        kind: 'agent_action',
        status: 'failed',
        action: 'update candidate stage',
        source: 'update_candidate_stage',
        summary: 'Failed because "transition" was invalid\nNeeds review',
        actorId: 'user-1',
        actorName: 'Admin User',
        actorEmail: 'admin@example.com',
        candidateId: 'candidate-1',
        candidateName: 'Amina Trabelsi',
        candidateEmail: 'amina@example.com',
        occurredAtIso: '2026-06-21T12:00:00.000Z',
        detail: {
          type: 'agent_action',
          toolName: 'update_candidate_stage',
          args: { candidateId: 'candidate-1', rawBytes: '[REDACTED]' },
          summary: 'Failed because "transition" was invalid\nNeeds review',
          error: 'Invalid transition',
          conversationId: 'conversation-1',
          expiresAtIso: '2026-06-21T12:05:00.000Z',
          confirmedAtIso: '2026-06-21T12:01:00.000Z',
          cancelledAtIso: null,
          executedAtIso: '2026-06-21T12:01:30.000Z',
        },
      },
    ];

    const csv = buildGovernanceAuditCsv(rows);

    expect(csv).toContain('"Failed because ""transition"" was invalid Needs review"');
    expect(csv).toContain('"{');
    expect(csv).toContain('[REDACTED]');
    expect(csv.split('\n')).toHaveLength(2);
  });
});
