import type { CandidateStage, UserRole } from "../types";
import { compareCandidates } from "./ai-features";
import { getCandidatesByStage } from "./candidates";
import { listCvPool } from "./cv-pool";
import { getJob } from "./jobs";
import {
  buildLookupKeys,
  findBestLookupMatch,
  normalizeLookupText,
  normalizedSimilarity,
  rankLookupMatches,
  tokenizeLookupText,
} from "./name-matching";

const ALL_CANDIDATE_STAGES: CandidateStage[] = [
  "new",
  "ta_screening",
  "ta_interview",
  "ta_accepted",
  "ta_rejected",
  "manager_interview",
  "manager_accepted",
  "manager_rejected",
  "hr_interview",
  "hr_accepted",
  "hr_rejected",
  "hired",
];

const GREETING_RE =
  /^(?:hi|hello|hey|yo|salam|slm|salam alaikom|salam alaykom|aslema|ahla|bonjour|bonsoir|good morning|good afternoon|good evening|thanks|thank you|thx)[!.?,\s]*$/i;

const COMPARE_HINT_RE =
  /\b(compare|versus|vs\.?|who is better|better|best|khir|خير|wela|ولا|7aseb el resume|حسب السيرة|حسب الresume)\b/i;

const EXPLICIT_NAME_HINT_RE = /\bname\s*(?:is|=)\s+["']?([^"'\n,]+)["']?/i;

const ROLE_QUERY_STRIP_RE =
  /\b(i want|find me|search for|looking for|please|candidate|candidates|resume|resumes|cv|cvs|name is|name=|called|compare|versus|vs\.?|who is better|better|best|chkoun khir|khir|wela|7aseb el resume|haseb el resume)\b/gi;

const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "want",
  "need",
  "looking",
  "search",
  "find",
  "please",
  "candidate",
  "candidates",
  "resume",
  "resumes",
  "cv",
  "cvs",
  "name",
  "called",
  "show",
  "me",
]);

const CERTIFICATION_HINTS = [
  "certified",
  "certification",
  "aws",
  "azure",
  "gcp",
  "scrum",
  "pmp",
  "oracle",
  "microsoft",
  "google",
  "kubernetes",
  "cisco",
  "itil",
];

const EDUCATION_HINTS = [
  "bachelor",
  "licence",
  "license",
  "master",
  "msc",
  "mba",
  "phd",
  "doctorate",
  "engineer",
  "ingénieur",
  "ingenieur",
];

export type ChatIntent = "greeting" | "compare" | "named_search" | "agent";

export interface ClassifiedChatIntent {
  intent: ChatIntent;
  candidateRefs?: string[];
  requestedName?: string;
  targetRoleQuery?: string;
}

export interface ResumeProfile {
  id: string;
  sourceType: "candidate" | "cv";
  candidateId?: string;
  cvId: string;
  jobId?: string;
  jobTitle?: string;
  displayName: string;
  email?: string | null;
  stage?: string;
  skills: string[];
  experiences: Array<Record<string, string>>;
  education: Array<Record<string, string>>;
  languages: string[];
  summary?: string | null;
  aliases: string[];
}

export interface NamedSearchResult {
  mode: "direct_search";
  nameQuery: string;
  targetRoleQuery?: string;
  exact: boolean;
  results: Array<{
    profile: ResumeProfile;
    nameScore: number;
    roleScore: number;
    combinedScore: number;
    reason: string;
  }>;
  responseText: string;
}

export interface CompareResult {
  mode: "llm_compare" | "fallback_compare";
  responseText: string;
  usedFallback: boolean;
  comparedCandidates: ResumeProfile[];
  missingRefs?: string[];
}

interface CompareFallbackRow {
  profile: ResumeProfile;
  overallScore: number;
  experienceScore: number;
  skillScore: number;
  recencyScore: number;
  educationScore: number;
  estimatedYears: number;
  explanation: string[];
}

function formatRoleGreeting(role: UserRole): string {
  const roleLabel =
    role === "admin"
      ? "admin"
      : role === "manager"
        ? "hiring manager"
        : role === "hr"
          ? "HR"
          : "TA";

  return `Hello! I’m your recruitment assistant for ${roleLabel}. I can help you compare candidates, search resumes, summarize pipeline data, and review jobs.`;
}

export function classifyChatIntent(
  message: string,
  hasAttachments: boolean = false,
): ClassifiedChatIntent {
  const raw = String(message ?? "").trim();
  const normalized = normalizeLookupText(raw);

  if (!normalized || hasAttachments) {
    return { intent: "agent" };
  }

  if (GREETING_RE.test(raw)) {
    return { intent: "greeting" };
  }

  if (COMPARE_HINT_RE.test(normalized)) {
    const candidateRefs = extractCompareCandidateRefs(raw);
    return {
      intent: candidateRefs.length >= 2 ? "compare" : "agent",
      candidateRefs: candidateRefs.length >= 2 ? candidateRefs : undefined,
      targetRoleQuery: extractRoleQuery(raw),
    };
  }

  const explicitName = extractExplicitName(raw);
  if (explicitName) {
    return {
      intent: "named_search",
      requestedName: explicitName,
      targetRoleQuery: extractRoleQuery(raw),
    };
  }

  return { intent: "agent" };
}

export function buildGreetingResponse(role: UserRole): string {
  return formatRoleGreeting(role);
}

function extractExplicitName(input: string): string | undefined {
  const match = input.match(EXPLICIT_NAME_HINT_RE);
  if (match?.[1]) {
    return sanitizeReference(match[1]);
  }

  const normalized = normalizeLookupText(input);
  const calledMatch = normalized.match(/\bcalled\s+(.+)$/);
  if (calledMatch?.[1]) {
    return sanitizeReference(calledMatch[1]);
  }

  return undefined;
}

function extractCompareCandidateRefs(input: string): string[] {
  const normalized = normalizeLookupText(input);
  const working = normalized
    .replace(/\bwho is better\b/g, " ")
    .replace(/\bcompare\b/g, " ")
    .replace(/\bversus\b/g, "|")
    .replace(/\bvs\b/g, "|")
    .replace(/\bbetter\b/g, " ")
    .replace(/\bbest\b/g, " ")
    .replace(/\bkhir\b/g, " ")
    .replace(/\bwela\b/g, "|")
    .replace(/\bولا\b/g, "|")
    .replace(/\b7aseb el resume\b/g, " ")
    .replace(/\bhaseb el resume\b/g, " ")
    .replace(/\bresume\b/g, " ")
    .replace(/\bcv\b/g, " ");

  const separators = ["|", " and ", " or "];
  for (const separator of separators) {
    if (working.includes(separator)) {
      const parts = working
        .split(separator)
        .map((part) => sanitizeReference(part))
        .filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(0, 5);
      }
    }
  }

  const fallback = working
    .split(/\s+/)
    .map((part) => sanitizeReference(part))
    .filter(Boolean)
    .filter((part) => part.length >= 3);

  return fallback.slice(0, 2);
}

function sanitizeReference(input: string): string {
  return String(input ?? "")
    .replace(/["'`]+/g, "")
    .replace(
      /\b(please|resume|resumes|cv|cvs|candidate|candidates|for|job|role)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractRoleQuery(input: string): string | undefined {
  const explicitName = extractExplicitName(input);
  let cleaned = input;

  if (explicitName) {
    cleaned = cleaned.replace(EXPLICIT_NAME_HINT_RE, " ");
  }

  cleaned = cleaned
    .replace(/["'`]/g, " ")
    .replace(ROLE_QUERY_STRIP_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : undefined;
}

function formatProfileLine(profile: ResumeProfile): string {
  const skillPreview =
    profile.skills.slice(0, 6).join(", ") || "No extracted skills";
  const experiencePreview =
    profile.experiences.length > 0
      ? `${profile.experiences.length} experience entr${profile.experiences.length === 1 ? "y" : "ies"}`
      : "No extracted experience";

  const suffixParts = [
    profile.stage ? `stage: ${profile.stage}` : null,
    profile.jobTitle ? `job: ${profile.jobTitle}` : null,
  ].filter(Boolean);

  return `- **${profile.displayName}**${suffixParts.length > 0 ? ` (${suffixParts.join(" • ")})` : ""}\n  - Skills: ${skillPreview}\n  - Experience: ${experiencePreview}`;
}

function buildSearchKeywords(roleQuery?: string): string[] {
  if (!roleQuery) return [];
  return tokenizeLookupText(roleQuery)
    .filter((token) => token.length >= 3)
    .filter((token) => !SEARCH_STOPWORDS.has(token));
}

function normalizeTextCorpus(profile: ResumeProfile): string {
  const experienceText = profile.experiences
    .map((entry) => Object.values(entry).join(" "))
    .join(" ");
  const educationText = profile.education
    .map((entry) => Object.values(entry).join(" "))
    .join(" ");

  return normalizeLookupText(
    [
      profile.displayName,
      profile.jobTitle ?? "",
      profile.summary ?? "",
      profile.skills.join(" "),
      experienceText,
      educationText,
      profile.languages.join(" "),
    ].join(" "),
  );
}

function computeRoleFitScore(
  profile: ResumeProfile,
  roleQuery?: string,
): number {
  const keywords = buildSearchKeywords(roleQuery);

  if (keywords.length === 0) {
    const breadth = Math.min(
      100,
      profile.skills.length * 10 + profile.experiences.length * 8,
    );
    return Math.max(35, breadth);
  }

  const corpus = normalizeTextCorpus(profile);
  if (!corpus) return 0;

  let matched = 0;
  for (const keyword of keywords) {
    if (corpus.includes(keyword)) {
      matched++;
      continue;
    }

    const corpusTokens = corpus.split(" ");
    const hasFuzzy = corpusTokens.some(
      (token) => normalizedSimilarity(keyword, token) >= 0.84,
    );
    if (hasFuzzy) {
      matched++;
    }
  }

  return Math.round((matched / keywords.length) * 100);
}

function extractYearNumbers(value: string): number[] {
  const matches = value.match(/\b(19|20)\d{2}\b/g) ?? [];
  return matches
    .map((match) => Number(match))
    .filter((year) => Number.isFinite(year));
}

function estimateYearsFromDuration(value: string): number {
  const normalized = normalizeLookupText(value);
  let total = 0;

  const yearMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s+(?:year|years|yr|yrs|ans|an)/,
  );
  if (yearMatch) {
    total += Number(yearMatch[1]);
  }

  const monthMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s+(?:month|months|mois)/,
  );
  if (monthMatch) {
    total += Number(monthMatch[1]) / 12;
  }

  const years = extractYearNumbers(normalized);
  if (years.length >= 2) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if (maxYear >= minYear) {
      total = Math.max(total, maxYear - minYear);
    }
  } else if (
    years.length === 1 &&
    /\b(current|present|ongoing|actuel|maintenant)\b/.test(normalized)
  ) {
    total = Math.max(total, new Date().getFullYear() - years[0]);
  }

  return Math.max(0, total);
}

function estimateYearsOfExperience(profile: ResumeProfile): number {
  const estimated = profile.experiences.reduce((sum, entry) => {
    const combined = Object.values(entry).join(" ");
    const durationEstimate = estimateYearsFromDuration(combined);
    return sum + durationEstimate;
  }, 0);

  if (estimated > 0) {
    return Math.min(20, Number(estimated.toFixed(1)));
  }

  return Math.min(15, profile.experiences.length * 1.5);
}

function computeExperienceScore(
  profile: ResumeProfile,
  roleQuery?: string,
): {
  score: number;
  years: number;
} {
  const years = estimateYearsOfExperience(profile);
  const normalizedRole = normalizeLookupText(roleQuery ?? "");

  let targetYears = 6;
  if (/\b(junior|entry)\b/.test(normalizedRole)) targetYears = 2;
  if (/\b(mid|intermediate)\b/.test(normalizedRole)) targetYears = 4;
  if (/\b(senior|lead|principal|architect)\b/.test(normalizedRole))
    targetYears = 7;

  const score = Math.min(100, Math.round((years / targetYears) * 100));
  return {
    score: Math.max(20, score),
    years,
  };
}

function computeRecencyAndRelevanceScore(
  profile: ResumeProfile,
  roleQuery?: string,
): number {
  if (profile.experiences.length === 0) return 20;

  const keywords = buildSearchKeywords(roleQuery);
  const recentEntries = profile.experiences.slice(0, 2);
  let recency = 45;
  let relevance = keywords.length === 0 ? 55 : 0;

  for (const entry of recentEntries) {
    const entryText = normalizeLookupText(Object.values(entry).join(" "));

    if (
      /\b(current|present|ongoing|actuel|maintenant)\b/.test(entryText) ||
      extractYearNumbers(entryText).some(
        (year) => year >= new Date().getFullYear() - 2,
      )
    ) {
      recency = 100;
    } else if (
      extractYearNumbers(entryText).some(
        (year) => year >= new Date().getFullYear() - 4,
      )
    ) {
      recency = Math.max(recency, 75);
    }

    if (keywords.length > 0) {
      let matched = 0;
      for (const keyword of keywords) {
        if (
          entryText.includes(keyword) ||
          entryText
            .split(" ")
            .some((token) => normalizedSimilarity(token, keyword) >= 0.84)
        ) {
          matched++;
        }
      }
      relevance = Math.max(
        relevance,
        Math.round((matched / keywords.length) * 100),
      );
    }
  }

  return Math.round(recency * 0.35 + relevance * 0.65);
}

function computeEducationScore(profile: ResumeProfile): number {
  const educationText = normalizeLookupText(
    profile.education.map((entry) => Object.values(entry).join(" ")).join(" "),
  );

  if (!educationText) return 25;

  let score = 35;

  for (const hint of EDUCATION_HINTS) {
    if (educationText.includes(hint)) {
      score += 12;
    }
  }

  for (const hint of CERTIFICATION_HINTS) {
    if (educationText.includes(hint)) {
      score += 8;
    }
  }

  return Math.min(100, score);
}

function explainFallbackScore(
  profile: ResumeProfile,
  row: CompareFallbackRow,
  roleQuery?: string,
): string[] {
  const reasons: string[] = [];

  reasons.push(
    `${row.estimatedYears.toFixed(1)} estimated years of experience`,
  );
  if (roleQuery) {
    reasons.push(`${row.skillScore}% role-fit score for "${roleQuery}"`);
  } else {
    reasons.push(`${row.skillScore}% general resume skill-depth score`);
  }

  if (row.recencyScore >= 75) {
    reasons.push("more recent and relevant role history");
  }

  if (row.educationScore >= 60) {
    reasons.push("stronger education/certification signals");
  }

  if (profile.jobTitle) {
    reasons.push(`current pipeline context: ${profile.jobTitle}`);
  }

  return reasons.slice(0, 4);
}

function renderNamedSearchResponse(result: NamedSearchResult): string {
  if (result.results.length === 0) {
    return `I couldn’t find a strong resume match for **${result.nameQuery}** in the accessible CV pool.`;
  }

  const header = result.exact
    ? `I found resume matches for **${result.nameQuery}**.`
    : `I didn’t find an exact spelling for **${result.nameQuery}**, but these are the closest resume matches.`;

  const intro = result.targetRoleQuery
    ? `Target role context: **${result.targetRoleQuery}**. Results are ranked by name similarity first, then role relevance.`
    : `Results are ranked by fuzzy name similarity, then by overall resume strength.`;

  const body = result.results
    .slice(0, 3)
    .map((item, index) => {
      const profile = item.profile;
      const years = estimateYearsOfExperience(profile).toFixed(1);
      const skills =
        profile.skills.slice(0, 6).join(", ") || "No extracted skills";
      const context = [
        profile.stage ? `stage: ${profile.stage}` : null,
        profile.jobTitle ? `job: ${profile.jobTitle}` : null,
        `${years} yrs est. exp.`,
      ]
        .filter(Boolean)
        .join(" • ");

      return `${index + 1}. **${profile.displayName}**${context ? ` (${context})` : ""}\n   - Why: ${item.reason}\n   - Skills: ${skills}\n   - Name match: ${Math.round(item.nameScore)} | Role fit: ${Math.round(item.roleScore)} | Combined: ${Math.round(item.combinedScore)}`;
    })
    .join("\n");

  return `${header}\n\n${intro}\n\n${body}`;
}

export async function searchResumesByName(
  userId: string,
  requestedName: string,
  targetRoleQuery?: string,
): Promise<NamedSearchResult> {
  const profiles = await loadResumeLookupProfiles(userId);
  const ranked = rankLookupMatches(
    requestedName,
    profiles,
    (profile) => profile.aliases,
    { limit: 5, minScore: 0.58 },
  );

  const results = ranked.map((item) => {
    const roleScore = computeRoleFitScore(item.item, targetRoleQuery);
    const combinedScore = Math.round(item.score * 70 + roleScore * 0.3);
    return {
      profile: item.item,
      nameScore: Math.round(item.score * 100),
      roleScore,
      combinedScore,
      reason: item.reason,
    };
  });

  results.sort((a, b) => b.combinedScore - a.combinedScore);

  const responseText = renderNamedSearchResponse({
    mode: "direct_search",
    nameQuery: requestedName,
    targetRoleQuery,
    exact: results.some((item) => Math.round(item.nameScore) >= 93),
    results,
    responseText: "",
  });

  return {
    mode: "direct_search",
    nameQuery: requestedName,
    targetRoleQuery,
    exact: results.some((item) => Math.round(item.nameScore) >= 93),
    results,
    responseText,
  };
}

async function loadResumeLookupProfiles(
  userId: string,
): Promise<ResumeProfile[]> {
  const [cvs, candidates] = await Promise.all([
    listCvPool(userId),
    getCandidatesByStage(ALL_CANDIDATE_STAGES),
  ]);

  const cvMap = new Map<
    string,
    Awaited<ReturnType<typeof listCvPool>>[number]
  >();
  for (const cv of cvs) {
    cvMap.set(cv.id, cv);
  }

  const jobCache = new Map<string, string | undefined>();
  const profiles: ResumeProfile[] = [];
  const usedCvIds = new Set<string>();

  for (const candidate of candidates) {
    const cv = cvMap.get(candidate.cvId);
    if (!cv) continue;

    usedCvIds.add(cv.id);

    let jobTitle = jobCache.get(candidate.jobId);
    if (jobTitle === undefined) {
      const job = await getJob(candidate.jobId);
      jobTitle = job?.title;
      jobCache.set(candidate.jobId, jobTitle);
    }

    profiles.push({
      id: candidate.id,
      sourceType: "candidate",
      candidateId: candidate.id,
      cvId: cv.id,
      jobId: candidate.jobId,
      jobTitle,
      displayName:
        candidate.fullName || cv.extractedName || "Unknown Candidate",
      email: candidate.email || cv.extractedEmail,
      stage: candidate.stage,
      skills: cv.extractedSkills ?? [],
      experiences:
        (cv.extractedExperiences as Array<Record<string, string>>) ?? [],
      education: (cv.extractedEducation as Array<Record<string, string>>) ?? [],
      languages: cv.extractedLanguages ?? [],
      summary: cv.extractedSummary ?? null,
      aliases: Array.from(
        new Set(
          [
            candidate.fullName,
            cv.extractedName,
            candidate.email,
            cv.extractedEmail,
            cv.filename.replace(/\.[^.]+$/, ""),
          ]
            .filter(Boolean)
            .map((value) => String(value)),
        ),
      ),
    });
  }

  for (const cv of cvs) {
    if (usedCvIds.has(cv.id)) continue;

    profiles.push({
      id: cv.id,
      sourceType: "cv",
      cvId: cv.id,
      displayName:
        (cv.extractedName ?? cv.filename.replace(/\.[^.]+$/, "")) ||
        "Unknown CV",
      email: cv.extractedEmail,
      skills: cv.extractedSkills ?? [],
      experiences:
        (cv.extractedExperiences as Array<Record<string, string>>) ?? [],
      education: (cv.extractedEducation as Array<Record<string, string>>) ?? [],
      languages: cv.extractedLanguages ?? [],
      summary: cv.extractedSummary ?? null,
      aliases: Array.from(
        new Set(
          [
            cv.extractedName,
            cv.extractedEmail,
            cv.filename,
            cv.filename.replace(/\.[^.]+$/, ""),
          ]
            .filter(Boolean)
            .map((value) => String(value)),
        ),
      ),
    });
  }

  return profiles;
}

function chooseMatchedProfiles(
  refs: string[],
  profiles: ResumeProfile[],
): {
  matches: ResumeProfile[];
  missingRefs: string[];
} {
  const chosen = new Map<string, ResumeProfile>();
  const missingRefs: string[] = [];

  for (const ref of refs) {
    const best = findBestLookupMatch(
      ref,
      profiles,
      (profile) => profile.aliases,
      {
        autoResolveScore: 0.91,
        ambiguityGap: 0.05,
        minSuggestionScore: 0.58,
        suggestionLimit: 5,
      },
    );

    if (best.match) {
      chosen.set(best.match.item.id, best.match.item);
      continue;
    }

    if (best.suggestions.length > 0) {
      chosen.set(best.suggestions[0].item.id, best.suggestions[0].item);
      continue;
    }

    missingRefs.push(ref);
  }

  return {
    matches: Array.from(chosen.values()),
    missingRefs,
  };
}

function buildFallbackRows(
  profiles: ResumeProfile[],
  roleQuery?: string,
): CompareFallbackRow[] {
  return profiles
    .map((profile) => {
      const experience = computeExperienceScore(profile, roleQuery);
      const skillScore = computeRoleFitScore(profile, roleQuery);
      const recencyScore = computeRecencyAndRelevanceScore(profile, roleQuery);
      const educationScore = computeEducationScore(profile);
      const overallScore = Math.round(
        experience.score * 0.4 +
          skillScore * 0.3 +
          recencyScore * 0.2 +
          educationScore * 0.1,
      );

      return {
        profile,
        overallScore,
        experienceScore: experience.score,
        skillScore,
        recencyScore,
        educationScore,
        estimatedYears: experience.years,
        explanation: explainFallbackScore(
          profile,
          {
            profile,
            overallScore,
            experienceScore: experience.score,
            skillScore,
            recencyScore,
            educationScore,
            estimatedYears: experience.years,
            explanation: [],
          },
          roleQuery,
        ),
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}

function renderFallbackComparison(
  rows: CompareFallbackRow[],
  roleQuery?: string,
): string {
  if (rows.length === 0) {
    return "I could not compare these resumes because I could not resolve the requested candidates.";
  }

  const top = rows[0];
  const second = rows[1];

  const table = [
    "| Rank | Candidate | Overall | Experience | Skill Fit | Recency/Relevance | Education/Certs |",
    "|------|-----------|---------|------------|-----------|-------------------|-----------------|",
    ...rows.map(
      (row, index) =>
        `| ${index + 1} | ${row.profile.displayName} | ${row.overallScore} | ${row.experienceScore} | ${row.skillScore} | ${row.recencyScore} | ${row.educationScore} |`,
    ),
  ].join("\n");

  const whyTop = top.explanation.map((reason) => `- ${reason}`).join("\n");
  const roleLine = roleQuery
    ? `Target role used for scoring: **${roleQuery}**.`
    : `No target role was explicitly provided, so skill fit was estimated from general resume depth.`;

  const leadReason = second
    ? `**${top.profile.displayName}** ranks ahead of **${second.profile.displayName}** mainly because of stronger ${top.experienceScore >= second.experienceScore ? "experience depth" : "resume experience balance"}, ${top.skillScore >= second.skillScore ? "skill alignment" : "role relevance"}, and ${top.recencyScore >= second.recencyScore ? "more recent/relevant roles" : "overall recency signals"}.`
    : `**${top.profile.displayName}** is the strongest available resume match among the resolved profiles.`;

  return [
    "## Fallback mode — Resume-based comparison",
    "I could not complete the AI comparison path in time, so I ranked the candidates deterministically from available resume data.",
    "",
    roleLine,
    "",
    table,
    "",
    `### Why ${top.profile.displayName} ranks highest`,
    whyTop,
    "",
    leadReason,
  ].join("\n");
}

function renderLlmComparison(
  data: Awaited<ReturnType<typeof compareCandidates>>,
): string {
  const rankingMap = new Map(
    data.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const rankedCandidates = data.rankingOrder
    .map((id) => rankingMap.get(id))
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );

  const table = [
    "| Rank | Name | Overall Fit | Screening | Interview | Stage |",
    "|------|------|-------------|-----------|-----------|-------|",
    ...rankedCandidates.map(
      (candidate, index) =>
        `| ${index + 1} | ${candidate.name} | ${Math.round(candidate.overallFit)} | ${candidate.screeningScore ?? "N/A"} | ${candidate.interviewScore ?? "N/A"} | ${candidate.stage} |`,
    ),
  ].join("\n");

  const details = rankedCandidates
    .slice(0, 3)
    .map((candidate) => {
      const pros = candidate.pros
        .slice(0, 3)
        .map((item) => `  - ${item}`)
        .join("\n");
      const cons = candidate.cons
        .slice(0, 2)
        .map((item) => `  - ${item}`)
        .join("\n");
      return `### ${candidate.name}\n**Pros**\n${pros || "  - None provided"}\n**Cons**\n${cons || "  - None provided"}`;
    })
    .join("\n\n");

  return `## Candidate comparison — ${data.jobTitle}\n\n${table}\n\n${details}\n\n### Recommendation\n${data.recommendation}`;
}

export async function compareCandidatesDirect(
  userId: string,
  candidateRefs: string[],
  _role: UserRole,
  targetRoleQuery?: string,
): Promise<CompareResult> {
  const profiles = await loadResumeLookupProfiles(userId);
  const candidateProfiles = profiles.filter(
    (profile) => profile.sourceType === "candidate",
  );

  const { matches, missingRefs } = chooseMatchedProfiles(
    candidateRefs,
    candidateProfiles,
  );

  if (matches.length < 2) {
    const fallbackRows = buildFallbackRows(matches, targetRoleQuery);
    return {
      mode: "fallback_compare",
      usedFallback: true,
      comparedCandidates: matches,
      missingRefs,
      responseText: renderFallbackComparison(fallbackRows, targetRoleQuery),
    };
  }

  const sameJobId =
    matches.every((profile) => profile.jobId) &&
    new Set(matches.map((profile) => profile.jobId)).size === 1;

  if (sameJobId) {
    try {
      const llmResult = await compareCandidates(
        matches
          .map((profile) => profile.candidateId)
          .filter((value): value is string => Boolean(value)),
        matches[0].jobId as string,
      );

      return {
        mode: "llm_compare",
        usedFallback: false,
        comparedCandidates: matches,
        missingRefs,
        responseText: renderLlmComparison(llmResult),
      };
    } catch {
      // Fall back below.
    }
  }

  const fallbackRows = buildFallbackRows(matches, targetRoleQuery);
  return {
    mode: "fallback_compare",
    usedFallback: true,
    comparedCandidates: matches,
    missingRefs,
    responseText: renderFallbackComparison(fallbackRows, targetRoleQuery),
  };
}

export function buildDeterministicToolFallback(
  toolName: string,
  data: unknown,
): string | null {
  if (!data) return null;

  if (toolName === "compare_candidates" && isCompareToolPayload(data)) {
    return renderLlmComparison(data);
  }

  if (toolName === "rag_search_cvs" && isRagPayload(data)) {
    const lines = [
      `I’m returning a deterministic fallback summary from the retrieved CV chunks.`,
      `- Query: **${data.query}**`,
      `- CVs found: **${data.totalCvs}**`,
      `- Chunks returned: **${data.totalChunks}**`,
      "",
      "Top results:",
      ...data.chunks
        .slice(0, 3)
        .map(
          (chunk, index) =>
            `${index + 1}. **${chunk.candidateName}** — ${chunk.sectionType} (score: ${chunk.score})`,
        ),
    ];
    return lines.join("\n");
  }

  if (toolName === "semantic_search_cvs" && isSemanticPayload(data)) {
    const lines = [
      `I’m returning a deterministic fallback summary from semantic CV search.`,
      `- Query: **${data.query}**`,
      `- Results: **${data.totalResults}**`,
      "",
      "Top matches:",
      ...data.results
        .slice(0, 3)
        .map(
          (result, index) =>
            `${index + 1}. **${result.candidateName}** — similarity ${result.similarityScore}%`,
        ),
    ];
    return lines.join("\n");
  }

  if (toolName === "hybrid_search_cvs" && Array.isArray(data)) {
    const lines = [
      `I’m returning a deterministic fallback summary from hybrid CV search.`,
      `- Results: **${data.length}**`,
      "",
      "Top matches:",
      ...data.slice(0, 3).map((item, index) => {
        const row = item as Record<string, unknown>;
        return `${index + 1}. **${String(row.candidateName ?? "Unknown")}** — RRF ${String(row.rrfScore ?? "N/A")}`;
      }),
    ];
    return lines.join("\n");
  }

  if (Array.isArray(data)) {
    return `I’m returning a deterministic fallback summary from the latest tool result. The tool returned **${data.length}** item(s).`;
  }

  if (typeof data === "object") {
    return `I’m returning a deterministic fallback summary from the latest tool result using the data already fetched successfully.`;
  }

  return String(data);
}

function isCompareToolPayload(
  value: unknown,
): value is Awaited<ReturnType<typeof compareCandidates>> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.jobTitle === "string" &&
    Array.isArray(record.candidates) &&
    Array.isArray(record.rankingOrder) &&
    typeof record.recommendation === "string"
  );
}

function isRagPayload(value: unknown): value is {
  query: string;
  totalCvs: number;
  totalChunks: number;
  chunks: Array<{ candidateName: string; sectionType: string; score: number }>;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.query === "string" &&
    typeof record.totalCvs === "number" &&
    typeof record.totalChunks === "number" &&
    Array.isArray(record.chunks)
  );
}

function isSemanticPayload(value: unknown): value is {
  query: string;
  totalResults: number;
  results: Array<{ candidateName: string; similarityScore: number }>;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.query === "string" &&
    typeof record.totalResults === "number" &&
    Array.isArray(record.results)
  );
}

export function summarizeResolvedProfiles(profiles: ResumeProfile[]): string {
  if (profiles.length === 0) {
    return "No profiles resolved.";
  }

  return profiles.map(formatProfileLine).join("\n");
}

export function hasMeaningfulNameMatch(
  input: string,
  candidate: string,
): boolean {
  const left = buildLookupKeys(input);
  const right = buildLookupKeys(candidate);

  if (!left.normalized || !right.normalized) return false;
  if (left.normalized === right.normalized) return true;
  if (left.phonetic && right.phonetic && left.phonetic === right.phonetic)
    return true;
  if (
    left.consonants &&
    right.consonants &&
    left.consonants === right.consonants
  )
    return true;

  return normalizedSimilarity(left.normalized, right.normalized) >= 0.84;
}
