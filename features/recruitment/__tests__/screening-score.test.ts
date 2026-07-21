import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('../services/ai', () => ({
  callOpenRouter: vi.fn(),
  cleanJsonResponse: vi.fn(),
}));

vi.mock('../services/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('../services/candidates', () => ({
  getCandidate: vi.fn(),
  updateCandidateStage: vi.fn(),
}));

import { deriveScreeningScores } from '../services/screening';

describe('screening score derivation', () => {
  it('derives every displayed score from the recognized requirement matches', () => {
    const result = deriveScreeningScores(
      ['React', 'SQL', 'AWS'],
      ['Docker', 'French'],
      ['react', 'SQL', 'Hallucinated skill'],
      ['Docker']
    );

    expect(result).toEqual({
      score: 62,
      mustMatchScore: 67,
      niceMatchScore: 50,
      gaps: ['AWS'],
      matchedMustHave: ['React', 'SQL'],
      matchedNiceToHave: ['Docker'],
    });
  });

  it('does not let duplicate or unknown AI matches inflate the result', () => {
    const result = deriveScreeningScores(
      ['TypeScript', 'PostgreSQL'],
      [],
      ['TypeScript', 'typescript', 'Python'],
      []
    );

    expect(result.score).toBe(50);
    expect(result.mustMatchScore).toBe(50);
    expect(result.matchedMustHave).toEqual(['TypeScript']);
    expect(result.gaps).toEqual(['PostgreSQL']);
  });

  it('does not penalize a job for a requirement category that is empty', () => {
    expect(deriveScreeningScores(['SQL'], [], ['SQL'], [])).toMatchObject({
      score: 100,
      mustMatchScore: 100,
      niceMatchScore: 100,
    });

    expect(deriveScreeningScores([], [], [], [])).toMatchObject({
      score: 100,
      gaps: [],
    });
  });
});
