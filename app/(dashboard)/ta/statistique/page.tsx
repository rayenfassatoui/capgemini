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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Statistics
        </h1>
        <p className="text-muted-foreground mt-1">
          Recruitment analytics and insights
        </p>
      </div>
      <StatisticsCharts
        cvStats={cvStats}
        jobsStats={jobsStats}
        insights={insights}
      />
    </div>
  );
}
