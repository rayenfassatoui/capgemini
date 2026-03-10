'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  generateInterviewQuestionsAction,
  getInterviewGuideAction,
  updateInterviewQuestionsAction,
  scheduleInterviewAction,
  sendInterviewEmailAction,
  saveInterviewReportAction,
  updateCandidateStageAction,
  markInterviewCompletedAction,
  assignHrToCandidateAction,
} from '@/features/recruitment/actions';
import { toast } from 'sonner';
import { IconMail, IconCalendar, IconCheck, IconX, IconExternalLink, IconCircleCheck, IconCircleDashed, IconPlus, IconTrash, IconSparkles, IconEdit, IconDeviceFloppy } from '@tabler/icons-react';
import type { InterviewDecision, CandidateStage, InterviewAutoPilotGuide } from '@/features/recruitment/types';
import { InterviewAutoPilotGuideView } from './interview-autopilot-guide';

interface InterviewGuide {
  id: string;
  questions: string[];
}

interface Interview {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  meetLink: string;
  status?: string;
}

interface Report {
  id: string;
  score: number | null;
  decision: string;
  overallEvaluation?: string | null;
  notes?: string | null;
}

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  jobId: string;
  stage: string;
  job?: { title: string };
}

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ManagerCandidateDetailClientProps {
  candidate: Candidate;
  taReports: Report[];
  interviewGuide?: InterviewGuide | null;
  currentInterview?: Interview | null;
  hrUsers?: UserListItem[];
  autoPilotGuide?: InterviewAutoPilotGuide | null;
}

function StepIndicator({ step, label, done, active }: { step: number; label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
        done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
        : active ? 'bg-primary text-primary-foreground' 
        : 'bg-muted text-muted-foreground'
      }`}>
        {done ? <IconCircleCheck size={16} /> : step}
      </div>
      <span className={`text-sm font-medium ${done ? 'text-emerald-600 dark:text-emerald-400' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
}

export function ManagerCandidateDetailClient({
  candidate,
  taReports,
  interviewGuide,
  currentInterview,
  hrUsers,
  autoPilotGuide,
}: ManagerCandidateDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('interview');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleData, setScheduleData] = useState({ date: '', time: '', link: '' });
  const [reportData, setReportData] = useState({ notes: '', score: 0, decision: 'pending' });
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);

  // HR selection state for accept flow
  const [selectedHrId, setSelectedHrId] = useState('');
  // Editable questions state
  const [editableQuestions, setEditableQuestions] = useState<string[]>(interviewGuide?.questions ?? []);
  const [isEditingQuestions, setIsEditingQuestions] = useState(false);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');

  // Workflow step completion status
  const step1Done = !!interviewGuide;
  const step2Done = !!currentInterview;
  const step3Done = currentInterview?.status === 'completed';
  const hasDecided = candidate.stage === 'manager_accepted' || candidate.stage === 'manager_rejected';

  const handleGenerateQuestions = async () => {
    try {
      setIsGeneratingQuestions(true);
      await generateInterviewQuestionsAction(candidate.id, candidate.jobId, 'manager');
      toast.success('Interview questions generated');
      // Reload to get the new guide with its ID
      const guide = await getInterviewGuideAction(candidate.id, candidate.jobId, 'manager');
      if (guide) {
        setEditableQuestions(guide.questions ?? []);
      }
      router.refresh();
    } catch (error) {
      toast.error('Failed to generate questions');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleSaveQuestions = async () => {
    if (!interviewGuide?.id) {
      toast.error('No interview guide to update');
      return;
    }
    const filtered = editableQuestions.filter((q) => q.trim().length > 0);
    if (filtered.length === 0) {
      toast.error('You must have at least one question');
      return;
    }
    try {
      setIsSavingQuestions(true);
      await updateInterviewQuestionsAction(interviewGuide.id, filtered);
      setEditableQuestions(filtered);
      setIsEditingQuestions(false);
      toast.success('Questions saved');
      router.refresh();
    } catch (error) {
      toast.error('Failed to save questions');
    } finally {
      setIsSavingQuestions(false);
    }
  };

  const handleAddQuestion = () => {
    if (newQuestionText.trim()) {
      setEditableQuestions([...editableQuestions, newQuestionText.trim()]);
      setNewQuestionText('');
    }
  };

  const handleRemoveQuestion = (index: number) => {
    setEditableQuestions(editableQuestions.filter((_, i) => i !== index));
  };

  const handleEditQuestion = (index: number, value: string) => {
    const updated = [...editableQuestions];
    updated[index] = value;
    setEditableQuestions(updated);
  };

  const handleScheduleInterview = async () => {
    if (!scheduleData.date || !scheduleData.time || !scheduleData.link) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      setIsScheduling(true);
      let formattedDate = scheduleData.date;
      if (scheduleData.date.includes('-')) {
        const [y, m, d] = scheduleData.date.split('-');
        formattedDate = `${d}/${m}/${y}`;
      }
      const interview = await scheduleInterviewAction({
        candidateId: candidate.id,
        jobId: candidate.jobId,
        stage: 'manager',
        scheduledDate: formattedDate,
        scheduledTime: scheduleData.time,
        meetLink: scheduleData.link
      });
      
      await sendInterviewEmailAction({
        interviewId: interview.id,
        candidateEmail: candidate.email,
        candidateName: candidate.fullName,
        jobTitle: candidate.job?.title || 'Job',
        scheduledDate: formattedDate,
        scheduledTime: scheduleData.time,
        meetLink: scheduleData.link,
        interviewerName: 'Manager',
        stage: 'manager'
      });

      toast.success('Interview scheduled and email sent');
      setScheduleData({ date: '', time: '', link: '' });
      router.refresh();
    } catch (error) {
      toast.error('Failed to schedule interview');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!currentInterview) return;
    try {
      await markInterviewCompletedAction(currentInterview.id);
      toast.success('Interview marked as completed');
      router.refresh();
    } catch (error) {
      toast.error('Failed to mark interview as completed');
    }
  };

  const handleSubmitReport = async () => {
    if (!currentInterview) return;
    if (!reportData.notes.trim()) {
      toast.error('Please enter your interview notes');
      return;
    }
    if (reportData.score < 0 || reportData.score > 100) {
      toast.error('Score must be between 0 and 100');
      return;
    }
    try {
      setIsSubmittingReport(true);
      await saveInterviewReportAction({
        interviewId: currentInterview.id,
        candidateId: candidate.id,
        stage: 'manager',
        notes: reportData.notes,
        score: Number(reportData.score),
        decision: reportData.decision as InterviewDecision,
        candidateAnswers: []
      });
      toast.success('Report saved');
      router.refresh();
    } catch (error) {
      toast.error('Failed to save report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleDecision = async (decision: 'manager_accepted' | 'manager_rejected') => {
    if (decision === 'manager_accepted') {
      if (!selectedHrId) {
        toast.error('Please select an HR representative first');
        return;
      }
      try {
        setIsDeciding(true);
        await assignHrToCandidateAction(candidate.id, selectedHrId);
        toast.success('Candidate accepted and assigned to HR');
        router.refresh();
      } catch (error) {
        toast.error('Failed to assign HR');
      } finally {
        setIsDeciding(false);
      }
    } else {
      try {
        setIsDeciding(true);
        await updateCandidateStageAction(candidate.id, decision);
        toast.success('Candidate rejected');
        router.refresh();
      } catch (error) {
        toast.error('Failed to update decision');
      } finally {
        setIsDeciding(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Candidate Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{candidate.fullName}</h1>
          <div className="text-muted-foreground flex gap-4 mt-1">
            <span className="flex items-center gap-1"><IconMail size={16} /> {candidate.email}</span>
            {candidate.phone && <span>{candidate.phone}</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="capitalize">{candidate.stage.replace(/_/g, ' ')}</Badge>
            {candidate.job?.title && (
              <Badge variant="secondary">{candidate.job.title}</Badge>
            )}
          </div>
        </div>
        {currentInterview && currentInterview.status !== 'completed' && (
          <a
            href={currentInterview.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-all"
          >
            <IconExternalLink size={16} />
            Join Meeting
          </a>
        )}
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <StepIndicator step={1} label="Prepare Questions" done={step1Done} active={!step1Done} />
            <Separator className="flex-1 mx-3" />
            <StepIndicator step={2} label="Schedule Interview" done={step2Done} active={step1Done && !step2Done} />
            <Separator className="flex-1 mx-3" />
            <StepIndicator step={3} label="Write Report" done={step3Done} active={step2Done && !step3Done} />
            <Separator className="flex-1 mx-3" />
            <StepIndicator step={4} label="Final Decision" done={hasDecided} active={step2Done && !hasDecided} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="interview">Interview Workflow</TabsTrigger>
          <TabsTrigger value="autopilot">Auto-Pilot Guide</TabsTrigger>
          <TabsTrigger value="ta-report">TA Report</TabsTrigger>
        </TabsList>
        
        <TabsContent value="autopilot" className="space-y-4">
          <InterviewAutoPilotGuideView
            candidateId={candidate.id}
            jobId={candidate.jobId}
            stage="manager"
            initialGuide={autoPilotGuide ?? null}
          />
        </TabsContent>
        
        <TabsContent value="ta-report" className="space-y-4">
          {taReports.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <IconCircleDashed className="h-8 w-8 mb-2 opacity-30" />
                  <p>No TA reports available yet.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            taReports.map((report) => (
              <Card key={report.id}>
                <CardHeader><CardTitle>TA Evaluation</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div><strong>Score:</strong> {report.score}/100</div>
                  <div><strong>Decision:</strong> <Badge>{report.decision}</Badge></div>
                  <div><strong>Notes:</strong> <p className="mt-1 text-muted-foreground">{report.overallEvaluation || report.notes}</p></div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="interview" className="space-y-6">
          {/* Step 1: Generate & Edit Questions */}
          <Card className={step1Done ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {step1Done && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                    1. Interview Guide
                  </CardTitle>
                  <CardDescription>Generate AI questions, then edit, add, or remove as needed.</CardDescription>
                </div>
                {interviewGuide && (
                  <div className="flex gap-2">
                    {!isEditingQuestions ? (
                      <Button variant="outline" size="sm" onClick={() => setIsEditingQuestions(true)}>
                        <IconEdit className="mr-1 h-4 w-4" /> Edit Questions
                      </Button>
                    ) : (
                      <Button variant="default" size="sm" onClick={handleSaveQuestions} disabled={isSavingQuestions}>
                        <IconDeviceFloppy className="mr-1 h-4 w-4" /> {isSavingQuestions ? 'Saving...' : 'Save Changes'}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={handleGenerateQuestions} disabled={isGeneratingQuestions}>
                      <IconSparkles className="mr-1 h-4 w-4" /> {isGeneratingQuestions ? 'Generating...' : 'Regenerate'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {interviewGuide ? (
                <div className="space-y-3">
                  {isEditingQuestions ? (
                    <>
                      {editableQuestions.map((q, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <span className="font-mono text-muted-foreground text-sm pt-2 w-6 shrink-0">{idx + 1}.</span>
                          <Textarea
                            value={q}
                            onChange={(e) => handleEditQuestion(idx, e.target.value)}
                            className="min-h-[50px] flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0 mt-1"
                            onClick={() => handleRemoveQuestion(idx)}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Separator className="my-2" />
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type a new question..."
                          value={newQuestionText}
                          onChange={(e) => setNewQuestionText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddQuestion(); } }}
                          className="flex-1"
                        />
                        <Button variant="outline" size="sm" onClick={handleAddQuestion} disabled={!newQuestionText.trim()}>
                          <IconPlus className="mr-1 h-4 w-4" /> Add
                        </Button>
                      </div>
                    </>
                  ) : (
                    <ul className="list-disc pl-5 space-y-1.5 text-sm">
                      {editableQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Button onClick={handleGenerateQuestions} disabled={isGeneratingQuestions}>
                  <IconSparkles className="mr-2 h-4 w-4" />
                  {isGeneratingQuestions ? 'Generating...' : 'Generate Questions with AI'}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Schedule */}
          <Card className={step2Done ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {step2Done && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                2. Schedule Interview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentInterview ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                    <IconCalendar className="h-5 w-5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">
                        Scheduled for {currentInterview.scheduledDate} at {currentInterview.scheduledTime}
                      </div>
                      <a href={currentInterview.meetLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                        {currentInterview.meetLink}
                      </a>
                    </div>
                    <Badge variant={currentInterview.status === 'completed' ? 'secondary' : 'default'} className="capitalize">
                      {currentInterview.status || 'scheduled'}
                    </Badge>
                  </div>
                  {currentInterview.status !== 'completed' && (
                    <div className="flex gap-2">
                      <a
                        href={currentInterview.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: 'default', size: 'sm' })}
                      >
                        <IconExternalLink className="mr-2 h-4 w-4" /> Join Meeting
                      </a>
                      <Button variant="outline" size="sm" onClick={handleMarkCompleted}>
                        <IconCheck className="mr-2 h-4 w-4" /> Mark as Completed
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Dialog>
                  <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
                    <IconCalendar className="mr-2 h-4 w-4" /> Schedule Interview
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule Interview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Date</label>
                        <Input type="date" value={scheduleData.date} onChange={e => setScheduleData({...scheduleData, date: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Time</label>
                        <Input type="time" value={scheduleData.time} onChange={e => setScheduleData({...scheduleData, time: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Meeting Link</label>
                        <Input value={scheduleData.link} onChange={e => setScheduleData({...scheduleData, link: e.target.value})} placeholder="https://meet.google.com/..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleScheduleInterview} disabled={isScheduling}>
                        {isScheduling ? 'Scheduling...' : 'Confirm & Send Email'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Report */}
          <Card className={step3Done ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {step3Done && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                3. Interview Report
              </CardTitle>
              <CardDescription>
                {!currentInterview 
                  ? 'Schedule an interview first before writing the report.'
                  : 'Record your evaluation after the interview.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!currentInterview ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <IconCircleDashed className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Complete Step 2 first to unlock this step.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes & Evaluation</label>
                    <Textarea 
                      value={reportData.notes} 
                      onChange={e => setReportData({...reportData, notes: e.target.value})} 
                      placeholder="Enter your interview notes, observations, and evaluation..."
                      rows={5}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Score (0-100)</label>
                      <Input 
                        type="number" 
                        min={0}
                        max={100}
                        value={reportData.score} 
                        onChange={e => setReportData({...reportData, score: Number(e.target.value)})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Decision</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={reportData.decision}
                        onChange={e => setReportData({...reportData, decision: e.target.value as InterviewDecision})}
                      >
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                  <Button onClick={handleSubmitReport} disabled={isSubmittingReport}>
                    {isSubmittingReport ? 'Saving...' : 'Save Report'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 4: Final Decision */}
          <Card className={hasDecided ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {hasDecided && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                4. Final Decision
              </CardTitle>
              <CardDescription>
                {hasDecided
                  ? `You have ${candidate.stage === 'manager_accepted' ? 'accepted this candidate (forwarded to HR)' : 'rejected this candidate'}.`
                  : 'Accept to forward the candidate to HR, or reject.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasDecided ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                  {candidate.stage === 'manager_accepted' ? (
                    <>
                      <IconCircleCheck className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="font-medium text-emerald-600 dark:text-emerald-400">Candidate Accepted</p>
                        <p className="text-sm text-muted-foreground">Forwarded to HR for final processing.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <IconX className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">Candidate Rejected</p>
                        <p className="text-sm text-muted-foreground">This candidate will not move forward.</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {hrUsers && hrUsers.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select HR Representative</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={selectedHrId}
                        onChange={(e) => setSelectedHrId(e.target.value)}
                      >
                        <option value="" disabled>Select HR...</option>
                        {hrUsers.map(hr => (
                          <option key={hr.id} value={hr.id}>{hr.name} ({hr.email})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => handleDecision('manager_accepted')} 
                      disabled={isDeciding || !selectedHrId}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <IconCheck className="mr-2 h-4 w-4" /> Accept & Assign to HR
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleDecision('manager_rejected')} 
                      disabled={isDeciding}
                    >
                      <IconX className="mr-2 h-4 w-4" /> Reject Candidate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
