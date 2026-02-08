import { getCandidatesByStageAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { HRCandidatesClient } from '@/features/recruitment/components/hr-candidates-client';

export default async function HRCandidatesPage() {
  await requireRole(['hr', 'admin']);
  const candidates = await getCandidatesByStageAction(['manager_accepted', 'hr_interview', 'hr_accepted', 'hr_rejected', 'hired']);
  return <HRCandidatesClient initialCandidates={candidates} />;
}
