import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getDashboardStatsAction,
  getTodayInterviewScheduleAction,
} from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import type {
  DashboardStats,
  TodayInterview,
} from '@/features/recruitment/types';
import {
  IconBriefcase,
  IconCalendar,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import Link from 'next/link';

export default async function TADashboardPage() {
  await requireRole(['ta', 'admin']);
  // Parallel data fetching
  const [statsData, scheduleData] = await Promise.allSettled([
    getDashboardStatsAction(),
    getTodayInterviewScheduleAction(),
  ]);

  // Handle potential errors or empty states from actions
  const stats: DashboardStats =
    statsData.status === 'fulfilled' && statsData.value
      ? (statsData.value as DashboardStats)
      : {
          totalCandidates: 0,
          totalJobs: 0,
          totalInterviewsToday: 0,
          pendingScreenings: 0,
          stageBreakdown: {} as Record<string, number>,
        };

  const interviews: TodayInterview[] =
    scheduleData.status === 'fulfilled' && Array.isArray(scheduleData.value)
      ? (scheduleData.value as TodayInterview[])
      : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Talent Acquisition overview
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Candidates
            </CardTitle>
            <IconUsers className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCandidates}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <IconBriefcase className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Today's Interviews
            </CardTitle>
            <IconCalendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalInterviewsToday}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Screenings
            </CardTitle>
            <IconSearch className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingScreenings}</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Interviews Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Today's Interviews
        </h2>
        
        <Card>
          {interviews.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meet Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((interview: TodayInterview) => (
                  <TableRow key={interview.interviewId}>
                    <TableCell className="font-medium">
                      {interview.scheduledTime}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {interview.candidateName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {interview.candidateEmail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{interview.jobTitle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {interview.stage.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          interview.status === 'scheduled'
                            ? 'default'
                            : interview.status === 'completed'
                            ? 'secondary'
                            : 'destructive'
                        }
                        className="capitalize"
                      >
                        {interview.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {interview.meetLink ? (
                        <Link
                          href={interview.meetLink}
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          Join Meeting
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          -
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-2 p-8 text-center">
              <IconCalendar className="h-8 w-8 opacity-50" />
              <p>No interviews scheduled for today.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
