import { requireRole } from '@/lib/auth';
import { getActivityLogEnrichedAction } from '@/features/recruitment/actions';
import { AdminActivityClient } from '@/features/recruitment/components/admin-activity-client';

export default async function AdminActivityPage() {
  await requireRole(['admin']);
  const activityLog = await getActivityLogEnrichedAction(100).catch(() => []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Activity Log
        </h1>
        <p className="text-muted-foreground mt-1">
          Audit trail of all actions performed across the platform
        </p>
      </div>
      <AdminActivityClient activityLog={activityLog ?? []} />
    </div>
  );
}
