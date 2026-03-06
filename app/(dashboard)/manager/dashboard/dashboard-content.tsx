'use client';

import { motion, type Variants } from 'framer-motion';
import { 
  IconUsers, 
  IconCalendarEvent, 
  IconClock, 
  IconBriefcase,
} from '@tabler/icons-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TodayInterview } from '@/features/recruitment/types';

interface DashboardStats {
  totalCandidates: number;
  stageBreakdown: Record<string, number>;
}

interface DashboardContentProps {
  stats: DashboardStats | null;
  todayInterviews: TodayInterview[];
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15
    }
  }
};

export function DashboardContent({ stats, todayInterviews }: DashboardContentProps) {
  const candidatesToReview = stats?.stageBreakdown?.['manager_interview'] ?? 0;
  const interviewsTodayCount = todayInterviews?.length ?? 0;
  
  // Quick stats for the top cards
  const statCards = [
    {
      title: "Candidates to Review",
      value: candidatesToReview,
      icon: IconUsers,
      description: "Awaiting your interview",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20"
    },
    {
      title: "Interviews Today",
      value: interviewsTodayCount,
      icon: IconCalendarEvent,
      description: "Scheduled for today",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20"
    },
    {
      title: "Total Active",
      value: stats?.totalCandidates ?? 0,
      icon: IconBriefcase,
      description: "Candidates in pipeline",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20"
    }
  ];

  return (
    <motion.div 
      className="space-y-8 p-8 min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div 
        variants={itemVariants}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Welcome back, Manager. Here&apos;s what needs your attention.
          </p>
        </div>
        <div className="flex items-center gap-3">
           <Link 
             href="/manager/candidates" 
             className={cn(buttonVariants(), "shadow-lg hover:shadow-primary/25 transition-all")}
           >
              View All Candidates
           </Link>
        </div>
      </motion.div>

      <motion.div 
        variants={containerVariants}
        className="grid gap-6 md:grid-cols-3"
      >
        {statCards.map((stat) => (
          <motion.div key={stat.title} variants={itemVariants}>
            <Card className={`relative overflow-hidden border ${stat.border} bg-background/60 backdrop-blur-xl hover:shadow-lg transition-all duration-300 group`}>
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${stat.bg.replace('bg-', 'from-').replace('/10', '/5')} to-transparent pointer-events-none`} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`p-2 rounded-full ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className="grid gap-6">
        <Card className="col-span-1 border-border/50 bg-background/60 backdrop-blur-xl shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Today&apos;s Schedule</CardTitle>
                <CardDescription>
                  Your interview schedule for {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </CardDescription>
              </div>
              <Badge variant="outline" className="px-3 py-1">
                {todayInterviews.length} {todayInterviews.length === 1 ? 'Interview' : 'Interviews'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!todayInterviews || todayInterviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border-2 border-dashed border-muted rounded-lg bg-muted/5">
                <div className="p-4 rounded-full bg-background mb-4 shadow-sm">
                  <IconCalendarEvent className="h-8 w-8 opacity-50" />
                </div>
                <h3 className="font-medium text-lg">No interviews scheduled</h3>
                <p className="max-w-xs mx-auto mt-2">You&apos;re all caught up for today. Check the candidates list to schedule new interviews.</p>
                <Link 
                  href="/manager/candidates" 
                  className={cn(buttonVariants({ variant: "outline" }), "mt-6")}
                >
                  Browse Candidates
                </Link>
              </div>
            ) : (
              <div className="rounded-md border bg-background/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[150px]">Time</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Job Role</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayInterviews.map((interview) => (
                      <TableRow key={interview.interviewId} className="group hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 text-foreground">
                            <IconClock className="h-4 w-4 text-muted-foreground" />
                            {interview.scheduledTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/manager/candidates/${interview.candidateId}`} className="group-hover:text-primary transition-colors">
                            <div className="flex flex-col">
                              <span className="font-semibold">{interview.candidateName}</span>
                              <span className="text-xs text-muted-foreground">{interview.candidateEmail}</span>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{interview.jobTitle}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal capitalize bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 border-blue-200 dark:border-blue-900">
                            {interview.stage.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={interview.status === 'completed' ? 'secondary' : 'default'}
                            className={`capitalize ${
                              interview.status === 'completed' 
                                ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900' 
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900'
                            }`}
                          >
                            {interview.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {interview.meetLink && (
                              <a 
                                href={interview.meetLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 gap-1")}
                              >
                                Join
                              </a>
                            )}
                            <Link 
                              href={`/manager/candidates/${interview.candidateId}`}
                              className={cn(buttonVariants({ size: "sm" }), "h-8")}
                            >
                              Review
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
