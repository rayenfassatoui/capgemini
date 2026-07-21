import { Suspense } from 'react';
import { getCandidatesForCurrentActorAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { ManagerCandidatesClient } from '@/features/recruitment/components/manager-candidates-client';

export default async function ManagerCandidatesPage() {
  await requireRole(['manager', 'admin']);
  const candidates = await getCandidatesForCurrentActorAction([
    'manager_interview',
    'manager_accepted',
    'manager_rejected',
  ]);

  return (
    <div className="relative space-y-8 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col gap-2 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground/90">
          Candidate Review
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl font-light">
          Review and manage the candidates assigned to you. Your decisions shape the team.
        </p>
      </div>

      <Suspense 
        fallback={
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 w-full rounded-xl bg-muted/50 border border-border/50" />
            ))}
          </div>
        }
      >
        <ManagerCandidatesClient candidates={candidates} />
      </Suspense>
    </div>
  );
}
