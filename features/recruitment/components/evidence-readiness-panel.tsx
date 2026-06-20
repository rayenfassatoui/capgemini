'use client';

import type { ReactNode } from 'react';

import {
  IconAlertTriangle,
  IconChecklist,
  IconCircleCheck,
  IconCircleDashed,
  IconInfoCircle,
  IconShieldCheck,
} from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { EvidenceReadinessModel, EvidenceReadinessStatus } from './evidence-readiness';

interface EvidenceReadinessPanelProps {
  readiness: EvidenceReadinessModel;
  title?: string;
  description?: string;
  compact?: boolean;
}

const STATUS_STYLES: Record<EvidenceReadinessStatus, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  partial: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'needs-evidence': 'border-destructive/30 bg-destructive/10 text-destructive',
};

const STATUS_ICONS = {
  ready: IconCircleCheck,
  partial: IconCircleDashed,
  'needs-evidence': IconAlertTriangle,
} as const;

export function EvidenceReadinessPanel({
  readiness,
  title = 'Evidence readiness',
  description = 'What is observed, what is missing, and what should stay inferred before Agent reasoning.',
  compact = false,
}: EvidenceReadinessPanelProps) {
  const StatusIcon = STATUS_ICONS[readiness.status];
  const hasMissingEvidence = readiness.missingEvidence.length > 0;
  const hasRiskFlags = readiness.riskFlags.length > 0;

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardHeader className={cn('space-y-3', compact ? 'pb-3' : 'pb-4')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconShieldCheck className="size-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="max-w-3xl leading-6">
              {description}
            </CardDescription>
          </div>
          <Badge className={cn('w-fit rounded-full border px-3 py-1', STATUS_STYLES[readiness.status])}>
            <StatusIcon className="mr-1.5 size-3.5" />
            {readiness.statusLabel}
          </Badge>
        </div>
        <p className="rounded-2xl border border-border/60 bg-muted/35 px-3 py-2 text-sm leading-6 text-muted-foreground">
          {readiness.summary}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {readiness.metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">{metric.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <ReadinessList
            title="Observed facts"
            icon={<IconChecklist className="size-4 text-primary" />}
            items={readiness.observedFacts}
            emptyText="No observed facts available."
          />
          <ReadinessList
            title="Missing evidence"
            icon={<IconInfoCircle className="size-4 text-amber-600 dark:text-amber-400" />}
            items={readiness.missingEvidence}
            emptyText="No missing evidence detected."
            muted={!hasMissingEvidence}
          />
          <ReadinessList
            title="Risk flags"
            icon={<IconAlertTriangle className="size-4 text-destructive" />}
            items={readiness.riskFlags}
            emptyText="No material risk flags detected."
            muted={!hasRiskFlags}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ReadinessList({
  title,
  icon,
  items,
  emptyText,
  muted = false,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-background/60 p-3" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          {items.slice(0, 5).map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-45" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn('text-sm leading-6', muted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
          {emptyText}
        </p>
      )}
    </section>
  );
}
