'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CandidateStage } from '@/features/recruitment/types';

export interface Candidate {
  id: string;
  fullName: string;
  email: string;
  jobId: string;
  job?: { title: string };
  jobTitle?: string;
  stage: CandidateStage;
  createdAt: Date | string;
}

interface ManagerCandidatesClientProps {
  candidates: Candidate[];
}

export function ManagerCandidatesClient({ candidates }: ManagerCandidatesClientProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Job Title</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Date Applied</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No candidates found.
              </TableCell>
            </TableRow>
          ) : (
            candidates.map((candidate) => (
              <TableRow key={candidate.id}>
                <TableCell className="font-medium">{candidate.fullName}</TableCell>
                <TableCell>{candidate.email}</TableCell>
                <TableCell>{candidate.job?.title || candidate.jobTitle || 'N/A'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {candidate.stage.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(candidate.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/manager/candidates/${candidate.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    Review
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
