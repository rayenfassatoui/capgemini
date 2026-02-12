import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  getCvPoolStatsAction,
  getJobsStatsAction,
  getSmartInsightsAction,
} from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import type {
  CvPoolStats,
  JobsStats,
  SmartInsights,
} from '@/features/recruitment/types';
import {
  IconFileText,
  IconBriefcase,
  IconCode,
  IconLanguage,
  IconTrendingUp,
  IconSparkles,
  IconArrowRight,
  IconChartBar,
  IconUsers,
} from '@tabler/icons-react';

export default async function StatistiquePage() {
  await requireRole(['ta', 'admin']);

  const [cvStatsResult, jobsStatsResult, insightsResult] =
    await Promise.allSettled([
      getCvPoolStatsAction(),
      getJobsStatsAction(),
      getSmartInsightsAction(),
    ]);

  const cvStats: CvPoolStats | null =
    cvStatsResult.status === 'fulfilled' && cvStatsResult.value
      ? (cvStatsResult.value as CvPoolStats)
      : null;

  const jobsStats: JobsStats | null =
    jobsStatsResult.status === 'fulfilled' && jobsStatsResult.value
      ? (jobsStatsResult.value as JobsStats)
      : null;

  const insights: SmartInsights | null =
    insightsResult.status === 'fulfilled' && insightsResult.value
      ? (insightsResult.value as SmartInsights)
      : null;

  // Pipeline funnel stages
  const funnelStages = [
    { key: 'new', label: 'New', color: 'bg-gray-400' },
    { key: 'ta_screening', label: 'TA Screening', color: 'bg-blue-400' },
    { key: 'ta_interview', label: 'TA Interview', color: 'bg-indigo-400' },
    { key: 'ta_accepted', label: 'TA Accepted', color: 'bg-green-400' },
    { key: 'manager_interview', label: 'Manager Interview', color: 'bg-purple-400' },
    { key: 'manager_accepted', label: 'Manager Accepted', color: 'bg-purple-500' },
    { key: 'hr_interview', label: 'HR Interview', color: 'bg-orange-400' },
    { key: 'hr_accepted', label: 'HR Accepted', color: 'bg-orange-500' },
    { key: 'hired', label: 'Hired', color: 'bg-emerald-500' },
  ] as const;

  const maxFunnelValue = insights
    ? Math.max(
        ...funnelStages.map(
          (s) =>
            (insights.pipelineFunnel[
              s.key as keyof typeof insights.pipelineFunnel
            ] ?? 0)
        ),
        1
      )
    : 1;

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Statistics
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete analytics across your CV pool, job requirements, and
          recruitment pipeline
        </p>
      </div>

      {/* ===== Overview Cards ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total CVs</CardTitle>
            <IconFileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cvStats?.totalCvs ?? 0}</div>
            <p className="text-muted-foreground text-xs mt-1">
              In your CV pool
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <IconBriefcase className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobsStats?.totalJobs ?? 0}
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Job requirements created
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pipeline Total
            </CardTitle>
            <IconUsers className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {insights
                ? Object.values(insights.pipelineFunnel).reduce(
                    (a, b) => a + b,
                    0
                  )
                : 0}
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Candidates in pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ===== CV Pool Section ===== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <IconFileText className="size-5 text-blue-500" />
          <h2 className="text-xl font-semibold tracking-tight">
            CV Pool Analytics
          </h2>
        </div>
        <Separator />

        {cvStats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Top Skills */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconCode className="size-4 text-muted-foreground" />
                  Top Skills in CVs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cvStats.topSkills.map((item) => {
                    const pct = Math.round(
                      (item.count / cvStats.totalCvs) * 100
                    );
                    return (
                      <div key={item.skill} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate">
                            {item.skill}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {cvStats.topSkills.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No skills data yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Languages */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconLanguage className="size-4 text-muted-foreground" />
                  Languages in CVs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {cvStats.languageDistribution.map((item) => (
                    <Badge
                      key={item.language}
                      variant="secondary"
                      className="text-xs"
                    >
                      {item.language}
                      <span className="ml-1.5 text-muted-foreground">
                        {item.count}
                      </span>
                    </Badge>
                  ))}
                  {cvStats.languageDistribution.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No language data yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Upload Trend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconChartBar className="size-4 text-muted-foreground" />
                  Upload Trend (7 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1.5 h-24">
                  {cvStats.uploadTrend.map((day) => {
                    const maxCount = Math.max(
                      ...cvStats.uploadTrend.map((d) => d.count),
                      1
                    );
                    const heightPct = (day.count / maxCount) * 100;
                    const shortDate = day.date.slice(5); // MM-DD
                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {day.count}
                        </span>
                        <div className="w-full bg-muted rounded-sm overflow-hidden relative flex-1">
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-sm transition-all duration-500"
                            style={{
                              height: `${Math.max(heightPct, 4)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {shortDate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">
                Unable to load CV pool statistics
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ===== Jobs Section ===== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <IconBriefcase className="size-5 text-purple-500" />
          <h2 className="text-xl font-semibold tracking-tight">
            Job Requirements Analytics
          </h2>
        </div>
        <Separator />

        {jobsStats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* By Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  By Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {jobsStats.byStatus.map((item) => (
                    <Badge
                      key={item.status}
                      variant={
                        item.status === 'open' ? 'default' : 'secondary'
                      }
                      className="text-xs capitalize"
                    >
                      {item.status} ({item.count})
                    </Badge>
                  ))}
                  {jobsStats.byStatus.length === 0 && (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By Seniority */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  By Seniority
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {jobsStats.bySeniority.map((item) => (
                    <Badge
                      key={item.seniority}
                      variant="outline"
                      className="text-xs capitalize"
                    >
                      {item.seniority} ({item.count})
                    </Badge>
                  ))}
                  {jobsStats.bySeniority.length === 0 && (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* By Business Unit */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  By Business Unit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {jobsStats.byBusinessUnit.map((item) => (
                    <Badge
                      key={item.unit}
                      variant="secondary"
                      className="text-xs"
                    >
                      {item.unit} ({item.count})
                    </Badge>
                  ))}
                  {jobsStats.byBusinessUnit.length === 0 && (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Skills Demand */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconCode className="size-4 text-muted-foreground" />
                  Skills Demand
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {jobsStats.topSkillsDemand.slice(0, 8).map((item, idx) => (
                    <div
                      key={item.skill}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium truncate">
                        {item.skill}
                      </span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                  {jobsStats.topSkillsDemand.length === 0 && (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">
                Unable to load job statistics
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ===== Smart Insights Section ===== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <IconSparkles className="size-5 text-amber-500" />
          <h2 className="text-xl font-semibold tracking-tight">
            Smart Insights
          </h2>
        </div>
        <Separator />

        {insights ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Pipeline Funnel */}
              <Card className="lg:row-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IconTrendingUp className="size-4 text-muted-foreground" />
                    Pipeline Funnel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {funnelStages.map((stage) => {
                      const value =
                        insights.pipelineFunnel[
                          stage.key as keyof typeof insights.pipelineFunnel
                        ] ?? 0;
                      return (
                        <div key={stage.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate">
                              {stage.label}
                            </span>
                            <span className="font-medium tabular-nums">
                              {value}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                              style={{
                                width: `${(value / maxFunnelValue) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Most Demanded Roles */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IconBriefcase className="size-4 text-muted-foreground" />
                    Most Demanded Roles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {insights.mostDemandedJobProfiles
                      .slice(0, 8)
                      .map((item, idx) => (
                        <div
                          key={item.title}
                          className="flex items-center gap-2"
                        >
                          <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-xs font-medium truncate">
                            {item.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5"
                          >
                            {item.count}
                          </Badge>
                        </div>
                      ))}
                    {insights.mostDemandedJobProfiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No job data yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Most Common CV Skills */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IconCode className="size-4 text-muted-foreground" />
                    Most Common CV Skills
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {insights.mostCommonCvSkills
                      .slice(0, 8)
                      .map((item, idx) => (
                        <div
                          key={item.skill}
                          className="flex items-center gap-2"
                        >
                          <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-xs font-medium truncate">
                            {item.skill}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {item.count}
                          </span>
                        </div>
                      ))}
                    {insights.mostCommonCvSkills.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No CV skills data yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Skill Gap Analysis - Full Width */}
            {insights.skillGapAnalysis.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IconSparkles className="size-4 text-primary" />
                    Skill Gap Analysis
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">
                      Demand (jobs) vs Supply (CV pool)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {insights.skillGapAnalysis.slice(0, 12).map((item) => {
                      const gap = item.demand - item.supply;
                      const maxVal = Math.max(item.demand, item.supply, 1);
                      return (
                        <div key={item.skill} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium capitalize">
                              {item.skill}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-blue-500 tabular-nums">
                                {item.demand} demand
                              </span>
                              <IconArrowRight className="size-3 text-muted-foreground" />
                              <span className="text-green-500 tabular-nums">
                                {item.supply} supply
                              </span>
                              {gap > 0 && (
                                <Badge
                                  variant="destructive"
                                  className="text-[9px] h-4 px-1.5"
                                >
                                  -{gap} gap
                                </Badge>
                              )}
                              {gap < 0 && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] h-4 px-1.5 text-green-600"
                                >
                                  +{Math.abs(gap)} surplus
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                style={{
                                  width: `${(item.demand / maxVal) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all duration-500"
                                style={{
                                  width: `${(item.supply / maxVal) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="size-2 rounded-full bg-blue-500" />
                      Demand (from jobs)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-2 rounded-full bg-green-500" />
                      Supply (from CVs)
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">
                Unable to load smart insights
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
