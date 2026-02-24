import { getCandidatesByStageAndAssigneeAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { HRCandidatesClient } from '@/features/recruitment/components/hr-candidates-client';

export default async function HRCandidatesPage() {
  const session = await requireRole(['hr', 'admin']);
  const candidates = await getCandidatesByStageAndAssigneeAction(['hr_interview', 'hr_accepted', 'hr_rejected', 'hired'], 'assignedHrId', session.user.id);
  return <HRCandidatesClient initialCandidates={candidates} />;
}
