import { Suspense } from 'react';
import { getCandidatesByStageAndAssigneeAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { ManagerCandidatesClient } from '@/features/recruitment/components/manager-candidates-client';

export default async function ManagerCandidatesPage() {
  const session = await requireRole(['manager', 'admin']);
  const candidates = await getCandidatesByStageAndAssigneeAction(['manager_interview', 'manager_accepted', 'manager_rejected'], 'assignedManagerId', session.user.id);

  return (
    <div className="space-y-8 p-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Candidates</h1>
        <p className="text-muted-foreground mt-2">
          Review candidates forwarded by Talent Acquisition
        </p>
      </div>

      <Suspense fallback={<div>Loading candidates...</div>}>
        <ManagerCandidatesClient candidates={candidates} />
      </Suspense>
    </div>
  );
}
