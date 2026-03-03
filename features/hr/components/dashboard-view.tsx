'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconUsers, IconCalendarEvent, IconCheck, IconVideo, IconBriefcase, IconClock } from '@tabler/icons-react';
import { DashboardStats, TodayInterview } from '@/features/recruitment/types';
import { cn } from '@/lib/utils';

interface DashboardViewProps {
  stats: DashboardStats;
  interviews: TodayInterview[];
  toReviewCount: number;
  acceptedCount: number;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};
const MotionTableRow = motion(TableRow);

export function DashboardView({ stats, interviews, toReviewCount, acceptedCount }: DashboardViewProps) {
  return (
    <motion.div 
      className="space-y-8 p-8 max-w-7xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
          HR Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Overview of your recruitment pipeline and daily schedule.
        </p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-3">
        <StatsCard 
          title="Candidates to Review" 
          value={toReviewCount}
          description="Awaiting HR interview"
          icon={<IconUsers className="h-5 w-5" />}
          gradient="from-blue-500/20 to-cyan-500/20"
          border="border-blue-500/20"
        />
        <StatsCard 
          title="Today's Interviews" 
          value={stats.totalInterviewsToday}
          description="Scheduled for today"
          icon={<IconCalendarEvent className="h-5 w-5" />}
          gradient="from-purple-500/20 to-pink-500/20"
          border="border-purple-500/20"
        />
        <StatsCard 
          title="Accepted Candidates" 
          value={acceptedCount}
          description="Passed HR stage"
          icon={<IconCheck className="h-5 w-5" />}
          gradient="from-emerald-500/20 to-green-500/20"
          border="border-emerald-500/20"
        />
      </div>

      <motion.div variants={item}>
        <Card className="overflow-hidden border-none shadow-lg bg-white/50 dark:bg-black/50 backdrop-blur-xl ring-1 ring-gray-200 dark:ring-gray-800">
          <CardHeader className="bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Today's Interview Schedule</CardTitle>
                <CardDescription>Upcoming interviews scheduled for today.</CardDescription>
              </div>
              <Badge variant="outline" className="px-3 py-1">
                {interviews.length} Scheduled
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-b border-gray-100 dark:border-gray-800">
                  <TableHead className="w-[120px]">Time</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job Position</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <IconCalendarEvent className="h-8 w-8 opacity-20" />
                        <p>No interviews scheduled for today.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  interviews.map((interview, index) => (
                    <MotionTableRow 
                      key={interview.interviewId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="group border-b border-gray-100 dark:border-gray-800 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <IconClock className="h-4 w-4 text-muted-foreground" />
                          {interview.scheduledTime}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{interview.candidateName}</span>
                          <span className="text-xs text-muted-foreground">{interview.candidateEmail}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IconBriefcase className="h-3 w-3 text-muted-foreground" />
                          <span>{interview.jobTitle}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-semibold">
                          {interview.stage.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={interview.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {interview.meetLink && (
                          <a 
                            href={interview.meetLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-full h-8 px-4 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
                          >
                            <IconVideo className="mr-2 h-3 w-3" />
                            Join
                          </a>
                        )}
                      </TableCell>
                    </MotionTableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function StatsCard({ title, value, description, icon, gradient, border }: { 
  title: string; 
  value: number; 
  description: string; 
  icon: React.ReactNode;
  gradient: string;
  border: string;
}) {
  return (
    <motion.div variants={item} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
      <Card className={cn("overflow-hidden border shadow-sm h-full bg-white/40 dark:bg-black/40 backdrop-blur-md transition-all duration-300 hover:shadow-md", border)}>
        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30", gradient)} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="p-2 bg-background/50 rounded-full backdrop-blur-sm shadow-sm">
            {icon}
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold tracking-tight">{value}</div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    scheduled: "secondary",
    cancelled: "destructive",
  };

  return (
    <Badge variant={variants[status] || "outline"} className="capitalize">
      {status}
    </Badge>
  );
}
