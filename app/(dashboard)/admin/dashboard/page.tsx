import { requireRole } from '@/lib/auth';
import { getSystemOverviewAction } from '@/features/recruitment/actions';
import { AdminDashboardClient } from '@/features/recruitment/components/admin-dashboard-client';

export default async function AdminDashboardPage() {
  await requireRole(['admin']);
  const overview = await getSystemOverviewAction().catch(() => null);

  return (
    <div className="space-y-8 bg-mesh min-h-[calc(100vh-4rem)] p-8 rounded-xl border border-border/50 shadow-sm glass">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-gradient w-fit">
          System Overview
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Real-time insights into your recruitment pipeline and platform activity.
        </p>
      </div>
      
      <div className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-purple-500/20 to-secondary/20 rounded-xl blur-xl opacity-50 -z-10" />
        <AdminDashboardClient overview={overview} />
      </div>
    </div>
  );
}
