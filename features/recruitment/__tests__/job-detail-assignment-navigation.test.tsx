import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobDetailClient } from '../components/job-detail-client';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ta/jobs/job-1',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams('tab=cv-matching'),
}));

vi.mock('@/features/recruitment/components/match-cvs-dialog', () => ({
  InlineCvMatching: ({
    onAssigned,
  }: {
    onAssigned?: (candidateId: string) => void;
  }) => (
    <button type="button" onClick={() => onAssigned?.('candidate-1')}>
      Assign mocked candidate
    </button>
  ),
}));

beforeEach(() => {
  navigation.replace.mockReset();
});

describe('JobDetailClient assignment navigation', () => {
  it('opens scheduling for the newly assigned interview candidate', () => {
    render(
      <JobDetailClient
        job={{
          id: 'job-1',
          title: 'Senior TypeScript Engineer',
          description: 'Build and maintain typed recruitment workflows.',
          seniority: 'Senior',
          businessUnit: 'Digital',
          status: 'open',
          mustHave: ['TypeScript'],
          niceToHave: [],
          createdAt: new Date('2026-07-22T08:00:00.000Z'),
        }}
        candidates={[
          {
            id: 'candidate-1',
            fullName: 'Matched Candidate',
            email: 'candidate@example.com',
            stage: 'ta_interview',
            cvId: 'cv-1',
            jobId: 'job-1',
          },
        ]}
        jobId="job-1"
        managers={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Assign mocked candidate' }),
    );

    expect(navigation.replace).toHaveBeenCalledWith(
      '/ta/jobs/job-1?tab=interviews&candidateId=candidate-1',
      { scroll: false },
    );
    expect(
      screen.getByRole('dialog', { name: 'Schedule Interview' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Candidate')).toHaveValue('candidate-1');
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Meet Link')).toBeInTheDocument();
  });
});
