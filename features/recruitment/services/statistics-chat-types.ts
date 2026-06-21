import type { UserRole } from "@/features/recruitment/types";

export const MAX_AGENT_STEPS = 8;
export const MAX_OUTPUT_TOKENS = 2048;
export const LLM_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
export const STREAM_CHUNK_SIZE = 12;

export type AttachmentPayload = {
  filename: string;
  contentType: string;
  size: number;
  rawBytes: string;
};

export type LLMMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolExecutionRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: { success: boolean; data?: unknown; error?: string };
  mutating: boolean;
}

export type ToolTraceJson =
  | null
  | boolean
  | number
  | string
  | ToolTraceJson[]
  | { [key: string]: ToolTraceJson };

export interface AgenticResponseParams {
  text: string;
  userMessage: string;
  role: UserRole;
  records: ToolExecutionRecord[];
}

export type AgentCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ResponseToolCall[];
    };
  }>;
};

export type ResponseToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export interface StatisticsChatSession {
  user: {
    id: string;
    role?: string | null;
  };
}
