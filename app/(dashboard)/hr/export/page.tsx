import { requireRole } from '@/lib/auth';
import { HRExportClient } from '@/features/recruitment/components/hr-export-client';

export default async function HRExportPage() {
  await requireRole(['hr', 'admin']);
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
        <p className="text-muted-foreground">Human Resources reporting</p>
      </div>
      <HRExportClient />
    </div>
  );
}
