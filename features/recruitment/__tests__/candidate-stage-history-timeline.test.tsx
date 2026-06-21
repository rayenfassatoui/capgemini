import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CandidateStageHistoryTimeline,
  formatCandidateStage,
  normalizeCandidateStageHistory,
  type CandidateStageHistoryTimelineEntry,
} from '../components/candidate-stage-history-timeline';

const timelineEntries: CandidateStageHistoryTimelineEntry[] = [
  {
    id: 'history-1',
    candidateId: 'candidate-1',
    previousStage: null,
    newStage: 'new',
    changedBy: 'user-1',
    changedByName: 'Amina Recruiter',
    changedByEmail: 'amina@example.com',
    reason: 'CV assigned to job',
    source: 'assignment',
    createdAtIso: '2026-01-05T09:30:00.000Z',
    createdAtLabel: 'Jan 5, 2026, 09:30',
  },
  {
    id: 'history-2',
    candidateId: 'candidate-1',
    previousStage: 'new',
    newStage: 'ta_screening',
    changedBy: 'user-2',
    changedByName: 'Hedi Admin',
    changedByEmail: 'hedi@example.com',
    reason: 'Screening started after CV review',
    source: 'screening',
    createdAtIso: '2026-01-06T10:15:00.000Z',
    createdAtLabel: 'Jan 6, 2026, 10:15',
  },
];

describe('CandidateStageHistoryTimeline', () => {
  it('formats candidate pipeline stage labels', () => {
    expect(formatCandidateStage(null)).toBe('Pipeline created');
    expect(formatCandidateStage('manager_interview')).toBe('Manager Interview');
    expect(formatCandidateStage('hr_accepted')).toBe('HR Accepted');
  });

  it('normalizes database records into serializable timeline entries', () => {
    const [entry] = normalizeCandidateStageHistory([
      {
        id: 'history-1',
        candidateId: 'candidate-1',
        previousStage: null,
        newStage: 'new',
        changedBy: null,
        changedByName: null,
        changedByEmail: null,
        reason: null,
        source: 'assignment',
        createdAt: new Date('2026-01-05T09:30:00.000Z'),
      },
    ]);

    expect(entry).toMatchObject({
      id: 'history-1',
      createdAtIso: '2026-01-05T09:30:00.000Z',
    });
    expect(entry.createdAtLabel).not.toBe('Unknown time');
  });

  it('renders actor details for HR and Admin audit views', () => {
    render(
      <CandidateStageHistoryTimeline
        entries={timelineEntries}
        showActorDetails={true}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Stage history' })).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(screen.getByText('Created in New')).toBeInTheDocument();
    expect(screen.getByText('TA Screening')).toBeInTheDocument();
    expect(screen.getByText('Screening started after CV review')).toBeInTheDocument();
    expect(screen.getByText('Amina Recruiter (amina@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Hedi Admin (hedi@example.com)')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('redacts actor details for non-HR manager views', () => {
    render(
      <CandidateStageHistoryTimeline
        entries={timelineEntries}
        showActorDetails={false}
      />,
    );

    expect(screen.queryByText('Amina Recruiter (amina@example.com)')).not.toBeInTheDocument();
    expect(screen.queryByText('Hedi Admin (hedi@example.com)')).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Actor details restricted to HR and Admin'),
    ).toHaveLength(2);
  });
});
