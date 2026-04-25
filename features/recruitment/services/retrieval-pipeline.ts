import { db } from "@/lib/db";
import { cvChunks, cvPool } from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import { generateTextEmbedding } from "./embeddings";
import {
  rewriteQueryWithTimeout,
  shouldRewriteQuery,
  extractKeywordsSimple,
  type RewrittenQuery,
} from "./query-rewrite";
import type { RetrievalScope } from "./cv-matching";
import { getLatestIndexVersion } from "./chunking";
import {
  embeddingCache,
  retrievalCache,
  rewriteCache,
  buildEmbeddingCacheKey,
  buildRetrievalCacheKey,
  buildRewriteCacheKey,
  buildScopeKey,
  type RetrievalCacheKeyOpts,
} from "./cache";

// ---------------------------------------------------------------------------
// Retrieval Pipeline - Phase 2 RAG
// Full pipeline: rewrite → vector → lexical → RRF → rerank → context
// ---------------------------------------------------------------------------

export interface RetrievalOptions {
  /** Max chunks from vector search */
  vectorTopK?: number;
  /** Max chunks from lexical search */
  lexicalTopK?: number;
  /** Final number of chunks after reranking */
  finalTopK?: number;
  /** RRF constant (default 60) */
  rrfK?: number;
  /** Minimum similarity threshold for vector search */
  vectorThreshold?: number;
  /** Enable query rewriting */
  enableRewrite?: boolean;
  /** Enable caching */
  enableCache?: boolean;
  /** Index version for cache invalidation */
  indexVersion?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  cvId: string;
  sectionType: string;
  sectionOrder: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  // Scoring
  vectorScore?: number;
  lexicalScore?: number;
  rrfScore: number;
  finalScore: number;
  // CV context
  candidateName?: string;
  candidateEmail?: string;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  metrics: RetrievalMetrics;
  rewrittenQuery?: RewrittenQuery;
}

export interface RetrievalMetrics {
  rewriteMs: number;
  vectorMs: number;
  lexicalMs: number;
  fusionMs: number;
  rerankMs: number;
  totalMs: number;
  vectorCount: number;
  lexicalCount: number;
  fusedCount: number;
  finalCount: number;
  cacheHit: boolean;
  // Quality metrics (Phase 2)
  emptyResult: boolean;
  lowConfidenceResult: boolean;
  scopeFilterDropCount: number;
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  vectorTopK: 50,
  lexicalTopK: 50,
  finalTopK: 15,
  rrfK: 60,
  vectorThreshold: 0.4,
  enableRewrite: true,
  enableCache: true,
  indexVersion: 1,
};

// ---------------------------------------------------------------------------
// Query Complexity Classification — Dynamic TopK
// ---------------------------------------------------------------------------

type QueryComplexity = "simple" | "medium" | "complex";

interface TopKConfig {
  vectorTopK: number;
  lexicalTopK: number;
  finalTopK: number;
}

const COMPLEXITY_TOPK: Record<QueryComplexity, TopKConfig> = {
  simple: { vectorTopK: 15, lexicalTopK: 15, finalTopK: 8 },
  medium: { vectorTopK: 30, lexicalTopK: 30, finalTopK: 12 },
  complex: { vectorTopK: 50, lexicalTopK: 50, finalTopK: 15 },
};

// Patterns that signal a query is complex enough to justify larger topK + LLM rewrite
const COMPLEXITY_CONSTRAINT_PATTERNS: RegExp[] = [
  /\b\d+\+?\s*(?:years?|ans?|yrs?)\b/i,
  /\b(?:senior|junior|lead|principal|architect|mid[-\s]?level)\b/i,
  /\b(?:french|english|arabic|german|spanish|francais|anglais)\b/i,
  /\b(?:and|with|having|plus|et|avec)\b/i,
];

/**
 * Classify a query's complexity to choose the right topK tier.
 * Only used when the caller has NOT explicitly overridden topK values.
 */
function classifyQueryComplexity(query: string): QueryComplexity {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length <= 2) return "simple";
  const constraintCount = COMPLEXITY_CONSTRAINT_PATTERNS.filter((p) =>
    p.test(query),
  ).length;
  if (words.length >= 7 || constraintCount >= 2) return "complex";
  if (words.length >= 3 || constraintCount >= 1) return "medium";
  return "simple";
}

/**
 * Return the topK configuration for a query.
 * Dynamic values are computed per-query-complexity tier.
 * Only the fields explicitly set by the caller bypass dynamic sizing;
 * unset fields always get the complexity-appropriate value.
 */
function getDynamicTopK(
  query: string,
  userOptions: RetrievalOptions,
): TopKConfig {
  const complexity = classifyQueryComplexity(query);
  const dynamic = COMPLEXITY_TOPK[complexity];
  // Per-field merge: explicit caller value wins; unset fields use dynamic tier value
  return {
    vectorTopK: userOptions.vectorTopK ?? dynamic.vectorTopK,
    lexicalTopK: userOptions.lexicalTopK ?? dynamic.lexicalTopK,
    finalTopK: userOptions.finalTopK ?? dynamic.finalTopK,
  };
}

/**
 * Main retrieval pipeline for RAG.
 */
export async function retrieveChunks(
  query: string,
  scope: RetrievalScope,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  // Resolve index version: use provided or fetch latest
  const currentIndexVersion =
    options.indexVersion ?? (await getLatestIndexVersion());

  // Dynamic topK — auto-selected per query complexity; caller overrides are respected inside getDynamicTopK
  const topKConfig = getDynamicTopK(query, options);

  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    indexVersion: currentIndexVersion,
    ...topKConfig, // wins over DEFAULT_OPTIONS; getDynamicTopK already propagates caller overrides
  };

  const startTime = Date.now();
  const metrics: RetrievalMetrics = {
    rewriteMs: 0,
    vectorMs: 0,
    lexicalMs: 0,
    fusionMs: 0,
    rerankMs: 0,
    totalMs: 0,
    vectorCount: 0,
    lexicalCount: 0,
    fusedCount: 0,
    finalCount: 0,
    cacheHit: false,
    emptyResult: false,
    lowConfidenceResult: false,
    scopeFilterDropCount: 0,
  };

  // Check retrieval cache
  if (opts.enableCache) {
    const scopeKey = buildScopeKey(scope.userId, scope.role);
    const cacheKeyOpts: RetrievalCacheKeyOpts = {
      vectorTopK: opts.vectorTopK,
      lexicalTopK: opts.lexicalTopK,
      finalTopK: opts.finalTopK,
      vectorThreshold: opts.vectorThreshold,
      enableRewrite: opts.enableRewrite,
    };
    const cacheKey = buildRetrievalCacheKey(
      query,
      scopeKey,
      opts.indexVersion,
      cacheKeyOpts,
    );
    const cached = retrievalCache.get(cacheKey) as RetrievalResult | undefined;

    if (cached) {
      metrics.cacheHit = true;
      metrics.totalMs = Date.now() - startTime;
      return { ...cached, metrics };
    }
  }

  // Step 1: Query Rewrite — skipped for simple queries to save latency
  let rewrittenQuery: RewrittenQuery;
  const rewriteStart = Date.now();

  if (opts.enableRewrite && shouldRewriteQuery(query)) {
    // Complex/medium query: worth calling LLM (with timeout + fallback)
    const rewriteCacheKey = buildRewriteCacheKey(query, opts.indexVersion);
    const cachedRewrite = rewriteCache.get(rewriteCacheKey) as
      | RewrittenQuery
      | undefined;

    if (cachedRewrite) {
      rewrittenQuery = cachedRewrite;
    } else {
      rewrittenQuery = await rewriteQueryWithTimeout(query, 3000);
      rewriteCache.set(rewriteCacheKey, rewrittenQuery);
    }
  } else {
    // Fast-path: simple query or rewrite disabled — build structured form directly, no LLM call
    rewrittenQuery = {
      semanticQuery: query,
      lexicalKeywords: extractKeywordsSimple(query),
    };
  }
  metrics.rewriteMs = Date.now() - rewriteStart;

  // Steps 2 + 3: Vector Search + Lexical Search — run in PARALLEL
  // latency ≈ max(vector, lexical) + fusion/rerank  (was: vector + lexical)
  let vectorMs = 0;
  let lexicalMs = 0;

  const [vectorResults, lexicalResults] = await Promise.all([
    (async () => {
      const t = Date.now();
      const r = await vectorSearchChunks(
        rewrittenQuery.semanticQuery,
        scope,
        opts.vectorTopK,
        opts.vectorThreshold,
        opts.enableCache,
        opts.indexVersion,
      );
      vectorMs = Date.now() - t;
      return r;
    })(),
    (async () => {
      const t = Date.now();
      const r = await lexicalSearchChunks(
        rewrittenQuery.lexicalKeywords,
        scope,
        opts.lexicalTopK,
      );
      lexicalMs = Date.now() - t;
      return r;
    })(),
  ]);

  metrics.vectorMs = vectorMs;
  metrics.lexicalMs = lexicalMs;
  metrics.vectorCount = vectorResults.length;
  metrics.lexicalCount = lexicalResults.length;

  // Step 4: RRF Fusion
  const fusionStart = Date.now();
  const fusedResults = rrfFusion(vectorResults, lexicalResults, opts.rrfK);
  metrics.fusionMs = Date.now() - fusionStart;
  metrics.fusedCount = fusedResults.length;

  // Step 5: Rerank
  const rerankStart = Date.now();
  const rerankedResults = scoringRerank(fusedResults);
  const finalResults = rerankedResults.slice(0, opts.finalTopK);
  metrics.rerankMs = Date.now() - rerankStart;
  metrics.finalCount = finalResults.length;

  metrics.totalMs = Date.now() - startTime;

  // Quality metrics
  metrics.emptyResult = finalResults.length === 0;
  metrics.lowConfidenceResult =
    finalResults.length > 0 && finalResults[0].finalScore < 0.3;
  // scopeFilterDropCount is updated during vector/lexical search stages

  // Observability logging
  logRetrievalMetrics(query, scope, metrics);

  const result: RetrievalResult = {
    chunks: finalResults,
    metrics,
    rewrittenQuery,
  };

  // Cache the result
  if (opts.enableCache) {
    const scopeKey = buildScopeKey(scope.userId, scope.role);
    const cacheKeyOpts: RetrievalCacheKeyOpts = {
      vectorTopK: opts.vectorTopK,
      lexicalTopK: opts.lexicalTopK,
      finalTopK: opts.finalTopK,
      vectorThreshold: opts.vectorThreshold,
      enableRewrite: opts.enableRewrite,
    };
    const cacheKey = buildRetrievalCacheKey(
      query,
      scopeKey,
      opts.indexVersion,
      cacheKeyOpts,
    );
    retrievalCache.set(cacheKey, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Vector Search
// ---------------------------------------------------------------------------

interface VectorSearchResult {
  chunkId: string;
  cvId: string;
  sectionType: string;
  sectionOrder: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  distance: number;
  candidateName?: string;
  candidateEmail?: string;
}

async function vectorSearchChunks(
  query: string,
  scope: RetrievalScope,
  limit: number,
  threshold: number,
  enableCache: boolean,
  indexVersion: number,
): Promise<VectorSearchResult[]> {
  // Get or generate query embedding
  let queryEmbedding: number[] | null = null;
  const scopeKey = buildScopeKey(scope.userId, scope.role);

  if (enableCache) {
    const cacheKey = buildEmbeddingCacheKey(
      query,
      "nvidia-e5-v5",
      scopeKey,
      indexVersion,
    );
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
      queryEmbedding = cached;
    }
  }

  if (!queryEmbedding) {
    queryEmbedding = await generateTextEmbedding(query, "query");
    if (!queryEmbedding) {
      console.warn("[retrieval] Failed to generate query embedding");
      return [];
    }

    if (enableCache) {
      const cacheKey = buildEmbeddingCacheKey(
        query,
        "nvidia-e5-v5",
        scopeKey,
        indexVersion,
      );
      embeddingCache.set(cacheKey, queryEmbedding);
    }
  }

  const embeddingStr = JSON.stringify(queryEmbedding);
  const distance = sql<number>`(${cvChunks.embedding} <=> ${embeddingStr}::vector)`;

  // Build scope-aware WHERE clause
  const baseCondition = sql`${cvChunks.embedding} IS NOT NULL AND (${cvChunks.embedding} <=> ${embeddingStr}::vector) < ${threshold}`;
  const scopeCondition =
    scope.role !== "admin"
      ? sql`${baseCondition} AND ${cvChunks.uploadedBy} = ${scope.userId}`
      : baseCondition;

  const results = await db
    .select({
      chunkId: cvChunks.id,
      cvId: cvChunks.cvId,
      sectionType: cvChunks.sectionType,
      sectionOrder: cvChunks.sectionOrder,
      chunkText: cvChunks.chunkText,
      tokenEstimate: cvChunks.tokenEstimate,
      metadata: cvChunks.metadata,
      distance,
      candidateName: cvPool.extractedName,
      candidateEmail: cvPool.extractedEmail,
    })
    .from(cvChunks)
    .leftJoin(cvPool, eq(cvChunks.cvId, cvPool.id))
    .where(scopeCondition)
    .orderBy(asc(distance))
    .limit(limit);

  return results.map((r) => ({
    ...r,
    sectionType: r.sectionType ?? "unknown",
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    distance: Number(r.distance),
    candidateName: r.candidateName ?? undefined,
    candidateEmail: r.candidateEmail ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Lexical Search (PostgreSQL Full-Text Search with tsvector/GIN)
// ---------------------------------------------------------------------------

interface LexicalSearchResult {
  chunkId: string;
  cvId: string;
  sectionType: string;
  sectionOrder: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  ftsRank: number;
  candidateName?: string;
  candidateEmail?: string;
}

/**
 * Perform lexical search using PostgreSQL full-text search.
 * Uses websearch_to_tsquery for natural language queries and ts_rank_cd for ranking.
 */
async function lexicalSearchChunks(
  keywords: string[],
  scope: RetrievalScope,
  limit: number,
): Promise<LexicalSearchResult[]> {
  if (keywords.length === 0) return [];

  // Combine keywords into a search query string
  // websearch_to_tsquery handles this robustly (supports phrases, OR, NOT)
  const searchQuery = keywords.join(" ");

  // Build scope condition
  const scopeCondition =
    scope.role !== "admin"
      ? sql`c.uploaded_by = ${scope.userId}`
      : sql`TRUE`;

  // Use websearch_to_tsquery for user-friendly syntax
  // ts_rank_cd provides proximity-aware ranking with normalization
  const results = await db.execute<{
    chunk_id: string;
    cv_id: string;
    section_type: string;
    section_order: number;
    chunk_text: string;
    token_estimate: number;
    metadata: Record<string, unknown>;
    fts_rank: number;
    candidate_name: string | null;
    candidate_email: string | null;
  }>(sql`
    SELECT
      c.id AS chunk_id,
      c.cv_id,
      c.section_type,
      c.section_order,
      c.chunk_text,
      c.token_estimate,
      c.metadata,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${searchQuery}), 32) AS fts_rank,
      cv.extracted_name AS candidate_name,
      cv.extracted_email AS candidate_email
    FROM cv_chunks c
    LEFT JOIN cv_pool cv ON c.cv_id = cv.id
    WHERE c.search_vector @@ websearch_to_tsquery('english', ${searchQuery})
      AND ${scopeCondition}
    ORDER BY fts_rank DESC
    LIMIT ${limit}
  `);

  return results.rows.map((r) => ({
    chunkId: r.chunk_id,
    cvId: r.cv_id,
    sectionType: r.section_type ?? "unknown",
    sectionOrder: r.section_order,
    chunkText: r.chunk_text,
    tokenEstimate: r.token_estimate,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    ftsRank: Number(r.fts_rank),
    candidateName: r.candidate_name ?? undefined,
    candidateEmail: r.candidate_email ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// RRF Fusion
// ---------------------------------------------------------------------------

interface FusedResult {
  chunkId: string;
  cvId: string;
  sectionType: string;
  sectionOrder: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  vectorScore?: number;
  lexicalScore?: number;
  rrfScore: number;
  candidateName?: string;
  candidateEmail?: string;
}

function rrfFusion(
  vectorResults: VectorSearchResult[],
  lexicalResults: LexicalSearchResult[],
  k: number,
): FusedResult[] {
  const scores = new Map<string, FusedResult>();

  // Process vector results
  vectorResults.forEach((result, rank) => {
    const rrfContribution = 1 / (k + rank + 1);
    const vectorScore = 1 - result.distance; // Convert distance to similarity

    scores.set(result.chunkId, {
      chunkId: result.chunkId,
      cvId: result.cvId,
      sectionType: result.sectionType,
      sectionOrder: result.sectionOrder,
      chunkText: result.chunkText,
      tokenEstimate: result.tokenEstimate,
      metadata: result.metadata,
      vectorScore,
      rrfScore: rrfContribution,
      candidateName: result.candidateName,
      candidateEmail: result.candidateEmail,
    });
  });

  // Process lexical results
  lexicalResults.forEach((result, rank) => {
    const rrfContribution = 1 / (k + rank + 1);
    // ftsRank is already normalized to [0, 1] with flag 32
    const lexicalScore = result.ftsRank;

    const existing = scores.get(result.chunkId);
    if (existing) {
      existing.lexicalScore = lexicalScore;
      existing.rrfScore += rrfContribution;
    } else {
      scores.set(result.chunkId, {
        chunkId: result.chunkId,
        cvId: result.cvId,
        sectionType: result.sectionType,
        sectionOrder: result.sectionOrder,
        chunkText: result.chunkText,
        tokenEstimate: result.tokenEstimate,
        metadata: result.metadata,
        lexicalScore,
        rrfScore: rrfContribution,
        candidateName: result.candidateName,
        candidateEmail: result.candidateEmail,
      });
    }
  });

  // Sort by RRF score
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

// ---------------------------------------------------------------------------
// Scoring-based Rerank
// ---------------------------------------------------------------------------

function scoringRerank(fusedResults: FusedResult[]): RetrievedChunk[] {
  // Weight configuration
  const VECTOR_WEIGHT = 0.5;
  const LEXICAL_WEIGHT = 0.3;
  const RRF_WEIGHT = 0.2;

  // Section type boost (skills and experience are most valuable)
  const sectionBoost: Record<string, number> = {
    skills: 1.2,
    experience: 1.1,
    summary: 1.0,
    education: 0.9,
    languages: 0.8,
  };

  return fusedResults
    .map((result) => {
      const vectorComponent = (result.vectorScore ?? 0) * VECTOR_WEIGHT;
      const lexicalComponent = (result.lexicalScore ?? 0) * LEXICAL_WEIGHT;
      const rrfComponent = result.rrfScore * RRF_WEIGHT * 10; // Scale up RRF

      const baseScore = vectorComponent + lexicalComponent + rrfComponent;
      const boost = sectionBoost[result.sectionType] ?? 1.0;
      const finalScore = baseScore * boost;

      return {
        chunkId: result.chunkId,
        cvId: result.cvId,
        sectionType: result.sectionType,
        sectionOrder: result.sectionOrder,
        chunkText: result.chunkText,
        tokenEstimate: result.tokenEstimate,
        metadata: result.metadata,
        vectorScore: result.vectorScore,
        lexicalScore: result.lexicalScore,
        rrfScore: result.rrfScore,
        finalScore,
        candidateName: result.candidateName,
        candidateEmail: result.candidateEmail,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

// ---------------------------------------------------------------------------
// Context Assembly
// ---------------------------------------------------------------------------

export interface AssembledContext {
  text: string;
  totalTokens: number;
  chunkCount: number;
  cvCount: number;
  citations: Array<{
    cvId: string;
    candidateName: string;
    sections: string[];
  }>;
}

/**
 * Assemble retrieved chunks into a context string for the LLM.
 */
export function assembleContext(
  chunks: RetrievedChunk[],
  maxTokens: number = 6000,
): AssembledContext {
  const selectedChunks: RetrievedChunk[] = [];
  let totalTokens = 0;

  // Select chunks up to token limit
  for (const chunk of chunks) {
    if (totalTokens + chunk.tokenEstimate > maxTokens) break;
    selectedChunks.push(chunk);
    totalTokens += chunk.tokenEstimate;
  }

  // Group by CV for citations
  const cvGroups = new Map<string, { name: string; sections: Set<string> }>();
  for (const chunk of selectedChunks) {
    const existing = cvGroups.get(chunk.cvId);
    if (existing) {
      existing.sections.add(chunk.sectionType);
    } else {
      cvGroups.set(chunk.cvId, {
        name: chunk.candidateName ?? "Unknown",
        sections: new Set([chunk.sectionType]),
      });
    }
  }

  // Build context text
  const contextParts: string[] = [];
  for (const chunk of selectedChunks) {
    contextParts.push(
      `[${chunk.candidateName ?? "CV"}/${chunk.sectionType}]: ${chunk.chunkText}`,
    );
  }

  return {
    text: contextParts.join("\n\n"),
    totalTokens,
    chunkCount: selectedChunks.length,
    cvCount: cvGroups.size,
    citations: Array.from(cvGroups.entries()).map(([cvId, data]) => ({
      cvId,
      candidateName: data.name,
      sections: Array.from(data.sections),
    })),
  };
}

// ---------------------------------------------------------------------------
// Observability Logging
// ---------------------------------------------------------------------------

/**
 * Log retrieval metrics for observability.
 * Logs stage latencies, quality indicators, and warnings.
 */
function logRetrievalMetrics(
  query: string,
  scope: RetrievalScope,
  metrics: RetrievalMetrics,
): void {
  const truncatedQuery = query.length > 50 ? `${query.slice(0, 50)}...` : query;
  const scopeType =
    scope.role === "admin" ? "global" : `user:${scope.userId.slice(0, 8)}`;

  // Stage latency logging
  console.info(
    `[retrieval] query="${truncatedQuery}" scope=${scopeType} ` +
      `total=${metrics.totalMs}ms ` +
      `[rewrite=${metrics.rewriteMs}ms vector=${metrics.vectorMs}ms ` +
      `lexical=${metrics.lexicalMs}ms fusion=${metrics.fusionMs}ms rerank=${metrics.rerankMs}ms] ` +
      `results: vector=${metrics.vectorCount} lexical=${metrics.lexicalCount} ` +
      `fused=${metrics.fusedCount} final=${metrics.finalCount} ` +
      `cache=${metrics.cacheHit ? "HIT" : "MISS"}`,
  );

  // Quality warnings
  if (metrics.emptyResult) {
    console.warn(
      `[retrieval] EMPTY_RESULT query="${truncatedQuery}" - no chunks retrieved`,
    );
  }

  if (metrics.lowConfidenceResult) {
    console.warn(
      `[retrieval] LOW_CONFIDENCE query="${truncatedQuery}" - top result score < 0.3`,
    );
  }

  if (metrics.scopeFilterDropCount > 0) {
    console.info(
      `[retrieval] SCOPE_FILTER dropped ${metrics.scopeFilterDropCount} chunks due to scope restrictions`,
    );
  }

  // Latency warnings (thresholds)
  const LATENCY_WARN_MS = 2000;
  const VECTOR_WARN_MS = 500;
  const LEXICAL_WARN_MS = 300;

  if (metrics.totalMs > LATENCY_WARN_MS) {
    console.warn(
      `[retrieval] SLOW_RETRIEVAL total=${metrics.totalMs}ms exceeds ${LATENCY_WARN_MS}ms threshold`,
    );
  }

  if (metrics.vectorMs > VECTOR_WARN_MS) {
    console.warn(
      `[retrieval] SLOW_VECTOR vectorMs=${metrics.vectorMs}ms exceeds ${VECTOR_WARN_MS}ms threshold`,
    );
  }

  if (metrics.lexicalMs > LEXICAL_WARN_MS) {
    console.warn(
      `[retrieval] SLOW_LEXICAL lexicalMs=${metrics.lexicalMs}ms exceeds ${LEXICAL_WARN_MS}ms threshold`,
    );
  }
}
