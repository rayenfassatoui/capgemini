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
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/ta/jobs"
          className="inline-flex items-center justify-center rounded-md h-8 px-2.5 text-sm font-medium hover:bg-muted transition-all"
        >
          <IconArrowLeft className="mr-2 size-4" /> Back to Jobs
        </Link>
      </div>

      <JobDetailClient job={job} candidates={candidates} jobId={id} managers={managers} />
    </div>
  );
}
