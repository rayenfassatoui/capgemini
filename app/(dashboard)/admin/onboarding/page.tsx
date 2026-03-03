import { requireRole } from '@/lib/auth';
import { getHiredCandidatesOnboardingDetailedAction } from '@/features/recruitment/actions';
import { AdminOnboardingClient } from '@/features/recruitment/components/admin-onboarding-client';

export default async function AdminOnboardingPage() {
  await requireRole(['admin']);
  const candidates = await getHiredCandidatesOnboardingDetailedAction().catch(() => []);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Onboarding Overview
        </h1>
        <p className="text-muted-foreground mt-1">
          Track onboarding progress for all hired candidates
        </p>
      </div>
      <AdminOnboardingClient candidates={candidates} />
    </div>
  );
}
