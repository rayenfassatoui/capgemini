import { getDashboardStatsAction, getTodayInterviewScheduleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { DashboardContent } from './dashboard-content';

export default async function ManagerDashboardPage() {
  await requireRole(['manager', 'admin']);
  
  const [stats, todayInterviews] = await Promise.all([
    getDashboardStatsAction().catch(() => null),
    getTodayInterviewScheduleAction().catch(() => [])
  ]);

  return <DashboardContent stats={stats} todayInterviews={todayInterviews || []} />;
}
