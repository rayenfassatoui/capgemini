import { Suspense } from 'react';
import { listCvPoolAction, getCvPoolStatsAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { CvPoolClient } from '@/features/recruitment/components/cv-pool-client';
import { IconLoader2 } from '@tabler/icons-react';

export default async function CvPoolPage() {
  await requireRole(['ta', 'admin']);
  const [cvList, stats] = await Promise.all([
    listCvPoolAction(),
    getCvPoolStatsAction(),
  ]);

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
        <CvPoolClient initialData={cvList} stats={stats} />
      </Suspense>
    </div>
  );
}
