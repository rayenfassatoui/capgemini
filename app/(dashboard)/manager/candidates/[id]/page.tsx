import { notFound } from 'next/navigation';
import { 
  getCandidateAction,
  getCandidateStageHistoryAction,
  getInterviewReportsByCandidateAction,
  getInterviewGuideAction,
  getInterviewByCandidateAndStageAction,
  listUsersByRoleAction,
  getInterviewAutoPilotAction,
  getScreeningAction,
  getJobAction,
} from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { ManagerCandidateDetailClient } from '@/features/recruitment/components/manager-candidate-detail-client';
import { normalizeCandidateStageHistory } from '@/features/recruitment/components/candidate-stage-history-timeline';
import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';

export default async function ManagerCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['manager', 'admin']);
  const { id } = await params;
  
  // We can't fetch guide without job ID, but we need candidate first to get job ID.
  // So we fetch candidate first.
  const candidate = await getCandidateAction(id).catch(() => null);

  if (!candidate) {
    notFound();
  }

  const [reports, guide, managerInterview, hrUsers, autoPilotGuide, screening, job, stageHistoryRecords] = await Promise.all([
    getInterviewReportsByCandidateAction(id).catch(() => []),
    candidate.jobId ? getInterviewGuideAction(id, candidate.jobId, 'manager').catch(() => null) : null,
    getInterviewByCandidateAndStageAction(id, 'manager').catch(() => null),
    listUsersByRoleAction('hr'),
    candidate.jobId ? getInterviewAutoPilotAction(id, candidate.jobId, 'manager').catch(() => null) : null,
    candidate.jobId ? getScreeningAction(id, candidate.jobId).catch(() => null) : null,
    candidate.jobId ? getJobAction(candidate.jobId).catch(() => null) : null,
    getCandidateStageHistoryAction(id).catch(() => []),
  ]);

  // Filter reports for TA stage
  const taReports = Array.isArray(reports) ? reports.filter((r: { stage?: string }) => r.stage === 'ta' || r.stage === 'ta_interview') : [];

  // Map interview to the shape expected by the client component
  const currentInterview = managerInterview ? {
    id: managerInterview.id,
    scheduledDate: managerInterview.scheduledDate,
    scheduledTime: managerInterview.scheduledTime,
    meetLink: managerInterview.meetLink,
    status: managerInterview.status,
  } : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/manager/candidates" className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
          <IconArrowLeft className="size-4" /> Back to Candidates
        </Link>
      </div>

      <ManagerCandidateDetailClient 
        candidate={candidate}
        stageHistory={normalizeCandidateStageHistory(stageHistoryRecords)}
        showStageHistoryActors={session.user.role === 'admin'}
        taReports={taReports}
        interviewGuide={guide}
        currentInterview={currentInterview}
        screening={screening}
        jobTitle={job?.title ?? null}
        hrUsers={hrUsers}
        autoPilotGuide={autoPilotGuide}
      />
    </div>
  );
}
