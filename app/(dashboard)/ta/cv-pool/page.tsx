import { listCvPoolAction, getCvPoolStatsAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { CvPoolClient } from '@/features/recruitment/components/cv-pool-client';


export default async function CvPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewCvId?: string }>;
}) {
  await requireRole(['ta', 'admin']);
  const [cvList, stats] = await Promise.all([
    listCvPoolAction(),
    getCvPoolStatsAction(),
  ]);
  const { reviewCvId } = await searchParams;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">CV Pool</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage candidate resumes to build your talent pipeline.
        </p>
      </div>

      <CvPoolClient
        initialData={cvList}
        stats={stats}
        initialReviewCvId={reviewCvId ?? null}
      />
    </div>
  );
}
