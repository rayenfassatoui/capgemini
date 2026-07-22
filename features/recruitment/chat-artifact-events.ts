import * as z from "zod/v3";

import type {
  AgentEvidenceMetadata,
  RecruitmentAnalyticsChart,
  RecruitmentResponseCard,
} from "./types";

export const CHAT_ARTIFACT_EVENT_PREFIX = "@@ARTIFACTS@@";

export type ToolEventStatus =
  | "queued"
  | "running"
  | "pending_confirmation"
  | "success"
  | "error";

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
  charts?: RecruitmentAnalyticsChart[];
  cards?: RecruitmentResponseCard[];
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

export interface AgentActionConfirmation {
  id: string;
  toolName: string;
  summary: string;
  args: ToolTraceJson;
  expiresAt: string;
  status: "pending" | "confirmed" | "cancelled";
}

export interface PersistedAgentReference {
  type: "cv";
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  facts?: Array<{ label: string; value: string }>;
}

export interface PersistedChatArtifacts {
  toolEvents?: ToolEvent[];
  attachments?: ChatAttachment[];
  references?: PersistedAgentReference[];
  fileDownloads?: FileDownload[];
  metadata?: ChatResponseMetadata;
  confirmations?: AgentActionConfirmation[];
}

const toolTraceJsonSchema: z.ZodType<ToolTraceJson> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(toolTraceJsonSchema),
    z.record(z.string(), toolTraceJsonSchema),
  ]),
);

const toolRetryMetadataSchema = z.object({
  attempt: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  retried: z.boolean().optional(),
  reason: z.string().optional(),
});

const toolEventSchema: z.ZodType<ToolEvent> = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  status: z.enum([
    "queued",
    "running",
    "pending_confirmation",
    "success",
    "error",
  ]),
  summary: z.string().optional(),
  purpose: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  input: toolTraceJsonSchema.optional(),
  output: toolTraceJsonSchema.optional(),
  error: z.string().optional(),
  retry: toolRetryMetadataSchema.optional(),
});

const attachmentSchema: z.ZodType<ChatAttachment> = z.object({
  filename: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
});

const fileDownloadSchema: z.ZodType<FileDownload> = z.object({
  filename: z.string().min(1),
  base64: z.string(),
  contentType: z.string().min(1),
});

export function normalizeFileDownload(
  value: unknown,
): FileDownload | undefined {
  const parsed = fileDownloadSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const confirmationSchema: z.ZodType<AgentActionConfirmation> = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  summary: z.string().min(1),
  args: toolTraceJsonSchema,
  expiresAt: z.string().min(1),
  status: z.enum(["pending", "confirmed", "cancelled"]),
});

const referenceSchema: z.ZodType<PersistedAgentReference> = z.object({
  type: z.literal("cv"),
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  href: z.string().optional(),
  facts: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .optional(),
});

const sourceLinkSchema = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
});

const evidenceSchema: z.ZodType<AgentEvidenceMetadata> = z.object({
  sources: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      kind: z.enum([
        "analytics",
        "candidate",
        "cv",
        "email",
        "interview",
        "job",
        "onboarding",
        "operation",
        "search",
        "system",
        "tool",
      ]),
      tool: z.string().min(1),
      status: z.enum(["success", "error"]),
      detail: z.string().optional(),
      count: z.number().finite().optional(),
      link: sourceLinkSchema.optional(),
    }),
  ),
  evidenceBlocks: z.array(
    z.object({
      id: z.string().min(1),
      sourceId: z.string().min(1),
      title: z.string().min(1),
      items: z.array(
        z.object({
          id: z.string().optional(),
          text: z.string(),
          link: sourceLinkSchema.optional(),
        }),
      ),
    }),
  ),
  observedFacts: z.array(z.string()),
  inferenceLimits: z.array(z.string()),
});

const metadataSchema: z.ZodType<ChatResponseMetadata> = z.object({
  groundingGuard: z
    .object({
      blocked: z.boolean(),
      deterministic: z.boolean(),
      candidateCount: z.number().int().nonnegative(),
      rejectedCount: z.number().int().nonnegative(),
      sourceToolCount: z.number().int().nonnegative(),
    })
    .optional(),
  evidence: evidenceSchema.optional(),
  charts: z.array(z.unknown()).optional() as z.ZodType<RecruitmentAnalyticsChart[] | undefined>,
  cards: z.array(z.unknown()).optional() as z.ZodType<RecruitmentResponseCard[] | undefined>,
});

const persistedChatArtifactsSchema: z.ZodType<PersistedChatArtifacts> = z.object({
  toolEvents: z.array(toolEventSchema).optional(),
  attachments: z.array(attachmentSchema).optional(),
  references: z.array(referenceSchema).optional(),
  fileDownloads: z.array(fileDownloadSchema).optional(),
  metadata: metadataSchema.optional(),
  confirmations: z.array(confirmationSchema).optional(),
});

export const chatHistoryResponseSchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(
    z.object({
      id: z.string().min(1),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdAt: z.string().or(z.date()).optional(),
    }),
  ),
  agentActions: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum([
          "pending",
          "confirmed",
          "cancelled",
          "expired",
          "executed",
          "failed",
        ]),
      }),
    )
    .optional(),
});

function hasArtifacts(artifacts: PersistedChatArtifacts): boolean {
  return Boolean(
    artifacts.toolEvents?.length ||
      artifacts.attachments?.length ||
      artifacts.references?.length ||
      artifacts.fileDownloads?.length ||
      artifacts.metadata ||
      artifacts.confirmations?.length,
  );
}

function mergeArtifactArrays<T>(
  existing: readonly T[] | undefined,
  incoming: readonly T[] | undefined,
): T[] | undefined {
  const merged = [...(existing ?? []), ...(incoming ?? [])];
  return merged.length > 0 ? merged : undefined;
}

export function appendChatArtifactsToContent(
  content: string,
  artifacts: PersistedChatArtifacts,
): string {
  const extracted = extractChatArtifactsFromContent(content);
  const merged: PersistedChatArtifacts = {
    toolEvents: mergeArtifactArrays(
      extracted.artifacts.toolEvents,
      artifacts.toolEvents,
    ),
    attachments: mergeArtifactArrays(
      extracted.artifacts.attachments,
      artifacts.attachments,
    ),
    references: mergeArtifactArrays(
      extracted.artifacts.references,
      artifacts.references,
    ),
    fileDownloads: mergeArtifactArrays(
      extracted.artifacts.fileDownloads,
      artifacts.fileDownloads,
    ),
    confirmations: mergeArtifactArrays(
      extracted.artifacts.confirmations,
      artifacts.confirmations,
    ),
    metadata:
      extracted.artifacts.metadata || artifacts.metadata
        ? {
            ...extracted.artifacts.metadata,
            ...artifacts.metadata,
          }
        : undefined,
  };
  if (!hasArtifacts(merged)) return extracted.content;

  return `${extracted.content}\n${CHAT_ARTIFACT_EVENT_PREFIX}${JSON.stringify(merged)}`;
}

export function extractChatArtifactsFromContent(content: string): {
  content: string;
  artifacts: PersistedChatArtifacts;
} {
  const artifacts: PersistedChatArtifacts = {};
  const visibleLines: string[] = [];

  for (const line of content.split("\n")) {
    if (!line.startsWith(CHAT_ARTIFACT_EVENT_PREFIX)) {
      visibleLines.push(line);
      continue;
    }

    try {
      const parsed = persistedChatArtifactsSchema.safeParse(
        JSON.parse(line.slice(CHAT_ARTIFACT_EVENT_PREFIX.length)),
      );
      if (!parsed.success) continue;

      if (parsed.data.toolEvents?.length) {
        artifacts.toolEvents = [
          ...(artifacts.toolEvents ?? []),
          ...parsed.data.toolEvents,
        ];
      }
      if (parsed.data.attachments?.length) {
        artifacts.attachments = [
          ...(artifacts.attachments ?? []),
          ...parsed.data.attachments,
        ];
      }
      if (parsed.data.references?.length) {
        artifacts.references = [
          ...(artifacts.references ?? []),
          ...parsed.data.references,
        ];
      }
      if (parsed.data.fileDownloads?.length) {
        artifacts.fileDownloads = [
          ...(artifacts.fileDownloads ?? []),
          ...parsed.data.fileDownloads,
        ];
      }
      if (parsed.data.confirmations?.length) {
        artifacts.confirmations = [
          ...(artifacts.confirmations ?? []),
          ...parsed.data.confirmations,
        ];
      }
      if (parsed.data.metadata) {
        artifacts.metadata = {
          ...artifacts.metadata,
          ...parsed.data.metadata,
        };
      }
    } catch {
      // Malformed legacy metadata is omitted without hiding the visible message.
    }
  }

  return {
    content: visibleLines.join("\n").trimEnd(),
    artifacts,
  };
}
