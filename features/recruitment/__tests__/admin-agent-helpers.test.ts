import { describe, expect, it } from 'vitest';

import {
  buildActivityAdminEvidence,
  buildAdminAgentPrompt,
  buildAnalyticsAdminEvidence,
  buildDashboardAdminEvidence,
  buildEmailAdminEvidence,
  buildOnboardingAdminEvidence,
} from '../components/admin-agent-helpers';
import type {
  EmailLogEntry,
  OnboardingDetailedEntry,
  RecruitmentAnalytics,
  SystemOverview,
} from '../services/admin';

describe('admin Agent evidence helpers', () => {
  it('builds governance dashboard evidence without fake trend claims', () => {
    const overview: SystemOverview = {
      totalUsers: 4,
      usersByRole: [
        { role: 'admin', count: 2 },
        { role: 'ta', count: 1 },
        { role: 'manager', count: 1 },
      ],
      totalCandidates: 8,
      totalJobs: 5,
      totalCvsInPool: 12,
      totalInterviews: 3,
      recentActivity: [
        {
          id: 'activity-1',
          userId: 'user-1',
          action: 'delete_cv',
          entityType: 'cv',
          entityId: 'cv-1',
          details: 'Deleted duplicate CV',
          createdAt: new Date('2026-06-20T10:00:00Z'),
          userName: 'System Admin',
          userEmail: 'admin@capgemini.com',
        },
      ],
    };

    const evidence = buildDashboardAdminEvidence(overview);

    expect(evidence.metrics[0]).toMatchObject({
      label: 'Users',
      value: '4',
    });
    expect(evidence.riskFlags).toContain('2 admin users should be reviewed for least-privilege access.');
    expect(evidence.riskFlags.join(' ')).toContain('destructive action');
  });

  it('marks analytics measurement gaps and bottleneck risks', () => {
    const analytics: RecruitmentAnalytics = {
      pipelineFunnel: {
        new: 0,
        ta_screening: 0,
        ta_interview: 8,
        ta_accepted: 0,
        ta_rejected: 4,
        manager_interview: 0,
        manager_accepted: 0,
        manager_rejected: 0,
        hr_interview: 0,
        hr_accepted: 0,
        hr_rejected: 0,
        hired: 1,
      },
      hiringRate: 8,
      rejectionRate: 31,
      candidatesPerJob: [{ jobTitle: 'Full Stack Developer', count: 9 }],
      interviewsPerStage: [],
      monthlyHiringTrend: [
        { month: 'Jan 2026', hired: 0, rejected: 0 },
        { month: 'Feb 2026', hired: 1, rejected: 1 },
      ],
      averageTimeToHire: null,
      topRecruiters: [],
    };

    const evidence = buildAnalyticsAdminEvidence(analytics);

    expect(evidence.observedFacts.join(' ')).toContain('Pipeline total is 13');
    expect(evidence.missingEvidence).toContain('Average time-to-hire is not available in the current analytics source.');
    expect(evidence.riskFlags).toContain('Rejection rate is higher than hiring rate.');
    expect(evidence.riskFlags.join(' ')).toContain('Ta Interview may be a bottleneck');
  });

  it('builds onboarding anomaly and communication delivery prompts', () => {
    const onboarding: OnboardingDetailedEntry[] = [
      {
        candidateId: 'candidate-1',
        candidateName: 'Amina Trabelsi',
        candidateEmail: '',
        candidatePhone: null,
        candidateStage: 'hired',
        jobTitle: 'Consultant',
        totalTasks: 0,
        completedTasks: 0,
        hiredAt: new Date('2026-06-19T10:00:00Z'),
        cvSkills: [],
        cvLanguages: [],
        cvEducation: [],
        cvExperiences: [],
        cvSummary: null,
        tasks: [],
      },
    ];
    const emails: EmailLogEntry[] = [
      {
        id: 'email-1',
        toEmail: 'candidate@example.com',
        toName: 'Candidate',
        subject: 'Interview invite',
        body: 'Body',
        interviewId: null,
        candidateStage: null,
        status: 'failed',
        createdAt: new Date('2026-06-20T10:00:00Z'),
        sentByName: 'TA',
        sentByEmail: 'ta@capgemini.com',
      },
    ];

    const onboardingEvidence = buildOnboardingAdminEvidence(onboarding);
    const emailEvidence = buildEmailAdminEvidence(emails);
    const prompt = buildAdminAgentPrompt({
      task: 'Review delivery risks',
      summary: emailEvidence,
    });

    expect(onboardingEvidence.riskFlags).toContain('1 hired candidate without an onboarding checklist.');
    expect(emailEvidence.riskFlags).toContain('1 failed email requires delivery review.');
    expect(prompt).toContain('Observed admin facts:');
    expect(prompt).toContain('Missing operational evidence:');
    expect(prompt).toContain('separate Observed from Sources, Inferred / Recommended, and Source Limits');
  });

  it('summarizes activity audit rows with actor and destructive-action risk', () => {
    const evidence = buildActivityAdminEvidence([
      {
        id: 'activity-1',
        action: 'delete_candidate',
        entityType: 'candidate',
        entityId: 'candidate-1',
        details: 'Removed duplicate candidate',
        createdAt: new Date('2026-06-20T10:00:00Z'),
        userName: 'System Admin',
        userEmail: 'admin@capgemini.com',
        candidateStage: 'ta_rejected',
      },
    ]);

    expect(evidence.metrics[0]).toMatchObject({
      label: 'Activity rows',
      value: '1',
    });
    expect(evidence.riskFlags).toContain('1 destructive action should be reviewed.');
    expect(evidence.observedFacts.join(' ')).toContain('1 distinct actor');
  });
});
