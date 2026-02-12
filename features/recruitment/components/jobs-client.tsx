'use client';

import { useState } from 'react';
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

// Define the Job type locally based on the expected return shape
// In a real app we might import this from schema/types if available
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

      // The action revalidates the path, but we can also update local state for immediate feedback
      // Note: The action returns the created job object
      // We might need to refresh the page or rely on revalidatePath
      // For this client component, assuming revalidatePath works, we might just close
      // But to be safe and responsive, let's update local list if the object is returned
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

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalJobs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {stats.byStatus.map((item) => (
                <Badge
                  key={item.status}
                  variant={item.status === 'open' ? 'default' : 'secondary'}
                  className="text-xs capitalize"
                >
                  {item.status} ({item.count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Seniority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {stats.bySeniority.slice(0, 5).map((item) => (
                <Badge key={item.seniority} variant="outline" className="text-xs">
                  {item.seniority} ({item.count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Skills Demand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {stats.topSkillsDemand.slice(0, 5).map((item) => (
                <Badge key={item.skill} variant="secondary" className="text-xs">
                  {item.skill} ({item.count})
                </Badge>
              ))}
              {stats.topSkillsDemand.length === 0 && (
                <p className="text-xs text-muted-foreground">No skills yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            className="pl-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger
            render={
              <Button>
                <IconPlus className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            }
          />
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
                <Label>Must-Have Skills * (Press Enter or click + to add)</Label>
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
                <Label>Nice-to-Have Skills (Press Enter or click + to add)</Label>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredJobs.map((job) => (
          <Link href={`/ta/jobs/${job.id}`} key={job.id} className="block group">
            <Card className="h-full hover:shadow-md transition-all duration-200 border-border group-hover:border-primary/50">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="line-clamp-1 text-lg group-hover:text-primary transition-colors">
                      {job.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1.5">
                      <IconBriefcase className="h-3.5 w-3.5" />
                      {job.seniority}
                    </CardDescription>
                  </div>
                  <Badge variant={job.status === 'open' ? 'default' : 'secondary'} className="capitalize shrink-0">
                    {job.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pb-3">
                {job.businessUnit && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconBuilding className="h-3.5 w-3.5" />
                    <span>{job.businessUnit}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Required Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.mustHave.slice(0, 4).map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs font-normal">
                        {skill}
                      </Badge>
                    ))}
                    {job.mustHave.length > 4 && (
                      <Badge variant="secondary" className="text-xs font-normal opacity-70">
                        +{job.mustHave.length - 4}
                      </Badge>
                    )}
                    {job.mustHave.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No required skills specified</span>
                    )}
                  </div>
                </div>

                {job.niceToHave.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nice to Have</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.niceToHave.slice(0, 3).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs font-normal">
                          {skill}
                        </Badge>
                      ))}
                       {job.niceToHave.length > 3 && (
                      <Badge variant="outline" className="text-xs font-normal opacity-70">
                        +{job.niceToHave.length - 3}
                      </Badge>
                    )}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-3 border-t text-xs text-muted-foreground flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <IconCalendar className="h-3.5 w-3.5" />
                  <span>Created {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <IconChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </CardFooter>
            </Card>
          </Link>
        ))}

        {filteredJobs.length === 0 && (
          <div className="col-span-full py-12 text-center border rounded-xl border-dashed bg-muted/20">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <IconBriefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No jobs found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              {searchQuery ? 'Try adjusting your search query.' : 'Get started by creating your first job posting.'}
            </p>
            {!searchQuery && (
              <Button variant="outline" className="mt-4" onClick={() => setIsOpen(true)}>
                <IconPlus className="mr-2 h-4 w-4" />
                Create Job
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
