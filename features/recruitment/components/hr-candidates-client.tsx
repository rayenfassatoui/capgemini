'use client';

import { useState } from 'react';
import Link from 'next/link';
// import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  IconSearch, 
  IconEye,
  IconBriefcase,
  IconMail,
  IconUser,
  IconCalendar
} from '@tabler/icons-react';

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  stage: string;
  jobTitle?: string;
  createdAt: string | Date;
}

interface HRCandidatesClientProps {
  initialCandidates: Candidate[];
}

export function HRCandidatesClient({ initialCandidates }: HRCandidatesClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  // const router = useRouter();

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
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8 p-1">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Candidates
          </h1>
          <p className="text-muted-foreground">
            Manage and review candidates in the HR stage.
          </p>
        </div>
        
        <div className="relative w-full md:w-96 group">
          <div className="absolute inset-0 bg-primary/5 rounded-xl blur-xl group-hover:bg-primary/10 transition-all duration-500" />
          <div className="relative bg-background/50 backdrop-blur-xl border border-border/50 rounded-xl flex items-center shadow-sm group-hover:shadow-md transition-all duration-300">
            <IconSearch className="ml-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search candidates..."
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Candidates List */}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        <AnimatePresence mode="popLayout">
          {filteredCandidates.length === 0 ? (
            <motion.div 
              variants={item}
              className="flex flex-col items-center justify-center py-16 text-center space-y-4 bg-background/40 backdrop-blur-sm border border-dashed border-border rounded-xl"
            >
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                <IconSearch className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium text-foreground">No candidates found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search terms</p>
              </div>
            </motion.div>
          ) : (
            filteredCandidates.map((candidate) => (
              <motion.div
                key={candidate.id}
                variants={item}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ scale: 1.005, backgroundColor: "rgba(255,255,255,0.03)" }}
                transition={{ duration: 0.2 }}
                className="group relative overflow-hidden rounded-xl border border-white/10 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-md shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300"
              >
                {/* Hover Gradient Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="relative p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                  {/* Avatar / Icon */}
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shadow-inner">
                      <IconUser className="h-6 w-6 text-primary/70" />
                    </div>
                  </div>

                  {/* Main Info */}
                  <div className="flex-grow min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-foreground truncate">
                        {candidate.fullName}
                      </h3>
                      <Badge variant={getStageBadgeColor(candidate.stage)} className="ml-2 shadow-sm">
                        {formatStage(candidate.stage)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <IconBriefcase className="h-3.5 w-3.5" />
                        <span>{candidate.jobTitle || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IconMail className="h-3.5 w-3.5" />
                        <span className="truncate">{candidate.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <IconCalendar className="h-3.5 w-3.5" />
                        <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
                    <Link href={`/hr/candidates/${candidate.id}`} className="w-full md:w-auto">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full md:w-auto bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 shadow-sm"
                      >
                        <IconEye className="mr-2 h-4 w-4" />
                        Review
                      </Button>
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
