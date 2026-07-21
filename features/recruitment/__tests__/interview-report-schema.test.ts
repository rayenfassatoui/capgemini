import { describe, expect, it } from 'vitest';
import { interviewReportSchema } from '../schemas';

const BASE_REPORT = {
  interviewId: '11111111-1111-4111-8111-111111111111',
  candidateId: '22222222-2222-4222-8222-222222222222',
  stage: 'manager' as const,
  notes: 'Observed evidence from the completed interview.',
  candidateAnswers: [],
  overallEvaluation: 'Meets the role requirements.',
  score: 82,
};

describe('interview report decision validation', () => {
  it.each(['accepted', 'rejected'] as const)('accepts a terminal %s decision', (decision) => {
    expect(
      interviewReportSchema.safeParse({ ...BASE_REPORT, decision }).success
    ).toBe(true);
  });

  it('rejects a pending report because it cannot advance a completed interview', () => {
    const result = interviewReportSchema.safeParse({
      ...BASE_REPORT,
      decision: 'pending',
    });

    expect(result.success).toBe(false);
  });
  it('rejects a report without interview evidence', () => {
    const result = interviewReportSchema.safeParse({
      ...BASE_REPORT,
      notes: '  ',
      overallEvaluation: null,
      decision: 'accepted',
    });

    expect(result.success).toBe(false);
  });

});
