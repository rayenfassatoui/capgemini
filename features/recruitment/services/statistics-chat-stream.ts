import { STREAM_CHUNK_SIZE, type ToolTraceJson } from "./statistics-chat-types";

function emitJsonEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  prefix: string,
  payload: unknown,
) {
  controller.enqueue(encoder.encode(`${prefix}${JSON.stringify(payload)}\n`));
}

export async function streamText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string,
) {
  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    controller.enqueue(encoder.encode(text.slice(i, i + STREAM_CHUNK_SIZE)));
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

export async function streamImmediateText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  text: string,
) {
  controller.enqueue(encoder.encode(text));
}

export function emitMetaEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown,
) {
  emitJsonEvent(controller, encoder, "@@META@@", payload);
}

export function emitFileEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown,
) {
  emitJsonEvent(controller, encoder, "@@FILE@@", payload);
}

export function emitConfirmationEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown,
) {
  emitJsonEvent(controller, encoder, "@@CONFIRMATION@@", payload);
}

export function emitToolStartEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: {
    id: string;
    tool: string;
    status: string;
    args?: ToolTraceJson;
    input?: ToolTraceJson;
    startedAt: string;
    purpose?: string;
    summary?: string;
    retry: {
      attempt: number;
      maxAttempts: number;
      retried: boolean;
    };
  },
) {
  emitJsonEvent(controller, encoder, "@@TOOL_START@@", payload);
}

export function emitToolEndEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: {
    id: string;
    tool: string;
    success: boolean;
    status: string;
    summary: string;
    purpose?: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    input?: ToolTraceJson;
    output?: ToolTraceJson;
    error?: string;
    retry: {
      attempt: number;
      maxAttempts: number;
      retried: boolean;
    };
  },
) {
  emitJsonEvent(controller, encoder, "@@TOOL_END@@", payload);
}

export function takeFileDownloadPayload(data: unknown): {
  fileDownload?: unknown;
  data: unknown;
} {
  if (
    data &&
    typeof data === "object" &&
    "_fileDownload" in (data as Record<string, unknown>)
  ) {
    const record = data as Record<string, unknown>;
    const { _fileDownload, ...rest } = record;
    return {
      fileDownload: _fileDownload,
      data: rest,
    };
  }

  return { data };
}
