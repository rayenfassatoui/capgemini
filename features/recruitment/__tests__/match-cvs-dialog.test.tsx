import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CvMatchResult } from '../types';
import { InlineCvMatching } from '../components/match-cvs-dialog';

const mocks = vi.hoisted(() => ({
  assignCvToJobAction: vi.fn(),
  matchCvsToJobWithFiltersAction: vi.fn(),
  fetch: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/recruitment/actions', () => ({
  assignCvToJobAction: mocks.assignCvToJobAction,
  matchCvsToJobWithFiltersAction: mocks.matchCvsToJobWithFiltersAction,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

const MATCH_RESULT: CvMatchResult = {
  cvId: 'cv-1',
  cvFilename: 'candidate.pdf',
  candidateName: 'Matched Candidate',
  candidateEmail: 'candidate@example.com',
  matchScore: 82,
  matchedMustHave: ['TypeScript'],
  matchedNiceToHave: [],
  gaps: [],
  alreadyAssigned: false,
};

beforeEach(() => {
  mocks.assignCvToJobAction.mockReset();
  mocks.assignCvToJobAction.mockResolvedValue({ id: 'candidate-1', stage: 'ta_interview' });
  mocks.matchCvsToJobWithFiltersAction.mockReset();
  mocks.matchCvsToJobWithFiltersAction.mockResolvedValue([MATCH_RESULT]);
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue(
    Response.json({
      results: [
        {
          ...MATCH_RESULT,
          aiRecommendation: 'Strong TypeScript alignment.',
        },
      ],
    }),
  );
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.toastError.mockReset();
  mocks.toastInfo.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InlineCvMatching direct interview assignment', () => {
  it('forwards the assigned candidate and opens interview scheduling', async () => {
    const onAssigned = vi.fn();

    render(
      <InlineCvMatching
        jobId="job-1"
        jobMustHave={['TypeScript']}
        jobNiceToHave={[]}
        onAssigned={onAssigned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find Matches' }));
    const assignButton = await screen.findByRole('button', { name: 'Assign' });
    fireEvent.click(assignButton);

    await waitFor(() => {
      expect(mocks.assignCvToJobAction).toHaveBeenCalledWith('cv-1', 'job-1');
      expect(onAssigned).toHaveBeenCalledWith('candidate-1');
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Candidate added to Interviews',
      {
        description: 'Set the interview date, time, and meeting link now.',
      },
    );
    expect(
      await screen.findByRole('button', { name: 'Assigned' }),
    ).toBeDisabled();
  });
});

describe('InlineCvMatching progressive results', () => {
  it('keeps ranked results usable while AI recommendations load', async () => {
    const enrichment = Promise.withResolvers<Response>();
    mocks.fetch.mockReturnValue(enrichment.promise);
    render(
      <InlineCvMatching
        jobId="job-1"
        jobMustHave={['TypeScript']}
        jobNiceToHave={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Find Matches' }));

    expect(await screen.findByRole('button', { name: 'Assign' })).toBeEnabled();
    expect(
      screen.getByText(/AI recommendations loading in background/),
    ).toBeInTheDocument();
    expect(mocks.matchCvsToJobWithFiltersAction).toHaveBeenCalledWith('job-1', {
      skills: [],
      languages: [],
      minPositions: 0,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/recruitment/cv-matching/enrich',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          jobId: 'job-1',
          filters: { skills: [], languages: [], minPositions: 0 },
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    await act(async () => {
      enrichment.resolve(
        Response.json({
          results: [
            {
              ...MATCH_RESULT,
              aiRecommendation: 'Strong TypeScript alignment.',
            },
          ],
        }),
      );
    });
    expect(await screen.findByText(/1 AI-analyzed/)).toBeInTheDocument();
  });
});
