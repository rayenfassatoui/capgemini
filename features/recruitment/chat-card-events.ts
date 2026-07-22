import type {
  RecruitmentResponseCard,
  RecruitmentResponseCardAction,
  RecruitmentResponseCardKind,
  RecruitmentResponseCardMetric,
  RecruitmentResponseCardTone,
} from './types';

export const CHAT_RESPONSE_CARD_EVENT_PREFIX = '@@CARD@@';

const VALID_CARD_KINDS = new Set<RecruitmentResponseCardKind>([
  'candidate',
  'job',
  'pipeline',
  'governance',
]);

const VALID_CARD_TONES = new Set<RecruitmentResponseCardTone>([
  'success',
  'warning',
  'danger',
  'neutral',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCardKind(value: unknown): value is RecruitmentResponseCardKind {
  return typeof value === 'string' && (VALID_CARD_KINDS as ReadonlySet<string>).has(value);
}
function isCardTone(value: unknown): value is RecruitmentResponseCardTone {
  return typeof value === 'string' && (VALID_CARD_TONES as ReadonlySet<string>).has(value);
}


function normalizeTone(value: unknown): RecruitmentResponseCardTone | undefined {
  return isCardTone(value) ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeMetric(value: unknown): RecruitmentResponseCardMetric | null {
  if (!isRecord(value)) return null;
  const label = readNonEmptyString(value.label);
  const metricValue = readNonEmptyString(value.value);
  if (!label || !metricValue) return null;

  const detail = readNonEmptyString(value.detail);
  const tone = normalizeTone(value.tone);

  return {
    label,
    value: metricValue,
    ...(detail ? { detail } : {}),
    ...(tone ? { tone } : {}),
  };
}

function normalizeAction(value: unknown): RecruitmentResponseCardAction | null {
  if (!isRecord(value)) return null;
  const label = readNonEmptyString(value.label);
  if (!label) return null;

  const href = readNonEmptyString(value.href);
  const prompt = readNonEmptyString(value.prompt);
  if (!href && !prompt) return null;

  const tone = normalizeTone(value.tone);

  return {
    label,
    ...(href ? { href } : {}),
    ...(prompt ? { prompt } : {}),
    ...(tone ? { tone } : {}),
  };
}

export function normalizeRecruitmentResponseCard(value: unknown): RecruitmentResponseCard | null {
  if (!isRecord(value)) return null;

  const id = readNonEmptyString(value.id);
  const title = readNonEmptyString(value.title);
  if (!id || !title || !isCardKind(value.kind)) return null;

  if (!Array.isArray(value.metrics)) return null;
  const metrics = value.metrics
    .map(normalizeMetric)
    .filter((metric): metric is RecruitmentResponseCardMetric => metric !== null)
    .slice(0, 6);
  if (metrics.length === 0) return null;

  const bullets = Array.isArray(value.bullets)
    ? value.bullets
        .map(readNonEmptyString)
        .filter((item): item is string => Boolean(item))
        .slice(0, 5)
    : [];

  const actions = Array.isArray(value.actions)
    ? value.actions
        .map(normalizeAction)
        .filter((action): action is RecruitmentResponseCardAction => action !== null)
        .slice(0, 3)
    : [];

  return {
    id,
    kind: value.kind,
    title,
    ...(readNonEmptyString(value.description)
      ? { description: readNonEmptyString(value.description) }
      : {}),
    ...(normalizeTone(value.tone) ? { tone: normalizeTone(value.tone) } : {}),
    ...(readNonEmptyString(value.sourceTool) ? { sourceTool: readNonEmptyString(value.sourceTool) } : {}),
    metrics,
    ...(bullets.length > 0 ? { bullets } : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };
}

export function parseChatResponseCardEvent(line: string): RecruitmentResponseCard | null {
  const payload = line.startsWith(CHAT_RESPONSE_CARD_EVENT_PREFIX)
    ? line.slice(CHAT_RESPONSE_CARD_EVENT_PREFIX.length)
    : line;

  try {
    return normalizeRecruitmentResponseCard(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function serializeChatResponseCardEvent(card: RecruitmentResponseCard): string {
  return `${CHAT_RESPONSE_CARD_EVENT_PREFIX}${JSON.stringify(card)}`;
}

function pushUniqueCard(
  cards: RecruitmentResponseCard[],
  card: RecruitmentResponseCard,
) {
  const index = cards.findIndex((item) => item.id === card.id);
  if (index === -1) {
    cards.push(card);
    return;
  }

  cards[index] = card;
}

export function appendChatResponseCardsToContent(
  content: string,
  cards: readonly RecruitmentResponseCard[],
): string {
  if (cards.length === 0) {
    return content;
  }

  const cardLines = cards.map(serializeChatResponseCardEvent);
  const trimmedContent = content.trimEnd();
  if (!trimmedContent) {
    return cardLines.join('\n');
  }

  return `${trimmedContent}\n${cardLines.join('\n')}`;
}

export function extractChatResponseCardsFromContent(content: string): {
  content: string;
  cards: RecruitmentResponseCard[];
} {
  const cards: RecruitmentResponseCard[] = [];
  const visibleLines: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(CHAT_RESPONSE_CARD_EVENT_PREFIX)) {
      const card = parseChatResponseCardEvent(line);
      if (card) {
        pushUniqueCard(cards, card);
      }
      continue;
    }

    visibleLines.push(line);
  }

  return {
    content: visibleLines.join('\n').trimEnd(),
    cards,
  };
}
