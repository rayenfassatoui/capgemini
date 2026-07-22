const MAX_JOB_SKILL_LABEL_LENGTH = 48;
const MAX_JOB_SKILL_WORDS = 5;

const KNOWN_SKILL_PATTERNS: ReadonlyArray<{
  label: string;
  patterns: readonly RegExp[];
}> = [
  { label: 'UI/UX design', patterns: [/\bui\s*\/\s*ux\b/i, /\bux\s+design\b/i] },
  { label: 'Product design', patterns: [/\bproduct\s+design\b/i] },
  { label: 'User research', patterns: [/\buser\s+research\b/i, /\bux\s+research\b/i] },
  { label: 'Information architecture', patterns: [/\binformation\s+architecture\b/i] },
  { label: 'Interaction design', patterns: [/\binteraction\s+design\b/i] },
  { label: 'Prototyping', patterns: [/\bprototype|prototyping\b/i] },
  { label: 'Usability testing', patterns: [/\busability\s+test/i] },
  { label: 'Accessibility', patterns: [/\baccessibility\b/i, /\binclusive\s+design\b/i] },
  { label: 'WCAG', patterns: [/\bwcag\b/i] },
  { label: 'Figma', patterns: [/\bfigma\b/i] },
  { label: 'Sketch', patterns: [/\bsketch\b/i] },
  { label: 'Adobe XD', patterns: [/\badobe\s*(xd)?\b/i] },
  { label: 'Design systems', patterns: [/\bdesign\s+systems?\b/i] },
  { label: 'HTML', patterns: [/\bhtml\b/i] },
  { label: 'CSS', patterns: [/\bcss\b/i] },
  { label: 'JavaScript', patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i, /\bts\b/i] },
  { label: 'React', patterns: [/\breact\b/i] },
  { label: 'Next.js', patterns: [/\bnext\.?js\b/i] },
  { label: 'Node.js', patterns: [/\bnode\.?js\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i] },
  { label: 'SQL', patterns: [/\bsql\b/i] },
  { label: 'PostgreSQL', patterns: [/\bpostgres(?:ql)?\b/i] },
  { label: 'QA testing', patterns: [/\bqa\b/i, /\bquality\s+assurance\b/i, /\btesting\s+methodolog/i] },
  { label: 'Selenium', patterns: [/\bselenium\b/i] },
  { label: 'Cypress', patterns: [/\bcypress\b/i] },
  { label: 'Jest', patterns: [/\bjest\b/i] },
  { label: 'Vitest', patterns: [/\bvitest\b/i] },
  { label: 'AI/ML', patterns: [/\bai\s*\/\s*ml\b/i, /\bmachine\s+learning\b/i] },
  { label: 'Agentic systems', patterns: [/\bagentic\s+systems?\b/i, /\bautonomous\s+agents?\b/i] },
  { label: 'Conversational AI', patterns: [/\bconversational\s+ai\b/i] },
  { label: 'Prompt engineering', patterns: [/\bprompt\s+engineering\b/i] },
  { label: 'RAG', patterns: [/\brag\b/i, /\bretrieval\s+augmented\s+generation\b/i] },
  { label: 'Agile', patterns: [/\bagile\b/i] },
  { label: 'Scrum', patterns: [/\bscrum\b/i] },
  { label: 'Communication', patterns: [/\bcommunication\b/i] },
  { label: 'Collaboration', patterns: [/\bcollaboration\b/i, /\bcross-functional\b/i] },
  { label: 'Stakeholder management', patterns: [/\bstakeholder\s+management\b/i] },
  { label: 'Analytics', patterns: [/\banalytics\b/i] },
  { label: 'Google Analytics', patterns: [/\bgoogle\s+analytics\b/i] },
  { label: 'Hotjar', patterns: [/\bhotjar\b/i] },
  { label: 'Human-computer interaction', patterns: [/\bhuman-computer\s+interaction\b/i, /\bhci\b/i] },
  { label: 'Domain experience', patterns: [/\bindustr(?:y|ies)\b/i, /\bfinance\b|\bhealthcare\b|\bretail\b|\bautomotive\b/i] },
];

const LEADING_PHRASES: readonly RegExp[] = [
  /^(?:(?:at\s+least\s+)?\d+\+?\s+years?(?:['’]|\s+of)?\s+)?(?:(?:proven|demonstrated|extensive|relevant|practical|professional|strong|solid|hands[-\s]on)\s+)*experience\s+(?:working\s+)?(?:with|in|on|using)\s+/i,
  /^proficiency\s+(?:in|with)\s+/i,
  /^solid\s+understanding\s+of\s+/i,
  /^strong\s+understanding\s+of\s+/i,
  /^knowledge\s+of\s+/i,
  /^basic\s+knowledge\s+of\s+/i,
  /^ability\s+to\s+/i,
  /^excellent\s+/i,
  /^strong\s+/i,
  /^familiarity\s+with\s+/i,
  /^certification\s+in\s+/i,
  /^master'?s\s+degree\s+in\s+/i,
  /^bachelor'?s\s+degree\s+in\s+/i,
];

const CLAUSE_BOUNDARY_RE =
  /\b(?:with|showcasing|covering|using|for|from|before|after|that|who|and\s+hands-on|hands-on)\b/i;

function cleanSkillText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/^[\s*•\-–—:]+/, '')
    .replace(/[.!?]+$/g, '')
    .replace(/[^\p{L}\p{N}+#./&'\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, '');
}

function pushUnique(target: string[], label: string): void {
  const cleaned = cleanSkillText(label);
  if (!cleaned) return;

  const key = canonicalKey(cleaned);
  if (!key || target.some((item) => canonicalKey(item) === key)) return;

  target.push(cleaned);
}

function collectKnownSkillLabels(value: string): string[] {
  const labels: string[] = [];

  for (const entry of KNOWN_SKILL_PATTERNS) {
    if (
      entry.label === 'Interaction design' &&
      /\bhuman-computer\s+interaction\b/i.test(value)
    ) {
      continue;
    }
    if (entry.patterns.some((pattern) => pattern.test(value))) {
      pushUnique(labels, entry.label);
    }
  }

  return labels;
}

function splitExampleList(value: string): string[] {
  const markerMatch = value.match(/\b(?:such as|like|including|e\.g\.?|for example)\b\s*(.+)$/i);
  const source = markerMatch?.[1] ?? value;

  return source
    .replace(/\bor\b/gi, ',')
    .replace(/\band\b/gi, ',')
    .split(/[,;/]/)
    .map(cleanSkillText)
    .filter(Boolean);
}

function toDisplayLabel(value: string): string {
  const cleaned = cleanSkillText(value);
  if (!cleaned) return '';

  const known = collectKnownSkillLabels(cleaned);
  if (known.length > 0) return known[0] ?? '';

  const words = cleaned.split(/\s+/).slice(0, MAX_JOB_SKILL_WORDS);
  const label = words.join(' ');
  if (/\p{Lu}/u.test(label)) return label;

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fallbackLabel(value: string): string {
  let cleaned = cleanSkillText(value);

  for (const phrase of LEADING_PHRASES) {
    cleaned = cleaned.replace(phrase, '');
  }

  const boundary = cleaned.search(CLAUSE_BOUNDARY_RE);
  if (boundary > 0) {
    cleaned = cleaned.slice(0, boundary);
  }

  return toDisplayLabel(cleaned);
}

function labelsFromRawSkill(value: string): string[] {
  const cleaned = cleanSkillText(value);
  if (!cleaned) return [];

  const known = collectKnownSkillLabels(cleaned);
  if (known.length > 0) return known;

  const examples = splitExampleList(cleaned)
    .map(toDisplayLabel)
    .filter(Boolean);
  if (examples.length > 1) return examples;

  const fallback = fallbackLabel(cleaned);
  return fallback ? [fallback] : [];
}

export function normalizeJobSkillLabels(
  values: readonly string[],
  maxItems = 20,
): string[] {
  const labels: string[] = [];

  for (const value of values) {
    for (const label of labelsFromRawSkill(value)) {
      if (labels.length >= maxItems) return labels;
      pushUnique(labels, label.slice(0, MAX_JOB_SKILL_LABEL_LENGTH));
    }
  }

  return labels;
}

export function isAtomicJobSkillLabel(value: string): boolean {
  const cleaned = cleanSkillText(value);
  if (!cleaned || cleaned.length > MAX_JOB_SKILL_LABEL_LENGTH) return false;
  if (/[.!?]/.test(cleaned)) return false;
  if (/\b(?:experience\s+working|ability\s+to|proficiency\s+in|solid\s+understanding|hands-on\s+experience)\b/i.test(cleaned)) {
    return false;
  }

  return cleaned.split(/\s+/).length <= MAX_JOB_SKILL_WORDS;
}
