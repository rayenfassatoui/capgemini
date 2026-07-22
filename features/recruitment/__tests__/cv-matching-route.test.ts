import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cvMatchEnrichmentResponseSchema } from '../schemas';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  matchCvsToJobWithFilters: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
}));

vi.mock('@/features/recruitment/services/cv-matching', () => ({
  matchCvsToJobWithFilters: mocks.matchCvsToJobWithFilters,
}));

import { POST } from '../services/cv-matching-route';

const JOB_ID = 'ba532d88-296c-4637-8a70-9122a7d3a9bd';
const FILTERS = {
  skills: ['TypeScript'],
  languages: ['English'],
  minPositions: 2,
};
const MATCH_RESULT = {
  cvId: 'cv-1',
  cvFilename: 'candidate.pdf',
  candidateName: 'Matched Candidate',
  candidateEmail: 'candidate@example.com',
  matchScore: 82,
  matchedMustHave: ['TypeScript'],
  matchedNiceToHave: [],
  gaps: [],
  alreadyAssigned: false,
  aiRecommendation: 'Strong TypeScript alignment.',
};

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({
    user: { id: 'ta-1', role: 'ta' },
  });
  mocks.matchCvsToJobWithFilters.mockReset();
  mocks.matchCvsToJobWithFilters.mockResolvedValue([MATCH_RESULT]);
});

describe('CV match enrichment route', () => {
  it('runs bounded AI enrichment outside the Server Action queue', async () => {
    const request = new Request(
      'http://localhost/api/recruitment/cv-matching/enrich',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: JOB_ID, filters: FILTERS }),
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(
      cvMatchEnrichmentResponseSchema.parse(await response.json()),
    ).toEqual({ results: [MATCH_RESULT] });
    expect(mocks.matchCvsToJobWithFilters).toHaveBeenCalledWith(
      JOB_ID,
      FILTERS,
      { userId: 'ta-1', role: 'ta' },
      {
        includeAiRecommendations: true,
        aiRecommendationLimit: 5,
        aiTimeoutMs: 20_000,
        aiSignal: request.signal,
      },
    );
  });

  it('rejects invalid input before invoking the matching service', async () => {
    const response = await POST(
      new Request('http://localhost/api/recruitment/cv-matching/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'not-a-uuid', filters: FILTERS }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.matchCvsToJobWithFilters).not.toHaveBeenCalled();
  });

  it('forbids roles that cannot run CV matching', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'manager-1', role: 'manager' },
    });

    const response = await POST(
      new Request('http://localhost/api/recruitment/cv-matching/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: JOB_ID, filters: FILTERS }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.matchCvsToJobWithFilters).not.toHaveBeenCalled();
  });
});
