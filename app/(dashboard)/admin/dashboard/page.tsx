import { requireRole } from '@/lib/auth';
import { getSystemOverviewAction } from '@/features/recruitment/actions';
import { AdminDashboardClient } from '@/features/recruitment/components/admin-dashboard-client';

export default async function AdminDashboardPage() {
  await requireRole(['admin']);
  const overview = await getSystemOverviewAction().catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Overview</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          High-level metrics and recent platform activity
        </p>
      </div>
      <AdminDashboardClient overview={overview} />
    </div>
  );
}
