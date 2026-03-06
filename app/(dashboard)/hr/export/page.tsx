import { requireRole } from '@/lib/auth';
import { HRExportClient } from '@/features/recruitment/components/hr-export-client';

export default async function HRExportPage() {
  await requireRole(['hr', 'admin']);
  return (
    <div className="w-full h-full">
      <HRExportClient />
    </div>
  );
}
