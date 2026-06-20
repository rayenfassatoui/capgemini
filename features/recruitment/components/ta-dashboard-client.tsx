'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  IconArrowRight,
  IconBriefcase,
  IconCalendar,
  IconSearch,
  IconUsers,
  IconClock,
  IconVideo,
  IconCheck,
  IconX,
  IconMessageChatbot,
  IconPlus,
} from '@tabler/icons-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardStats, TodayInterview } from '@/features/recruitment/types';
import { cn } from '@/lib/utils';

interface TADashboardClientProps {
  stats: DashboardStats;
  interviews: TodayInterview[];
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function TADashboardClient({ stats, interviews }: TADashboardClientProps) {
  const candidateTrend =
    stats.totalCandidates > 0
      ? `${stats.pendingScreenings} candidate${stats.pendingScreenings === 1 ? '' : 's'} awaiting screening`
      : 'Upload CVs to start matching';
  const jobsTrend =
    stats.totalJobs > 0
      ? `${stats.totalJobs} active pipeline${stats.totalJobs === 1 ? '' : 's'} available`
      : 'Create a job requirement to open matching';
  const interviewsTrend =
    interviews.length > 0
      ? `${interviews.length} interview${interviews.length === 1 ? '' : 's'} scheduled today`
      : 'No interviews scheduled today';
  const screeningTrend =
    stats.pendingScreenings > 0
      ? 'Ask the agent to prioritize the queue'
      : 'Screening queue is clear';
  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Live recruitment command center for your TA workflow
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/agent">
            <Button variant="outline" className="w-full rounded-full bg-background/60 backdrop-blur sm:w-auto">
              <IconMessageChatbot className="mr-2 h-4 w-4" />
              Ask Agent
            </Button>
          </Link>
          <Link href="/ta/jobs">
            <Button className="w-full rounded-full shadow-lg shadow-primary/20 sm:w-auto">
              <IconPlus className="mr-2 h-4 w-4" />
              Create Job
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          title="Total Candidates"
          value={stats.totalCandidates}
          icon={IconUsers}
          trend={candidateTrend}
          color="blue"
        />
        <StatCard
          title="Active Jobs"
          value={stats.totalJobs}
          icon={IconBriefcase}
          trend={jobsTrend}
          color="purple"
        />
        <StatCard
          title="Today's Interviews"
          value={interviews.length}
          icon={IconCalendar}
          trend={interviewsTrend}
          color="amber"
        />
        <StatCard
          title="Pending Screenings"
          value={stats.pendingScreenings}
          icon={IconSearch}
          trend={screeningTrend}
          color="pink"
        />
      </motion.div>

      {/* Today's Interviews Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="rounded-2xl border bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 bg-white/5 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <IconCalendar className="w-5 h-5 text-primary" />
              Today&apos;s Interviews
            </h2>
            <Badge variant="outline" className="px-3 py-1">
              {interviews.length} Scheduled
            </Badge>
          </div>
        </div>
        
        <div className="p-2">
          {interviews.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b-0">
                  <TableHead className="w-[120px]">Time</TableHead>
                  <TableHead className="w-[250px]">Candidate</TableHead>
                  <TableHead>Job Role</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview) => (
                  <TableRow 
                    key={interview.interviewId}
                    className="group hover:bg-muted/30 border-b-0 transition-colors duration-200"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 text-primary bg-primary/10 w-fit px-3 py-1 rounded-md">
                        <IconClock className="w-4 h-4" />
                        {interview.scheduledTime}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {interview.candidateName}
                        </span>
                        <span className="text-muted-foreground text-xs truncate max-w-[200px]">
                          {interview.candidateEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        {interview.jobTitle}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal capitalize bg-muted/50">
                        {interview.stage.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={interview.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {interview.meetLink ? (
                        <Link
                          href={interview.meetLink}
                          target="_blank"
                          className={cn(
                            "inline-flex items-center justify-center gap-2 text-xs font-medium px-4 py-2 rounded-lg transition-all",
                            "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 shadow-sm hover:shadow-md"
                          )}
                        >
                          <IconVideo className="w-3.5 h-3.5" />
                          Join
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">
                          No link
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="m-4 flex min-h-72 flex-col items-center justify-center gap-5 rounded-xl border border-dashed bg-muted/5 p-8 text-center text-muted-foreground">
              <div className="rounded-full bg-background p-4 shadow-sm">
                <IconCalendar className="h-8 w-8 opacity-50" />
              </div>
              <div className="max-w-md">
                <p className="text-lg font-semibold text-foreground">No interviews scheduled today</p>
                <p className="mt-2 text-sm leading-6">
                  Use the available capacity to review pending CVs, create a new job requirement, or ask the agent to prioritize the next shortlist.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/ta/cv-pool">
                  <Button variant="outline" className="w-full rounded-full sm:w-auto">
                    Review CV Pool
                  </Button>
                </Link>
                <Link href="/agent">
                  <Button className="w-full rounded-full sm:w-auto">
                    Ask Agent
                    <IconArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color 
}: { 
  title: string; 
  value: number | string; 
  icon: React.ElementType; 
  trend?: string;
  color: 'blue' | 'purple' | 'amber' | 'pink';
}) {
  const colorStyles = {
    blue: "from-blue-500/10 to-blue-500/5 border-blue-200/20 text-blue-500",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-200/20 text-purple-500",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-200/20 text-amber-500",
    pink: "from-pink-500/10 to-pink-500/5 border-pink-200/20 text-pink-500",
  };

  return (
    <motion.div variants={item}>
      <Card className={cn(
        "relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group",
        "bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md", // Translucent background for glass effect
        colorStyles[color]
      )}>
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          color === 'blue' && "from-blue-500/10 via-transparent to-transparent",
          color === 'purple' && "from-purple-500/10 via-transparent to-transparent",
          color === 'amber' && "from-amber-500/10 via-transparent to-transparent",
          color === 'pink' && "from-pink-500/10 via-transparent to-transparent",
        )} />
        
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </CardTitle>
          <div className={cn("p-2 rounded-lg bg-background/50 shadow-sm transition-colors", colorStyles[color].split(" ").pop())}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold tracking-tight mt-2">{value}</div>
          {trend && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {trend}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 border-blue-200/50",
    completed: "bg-green-500/15 text-green-700 dark:text-green-300 hover:bg-green-500/25 border-green-200/50",
    cancelled: "bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 border-red-200/50",
    no_show: "bg-orange-500/15 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25 border-orange-200/50",
  };

  const icons = {
    scheduled: IconClock,
    completed: IconCheck,
    cancelled: IconX,
    no_show: IconX,
  };

  const Icon = icons[status as keyof typeof icons] || IconClock;
  const style = styles[status as keyof typeof styles] || styles.scheduled;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "capitalize pl-1.5 pr-2.5 py-0.5 border transition-colors flex w-fit items-center gap-1.5", 
        style
      )}
    >
      <Icon className="w-3 h-3" />
      {status.replace('_', ' ')}
    </Badge>
  );
}
