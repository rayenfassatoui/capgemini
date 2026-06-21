import { requireRole } from '@/lib/auth';
import { getHiredCandidatesOnboardingDetailedAction } from '@/features/recruitment/actions';
import { AdminOnboardingClient } from '@/features/recruitment/components/admin-onboarding-client';

export default async function AdminOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ candidateId?: string }>;
}) {
  await requireRole(['admin']);
  const candidates = await getHiredCandidatesOnboardingDetailedAction().catch(() => []);
  const { candidateId } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Onboarding Governance
        </h1>
        <p className="text-muted-foreground mt-1">
          Audit checklist coverage, candidate handoff readiness, and onboarding evidence gaps.
        </p>
      </div>
      <AdminOnboardingClient candidates={candidates} initialCandidateId={candidateId ?? null} />
    </div>
  );
}
