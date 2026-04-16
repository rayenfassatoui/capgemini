/**
 * AI Service — Model Configuration & NVIDIA Build API Client
 *
 * Provides a centralized AI configuration with smart model routing.
 *
 * Models are organized by task type for optimal cost/quality balance.
 *
 * Uses NVIDIA Build API (https://integrate.api.nvidia.com/v1) with
 * OpenAI-compatible SDK for the stepfun-ai/step-3.5-flash model.
 */

import OpenAI from "openai";

export interface AiCallOptions {
  timeoutMs?: number;
  retryOnTimeout?: boolean;
}

// ---- Environment ----

export function ensureEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// ---- NVIDIA Build API Client ----

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

let nvidiaClient: OpenAI | null = null;

/**
 * Get or create the NVIDIA Build API client singleton.
 * Uses OpenAI SDK with NVIDIA's base URL.
 */
export function getNvidiaClient(): OpenAI {
  if (!nvidiaClient) {
    const apiKey = ensureEnv(process.env.NVIDIA_API_KEY, "NVIDIA_API_KEY");
    nvidiaClient = new OpenAI({
      apiKey,
      baseURL: NVIDIA_BASE_URL,
    });
  }
  return nvidiaClient;
}

// ---- Model Configuration ----

/**
 * Model tiers for different task types.
 * Each tier is optimized for cost/quality balance.
 *
 * To override globally, set AI_MODEL in .env — all tasks will use that model.
 *
 * Model format for NVIDIA Build: org/model-name (e.g., stepfun-ai/step-3.5-flash)
 */
export const AI_MODELS = {
  /** Primary agent model — best for tool calling, multi-step reasoning */
  agent: "stepfun-ai/step-3.5-flash",
  /** Structured output — JSON generation, data extraction, scoring */
  structured: "stepfun-ai/step-3.5-flash",
  /** Long-form generation — job descriptions, emails, analysis */
  generation: "stepfun-ai/step-3.5-flash",
} as const;

export type AITaskType = keyof typeof AI_MODELS;

/**
 * Returns the model string for a given task type.
 * If `AI_MODEL` env var is set, all tasks use that single model (useful for testing).
 */
export function getModelForTask(task: AITaskType): string {
  const override = process.env.AI_MODEL;
  if (override) return override;
  return AI_MODELS[task];
}

// ---- Response Parsing ----

export function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");

  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");

  if (objectStart === -1 && arrayStart === -1) {
    return cleaned;
  }

  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  const isObject = cleaned[start] === "{";
  const openChar = isObject ? "{" : "[";
  const closeChar = isObject ? "}" : "]";
  let depth = 0;
  let end = start;

  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === openChar) depth++;
    if (cleaned[i] === closeChar) depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  return cleaned.substring(start, end + 1);
}

export function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return JSON.stringify(part);
      })
      .join("");
  }
  return JSON.stringify(content);
}

// ---- NVIDIA Build API Client ----

/**
 * Call NVIDIA Build API with a system + user prompt.
 * Uses the model appropriate for the given task type.
 *
 * Note: Function name kept as 'callOpenRouter' for backward compatibility
 * with existing call sites. Actually calls NVIDIA Build API.
 *
 * @param systemPrompt - System instructions
 * @param userPrompt - User message
 * @param task - Task type for model selection (default: 'structured')
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  task: AITaskType = "structured",
  options: AiCallOptions = {},
): Promise<string> {
  const client = getNvidiaClient();
  const model = getModelForTask(task);
  const { timeoutMs, retryOnTimeout = false } = options;

  const createRequest = () =>
    client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

  const runWithTimeout = async (): Promise<
    ReturnType<typeof createRequest> extends Promise<infer T> ? T : never
  > => {
    if (!timeoutMs || timeoutMs <= 0) {
      return await createRequest();
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
    });

    return await Promise.race([createRequest(), timeoutPromise]);
  };

  let response: Awaited<ReturnType<typeof createRequest>>;

  try {
    response = await runWithTimeout();
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "TIMEOUT";
    if (!isTimeout || !retryOnTimeout) {
      throw error;
    }

    response = await runWithTimeout();
  }

  const message = response.choices?.[0]?.message;
  // Handle NVIDIA's potential reasoning_content field (chain-of-thought)
  // Prefer content, fall back to reasoning_content if present
  const raw =
    message?.content ??
    (message as { reasoning_content?: string })?.reasoning_content;
  if (!raw) throw new Error("Empty AI response");
  return normalizeContent(raw);
}
