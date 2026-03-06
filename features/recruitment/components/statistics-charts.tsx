"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from "recharts";
import {
  DonutChart,
  type DonutChartSegment,
} from "@/components/ui/donut-chart";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CvPoolStats,
  JobsStats,
  SmartInsights,
  CandidateStage,
} from "@/features/recruitment/types";
import {
  IconFileText,
  IconBriefcase,
  IconUsers,
  IconTrendingUp,
  IconSparkles,
  IconArrowRight,
  IconCode,
  IconLanguage,
} from "@tabler/icons-react";

// -- Pipeline donut colors mapped to stages --
const PIPELINE_COLORS: Record<string, string> = {
  new: "hsl(0 0% 63.9%)",
  ta_screening: "hsl(214.7 95% 55%)",
  ta_interview: "hsl(224.3 76.3% 48%)",
  ta_accepted: "hsl(142.1 76.2% 36.3%)",
  ta_rejected: "hsl(0 84.2% 60.2%)",
  manager_interview: "hsl(262.1 83.3% 57.8%)",
  manager_accepted: "hsl(271.5 81.3% 55.9%)",
  manager_rejected: "hsl(0 72.2% 50.6%)",
  hr_interview: "hsl(24.6 95% 53.1%)",
  hr_accepted: "hsl(20.5 90.2% 48.2%)",
  hr_rejected: "hsl(0 62.8% 30.6%)",
  hired: "hsl(142.1 70.6% 45.3%)",
};

const PIPELINE_LABELS: Record<string, string> = {
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

// -- Line chart config --
const uploadChartConfig = {
  count: {
    label: "CVs Uploaded",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

// -- Radar chart config --
const radarChartConfig = {
  demand: {
    label: "Demand",
    color: "var(--chart-1)",
  },
  supply: {
    label: "Supply",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

// -- Props --
interface StatisticsChartsProps {
  cvStats: CvPoolStats | null;
  jobsStats: JobsStats | null;
  insights: SmartInsights | null;
}

export function StatisticsCharts({
  cvStats,
  jobsStats,
  insights,
}: StatisticsChartsProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Overview Cards */}
      <motion.div
        className="grid gap-4 md:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants}>
          <OverviewCard
            title="Total CVs"
            value={cvStats?.totalCvs ?? 0}
            description="In your CV pool"
            icon={<IconFileText className="text-muted-foreground h-4 w-4" />}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <OverviewCard
            title="Total Jobs"
            value={jobsStats?.totalJobs ?? 0}
            description="Job requirements created"
            icon={<IconBriefcase className="text-muted-foreground h-4 w-4" />}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <OverviewCard
            title="Pipeline Total"
            value={
              insights
                ? Object.values(insights.pipelineFunnel).reduce(
                    (a, b) => a + b,
                    0
                  )
                : 0
            }
            description="Candidates in pipeline"
            icon={<IconUsers className="text-muted-foreground h-4 w-4" />}
          />
        </motion.div>
      </motion.div>

      {/* Charts Row: Donut + Line */}
      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="h-full">
          {insights ? (
            <PipelineDonutCard pipelineFunnel={insights.pipelineFunnel} />
          ) : (
            <EmptyCard message="Unable to load pipeline data" />
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          {cvStats && cvStats.uploadTrend.length > 0 ? (
            <UploadTrendLineCard uploadTrend={cvStats.uploadTrend} />
          ) : (
            <EmptyCard message="Unable to load upload trend" />
          )}
        </motion.div>
      </motion.div>

      {/* Skill Gap Radar + Top Skills */}
      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="h-full">
          {insights && insights.skillGapAnalysis.length > 0 ? (
            <SkillGapRadarCard skillGapAnalysis={insights.skillGapAnalysis} />
          ) : (
            <EmptyCard message="No skill gap data available" />
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          {cvStats ? (
            <TopSkillsCard
              topSkills={cvStats.topSkills}
              totalCvs={cvStats.totalCvs}
            />
          ) : (
            <EmptyCard message="Unable to load CV skills data" />
          )}
        </motion.div>
      </motion.div>

      {/* Jobs Breakdown + Languages + Demanded Roles */}
      <motion.div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="h-full">
          {jobsStats ? (
            <JobsBreakdownCard jobsStats={jobsStats} />
          ) : (
            <EmptyCard message="Unable to load job statistics" />
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          {cvStats ? (
            <LanguagesCard
              languageDistribution={cvStats.languageDistribution}
            />
          ) : (
            <EmptyCard message="Unable to load language data" />
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          {insights ? (
            <DemandedRolesCard
              mostDemandedJobProfiles={insights.mostDemandedJobProfiles}
            />
          ) : (
            <EmptyCard message="Unable to load demanded roles" />
          )}
        </motion.div>
      </motion.div>

      {/* Full-width Skill Gap Table */}
      {insights && insights.skillGapAnalysis.length > 0 && (
        <motion.div variants={containerVariants} initial="hidden" animate="show">
          <motion.div variants={itemVariants}>
            <SkillGapTableCard skillGapAnalysis={insights.skillGapAnalysis} />
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// -- Overview Card --
function OverviewCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/50 to-transparent" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          {value}
        </div>
        <p className="text-muted-foreground text-xs mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

// -- Empty Card --
function EmptyCard({ message }: { message: string }) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardContent className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

// -- Pipeline Donut Card --
function PipelineDonutCard({
  pipelineFunnel,
}: {
  pipelineFunnel: Record<CandidateStage, number>;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const donutData: DonutChartSegment[] = Object.entries(pipelineFunnel)
    .filter(([, count]) => count > 0)
    .map(([stage, count]) => ({
      value: count,
      color: PIPELINE_COLORS[stage] ?? "hsl(0 0% 63.9%)",
      label: PIPELINE_LABELS[stage] ?? stage,
      stage,
    }));

  const totalCandidates = donutData.reduce((sum, d) => sum + d.value, 0);
  const activeSegment = donutData.find((s) => s.label === hoveredSegment);
  const displayValue = activeSegment?.value ?? totalCandidates;
  const displayLabel = activeSegment?.label ?? "Total";

  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconTrendingUp className="size-4 text-muted-foreground" />
          Pipeline Distribution
        </CardTitle>
        <CardDescription>
          Candidates across recruitment stages
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <DonutChart
          data={donutData}
          size={220}
          strokeWidth={28}
          animationDuration={1.2}
          animationDelayPerSegment={0.05}
          highlightOnHover
          onSegmentHover={(seg) => setHoveredSegment(seg?.label ?? null)}
          centerContent={
            <AnimatePresence mode="wait">
              <motion.div
                key={displayLabel}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, ease: "circOut" }}
                className="flex flex-col items-center justify-center text-center"
              >
                <p className="text-muted-foreground text-xs font-medium truncate max-w-[120px]">
                  {displayLabel}
                </p>
                <p className="text-3xl font-bold text-foreground">
                  {displayValue}
                </p>
                {activeSegment && (
                  <p className="text-sm font-medium text-muted-foreground">
                    {((activeSegment.value / totalCandidates) * 100).toFixed(0)}
                    %
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          }
        />

        {/* Legend */}
        <div className="flex flex-col gap-1.5 w-full border-t border-border pt-4">
          {donutData.map((segment, index) => (
            <motion.div
              key={segment.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2 + index * 0.06, duration: 0.4 }}
              className={cn(
                "flex items-center justify-between px-2 py-1.5 rounded-md transition-all duration-200 cursor-pointer",
                hoveredSegment === segment.label && "bg-muted"
              )}
              onMouseEnter={() => setHoveredSegment(segment.label)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-xs font-medium text-foreground">
                  {segment.label}
                </span>
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {segment.value}
              </span>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// -- Upload Trend Line Card --
function UploadTrendLineCard({
  uploadTrend,
}: {
  uploadTrend: Array<{ date: string; count: number }>;
}) {
  const chartData = uploadTrend.map((d) => ({
    date: d.date.slice(5), // MM-DD
    count: d.count,
  }));

  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconFileText className="size-4 text-muted-foreground" />
          CV Upload Trend
        </CardTitle>
        <CardDescription>Last 7 days upload activity</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={uploadChartConfig}
          className="h-[260px] w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
        >
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="4 8"
              stroke="var(--input)"
              strokeOpacity={1}
              horizontal
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: "var(--text-muted-foreground)",
              }}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: "var(--text-muted-foreground)",
              }}
              tickMargin={10}
              allowDecimals={false}
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{
                strokeDasharray: "3 3",
                stroke: "var(--input)",
              }}
            />
            <Line
              dataKey="count"
              type="monotone"
              stroke="var(--color-count)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>

        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-2">
            <div
              className="size-3 border-[3px] rounded-full bg-background"
              style={{ borderColor: "var(--chart-1)" }}
            />
            <span className="text-xs text-muted-foreground">
              CVs Uploaded
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -- Skill Gap Radar Card --
function SkillGapRadarCard({
  skillGapAnalysis,
}: {
  skillGapAnalysis: Array<{ skill: string; demand: number; supply: number }>;
}) {
  const radarData = skillGapAnalysis.slice(0, 8).map((item) => ({
    skill: item.skill.length > 12 ? item.skill.slice(0, 10) + ".." : item.skill,
    demand: item.demand,
    supply: item.supply,
  }));

  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader className="items-center pb-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconSparkles className="size-4 text-muted-foreground" />
          Skill Gap Radar
          <Badge variant="secondary" className="ml-1 text-[10px]">
            Demand vs Supply
          </Badge>
        </CardTitle>
        <CardDescription>
          Comparing job demand against available CV skills
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <ChartContainer
          config={radarChartConfig}
          className="mx-auto aspect-square max-h-[260px]"
        >
          <RadarChart data={radarData}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <PolarAngleAxis dataKey="skill" />
            <PolarGrid strokeDasharray="3 3" />
            <Radar
              stroke="var(--color-demand)"
              dataKey="demand"
              fill="var(--color-demand)"
              fillOpacity={0.1}
            />
            <Radar
              stroke="var(--color-supply)"
              dataKey="supply"
              fill="var(--color-supply)"
              fillOpacity={0.1}
            />
          </RadarChart>
        </ChartContainer>
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="flex items-center gap-2">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: "var(--chart-1)" }}
            />
            <span className="text-xs text-muted-foreground">Demand</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: "var(--chart-4)" }}
            />
            <span className="text-xs text-muted-foreground">Supply</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -- Top Skills Card --
function TopSkillsCard({
  topSkills,
  totalCvs,
}: {
  topSkills: Array<{ skill: string; count: number }>;
  totalCvs: number;
}) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconCode className="size-4 text-muted-foreground" />
          Top CV Skills
        </CardTitle>
        <CardDescription>Most common skills in your CV pool</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topSkills.slice(0, 10).map((item) => {
            const pct =
              totalCvs > 0 ? Math.round((item.count / totalCvs) * 100) : 0;
            return (
              <div key={item.skill} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{item.skill}</span>
                  <span className="text-muted-foreground ml-2 tabular-nums">
                    {item.count} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
          {topSkills.length === 0 && (
            <p className="text-xs text-muted-foreground">No skills data yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// -- Jobs Breakdown Card --
function JobsBreakdownCard({ jobsStats }: { jobsStats: JobsStats }) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconBriefcase className="size-4 text-muted-foreground" />
          Jobs Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            By Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {jobsStats.byStatus.map((item) => (
              <Badge
                key={item.status}
                variant={item.status === "open" ? "default" : "secondary"}
                className="text-xs capitalize"
              >
                {item.status} ({item.count})
              </Badge>
            ))}
            {jobsStats.byStatus.length === 0 && (
              <p className="text-xs text-muted-foreground">No data</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            By Seniority
          </p>
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
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Top Skills Demand
          </p>
          <div className="space-y-1">
            {jobsStats.topSkillsDemand.slice(0, 6).map((item, idx) => (
              <div key={item.skill} className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                  {idx + 1}
                </span>
                <span className="flex-1 font-medium truncate">
                  {item.skill}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -- Languages Card --
function LanguagesCard({
  languageDistribution,
}: {
  languageDistribution: Array<{ language: string; count: number }>;
}) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconLanguage className="size-4 text-muted-foreground" />
          CV Languages
        </CardTitle>
        <CardDescription>Language distribution in CV pool</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {languageDistribution.map((item) => (
            <Badge key={item.language} variant="secondary" className="text-xs">
              {item.language}
              <span className="ml-1.5 text-muted-foreground">
                {item.count}
              </span>
            </Badge>
          ))}
          {languageDistribution.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No language data yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// -- Demanded Roles Card --
function DemandedRolesCard({
  mostDemandedJobProfiles,
}: {
  mostDemandedJobProfiles: Array<{ title: string; count: number }>;
}) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconBriefcase className="size-4 text-muted-foreground" />
          Most Demanded Roles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {mostDemandedJobProfiles.slice(0, 8).map((item, idx) => (
            <div key={item.title} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                {idx + 1}
              </span>
              <span className="flex-1 text-xs font-medium truncate">
                {item.title}
              </span>
              <Badge variant="secondary" className="text-[10px] h-5">
                {item.count}
              </Badge>
            </div>
          ))}
          {mostDemandedJobProfiles.length === 0 && (
            <p className="text-xs text-muted-foreground">No job data yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// -- Skill Gap Table Card --
function SkillGapTableCard({
  skillGapAnalysis,
}: {
  skillGapAnalysis: Array<{ skill: string; demand: number; supply: number }>;
}) {
  return (
    <Card className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <IconSparkles className="size-4 text-primary" />
          Skill Gap Analysis
          <span className="text-[10px] text-muted-foreground font-normal ml-1">
            Demand (jobs) vs Supply (CV pool)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {skillGapAnalysis.slice(0, 12).map((item) => {
            const gap = item.demand - item.supply;
            const maxVal = Math.max(item.demand, item.supply, 1);
            return (
              <div key={item.skill} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium capitalize">{item.skill}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-500 tabular-nums">
                      {item.demand} demand
                    </span>
                    <IconArrowRight className="size-3 text-muted-foreground" />
                    <span className="text-green-500 tabular-nums">
                      {item.supply} supply
                    </span>
                    {gap > 0 && (
                      <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
                        -{gap} gap
                      </Badge>
                    )}
                    {gap < 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                        +{Math.abs(gap)} surplus
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(item.demand / maxVal) * 100}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-green-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(item.supply / maxVal) * 100}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
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
  );
}
