import { getCandidateAction, getInterviewReportsByCandidateAction, getInterviewGuideAction, getInterviewByCandidateAndStageAction, getInterviewAutoPilotAction, getScreeningAction, getJobAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { HRCandidateDetailClient } from '@/features/recruitment/components/hr-candidate-detail-client';
import { notFound } from 'next/navigation';

import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';
export default async function HRCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['hr', 'admin']);
  const { id } = await params;
  const candidate = await getCandidateAction(id);
  
  if (!candidate) {
    notFound();
  }

  const [previousReports, interviewGuide, currentInterview, autoPilotGuide, screening, job] = await Promise.all([
    getInterviewReportsByCandidateAction(id).catch(() => []),
    candidate.jobId ? getInterviewGuideAction(id, candidate.jobId, 'hr').catch(() => null) : null,
    getInterviewByCandidateAndStageAction(id, 'hr').catch(() => null),
    candidate.jobId ? getInterviewAutoPilotAction(id, candidate.jobId, 'hr').catch(() => null) : null,
    candidate.jobId ? getScreeningAction(id, candidate.jobId).catch(() => null) : null,
    candidate.jobId ? getJobAction(candidate.jobId).catch(() => null) : null,
  ]);

  // Filter TA and Manager reports
  const priorReports = Array.isArray(previousReports)
    ? previousReports.filter((r: { stage?: string }) => r.stage === 'ta' || r.stage === 'manager')
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/hr/candidates" className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
          <IconArrowLeft className="size-4" /> Back to Candidates
        </Link>
      </div>

      <HRCandidateDetailClient 
        candidate={candidate}
        priorReports={priorReports}
        interviewGuide={interviewGuide}
        currentInterview={currentInterview}
        screening={screening}
        jobTitle={job?.title ?? null}
        autoPilotGuide={autoPilotGuide}
      />
    </div>
  );
}
