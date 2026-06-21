import { describe, expect, it, vi } from 'vitest';
import type { CandidateStage } from '../types';

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('../services/activity-log', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../services/notifications', () => ({
  notifyStageChange: vi.fn(),
}));

vi.mock('../services/jobs', () => ({
  getJob: vi.fn(),
}));

import {
  CANDIDATE_STAGE_TRANSITIONS,
  isCandidateStageTransitionAllowed,
} from '../services/candidates';

const ALL_STAGES: CandidateStage[] = [
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'ta_rejected',
  'manager_interview',
  'manager_accepted',
  'manager_rejected',
  'hr_interview',
  'hr_accepted',
  'hr_rejected',
  'hired',
];

describe('candidate stage transition rules', () => {
  it('defines transitions for every candidate stage', () => {
    expect(Object.keys(CANDIDATE_STAGE_TRANSITIONS).sort()).toEqual(
      [...ALL_STAGES].sort()
    );
  });

  it('allows expected forward pipeline movement', () => {
    expect(isCandidateStageTransitionAllowed('new', 'ta_screening')).toBe(true);
    expect(isCandidateStageTransitionAllowed('ta_interview', 'ta_accepted')).toBe(true);
    expect(isCandidateStageTransitionAllowed('ta_accepted', 'manager_interview')).toBe(true);
    expect(isCandidateStageTransitionAllowed('manager_accepted', 'hr_interview')).toBe(true);
    expect(isCandidateStageTransitionAllowed('hr_accepted', 'hired')).toBe(true);
  });

  it('allows idempotent updates without creating invalid movement', () => {
    expect(isCandidateStageTransitionAllowed('hr_interview', 'hr_interview')).toBe(true);
  });

  it('blocks unsafe stage jumps', () => {
    expect(isCandidateStageTransitionAllowed('ta_rejected', 'hired')).toBe(false);
    expect(isCandidateStageTransitionAllowed('hired', 'new')).toBe(false);
    expect(isCandidateStageTransitionAllowed('new', 'hr_interview')).toBe(false);
  });
});
