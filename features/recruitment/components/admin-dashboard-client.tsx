"use client";

import { motion, type Variants } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconUsers,
  IconBriefcase,
  IconFileText,
  IconCalendarEvent,
  IconUserShield,
  IconActivity,
  IconBrain,
  IconFileAnalytics,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { SystemOverview } from "@/features/recruitment/services/admin";
import { AdminAgentEvidencePanel } from "./admin-agent-evidence-panel";
import { formatUtcDateTime } from "@/lib/utils";
import {
  buildAdminAgentPrompt,
  buildDashboardAdminEvidence,
} from "./admin-agent-helpers";

interface AdminDashboardClientProps {
  overview: SystemOverview | null;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
    },
  },
};

const ROLE_COLORS: Record<string, string> = {
  ta: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  manager: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400",
  hr: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  admin: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
};

export function AdminDashboardClient({ overview }: AdminDashboardClientProps) {
  if (!overview) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Failed to load system overview.
      </div>
    );
  }

  const stats = [
    {
      label: "Total Users",
      value: overview.totalUsers,
      icon: IconUsers,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      gradient: "from-blue-500/20 to-blue-600/5",
    },
    {
      label: "Total Jobs",
      value: overview.totalJobs,
      icon: IconBriefcase,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      gradient: "from-emerald-500/20 to-emerald-600/5",
    },
    {
      label: "Total Candidates",
      value: overview.totalCandidates,
      icon: IconUserShield,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10",
      gradient: "from-purple-500/20 to-purple-600/5",
    },
    {
      label: "CVs in Pool",
      value: overview.totalCvsInPool,
      icon: IconFileText,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      gradient: "from-amber-500/20 to-amber-600/5",
    },
    {
      label: "Total Interviews",
      value: overview.totalInterviews,
      icon: IconCalendarEvent,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10",
      gradient: "from-rose-500/20 to-rose-600/5",
    },
  ];
  const adminEvidence = buildDashboardAdminEvidence(overview);
  const agentActions = [
    {
      label: "Summarize activity",
      description: "Explain recent platform activity and operational signal quality.",
      icon: IconActivity,
      prompt: buildAdminAgentPrompt({
        task: "Summarize recent system activity for an admin. Highlight what is observed, what cannot be concluded from this snapshot, and which actions need follow-up.",
        summary: adminEvidence,
      }),
    },
    {
      label: "Review access mix",
      description: "Assess role distribution and least-privilege review points.",
      icon: IconShieldCheck,
      prompt: buildAdminAgentPrompt({
        task: "Review the current user-role distribution for governance and least-privilege risks. Identify observed role counts, missing access evidence, and recommended review actions.",
        summary: adminEvidence,
      }),
    },
    {
      label: "Find ops anomalies",
      description: "Surface workload or audit anomalies worth investigating.",
      icon: IconFileAnalytics,
      prompt: buildAdminAgentPrompt({
        task: "Find operational anomalies in this admin overview. Consider workload volume, recent audited actions, destructive actions, and missing telemetry.",
        summary: adminEvidence,
      }),
    },
    {
      label: "Governance brief",
      description: "Create a concise admin handoff with risks and next checks.",
      icon: IconBrain,
      prompt: buildAdminAgentPrompt({
        task: "Prepare a governance brief for the recruitment platform owner. Separate facts from inferred risks and list the safest next checks.",
        summary: adminEvidence,
      }),
    },
  ] as const;


  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} variants={itemVariants}>
              <Card className="glass-card h-full relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50 group">
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                <CardContent className="pt-6 relative z-10 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-xl ${stat.bg} ring-1 ring-inset ring-black/5 dark:ring-white/10`}>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div className="flex items-center text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      Admin source
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground/80">{stat.label}</p>
                    <h3 className="text-2xl font-bold tracking-tight mt-1 text-foreground">{stat.value.toLocaleString()}</h3>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <motion.div variants={itemVariants}>
        <AdminAgentEvidencePanel summary={adminEvidence} actions={agentActions} />
      </motion.div>

      {/* Users by Role + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Users by Role */}
        <motion.div variants={itemVariants} className="h-full">
          <Card className="glass-card h-full border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <IconUsers className="h-4 w-4" />
                    </div>
                    Users by Role
                  </CardTitle>
                  <CardDescription className="mt-1">Role distribution for access governance review</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {overview.usersByRole.map((entry, index) => {
                  const percentage =
                    overview.totalUsers > 0
                      ? Math.round((entry.count / overview.totalUsers) * 100)
                      : 0;
                  
                  return (
                    <div key={entry.role} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`capitalize px-2.5 py-0.5 text-xs font-medium border-0 ring-1 ring-inset ring-black/5 dark:ring-white/10 ${ROLE_COLORS[entry.role] ?? "bg-gray-100 text-gray-700"}`}
                          >
                            {entry.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums text-foreground">{entry.count}</span>
                          <span className="text-muted-foreground text-xs">({percentage}%)</span>
                        </div>
                      </div>
                      
                      <div className="h-2.5 w-full rounded-full bg-secondary/50 overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
                        <motion.div
                          className={`h-full rounded-full ${entry.role === 'admin' ? 'bg-red-500' : entry.role === 'manager' ? 'bg-purple-500' : entry.role === 'ta' ? 'bg-blue-500' : 'bg-orange-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, ease: "circOut", delay: 0.2 + index * 0.1 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="h-full">
          <Card className="glass-card h-full border-border/50 shadow-sm flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <IconActivity className="h-4 w-4" />
                    </div>
                    Recent Activity
                  </CardTitle>
                  <CardDescription className="mt-1">Latest audited platform actions visible in this overview</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 pt-6">
              {overview.recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground border-2 border-dashed border-muted rounded-xl bg-muted/20">
                  <IconActivity className="h-10 w-10 mb-3 opacity-20" />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-gradient-to-b before:from-border before:via-border/50 before:to-transparent">
                  {overview.recentActivity.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="relative pl-6 group"
                    >
                      <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/30 group-hover:bg-primary group-hover:scale-125 transition-all duration-300 ring-4 ring-background shadow-sm" />
                      
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium leading-none text-foreground/90">
                            {entry.userName}
                          </p>
                          <time className="text-[10px] font-medium text-muted-foreground/50 whitespace-nowrap bg-secondary/50 px-2 py-0.5 rounded-full">
                            {entry.createdAt ? formatUtcDateTime(entry.createdAt) : "Unknown"}
                          </time>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          <span className={`${entry.action.includes('create') ? 'text-emerald-600 dark:text-emerald-400' : entry.action.includes('delete') ? 'text-red-600 dark:text-red-400' : 'text-primary'} font-medium`}>
                            {entry.action}
                          </span>
                          {" "}
                          <span className="font-medium text-foreground/70">{entry.entityType}</span>
                        </p>
                        
                        {entry.details && (
                          <div className="mt-1.5 text-xs bg-muted/40 p-2 rounded-md border border-border/50 text-muted-foreground/80 font-mono">
                            {entry.details}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
