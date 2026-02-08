import { getCandidateAction, getInterviewReportsByCandidateAction, getInterviewGuideAction, getInterviewByCandidateAndStageAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { HRCandidateDetailClient } from '@/features/recruitment/components/hr-candidate-detail-client';
import { notFound } from 'next/navigation';

export default async function HRCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['hr', 'admin']);
  const { id } = await params;
  const candidate = await getCandidateAction(id);
  
  if (!candidate) {
    notFound();
  }

  const [previousReports, interviewGuide, currentInterview] = await Promise.all([
    getInterviewReportsByCandidateAction(id).catch(() => []),
    candidate.jobId ? getInterviewGuideAction(id, candidate.jobId, 'hr').catch(() => null) : null,
    getInterviewByCandidateAndStageAction(id, 'hr').catch(() => null),
  ]);

  // Filter TA and Manager reports
  const priorReports = Array.isArray(previousReports)
    ? previousReports.filter((r: { stage?: string }) => r.stage === 'ta' || r.stage === 'manager')
    : [];

  return (
    <HRCandidateDetailClient 
      candidate={candidate}
      priorReports={priorReports}
      interviewGuide={interviewGuide}
      currentInterview={currentInterview}
    />
  );
}
