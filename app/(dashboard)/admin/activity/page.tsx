import { requireRole } from '@/lib/auth';
import { getActivityLogEnrichedAction } from '@/features/recruitment/actions';
import { AdminActivityClient } from '@/features/recruitment/components/admin-activity-client';

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ activityId?: string }>;
}) {
  await requireRole(['admin']);
  const activityLog = await getActivityLogEnrichedAction(100).catch(() => []);
  const { activityId } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Activity Audit
        </h1>
        <p className="text-muted-foreground mt-1">
          Source-backed audit trail for entity changes, actor coverage, and governance follow-up.
        </p>
      </div>
      <AdminActivityClient activityLog={activityLog ?? []} initialActivityId={activityId ?? null} />
    </div>
  );
}
