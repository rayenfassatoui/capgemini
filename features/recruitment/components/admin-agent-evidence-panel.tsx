'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  IconAlertTriangle,
  IconBrain,
  IconChecklist,
  IconDatabase,
  IconInfoCircle,
} from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildAgentPromptHref } from './chat/agent-prompts';
import type { AdminEvidenceSummary } from './admin-agent-helpers';

interface AdminAgentAction {
  label: string;
  description: string;
  prompt: string;
  icon?: ComponentType<{ className?: string }>;
}

interface AdminAgentEvidencePanelProps {
  summary: AdminEvidenceSummary;
  actions: readonly AdminAgentAction[];
  compact?: boolean;
}

export function AdminAgentEvidencePanel({
  summary,
  actions,
  compact = false,
}: AdminAgentEvidencePanelProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconDatabase className="size-5 text-primary" />
              {summary.title}
            </CardTitle>
            <CardDescription className="max-w-3xl leading-6">
              {summary.description}
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-primary/25 bg-primary/10 px-3 py-1 text-primary">
            Source-backed admin context
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {summary.metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-xl font-semibold text-foreground">{metric.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <AdminEvidenceList
            title="Observed admin facts"
            icon={<IconChecklist className="size-4 text-primary" />}
            items={summary.observedFacts}
            emptyText="No observed facts available."
          />
          <AdminEvidenceList
            title="Missing operational evidence"
            icon={<IconInfoCircle className="size-4 text-amber-600 dark:text-amber-400" />}
            items={summary.missingEvidence}
            emptyText="No missing operational evidence detected."
          />
          <AdminEvidenceList
            title="Risk flags"
            icon={<IconAlertTriangle className="size-4 text-destructive" />}
            items={summary.riskFlags}
            emptyText="No material risk flags detected."
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Admin Agent actions">
          {actions.map((action) => {
            const Icon = action.icon ?? IconBrain;
            return (
              <Link key={action.label} href={buildAgentPromptHref(action.prompt)}>
                <Button variant="outline" className="h-full min-h-24 w-full justify-start rounded-2xl p-3 text-left">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="ml-3 min-w-0 space-y-1">
                    <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">{action.description}</span>
                  </span>
                </Button>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminEvidenceList({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  emptyText: string;
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
        <p className="text-sm leading-6 text-emerald-600 dark:text-emerald-400">{emptyText}</p>
      )}
    </section>
  );
}
