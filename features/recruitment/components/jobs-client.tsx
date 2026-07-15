'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  IconPlus,
  IconBriefcase,
  IconChevronRight,
  IconX,
  IconSearch,
  IconBuilding,
  IconCalendar,
  IconUsers,
  IconTrendingUp,
  IconChartBar
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

import { createJobAction } from '@/features/recruitment/actions';
import type { JobsStats } from '@/features/recruitment/types';
import { cn } from '@/lib/utils';

// Define the Job type locally based on the expected return shape
interface Job {
  id: string;
  title: string;
  description: string;
  mustHave: string[];
  niceToHave: string[];
  seniority: string;
  businessUnit: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface JobsClientProps {
  initialJobs: Job[];
  stats: JobsStats;
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

export default function JobsClient({ initialJobs, stats }: JobsClientProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [seniority, setSeniority] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  
  // Skills state
  const [mustHaveInput, setMustHaveInput] = useState('');
  const [mustHaveSkills, setMustHaveSkills] = useState<string[]>([]);
  
  const [niceToHaveInput, setNiceToHaveInput] = useState('');
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeniority('');
    setBusinessUnit('');
    setMustHaveSkills([]);
    setNiceToHaveSkills([]);
    setMustHaveInput('');
    setNiceToHaveInput('');
  };

  const addMustHaveSkill = () => {
    if (mustHaveInput.trim() && !mustHaveSkills.includes(mustHaveInput.trim())) {
      setMustHaveSkills([...mustHaveSkills, mustHaveInput.trim()]);
      setMustHaveInput('');
    }
  };

  const addNiceToHaveSkill = () => {
    if (niceToHaveInput.trim() && !niceToHaveSkills.includes(niceToHaveInput.trim())) {
      setNiceToHaveSkills([...niceToHaveSkills, niceToHaveInput.trim()]);
      setNiceToHaveInput('');
    }
  };

  const handleCreateJob = async () => {
    if (!title || !description || !seniority) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Auto-add any pending text in the input fields
    if (mustHaveInput.trim()) {
      addMustHaveSkill();
    }
    if (niceToHaveInput.trim()) {
      addNiceToHaveSkill();
    }

    // Check after potential auto-add
    const finalMustHave = mustHaveInput.trim() && !mustHaveSkills.includes(mustHaveInput.trim())
      ? [...mustHaveSkills, mustHaveInput.trim()]
      : mustHaveSkills;

    if (finalMustHave.length === 0) {
      toast.error('Please add at least one required skill (Must Have)');
      return;
    }

    setIsSubmitting(true);
    try {
      // Calculate final arrays including any pending input
      const finalMustHave = mustHaveInput.trim() && !mustHaveSkills.includes(mustHaveInput.trim())
        ? [...mustHaveSkills, mustHaveInput.trim()]
        : mustHaveSkills;
      const finalNiceToHave = niceToHaveInput.trim() && !niceToHaveSkills.includes(niceToHaveInput.trim())
        ? [...niceToHaveSkills, niceToHaveInput.trim()]
        : niceToHaveSkills;

      const newJob = await createJobAction({
        title,
        description,
        mustHave: finalMustHave,
        niceToHave: finalNiceToHave,
        seniority,
        businessUnit: businessUnit || null,
      });

      if (newJob) {
        setJobs((prev) => [newJob as unknown as Job, ...prev]);
        toast.success('Job created successfully');
        setIsOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create job:', error);
      toast.error('Failed to create job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMustHaveKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addMustHaveSkill();
    }
  };

  const removeMustHaveSkill = (skill: string) => {
    setMustHaveSkills(mustHaveSkills.filter((s) => s !== skill));
  };

  const handleNiceToHaveKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNiceToHaveSkill();
    }
  };

  const removeNiceToHaveSkill = (skill: string) => {
    setNiceToHaveSkills(niceToHaveSkills.filter((s) => s !== skill));
  };

  const filteredJobs = jobs.filter((job) =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.seniority.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.businessUnit?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Extract top stats for cards
  const topStatus = stats.byStatus.sort((a, b) => b.count - a.count)[0];
  const topSeniority = stats.bySeniority.sort((a, b) => b.count - a.count)[0];
  const topSkill = stats.topSkillsDemand.sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-8 p-1">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Job Management
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Create and manage recruitment pipelines
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger render={
              <Button className="rounded-full px-6 shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30">
                <IconPlus className="mr-2 h-4 w-4" />
                Create New Job
              </Button>
            } />
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Job Position</DialogTitle>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g. Senior Frontend Engineer"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="seniority">Seniority *</Label>
                    <Input
                      id="seniority"
                      placeholder="e.g. Senior, Lead"
                      value={seniority}
                      onChange={(e) => setSeniority(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bu">Business Unit</Label>
                    <Input
                      id="bu"
                      placeholder="e.g. Financial Services"
                      value={businessUnit}
                      onChange={(e) => setBusinessUnit(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Job responsibilities and requirements..."
                    className="min-h-[100px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Must-Have Skills * (Press Enter)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type skill and press Enter..."
                      value={mustHaveInput}
                      onChange={(e) => setMustHaveInput(e.target.value)}
                      onKeyDown={handleMustHaveKeyDown}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addMustHaveSkill}
                      disabled={!mustHaveInput.trim()}
                    >
                      <IconPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mustHaveSkills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="gap-1 pl-2.5">
                        {skill}
                        <button
                          onClick={() => removeMustHaveSkill(skill)}
                          className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted"
                        >
                          <IconX className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          <span className="sr-only">Remove {skill}</span>
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Nice-to-Have Skills</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type skill and press Enter..."
                      value={niceToHaveInput}
                      onChange={(e) => setNiceToHaveInput(e.target.value)}
                      onKeyDown={handleNiceToHaveKeyDown}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addNiceToHaveSkill}
                      disabled={!niceToHaveInput.trim()}
                    >
                      <IconPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {niceToHaveSkills.map((skill) => (
                      <Badge key={skill} variant="outline" className="gap-1 pl-2.5">
                        {skill}
                        <button
                          onClick={() => removeNiceToHaveSkill(skill)}
                          className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted"
                        >
                          <IconX className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          <span className="sr-only">Remove {skill}</span>
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={handleCreateJob} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Job'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
          title="Total Jobs"
          value={stats.totalJobs}
          icon={IconBriefcase}
          trend="Active positions"
          color="blue"
        />
        <StatCard
          title="Most Active Status"
          value={topStatus ? topStatus.status : 'None'}
          icon={IconChartBar}
          trend={topStatus ? `${topStatus.count} jobs` : 'No data'}
          color="green"
        />
        <StatCard
          title="Top Seniority"
          value={topSeniority ? topSeniority.seniority : 'None'}
          icon={IconUsers}
          trend={topSeniority ? `${topSeniority.count} positions` : 'No data'}
          color="purple"
        />
        <StatCard
          title="Top Skill Demand"
          value={topSkill ? topSkill.skill : 'None'}
          icon={IconTrendingUp}
          trend={topSkill ? `${topSkill.count} mentions` : 'No data'}
          color="amber"
        />
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative"
      >
        <div className="relative max-w-md">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, seniority, or unit..."
            className="pl-10 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-white/20 dark:border-white/10 focus-visible:ring-primary/20 transition-all hover:bg-white/60 dark:hover:bg-zinc-900/60"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Jobs Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        <AnimatePresence>
          {filteredJobs.map((job) => (
            <motion.div key={job.id} variants={item} layout>
              <Link href={`/ta/jobs/${job.id}`} className="block group h-full">
                <Card className="h-full relative overflow-hidden bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border-white/20 dark:border-white/10 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <CardHeader className="pb-3 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <CardTitle className="line-clamp-1 text-lg group-hover:text-primary transition-colors">
                          {job.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                           <Badge variant="outline" className="text-xs font-normal bg-background/50">
                             {job.seniority}
                           </Badge>
                           {job.businessUnit && (
                             <span className="text-xs text-muted-foreground flex items-center gap-1">
                               <IconBuilding className="h-3 w-3" />
                               {job.businessUnit}
                             </span>
                           )}
                        </CardDescription>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4 pb-3 relative z-10">
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                        Required Skills
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {job.mustHave.slice(0, 3).map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs font-normal bg-secondary/50 hover:bg-secondary/70 transition-colors">
                            {skill}
                          </Badge>
                        ))}
                        {job.mustHave.length > 3 && (
                          <Badge variant="secondary" className="text-xs font-normal bg-secondary/30 text-muted-foreground">
                            +{job.mustHave.length - 3}
                          </Badge>
                        )}
                        {job.mustHave.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">None specified</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  
                  <CardFooter className="pt-4 border-t border-white/10 relative z-10 flex justify-between items-center text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <IconCalendar className="h-3.5 w-3.5" />
                      <span>{new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-1 text-primary font-medium opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      View Details
                      <IconChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredJobs.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-full py-16 text-center border-2 border-dashed border-white/20 rounded-2xl bg-white/5 backdrop-blur-sm"
          >
            <div className="mx-auto w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <IconSearch className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold">No jobs found</h3>
            <p className="text-muted-foreground mt-2 max-w-xs mx-auto mb-6">
              {searchQuery ? `No matches for "${searchQuery}"` : 'Get started by creating your first job posting.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsOpen(true)}>
                <IconPlus className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            )}
          </motion.div>
        )}
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
  color: 'blue' | 'purple' | 'amber' | 'pink' | 'green';
}) {
  const colorStyles = {
    blue: "from-blue-500/10 to-blue-500/5 border-blue-200/20 text-blue-500",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-200/20 text-purple-500",
    amber: "from-amber-500/10 to-amber-500/5 border-amber-200/20 text-amber-500",
    pink: "from-pink-500/10 to-pink-500/5 border-pink-200/20 text-pink-500",
    green: "from-green-500/10 to-green-500/5 border-green-200/20 text-green-500",
  };

  return (
    <motion.div variants={item}>
      <Card className={cn(
        "relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group",
        "bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md",
        colorStyles[color]
      )}>
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          color === 'blue' && "from-blue-500/10 via-transparent to-transparent",
          color === 'purple' && "from-purple-500/10 via-transparent to-transparent",
          color === 'amber' && "from-amber-500/10 via-transparent to-transparent",
          color === 'pink' && "from-pink-500/10 via-transparent to-transparent",
          color === 'green' && "from-green-500/10 via-transparent to-transparent",
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
          <div className="text-2xl font-bold tracking-tight mt-1">{value}</div>
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
    open: "bg-green-500/15 text-green-700 dark:text-green-300 hover:bg-green-500/25 border-green-200/50",
    closed: "bg-gray-500/15 text-gray-700 dark:text-gray-300 hover:bg-gray-500/25 border-gray-200/50",
    draft: "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border-amber-200/50",
    archived: "bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 border-red-200/50",
  };

  const style = styles[status as keyof typeof styles] || styles.open;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "capitalize px-2.5 py-0.5 border transition-colors", 
        style
      )}
    >
      {status}
    </Badge>
  );
}
