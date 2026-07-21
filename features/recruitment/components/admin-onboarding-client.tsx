"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconUserCheck,
  IconChecklist,
  IconFileSpreadsheet,
  IconEye,
  IconBriefcase,
  IconSchool,
  IconListCheck,
  IconMail,
  IconPhone,
  IconAlertTriangle,
  IconBrain,
  IconReportAnalytics,
} from "@tabler/icons-react";
import { toast } from "sonner";
import type { OnboardingDetailedEntry } from "@/features/recruitment/services/admin";
import { formatUtcDate } from "@/lib/utils";
import { exportOnboardingExcelAction } from "@/features/recruitment/actions";
import { usePathname, useRouter } from "next/navigation";
import { AdminAgentEvidencePanel } from "./admin-agent-evidence-panel";
import {
  buildAdminAgentPrompt,
  buildOnboardingAdminEvidence,
} from "./admin-agent-helpers";


interface AdminOnboardingClientProps {
  candidates: OnboardingDetailedEntry[];
  initialCandidateId: string | null;
}

export function AdminOnboardingClient({
  candidates,
  initialCandidateId,
}: AdminOnboardingClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [candidateId, setCandidateId] = useState<string | null>(initialCandidateId);
  const [selectedCandidate, setSelectedCandidate] = useState<OnboardingDetailedEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const totalHired = candidates.length;
  const fullyOnboarded = candidates.filter(
    (c) => c.totalTasks > 0 && c.completedTasks === c.totalTasks
  ).length;
  const pendingOnboarding = candidates.filter(
    (c) => c.totalTasks === 0
  ).length;
  const inProgress = totalHired - fullyOnboarded - pendingOnboarding;
  const onboardingEvidence = buildOnboardingAdminEvidence(candidates);
  const agentActions = [
    {
      label: "Find anomalies",
      description: "Review missing checklists, thin evidence, and contact gaps.",
      icon: IconAlertTriangle,
      prompt: buildAdminAgentPrompt({
        task: "Find onboarding anomalies for hired candidates. Separate observed checklist/contact facts from inferred operational risks and list concrete follow-up checks.",
        summary: onboardingEvidence,
      }),
    },
    {
      label: "Summarize readiness",
      description: "Prepare an onboarding governance brief for HR operations.",
      icon: IconReportAnalytics,
      prompt: buildAdminAgentPrompt({
        task: "Summarize onboarding readiness for HR operations. Include completed versus incomplete onboarding, missing evidence, and safest next actions.",
        summary: onboardingEvidence,
      }),
    },
    {
      label: "Risk review",
      description: "Assess candidate handoff and compliance risk signals.",
      icon: IconBrain,
      prompt: buildAdminAgentPrompt({
        task: "Review onboarding risk signals for hired candidates. Focus on missing checklist tasks, missing contact details, thin CV evidence, and source limits.",
        summary: onboardingEvidence,
      }),
    },
  ] as const;


  const updateCandidateQuery = useCallback(
    (value: string | null) => {
      setCandidateId(value);
      router.replace(value ? `${pathname}?candidateId=${value}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!candidateId) {
      setSelectedCandidate(null);
      return;
    }

    const match = candidates.find((candidate) => candidate.candidateId === candidateId);
    if (match) {
      setSelectedCandidate((current) =>
        current?.candidateId === match.candidateId ? current : match,
      );
    }
  }, [candidateId, candidates]);

  const handleOpenCandidate = useCallback(
    (candidate: OnboardingDetailedEntry) => {
      setSelectedCandidate(candidate);
      if (candidateId !== candidate.candidateId) {
        updateCandidateQuery(candidate.candidateId);
      }
    },
    [candidateId, updateCandidateQuery],
  );

  const handleCandidateDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedCandidate(null);
        if (candidateId) {
          updateCandidateQuery(null);
        }
      }
    },
    [candidateId, updateCandidateQuery],
  );

  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.info("Generating Excel report...");

      const base64 = await exportOnboardingExcelAction();
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `onboarding-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Excel report downloaded successfully");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to generate Excel report");
    } finally {
      setIsExporting(false);
    }
  };

  const getStageColor = (stage: string) => {
    const s = (stage || "").toLowerCase();
    if (s.includes("accepted") || s.includes("hired")) return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400";
    if (s.includes("rejected")) return "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400";
    if (s.includes("interview")) return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400";
    return "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400";
  };

  const getValue = (obj: Record<string, string>, keys: string[]) => {
    if (!obj) return "";
    for (const key of keys) {
      if (obj[key]) return obj[key];
      const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
      if (found && obj[found]) return obj[found];
    }
    return "";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Hired
                </p>
                <p className="mt-1 text-2xl font-bold">{totalHired}</p>
              </div>
              <IconUserCheck className="h-8 w-8 text-emerald-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Fully Onboarded
                </p>
                <p className="mt-1 text-2xl font-bold">{fullyOnboarded}</p>
              </div>
              <IconChecklist className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  In Progress
                </p>
                <p className="mt-1 text-2xl font-bold">{inProgress}</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {pendingOnboarding > 0 ? `+${pendingOnboarding}` : "0"}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pendingOnboarding > 0
                ? `${pendingOnboarding} pending checklist creation`
                : "All have checklists"}
            </p>
          </CardContent>
        </Card>
      </div>

      <AdminAgentEvidencePanel summary={onboardingEvidence} actions={agentActions} />

      {/* Candidates Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Hired Candidates</CardTitle>
            <CardDescription>
              Onboarding progress for all hired candidates
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={handleExport}
            disabled={isExporting}
          >
            <IconFileSpreadsheet className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Excel"}
          </Button>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <IconUserCheck className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No hired candidates yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Candidate</TableHead>
                    <TableHead className="w-[120px]">Stage</TableHead>
                    <TableHead className="w-[180px]">Job</TableHead>
                    <TableHead className="w-[180px]">Progress</TableHead>
                    <TableHead className="w-[100px] text-center">
                      Tasks
                    </TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Hired Date
                    </TableHead>
                    <TableHead className="w-[80px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => {
                    const pct =
                      c.totalTasks > 0
                        ? Math.round((c.completedTasks / c.totalTasks) * 100)
                        : 0;
                    const isComplete =
                      c.totalTasks > 0 && c.completedTasks === c.totalTasks;
                    const noPlan = c.totalTasks === 0;

                    return (
                      <TableRow key={c.candidateId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {c.candidateName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {c.candidateEmail}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStageColor(c.candidateStage)}
                          >
                            {c.candidateStage || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {c.jobTitle}
                          </span>
                        </TableCell>
                        <TableCell>
                          {noPlan ? (
                            <span className="text-xs text-muted-foreground italic">
                              No checklist yet
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="w-10 text-right text-xs font-medium tabular-nums">
                                {pct}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm tabular-nums">
                            {c.completedTasks}/{c.totalTasks}
                          </span>
                        </TableCell>
                        <TableCell>
                          {noPlan ? (
                            <Badge
                              variant="outline"
                              className="bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400"
                            >
                              Pending
                            </Badge>
                          ) : isComplete ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                            >
                              Complete
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                            >
                              In Progress
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatUtcDate(c.hiredAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleOpenCandidate(c)}
                          >
                            <IconEye className="h-4 w-4" />
                            <span className="sr-only">Details</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedCandidate} onOpenChange={handleCandidateDialogChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
          {selectedCandidate && (
            <>
              <DialogHeader className="p-6 pb-2 shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <span className="font-bold">{selectedCandidate.candidateName}</span>
                    <Badge variant="outline" className={getStageColor(selectedCandidate.candidateStage)}>
                      {selectedCandidate.candidateStage}
                    </Badge>
                  </DialogTitle>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <IconBriefcase className="h-4 w-4" />
                    <span>{selectedCandidate.jobTitle}</span>
                  </div>
                  {selectedCandidate.candidateEmail && (
                    <div className="flex items-center gap-1.5">
                      <IconMail className="h-4 w-4" />
                      <span>{selectedCandidate.candidateEmail}</span>
                    </div>
                  )}
                  {selectedCandidate.candidatePhone && (
                    <div className="flex items-center gap-1.5">
                      <IconPhone className="h-4 w-4" />
                      <span>{selectedCandidate.candidatePhone}</span>
                    </div>
                  )}
                </div>
              </DialogHeader>

              <div className="flex-1 p-6 pt-2 overflow-y-auto">
                <div className="space-y-6">
                  {/* Onboarding Tasks */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <IconListCheck className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-base">Onboarding Checklist</h3>
                    </div>
                    {selectedCandidate.tasks && selectedCandidate.tasks.length > 0 ? (
                      <div className="grid gap-2">
                        {selectedCandidate.tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card/50"
                          >
                            <div className={`mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${task.completed ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                              {task.completed && <IconUserCheck className="h-3 w-3" />}
                            </div>
                            <div className="space-y-1">
                              <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground">
                                  {task.description}
                                </p>
                              )}
                              {task.completed && task.completedAt && (
                                <p className="text-[10px] text-emerald-600 font-medium">
                                  Completed {formatUtcDate(task.completedAt)}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No onboarding tasks assigned yet.</p>
                    )}
                  </div>

                  <Separator />

                  {/* CV Summary */}
                  {selectedCandidate.cvSummary && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-base">Professional Summary</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedCandidate.cvSummary}
                      </p>
                    </div>
                  )}

                  {/* Skills & Languages */}
                  {(selectedCandidate.cvSkills?.length > 0 || selectedCandidate.cvLanguages?.length > 0) && (
                    <>
                      <Separator />
                      <div className="grid sm:grid-cols-2 gap-6">
                        {selectedCandidate.cvSkills?.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Skills</h3>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCandidate.cvSkills.map((skill: string, i: number) => (
                                <Badge key={i} variant="secondary" className="font-normal">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedCandidate.cvLanguages?.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Languages</h3>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCandidate.cvLanguages.map((lang: string, i: number) => (
                                <Badge key={i} variant="outline" className="font-normal">
                                  {lang}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Experience */}
                  {selectedCandidate.cvExperiences && selectedCandidate.cvExperiences.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <IconBriefcase className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-base">Experience</h3>
                        </div>
                        <div className="space-y-4">
                          {selectedCandidate.cvExperiences.map((exp: Record<string, string>, i: number) => {
                            const title = getValue(exp, ['title', 'role', 'position']);
                            const company = getValue(exp, ['company', 'organization', 'employer']);
                            const duration = getValue(exp, ['duration', 'date', 'dates', 'period']);
                            
                            return (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-medium text-sm">{title || "Unknown Role"}</h4>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{duration}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">{company || "Unknown Company"}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Education */}
                  {selectedCandidate.cvEducation && selectedCandidate.cvEducation.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <IconSchool className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-base">Education</h3>
                        </div>
                        <div className="space-y-4">
                          {selectedCandidate.cvEducation.map((edu: Record<string, string>, i: number) => {
                            const degree = getValue(edu, ['degree', 'qualification', 'major']);
                            const school = getValue(edu, ['institution', 'school', 'university', 'college']);
                            const year = getValue(edu, ['year', 'date', 'dates', 'duration']);

                            return (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-medium text-sm">{school || "Unknown Institution"}</h4>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{year}</span>
                                </div>
                                <p className="text-sm text-muted-foreground">{degree}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
