import {
  IconArrowRight,
  IconClockHour4,
  IconRoute,
  IconUserCircle,
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { CandidateStage } from '../types';

const SOURCE_LABELS: Record<string, string> = {
  agent: 'Agent action',
  assignment: 'CV assignment',
  bulk: 'Bulk update',
  hr_assignment: 'HR assignment',
  interview_report: 'Interview report',
  interview_scheduled: 'Interview scheduled',
  manager_assignment: 'Manager assignment',
  manual: 'Manual update',
  screening: 'Screening workflow',
};

const STAGE_HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface CandidateStageHistoryRecord {
  id: string;
  candidateId: string;
  previousStage: CandidateStage | string | null;
  newStage: CandidateStage | string;
  changedBy: string | null;
  changedByName: string | null;
  changedByEmail: string | null;
  reason: string | null;
  source: string | null;
  createdAt: Date | string;
}

export interface CandidateStageHistoryTimelineEntry
  extends Omit<CandidateStageHistoryRecord, 'createdAt'> {
  createdAtIso: string;
  createdAtLabel: string;
}

interface CandidateStageHistoryTimelineProps {
  entries: CandidateStageHistoryTimelineEntry[];
  showActorDetails: boolean;
}

const STAGE_LABEL_ACRONYMS = new Set(['ai', 'cv', 'hr', 'ta']);
function titleCase(value: string): string {
  const lower = value.toLowerCase();
  if (STAGE_LABEL_ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatCandidateStage(stage: CandidateStage | string | null): string {
  if (!stage) {
    return 'Pipeline created';
  }

  return stage.split('_').map(titleCase).join(' ');
}

function formatStageSource(source: string | null): string {
  if (!source) {
    return 'Workflow update';
  }

  return SOURCE_LABELS[source] ?? formatCandidateStage(source);
}

function coerceHistoryDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatStageHistoryTimestamp(value: Date | string): string {
  const date = coerceHistoryDate(value);
  if (!date) {
    return 'Unknown time';
  }

  return STAGE_HISTORY_DATE_FORMATTER.format(date);
}

export function normalizeCandidateStageHistory(
  records: CandidateStageHistoryRecord[],
): CandidateStageHistoryTimelineEntry[] {
  return records.map((record) => {
    const date = coerceHistoryDate(record.createdAt);

    return {
      ...record,
      createdAtIso: date?.toISOString() ?? '',
      createdAtLabel: date
        ? STAGE_HISTORY_DATE_FORMATTER.format(date)
        : 'Unknown time',
    };
  });
}

function getActorLabel(
  entry: CandidateStageHistoryTimelineEntry,
  showActorDetails: boolean,
): string {
  if (!showActorDetails) {
    return 'Actor details restricted to HR and Admin';
  }

  const name = entry.changedByName?.trim();
  const email = entry.changedByEmail?.trim();

  if (name && email) {
    return `${name} (${email})`;
  }

  if (name) {
    return name;
  }

  if (email) {
    return email;
  }

  return entry.changedBy ? 'Known internal user' : 'System workflow';
}

function buildTransitionTitle(entry: CandidateStageHistoryTimelineEntry): string {
  if (!entry.previousStage) {
    return `Created in ${formatCandidateStage(entry.newStage)}`;
  }

  return `${formatCandidateStage(entry.previousStage)} to ${formatCandidateStage(entry.newStage)}`;
}

export function CandidateStageHistoryTimeline({
  entries,
  showActorDetails,
}: CandidateStageHistoryTimelineProps) {
  const latestEntryId = entries.at(-1)?.id;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2" role="heading" aria-level={2}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <IconRoute className="size-5" aria-hidden="true" />
              </span>
              Stage history
            </CardTitle>
            <CardDescription>
              Auditable record of every pipeline movement for this candidate.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3">
            {entries.length} {entries.length === 1 ? 'event' : 'events'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
            <IconRoute className="size-8 opacity-30" aria-hidden="true" />
            <p className="text-sm">No stage history has been recorded yet.</p>
          </div>
        ) : (
          <ol
            aria-label="Candidate stage history"
            className="divide-y divide-border/70"
          >
            {entries.map((entry) => {
              const isLatest = entry.id === latestEntryId;
              const sourceLabel = formatStageSource(entry.source);

              return (
                <li key={entry.id} className="relative px-6 py-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={isLatest ? 'default' : 'secondary'}
                          className="rounded-full"
                        >
                          {isLatest ? 'Current' : sourceLabel}
                        </Badge>
                        {isLatest && (
                          <Badge variant="outline" className="rounded-full">
                            {sourceLabel}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
                          {entry.previousStage ? (
                            <>
                              <span>{formatCandidateStage(entry.previousStage)}</span>
                              <IconArrowRight
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span>{formatCandidateStage(entry.newStage)}</span>
                            </>
                          ) : (
                            <span>{buildTransitionTitle(entry)}</span>
                          )}
                        </h3>
                        {entry.reason ? (
                          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                            {entry.reason}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No reason was recorded for this transition.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <IconUserCircle className="size-4" aria-hidden="true" />
                          {getActorLabel(entry, showActorDetails)}
                        </span>
                        <time
                          className="inline-flex items-center gap-1.5"
                          dateTime={entry.createdAtIso || undefined}
                        >
                          <IconClockHour4 className="size-4" aria-hidden="true" />
                          {entry.createdAtLabel}
                        </time>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
