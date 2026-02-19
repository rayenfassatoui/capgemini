export interface ToolEvent {
  id: string;
  tool: string;
  status: 'running' | 'success' | 'error';
  summary?: string;
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
  role: 'user' | 'assistant';
  content: string;
  toolEvents?: ToolEvent[];
  attachments?: ChatAttachment[];
  fileDownloads?: FileDownload[];
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export type ChatView = 'chat' | 'history';

export const SUGGESTIONS = [
  'List all open jobs',
  'Show me the candidate pipeline',
  'Match CVs to the latest job',
  'Create a Senior React Developer job',
];

export function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
