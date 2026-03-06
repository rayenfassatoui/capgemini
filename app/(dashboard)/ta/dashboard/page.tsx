import { getDashboardStatsAction, getTodayInterviewScheduleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import type { DashboardStats, TodayInterview } from '@/features/recruitment/types';
import { TADashboardClient } from '@/features/recruitment/components/ta-dashboard-client';

export default async function TADashboardPage() {
  await requireRole(['ta', 'admin']);
  
  // Parallel data fetching
  const [statsData, scheduleData] = await Promise.allSettled([
    getDashboardStatsAction(),
    getTodayInterviewScheduleAction(),
  ]);

  // Handle potential errors or empty states from actions
  const stats: DashboardStats =
    statsData.status === 'fulfilled' && statsData.value
      ? (statsData.value as DashboardStats)
      : {
          totalCandidates: 0,
          totalJobs: 0,
          totalInterviewsToday: 0,
          pendingScreenings: 0,
          stageBreakdown: {} as Record<string, number>,
        };

  const interviews: TodayInterview[] =
    scheduleData.status === 'fulfilled' && Array.isArray(scheduleData.value)
      ? (scheduleData.value as TodayInterview[])
      : [];

  return <TADashboardClient stats={stats} interviews={interviews} />;
}
