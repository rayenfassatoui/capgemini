/**
 * AI Service — Model Configuration & OpenRouter Client
 *
 * Provides a centralized AI configuration with smart model routing.
 * Models are organized by task type for optimal cost/quality balance.
 */

// ---- Environment ----

export function ensureEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// ---- Model Configuration ----

/**
 * Model tiers for different task types.
 * Each tier is optimized for cost/quality balance.
 *
 * To override globally, set AI_MODEL in .env — all tasks will use that model.
 */
export const AI_MODELS = {
  /** Primary agent model — best for tool calling, multi-step reasoning */
  agent: 'google/gemini-2.5-flash',
  /** Structured output — JSON generation, data extraction, scoring */
  structured: 'google/gemini-2.5-flash',
  /** Long-form generation — job descriptions, emails, analysis */
  generation: 'google/gemini-2.5-flash',
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
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  const objectStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');

  if (objectStart === -1 && arrayStart === -1) {
    return cleaned;
  }

  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  const isObject = cleaned[start] === '{';
  const openChar = isObject ? '{' : '[';
  const closeChar = isObject ? '}' : ']';
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
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text);
        }
        return JSON.stringify(part);
      })
      .join('');
  }
  return JSON.stringify(content);
}

// ---- OpenRouter Client ----

/**
 * Call OpenRouter with a system + user prompt.
 * Uses the model appropriate for the given task type.
 *
 * @param systemPrompt - System instructions
 * @param userPrompt - User message
 * @param task - Task type for model selection (default: 'structured')
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  task: AITaskType = 'structured'
): Promise<string> {
  const apiKey = ensureEnv(process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const model = getModelForTask(task);

  const { OpenRouter } = await import('@openrouter/sdk');
  const client = new OpenRouter({ apiKey });

  const response = await client.chat.send({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  });

  const raw = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty AI response');
  return normalizeContent(raw);
}
