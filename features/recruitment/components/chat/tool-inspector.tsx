"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconLoader2,
  IconTerminal2,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import type {
  ToolEvent,
  ToolEventStatus,
  ToolTraceJson,
} from "./chat-types";
import { formatToolName } from "./chat-types";
import {
  getToolEventDurationMs,
  groupToolEventsByPhase,
  type ToolTracePhaseGroup,
} from "./tool-inspector-helpers";

// Types
interface ToolInspectorProps {
  events?: ToolEvent[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

// Security & Formatting Utilities
const SENSITIVE_KEY_RE = /password|token|apikey|api_key|secret|authorization/i;

function redactJson(value: ToolTraceJson | undefined): ToolTraceJson | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item) ?? null);
  }

  if (typeof value === "object") {
    const redacted: Record<string, ToolTraceJson> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactJson(nestedValue) ?? null;
      }
    }
    return redacted;
  }
  return value;
}

function stringifyJson(value: ToolTraceJson | undefined): string {
  if (value === undefined) return "";
  return JSON.stringify(redactJson(value), null, 2);
}

function formatDurationMs(durationMs: number | undefined): string {
  if (durationMs === undefined) return "—";
  if (durationMs < 1_000) return `${durationMs}ms`;
  const seconds = durationMs / 1_000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

function formatDuration(event: ToolEvent): string {
  return formatDurationMs(getToolEventDurationMs(event));
}

function formatClockTime(value: string | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getStatusLabel(status: ToolEventStatus): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "pending_confirmation") return "Needs confirmation";
  if (status === "error") return "Failed";
  return "Completed";
}

// Components
function JsonPre({ label, value }: { label: string; value: ToolTraceJson | undefined }) {
  const [copied, setCopied] = useState(false);
  if (value === undefined) return null;

  const content = stringifyJson(value);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group rounded-md border border-border/40 bg-zinc-950 dark:bg-black p-2 mt-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1 select-none font-medium px-1">
        {label}
        <button
          onClick={handleCopy}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5 rounded-sm"
          title="Copy JSON"
        >
          {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
        </button>
      </div>
      <pre className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-[11px] font-mono leading-relaxed text-zinc-300 dark:text-zinc-400 px-1">
        {content}
      </pre>
    </div>
  );
}
function StatusIcon({
  status,
  className,
}: {
  status: ToolEventStatus;
  className?: string;
}) {
  if (status === "running") {
    return <IconLoader2 className={cn("animate-spin text-blue-500", className)} />;
  }

  if (status === "error") {
    return <IconAlertTriangle className={cn("text-destructive", className)} />;
  }

  if (status === "pending_confirmation") {
    return <IconAlertTriangle className={cn("text-amber-500", className)} />;
  }

  if (status === "queued") {
    return <IconTerminal2 className={cn("text-muted-foreground", className)} />;
  }

  return <IconCheck className={cn("text-emerald-500", className)} />;
}

function ToolRow({ event }: { event: ToolEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const isError = event.status === "error";
  const statusLabel = getStatusLabel(event.status);
  const retryAttempt = event.retry?.attempt;
  const retryMaxAttempts = event.retry?.maxAttempts;
  const retryText =
    typeof retryAttempt === "number" && typeof retryMaxAttempts === "number"
      ? `${retryAttempt}/${retryMaxAttempts}`
      : undefined;

  const icon = <StatusIcon status={event.status} className="size-3.5" />;

  return (
    <div className="flex flex-col group/row">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full py-1.5 px-2 hover:bg-muted/40 rounded-md text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-0"
        aria-expanded={isOpen}
      >
        <span className="flex-none mr-2 text-muted-foreground/60 group-hover/row:text-muted-foreground transition-colors">
          {isOpen ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
        </span>
        <span className="flex-none mr-2.5">
          {icon}
        </span>
        <span className="flex-1 text-left select-none text-muted-foreground transition-colors">
          {statusLabel}{" "}
          <span className="font-mono text-[11.5px] font-medium text-foreground/80 lowercase">{formatToolName(event.tool).replace(/ /g, "_")}</span>
        </span>
        <span className="flex-none text-muted-foreground/40 font-mono text-[10px] ml-3 tracking-tighter">
          {formatDuration(event)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-[22px] pl-3 border-l border-border/40 py-1.5 space-y-2 mb-1 mr-2">
              <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    <span className="text-foreground/80">Status:</span> {statusLabel}
                  </span>
                  <span>
                    <span className="text-foreground/80">Duration:</span> {formatDuration(event)}
                  </span>
                  {retryText ? (
                    <span>
                      <span className="text-foreground/80">Retry:</span> {retryText}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    <span className="text-foreground/80">Started:</span> {formatClockTime(event.startedAt)}
                  </span>
                  <span>
                    <span className="text-foreground/80">Ended:</span> {formatClockTime(event.endedAt)}
                  </span>
                </div>

                {event.purpose ? (
                  <div>
                    <span className="text-foreground/80">Purpose:</span> {event.purpose}
                  </div>
                ) : null}

                {event.summary ? (
                  <div>
                    <span className="text-foreground/80">Summary:</span> {event.summary}
                  </div>
                ) : null}

                {event.retry?.reason ? (
                  <div>
                    <span className="text-foreground/80">Retry reason:</span> {event.retry.reason}
                  </div>
                ) : null}
              </div>

              <JsonPre label="Arguments" value={event.input} />
              
              {isError && event.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive font-mono">
                  {event.error}
                </div>
              )}
              
              {!isError && (
                <JsonPre label="Result" value={event.output} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function ToolPhaseSection({ phase }: { phase: ToolTracePhaseGroup }) {
  return (
    <section
      className="relative rounded-lg border border-border/50 bg-background/55 p-2"
      aria-label={`${phase.label} phase`}
    >
      <div className="flex items-start gap-2.5 px-1 pb-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card">
          <StatusIcon status={phase.status} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-foreground">
              {phase.label}
            </h4>
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {phase.events.length} tool{phase.events.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {getStatusLabel(phase.status)}
            </span>
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {formatDurationMs(phase.durationMs)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {phase.description}
          </p>
        </div>
      </div>

      <div className="space-y-1 border-l border-border/50 pl-3 ml-[14px]">
        {phase.events.map((event) => (
          <ToolRow key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

export function ToolInspector({
  events,
  isLoading = false,
  error = null,
  className,
}: ToolInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, refreshDurations] = useState(0);

  const safeEvents = useMemo(() => events ?? [], [events]);
  const phaseGroups = groupToolEventsByPhase(safeEvents);
  const hasEvents = safeEvents.length > 0;

  // Auto-refresh durations while running
  useEffect(() => {
    const hasRunning = safeEvents.some((e) => e.status === "running");
    if (hasRunning || isLoading) {
      const intervalId = window.setInterval(() => refreshDurations((t) => t + 1), 500);
      return () => window.clearInterval(intervalId);
    }
  }, [safeEvents, isLoading]);

  const headerStatus: ToolEventStatus = error
    ? "error"
    : safeEvents.some((event) => event.status === "error")
      ? "error"
      : safeEvents.some((event) => event.status === "running") || isLoading
        ? "running"
        : safeEvents.some((event) => event.status === "pending_confirmation")
          ? "pending_confirmation"
          : "success";
  const isTraceRunning = isLoading || headerStatus === "running";
  const headerTextClass =
    headerStatus === "error"
      ? "text-destructive"
      : headerStatus === "pending_confirmation"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  const traceCountText =
    phaseGroups.length > 0
      ? `${phaseGroups.length} phase${phaseGroups.length === 1 ? "" : "s"} / ${safeEvents.length} tool${safeEvents.length === 1 ? "" : "s"}`
      : `Evidence trace: ${safeEvents.length} tool${safeEvents.length === 1 ? "" : "s"}`;

  if (!hasEvents && !isLoading && !error) {
    return null; // hide completely in friendly UI if nothing used
  }


  return (
    <div className={cn("w-full max-w-2xl my-2", className)}>
      <div className="rounded-xl border border-border/40 bg-card/20 overflow-hidden text-sm shadow-sm">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex w-full items-center justify-between px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring focus:bg-muted/30 transition-colors",
            isOpen ? "bg-muted/40 border-b border-border/40" : "hover:bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2.5">
            <StatusIcon status={headerStatus} className="size-4" />
            <span className={headerTextClass}>
              {isTraceRunning
                ? "Building evidence trace..."
                : error ? "Evidence trace failed" : headerStatus === "pending_confirmation" ? "Confirmation required" : traceCountText}
            </span>
          </div>
          <IconChevronDown
            className={cn(
              "size-4 text-muted-foreground/50 transition-transform duration-200",
              isOpen ? "rotate-180" : ""
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="bg-muted/10"
            >
              {error && (
                <div className="p-3 text-xs text-destructive border-b border-border/40">
                  {error}
                </div>
              )}
              
              {hasEvents && (
                <div className="flex flex-col gap-2 p-2">
                  {phaseGroups.map((phase) => (
                    <ToolPhaseSection key={phase.id} phase={phase} />
                  ))}
                </div>
              )}

              {!hasEvents && !error && (
                <div className="p-4 text-xs text-muted-foreground text-center opacity-60">
                  No specific tools were executed.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
