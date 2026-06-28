export interface GroundingToolRecord {
  toolName: string;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

export interface GroundedCandidate {
  name: string;
  cvId?: string;
  candidateId?: string;
  score?: number;
  skills: string[];
  languages: string[];
  experience?: string;
  evidence: string[];
  sourceTools: string[];
}

export interface AllowedCandidateSet {
  candidates: GroundedCandidate[];
  normalizedNames: Set<string>;
  punctuationInsensitiveNames: Set<string>;
  sourceTools: string[];
}

export interface CandidateNameValidationResult {
  ok: boolean;
  detectedNames: string[];
  rejectedNames: string[];
}

export interface GroundedAssistantResponse {
  text: string;
  blocked: boolean;
  deterministic: boolean;
  candidateCount: number;
  rejectedNames: string[];
  sourceTools: string[];
}

export interface GroundAssistantResponseOptions {
  userMessage: string;
  forceDeterministicRanking?: boolean;
}

const GROUNDED_CANDIDATE_TOOL_NAMES = new Set([
  "list_cv_pool",
  "search_cv_pool",
  "semantic_search_cvs",
  "rag_search_cvs",
  "match_cvs_to_job",
  "match_cvs_to_job_with_filters",
  "hybrid_search_cvs",
  "compare_candidates",
  "direct_named_search",
  "direct_compare_candidates",
]);

const PLACEHOLDER_NAMES = new Set([
  "candidate",
  "unknown",
  "unknown candidate",
  "unknown cv",
  "cv",
  "resume",
  "n/a",
  "na",
  "none",
  "null",
]);

const NON_PERSON_PHRASES = new Set([
  "ai service",
  "business unit",
  "candidate comparison",
  "candidate lists",
  "capgemini talentiq",
  "cv lists",
  "fallback mode",
  "key skills",
  "next steps",
  "no response",
  "project management",
  "resume based",
  "single candidate",
  "target role",
  "top candidates",
  "top matches",
  "top results",
]);

const BROAD_NAME_RE =
  /\b[A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Z]?[a-zÀ-ÖØ-öø-ÿ]+)?(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Z]?[a-zÀ-ÖØ-öø-ÿ]+)?){1,3}\b/g;

export function normalizeCandidateName(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeCandidateNameLoose(value: string): string {
  return normalizeCandidateName(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCandidateSearchOrRankingIntent(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const isSkillDemandComparison =
    /\b(compare|comparison|gap|demand|supply)\b.*\b(cv\s+pool|job\s+demand|skills?)\b/.test(
      normalized,
    ) ||
    /\b(cv\s+pool|job\s+demand|skills?)\b.*\b(compare|comparison|gap|demand|supply)\b/.test(
      normalized,
    );

  if (isSkillDemandComparison) {
    return false;
  }


  return (
    /\b(transferable\s+skills?|top\s+\d*\s*candidates?|best\s+fit|best\s+candidates?|rank(?:ing|ed)?|shortlist|recommend(?:ation|ed)?|compare|comparison)\b/.test(
      normalized,
    ) ||
    /\b(match(?:es|ed)?|find|search|show|list)\b.*\b(candidates?|cvs?|resumes?|profiles?)\b/.test(
      normalized,
    )
  );
}

export function isExplicitNamedSearchIntent(message: string): boolean {
  const normalized = String(message ?? "").toLowerCase();

  return (
    /\bname\s*(?:is|=)\s+["']?[^"'\n,]+["']?/.test(normalized) ||
    /\b(?:called|named)\s+["']?[^"'\n,]+["']?/.test(normalized) ||
    /\b(?:find|search|show|look\s+for)\b.*\b(?:candidate|cv|resume|profile)\b.*\b[A-Z][a-zÀ-ÖØ-öø-ÿ]+\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+/.test(
      String(message ?? ""),
    )
  );
}

export function buildAllowedCandidatesFromToolRecords(
  records: GroundingToolRecord[],
): AllowedCandidateSet {
  const byIdentity = new Map<string, GroundedCandidate>();
  const sourceTools = new Set<string>();

  for (const record of records) {
    if (
      !record.result.success ||
      !GROUNDED_CANDIDATE_TOOL_NAMES.has(record.toolName)
    ) {
      continue;
    }

    sourceTools.add(record.toolName);
    for (const candidate of extractCandidatesFromToolData(
      record.toolName,
      record.result.data,
    )) {
      mergeCandidate(byIdentity, candidate);
    }
  }

  const candidates = Array.from(byIdentity.values()).sort(
    (left, right) => (right.score ?? -1) - (left.score ?? -1),
  );
  const normalizedNames = new Set<string>();
  const punctuationInsensitiveNames = new Set<string>();

  for (const candidate of candidates) {
    normalizedNames.add(normalizeCandidateName(candidate.name));
    punctuationInsensitiveNames.add(
      normalizeCandidateNameLoose(candidate.name),
    );
  }

  return {
    candidates,
    normalizedNames,
    punctuationInsensitiveNames,
    sourceTools: Array.from(sourceTools),
  };
}

export function validateGroundedCandidateNames(
  text: string,
  allowedCandidates: AllowedCandidateSet,
  options: { broad?: boolean } = {},
): CandidateNameValidationResult {
  const detectedNames = extractCandidateLikeNames(text, options);
  const rejectedNames = detectedNames.filter(
    (name) => !isAllowedCandidateName(name, allowedCandidates),
  );

  return {
    ok: rejectedNames.length === 0,
    detectedNames,
    rejectedNames,
  };
}

export function groundAssistantResponse(
  rawText: string,
  records: GroundingToolRecord[],
  options: GroundAssistantResponseOptions,
): GroundedAssistantResponse {
  const allowedCandidates = buildAllowedCandidatesFromToolRecords(records);
  const isRankingFlow =
    Boolean(options.forceDeterministicRanking) ||
    isCandidateSearchOrRankingIntent(options.userMessage);
  const shouldUseBroadNameDetection =
    isRankingFlow ||
    allowedCandidates.candidates.length > 0 ||
    isExplicitNamedSearchIntent(options.userMessage);
  const needsCandidateGuard =
    isRankingFlow ||
    allowedCandidates.candidates.length > 0 ||
    isExplicitNamedSearchIntent(options.userMessage);

  if (!needsCandidateGuard) {
    return {
      text: rawText,
      blocked: false,
      deterministic: false,
      candidateCount: 0,
      rejectedNames: [],
      sourceTools: [],
    };
  }


  if (isRankingFlow) {
    const validation = validateGroundedCandidateNames(
      rawText,
      allowedCandidates,
      {
        broad: shouldUseBroadNameDetection,
      },
    );

    return {
      text: buildDeterministicGroundedCandidateResponse(
        allowedCandidates,
        options.userMessage,
      ),
      blocked: !validation.ok,
      deterministic: true,
      candidateCount: allowedCandidates.candidates.length,
      rejectedNames: validation.rejectedNames,
      sourceTools: allowedCandidates.sourceTools,
    };
  }

  const validation = validateGroundedCandidateNames(
    rawText,
    allowedCandidates,
    {
      broad: shouldUseBroadNameDetection,
    },
  );

  if (validation.ok) {
    return {
      text: rawText,
      blocked: false,
      deterministic: false,
      candidateCount: allowedCandidates.candidates.length,
      rejectedNames: [],
      sourceTools: allowedCandidates.sourceTools,
    };
  }

  return {
    text: buildDeterministicGroundedCandidateResponse(
      allowedCandidates,
      options.userMessage,
    ),
    blocked: true,
    deterministic: true,
    candidateCount: allowedCandidates.candidates.length,
    rejectedNames: validation.rejectedNames,
    sourceTools: allowedCandidates.sourceTools,
  };
}

export function buildDeterministicGroundedCandidateResponse(
  allowedCandidates: AllowedCandidateSet,
  userMessage: string,
): string {
  if (allowedCandidates.candidates.length === 0) {
    return [
      "I couldn’t find any accessible candidates in the current tool results for this request.",
      "",
      "No candidate names will be inferred from prior chat context or model assumptions.",
      "",
      "Try a safer next query such as:",
      "1. Search CVs for a specific skill, seniority, or language.",
      "2. List the accessible CV pool first.",
      "3. Run a narrower candidate search with explicit must-have criteria.",
    ].join("\n");
  }

  const rows = allowedCandidates.candidates.slice(0, 10);
  const isRanking = isCandidateSearchOrRankingIntent(userMessage) || rows.length > 1;
  const topCandidate = rows[0];
  const topSkills = safeList(topCandidate.skills, 5);
  const topLanguages = safeList(topCandidate.languages, 4);
  const topScore = normalizeScore(topCandidate.score);
  const scoreText = formatScore(topCandidate.score);
  const fitLabel =
    typeof topScore !== "number"
      ? "a profile that still needs validation"
      : topScore >= 75
        ? "a strong match"
        : topScore >= 60
          ? "a promising match"
          : topScore >= 45
            ? "a workable but not automatic match"
            : "an exploratory match";
  const recommendation =
    typeof topScore !== "number"
      ? "start with a structured screening because the score is missing"
      : topScore >= 75
        ? "shortlist them, then compare against the target job must-haves"
        : topScore >= 60
          ? "screen them against the job requirements before moving forward"
          : topScore >= 45
            ? "run a focused screening before shortlisting"
            : "keep them as a backup unless the target role matches their skills closely";

  const table = [
    "| Rank | Name | Score | Key Skills | Experience | Languages |",
    "|------|------|-------|------------|------------|-----------|",
    ...rows
      .map((candidate, index) => {
        const skills = safeList(candidate.skills, 5);
        const languages = safeList(candidate.languages, 4);
        return [
          String(index + 1),
          escapeMarkdownTableCell(candidate.name),
          formatScore(candidate.score),
          escapeMarkdownTableCell(skills || "Not provided"),
          escapeMarkdownTableCell(candidate.experience ?? "Not provided"),
          escapeMarkdownTableCell(languages || "Not provided"),
        ].join(" | ");
      })
      .map((row) => `| ${row} |`),
  ].join("\n");

  const evidenceLines = rows.slice(0, 3).map((candidate, index) => {
    const evidence = candidate.evidence.slice(0, 2).join(", ");
    return `${index + 1}. **${candidate.name}** — ${candidate.sourceTools.join(", ")}${evidence ? ` (${evidence})` : ""}.`;
  });

  const intro = isRanking
    ? `I found ${rows.length} grounded candidate profile${rows.length === 1 ? "" : "s"}. My first read puts **${topCandidate.name}** on top at **${scoreText}**.`
    : `**${topCandidate.name}** looks like **${fitLabel}** at **${scoreText}** based on the available recruitment evidence.`;

  return [
    isRanking ? "## Shortlist read" : "## Candidate read",
    intro,
    "",
    "### My take",
    `I would ${recommendation}.`,
    "",
    "### What stands out",
    `- **Skills**: ${topSkills || "No skills were parsed from the available CV data."}`,
    `- **Experience signal**: ${topCandidate.experience ?? "Not provided in the fetched data."}`,
    `- **Languages**: ${topLanguages || "Not provided in the fetched data."}`,
    "",
    "### Risks / missing info",
    `- ${typeof topScore === "number" && topScore < 60 ? `The score is **${scoreText}**, so I would not treat this as an automatic shortlist.` : "The score should still be checked against the exact job requirements."}`,
    "- Parsed CV data can miss context, so validate the must-have skills in screening.",
    "",
    "### Decision table",
    table,
    "",
    "### Evidence",
    ...evidenceLines,
  ].join("\n");
}

export function maskUserIdForTelemetry(userId: string): string {
  const raw = String(userId ?? "");
  if (raw.length <= 8) return "[masked]";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function extractCandidatesFromToolData(
  toolName: string,
  data: unknown,
): GroundedCandidate[] {
  if (!data) return [];

  if (toolName === "list_cv_pool" || toolName === "search_cv_pool") {
    return Array.isArray(data)
      ? data.flatMap((item) => candidateFromCvPoolItem(item, toolName))
      : [];
  }

  if (toolName === "semantic_search_cvs" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((item) => candidateFromSearchItem(item, toolName));
  }

  if (toolName === "rag_search_cvs" && isRecord(data)) {
    const candidates: GroundedCandidate[] = [];
    const citations = Array.isArray(data.citations) ? data.citations : [];
    const chunks = Array.isArray(data.chunks) ? data.chunks : [];

    for (const citation of citations) {
      candidates.push(...candidateFromRagCitation(citation, toolName));
    }

    for (const chunk of chunks) {
      candidates.push(...candidateFromSearchItem(chunk, toolName));
    }

    return candidates;
  }

  if (
    toolName === "match_cvs_to_job" ||
    toolName === "match_cvs_to_job_with_filters" ||
    toolName === "hybrid_search_cvs"
  ) {
    return Array.isArray(data)
      ? data.flatMap((item) => candidateFromSearchItem(item, toolName))
      : [];
  }

  if (toolName === "compare_candidates" && isRecord(data)) {
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    return candidates.flatMap((item) =>
      candidateFromComparisonItem(item, toolName),
    );
  }

  if (toolName === "direct_named_search" && isRecord(data)) {
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((result) => {
      if (!isRecord(result)) return [];
      const profileCandidates = candidateFromProfileItem(
        result.profile,
        toolName,
        readNumberField(result, ["combinedScore", "nameScore", "roleScore"]),
      );
      return profileCandidates;
    });
  }

  if (toolName === "direct_compare_candidates" && isRecord(data)) {
    const profiles = Array.isArray(data.comparedCandidates)
      ? data.comparedCandidates
      : [];
    return profiles.flatMap((profile) =>
      candidateFromProfileItem(profile, toolName),
    );
  }

  return [];
}

function candidateFromCvPoolItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "extractedName",
    "candidateName",
    "fullName",
  ]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score: readNumberField(value, ["score", "matchScore", "similarityScore"]),
      skills: readStringArrayField(value, [
        "extractedSkills",
        "candidateSkills",
        "matchedMustHave",
      ]),
      languages: readStringArrayField(value, [
        "extractedLanguages",
        "candidateLanguages",
      ]),
      experience: formatExperience(value),
      evidence: ["CV pool result"],
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromSearchItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "candidateName",
    "extractedName",
    "fullName",
    "name",
  ]);
  if (!isUsableCandidateName(name)) return [];

  const matchedSkills = [
    ...readStringArrayField(value, ["matchedMustHave", "matchedNiceToHave"]),
    ...readStringArrayField(value, ["extractedSkills", "candidateSkills"]),
  ];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score: readNumberField(value, [
        "matchScore",
        "similarityScore",
        "rrfScore",
        "score",
        "finalScore",
      ]),
      skills: uniqueStrings(matchedSkills),
      languages: readStringArrayField(value, [
        "extractedLanguages",
        "candidateLanguages",
        "languages",
      ]),
      experience: formatExperience(value),
      evidence: buildEvidence(value),
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromRagCitation(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, ["candidateName", "name"]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId"]),
      candidateId: readStringField(value, ["candidateId"]),
      skills: [],
      languages: [],
      experience: undefined,
      evidence: readStringArrayField(value, ["sections"]).map(
        (section) => `matched ${section}`,
      ),
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromComparisonItem(
  value: unknown,
  sourceTool: string,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, ["name", "candidateName", "fullName"]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId"]),
      candidateId: readStringField(value, ["candidateId", "id"]),
      score: readNumberField(value, ["overallFit", "score", "screeningScore"]),
      skills: [],
      languages: [],
      experience: undefined,
      evidence: ["comparison result"],
      sourceTools: [sourceTool],
    },
  ];
}

function candidateFromProfileItem(
  value: unknown,
  sourceTool: string,
  score?: number,
): GroundedCandidate[] {
  if (!isRecord(value)) return [];

  const name = readStringField(value, [
    "displayName",
    "candidateName",
    "fullName",
    "extractedName",
    "name",
  ]);
  if (!isUsableCandidateName(name)) return [];

  return [
    {
      name,
      cvId: readStringField(value, ["cvId", "id"]),
      candidateId: readStringField(value, ["candidateId"]),
      score,
      skills: readStringArrayField(value, ["skills", "extractedSkills"]),
      languages: readStringArrayField(value, [
        "languages",
        "extractedLanguages",
      ]),
      experience: formatExperience(value),
      evidence: ["deterministic search result"],
      sourceTools: [sourceTool],
    },
  ];
}

function mergeCandidate(
  byIdentity: Map<string, GroundedCandidate>,
  candidate: GroundedCandidate,
): void {
  const key = candidate.cvId
    ? `cv:${candidate.cvId}`
    : candidate.candidateId
      ? `candidate:${candidate.candidateId}`
      : `name:${normalizeCandidateName(candidate.name)}`;

  const existing = byIdentity.get(key);
  if (!existing) {
    byIdentity.set(key, {
      ...candidate,
      skills: uniqueStrings(candidate.skills),
      languages: uniqueStrings(candidate.languages),
      evidence: uniqueStrings(candidate.evidence),
      sourceTools: uniqueStrings(candidate.sourceTools),
    });
    return;
  }

  existing.score = Math.max(existing.score ?? -1, candidate.score ?? -1);
  if (existing.score < 0) existing.score = undefined;
  existing.skills = uniqueStrings([...existing.skills, ...candidate.skills]);
  existing.languages = uniqueStrings([
    ...existing.languages,
    ...candidate.languages,
  ]);
  existing.evidence = uniqueStrings([
    ...existing.evidence,
    ...candidate.evidence,
  ]);
  existing.sourceTools = uniqueStrings([
    ...existing.sourceTools,
    ...candidate.sourceTools,
  ]);
  existing.experience = existing.experience ?? candidate.experience;
}

function extractCandidateLikeNames(
  text: string,
  options: { broad?: boolean },
): string[] {
  const found = new Set<string>();

  for (const name of extractCandidateNamesFromMarkdownTables(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromHeadings(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromBoldText(text)) {
    addDetectedName(found, name);
  }

  for (const name of extractCandidateNamesFromPersonContexts(text)) {
    addDetectedName(found, name);
  }

  if (options.broad) {
    for (const match of text.matchAll(BROAD_NAME_RE)) {
      addDetectedName(found, match[0]);
    }
  }

  return Array.from(found);
}

function extractCandidateNamesFromMarkdownTables(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const names: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) continue;

    const headers = splitMarkdownTableRow(line).map((cell) =>
      normalizeCandidateNameLoose(cell),
    );
    const nameColumnIndex = headers.findIndex(
      (header) => header === "name" || header === "candidate",
    );

    if (nameColumnIndex === -1) continue;

    for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex++) {
      const row = lines[rowIndex];
      if (!row.trim().startsWith("|")) break;
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(row)) {
        continue;
      }

      const cells = splitMarkdownTableRow(row);
      const candidateCell = cells[nameColumnIndex];
      if (candidateCell) names.push(candidateCell);
    }
  }

  return names;
}

function extractCandidateNamesFromHeadings(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^#{2,5}\s+(.+)$/)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(cleanDetectedName)
    .filter((line) => BROAD_NAME_RE.test(resetRegex(line)));
}

function extractCandidateNamesFromBoldText(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const cleaned = cleanDetectedName(match[1]);
    if (looksLikePersonName(cleaned)) names.push(cleaned);
  }
  return names;
}

function extractCandidateNamesFromPersonContexts(text: string): string[] {
  const names: string[] = [];
  const contextPatterns = [
    /\b(?:candidate|profile|resume|cv)\s+(?:called|named)?\s*([A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+){1,3})\b/g,
    /\b([A-Z][a-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-zÀ-ÖØ-öø-ÿ]+){1,3})\s+(?:ranks|ranked|scores|scored|matches|appears|should|has)\b/g,
  ];

  for (const pattern of contextPatterns) {
    for (const match of text.matchAll(pattern)) {
      names.push(cleanDetectedName(match[1]));
    }
  }

  return names;
}

function addDetectedName(found: Set<string>, rawName: string): void {
  const cleaned = cleanDetectedName(rawName);
  if (!isUsableCandidateName(cleaned)) return;

  const normalized = normalizeCandidateName(cleaned);
  if (NON_PERSON_PHRASES.has(normalized)) return;

  found.add(cleaned);
}

function isAllowedCandidateName(
  name: string,
  allowedCandidates: AllowedCandidateSet,
): boolean {
  const normalized = normalizeCandidateName(name);
  const loose = normalizeCandidateNameLoose(name);

  return (
    allowedCandidates.normalizedNames.has(normalized) ||
    allowedCandidates.punctuationInsensitiveNames.has(loose)
  );
}

function isUsableCandidateName(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const normalized = normalizeCandidateName(value);
  if (!normalized || PLACEHOLDER_NAMES.has(normalized)) return false;

  return normalized.length >= 2;
}

function looksLikePersonName(value: string): boolean {
  const cleaned = cleanDetectedName(value);
  BROAD_NAME_RE.lastIndex = 0;
  return BROAD_NAME_RE.test(cleaned);
}

function cleanDetectedName(value: string): string {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/[`_[\]]/g, "")
    .replace(/\([^)]*\)/g, "")
    .split(/\s+[—–-]\s+|:|\|/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function resetRegex(value: string): string {
  BROAD_NAME_RE.lastIndex = 0;
  return value;
}

function buildEvidence(value: Record<string, unknown>): string[] {
  const evidence: string[] = [];

  const sectionType = readStringField(value, ["sectionType"]);
  if (sectionType) evidence.push(`matched ${sectionType}`);

  const matchedMustHave = readStringArrayField(value, ["matchedMustHave"]);
  if (matchedMustHave.length > 0) {
    evidence.push(`matched must-have: ${safeList(matchedMustHave, 3)}`);
  }

  const matchedNiceToHave = readStringArrayField(value, ["matchedNiceToHave"]);
  if (matchedNiceToHave.length > 0) {
    evidence.push(`matched nice-to-have: ${safeList(matchedNiceToHave, 3)}`);
  }

  return evidence.length > 0 ? evidence : ["tool result"];
}

function formatExperience(value: Record<string, unknown>): string | undefined {
  const explicitCount = readNumberField(value, [
    "experienceCount",
    "extractedExperiences",
    "extractedExperienceCount",
  ]);

  if (typeof explicitCount === "number") {
    return `${Math.round(explicitCount)} experience entr${Math.round(explicitCount) === 1 ? "y" : "ies"}`;
  }

  const experiences = value.experiences ?? value.extractedExperiences;
  if (Array.isArray(experiences)) {
    return `${experiences.length} experience entr${experiences.length === 1 ? "y" : "ies"}`;
  }

  return undefined;
}

function normalizeScore(score: number | undefined): number | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  return score > 0 && score <= 1 ? score * 100 : score;
}

function formatScore(score: number | undefined): string {
  const normalizedScore = normalizeScore(score);
  if (typeof normalizedScore !== "number") return "N/A";
  return `${Math.round(normalizedScore)}%`;
}

function safeList(values: string[], limit: number): string {
  return uniqueStrings(values).slice(0, limit).join(", ");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function readStringField(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const nestedValue = value[key];
    if (typeof nestedValue === "string" && nestedValue.trim()) {
      return nestedValue.trim();
    }
  }

  return undefined;
}

function readNumberField(
  value: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const nestedValue = value[key];

    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      return nestedValue;
    }

    if (Array.isArray(nestedValue)) {
      return nestedValue.length;
    }

    if (typeof nestedValue === "string" && nestedValue.trim()) {
      const parsed = Number(nestedValue);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

function readStringArrayField(
  value: Record<string, unknown>,
  keys: string[],
): string[] {
  const result: string[] = [];

  for (const key of keys) {
    const nestedValue = value[key];
    if (!Array.isArray(nestedValue)) continue;

    for (const item of nestedValue) {
      if (typeof item === "string" && item.trim()) {
        result.push(item.trim());
      }
    }
  }

  return uniqueStrings(result);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeCandidateNameLoose(value);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
