import type { RecruitmentAnalyticsChart, RecruitmentResponseCard } from "../../types";
import type {
  AgentActionConfirmation,
  ChatAttachment,
  ChatResponseMetadata,
  FileDownload,
  ToolEvent,
  ToolEventStatus,
} from "../../chat-artifact-events";
import type { AgentReference } from "./agent-prompts";

export type {
  AgentActionConfirmation,
  ChatAttachment,
  ChatResponseMetadata,
  FileDownload,
  ToolEvent,
  ToolEventStatus,
  ToolTraceJson,
} from "../../chat-artifact-events";

export type ToolTraceFilter = "all" | ToolEventStatus;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
  attachments?: ChatAttachment[];
  references?: AgentReference[];
  fileDownloads?: FileDownload[];
  charts?: RecruitmentAnalyticsChart[];
  cards?: RecruitmentResponseCard[];
  metadata?: ChatResponseMetadata;
  confirmations?: AgentActionConfirmation[];
  deliveryStatus?: "complete" | "stopped" | "error";
  retryPrompt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export type ChatView = "chat" | "history";

export const SUGGESTIONS = [
  "Review live recruitment data and tell me what needs attention",
  "Find lobb el ghalta in the pipeline and show charts",
  "Compare CV supply versus job demand and identify skill gaps",
  "Show the pipeline as a Mermaid diagram with bottlenecks",
  "Prioritize today's interviews, screenings, and notifications",
  "Recommend the next 3 hiring actions from live data",
];

export function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelativeTime(
  dateStr: string,
  locale: "en" | "fr" = "en",
): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffMin < 1) return formatter.format(0, "minute");
  if (diffMin < 60) return formatter.format(-diffMin, "minute");
  if (diffHr < 24) return formatter.format(-diffHr, "hour");
  if (diffDays < 7) return formatter.format(-diffDays, "day");
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
