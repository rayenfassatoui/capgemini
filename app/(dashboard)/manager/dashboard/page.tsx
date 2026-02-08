import { getDashboardStatsAction, getTodayInterviewScheduleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IconUsers, IconCalendarEvent, IconClock } from '@tabler/icons-react';
import Link from 'next/link';
import type { TodayInterview } from '@/features/recruitment/types';

export default async function ManagerDashboardPage() {
  await requireRole(['manager', 'admin']);
  const [stats, todayInterviews] = await Promise.all([
    getDashboardStatsAction().catch(() => null),
    getTodayInterviewScheduleAction().catch(() => [])
  ]);

  const candidatesToReview = stats?.stageBreakdown?.['manager_interview'] ?? 0;
  const interviewsTodayCount = todayInterviews?.length ?? 0;

  return (
    <div className="space-y-8 p-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Overview of your recruitment activities
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Link href="/manager/candidates" className="inline-flex items-center justify-center rounded-md bg-primary px-2.5 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-all">
              View All Candidates
           </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Candidates to Review</CardTitle>
            <IconUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{candidatesToReview}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting your interview
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interviews Today</CardTitle>
            <IconCalendarEvent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{interviewsTodayCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled for today
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Today's Schedule</CardTitle>
            <CardDescription>
              Your interview schedule for {new Date().toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!todayInterviews || todayInterviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <IconCalendarEvent className="h-10 w-10 mb-3 opacity-20" />
                <p>No interviews scheduled for today</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job Role</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayInterviews.map((interview: TodayInterview) => (
                    <TableRow key={interview.interviewId} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <IconClock className="h-4 w-4 text-muted-foreground" />
                          {interview.scheduledTime}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/manager/candidates/${interview.candidateId}`} className="hover:underline">
                          <div className="flex flex-col">
                            <span className="font-medium">{interview.candidateName}</span>
                            <span className="text-xs text-muted-foreground">{interview.candidateEmail}</span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>{interview.jobTitle}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {interview.stage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={interview.status === 'completed' ? 'secondary' : 'default'}
                          className="capitalize"
                        >
                          {interview.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {interview.meetLink && (
                            <a 
                              href={interview.meetLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2.5 h-8 text-sm font-medium hover:bg-muted transition-all"
                            >
                              Join Meeting
                            </a>
                          )}
                          <Link 
                            href={`/manager/candidates/${interview.candidateId}`}
                            className="inline-flex items-center justify-center rounded-md bg-primary px-2.5 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-all"
                          >
                            Review
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
