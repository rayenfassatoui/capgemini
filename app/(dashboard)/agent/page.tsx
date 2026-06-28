import { requireRole } from '@/lib/auth';
import { AgentWorkspaceClient } from '@/features/recruitment/components/agent-workspace-client';
import {
  getCvPoolStatsAction,
  getDashboardStatsAction,
  getJobsStatsAction,
  getSmartInsightsAction,
  getUnreadNotificationCountAction,
} from '@/features/recruitment/actions';
import { buildAgentProactiveBriefing } from '@/features/recruitment/services/proactive-agent-briefing';
import type {
  CvPoolStats,
  DashboardStats,
  JobsStats,
  SmartInsights,
  UserRole,
} from '@/features/recruitment/types';

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export default async function AgentPage() {
  const session = await requireRole(['ta', 'manager', 'hr', 'admin']);
  const role = (session.user.role ?? 'ta') as UserRole;
  const userName = session.user.name ?? 'User';
  const canUseTalentAnalytics = role === 'ta' || role === 'admin';

  const [dashboardStatsResult, unreadNotificationCountResult] =
    await Promise.allSettled([
      getDashboardStatsAction(),
      getUnreadNotificationCountAction(),
    ]);

  let cvPoolStats: CvPoolStats | null = null;
  let jobsStats: JobsStats | null = null;
  let smartInsights: SmartInsights | null = null;

  if (canUseTalentAnalytics) {
    const [cvPoolStatsResult, jobsStatsResult, smartInsightsResult] =
      await Promise.allSettled([
        getCvPoolStatsAction(),
        getJobsStatsAction(),
        getSmartInsightsAction(),
      ]);

    cvPoolStats = settledValue(cvPoolStatsResult) as CvPoolStats | null;
    jobsStats = settledValue(jobsStatsResult) as JobsStats | null;
    smartInsights = settledValue(smartInsightsResult) as SmartInsights | null;
  }

  const proactiveBriefing = buildAgentProactiveBriefing({
    role,
    dashboardStats: settledValue(dashboardStatsResult) as DashboardStats | null,
    cvPoolStats,
    jobsStats,
    smartInsights,
    unreadNotificationCount: settledValue(unreadNotificationCountResult),
  });

  return (
    <AgentWorkspaceClient
      role={role}
      userName={userName}
      proactiveBriefing={proactiveBriefing}
    />
  );
}
