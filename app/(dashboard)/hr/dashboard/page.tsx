import { getDashboardStatsAction, getTodayInterviewScheduleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { DashboardView } from '@/features/hr/components/dashboard-view';

export default async function HRDashboardPage() {
  await requireRole(['hr', 'admin']);
  const [stats, interviews] = await Promise.all([
    getDashboardStatsAction(),
    getTodayInterviewScheduleAction()
  ]);

  // Derived stats for HR
  // Assuming stageBreakdown has keys like 'hr_interview', 'hr_accepted'
  const toReviewCount = stats.stageBreakdown['hr_interview'] || 0;
  const acceptedCount = stats.stageBreakdown['hr_accepted'] || 0;

  return (
    <DashboardView 
      stats={stats}
      interviews={interviews}
      toReviewCount={toReviewCount}
      acceptedCount={acceptedCount}
    />
  );
}
