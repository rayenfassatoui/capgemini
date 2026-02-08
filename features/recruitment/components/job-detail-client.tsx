'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconArrowLeft,
  IconPlus,
  IconSearch,
  IconSend,
  IconCheck,
  IconX,
  IconFileText,
  IconCalendar,
  IconEdit,
  IconEye,
  IconTrash,
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  matchCvsToJobAction,
  assignCvToJobAction,
  generateScreeningAction,
  getScreeningAction,
  generateInterviewQuestionsAction,
  getInterviewGuideAction,
  scheduleInterviewAction,
  sendInterviewEmailAction,
  saveInterviewReportAction,
  updateCandidateStageAction,
  updateInterviewQuestionsAction,
} from '@/features/recruitment/actions';

import type {
  CvMatchResult,
  CandidateStage,
  InterviewStage,
  ScheduleInterviewInput,
  InterviewReportInput,
  InterviewDecision,
} from '@/features/recruitment/types';

// ---------- Types (Locally defined as they are not in types.ts) ----------

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

interface JobDetailClientProps {
  job: Job;
  candidates: Candidate[];
  jobId: string;
}

export function JobDetailClient({
  job,
  candidates: initialCandidates,
  jobId,
}: JobDetailClientProps) {
  const [candidates, setCandidates] = React.useState<Candidate[]>(initialCandidates);
  const [matchResults, setMatchResults] = React.useState<CvMatchResult[]>([]);
  const [isMatching, setIsMatching] = React.useState(false);

  // Sync state with props when server revalidates
  React.useEffect(() => {
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  // Dialog States
  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>('');
  const [scheduleDate, setScheduleDate] = React.useState('');
  const [scheduleTime, setScheduleTime] = React.useState('');
  const [meetLink, setMeetLink] = React.useState('');

  const [screeningDialogOpen, setScreeningDialogOpen] = React.useState(false);
  const [viewScreeningData, setViewScreeningData] = React.useState<any>(null); // Using any for flexibility with complex JSON

  const [questionsDialogOpen, setQuestionsDialogOpen] = React.useState(false);
  const [currentQuestions, setCurrentQuestions] = React.useState<string[]>([]);
  const [currentGuideId, setCurrentGuideId] = React.useState<string>('');

  const [reportDialogOpen, setReportDialogOpen] = React.useState(false);
  const [reportInterviewId, setReportInterviewId] = React.useState('');
  const [reportNotes, setReportNotes] = React.useState('');
  const [reportScore, setReportScore] = React.useState<number>(0);
  const [reportDecision, setReportDecision] = React.useState<InterviewDecision>('pending');
  const [reportOverall, setReportOverall] = React.useState('');

  // ---------- Helpers ----------

  const getStageColor = (stage: CandidateStage) => {
    if (stage === 'new') return 'secondary'; // gray
    if (stage === 'ta_screening') return 'default'; // blue-ish default
    if (stage === 'ta_interview') return 'outline'; // indigo-ish custom needed? using outline as proxy
    if (stage === 'ta_accepted') return 'default'; // green - need custom class
    if (stage === 'ta_rejected') return 'destructive';
    if (stage.startsWith('manager')) return 'secondary'; // purple proxy
    if (stage.startsWith('hr')) return 'secondary'; // orange proxy
    if (stage === 'hired') return 'default'; // emerald proxy
    return 'outline';
  };

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

  const handleMatchCvs = async () => {
    try {
      setIsMatching(true);
      const results = await matchCvsToJobAction(jobId);
      setMatchResults(results);
      toast.success('CVs matched successfully');
    } catch (error) {
      toast.error('Failed to match CVs');
    } finally {
      setIsMatching(false);
    }
  };

  const handleAssignCv = async (cvId: string) => {
    try {
      const newCandidate = await assignCvToJobAction(cvId, jobId);
      // Optimistic update
      setMatchResults((prev) =>
        prev.map((r) => (r.cvId === cvId ? { ...r, alreadyAssigned: true } : r))
      );
      // We assume the action returns the full candidate object, but strict typing might fail if backend differs.
      // Ideally we re-fetch candidates, but for now we push to list if structure matches
      // Or we just rely on revalidatePath in action triggering a refresh of the page props (which implies a reload).
      // Since this is a client component receiving props, we might not see the update immediately without router.refresh()
      // But revalidatePath on server action usually triggers a client refresh of server components.
      toast.success('Candidate assigned');
    } catch (error) {
      toast.error('Failed to assign candidate');
    }
  };

  const handleGenerateScreening = async (candidateId: string) => {
    try {
      toast.info('Generating screening...');
      await generateScreeningAction(candidateId, jobId);
      toast.success('Screening generated');
      // Force refresh or update local state would be ideal
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to fetch screening');
    }
  };

  const handleGenerateQuestions = async (candidateId: string) => {
    try {
      toast.info('Generating questions...');
      await generateInterviewQuestionsAction(candidateId, jobId, 'ta');
      toast.success('Questions generated');
    } catch (error) {
      toast.error('Failed to generate questions');
    }
  };

  const handleViewQuestions = async (candidateId: string) => {
    try {
      const guide = await getInterviewGuideAction(candidateId, jobId, 'ta');
      if (guide) {
        setCurrentQuestions(guide.questions || []);
        setCurrentGuideId(guide.id);
        setQuestionsDialogOpen(true);
      } else {
        toast.error('No questions guide found');
      }
    } catch (error) {
      toast.error('Failed to fetch questions');
    }
  };

  const handleUpdateQuestions = async () => {
    try {
      await updateInterviewQuestionsAction(currentGuideId, currentQuestions);
      setQuestionsDialogOpen(false);
      toast.success('Questions updated');
    } catch (error) {
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
        scheduledDate: scheduleDate, // format DD/MM/YYYY? Input is YYYY-MM-DD usually. Action expects DD/MM/YYYY.
        scheduledTime: scheduleTime,
        meetLink,
      };
      // Simple date conversion if needed
      if (scheduleDate.includes('-')) {
        const [y, m, d] = scheduleDate.split('-');
        input.scheduledDate = `${d}/${m}/${y}`;
      }

      await scheduleInterviewAction(input);
      setScheduleDialogOpen(false);
      toast.success('Interview scheduled');
      setScheduleDate('');
      setScheduleTime('');
      setMeetLink('');
      setSelectedCandidateId('');
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to send email');
    }
  };

  const handleUpdateStage = async (candidateId: string, stage: CandidateStage) => {
    try {
      await updateCandidateStageAction(candidateId, stage);
      toast.success(`Candidate moved to ${stage}`);
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to save report');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
        <Badge variant={job.status === 'open' ? 'default' : 'secondary'}>
          {job.status}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cv-matching">CV Matching</TabsTrigger>
          <TabsTrigger value="candidates">Pipeline</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
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
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Matched CVs</h2>
            <Button onClick={handleMatchCvs} disabled={isMatching}>
              {isMatching ? <IconSearch className="animate-spin mr-2" /> : <IconSearch className="mr-2" />}
              Match CVs
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Matched Skills</TableHead>
                  <TableHead>Gaps</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No matching results yet. Click "Match CVs" to start.
                    </TableCell>
                  </TableRow>
                ) : (
                  matchResults.map((match) => (
                    <TableRow key={match.cvId}>
                      <TableCell>
                        <div className="font-medium">{match.candidateName}</div>
                        <div className="text-xs text-muted-foreground">{match.candidateEmail}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{match.matchScore}%</span>
                          {/* Simple progress bar representation */}
                          <div className="h-2 w-16 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary" 
                              style={{ width: `${match.matchScore}%` }} 
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {match.matchedMustHave.slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                          {match.matchedMustHave.length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">+{match.matchedMustHave.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {match.gaps.slice(0, 2).map((s) => (
                            <Badge key={s} variant="outline" className="text-destructive border-destructive/20 text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handleAssignCv(match.cvId)}
                          disabled={match.alreadyAssigned}
                        >
                          {match.alreadyAssigned ? (
                            <>
                              <IconCheck className="mr-1 size-3" /> Assigned
                            </>
                          ) : (
                            <>
                              <IconPlus className="mr-1 size-3" /> Assign
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
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
                <Card key={candidate.id} className="flex flex-col">
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
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewScreening(candidate.id)}>
                          <IconEye className="mr-1 size-3" /> View Screening
                        </Button>
                        <Button size="sm" variant="default" className="flex-1" onClick={() => handleGenerateQuestions(candidate.id)}>
                          Generate Questions
                        </Button>
                        <Button size="sm" variant="ghost" className="w-full" onClick={() => handleUpdateStage(candidate.id, 'ta_interview')}>
                          Move to Interview
                        </Button>
                      </>
                    )}

                    {candidate.stage === 'ta_interview' && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                           setSelectedCandidateId(candidate.id);
                           setScheduleDialogOpen(true);
                        }}>
                          <IconCalendar className="mr-1 size-3" /> Schedule
                        </Button>
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => handleViewQuestions(candidate.id)}>
                          <IconFileText className="mr-1 size-3" /> Questions
                        </Button>
                        <div className="flex w-full gap-2 mt-2">
                           <Button size="sm" variant="outline" className="flex-1 text-green-600 hover:text-green-700" onClick={() => handleOpenReport('new_report', candidate.id)}>
                             Report
                           </Button>
                           <Button size="sm" variant="default" className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStage(candidate.id, 'ta_accepted')}>
                             Accept
                           </Button>
                           <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleUpdateStage(candidate.id, 'ta_rejected')}>
                             Reject
                           </Button>
                        </div>
                      </>
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
                {allInterviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No interviews found.
                    </TableCell>
                  </TableRow>
                ) : (
                  allInterviews.map(({ interview, candidate }) => (
                    <TableRow key={interview.id}>
                      <TableCell>
                        <div className="font-medium">{candidate.fullName}</div>
                        <div className="text-xs text-muted-foreground">{candidate.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">{interview.stage}</Badge>
                      </TableCell>
                      <TableCell>
                         {typeof interview.scheduledDate === 'string' ? interview.scheduledDate : interview.scheduledDate.toLocaleDateString()} at {interview.scheduledTime}
                      </TableCell>
                      <TableCell>
                        {interview.meetLink && (
                          <a href={interview.meetLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                            Link <IconArrowLeft className="rotate-135 size-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={interview.status === 'completed' ? 'default' : 'secondary'}>
                          {interview.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         <div className="flex justify-end gap-2">
                           <Button size="icon-sm" variant="ghost" onClick={() => handleSendEmail(interview, candidate)} title="Send Email">
                             <IconSend className="size-4" />
                           </Button>
                           <Button size="icon-sm" variant="ghost" onClick={() => handleOpenReport(interview.id, candidate.id)} title="Write Report">
                             <IconEdit className="size-4" />
                           </Button>
                         </div>
                      </TableCell>
                    </TableRow>
                  ))
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
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
                   {viewScreeningData.matchedMustHave?.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                       <span className="text-sm font-medium mr-2">Matched:</span>
                       {viewScreeningData.matchedMustHave.map((m: string) => <Badge key={m} variant="secondary">{m}</Badge>)}
                     </div>
                   )}
                   {viewScreeningData.gaps?.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                       <span className="text-sm font-medium mr-2">Gaps:</span>
                       {viewScreeningData.gaps.map((m: string) => <Badge key={m} variant="destructive">{m}</Badge>)}
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
