import { requireRole } from '@/lib/auth';
import { getGovernanceAuditReportAction } from '@/features/recruitment/actions';
import { AdminGovernanceClient } from '@/features/recruitment/components/admin-governance-client';

export default async function AdminGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(['admin']);
  const filters = await searchParams;
  const report = await getGovernanceAuditReportAction(filters);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Compliance operations
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Governance Center
            </h1>
            <p className="mt-2 text-muted-foreground">
              Review stage movements, AI action confirmations, and activity audit rows from one source-backed control plane.
            </p>
          </div>
        </div>
      </div>

      <AdminGovernanceClient report={report} />
    </div>
  );
}
