export interface LookupKeys {
  original: string;
  normalized: string;
  arabicNormalized: string;
  transliterated: string;
  phonetic: string;
  consonants: string;
  tokens: string[];
}

export interface RankedMatch<T> {
  item: T;
  score: number;
  reason: string;
  alias: string;
}

const DIACRITICS_RE = /[\u0300-\u036f]/g;
const ARABIC_TASHKEEL_RE = /[\u064B-\u065F\u0670]/g;
const ARABIC_TATWEEL_RE = /\u0640/g;
const NON_ALNUM_SPACE_RE = /[^\p{L}\p{N}\s]+/gu;
const MULTISPACE_RE = /\s+/g;
const VOWELS_RE = /[aeiouy]/g;

const PHONETIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/sch/g, 'sh'],
  [/ch/g, 'sh'],
  [/che/g, 'she'],
  [/ou/g, 'u'],
  [/oo/g, 'u'],
  [/ph/g, 'f'],
  [/ck/g, 'k'],
  [/kh/g, 'h'],
  [/gh/g, 'g'],
  [/dj/g, 'j'],
  [/tz/g, 'z'],
  [/q/g, 'k'],
  [/c(?=[eiy])/g, 's'],
  [/c/g, 'k'],
  [/x/g, 'ks'],
  [/w/g, 'v'],
  [/aa+/g, 'a'],
  [/ee+/g, 'i'],
  [/ii+/g, 'i'],
  [/oo+/g, 'u'],
  [/uu+/g, 'u'],
  [/ah/g, 'a'],
  [/eh/g, 'e'],
];

const LATIN_CHAR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ß/g, 'ss'],
];

const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'a',
  ٱ: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'a',
  و: 'w',
  ي: 'y',
  ى: 'a',
  ئ: 'y',
  ؤ: 'w',
  ء: '',
};

function collapseWhitespace(value: string): string {
  return value.replace(MULTISPACE_RE, ' ').trim();
}

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(DIACRITICS_RE, '');
}

function normalizeArabicScript(value: string): string {
  return value
    .replace(ARABIC_TASHKEEL_RE, '')
    .replace(ARABIC_TATWEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
}

function transliterateArabicToLatin(value: string): string {
  let output = '';
  for (const char of value) {
    output += ARABIC_TO_LATIN_MAP[char] ?? char;
  }
  return output;
}

function applyLatinReplacements(value: string): string {
  let result = value;
  for (const [pattern, replacement] of LATIN_CHAR_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function cleanupLookupText(value: string): string {
  return collapseWhitespace(
    applyLatinReplacements(stripDiacritics(value).toLowerCase())
      .replace(/[_./\\-]+/g, ' ')
      .replace(NON_ALNUM_SPACE_RE, ' ')
  );
}

export function normalizeLookupText(input: string): string {
  return cleanupLookupText(normalizeArabicScript(input));
}

export function transliterateArabicToLatinApprox(input: string): string {
  return cleanupLookupText(transliterateArabicToLatin(normalizeArabicScript(input)));
}

export function buildPhoneticNameKey(input: string): string {
  let result = transliterateArabicToLatinApprox(input) || normalizeLookupText(input);

  for (const [pattern, replacement] of PHONETIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result
    .replace(/([a-z])\1+/g, '$1')
    .replace(/(?:^|\s)(el|al|ben|ibn|bin|bint|abd|abdel|abdelkader|abu|abou)(?=\s|$)/g, ' ')
    .replace(/[aeiou]+/g, (match) => (match.length > 0 ? match[0] : ''))
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

export function buildConsonantSkeleton(input: string): string {
  const source = buildPhoneticNameKey(input).replace(VOWELS_RE, '');
  return source.replace(/([a-z])\1+/g, '$1');
}

export function tokenizeLookupText(input: string): string[] {
  return normalizeLookupText(input)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildLookupKeys(input: string): LookupKeys {
  const original = String(input ?? '').trim();
  const arabicNormalized = normalizeArabicScript(original);
  const normalized = normalizeLookupText(original);
  const transliterated = transliterateArabicToLatinApprox(arabicNormalized);
  const phonetic = buildPhoneticNameKey(original);
  const consonants = buildConsonantSkeleton(original);
  const tokens = tokenizeLookupText(original);

  return {
    original,
    normalized,
    arabicNormalized,
    transliterated,
    phonetic,
    consonants,
    tokens,
  };
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[a.length][b.length];
}

export function normalizedSimilarity(a: string, b: string): number {
  const left = normalizeLookupText(a);
  const right = normalizeLookupText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const distance = levenshteinDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export function tokenOverlapScore(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  let overlap = 0;

  for (const token of left) {
    if (right.has(token)) {
      overlap++;
      continue;
    }

    for (const candidate of right) {
      if (
        token === candidate ||
        token.includes(candidate) ||
        candidate.includes(token) ||
        normalizedSimilarity(token, candidate) >= 0.84
      ) {
        overlap++;
        break;
      }
    }
  }

  return overlap / Math.max(left.size, right.size);
}

export function scoreLookupMatch(query: LookupKeys, candidate: LookupKeys): {
  score: number;
  reason: string;
} {
  if (!query.normalized || !candidate.normalized) {
    return { score: 0, reason: 'empty value' };
  }

  if (query.normalized === candidate.normalized) {
    return { score: 1, reason: 'exact normalized match' };
  }

  if (
    query.phonetic &&
    candidate.phonetic &&
    query.phonetic === candidate.phonetic
  ) {
    return { score: 0.97, reason: 'exact phonetic match' };
  }

  if (
    query.consonants &&
    candidate.consonants &&
    query.consonants === candidate.consonants
  ) {
    return { score: 0.95, reason: 'exact consonant skeleton match' };
  }

  const normalizedScore = normalizedSimilarity(query.normalized, candidate.normalized);
  const phoneticScore =
    query.phonetic && candidate.phonetic
      ? normalizedSimilarity(query.phonetic, candidate.phonetic)
      : 0;
  const consonantScore =
    query.consonants && candidate.consonants
      ? normalizedSimilarity(query.consonants, candidate.consonants)
      : 0;
  const transliterationScore =
    query.transliterated && candidate.transliterated
      ? normalizedSimilarity(query.transliterated, candidate.transliterated)
      : 0;
  const tokenScore = tokenOverlapScore(query.tokens, candidate.tokens);

  let containmentBonus = 0;
  if (
    candidate.normalized.includes(query.normalized) ||
    query.normalized.includes(candidate.normalized)
  ) {
    containmentBonus = 0.05;
  }

  const score = Math.min(
    1,
    normalizedScore * 0.42 +
      phoneticScore * 0.23 +
      consonantScore * 0.18 +
      transliterationScore * 0.07 +
      tokenScore * 0.10 +
      containmentBonus
  );

  let reason = 'fuzzy match';
  if (phoneticScore >= 0.94) {
    reason = 'very close phonetic match';
  } else if (consonantScore >= 0.94) {
    reason = 'very close consonant match';
  } else if (normalizedScore >= 0.9) {
    reason = 'very close normalized spelling';
  } else if (tokenScore >= 0.8) {
    reason = 'strong token overlap';
  } else if (transliterationScore >= 0.88) {
    reason = 'close transliteration match';
  }

  return {
    score,
    reason,
  };
}

export function rankLookupMatches<T>(
  query: string,
  items: T[],
  getAliases: (item: T) => string[],
  options?: {
    limit?: number;
    minScore?: number;
  }
): RankedMatch<T>[] {
  const { limit = 5, minScore = 0.65 } = options ?? {};
  const queryKeys = buildLookupKeys(query);

  if (!queryKeys.normalized) return [];

  const ranked: RankedMatch<T>[] = [];

  for (const item of items) {
    const aliases = getAliases(item)
      .map((alias) => String(alias ?? '').trim())
      .filter(Boolean);

    let best: RankedMatch<T> | null = null;

    for (const alias of aliases) {
      const candidateKeys = buildLookupKeys(alias);
      const { score, reason } = scoreLookupMatch(queryKeys, candidateKeys);

      if (!best || score > best.score) {
        best = {
          item,
          score,
          reason,
          alias,
        };
      }
    }

    if (best && best.score >= minScore) {
      ranked.push(best);
    }
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.alias.localeCompare(b.alias))
    .slice(0, limit);
}

export function findBestLookupMatch<T>(
  query: string,
  items: T[],
  getAliases: (item: T) => string[],
  options?: {
    autoResolveScore?: number;
    ambiguityGap?: number;
    minSuggestionScore?: number;
    suggestionLimit?: number;
  }
): {
  match: RankedMatch<T> | null;
  suggestions: RankedMatch<T>[];
  ambiguous: boolean;
} {
  const {
    autoResolveScore = 0.93,
    ambiguityGap = 0.05,
    minSuggestionScore = 0.65,
    suggestionLimit = 5,
  } = options ?? {};

  const ranked = rankLookupMatches(query, items, getAliases, {
    limit: suggestionLimit,
    minScore: minSuggestionScore,
  });

  if (ranked.length === 0) {
    return { match: null, suggestions: [], ambiguous: false };
  }

  const [first, second] = ranked;
  const gap = second ? first.score - second.score : first.score;

  if (first.score >= autoResolveScore && gap >= ambiguityGap) {
    return {
      match: first,
      suggestions: ranked,
      ambiguous: false,
    };
  }

  return {
    match: null,
    suggestions: ranked,
    ambiguous: ranked.length > 1,
  };
}
