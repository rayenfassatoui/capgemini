import type { ToolEvent, ToolEventStatus } from "./chat-types";

export type ToolTracePhaseId =
  | "planning"
  | "retrieval"
  | "analysis"
  | "confirmation"
  | "execution"
  | "verification";

export interface ToolTracePhaseDefinition {
  id: ToolTracePhaseId;
  label: string;
  description: string;
}

export interface ToolTracePhaseGroup extends ToolTracePhaseDefinition {
  status: ToolEventStatus;
  events: ToolEvent[];
  durationMs?: number;
}

export const TOOL_TRACE_PHASES: readonly ToolTracePhaseDefinition[] = [
  {
    id: "planning",
    label: "Planning",
    description: "The agent prepared tool work and queued operations.",
  },
  {
    id: "retrieval",
    label: "Retrieval",
    description: "Live recruitment records were fetched from role-scoped tools.",
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Fetched records were matched, compared, scored, or summarized.",
  },
  {
    id: "confirmation",
    label: "Confirmation",
    description: "A mutating action is waiting for explicit approval.",
  },
  {
    id: "execution",
    label: "Execution",
    description: "Approved or directly requested workflow changes were applied.",
  },
  {
    id: "verification",
    label: "Verification",
    description: "Audit, export, duplicate, or governance evidence was checked.",
  },
];

const EXECUTION_TOOL_RE = /(^|_)(add|assign|bulk|cancel|close|create|delete|hire|reject|schedule|send|toggle|update|upload)(_|$)/i;
const VERIFICATION_TOOL_RE = /(^|_)(activity|audit|check|duplicate|email_logs|export|governance|log|logs|notification|overview|verify)(_|$)/i;
const ANALYSIS_TOOL_RE = /(^|_)(analytics|compare|debrief|generate|insights?|match|optimi[sz]e|predict|rank|score|screening?)(_|$)/i;
const RETRIEVAL_TOOL_RE = /(^|_)(calendar|candidate|cv|dashboard|details|get|hybrid|interview|job|list|onboarding|pool|rag|resume|search|semantic|stats)(_|$)/i;

function getPhaseDefinition(id: ToolTracePhaseId): ToolTracePhaseDefinition {
  for (const phase of TOOL_TRACE_PHASES) {
    if (phase.id === id) return phase;
  }

  return TOOL_TRACE_PHASES[0];
}

export function getToolEventDurationMs(
  event: ToolEvent,
  now: number = Date.now(),
): number | undefined {
  if (typeof event.durationMs === "number") return Math.max(0, event.durationMs);
  if (!event.startedAt) return undefined;

  const started = new Date(event.startedAt).getTime();
  if (!Number.isFinite(started)) return undefined;

  const ended = event.endedAt ? new Date(event.endedAt).getTime() : now;
  if (!Number.isFinite(ended)) return undefined;

  return Math.max(0, ended - started);
}

export function classifyToolTracePhase(event: ToolEvent): ToolTracePhaseId {
  if (event.status === "pending_confirmation") return "confirmation";

  const toolName = event.tool.toLowerCase();
  if (EXECUTION_TOOL_RE.test(toolName)) return "execution";
  if (VERIFICATION_TOOL_RE.test(toolName)) return "verification";
  if (ANALYSIS_TOOL_RE.test(toolName)) return "analysis";
  if (RETRIEVAL_TOOL_RE.test(toolName)) return "retrieval";

  return "planning";
}

function summarizeStatus(events: readonly ToolEvent[]): ToolEventStatus {
  let hasQueued = false;
  let hasPending = false;
  let hasRunning = false;

  for (const event of events) {
    if (event.status === "error") return "error";
    if (event.status === "running") hasRunning = true;
    if (event.status === "pending_confirmation") hasPending = true;
    if (event.status === "queued") hasQueued = true;
  }

  if (hasRunning) return "running";
  if (hasPending) return "pending_confirmation";
  if (hasQueued) return "queued";
  return "success";
}

function sumDurations(events: readonly ToolEvent[], now: number): number | undefined {
  let total = 0;
  let hasDuration = false;

  for (const event of events) {
    const durationMs = getToolEventDurationMs(event, now);
    if (durationMs === undefined) continue;
    total += durationMs;
    hasDuration = true;
  }

  return hasDuration ? total : undefined;
}

export function groupToolEventsByPhase(
  events: readonly ToolEvent[],
  now: number = Date.now(),
): ToolTracePhaseGroup[] {
  const grouped = new Map<ToolTracePhaseId, ToolEvent[]>();

  for (const event of events) {
    const phaseId = classifyToolTracePhase(event);
    const phaseEvents = grouped.get(phaseId);
    if (phaseEvents) {
      phaseEvents.push(event);
      continue;
    }

    grouped.set(phaseId, [event]);
  }

  const phases: ToolTracePhaseGroup[] = [];
  for (const definition of TOOL_TRACE_PHASES) {
    const phaseEvents = grouped.get(definition.id);
    if (!phaseEvents || phaseEvents.length === 0) continue;

    phases.push({
      ...definition,
      status: summarizeStatus(phaseEvents),
      events: phaseEvents,
      durationMs: sumDurations(phaseEvents, now),
    });
  }

  return phases;
}

export function getToolTracePhaseLabel(event: ToolEvent): string {
  return getPhaseDefinition(classifyToolTracePhase(event)).label;
}
