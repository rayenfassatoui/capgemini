'use client';

import * as React from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconArrowLeft,
  IconPlus,
  IconSend,
  IconCalendar,
  IconEdit,
  IconEye,
  IconBrain,
  IconFileAnalytics,
  IconMessageChatbot,
  IconUsers,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  closeJobAction,
  generateScreeningAction,
  getScreeningAction,
  generateInterviewQuestionsAction,
  getInterviewGuideAction,
  scheduleInterviewAction,
  sendInterviewEmailAction,
  saveInterviewReportAction,
  updateCandidateStageAction,
  updateInterviewQuestionsAction,
  assignManagerToCandidateAction,
} from '@/features/recruitment/actions';

import { InlineCvMatching } from '@/features/recruitment/components/match-cvs-dialog';
import { buildAgentPromptHref } from '@/features/recruitment/components/chat/agent-prompts';
import { InterviewAutoPilotGuideView } from '@/features/recruitment/components/interview-autopilot-guide';

import type {
  CandidateStage,
  InterviewStage,
  ScheduleInterviewInput,
  InterviewDecision,
} from '@/features/recruitment/types';

// ---------- Types (Locally defined as they are not in types.ts) ----------

interface ScreeningData {
  score: number;
  mustMatchScore: number;
  niceMatchScore: number;
  aiSummary?: string | null;
  matchedMustHave?: string[];
  gaps?: string[];
  [key: string]: unknown;
}

interface Job {
  id: string;
  title: string;
  description: string;
  seniority: string;
  businessUnit?: string | null;
  status: string;
  mustHave: string[];
  niceToHave: string[];
  createdAt: Date;
}

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  stage: CandidateStage;
  cvId: string;
  jobId: string;
  matchScore?: number | null;
  interviews?: Interview[];
  screening?: Screening;
}

interface Interview {
  id: string;
  stage: InterviewStage;
  scheduledDate: Date | string; // Handle both string/date coming from DB
  scheduledTime: string;
  meetLink: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  interviewerId?: string;
  createdAt: Date;
}

interface Screening {
  id: string;
  score: number;
  aiSummary: string;
  mustMatchScore: number;
  niceMatchScore: number;
}

// ---------- Component ----------

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

const JOB_DETAIL_TABS = ['overview', 'cv-matching', 'interviews', 'candidates'] as const;

type JobDetailTab = (typeof JOB_DETAIL_TABS)[number];

function getJobDetailTab(value: string | null): JobDetailTab {
  return JOB_DETAIL_TABS.includes(value as JobDetailTab)
    ? (value as JobDetailTab)
    : 'overview';
}

interface JobDetailClientProps {
  job: Job;
  candidates: Candidate[];
  jobId: string;
  managers: UserListItem[];
}

const ACTIVE_CANDIDATE_STAGES: CandidateStage[] = [
  'new',
  'ta_screening',
  'ta_interview',
  'ta_accepted',
  'manager_interview',
  'manager_accepted',
  'hr_interview',
];

export function JobDetailClient({
  job,
  candidates: initialCandidates,
  jobId,
  managers,
}: JobDetailClientProps) {
  const [candidates, setCandidates] = React.useState<Candidate[]>(initialCandidates);
  const [jobStatus, setJobStatus] = React.useState(job.status);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = getJobDetailTab(searchParams.get('tab'));
  const highlightedCandidateId = searchParams.get('candidateId');

  // Sync state with props when server revalidates
  React.useEffect(() => {
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  React.useEffect(() => {
    setJobStatus(job.status);
  }, [job.status]);

  React.useEffect(() => {
    if (activeTab !== 'candidates' || !highlightedCandidateId) return;

    const selector = `[data-candidate-id="${highlightedCandidateId}"]`;
    const candidateCard = document.querySelector(selector);
    if (candidateCard instanceof HTMLElement) {
      candidateCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeTab, highlightedCandidateId]);

  // Dialog States
  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>('');
  const [scheduleDate, setScheduleDate] = React.useState('');
  const [scheduleTime, setScheduleTime] = React.useState('');
  const [meetLink, setMeetLink] = React.useState('');

  const [screeningDialogOpen, setScreeningDialogOpen] = React.useState(false);
  const [viewScreeningData, setViewScreeningData] = React.useState<ScreeningData | null>(null);

  const [questionsDialogOpen, setQuestionsDialogOpen] = React.useState(false);
  const [currentQuestions, setCurrentQuestions] = React.useState<string[]>([]);
  const [currentGuideId, setCurrentGuideId] = React.useState<string>('');

  const [autoPilotDialogOpen, setAutoPilotDialogOpen] = React.useState(false);
  const [autoPilotCandidateId] = React.useState<string>('');

  const [reportDialogOpen, setReportDialogOpen] = React.useState(false);
  const [reportInterviewId, setReportInterviewId] = React.useState('');
  const [reportNotes, setReportNotes] = React.useState('');
  const [reportScore, setReportScore] = React.useState<number>(0);
  const [reportDecision, setReportDecision] = React.useState<InterviewDecision>('pending');
  const [reportOverall, setReportOverall] = React.useState('');
  const [selectedManagerIds, setSelectedManagerIds] = React.useState<Record<string, string>>({});
  const [assigningManager, setAssigningManager] = React.useState<string | null>(null);

  // ---------- Helpers ----------

  const getStageBadgeClass = (stage: CandidateStage) => {
    switch (stage) {
      case 'new': return 'bg-gray-500 hover:bg-gray-600 text-white border-transparent';
      case 'ta_screening': return 'bg-blue-500 hover:bg-blue-600 text-white border-transparent';
      case 'ta_interview': return 'bg-indigo-500 hover:bg-indigo-600 text-white border-transparent';
      case 'ta_accepted': return 'bg-green-500 hover:bg-green-600 text-white border-transparent';
      case 'ta_rejected': return 'bg-red-500 hover:bg-red-600 text-white border-transparent';
      case 'hired': return 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent';
      default:
        if (stage.startsWith('manager')) return 'bg-purple-500 hover:bg-purple-600 text-white border-transparent';
        if (stage.startsWith('hr')) return 'bg-orange-500 hover:bg-orange-600 text-white border-transparent';
        return '';
    }
  };

  // ---------- Actions ----------

  const handleGenerateScreening = async (candidateId: string) => {
    try {
      toast.info('Generating screening...');
      await generateScreeningAction(candidateId, jobId);
      toast.success('Screening generated');
      // Force refresh or update local state would be ideal
    } catch {
      toast.error('Failed to generate screening');
    }
  };

  const handleViewScreening = async (candidateId: string) => {
    try {
      const screening = await getScreeningAction(candidateId, jobId);
      if (screening) {
        setViewScreeningData(screening);
        setScreeningDialogOpen(true);
      } else {
        toast.error('No screening found');
      }
    } catch {
      toast.error('Failed to fetch screening');
    }
  };

  const [isGeneratingQuestions, setIsGeneratingQuestions] = React.useState(false);

  const handleManageQuestions = async (candidateId: string) => {
    try {
      const guide = await getInterviewGuideAction(candidateId, jobId, 'ta');
      if (guide) {
        setCurrentQuestions(guide.questions || []);
        setCurrentGuideId(guide.id);
        setQuestionsDialogOpen(true);
      } else {
        setIsGeneratingQuestions(true);
        const loadingToastId = toast.loading('Generating AI Questions (this might take a few seconds)...');
        try {
          await generateInterviewQuestionsAction(candidateId, jobId, 'ta');
          const newGuide = await getInterviewGuideAction(candidateId, jobId, 'ta');
          if (newGuide) {
            setCurrentQuestions(newGuide.questions || []);
            setCurrentGuideId(newGuide.id);
            setQuestionsDialogOpen(true);
            toast.success('Questions AI Generated', { id: loadingToastId });
          } else {
            toast.error('Failed to retrieve generated questions', { id: loadingToastId });
          }
        } catch {
          toast.error('Failed to generate AI questions', { id: loadingToastId });
        } finally {
          setIsGeneratingQuestions(false);
        }
      }
    } catch {
      toast.error('Failed to fetch questions');
    }
  };

  const handleUpdateQuestions = async () => {
    try {
      await updateInterviewQuestionsAction(currentGuideId, currentQuestions);
      setQuestionsDialogOpen(false);
      toast.success('Questions updated');
    } catch {
      toast.error('Failed to update questions');
    }
  };

  const handleScheduleInterview = async () => {
    if (!selectedCandidateId || !scheduleDate || !scheduleTime) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      const input: ScheduleInterviewInput = {
        candidateId: selectedCandidateId,
        jobId,
        stage: 'ta',
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
        meetLink,
      };

      await scheduleInterviewAction(input);
      setScheduleDialogOpen(false);
      toast.success('Interview scheduled');
      setScheduleDate('');
      setScheduleTime('');
      setMeetLink('');
      setSelectedCandidateId('');
    } catch {
      toast.error('Failed to schedule interview');
    }
  };

  const handleSendEmail = async (interview: Interview, candidate: Candidate) => {
    try {
      // Need to format date back to readable or keep as is
      let dateStr = interview.scheduledDate.toString();
      if (interview.scheduledDate instanceof Date) {
        dateStr = interview.scheduledDate.toLocaleDateString();
      }

      await sendInterviewEmailAction({
        interviewId: interview.id,
        candidateEmail: candidate.email,
        candidateName: candidate.fullName,
        jobTitle: job.title,
        scheduledDate: dateStr,
        scheduledTime: interview.scheduledTime,
        meetLink: interview.meetLink,
        interviewerName: 'TA Team', // Placeholder
        stage: interview.stage,
      });
      toast.success('Email sent');
    } catch {
      toast.error('Failed to send email');
    }
  };

  const handleUpdateStage = async (candidateId: string, stage: CandidateStage) => {
    try {
      await updateCandidateStageAction(candidateId, stage);
      toast.success(`Candidate moved to ${stage}`);
    } catch {
      toast.error('Failed to update stage');
    }
  };

  const handleOpenReport = (interviewId: string, candidateId: string) => {
    setReportInterviewId(interviewId);
    setSelectedCandidateId(candidateId); // Reuse this state
    setReportDialogOpen(true);
  };

  const handleSaveReport = async () => {
    try {
      await saveInterviewReportAction({
        interviewId: reportInterviewId,
        candidateId: selectedCandidateId,
        stage: 'ta',
        notes: reportNotes,
        score: reportScore,
        decision: reportDecision,
        overallEvaluation: reportOverall,
        candidateAnswers: [], // Add functionality for Q&A pairs if needed
      });
      setReportDialogOpen(false);
      toast.success('Report saved');
    } catch {
      toast.error('Failed to save report');
    }
  };

  const handleCloseJob = async () => {
    try {
      await closeJobAction(jobId);
      setJobStatus('closed');
      toast.success('Job closed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close job';
      toast.error(message);
    }
  };

  const handleAssignManager = async (candidateId: string) => {
    const managerId = selectedManagerIds[candidateId];
    if (!managerId) {
      toast.error('Please select a manager first');
      return;
    }
    try {
      setAssigningManager(candidateId);
      await assignManagerToCandidateAction(candidateId, managerId);
      toast.success('Candidate assigned to manager');
    } catch {
      toast.error('Failed to assign manager');
    } finally {
      setAssigningManager(null);
    }
  };

  // Derive all interviews from candidates
  const allInterviews = React.useMemo(() => {
    const interviews: { interview: Interview; candidate: Candidate }[] = [];
    candidates.forEach((c) => {
      if (c.interviews) {
        c.interviews.forEach((i) => {
          interviews.push({ interview: i, candidate: c });
        });
      }
    });
    return interviews;
  }, [candidates]);

  const scheduledInterviewCount = allInterviews.filter(
    ({ interview }) => interview.status === 'scheduled'
  ).length;
  const inProgressCandidates = candidates.filter((candidate) =>
    ACTIVE_CANDIDATE_STAGES.includes(candidate.stage)
  );
  const canCloseJob =
    jobStatus === 'open' && scheduledInterviewCount === 0 && inProgressCandidates.length === 0;

  let closeBlockedReason = '';
  if (jobStatus !== 'open') {
    closeBlockedReason = 'This job is already closed.';
  } else if (scheduledInterviewCount > 0) {
    closeBlockedReason =
      `${scheduledInterviewCount} scheduled interview(s) must be completed or cancelled first.`;
  } else if (inProgressCandidates.length > 0) {
    const names = inProgressCandidates.map((c) => c.fullName).join(', ');
    closeBlockedReason =
      `${inProgressCandidates.length} candidate(s) still in progress: ${names}. Accept, reject, or hire them before closing.`;
  }
  const jobContext = `Job "${job.title}" (${job.seniority}${job.businessUnit ? `, ${job.businessUnit}` : ''}). Must-have skills: ${job.mustHave.join(', ') || 'not specified'}. Nice-to-have skills: ${job.niceToHave.join(', ') || 'not specified'}. Current assigned candidates: ${candidates.length}.`;
  const quickActions = [
    {
      title: 'Open CV Matching',
      description: 'Use the built-in matching workflow and assign candidates directly.',
      icon: IconUsers,
      href: `${pathname}?tab=cv-matching`,
      mode: 'Direct workflow',
    },
    {
      title: 'Open Interviews',
      description: 'Jump to interview scheduling, emails, and reports for this job.',
      icon: IconCalendar,
      href: `${pathname}?tab=interviews`,
      mode: 'Direct workflow',
    },
    {
      title: 'Explain matching with Agent',
      description: 'Get ranking rationale, gaps, and screening priorities.',
      icon: IconBrain,
      href: buildAgentPromptHref(`${jobContext} Match the best available CVs to this job. Explain ranking, gaps, and next screening action for each recommended candidate.`),
      mode: 'Agent reasoning',
    },
    {
      title: 'Review requirement with Agent',
      description: 'Tighten ambiguity before screening more candidates.',
      icon: IconFileAnalytics,
      href: buildAgentPromptHref(`${jobContext} Review this job requirement for ambiguity, missing technical criteria, biased wording, and improvements that would make candidate matching more reliable.`),
      mode: 'Agent reasoning',
    },
  ] as const;

  const handleTabChange = (nextTab: string) => {
    const tab = getJobDetailTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
          {closeBlockedReason && (
            <p className="mt-1 text-xs text-muted-foreground">{closeBlockedReason}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={buildAgentPromptHref(`Analyze the current status of job "${job.title}" and recommend the next best TA actions. Include pipeline risks, candidate gaps, and whether this job requirement is ready for matching.`)}>
            <Button variant="outline" size="sm" className="rounded-full">
              <IconMessageChatbot className="mr-2 size-4" />
              Ask Agent
            </Button>
          </Link>
          <Badge variant={jobStatus === 'open' ? 'default' : 'secondary'}>
            {jobStatus}
          </Badge>
          {jobStatus === 'open' && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm" disabled={!canCloseJob}>
                    Close Job
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the job as closed and stop it from being treated as an open position.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleCloseJob}
                  >
                    Close Job
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.title} href={action.href}>
              <Card className="group h-full border-border/70 bg-card/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <Badge variant="outline" className="mb-2 rounded-full text-[10px] uppercase tracking-[0.18em]">
                      {action.mode}
                    </Badge>
                    <CardTitle className="text-sm">{action.title}</CardTitle>
                    <CardDescription className="mt-1 text-xs leading-5">
                      {action.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cv-matching">CV Matching</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="candidates">Pipeline</TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Business Unit</h3>
                  <p>{job.businessUnit || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Seniority</h3>
                  <p>{job.seniority}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                <p className="whitespace-pre-wrap text-sm text-foreground/80 mt-1">
                  {job.description}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Must-Have Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {job.mustHave.map((skill) => (
                    <Badge key={skill} variant="default">{skill}</Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Nice-to-Have Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {job.niceToHave.map((skill) => (
                    <Badge key={skill} variant="outline">{skill}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: CV MATCHING */}
        <TabsContent value="cv-matching" className="mt-6 space-y-4">
          <InlineCvMatching
            jobId={jobId}
            jobMustHave={job.mustHave}
            jobNiceToHave={job.niceToHave}
          />
        </TabsContent>

        {/* TAB 3: PIPELINE */}
        <TabsContent value="candidates" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.length === 0 ? (
              <div className="col-span-full text-center py-10 text-muted-foreground border rounded-lg border-dashed">
                No candidates assigned to this job yet.
              </div>
            ) : (
              candidates.map((candidate) => (
                <Card
                  key={candidate.id}
                  data-candidate-id={candidate.id}
                  className={`flex flex-col transition-colors ${
                    highlightedCandidateId === candidate.id
                      ? 'border-primary shadow-lg shadow-primary/10'
                      : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{candidate.fullName}</CardTitle>
                        <CardDescription>{candidate.email}</CardDescription>
                      </div>
                      <Badge className={getStageBadgeClass(candidate.stage)}>
                        {candidate.stage.replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 py-2">
                    {/* Dynamic content based on stage could go here */}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2 pt-3 border-t">
                    {candidate.stage === 'new' && (
                      <Button size="sm" variant="secondary" className="w-full" onClick={() => handleGenerateScreening(candidate.id)}>
                        Generate Screening
                      </Button>
                    )}

                    {candidate.stage === 'ta_screening' && (
                      <>
                        <Button size="sm" variant="outline" className="w-full mb-2" onClick={() => handleViewScreening(candidate.id)}>
                          <IconEye className="mr-1 size-3" /> View Screening
                        </Button>
                        <div className="flex w-full gap-2 mt-2">
                           <Button size="sm" variant="default" className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStage(candidate.id, 'ta_interview')}>
                             Accept (to Interview)
                           </Button>
                           <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleUpdateStage(candidate.id, 'ta_rejected')}>
                             Reject
                           </Button>
                        </div>
                      </>
                    )}

                    {candidate.stage === 'ta_interview' && (
                      <div className="flex w-full gap-2 mt-2">
                         <Button size="sm" variant="default" className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStage(candidate.id, 'ta_accepted')}>
                           Accept
                         </Button>
                         <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleUpdateStage(candidate.id, 'ta_rejected')}>
                           Reject
                         </Button>
                      </div>
                    )}

                    {candidate.stage === 'ta_accepted' && (
                      <div className="w-full space-y-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={selectedManagerIds[candidate.id] || ''}
                          onChange={(e) => setSelectedManagerIds(prev => ({ ...prev, [candidate.id]: e.target.value }))}
                        >
                          <option value="" disabled>Select a Manager</option>
                          {managers.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                          disabled={!selectedManagerIds[candidate.id] || assigningManager === candidate.id}
                          onClick={() => handleAssignManager(candidate.id)}
                        >
                          {assigningManager === candidate.id ? 'Assigning...' : 'Assign to Manager'}
                        </Button>
                      </div>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* TAB 4: INTERVIEWS */}
        <TabsContent value="interviews" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Interviews</h2>
            <Button onClick={() => setScheduleDialogOpen(true)}>
              <IconCalendar className="mr-2" /> Schedule Interview
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.filter(c => ['ta_interview', 'manager_interview', 'hr_interview'].includes(c.stage)).length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No active candidates for interview. Go to Pipeline to accept candidates into the interview stage.
                     </TableCell>
                  </TableRow>
                ) : (
                  candidates.filter(c => ['ta_interview', 'manager_interview', 'hr_interview'].includes(c.stage)).map(candidate => {
                    const interview = candidate.interviews?.find(i => i.status === 'scheduled') || candidate.interviews?.[0];
                    const isScheduled = !!interview;
                    
                    return (
                      <TableRow key={candidate.id}>
                        <TableCell>
                          <div className="font-medium">{candidate.fullName}</div>
                          <div className="text-xs text-muted-foreground">{candidate.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-[10px]">{candidate.stage.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>
                           {isScheduled ? (
                              `${typeof interview.scheduledDate === 'string' ? interview.scheduledDate : (interview.scheduledDate instanceof Date ? interview.scheduledDate.toLocaleDateString() : '')} at ${interview.scheduledTime}`
                           ) : (
                              <span className="text-muted-foreground">Not Scheduled</span>
                           )}
                        </TableCell>
                        <TableCell>
                          {isScheduled && interview.meetLink && (
                            <a href={interview.meetLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                              Link <IconArrowLeft className="rotate-135 size-3" />
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isScheduled && interview.status === 'completed' ? 'default' : 'secondary'}>
                            {isScheduled ? interview.status : 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                           <div className="flex justify-end gap-2">
                             <Button size="sm" variant="outline" onClick={() => handleManageQuestions(candidate.id)} title="AI Interview Questions" disabled={isGeneratingQuestions}>
                               <IconBrain className="mr-2 size-4" /> Questions
                             </Button>
                             {!isScheduled ? (
                                <Button size="sm" variant="default" onClick={() => {
                                      setSelectedCandidateId(candidate.id);
                                      setScheduleDialogOpen(true);
                                 }}>
                                  <IconCalendar className="mr-2 size-4" /> Schedule
                                </Button>
                             ) : (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => handleSendEmail(interview, candidate)} title="Send Email">
                                    <IconSend className="size-4 mr-2" /> Email
                                  </Button>
                                  <Button size="sm" variant="default" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => handleOpenReport(interview.id, candidate.id)} title="Fill Report">
                                    <IconEdit className="size-4 mr-2" /> Report
                                  </Button>
                                </>
                             )}
                           </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOGS */}

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
            <DialogDescription>Set up a time for the candidate interview.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Candidate</label>
              <select 
                className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring opacity-80 cursor-not-allowed"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                disabled
              >
                <option value="" disabled>Select a candidate</option>
                {candidates
                  .filter(c => 
                    c.stage === 'ta_accepted' || 
                    c.stage === 'ta_screening' ||
                    c.stage === 'ta_interview' ||
                    c.stage === 'manager_accepted' ||
                    c.stage === 'manager_interview' ||
                    c.stage === 'hr_accepted' ||
                    c.stage === 'hr_interview'
                  )
                  .map(c => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.stage.replace(/_/g, ' ')})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="text-sm font-medium">Date</label>
                 <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                 <label className="text-sm font-medium">Time</label>
                 <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium">Google Meet Link</label>
               <Input placeholder="https://meet.google.com/..." value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleScheduleInterview}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Screening Dialog */}
      <Dialog open={screeningDialogOpen} onOpenChange={setScreeningDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Screening Results</DialogTitle>
          </DialogHeader>
          {viewScreeningData && (
            <div className="space-y-4">
               <div className="grid grid-cols-3 gap-4">
                 <div className="p-4 rounded-lg bg-muted text-center">
                    <div className="text-2xl font-bold">{viewScreeningData.score}/100</div>
                    <div className="text-xs text-muted-foreground">Overall Score</div>
                 </div>
                 <div className="p-4 rounded-lg bg-muted text-center">
                    <div className="text-2xl font-bold">{viewScreeningData.mustMatchScore}%</div>
                    <div className="text-xs text-muted-foreground">Must-Have Match</div>
                 </div>
                 <div className="p-4 rounded-lg bg-muted text-center">
                    <div className="text-2xl font-bold">{viewScreeningData.niceMatchScore}%</div>
                    <div className="text-xs text-muted-foreground">Nice-to-Have Match</div>
                 </div>
               </div>
               
               {viewScreeningData.aiSummary && (
                 <div>
                   <h4 className="font-semibold mb-2">AI Summary</h4>
                   <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">{viewScreeningData.aiSummary}</p>
                 </div>
               )}

               <div>
                 <h4 className="font-semibold mb-2">Analysis</h4>
                 <div className="space-y-2">
                   {(viewScreeningData.matchedMustHave?.length ?? 0) > 0 && (
                     <div className="flex flex-wrap gap-2">
                       <span className="text-sm font-medium mr-2">Matched:</span>
                       {viewScreeningData.matchedMustHave!.map((m: string) => <Badge key={m} variant="secondary">{m}</Badge>)}
                     </div>
                   )}
                   {(viewScreeningData.gaps?.length ?? 0) > 0 && (
                     <div className="flex flex-wrap gap-2">
                       <span className="text-sm font-medium mr-2">Gaps:</span>
                       {viewScreeningData.gaps!.map((m: string) => <Badge key={m} variant="destructive">{m}</Badge>)}
                     </div>
                   )}
                 </div>
               </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Questions Dialog */}
      <Dialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Interview Questions</DialogTitle>
            <DialogDescription>Review and edit generated questions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {currentQuestions.map((q, idx) => (
              <div key={idx} className="flex gap-2">
                <div className="font-mono text-muted-foreground text-sm pt-2">{idx + 1}.</div>
                <Textarea 
                  value={q} 
                  onChange={(e) => {
                    const newQs = [...currentQuestions];
                    newQs[idx] = e.target.value;
                    setCurrentQuestions(newQs);
                  }}
                  className="min-h-[60px]"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setCurrentQuestions([...currentQuestions, ''])}>
              <IconPlus className="mr-2 size-4" /> Add Question
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateQuestions}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Pilot Guide Dialog */}
      <Dialog open={autoPilotDialogOpen} onOpenChange={setAutoPilotDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconBrain className="h-5 w-5 text-primary" />
              AI Interview Auto-Pilot Guide
            </DialogTitle>
            <DialogDescription>
              Hyper-personalized interview guide with advanced technical, gap mitigation, and behavioral questions.
            </DialogDescription>
          </DialogHeader>
          {autoPilotCandidateId && (
            <InterviewAutoPilotGuideView
              candidateId={autoPilotCandidateId}
              jobId={job.id}
              stage="ta"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Interview Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
               <label className="text-sm font-medium">Overall Evaluation</label>
               <Textarea 
                 placeholder="Summarize the interview..." 
                 value={reportOverall}
                 onChange={(e) => setReportOverall(e.target.value)}
                 className="min-h-[100px]"
               />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Score (0-100)</label>
                <Input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={reportScore} 
                  onChange={(e) => setReportScore(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Decision</label>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={reportDecision === 'accepted'} onChange={() => setReportDecision('accepted')} />
                    <span className="text-sm text-green-600 font-medium">Accept</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={reportDecision === 'rejected'} onChange={() => setReportDecision('rejected')} />
                    <span className="text-sm text-red-600 font-medium">Reject</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
               <label className="text-sm font-medium">Detailed Notes</label>
               <Textarea 
                 placeholder="Detailed notes..." 
                 value={reportNotes}
                 onChange={(e) => setReportNotes(e.target.value)}
                 className="min-h-[150px]"
               />
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
             <Button onClick={handleSaveReport}>Save Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
