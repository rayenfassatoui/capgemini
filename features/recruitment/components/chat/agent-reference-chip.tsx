"use client";

import Link from "next/link";
import { IconFileText, IconX } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentReference } from "./agent-prompts";

interface AgentReferenceChipProps {
  reference: AgentReference;
  className?: string;
  placement?: "composer" | "message";
  onRemove?: () => void;
}

export function AgentReferenceChip({
  reference,
  className,
  placement = "composer",
  onRemove,
}: AgentReferenceChipProps) {
  const previewFacts = reference.facts?.slice(0, placement === "message" ? 4 : 3) ?? [];

  const chip = (
    <span
      className={cn(
        "group/reference inline-flex max-w-full flex-col gap-1 rounded-md border border-border bg-muted/45 px-2 py-1.5 text-xs text-foreground shadow-xs transition-colors duration-200 hover:border-primary/25 hover:bg-muted/70",
        placement === "message" && "bg-background/90 text-foreground shadow-none",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
          <IconFileText className="size-3" />
        </span>
        <Badge
          variant="outline"
          className="h-4 rounded-[4px] border-border/80 px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          CV
        </Badge>
        <span className="min-w-0 max-w-48 truncate font-medium leading-none sm:max-w-72">
          {reference.title}
        </span>
        {reference.subtitle && (
          <span className="hidden max-w-44 truncate text-muted-foreground sm:inline">
            {reference.subtitle}
          </span>
        )}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="-mr-1 size-5 rounded-[4px] text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={onRemove}
            aria-label={`Remove ${reference.title} reference`}
          >
            <IconX />
          </Button>
        )}
      </span>
      {previewFacts.length > 0 && (
        <span className="flex max-w-full flex-wrap gap-1 pl-5">
          {previewFacts.map((fact) => (
            <Badge
              key={`${fact.label}:${fact.value}`}
              variant="secondary"
              className="max-w-56 justify-start gap-1 rounded-[4px] px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            >
              <span className="shrink-0 font-semibold text-foreground/80">
                {fact.label}
              </span>
              <span className="truncate">{fact.value}</span>
            </Badge>
          ))}
        </span>
      )}
    </span>
  );

  if (!reference.href || onRemove) {
    return chip;
  }

  return (
    <Link href={reference.href} className="max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {chip}
    </Link>
  );
}
