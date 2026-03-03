'use client';

import { motion, type Variants } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { 
  IconUser, 
  IconBriefcase, 
  IconCalendar, 
  IconChevronRight,
  IconMail
} from '@tabler/icons-react';
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
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const stageColors: Record<string, string> = {
  'new': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'screening': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'interview': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'manager_interview': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  'manager_accepted': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  'manager_rejected': 'bg-red-500/10 text-red-500 border-red-500/20',
  'offer': 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  'hired': 'bg-green-500/10 text-green-500 border-green-500/20',
  'rejected': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export function ManagerCandidatesClient({ candidates }: ManagerCandidatesClientProps) {
  return (
    <div className="relative min-h-[600px] w-full">
      {/* Ambient Background for Glass Effect */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
         <div className="absolute -top-[10%] -right-[5%] h-[400px] w-[400px] rounded-full bg-primary/5 blur-3xl animate-pulse-slow" />
         <div className="absolute top-[20%] -left-[10%] h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div 
        variants={container} 
        initial="hidden" 
        animate="show" 
        className="space-y-3"
      >
        {candidates.length === 0 ? (
          <motion.div 
            variants={item}
            className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-xl"
          >
            <div className="bg-muted/50 p-4 rounded-full mb-4">
              <IconUser className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No candidates found</h3>
            <p className="text-muted-foreground max-w-sm mt-1">
              There are currently no candidates assigned to you for review.
            </p>
          </motion.div>
        ) : (
          candidates.map((candidate) => (
            <motion.div
              key={candidate.id}
              variants={item}
              className="group relative flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border border-white/20 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-md shadow-sm hover:shadow-md hover:bg-white/60 dark:hover:bg-white/5 transition-all duration-300"
            >
              {/* Avatar / Initials */}
              <div className="flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/10 to-indigo-500/10 border border-white/20 flex items-center justify-center text-primary font-bold shadow-inner">
                  {candidate.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Main Info */}
              <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full">
                
                {/* Name & Email */}
                <div className="md:col-span-4">
                  <h3 className="text-base font-semibold text-foreground truncate pr-4 group-hover:text-primary transition-colors">
                    {candidate.fullName}
                  </h3>
                  <div className="flex items-center text-sm text-muted-foreground mt-0.5">
                    <IconMail className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                    <span className="truncate">{candidate.email}</span>
                  </div>
                </div>

                {/* Job & Date */}
                <div className="md:col-span-4">
                  <div className="flex items-center text-sm font-medium text-foreground">
                    <IconBriefcase className="h-3.5 w-3.5 mr-1.5 text-primary/70" />
                    <span className="truncate">{candidate.job?.title || candidate.jobTitle || 'N/A'}</span>
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground mt-1">
                    <IconCalendar className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                    <span>Applied {new Date(candidate.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Stage & Action */}
                <div className="md:col-span-4 flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "px-2.5 py-0.5 capitalize shadow-none font-medium border",
                      stageColors[candidate.stage] || "bg-gray-100 text-gray-700 border-gray-200"
                    )}
                  >
                    {candidate.stage.replace(/_/g, ' ')}
                  </Badge>

                  <Link href={`/manager/candidates/${candidate.id}`}>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-9 px-4 rounded-full hover:bg-primary hover:text-primary-foreground group-hover:translate-x-1 transition-all duration-300"
                    >
                      Review
                      <IconChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}
