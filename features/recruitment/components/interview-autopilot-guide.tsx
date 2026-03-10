'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  IconSparkles,
  IconBrain,
  IconAlertTriangle,
  IconUsers,
  IconChevronDown,
  IconChevronUp,
  IconLoader2,
  IconClipboardText,
  IconTarget,
  IconBulb,
} from '@tabler/icons-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  generateInterviewAutoPilotAction,
} from '@/features/recruitment/actions';
import type { InterviewAutoPilotGuide, InterviewStage } from '@/features/recruitment/types';

interface InterviewAutoPilotGuideProps {
  candidateId: string;
  jobId: string;
  stage: InterviewStage;
  initialGuide?: InterviewAutoPilotGuide | null;
}

export function InterviewAutoPilotGuideView({
  candidateId,
  jobId,
  stage,
  initialGuide = null,
}: InterviewAutoPilotGuideProps) {
  const [guide, setGuide] = useState<InterviewAutoPilotGuide | null>(initialGuide);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    briefing: true,
    technical: true,
    gaps: true,
    behavioral: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateInterviewAutoPilotAction(candidateId, jobId, stage);
      if (result) {
        setGuide(result);
        toast.success('Auto-Pilot Interview Guide generated');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate guide');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!guide) {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="rounded-full bg-primary/10 p-4">
            <IconBrain className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-semibold text-lg">AI Interview Auto-Pilot</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Generate a hyper-personalized interview guide with advanced technical questions,
              gap mitigation strategies, and consulting-focused behavioral scenarios.
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating} size="lg">
            {isGenerating ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconSparkles className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? 'Generating Guide...' : 'Generate Auto-Pilot Guide'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with regenerate */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBrain className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Auto-Pilot Interview Guide</h3>
          <Badge variant="secondary" className="uppercase text-[10px]">
            {stage}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconSparkles className="mr-1 h-4 w-4" />
          )}
          Regenerate
        </Button>
      </div>

      {/* Interviewer Briefing */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader
          className="cursor-pointer pb-2"
          onClick={() => toggleSection('briefing')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconClipboardText className="h-4 w-4 text-primary" />
              Interviewer Briefing
            </CardTitle>
            {expandedSections.briefing ? (
              <IconChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <IconChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {expandedSections.briefing && (
          <CardContent className="pt-0">
            <p className="text-sm leading-relaxed">{guide.interviewerBriefing}</p>
          </CardContent>
        )}
      </Card>

      {/* Technical Questions */}
      {guide.technicalQuestions.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer pb-2"
            onClick={() => toggleSection('technical')}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconTarget className="h-4 w-4 text-blue-500" />
                  Technical Questions
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {guide.technicalQuestions.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Advanced questions to verify claimed strengths and technical depth
                </CardDescription>
              </div>
              {expandedSections.technical ? (
                <IconChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <IconChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSections.technical && (
            <CardContent className="pt-0">
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-4">
                  {guide.technicalQuestions.map((q, idx) => (
                    <div key={idx} className="space-y-2">
                      {idx > 0 && <Separator />}
                      <div className="flex items-center gap-2 pt-2">
                        <span className="font-mono text-xs text-muted-foreground w-5">
                          {idx + 1}.
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {q.topic}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {q.targetSeniority}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium pl-7">{q.question}</p>
                      <div className="pl-7 flex items-start gap-2 bg-muted/50 rounded-md p-2">
                        <IconBulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{q.whatToListenFor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          )}
        </Card>
      )}

      {/* Gap Mitigation Questions */}
      {guide.gapMitigationQuestions.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardHeader
            className="cursor-pointer pb-2"
            onClick={() => toggleSection('gaps')}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconAlertTriangle className="h-4 w-4 text-amber-500" />
                  Gap Mitigation Questions
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {guide.gapMitigationQuestions.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Scenario-based questions probing learning agility for missing skills
                </CardDescription>
              </div>
              {expandedSections.gaps ? (
                <IconChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <IconChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSections.gaps && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {guide.gapMitigationQuestions.map((q, idx) => (
                  <div key={idx} className="space-y-2">
                    {idx > 0 && <Separator />}
                    <div className="flex items-center gap-2 pt-2">
                      <span className="font-mono text-xs text-muted-foreground w-5">
                        {idx + 1}.
                      </span>
                      <Badge variant="destructive" className="text-[10px]">
                        Gap: {q.missingSkill}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium pl-7">{q.question}</p>
                    <div className="pl-7 flex items-start gap-2 bg-muted/50 rounded-md p-2">
                      <IconBulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">{q.whatToListenFor}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Behavioral Questions */}
      {guide.behavioralQuestions.length > 0 && (
        <Card className="border-violet-200 dark:border-violet-900/50">
          <CardHeader
            className="cursor-pointer pb-2"
            onClick={() => toggleSection('behavioral')}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconUsers className="h-4 w-4 text-violet-500" />
                  Consulting Behavioral Questions
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {guide.behavioralQuestions.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Client-facing scenarios testing consulting mindset
                </CardDescription>
              </div>
              {expandedSections.behavioral ? (
                <IconChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <IconChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {expandedSections.behavioral && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {guide.behavioralQuestions.map((q, idx) => (
                  <div key={idx} className="space-y-2">
                    {idx > 0 && <Separator />}
                    <div className="pt-2">
                      <Badge variant="secondary" className="text-[10px] mb-2">
                        Scenario: {q.consultingScenario}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{q.question}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {q.redFlags.map((flag, fi) => (
                        <Badge
                          key={fi}
                          variant="destructive"
                          className="text-[10px]"
                        >
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
