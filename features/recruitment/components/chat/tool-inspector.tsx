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

function getDurationMs(event: ToolEvent): number | undefined {
  if (typeof event.durationMs === "number") return Math.max(0, event.durationMs);
  if (!event.startedAt) return undefined;

  const started = new Date(event.startedAt).getTime();
  if (Number.isNaN(started)) return undefined;

  const ended = event.endedAt ? new Date(event.endedAt).getTime() : Date.now();
  if (Number.isNaN(ended)) return undefined;

  return Math.max(0, ended - started);
}

function formatDuration(event: ToolEvent): string {
  const durationMs = getDurationMs(event);
  if (durationMs === undefined) return "—";
  if (durationMs < 1_000) return `${durationMs}ms`;
  const seconds = durationMs / 1_000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
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

function ToolRow({ event }: { event: ToolEvent }) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = event.status === "running";
  const isError = event.status === "error";

  const icon = isRunning ? (
    <IconLoader2 className="animate-spin text-blue-500 size-3.5" />
  ) : isError ? (
    <IconAlertTriangle className="text-destructive size-3.5" />
  ) : (
    <IconCheck className="text-emerald-500 size-3.5" />
  );

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
          {isRunning ? "Running " : isError ? "Failed " : "Completed "}
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

export function ToolInspector({
  events,
  isLoading = false,
  error = null,
  className,
}: ToolInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [, refreshDurations] = useState(0);

  const safeEvents = useMemo(() => events ?? [], [events]);
  const hasEvents = safeEvents.length > 0;

  // Auto-refresh durations while running
  useEffect(() => {
    const hasRunning = safeEvents.some((e) => e.status === "running");
    if (hasRunning || isLoading) {
      const intervalId = window.setInterval(() => refreshDurations((t) => t + 1), 500);
      return () => window.clearInterval(intervalId);
    }
  }, [safeEvents, isLoading]);

  // Auto-expand if currently running or error, but stick to user preference if toggled manually.
  // Actually, keeping it strictly toggleable is less jumpy, we'll just show the status in the collapsed header.

  if (!hasEvents && !isLoading && !error) {
    return null; // hide completely in friendly UI if nothing used
  }

  const statusType = error ? "error" : safeEvents.some(e => e.status === "error") ? "error" : safeEvents.some(e => e.status === "running") || isLoading ? "running" : "success";

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
            {statusType === "running" ? (
               <IconLoader2 className="animate-spin text-blue-500 size-4" />
            ) : statusType === "error" ? (
               <IconAlertTriangle className="text-destructive size-4" />
            ) : (
               <IconTerminal2 className="text-muted-foreground/60 size-4" />
            )}
            <span className={statusType === "error" ? "text-destructive" : "text-muted-foreground"}>
              {isLoading || statusType === "running" 
                ? "Working..." 
                : error ? "Tool execution failed" : `Used ${safeEvents.length} tool${safeEvents.length === 1 ? '' : 's'}`
              }
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
                <div className="flex flex-col p-1.5">
                  {safeEvents.map((event) => (
                    <ToolRow key={event.id} event={event} />
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
