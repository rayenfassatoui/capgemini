export function ensureEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

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

export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = ensureEnv(process.env.OPENROUTER_KEY, 'OPENROUTER_KEY');

  const { OpenRouter } = await import('@openrouter/sdk');
  const client = new OpenRouter({ apiKey });

  const response = await client.chat.send({
    model: 'stepfun/step-3.5-flash:free',
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
