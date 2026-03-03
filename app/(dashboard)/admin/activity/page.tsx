import { requireRole } from '@/lib/auth';
import { getActivityLogEnrichedAction } from '@/features/recruitment/actions';
import { AdminActivityClient } from '@/features/recruitment/components/admin-activity-client';

export default async function AdminActivityPage() {
  await requireRole(['admin']);
  const activityLog = await getActivityLogEnrichedAction(100).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Audit trail of all actions performed across the platform
        </p>
      </div>
      <AdminActivityClient activityLog={activityLog ?? []} />
    </div>
  );
}
