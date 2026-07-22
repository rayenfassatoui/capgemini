'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  IconSparkles,
  IconSearch,
  IconPlus,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconBriefcase,
  IconLanguage,
  IconCode,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  assignCvToJobAction,
  matchCvsToJobWithFiltersAction,
} from '@/features/recruitment/actions';
import { cvMatchEnrichmentResponseSchema } from '@/features/recruitment/schemas';
import type { CvMatchFilters, CvMatchResult } from '@/features/recruitment/types';

// ---------- Types ----------

type DialogStep = 'filters' | 'loading' | 'results';

type AiEnrichmentStatus = 'idle' | 'loading' | 'complete' | 'unavailable';

interface BackgroundEnrichmentOptions {
  jobId: string;
  filters: CvMatchFilters;
  requestId: number;
  activeRequest: { readonly current: number };
  signal: AbortSignal;
  setResults: React.Dispatch<React.SetStateAction<CvMatchResult[]>>;
  setStatus: React.Dispatch<React.SetStateAction<AiEnrichmentStatus>>;
}

async function enrichMatchesInBackground({
  jobId,
  filters,
  requestId,
  activeRequest,
  signal,
  setResults,
  setStatus,
}: BackgroundEnrichmentOptions): Promise<void> {
  try {
    const response = await fetch('/api/recruitment/cv-matching/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, filters }),
      signal,
    });
    if (!response.ok) {
      throw new Error('AI enrichment request failed');
    }
    const payload = cvMatchEnrichmentResponseSchema.parse(await response.json());
    const enrichedResults = payload.results;
    if (activeRequest.current !== requestId) return;

    setResults((currentResults) => {
      const assignedCvIds = new Set(
        currentResults
          .filter((result) => result.alreadyAssigned)
          .map((result) => result.cvId),
      );
      return enrichedResults.map((result) =>
        assignedCvIds.has(result.cvId)
          ? { ...result, alreadyAssigned: true }
          : result,
      );
    });
    setStatus(
      enrichedResults.some((result) => result.aiRecommendation)
        ? 'complete'
        : 'unavailable',
    );
  } catch {
    if (activeRequest.current === requestId) {
      setStatus('unavailable');
    }
  }
}

function MatchAnalysisStatus({
  status,
  analyzedCount,
}: {
  status: AiEnrichmentStatus;
  analyzedCount: number;
}): React.ReactNode {
  if (status === 'loading') {
    return <span className="ml-1">· AI recommendations loading in background</span>;
  }
  if (status === 'complete' && analyzedCount > 0) {
    return <span className="ml-1">· {analyzedCount} AI-analyzed</span>;
  }
  if (status === 'unavailable') {
    return <span className="ml-1">· Skill-ranked; AI recommendations unavailable</span>;
  }
  return null;
}

interface MatchCvsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobMustHave: string[];
  jobNiceToHave: string[];
  onAssigned?: (candidateId: string) => void;
}

// ---------- Inline Match Props ----------

interface InlineMatchProps {
  jobId: string;
  jobMustHave: string[];
  jobNiceToHave: string[];
  onAssigned?: (candidateId: string) => void;
}

// ---------- Tag Input ----------

function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  icon: Icon,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [input, setInput] = React.useState('');

  const handleAdd = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  const handleRemove = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd(input);
    }
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      handleRemove(value[value.length - 1]);
    }
  };

  const unusedSuggestions = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {placeholder}
      </div>

      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="default" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary-foreground/20 transition-colors"
              >
                <IconX className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input */}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Type and press Enter to add...`}
        className="h-8 text-sm"
      />

      {/* Suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleAdd(s)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <IconPlus className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Score Ring ----------

function ScoreRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 75) return 'text-green-500';
    if (s >= 50) return 'text-yellow-500';
    return 'text-red-400';
  };

  const getStroke = (s: number) => {
    if (s >= 75) return 'stroke-green-500';
    if (s >= 50) return 'stroke-yellow-500';
    return 'stroke-red-400';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          className={getStroke(score)}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={`absolute text-sm font-bold ${getColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

// ---------- Result Card ----------

function MatchResultCard({
  match,
  onAssign,
  isAssigning,
}: {
  match: CvMatchResult;
  onAssign: (cvId: string) => void;
  isAssigning: boolean;
}) {
  return (
    <div className="group rounded-lg border bg-card p-4 transition-all hover:shadow-md hover:border-primary/20">
      <div className="flex gap-4">
        {/* Score */}
        <div className="flex-shrink-0">
          <ScoreRing score={match.matchScore} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Name & email */}
          <div>
            <div className="font-semibold text-sm truncate">{match.candidateName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {match.candidateEmail}
            </div>
          </div>

          {/* Matched skills */}
          {match.matchedMustHave.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {match.matchedMustHave.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-[10px] h-4">
                  {skill}
                </Badge>
              ))}
              {match.matchedNiceToHave.slice(0, 2).map((skill) => (
                <Badge key={skill} variant="outline" className="text-[10px] h-4">
                  {skill}
                </Badge>
              ))}
            </div>
          )}

          {/* Gaps */}
          {match.gaps.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Gaps:</span>
              {match.gaps.map((gap) => (
                <Badge
                  key={gap}
                  variant="destructive"
                  className="text-[10px] h-4"
                >
                  {gap}
                </Badge>
              ))}
            </div>
          )}

          {/* AI Recommendation */}
          {match.aiRecommendation && (
            <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary">
                <IconSparkles className="size-3" />
                AI Recommendation
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {match.aiRecommendation}
              </p>
              {(match.aiStrengths?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {match.aiStrengths?.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-sm bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {(match.candidateLanguages?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <IconLanguage className="size-3" />
                {match.candidateLanguages?.join(', ')}
              </span>
            )}
            {(match.experienceCount ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <IconBriefcase className="size-3" />
                {match.experienceCount} position{match.experienceCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {/* Assign button */}
        <div className="flex-shrink-0 self-center">
          <Button
            size="sm"
            variant={match.alreadyAssigned ? 'secondary' : 'default'}
            onClick={() => onAssign(match.cvId)}
            disabled={match.alreadyAssigned || isAssigning}
            className="h-8 text-xs"
          >
            {match.alreadyAssigned ? (
              <>
                <IconCheck className="mr-1 size-3" />
                Assigned
              </>
            ) : (
              <>
                <IconPlus className="mr-1 size-3" />
                Assign
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Loading Skeleton ----------

function MatchLoadingState() {
  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="relative">
          <div className="size-14 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <IconSparkles className="size-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Ranking candidates...</p>
          <p className="text-xs text-muted-foreground">
            Filtering and scoring CV profiles
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border p-4">
            <Skeleton className="size-14 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <div className="flex gap-1">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
            <Skeleton className="h-8 w-20 self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Constants ----------

const COMMON_LANGUAGES = [
  'English',
  'French',
  'Arabic',
  'Spanish',
  'German',
  'Italian',
  'Chinese',
  'Portuguese',
];

// ---------- Inline CV Matching Component ----------

export function InlineCvMatching({
  jobId,
  jobMustHave,
  jobNiceToHave,
  onAssigned,
}: InlineMatchProps) {
  const [step, setStep] = React.useState<'filters' | 'loading' | 'results'>('filters');
  const [filterSkills, setFilterSkills] = React.useState<string[]>([]);
  const [filterLanguages, setFilterLanguages] = React.useState<string[]>([]);
  const [minPositions, setMinPositions] = React.useState(0);
  const [results, setResults] = React.useState<CvMatchResult[]>([]);
  const [assigningCvId, setAssigningCvId] = React.useState<string | null>(null);
  const [aiEnrichmentStatus, setAiEnrichmentStatus] =
    React.useState<AiEnrichmentStatus>('idle');
  const activeSearchRequest = React.useRef(0);
  const activeEnrichmentRequest = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      activeSearchRequest.current += 1;
      activeEnrichmentRequest.current?.abort();
    };
  }, []);

  const handleRunMatch = async () => {
    const requestId = ++activeSearchRequest.current;
    activeEnrichmentRequest.current?.abort();
    activeEnrichmentRequest.current = null;
    const filters: CvMatchFilters = {
      skills: filterSkills,
      languages: filterLanguages,
      minPositions,
    };
    setAiEnrichmentStatus('idle');
    setStep('loading');
    try {
      const matchResults = await matchCvsToJobWithFiltersAction(jobId, filters);
      if (activeSearchRequest.current !== requestId) return;

      setResults(matchResults);
      setStep('results');
      if (matchResults.length === 0) {
        toast.info('No matching candidates found with these filters');
        return;
      }

      const enrichmentRequest = new AbortController();
      activeEnrichmentRequest.current = enrichmentRequest;
      setAiEnrichmentStatus('loading');
      void enrichMatchesInBackground({
        jobId,
        filters,
        requestId,
        activeRequest: activeSearchRequest,
        signal: enrichmentRequest.signal,
        setResults,
        setStatus: setAiEnrichmentStatus,
      });
    } catch {
      if (activeSearchRequest.current === requestId) {
        toast.error('Failed to match CVs');
        setStep('filters');
      }
    }
  };

  const handleNewSearch = () => {
    activeSearchRequest.current += 1;
    activeEnrichmentRequest.current?.abort();
    activeEnrichmentRequest.current = null;
    setAiEnrichmentStatus('idle');
    setStep('filters');
  };

  const handleAssign = async (cvId: string) => {
    setAssigningCvId(cvId);
    try {
      const candidate = await assignCvToJobAction(cvId, jobId);
      setResults((prev) =>
        prev.map((r) => (r.cvId === cvId ? { ...r, alreadyAssigned: true } : r))
      );
      toast.success('Candidate added to Interviews', {
        description: 'Set the interview date, time, and meeting link now.',
      });
      onAssigned?.(candidate.id);
    } catch {
      toast.error('Failed to assign candidate');
    } finally {
      setAssigningCvId(null);
    }
  };

  const aiEnhancedCount = results.filter((r) => r.aiRecommendation).length;

  if (step === 'loading') {
    return <MatchLoadingState />;
  }

  if (step === 'results') {
    return (
      <div className="space-y-4">
        {/* Results header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <IconSparkles className="size-5 text-primary" />
              Match Results
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {results.length} candidate{results.length !== 1 ? 's' : ''} found
              <MatchAnalysisStatus
                status={aiEnrichmentStatus}
                analyzedCount={aiEnhancedCount}
              />
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleNewSearch}>
            <IconArrowLeft className="mr-2 size-4" />
            New Search
          </Button>
        </div>

        {/* Active filters summary */}
        {(filterSkills.length > 0 ||
          filterLanguages.length > 0 ||
          minPositions > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {filterSkills.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px] h-4">
                {s}
              </Badge>
            ))}
            {filterLanguages.map((l) => (
              <Badge key={l} variant="outline" className="text-[10px] h-4">
                {l}
              </Badge>
            ))}
            {minPositions > 0 && (
              <Badge variant="outline" className="text-[10px] h-4">
                {minPositions}+ positions
              </Badge>
            )}
          </div>
        )}

        {/* Results list */}
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
              <IconSearch className="size-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No candidates match these criteria</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            results.map((match) => (
              <MatchResultCard
                key={match.cvId}
                match={match}
                onAssign={handleAssign}
                isAssigning={assigningCvId === match.cvId}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // Filters step
  return (
    <div className="space-y-6">
      {/* Filter panel */}
      <div className="rounded-lg border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <IconSparkles className="size-5 text-primary" />
          <h3 className="text-lg font-semibold">AI-Powered CV Matching</h3>
        </div>
        <p className="text-sm text-muted-foreground -mt-3">
          Configure filters to narrow down candidates before AI analysis.
          Leave filters empty to match all CVs in the pool.
        </p>

        <TagInput
          value={filterSkills}
          onChange={setFilterSkills}
          suggestions={[...jobMustHave, ...jobNiceToHave]}
          placeholder="Skills"
          icon={IconCode}
        />

        <TagInput
          value={filterLanguages}
          onChange={setFilterLanguages}
          suggestions={COMMON_LANGUAGES}
          placeholder="Languages"
          icon={IconLanguage}
        />

        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconBriefcase className="size-4 text-muted-foreground" />
            Minimum Positions
          </div>
          <Input
            type="number"
            min={0}
            max={50}
            value={minPositions}
            onChange={(e) =>
              setMinPositions(Math.max(0, Number(e.target.value)))
            }
            className="h-8 text-sm w-24"
            placeholder="0"
          />
          <p className="text-[10px] text-muted-foreground">
            Filters candidates by number of work experience entries
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleRunMatch}>
            <IconSearch className="mr-2 size-4" />
            Find Matches
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Dialog (kept for backward compatibility) ----------

export function MatchCvsDialog({
  open,
  onOpenChange,
  jobId,
  jobMustHave,
  jobNiceToHave,
  onAssigned,
}: MatchCvsDialogProps) {
  const [step, setStep] = React.useState<DialogStep>('filters');
  const [filterSkills, setFilterSkills] = React.useState<string[]>([]);
  const [filterLanguages, setFilterLanguages] = React.useState<string[]>([]);
  const [minPositions, setMinPositions] = React.useState(0);
  const [results, setResults] = React.useState<CvMatchResult[]>([]);
  const [assigningCvId, setAssigningCvId] = React.useState<string | null>(null);
  const [aiEnrichmentStatus, setAiEnrichmentStatus] =
    React.useState<AiEnrichmentStatus>('idle');
  const activeSearchRequest = React.useRef(0);
  const activeEnrichmentRequest = React.useRef<AbortController | null>(null);

  // Reset on open
  React.useEffect(() => {
    activeSearchRequest.current += 1;
    activeEnrichmentRequest.current?.abort();
    activeEnrichmentRequest.current = null;
    setAiEnrichmentStatus('idle');
    if (open) {
      setStep('filters');
      setResults([]);
    }

    return () => {
      activeSearchRequest.current += 1;
      activeEnrichmentRequest.current?.abort();
    };
  }, [open]);

  const handleRunMatch = async () => {
    const requestId = ++activeSearchRequest.current;
    activeEnrichmentRequest.current?.abort();
    activeEnrichmentRequest.current = null;
    const filters: CvMatchFilters = {
      skills: filterSkills,
      languages: filterLanguages,
      minPositions,
    };
    setAiEnrichmentStatus('idle');
    setStep('loading');
    try {
      const matchResults = await matchCvsToJobWithFiltersAction(jobId, filters);
      if (activeSearchRequest.current !== requestId) return;

      setResults(matchResults);
      setStep('results');
      if (matchResults.length === 0) {
        toast.info('No matching candidates found with these filters');
        return;
      }

      const enrichmentRequest = new AbortController();
      activeEnrichmentRequest.current = enrichmentRequest;
      setAiEnrichmentStatus('loading');
      void enrichMatchesInBackground({
        jobId,
        filters,
        requestId,
        activeRequest: activeSearchRequest,
        signal: enrichmentRequest.signal,
        setResults,
        setStatus: setAiEnrichmentStatus,
      });
    } catch {
      if (activeSearchRequest.current === requestId) {
        toast.error('Failed to match CVs');
        setStep('filters');
      }
    }
  };

  const handleNewSearch = () => {
    activeSearchRequest.current += 1;
    activeEnrichmentRequest.current?.abort();
    activeEnrichmentRequest.current = null;
    setAiEnrichmentStatus('idle');
    setStep('filters');
  };

  const handleAssign = async (cvId: string) => {
    setAssigningCvId(cvId);
    try {
      const candidate = await assignCvToJobAction(cvId, jobId);
      setResults((prev) =>
        prev.map((r) => (r.cvId === cvId ? { ...r, alreadyAssigned: true } : r))
      );
      toast.success('Candidate added to Interviews', {
        description: 'Set the interview date, time, and meeting link now.',
      });
      onAssigned?.(candidate.id);
    } catch {
      toast.error('Failed to assign candidate');
    } finally {
      setAssigningCvId(null);
    }
  };

  const aiEnhancedCount = results.filter((r) => r.aiRecommendation).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* STEP 1: Filters */}
        {step === 'filters' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconSparkles className="size-5 text-primary" />
                AI-Powered CV Matching
              </DialogTitle>
              <DialogDescription>
                Configure filters to narrow down candidates before AI analysis.
                Leave filters empty to match all CVs in the pool.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <TagInput
                value={filterSkills}
                onChange={setFilterSkills}
                suggestions={[...jobMustHave, ...jobNiceToHave]}
                placeholder="Skills"
                icon={IconCode}
              />

              <TagInput
                value={filterLanguages}
                onChange={setFilterLanguages}
                suggestions={COMMON_LANGUAGES}
                placeholder="Languages"
                icon={IconLanguage}
              />

              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <IconBriefcase className="size-4 text-muted-foreground" />
                  Minimum Positions
                </div>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={minPositions}
                  onChange={(e) =>
                    setMinPositions(Math.max(0, Number(e.target.value)))
                  }
                  className="h-8 text-sm w-24"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">
                  Filters candidates by number of work experience entries
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleRunMatch}>
                <IconSearch className="mr-2 size-4" />
                Find Matches
              </Button>
            </div>
          </>
        )}

        {/* STEP 2: Loading */}
        {step === 'loading' && <MatchLoadingState />}

        {/* STEP 3: Results */}
        {step === 'results' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconSparkles className="size-5 text-primary" />
                Match Results
              </DialogTitle>
              <DialogDescription>
                {results.length} candidate{results.length !== 1 ? 's' : ''} found
                <MatchAnalysisStatus
                  status={aiEnrichmentStatus}
                  analyzedCount={aiEnhancedCount}
                />
              </DialogDescription>
            </DialogHeader>

            {/* Active filters summary */}
            {(filterSkills.length > 0 ||
              filterLanguages.length > 0 ||
              minPositions > 0) && (
              <div className="flex flex-wrap gap-1.5 -mt-2">
                {filterSkills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px] h-4">
                    {s}
                  </Badge>
                ))}
                {filterLanguages.map((l) => (
                  <Badge key={l} variant="outline" className="text-[10px] h-4">
                    {l}
                  </Badge>
                ))}
                {minPositions > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4">
                    {minPositions}+ positions
                  </Badge>
                )}
              </div>
            )}

            {/* Results list */}
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <IconSearch className="size-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No candidates match these criteria</p>
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                results.map((match) => (
                  <MatchResultCard
                    key={match.cvId}
                    match={match}
                    onAssign={handleAssign}
                    isAssigning={assigningCvId === match.cvId}
                  />
                ))
              )}
            </div>

            {/* Footer actions */}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleNewSearch}>
                <IconArrowLeft className="mr-2 size-4" />
                Back to Filters
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
