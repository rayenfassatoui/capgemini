import * as z from "zod/v3";
import { callOpenRouter, cleanJsonResponse } from "./ai";

// ---------------------------------------------------------------------------
// Query Rewrite Service - Phase 2 RAG
// Normalizes user queries for better retrieval
// ---------------------------------------------------------------------------

/**
 * Rewritten query structure for retrieval pipeline.
 */
export const rewrittenQuerySchema = z.object({
  semanticQuery: z.string().describe("Normalized query for vector embedding"),
  lexicalKeywords: z.array(z.string()).describe("Keywords for text search"),
  filters: z
    .object({
      seniority: z.string().optional(),
      languages: z.array(z.string()).optional(),
      minExperienceYears: z.number().optional(),
      skills: z.array(z.string()).optional(),
    })
    .optional(),
});

export type RewrittenQuery = z.infer<typeof rewrittenQuerySchema>;

const REWRITE_SYSTEM_PROMPT = `You are a query rewriter for a recruitment CV search system.

Given a user's search query, extract and normalize it into structured components for retrieval.

Rules:
1. semanticQuery: Rewrite the query as a clear, searchable statement. Remove filler words. Focus on skills, roles, and requirements.
2. lexicalKeywords: Extract specific technical terms, job titles, company types, and skills that should be matched exactly.
3. filters: Extract any explicit constraints:
   - seniority: "junior", "mid", "senior", "lead", "principal" (if mentioned)
   - languages: Spoken languages like "French", "English" (if mentioned)
   - minExperienceYears: Number of years experience (if mentioned)
   - skills: Specific technical skills to filter by (if mentioned)

Return ONLY valid JSON matching this schema:
{
  "semanticQuery": "string",
  "lexicalKeywords": ["string"],
  "filters": {
    "seniority": "string or omit",
    "languages": ["string"] or omit,
    "minExperienceYears": number or omit,
    "skills": ["string"] or omit
  }
}

Examples:
- "Find me Java developers with 5+ years" -> {"semanticQuery": "Java developer with extensive experience", "lexicalKeywords": ["Java", "developer"], "filters": {"minExperienceYears": 5}}
- "Senior React engineers who speak French" -> {"semanticQuery": "Senior React engineer", "lexicalKeywords": ["React", "engineer", "frontend"], "filters": {"seniority": "senior", "languages": ["French"]}}
- "Anyone good at machine learning" -> {"semanticQuery": "Machine learning engineer or data scientist", "lexicalKeywords": ["machine learning", "ML", "AI", "data science"], "filters": {}}`;

/**
 * Rewrite a user query into structured retrieval components.
 * Uses LLM with deterministic settings for consistent output.
 */
export async function rewriteQuery(query: string): Promise<RewrittenQuery> {
  const trimmed = query.trim();

  if (!trimmed || trimmed.length < 3) {
    return {
      semanticQuery: trimmed,
      lexicalKeywords: trimmed.split(/\s+/).filter((w) => w.length > 2),
      filters: undefined,
    };
  }

  try {
    const response = await callOpenRouter(
      REWRITE_SYSTEM_PROMPT,
      `Rewrite this search query: "${trimmed}"`,
      "structured",
    );

    const cleaned = cleanJsonResponse(response);
    const parsed = JSON.parse(cleaned);
    const validated = rewrittenQuerySchema.parse(parsed);

    return validated;
  } catch (error) {
    console.warn(
      "[query-rewrite] Failed to rewrite query, using fallback:",
      error,
    );

    // Fallback: simple keyword extraction
    const words = trimmed
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return {
      semanticQuery: trimmed,
      lexicalKeywords: words.slice(0, 10),
      filters: undefined,
    };
  }
}

/**
 * Simple query normalization without LLM (for caching/comparison).
 */
export function normalizeQueryForCache(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

/**
 * Extract skills from a query using simple pattern matching.
 * Used as fallback when LLM rewrite is unavailable.
 */
export function extractKeywordsSimple(query: string): string[] {
  const techTerms = [
    "java",
    "python",
    "javascript",
    "typescript",
    "react",
    "angular",
    "vue",
    "node",
    "nodejs",
    "express",
    "django",
    "flask",
    "spring",
    "springboot",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "sql",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "machine learning",
    "ml",
    "ai",
    "deep learning",
    "nlp",
    "computer vision",
    "devops",
    "ci/cd",
    "jenkins",
    "github actions",
    "gitlab",
    "agile",
    "scrum",
    "kanban",
    "jira",
    "frontend",
    "backend",
    "fullstack",
    "full-stack",
    "full stack",
    "api",
    "rest",
    "graphql",
    "microservices",
    "senior",
    "junior",
    "lead",
    "principal",
    "architect",
  ];

  const lowerQuery = query.toLowerCase();
  const found: string[] = [];

  for (const term of techTerms) {
    if (lowerQuery.includes(term)) {
      found.push(term);
    }
  }

  // Also add individual words longer than 3 chars
  const words = lowerQuery.split(/\s+/).filter((w) => w.length > 3);
  for (const word of words) {
    if (
      !found.includes(word) &&
      ![
        "find",
        "show",
        "search",
        "looking",
        "need",
        "want",
        "with",
        "from",
        "have",
        "good",
        "best",
      ].includes(word)
    ) {
      found.push(word);
    }
  }

  return [...new Set(found)].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Circuit Breaker — prevents cascading LLM timeout latency
// ---------------------------------------------------------------------------

const CB_FAILURE_THRESHOLD = 3; // consecutive failures before opening
const CB_COOLDOWN_MS = 2 * 60 * 1000; // 2-minute cooldown before probe

let _cbConsecutiveFailures = 0;
let _cbOpenedAt: number | null = null;

/**
 * Returns true when the circuit breaker is open and LLM calls should be skipped.
 * After CB_COOLDOWN_MS the circuit resets and allows one probe attempt through.
 */
function cbIsOpen(): boolean {
  if (_cbOpenedAt === null) return false;
  if (Date.now() - _cbOpenedAt > CB_COOLDOWN_MS) {
    // Cooldown elapsed — reset and let a probe through
    _cbConsecutiveFailures = 0;
    _cbOpenedAt = null;
    return false;
  }
  return true;
}

function cbRecordSuccess(): void {
  _cbConsecutiveFailures = 0;
  _cbOpenedAt = null;
}

function cbRecordFailure(): void {
  _cbConsecutiveFailures++;
  if (_cbConsecutiveFailures >= CB_FAILURE_THRESHOLD && _cbOpenedAt === null) {
    _cbOpenedAt = Date.now();
    console.warn(
      `[query-rewrite] Circuit breaker OPEN after ${_cbConsecutiveFailures} consecutive failures — ` +
        `LLM rewrite disabled for ${CB_COOLDOWN_MS / 1000}s`,
    );
  }
}

/** Circuit breaker status — for observability/monitoring. */
export function getRewriteCircuitStatus(): {
  open: boolean;
  consecutiveFailures: number;
  openedAt: number | null;
} {
  return {
    open: _cbOpenedAt !== null && Date.now() - _cbOpenedAt <= CB_COOLDOWN_MS,
    consecutiveFailures: _cbConsecutiveFailures,
    openedAt: _cbOpenedAt,
  };
}

// ---------------------------------------------------------------------------
// Query Rewrite Helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether an LLM rewrite is worth the cost for a given query.
 *
 * Fast-path rules (evaluated in order):
 * 1. ≤ 2 words  → false  (too short to benefit from rewriting)
 * 2. Contains a constraint pattern (experience, seniority, language, conjunction) → true
 * 3. ≥ 6 words  → true   (long enough to benefit from normalisation)
 * 4. Otherwise  → false
 */
export function shouldRewriteQuery(query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);

  // Fast-path: very short queries are not worth an LLM round-trip
  if (words.length <= 2) {
    return false;
  }

  const constraintPatterns: RegExp[] = [
    /\b\d+\+?\s*(?:years?|ans?|yrs?)\b/i, // experience years
    /\b(?:senior|junior|lead|principal|architect|mid[-\s]?level)\b/i, // seniority level
    /\b(?:french|english|arabic|german|spanish|francais|anglais)\b/i, // spoken language
    /\b(?:and|with|having|plus|et|avec)\b/i, // multi-criteria conjunctions
  ];

  if (constraintPatterns.some((pattern) => pattern.test(query))) {
    return true;
  }

  // Long queries benefit from semantic normalisation even without explicit constraints
  if (words.length >= 6) {
    return true;
  }

  return false;
}

/**
 * Wraps `rewriteQuery` with a hard timeout and a safe fallback.
 *
 * If the LLM rewrite does not resolve within `timeoutMs` milliseconds, or if
 * it rejects for any reason, a warning is logged and a lightweight fallback
 * result is returned instead so the calling code never has to handle errors.
 *
 * @param query     - The raw user search query.
 * @param timeoutMs - Maximum time to wait for the LLM (default: 3 000 ms).
 * @returns A `RewrittenQuery` — either the LLM result or the fallback.
 */
export function rewriteQueryWithTimeout(
  query: string,
  timeoutMs = 3000,
): Promise<RewrittenQuery> {
  const trimmed = query.trim();

  const fallback = (): RewrittenQuery => ({
    semanticQuery: trimmed,
    lexicalKeywords: extractKeywordsSimple(trimmed),
    filters: undefined,
  });

  // Circuit breaker: fast-fail without hitting the LLM when the API is down.
  // Logged at debug level to avoid warn-spam once the circuit is already open.
  if (cbIsOpen()) {
    console.debug(
      "[query-rewrite] Circuit breaker open — fast-path fallback (no LLM call)",
    );
    return Promise.resolve(fallback());
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`rewriteQuery timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });

  return Promise.race([rewriteQuery(trimmed), timeoutPromise])
    .then((result) => {
      cbRecordSuccess();
      return result;
    })
    .catch((error: unknown) => {
      cbRecordFailure();
      console.warn(
        "[query-rewrite] rewriteQueryWithTimeout falling back to simple extraction:",
        error,
      );
      return fallback();
    });
}
