import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  logActivity: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
  },
}));

vi.mock('@/features/recruitment/services/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('@/features/recruitment/services/activity-log', () => ({
  logActivity: mocks.logActivity,
}));

vi.mock('@/features/recruitment/services/notifications', () => ({
  notifyStageChange: vi.fn(),
}));

import { assignCvToJob } from '../services/candidates';
import { getJob } from '@/features/recruitment/services/jobs';

function selectResult(rows: readonly object[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue({ rows: [{ id: 'candidate-1' }] });
  vi.mocked(getJob).mockReset();
  vi.mocked(getJob).mockResolvedValue({
    id: 'job-1',
    title: 'Cloud Architect',
    description: 'Design and operate secure cloud platforms.',
    mustHave: ['Cloud architecture'],
    niceToHave: [],
    seniority: 'Senior',
    businessUnit: 'Cloud',
    status: 'open',
    isTemplate: false,
    createdBy: 'user-1',
    createdAt: new Date('2026-07-22T08:00:00.000Z'),
    updatedAt: new Date('2026-07-22T08:00:00.000Z'),
  });
  mocks.logActivity.mockReset();
  mocks.logActivity.mockResolvedValue(undefined);
  mocks.select.mockReset();
  mocks.select
    .mockReturnValueOnce(
      selectResult([
        {
          id: 'cv-1',
          extractedName: 'Matched Candidate',
          extractedEmail: 'candidate@example.com',
          extractedPhone: null,
        },
      ]),
    )
    .mockReturnValueOnce(selectResult([]))
    .mockReturnValueOnce(
      selectResult([
        {
          id: 'candidate-1',
          fullName: 'Matched Candidate',
          stage: 'ta_interview',
        },
      ]),
    );
});

describe('assignCvToJob', () => {
  it('atomically creates the candidate and assignment history at ta_interview', async () => {
    const candidate = await assignCvToJob('cv-1', 'job-1', 'user-1');

    expect(candidate).toMatchObject({
      id: 'candidate-1',
      stage: 'ta_interview',
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    const query = mocks.execute.mock.calls[0]?.[0];
    expect(query).toBeDefined();
    const compiled = new PgDialect().sqlToQuery(query);

    expect(compiled.sql).toContain('WITH created AS');
    expect(compiled.sql).toContain('stage_history AS');
    expect(compiled.sql.split("'ta_interview'::candidate_stage")).toHaveLength(3);
    expect(compiled.sql).toContain("'CV assigned directly to interview'");
    expect(mocks.logActivity).toHaveBeenCalledWith(
      'user-1',
      'candidate_assigned',
      'candidate',
      'candidate-1',
      'Matched Candidate assigned to Cloud Architect',
    );
  });
});
