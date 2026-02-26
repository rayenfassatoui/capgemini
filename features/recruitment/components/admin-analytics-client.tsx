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
import {
  IconTrendingUp,
  IconTrendingDown,
  IconChartBar,
  IconTarget,
} from "@tabler/icons-react";
import type { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import type { CandidateStage } from "@/features/recruitment/types";

interface AdminAnalyticsClientProps {
  analytics: RecruitmentAnalytics | null;
}

const STAGE_LABELS: Record<CandidateStage, string> = {
  new: "New",
  ta_screening: "TA Screening",
  ta_interview: "TA Interview",
  ta_accepted: "TA Accepted",
  ta_rejected: "TA Rejected",
  manager_interview: "Manager Interview",
  manager_accepted: "Manager Accepted",
  manager_rejected: "Manager Rejected",
  hr_interview: "HR Interview",
  hr_accepted: "HR Accepted",
  hr_rejected: "HR Rejected",
  hired: "Hired",
};

const FUNNEL_ORDER: CandidateStage[] = [
  "new",
  "ta_screening",
  "ta_interview",
  "ta_accepted",
  "manager_interview",
  "manager_accepted",
  "hr_interview",
  "hr_accepted",
  "hired",
];

const REJECTION_STAGES: CandidateStage[] = [
  "ta_rejected",
  "manager_rejected",
  "hr_rejected",
];

export function AdminAnalyticsClient({ analytics }: AdminAnalyticsClientProps) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Failed to load analytics data.
      </div>
    );
  }

  const totalInFunnel = Object.values(analytics.pipelineFunnel).reduce(
    (sum, val) => sum + val,
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hiring Rate</p>
                <p className="mt-1 text-2xl font-bold">{analytics.hiringRate}%</p>
              </div>
              <IconTrendingUp className="h-8 w-8 text-emerald-500 opacity-80" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Of all candidates entering the pipeline
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejection Rate</p>
                <p className="mt-1 text-2xl font-bold">{analytics.rejectionRate}%</p>
              </div>
              <IconTrendingDown className="h-8 w-8 text-red-500 opacity-80" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Combined across all stages
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pipeline Total</p>
                <p className="mt-1 text-2xl font-bold">{totalInFunnel}</p>
              </div>
              <IconChartBar className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Candidates across all stages
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hired</p>
                <p className="mt-1 text-2xl font-bold">
                  {analytics.pipelineFunnel.hired}
                </p>
              </div>
              <IconTarget className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Successfully completed pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Funnel + Rejections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Funnel</CardTitle>
            <CardDescription>Candidate progression through stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {FUNNEL_ORDER.map((stage) => {
                const stageCount = analytics.pipelineFunnel[stage];
                const percentage =
                  totalInFunnel > 0
                    ? Math.round((stageCount / totalInFunnel) * 100)
                    : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm text-muted-foreground">
                      {STAGE_LABELS[stage]}
                    </span>
                    <div className="flex-1">
                      <Progress value={percentage} className="h-2" />
                    </div>
                    <span className="w-14 text-right text-sm font-medium tabular-nums">
                      {stageCount}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Rejection Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rejection Breakdown</CardTitle>
            <CardDescription>Where candidates are being dropped</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {REJECTION_STAGES.map((stage) => {
                const stageCount = analytics.pipelineFunnel[stage];
                const totalRejected =
                  analytics.pipelineFunnel.ta_rejected +
                  analytics.pipelineFunnel.manager_rejected +
                  analytics.pipelineFunnel.hr_rejected;
                const percentage =
                  totalRejected > 0
                    ? Math.round((stageCount / totalRejected) * 100)
                    : 0;

                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {stageCount} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-2 rounded-full bg-red-500 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidates per Job + Monthly Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Candidates per Job */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidates per Job</CardTitle>
            <CardDescription>Top job positions by candidate volume</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.candidatesPerJob.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Title</TableHead>
                    <TableHead className="text-right">Candidates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.candidatesPerJob.map((entry, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{entry.jobTitle}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Monthly Hiring Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Hiring Trend</CardTitle>
            <CardDescription>Hired vs rejected candidates over time</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.monthlyHiringTrend.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available
              </p>
            ) : (
              <div className="space-y-3">
                {analytics.monthlyHiringTrend.map((month) => (
                  <div key={month.month} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">
                      {month.month}
                    </span>
                    <div className="flex flex-1 items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 tabular-nums"
                      >
                        {month.hired} hired
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400 tabular-nums"
                      >
                        {month.rejected} rejected
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Recruiters + Interviews per Stage */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Recruiters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Recruiters</CardTitle>
            <CardDescription>Most active talent acquisition specialists</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.topRecruiters.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recruiter</TableHead>
                    <TableHead className="text-right">Candidates Processed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.topRecruiters.map((recruiter, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{recruiter.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {recruiter.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {recruiter.candidatesProcessed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Interviews per Stage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interviews by Stage</CardTitle>
            <CardDescription>Distribution of interviews across pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.interviewsPerStage.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No interviews recorded
              </p>
            ) : (
              <div className="space-y-4">
                {analytics.interviewsPerStage.map((entry) => {
                  const totalInterviews = analytics.interviewsPerStage.reduce(
                    (sum, e) => sum + e.count,
                    0
                  );
                  const percentage =
                    totalInterviews > 0
                      ? Math.round((entry.count / totalInterviews) * 100)
                      : 0;

                  return (
                    <div key={entry.stage} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">
                          {entry.stage} Stage
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {entry.count} ({percentage}%)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
