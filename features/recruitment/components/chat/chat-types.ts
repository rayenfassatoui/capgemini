import type { AgentEvidenceMetadata } from "../../types";

export type ToolEventStatus = "queued" | "running" | "success" | "error";

export type ToolTraceFilter = "all" | ToolEventStatus;

export type ToolTraceJson =
  | null
  | boolean
  | number
  | string
  | ToolTraceJson[]
  | { [key: string]: ToolTraceJson };

export interface ToolRetryMetadata {
  attempt?: number;
  maxAttempts?: number;
  retried?: boolean;
  reason?: string;
}

export interface ToolEvent {
  id: string;
  tool: string;
  status: ToolEventStatus;
  summary?: string;
  purpose?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  input?: ToolTraceJson;
  output?: ToolTraceJson;
  error?: string;
  retry?: ToolRetryMetadata;
}

export interface GroundingGuardMetadata {
  blocked: boolean;
  deterministic: boolean;
  candidateCount: number;
  rejectedCount: number;
  sourceToolCount: number;
}

export interface ChatResponseMetadata {
  groundingGuard?: GroundingGuardMetadata;
  evidence?: AgentEvidenceMetadata;
}

export interface ChatAttachment {
  filename: string;
  size: number;
  contentType: string;
}

export interface FileDownload {
  filename: string;
  base64: string;
  contentType: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
  attachments?: ChatAttachment[];
  fileDownloads?: FileDownload[];
  metadata?: ChatResponseMetadata;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export type ChatView = "chat" | "history";

export const SUGGESTIONS = [
  "Summarize top candidate for the latest job",
  "Analyze our talent pool insights",
  "Optimize requirements for an open job",
  "Show me the candidate pipeline",
  "Match CVs to the latest job",
  "Generate follow-up interview questions",
];

export function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
