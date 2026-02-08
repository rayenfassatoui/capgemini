'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  IconSearch, 
  IconEye,
  IconBriefcase,
  IconMail,
  IconUser
} from '@tabler/icons-react';

// Define the shape of the candidate data we expect
interface Candidate {
  id: string;
  fullName: string;
  email: string;
  stage: string;
  jobTitle?: string; // Optional if joined
  createdAt: string | Date;
}

interface HRCandidatesClientProps {
  initialCandidates: Candidate[];
}

export function HRCandidatesClient({ initialCandidates }: HRCandidatesClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  const filteredCandidates = initialCandidates.filter((candidate) => {
    const name = candidate.fullName.toLowerCase();
    const email = candidate.email.toLowerCase();
    const job = (candidate.jobTitle || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    
    return name.includes(search) || email.includes(search) || job.includes(search);
  });

  const getStageBadgeColor = (stage: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (stage) {
      case 'manager_accepted': return 'default';
      case 'hr_interview': return 'default';
      case 'hr_accepted': return 'secondary';
      case 'hr_rejected': return 'destructive';
      case 'hired': return 'outline';
      default: return 'outline';
    }
  };

  const formatStage = (stage: string) => {
    return stage.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <CardDescription>Manage and review candidates in the HR stage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidates..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Job Position</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No candidates found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <IconUser className="h-4 w-4 text-muted-foreground" />
                          </div>
                          {candidate.fullName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <IconMail className="h-4 w-4" />
                          {candidate.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IconBriefcase className="h-4 w-4 text-muted-foreground" />
                          {candidate.jobTitle || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStageBadgeColor(candidate.stage)}>
                          {formatStage(candidate.stage)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link 
                          href={`/hr/candidates/${candidate.id}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          <IconEye className="mr-2 h-4 w-4" />
                          Review
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
