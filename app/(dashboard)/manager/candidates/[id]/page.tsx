import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { 
  getCandidateAction, 
  getInterviewReportsByCandidateAction, 
  getInterviewGuideAction,
  getInterviewByCandidateAndStageAction
} from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { ManagerCandidateDetailClient } from '@/features/recruitment/components/manager-candidate-detail-client';
import Link from 'next/link';
import { IconArrowLeft } from '@tabler/icons-react';

export default async function ManagerCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['manager', 'admin']);
  const { id } = await params;
  
  // We can't fetch guide without job ID, but we need candidate first to get job ID.
  // So we fetch candidate first.
  const candidate = await getCandidateAction(id).catch(() => null);

  if (!candidate) {
    notFound();
  }

  const [reports, guide, managerInterview] = await Promise.all([
    getInterviewReportsByCandidateAction(id).catch(() => []),
    candidate.jobId ? getInterviewGuideAction(id, candidate.jobId, 'manager').catch(() => null) : null,
    getInterviewByCandidateAndStageAction(id, 'manager').catch(() => null)
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
    <div className="space-y-6 p-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/manager/candidates" className="inline-flex items-center justify-center rounded-md h-8 px-2.5 text-sm font-medium hover:bg-muted transition-all">
            <IconArrowLeft className="mr-2 h-4 w-4" /> Back to Candidates
        </Link>
      </div>

      <ManagerCandidateDetailClient 
        candidate={candidate}
        taReports={taReports}
        interviewGuide={guide}
        currentInterview={currentInterview} 
      />
    </div>
  );
}
