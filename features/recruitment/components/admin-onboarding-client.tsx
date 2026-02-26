"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconUserCheck, IconChecklist } from "@tabler/icons-react";
import type { OnboardingOverviewEntry } from "@/features/recruitment/services/admin";

interface AdminOnboardingClientProps {
  candidates: OnboardingOverviewEntry[];
}

export function AdminOnboardingClient({ candidates }: AdminOnboardingClientProps) {
  const totalHired = candidates.length;
  const fullyOnboarded = candidates.filter(
    (c) => c.totalTasks > 0 && c.completedTasks === c.totalTasks
  ).length;
  const pendingOnboarding = candidates.filter(
    (c) => c.totalTasks === 0
  ).length;
  const inProgress = totalHired - fullyOnboarded - pendingOnboarding;

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

      {/* Candidates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hired Candidates</CardTitle>
          <CardDescription>
            Onboarding progress for all hired candidates
          </CardDescription>
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
                    <TableHead className="w-[180px]">Job</TableHead>
                    <TableHead className="w-[200px]">Progress</TableHead>
                    <TableHead className="w-[100px] text-center">
                      Tasks
                    </TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[140px] text-right">
                      Hired Date
                    </TableHead>
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
                            {new Date(c.hiredAt).toLocaleDateString()}
                          </span>
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
    </div>
  );
}
