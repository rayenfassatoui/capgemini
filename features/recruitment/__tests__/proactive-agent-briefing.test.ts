import { describe, expect, it } from 'vitest';

import { buildAgentProactiveBriefing } from '../services/proactive-agent-briefing';
import type { CandidateStage, DashboardStats, SmartInsights } from '../types';

const emptyStageBreakdown: Record<CandidateStage, number> = {
  new: 0,
  ta_screening: 0,
  ta_interview: 0,
  ta_accepted: 0,
  ta_rejected: 0,
  manager_interview: 0,
  manager_accepted: 0,
  manager_rejected: 0,
  hr_interview: 0,
  hr_accepted: 0,
  hr_rejected: 0,
  hired: 0,
};

const dashboardStats: DashboardStats = {
  totalCandidates: 12,
  totalJobs: 5,
  totalInterviewsToday: 1,
  pendingScreenings: 4,
  stageBreakdown: {
    ...emptyStageBreakdown,
    new: 4,
    ta_screening: 6,
    manager_interview: 2,
  },
};

const smartInsights: SmartInsights = {
  mostDemandedJobProfiles: [{ title: 'Full-stack Engineer', count: 5 }],
  mostCommonCvSkills: [{ skill: 'React', count: 3 }],
  skillGapAnalysis: [
    { skill: 'React', demand: 4, supply: 3 },
    { skill: 'Node.js', demand: 8, supply: 2 },
  ],
  pipelineFunnel: dashboardStats.stageBreakdown,
};

describe('proactive agent briefing', () => {
  it('turns live recruitment stats into priority cards and agent prompts', () => {
    const briefing = buildAgentProactiveBriefing({
      role: 'ta',
      dashboardStats,
      cvPoolStats: {
        totalCvs: 7,
        topSkills: [{ skill: 'React', count: 3 }],
        languageDistribution: [{ language: 'French', count: 4 }],
        uploadTrend: [{ date: '2026-06-28', count: 2 }],
      },
      jobsStats: {
        totalJobs: 5,
        bySeniority: [{ seniority: 'senior', count: 3 }],
        byStatus: [{ status: 'open', count: 5 }],
        byBusinessUnit: [{ unit: 'Digital', count: 5 }],
        topSkillsDemand: [{ skill: 'Node.js', count: 8 }],
      },
      smartInsights,
      unreadNotificationCount: 2,
    });

    expect(briefing.headline).toContain('Screening backlog');
    expect(briefing.summary).toContain('role-scoped page data');
    expect(briefing.cards.map((card) => card.id)).toEqual(
      expect.arrayContaining([
        'pending-screenings',
        'largest-pipeline-stage',
        'largest-skill-gap',
      ]),
    );
    expect(briefing.cards.find((card) => card.id === 'largest-skill-gap')).toMatchObject({
      title: 'Node.js demand is ahead of supply',
      metric: '+6 gap',
      priorityLabel: 'Skill gap',
    });
    expect(briefing.suggestedPrompts[0]).toContain('new stage');
  });

  it('falls back to a tool-first audit when page preload data is unavailable', () => {
    const briefing = buildAgentProactiveBriefing({ role: 'admin' });

    expect(briefing.cards).toHaveLength(1);
    expect(briefing.cards[0]).toMatchObject({
      id: 'proactive-live-audit',
      metric: 'Fresh tools required',
    });
    expect(briefing.suggestedPrompts[0]).toContain('proactive admin audit');
  });
});
