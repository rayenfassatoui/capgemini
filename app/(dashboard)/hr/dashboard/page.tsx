import { getDashboardStatsAction, getTodayInterviewScheduleAction } from '@/features/recruitment/actions';
import { requireRole } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IconUsers, IconCalendarEvent, IconCheck, IconVideo, IconBriefcase } from '@tabler/icons-react';

interface TodayInterview {
  interviewId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stage: string;
  scheduledTime: string;
  meetLink: string;
  status: string;
}

export default async function HRDashboardPage() {
  await requireRole(['hr', 'admin']);
  const [stats, interviews] = await Promise.all([
    getDashboardStatsAction(),
    getTodayInterviewScheduleAction()
  ]);

  // Derived stats for HR
  // Assuming stageBreakdown has keys like 'hr_interview', 'hr_accepted'
  const toReviewCount = stats.stageBreakdown['hr_interview'] || 0;
  const acceptedCount = stats.stageBreakdown['hr_accepted'] || 0;

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Human Resources overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Candidates to Review</CardTitle>
            <IconUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{toReviewCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting HR interview</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Interviews</CardTitle>
            <IconCalendarEvent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInterviewsToday}</div>
            <p className="text-xs text-muted-foreground">Scheduled for today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted Candidates</CardTitle>
            <IconCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{acceptedCount}</div>
            <p className="text-xs text-muted-foreground">Passed HR stage</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today's Interview Schedule</CardTitle>
          <CardDescription>Upcoming interviews scheduled for today.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
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
                  <TableCell colSpan={6} className="h-24 text-center">
                    No interviews scheduled for today.
                  </TableCell>
                </TableRow>
              ) : (
                interviews.map((interview: TodayInterview) => (
                  <TableRow key={interview.interviewId}>
                    <TableCell className="font-medium">{interview.scheduledTime}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{interview.candidateName}</span>
                        <span className="text-xs text-muted-foreground">{interview.candidateEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>{interview.jobTitle}</TableCell>
                    <TableCell>
                        <Badge variant="outline" className="uppercase text-xs">
                            {interview.stage}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Badge variant={interview.status === 'completed' ? 'default' : 'secondary'}>
                            {interview.status}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        {interview.meetLink && (
                            <a 
                                href={interview.meetLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-md h-8 px-2.5 text-sm font-medium hover:bg-muted transition-all"
                            >
                                <IconVideo className="mr-2 h-4 w-4" />
                                Join
                            </a>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
