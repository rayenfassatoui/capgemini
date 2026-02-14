import {
  getCvPoolStatsAction,
  getJobsStatsAction,
  getSmartInsightsAction,
} from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import type {
  CvPoolStats,
  JobsStats,
  SmartInsights,
} from '@/features/recruitment/types';
import { StatisticsCharts } from '@/features/recruitment/components/statistics-charts';

export default async function StatistiquePage() {
  await requireRole(['ta', 'admin']);

  const [cvStatsResult, jobsStatsResult, insightsResult] =
    await Promise.allSettled([
      getCvPoolStatsAction(),
      getJobsStatsAction(),
      getSmartInsightsAction(),
    ]);

  const cvStats: CvPoolStats | null =
    cvStatsResult.status === 'fulfilled' && cvStatsResult.value
      ? (cvStatsResult.value as CvPoolStats)
      : null;

  const jobsStats: JobsStats | null =
    jobsStatsResult.status === 'fulfilled' && jobsStatsResult.value
      ? (jobsStatsResult.value as JobsStats)
      : null;

  const insights: SmartInsights | null =
    insightsResult.status === 'fulfilled' && insightsResult.value
      ? (insightsResult.value as SmartInsights)
      : null;

  return (
    <StatisticsCharts
      cvStats={cvStats}
      jobsStats={jobsStats}
      insights={insights}
    />
  );
}
