'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  IconCalendar, 
  IconMail, 
  IconCheck, 
  IconX,
  IconExternalLink,
  IconCircleCheck,
  IconCircleDashed,
  IconUserCheck,
  IconFileDescription,
  IconSparkles,
  IconEdit,
  IconSend,
  IconPhone,
} from '@tabler/icons-react';

import {
  scheduleInterviewAction,
  sendInterviewEmailAction,
  updateCandidateStageAction,
  markInterviewCompletedAction,
  generateHRDecisionEmailAction,
  sendHRDecisionEmailAction,
} from '../actions';

import type { InterviewDecision, InterviewAutoPilotGuide } from '../types';
import { InterviewAutoPilotGuideView } from './interview-autopilot-guide';

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  stage: string;
  jobId: string;
  jobTitle?: string;
  job?: { title: string };
}

interface Interview {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  meetLink: string;
  status?: string;
}

interface InterviewGuide {
  id: string;
  questions: string[];
  stage: string;
}

interface Report {
  id: string;
  stage?: string;
  score: number | null;
  decision: string;
  notes?: string | null;
  overallEvaluation?: string | null;
}

interface HRCandidateDetailClientProps {
  candidate: Candidate;
  priorReports: Report[];
  interviewGuide?: InterviewGuide | null;
  currentInterview?: Interview | null;
  autoPilotGuide?: InterviewAutoPilotGuide | null;
}

export function HRCandidateDetailClient({ 
  candidate, 
  priorReports, 
  interviewGuide, 
  currentInterview,
  autoPilotGuide,
}: HRCandidateDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('workflow');
  const [isDeciding, setIsDeciding] = useState(false);

  // Meeting scheduling (OPTIONAL)
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleData, setScheduleData] = useState({ date: '', time: '', link: '' });
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // Email state
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Hiring state
  const [isHiring, setIsHiring] = useState(false);

  // Decision state
  const hasDecided = candidate.stage === 'hr_accepted' || candidate.stage === 'hr_rejected' || candidate.stage === 'hired';
  const isAccepted = candidate.stage === 'hr_accepted' || candidate.stage === 'hired';
  const isHired = candidate.stage === 'hired';
  const isRejected = candidate.stage === 'hr_rejected';

  const handleDecision = async (decision: 'hr_accepted' | 'hr_rejected') => {
    try {
      setIsDeciding(true);
      await updateCandidateStageAction(candidate.id, decision);
      toast.success(decision === 'hr_accepted' ? 'Candidate accepted!' : 'Candidate rejected');
      router.refresh();
    } catch (error) {
      toast.error('Failed to update decision');
    } finally {
      setIsDeciding(false);
    }
  };

  const handleMarkAsHired = async () => {
    try {
      setIsHiring(true);
      await updateCandidateStageAction(candidate.id, 'hired');
      toast.success('Candidate marked as hired!');
      router.refresh();
    } catch (error) {
      toast.error('Failed to mark candidate as hired');
    } finally {
      setIsHiring(false);
    }
  };

  const handleGenerateEmail = async (decision: 'accepted' | 'rejected') => {
    try {
      setIsGeneratingEmail(true);
      const toastId = toast.loading('AI is generating the email...');
      const result = await generateHRDecisionEmailAction(candidate.id, candidate.jobId, decision);
      setEmailSubject(result.subject);
      setEmailBody(result.body);
      setIsEditingEmail(true);
      toast.success('Email generated! You can edit it before sending.', { id: toastId });
    } catch (error) {
      toast.error('Failed to generate email');
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Email subject and body are required');
      return;
    }
    try {
      setIsSendingEmail(true);
      await sendHRDecisionEmailAction({
        toEmail: candidate.email,
        toName: candidate.fullName,
        subject: emailSubject,
        body: emailBody,
      });
      setEmailSent(true);
      setIsEditingEmail(false);
      toast.success('Email sent successfully!');
    } catch (error) {
      toast.error('Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!scheduleData.date || !scheduleData.time || !scheduleData.link) {
      toast.error('Please fill all fields');
      return;
    }
    try {
      setIsScheduling(true);
      const interview = await scheduleInterviewAction({
        candidateId: candidate.id,
        jobId: candidate.jobId,
        stage: 'hr',
        scheduledDate: scheduleData.date,
        scheduledTime: scheduleData.time,
        meetLink: scheduleData.link
      });

      await sendInterviewEmailAction({
        interviewId: interview.id,
        candidateEmail: candidate.email,
        candidateName: candidate.fullName,
        jobTitle: candidate.job?.title || candidate.jobTitle || 'Job',
        scheduledDate: scheduleData.date,
        scheduledTime: scheduleData.time,
        meetLink: scheduleData.link,
        interviewerName: 'HR Team',
        stage: 'hr'
      });

      toast.success('Meeting scheduled and invitation sent');
      setScheduleData({ date: '', time: '', link: '' });
      setShowScheduleDialog(false);
      router.refresh();
    } catch (error) {
      toast.error('Failed to schedule meeting');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!currentInterview) return;
    try {
      await markInterviewCompletedAction(currentInterview.id);
      toast.success('Meeting marked as completed');
      router.refresh();
    } catch (error) {
      toast.error('Failed to mark meeting as completed');
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
            {candidate.phone && <span className="flex items-center gap-1"><IconPhone size={16} /> {candidate.phone}</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="capitalize">{candidate.stage.replace(/_/g, ' ')}</Badge>
            {(candidate.job?.title || candidate.jobTitle) && (
              <Badge variant="secondary">{candidate.job?.title || candidate.jobTitle}</Badge>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="workflow">HR Decision Process</TabsTrigger>
          <TabsTrigger value="autopilot">Auto-Pilot Guide</TabsTrigger>
          <TabsTrigger value="reports">Prior Reports (TA & Manager)</TabsTrigger>
          <TabsTrigger value="meeting">Meeting (Optional)</TabsTrigger>
        </TabsList>

        {/* Auto-Pilot Guide Tab */}
        <TabsContent value="autopilot" className="space-y-4">
          <InterviewAutoPilotGuideView
            candidateId={candidate.id}
            jobId={candidate.jobId}
            stage="hr"
            initialGuide={autoPilotGuide ?? null}
          />
        </TabsContent>

        {/* Prior Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          {priorReports.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <IconCircleDashed className="h-8 w-8 mb-2 opacity-30" />
                  <p>No prior reports from TA or Manager stages.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            priorReports.map((report) => (
              <Card key={report.id}>
                <CardHeader>
                  <CardTitle className="capitalize">{report.stage} Evaluation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div><strong>Score:</strong> {report.score}/100</div>
                  <div><strong>Decision:</strong> <Badge>{report.decision}</Badge></div>
                  <div><strong>Notes:</strong> <p className="mt-1 text-muted-foreground">{report.overallEvaluation || report.notes || 'No notes provided.'}</p></div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Optional Meeting Tab */}
        <TabsContent value="meeting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconCalendar className="h-5 w-5" />
                Schedule a Meeting (Optional)
              </CardTitle>
              <CardDescription>
                If you need to meet the candidate in person or via video call, you can schedule a meeting here.
                This step is not required - you can make your decision and communicate by phone or email.
              </CardDescription>
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
                <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                  <DialogTrigger className={buttonVariants({ variant: 'outline' })}>
                    <IconCalendar className="mr-2 h-4 w-4" /> Schedule Meeting
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule HR Meeting</DialogTitle>
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
                      <Button onClick={handleScheduleMeeting} disabled={isScheduling}>
                        {isScheduling ? 'Scheduling...' : 'Confirm & Send Invitation'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Main Workflow Tab */}
        <TabsContent value="workflow" className="space-y-6">

          {/* Step 1: Review & Make Decision */}
          <Card className={hasDecided ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {hasDecided && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                <IconUserCheck className="h-5 w-5" />
                1. Decision
              </CardTitle>
              <CardDescription>
                {hasDecided
                  ? isAccepted
                    ? 'This candidate has been accepted. Proceed to send the email.'
                    : 'This candidate has been rejected. You can send the rejection email.'
                  : 'Review the TA and Manager reports, then make your decision. You can call the candidate by phone if needed before deciding.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasDecided ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                  {isAccepted ? (
                    <>
                      <IconCircleCheck className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="font-medium text-emerald-600 dark:text-emerald-400">Candidate Accepted</p>
                        <p className="text-sm text-muted-foreground">Approved for hiring. Generate and send the acceptance email below.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <IconX className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="font-medium text-destructive">Candidate Rejected</p>
                        <p className="text-sm text-muted-foreground">Generate and send the rejection email below.</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-dashed bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      Review the candidate&apos;s history in the &ldquo;Prior Reports&rdquo; tab. You can also reach the candidate by phone at{' '}
                      {candidate.phone ? (
                        <strong>{candidate.phone}</strong>
                      ) : (
                        <span className="italic">no phone available</span>
                      )}
                      {' '}to discuss paperwork or any details before making a decision.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => handleDecision('hr_accepted')} 
                      disabled={isDeciding}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <IconCheck className="mr-2 h-4 w-4" /> Accept Candidate
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleDecision('hr_rejected')} 
                      disabled={isDeciding}
                    >
                      <IconX className="mr-2 h-4 w-4" /> Reject Candidate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Generate & Send Email */}
          <Card className={emailSent ? 'border-emerald-200 dark:border-emerald-900' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {emailSent && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                <IconMail className="h-5 w-5" />
                2. Send Email to Candidate
              </CardTitle>
              <CardDescription>
                {!hasDecided
                  ? 'Make a decision first, then generate and send the email.'
                  : emailSent
                  ? 'Email has been sent to the candidate.'
                  : isAccepted
                  ? 'Generate an acceptance email with required documents list, then review and send it.'
                  : 'Generate a professional rejection email, review it, and send.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasDecided ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <IconCircleDashed className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Complete Step 1 first to unlock this step.</p>
                </div>
              ) : emailSent ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <IconCircleCheck className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">Email Sent</p>
                      <p className="text-sm text-muted-foreground">The email has been sent to {candidate.email}</p>
                    </div>
                  </div>
                  {/* Allow resending */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEmailSent(false);
                      setIsEditingEmail(true);
                    }}
                  >
                    <IconEdit className="mr-2 h-4 w-4" /> Edit & Resend
                  </Button>
                </div>
              ) : isEditingEmail ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">To</label>
                    <Input value={`${candidate.fullName} <${candidate.email}>`} disabled />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject</label>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Body</label>
                    <Textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSendEmail} disabled={isSendingEmail}>
                      <IconSend className="mr-2 h-4 w-4" />
                      {isSendingEmail ? 'Sending...' : 'Send Email'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleGenerateEmail(isAccepted ? 'accepted' : 'rejected')}
                      disabled={isGeneratingEmail}
                    >
                      <IconSparkles className="mr-2 h-4 w-4" />
                      {isGeneratingEmail ? 'Regenerating...' : 'Regenerate with AI'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => handleGenerateEmail(isAccepted ? 'accepted' : 'rejected')}
                  disabled={isGeneratingEmail}
                >
                  <IconSparkles className="mr-2 h-4 w-4" />
                  {isGeneratingEmail ? 'Generating Email...' : 'Generate Email with AI'}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Mark as Hired (only for accepted candidates) */}
          {isAccepted && (
            <Card className={isHired ? 'border-emerald-200 dark:border-emerald-900' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isHired && <IconCircleCheck className="h-5 w-5 text-emerald-500" />}
                  <IconUserCheck className="h-5 w-5" />
                  3. Finalize Hiring
                </CardTitle>
                <CardDescription>
                  {isHired
                    ? 'This candidate has been officially hired.'
                    : 'Once the candidate has accepted the offer and onboarding is ready, mark them as hired.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isHired ? (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <IconCircleCheck className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="font-medium text-emerald-600 dark:text-emerald-400">Officially Hired</p>
                      <p className="text-sm text-muted-foreground">{candidate.fullName} is now part of the team.</p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handleMarkAsHired}
                    disabled={isHiring}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <IconCheck className="mr-2 h-4 w-4" />
                    {isHiring ? 'Processing...' : 'Mark as Hired'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

        </TabsContent>
      </Tabs>
    </div>
  );
}
