import { requireRole } from '@/lib/auth';
import { getHiredCandidatesOnboardingAction } from '@/features/recruitment/actions';
import { AdminOnboardingClient } from '@/features/recruitment/components/admin-onboarding-client';

export default async function AdminOnboardingPage() {
  await requireRole(['admin']);
  const candidates = await getHiredCandidatesOnboardingAction().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Onboarding Overview</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Track onboarding progress for all hired candidates
        </p>
      </div>
      <AdminOnboardingClient candidates={candidates} />
    </div>
  );
}
