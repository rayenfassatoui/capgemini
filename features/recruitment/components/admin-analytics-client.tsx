"use client";

import type { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { AnalyticsStatCard } from "./analytics/analytics-stat-card";
import { PipelineFunnelChart } from "./analytics/pipeline-funnel-chart";
import { RejectionBreakdownChart } from "./analytics/rejection-breakdown-chart";
import { HiringTrendChart } from "./analytics/hiring-trend-chart";
import { TopRecruitersList } from "./analytics/top-recruiters-list";
import { CandidatesPerJobList } from "./analytics/candidates-per-job-list";
import { IconUsers, IconTarget, IconTrendingUp, IconTrendingDown, IconBrain, IconFileAnalytics } from "@tabler/icons-react";
import { AdminAgentEvidencePanel } from "./admin-agent-evidence-panel";
import {
  buildAdminAgentPrompt,
  buildAnalyticsAdminEvidence,
} from "./admin-agent-helpers";
import { motion, type Variants } from "framer-motion";

interface AdminAnalyticsClientProps {
  analytics: RecruitmentAnalytics | null;
}

export function AdminAnalyticsClient({ analytics }: AdminAnalyticsClientProps) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground bg-white/50 dark:bg-black/20 backdrop-blur-xl rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
        <div className="text-center">
          <p className="text-lg font-medium">Failed to load analytics</p>
          <p className="text-sm">Please try refreshing the page later.</p>
        </div>
      </div>
    );
  }

  const totalInFunnel = Object.values(analytics.pipelineFunnel).reduce(
    (sum, val) => sum + val,
    0
  );
  const analyticsEvidence = buildAnalyticsAdminEvidence(analytics);
  const agentActions = [
    {
      label: "Explain trends",
      description: "Interpret funnel, hiring, rejection, and workload signals.",
      icon: IconFileAnalytics,
      prompt: buildAdminAgentPrompt({
        task: "Interpret recruitment analytics for an admin. Explain the pipeline trend, rejection/hiring balance, bottlenecks, and source limits.",
        summary: analyticsEvidence,
      }),
    },
    {
      label: "Find bottlenecks",
      description: "Identify stages and jobs that need operational follow-up.",
      icon: IconTrendingDown,
      prompt: buildAdminAgentPrompt({
        task: "Find recruitment pipeline bottlenecks from the analytics dataset. Separate observed counts from inferred causes and recommended operational checks.",
        summary: analyticsEvidence,
      }),
    },
    {
      label: "Governance risks",
      description: "Review incomplete measurement and decision-quality risks.",
      icon: IconBrain,
      prompt: buildAdminAgentPrompt({
        task: "Review analytics governance risks. Focus on missing time-to-hire, stage aging, owner workload, and where conclusions would be unsafe without more evidence.",
        summary: analyticsEvidence,
      }),
    },
  ] as const;


  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-10"
    >
      {/* Top Metrics */}
      <motion.div variants={item} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsStatCard
          title="Pipeline Total"
          value={totalInFunnel}
          description="Candidates across all stages"
          icon={IconUsers}
          color="blue"
        />
        <AnalyticsStatCard
          title="Hiring Rate"
          value={`${analytics.hiringRate}%`}
          description="Of all candidates entering pipeline"
          trend={{ value: analytics.hiringRate, direction: "up" }}
          icon={IconTrendingUp}
          color="emerald"
        />
        <AnalyticsStatCard
          title="Rejection Rate"
          value={`${analytics.rejectionRate}%`}
          description="Combined across all stages"
          trend={{ value: analytics.rejectionRate, direction: "down" }}
          icon={IconTrendingDown}
          color="rose"
        />
        <AnalyticsStatCard
          title="Hired"
          value={analytics.pipelineFunnel.hired}
          description="Successfully completed pipeline"
          icon={IconTarget}
          color="purple"
        />
      </motion.div>

      <motion.div variants={item}>
        <AdminAgentEvidencePanel summary={analyticsEvidence} actions={agentActions} />
      </motion.div>

      {/* Main Charts Area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pipeline Funnel - Takes 2 cols */}
        <motion.div variants={item} className="lg:col-span-2">
          <PipelineFunnelChart analytics={analytics} />
        </motion.div>
        
        {/* Rejection Breakdown - Takes 1 col */}
        <motion.div variants={item} className="lg:col-span-1">
          <RejectionBreakdownChart analytics={analytics} />
        </motion.div>
      </div>

      {/* Secondary Charts Area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hiring Trend - Takes 2 cols */}
        <motion.div variants={item} className="lg:col-span-2">
          <HiringTrendChart analytics={analytics} />
        </motion.div>

        {/* Candidates per Job - Takes 1 col */}
        <motion.div variants={item} className="lg:col-span-1">
          <CandidatesPerJobList analytics={analytics} />
        </motion.div>
      </div>

      {/* Recruiters & Other lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div variants={item}>
          <TopRecruitersList analytics={analytics} />
        </motion.div>
        
        <motion.div variants={item}>
          <div className="bg-white/80 dark:bg-black/40 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5 rounded-xl p-6 h-full">
            <div className="space-y-1 mb-6">
              <h3 className="text-lg font-semibold tracking-tight text-foreground/90">Interviews by Stage</h3>
              <p className="text-xs font-medium text-muted-foreground/80">Distribution of interviews by workflow stage</p>
            </div>
            <div className="space-y-4">
              {analytics.interviewsPerStage.map((entry, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-muted-foreground capitalize">{entry.stage.replace(/_/g, ' ')}</span>
                    <span className="font-bold">{entry.count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(entry.count / Math.max(...analytics.interviewsPerStage.map(e => e.count), 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {analytics.interviewsPerStage.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No interviews recorded.</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
