import { listJobsAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import JobsClient from '@/features/recruitment/components/jobs-client';

export default async function JobsPage() {
  await requireRole(['ta', 'admin']);
  const jobs = await listJobsAction();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Jobs</h2>
          <p className="text-muted-foreground">
            Manage job postings and candidate matching
          </p>
        </div>
      </div>
      <JobsClient initialJobs={jobs} />
    </div>
  );
}
