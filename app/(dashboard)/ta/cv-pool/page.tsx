import { Suspense } from 'react';
import { listCvPoolAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { CvPoolClient } from '@/features/recruitment/components/cv-pool-client';
import { IconLoader2 } from '@tabler/icons-react';

export default async function CvPoolPage() {
  await requireRole(['ta', 'admin']);
  const cvList = await listCvPoolAction();

  // Transform the data to match client component expectations if needed
  // The server action returns the full DB record, we might need to map it if types strictly mismatch
  // but looking at the interfaces, they should align or be compatible enough.
  // We'll pass it directly for now, assuming date serialization works (Next.js handles Date objects in server components to client components mostly fine, but sometimes needs stringifying)
  // Actually, Next.js passes dates as Dates to client components in recent versions, but let's be safe.

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">CV Pool</h1>
        <p className="text-muted-foreground">
          Upload and manage candidate resumes to build your talent pipeline.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex h-[400px] w-full items-center justify-center">
            <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <CvPoolClient initialData={cvList} />
      </Suspense>
    </div>
  );
}
