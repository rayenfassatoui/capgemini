import { notFound } from 'next/navigation';
import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';

import { JobDetailClient } from '@/features/recruitment/components/job-detail-client';
import { getJobAction, getCandidatesByJobAction, listUsersByRoleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['ta', 'admin']);
  const { id } = await params;

  // Parallel data fetching
  const [job, candidates, managers] = await Promise.all([
    getJobAction(id),
    getCandidatesByJobAction(id),
    listUsersByRoleAction('manager'),
  ]);

  if (!job) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/ta/jobs"
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <IconArrowLeft className="size-4" /> Back to Jobs
        </Link>
      </div>

      <JobDetailClient job={job} candidates={candidates} jobId={id} managers={managers} />
    </div>
  );
}
