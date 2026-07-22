import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  matchCvsToJobWithFilters: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('@/features/recruitment/services', () => ({
  matchCvsToJobWithFilters: mocks.matchCvsToJobWithFilters,
}));

import { matchCvsToJobWithFiltersAction } from '../actions';

const FILTERS = {
  skills: ['TypeScript'],
  languages: ['English'],
  minPositions: 2,
};

beforeEach(() => {
  mocks.requireRole.mockReset();
  mocks.requireRole.mockResolvedValue({
    user: { id: 'ta-1', role: 'ta' },
  });
  mocks.matchCvsToJobWithFilters.mockReset();
  mocks.matchCvsToJobWithFilters.mockResolvedValue([]);
});

describe('CV matching action latency policy', () => {
  it('returns the initial ranking without requesting AI recommendations', async () => {
    await matchCvsToJobWithFiltersAction('job-1', FILTERS);

    expect(mocks.matchCvsToJobWithFilters).toHaveBeenCalledWith(
      'job-1',
      FILTERS,
      { userId: 'ta-1', role: 'ta' },
      { includeAiRecommendations: false },
    );
  });

});
