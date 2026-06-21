import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminGovernanceClient } from '../components/admin-governance-client';
import type { GovernanceAuditReport } from '../services/governance-types';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/features/recruitment/actions', () => ({
  exportGovernanceAuditCsvAction: vi.fn(),
}));

const report: GovernanceAuditReport = {
  filters: { limit: 200 },
  options: {
    actors: [
      {
        id: 'user-1',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
      },
    ],
    candidates: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        fullName: 'Amina Trabelsi',
        email: 'amina@example.com',
        stage: 'ta_interview',
      },
    ],
  },
  stats: {
    totalRows: 2,
    stageTransitions: 1,
    agentActions: 1,
    activityLogs: 0,
    pendingAgentActions: 0,
    failedAgentActions: 1,
  },
  rows: [
    {
      id: 'stage-1',
      kind: 'stage_transition',
      status: 'recorded',
      action: 'New → TA Screening',
      source: 'manual',
      summary: 'Amina Trabelsi moved from New to TA Screening',
      actorId: 'user-1',
      actorName: 'Admin User',
      actorEmail: 'admin@example.com',
      candidateId: '11111111-1111-4111-8111-111111111111',
      candidateName: 'Amina Trabelsi',
      candidateEmail: 'amina@example.com',
      occurredAtIso: '2026-06-21T12:00:00.000Z',
      detail: {
        type: 'stage_transition',
        previousStage: 'new',
        newStage: 'ta_screening',
        reason: 'Manual audit test',
      },
    },
    {
      id: 'agent-1',
      kind: 'agent_action',
      status: 'failed',
      action: 'update candidate stage',
      source: 'update_candidate_stage',
      summary: 'AI action failed after confirmation',
      actorId: 'user-1',
      actorName: 'Admin User',
      actorEmail: 'admin@example.com',
      candidateId: '11111111-1111-4111-8111-111111111111',
      candidateName: 'Amina Trabelsi',
      candidateEmail: 'amina@example.com',
      occurredAtIso: '2026-06-21T12:05:00.000Z',
      detail: {
        type: 'agent_action',
        toolName: 'update_candidate_stage',
        args: {
          candidateId: '11111111-1111-4111-8111-111111111111',
          rawBytes: '[REDACTED]',
        },
        summary: 'AI action failed after confirmation',
        error: 'Invalid transition',
        conversationId: 'conversation-1',
        expiresAtIso: '2026-06-21T12:10:00.000Z',
        confirmedAtIso: '2026-06-21T12:06:00.000Z',
        cancelledAtIso: null,
        executedAtIso: '2026-06-21T12:06:10.000Z',
      },
    },
  ],
};

describe('AdminGovernanceClient', () => {
  it('renders governance evidence and opens sanitized details', () => {
    render(<AdminGovernanceClient report={report} />);

    expect(screen.getByText('Audit evidence (2)')).toBeInTheDocument();
    expect(screen.getByText('Stage transition')).toBeInTheDocument();
    expect(screen.getByText('AI action')).toBeInTheDocument();
    expect(screen.getAllByText('Amina Trabelsi').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: /open audit details/i })[1]);

    expect(screen.getByText('Governance audit detail')).toBeInTheDocument();
    expect(screen.getAllByText('update_candidate_stage').length).toBeGreaterThan(0);
    expect(screen.getByText('Invalid transition')).toBeInTheDocument();
    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
  });
});
