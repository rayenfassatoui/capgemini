"use client";

import { motion } from "framer-motion";
import {
  IconArrowRight,
  IconBolt,
  IconChartBar,
  IconRadar,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  AgentProactiveBriefing,
  AgentProactiveBriefingCard,
  AgentProactiveBriefingTone,
} from "../../types";

interface ProactiveBriefingPanelProps {
  briefing: AgentProactiveBriefing;
  onSendSuggestion: (text: string) => void;
}

function getToneClass(tone: AgentProactiveBriefingTone) {
  if (tone === "danger") {
    return "border-destructive/30 bg-destructive/5";
  }

  if (tone === "warning") {
    return "border-primary/25 bg-primary/5";
  }

  if (tone === "success") {
    return "border-primary/20 bg-primary/5";
  }

  return "border-border bg-card";
}


function ProactiveCard({
  card,
  index,
  onSendSuggestion,
}: {
  card: AgentProactiveBriefingCard;
  index: number;
  onSendSuggestion: (text: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06 + index * 0.04 }}
    >
      <Card className={cn("h-full border", getToneClass(card.tone))} size="sm">
        <CardHeader className="gap-2">
          <CardTitle className="flex items-start gap-2">
            <IconRadar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{card.title}</span>
          </CardTitle>
          <CardDescription>{card.description}</CardDescription>
          <CardAction>
            <Badge variant={card.tone === "danger" ? "destructive" : "secondary"}>{card.priorityLabel}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Signal
            </p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">
              {card.metric}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5 text-xs leading-5 text-muted-foreground">
            {card.evidence.slice(0, 2).map((line, lineIndex) => (
              <li key={`${line}-${lineIndex}`} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1 rounded-full bg-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-auto justify-between"
            onClick={() => onSendSuggestion(card.prompt)}
          >
            Run agent analysis
            <IconArrowRight data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ProactiveBriefingPanel({
  briefing,
  onSendSuggestion,
}: ProactiveBriefingPanelProps) {
  return (
    <section
      aria-labelledby="proactive-briefing-title"
      className="flex min-h-[60vh] flex-col justify-center gap-6 px-1 py-6 md:px-2 md:py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-5 shadow-sm md:p-6"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-2xl flex-col gap-3">
            <Badge variant="outline" className="w-fit">
              <IconBolt data-icon="inline-start" />
              Proactive mode
            </Badge>
            <div className="flex flex-col gap-2">
              <h2
                id="proactive-briefing-title"
                className="text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-3xl"
              >
                {briefing.headline}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {briefing.summary}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => onSendSuggestion(briefing.suggestedPrompts[0] ?? '')}
            disabled={briefing.suggestedPrompts.length === 0}
          >
            <IconChartBar data-icon="inline-start" />
            Run proactive audit
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {briefing.cards.map((card, index) => (
            <ProactiveCard
              key={card.id}
              card={card}
              index={index}
              onSendSuggestion={onSendSuggestion}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Fast proactive prompts
          </p>
          <div className="flex flex-wrap gap-2">
            {briefing.suggestedPrompts.slice(1, 4).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSendSuggestion(prompt)}
                className="rounded-full border border-border bg-background px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
