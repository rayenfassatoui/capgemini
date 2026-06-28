"use client";

import Link from "next/link";
import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Streamdown } from "streamdown";
import { mermaid } from "@streamdown/mermaid";
import { IconAlertTriangle, IconArrowDown, IconChartBar, IconCheck, IconCopy, IconDatabase, IconDownload, IconExternalLink, IconFile, IconInfoCircle, IconLoader2, IconQuote, IconShieldCheck, IconUserCheck, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CapgeminiIcons } from "@/components/shared/icons";
import type { AgentActionConfirmation, ChatMessage, ToolEvent } from "./chat-types";
import type { AgentEvidenceMetadata, RecruitmentResponseCard, RecruitmentResponseCardTone } from "../../types";
import { SUGGESTIONS, formatToolName } from "./chat-types";
import {
  buildConfirmationPreview,
  getConfirmationExpiryState,
  getFollowUpSuggestions,
  summarizeEvidenceConfidence,
} from "./chat-message-helpers";
import { ToolInspector } from "./tool-inspector";
import { ChatAnalyticsChart } from "./chat-analytics-chart";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  variant?: "panel" | "workspace";
  onSendSuggestion: (text: string) => void;
  onConfirmAction: (confirmation: AgentActionConfirmation, decision: "confirm" | "cancel") => void;
}

const STATUS_TEXT_THINKING = "Thinking...";

function AttachmentChip({
  filename,
  size,
}: {
  filename: string;
  size: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-card px-2.5 py-1.5 mt-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <IconFile className="size-3.5 stroke-[1.5] text-muted-foreground shrink-0" />
      <span className="text-[12px] font-medium text-foreground/90 truncate">
        {filename}
      </span>
      <div className="w-px h-3 bg-border mx-1" />
      <span className="text-[10px] text-muted-foreground tracking-wider">
        {Math.round(size / 1024)}KB
      </span>
    </div>
  );
}

function FileDownloadButton({
  filename,
  base64,
  contentType,
}: {
  filename: string;
  base64: string;
  contentType: string;
}) {
  const handleDownload = () => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="group relative flex w-full max-w-sm items-center justify-between rounded-xl border border-border bg-card p-1.5 mt-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px hover:border-primary/20"
    >
      <div className="flex items-center gap-3 w-full min-w-0 px-2 pl-3">
        <IconFile className="size-4 stroke-[1.5] text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <div className="flex flex-col items-start min-w-0 py-1.5">
          <span className="text-[14px] font-semibold text-card-foreground truncate w-full text-left group-hover:text-primary transition-colors duration-300">
            {filename}
          </span>
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-primary group-hover:text-primary-foreground mr-0.5">
        <IconDownload className="size-4 stroke-[1.5]" />
      </div>
    </button>
  );
}

function ActionConfirmationCard({
  confirmation,
  disabled,
  onConfirmAction,
}: {
  confirmation: AgentActionConfirmation;
  disabled: boolean;
  onConfirmAction: (confirmation: AgentActionConfirmation, decision: "confirm" | "cancel") => void;
}) {
  const preview = buildConfirmationPreview(confirmation);
  const [expiryNow, setExpiryNow] = useState(() => Date.now());
  const expiryState = getConfirmationExpiryState(
    confirmation.expiresAt,
    expiryNow,
  );

  useEffect(() => {
    if (confirmation.status !== "pending") return;

    const intervalId = window.setInterval(() => {
      setExpiryNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [confirmation.status]);

  const isPending = confirmation.status === "pending" && !expiryState.expired;
  const statusLabel = expiryState.expired && confirmation.status === "pending"
    ? "Expired"
    : confirmation.status === "confirmed"
      ? "Confirmed"
      : confirmation.status === "cancelled"
        ? "Cancelled"
        : "Awaiting confirmation";

  const riskToneClass =
    preview.riskLevel === "high"
      ? "border-rose-300/60 bg-rose-100/80 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-100"
      : preview.riskLevel === "medium"
        ? "border-amber-300/60 bg-amber-100/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-emerald-300/60 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100";

  return (
    <section className="mt-4 w-full max-w-2xl rounded-2xl border border-amber-300/50 bg-amber-50/70 p-4 text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <IconShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                Confirmation required
              </p>
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  riskToneClass,
                )}
              >
                {preview.riskLabel}
              </span>
              <span className="inline-flex rounded-full border border-amber-300/50 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-100">
                {confirmation.status === "pending" ? expiryState.label : statusLabel}
              </span>
            </div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-50">
              {formatToolName(confirmation.toolName)}
            </h3>
          </div>

          <p className="text-sm leading-6 text-amber-900/90 dark:text-amber-100/85">
            {confirmation.summary}
          </p>

          {preview.entities.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Affected entities">
              {preview.entities.map((entity) => (
                <span
                  key={`${entity.label}-${entity.value}`}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300/50 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground"
                >
                  <span className="text-muted-foreground">{entity.label}</span>
                  <span>{entity.value}</span>
                </span>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-amber-300/50 bg-background/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
              Expected impact
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/85">
              {preview.impact.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="rounded-xl border border-amber-300/50 bg-background/60 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Review exact arguments
            </summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {JSON.stringify(confirmation.args, null, 2)}
            </pre>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {statusLabel}
            </span>
            {isPending && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onConfirmAction(confirmation, "cancel")}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconX className="size-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onConfirmAction(confirmation, "confirm")}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconCheck className="size-3.5" />
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function getSourceKindLabel(kind: string): string {
  if (kind === "cv") return "CV";
  if (kind === "job") return "Job";
  if (kind === "candidate") return "Candidate";
  if (kind === "analytics") return "Analytics";
  if (kind === "interview") return "Interview";
  if (kind === "operation") return "Workflow";
  if (kind === "search") return "Search";
  if (kind === "system") return "System";
  if (kind === "onboarding") return "Onboarding";
  return "Tool";
}

function SourceEvidencePanel({
  evidence,
}: {
  evidence?: AgentEvidenceMetadata;
}) {
  if (!evidence || evidence.sources.length === 0) return null;

  const confidence = summarizeEvidenceConfidence(evidence);
  const confidenceToneClass =
    confidence?.level === "high"
      ? "border-emerald-300/60 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100"
      : confidence?.level === "medium"
        ? "border-amber-300/60 bg-amber-100/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-rose-300/60 bg-rose-100/80 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-100";

  return (
    <section
      className="mb-4 w-full max-w-2xl rounded-2xl border border-border/70 bg-card/55 p-3 shadow-sm"
      aria-label="Source-backed evidence"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconDatabase className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Source-backed
            </p>
            <p className="text-sm font-medium text-foreground">
              {confidence?.verifiedSources ?? 0} verified source{confidence?.verifiedSources === 1 ? "" : "s"}
              {confidence && confidence.failedSources > 0 ? `, ${confidence.failedSources} failed` : ""}
            </p>
            {confidence?.summary ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {confidence.summary}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              confidenceToneClass,
            )}
          >
            {confidence?.level === "high"
              ? "High confidence"
              : confidence?.level === "medium"
                ? "Medium confidence"
                : "Low confidence"}
          </span>
          <span className="inline-flex rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {confidence?.observedFactCount ?? 0} observed
          </span>
          {confidence && confidence.inferenceLimitCount > 0 ? (
            <span className="inline-flex rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {confidence.inferenceLimitCount} limit{confidence.inferenceLimitCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Source chips">
        {evidence.sources.map((source) => {
          const chipClass = cn(
            "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            source.status === "success"
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-destructive/20 bg-destructive/10 text-destructive",
          );

          const content = (
            <>
              <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {getSourceKindLabel(source.kind)}
              </span>
              <span className="truncate">{source.label}</span>
              {typeof source.count === "number" ? (
                <span className="text-muted-foreground">{source.count}</span>
              ) : null}
              {source.link ? <IconExternalLink className="size-3 text-current/70" /> : null}
            </>
          );

          return source.link ? (
            <Link
              key={source.id}
              href={source.link.href}
              className={chipClass}
              aria-label={`${source.label}: ${source.status}. ${source.link.label}.`}
            >
              {content}
            </Link>
          ) : (
            <span
              key={source.id}
              className={chipClass}
              aria-label={`${source.label}: ${source.status}`}
            >
              {content}
            </span>
          );
        })}
      </div>
      {confidence && confidence.issues.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-900 dark:text-amber-100">
            <IconInfoCircle className="size-3.5" />
            Main caveats
          </div>
          <ul className="space-y-1.5 text-xs leading-5 text-amber-950/85 dark:text-amber-100/85">
            {confidence.issues.map((issue) => (
              <li key={issue} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <IconQuote className="size-3.5 text-primary" />
            Observed
          </div>
          <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
            {evidence.observedFacts.slice(0, 3).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <IconInfoCircle className="size-3.5 text-muted-foreground" />
            Inferred with limits
          </div>
          <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
            {(evidence.inferenceLimits.length > 0
              ? evidence.inferenceLimits.slice(0, 3)
              : ["No additional inference limit was recorded for this answer."]).map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>
      </div>

      {evidence.evidenceBlocks.length > 0 && (
        <details className="mt-3 rounded-xl border border-border/60 bg-background/50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Evidence blocks
          </summary>
          <div className="mt-3 space-y-3">
            {evidence.evidenceBlocks.map((block) => (
              <div key={block.id} className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">
                  {block.title}
                </p>
                <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                  {block.items.map((item, itemIndex) => (
                    <li
                      key={item.id ?? `${block.id}-item-${itemIndex}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="flex-1">{item.text}</span>
                      {item.link ? (
                        <Link
                          href={item.link.href}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {item.link.label}
                          <IconExternalLink className="size-3" />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
function getResponseCardKindLabel(kind: RecruitmentResponseCard["kind"]): string {
  if (kind === "candidate") return "Candidate card";
  if (kind === "pipeline") return "Pipeline card";
  return "Governance card";
}

function getResponseCardToneClass(tone: RecruitmentResponseCardTone | undefined): string {
  if (tone === "success") {
    return "border-emerald-300/60 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-100";
  }
  if (tone === "warning") {
    return "border-amber-300/60 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100";
  }
  if (tone === "danger") {
    return "border-rose-300/60 bg-rose-50/80 text-rose-950 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-100";
  }
  return "border-border/70 bg-card/70 text-foreground";
}

function getResponseCardMetricToneClass(tone: RecruitmentResponseCardTone | undefined): string {
  if (tone === "success") return "text-emerald-700 dark:text-emerald-300";
  if (tone === "warning") return "text-amber-700 dark:text-amber-300";
  if (tone === "danger") return "text-rose-700 dark:text-rose-300";
  return "text-foreground";
}

function ResponseCardIcon({ kind }: { kind: RecruitmentResponseCard["kind"] }) {
  if (kind === "candidate") {
    return <IconUserCheck className="size-4" />;
  }

  if (kind === "pipeline") {
    return <IconChartBar className="size-4" />;
  }

  return <IconAlertTriangle className="size-4" />;
}

function ResponseCardAction({
  action,
  onSendSuggestion,
}: {
  action: NonNullable<RecruitmentResponseCard["actions"]>[number];
  onSendSuggestion: (text: string) => void;
}) {
  const className =
    "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
        <IconExternalLink className="size-3" />
      </Link>
    );
  }

  if (action.prompt) {
    const prompt = action.prompt;
    return (
      <button
        type="button"
        onClick={() => onSendSuggestion(prompt)}
        className={className}
      >
        {action.label}
      </button>
    );
  }

  return null;
}

function ResponseCard({
  card,
  onSendSuggestion,
}: {
  card: RecruitmentResponseCard;
  onSendSuggestion: (text: string) => void;
}) {
  const toneClass = getResponseCardToneClass(card.tone);

  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-sm backdrop-blur",
        toneClass,
      )}
      aria-label={getResponseCardKindLabel(card.kind)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background/70 text-current">
            <ResponseCardIcon kind={card.kind} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-current/65">
              {getResponseCardKindLabel(card.kind)}
            </p>
            <h3 className="mt-1 text-sm font-bold leading-5 text-current">
              {card.title}
            </h3>
            {card.description ? (
              <p className="mt-1 text-xs leading-5 text-current/75">
                {card.description}
              </p>
            ) : null}
          </div>
        </div>
        {card.sourceTool ? (
          <span className="hidden rounded-full border border-current/15 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-current/65 sm:inline-flex">
            {formatToolName(card.sourceTool)}
          </span>
        ) : null}
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        {card.metrics.map((metric) => (
          <div
            key={`${card.id}-${metric.label}`}
            className="rounded-xl border border-current/10 bg-background/65 p-3"
          >
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-current/55">
              {metric.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-base font-bold leading-6",
                getResponseCardMetricToneClass(metric.tone),
              )}
            >
              {metric.value}
            </dd>
            {metric.detail ? (
              <p className="mt-1 text-xs leading-5 text-current/65">
                {metric.detail}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      {card.bullets && card.bullets.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-current/75">
          {card.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current/45" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {card.actions && card.actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {card.actions.map((action) => (
            <ResponseCardAction
              key={`${card.id}-${action.label}`}
              action={action}
              onSendSuggestion={onSendSuggestion}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ResponseCardsPanel({
  cards,
  onSendSuggestion,
}: {
  cards?: RecruitmentResponseCard[];
  onSendSuggestion: (text: string) => void;
}) {
  if (!cards || cards.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 pt-1" aria-label="Structured response cards">
      {cards.map((card) => (
        <ResponseCard
          key={card.id}
          card={card}
          onSendSuggestion={onSendSuggestion}
        />
      ))}
    </section>
  );
}

function EmptyState({
  onSendSuggestion,
}: {
  onSendSuggestion: (text: string) => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-5 py-14">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center"
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Ready
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
          Ask the recruitment agent
        </h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Use a direct request. The agent will fetch data, cite tools, and return charts when useful.
        </p>
      </motion.div>

      <div className="grid w-full max-w-xl gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: 0.08 + index * 0.03,
              ease: [0.32, 0.72, 0, 1],
            }}
            type="button"
            onClick={() => onSendSuggestion(suggestion)}
            className="group flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{suggestion}</span>
            <svg
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LoadingIndication() {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2">
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{
          duration: 1.5,
          delay: 0.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{
          duration: 1.5,
          delay: 0.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
    </div>
  );
}

function AssistantWorkingIndicator({
  toolEvents,
}: {
  toolEvents?: ToolEvent[];
}) {
  const runningTool = toolEvents?.find((evt) => evt.status === "running");
  const statusText = runningTool
    ? `Working on ${formatToolName(runningTool.tool)}`
    : STATUS_TEXT_THINKING;

  return (
    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-border/70 bg-muted/30 px-3 py-2">
      <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" />
      <motion.span
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="relative text-[12px] font-medium tracking-wide text-muted-foreground"
      >
        {statusText}
      </motion.span>
      <div className="ml-1 flex items-center gap-1">
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 1,
            delay: 0.15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 1,
            delay: 0.3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
      </div>
    </div>
  );
}

function AssistantMessageActions({
  message,
  showFollowUps,
  onSendSuggestion,
}: {
  message: ChatMessage;
  showFollowUps: boolean;
  onSendSuggestion: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const followUps = getFollowUpSuggestions({
    content: message.content,
    metadata: message.metadata,
    charts: message.charts,
    cards: message.cards ?? message.metadata?.cards,
    confirmations: message.confirmations,
    toolEvents: message.toolEvents,
  });

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }, [message.content]);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={copied ? "Response copied" : "Copy response"}
        >
          {copied ? (
            <IconCheck className="size-3.5 text-primary" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {showFollowUps && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested follow-up questions">
          {followUps.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSendSuggestion(suggestion)}
              className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function MessageBubble({
  msg,
  isLast,
  isStreaming,
  showFollowUps,
  onSendSuggestion,
  onConfirmAction,
}: {
  msg: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  showFollowUps: boolean;
  onSendSuggestion: (text: string) => void;
  onConfirmAction: (confirmation: AgentActionConfirmation, decision: "confirm" | "cancel") => void;
}) {
  const isUser = msg.role === "user";
  const hasToolEvents = (msg.toolEvents?.length ?? 0) > 0;
  const hasRunningTool =
    hasToolEvents &&
    msg.toolEvents!.some(
      (event) => event.status === "running" || event.status === "queued",
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "group flex w-full gap-4 pb-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/10 shadow-sm mt-1">
          <CapgeminiIcons className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col max-w-[85%] lg:max-w-[75%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        {msg.role === "assistant" &&
          hasToolEvents && (
            <div className="mb-4 w-full max-w-2xl">
              <ToolInspector
                events={msg.toolEvents}
                isLoading={isLast && isStreaming && hasRunningTool}
              />
            </div>
          )}

        {!isUser && msg.content && (
          <div className="pl-1 pb-1">
            <span className="text-[12px] font-semibold text-muted-foreground tracking-wide uppercase">
              Agent
            </span>
          </div>
        )}
        {!isUser && <SourceEvidencePanel evidence={msg.metadata?.evidence} />}

        <div
          className={cn(
            "text-[15px] leading-[1.65]",
            isUser
              ? "rounded-[18px] rounded-tr-lg bg-primary text-primary-foreground px-5 py-3.5 shadow-md"
              : "text-foreground/90",
          )}
        >
          {isUser ? (
            <div className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {msg.attachments.map((att) => (
                    <AttachmentChip
                      key={att.filename}
                      filename={att.filename}
                      size={att.size}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : msg.content ? (
            <div className="space-y-4 font-sans">
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/90
                [&_p]:leading-[1.7] [&_p]:mb-4
                [&_strong]:font-bold [&_strong]:text-foreground
                [&_h1]:text-xl [&_h1]:font-serif [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h1]:mb-4 [&_h1]:mt-8
                [&_h2]:text-lg [&_h2]:font-serif [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-6
                [&_code]:bg-muted [&_code]:text-foreground [&_code]:font-mono [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded px-0
                [&_pre]:bg-zinc-950 dark:[&_pre]:bg-zinc-900 [&_pre]:text-zinc-50 [&_pre]:border [&_pre]:border-border [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:shadow-sm
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:mb-6
                [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
                [&_td]:border-b [&_td]:border-border/50 [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-muted-foreground
                [&_ul]:pl-5 [&_ul]:mb-5 [&_ul]:space-y-1.5 [&_li]:pl-1 [&_li::marker]:text-muted-foreground
                [&_ol]:pl-5 [&_ol]:mb-5 [&_ol]:space-y-1.5"
              >
                <Streamdown
                  plugins={{ mermaid }}
                  isAnimating={isLast && isStreaming}
                >
                  {msg.content}
                </Streamdown>
              </div>
              <ResponseCardsPanel
                cards={msg.cards}
                onSendSuggestion={onSendSuggestion}
              />
              {msg.charts && msg.charts.length > 0 && (
                <div className="flex flex-col gap-4 pt-1">
                  {msg.charts.map((chart) => (
                    <ChatAnalyticsChart key={chart.id} chart={chart} />
                  ))}
                </div>
              )}
              {msg.fileDownloads && msg.fileDownloads.length > 0 && (
                <div className="flex flex-col gap-3 pt-2">
                  {msg.fileDownloads.map((fd) => (
                    <FileDownloadButton
                      key={fd.filename}
                      filename={fd.filename}
                      base64={fd.base64}
                      contentType={fd.contentType}
                    />
                  ))}
                </div>
              )}
              {msg.confirmations && msg.confirmations.length > 0 && (
                <div className="flex flex-col gap-3 pt-2">
                  {msg.confirmations.map((confirmation) => (
                    <ActionConfirmationCard
                      key={confirmation.id}
                      confirmation={confirmation}
                      disabled={isStreaming}
                      onConfirmAction={onConfirmAction}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : isLast &&
            isStreaming &&
            !hasToolEvents ? (
            <LoadingIndication />
          ) : null}
        </div>
        {!isUser && msg.content && !(isLast && isStreaming) && (
          <AssistantMessageActions
            message={msg}
            showFollowUps={showFollowUps}
            onSendSuggestion={onSendSuggestion}
          />
        )}
        {!isUser && isLast && isStreaming && hasToolEvents && (
          <AssistantWorkingIndicator toolEvents={msg.toolEvents} />
        )}
      </div>
    </motion.div>
  );
}

export function ChatMessageList({
  messages,
  isStreaming,
  isLoadingHistory,
  variant = "panel",
  onSendSuggestion,
  onConfirmAction,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  const setPinnedToBottom = useCallback((value: boolean) => {
    pinnedToBottomRef.current = value;
    setIsPinnedToBottom(value);
  }, []);

  const isNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 96;
  }, []);

  const scrollContainerToBottom = useCallback((behavior: ScrollBehavior) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    scrollContainerToBottom(behavior);
    setPinnedToBottom(true);
  }, [scrollContainerToBottom, setPinnedToBottom]);

  const handleScroll = useCallback(() => {
    setPinnedToBottom(isNearBottom());
  }, [isNearBottom, setPinnedToBottom]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const messageCountChanged = previousCount !== messages.length;
    previousMessageCountRef.current = messages.length;

    const latestMessage = messages[messages.length - 1];
    const userJustSent = messageCountChanged && latestMessage?.role === "user";

    if (pinnedToBottomRef.current || userJustSent) {
      scrollContainerToBottom(messageCountChanged ? "smooth" : "auto");
    }
  }, [messages, isStreaming, scrollContainerToBottom]);

  let lastAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant" && messages[index].content) {
      lastAssistantIndex = index;
      break;
    }
  }

  if (isLoadingHistory) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "relative flex-1 overflow-y-auto px-4 py-6 scrollbar-hide md:px-6",
        variant === "workspace" ? "bg-transparent" : "bg-background",
      )}
    >
      <div className={cn("mx-auto flex flex-col gap-6", variant === "workspace" ? "max-w-4xl" : "max-w-3xl")}>
        {messages.length === 0 ? (
          <EmptyState onSendSuggestion={onSendSuggestion} />
        ) : (
          messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isLast={index === messages.length - 1}
              isStreaming={isStreaming}
              showFollowUps={index === lastAssistantIndex && !(index === messages.length - 1 && isStreaming)}
              onSendSuggestion={onSendSuggestion}
              onConfirmAction={onConfirmAction}
            />
          ))
        )}
      </div>
      {!isPinnedToBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="sticky bottom-4 z-10 ml-auto mt-4 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconArrowDown className="size-3.5" />
          Latest
        </button>
      )}
    </div>
  );
}
