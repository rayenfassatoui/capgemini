// ---------------------------------------------------------------------------
// TTL Cache Service - Phase 2 RAG
// Simple in-memory cache with TTL for embeddings and retrieval results
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple TTL-based in-memory cache.
 * Suitable for single-instance deployments.
 */
export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;

  // Metrics
  private hits = 0;
  private misses = 0;
  private staleInvalidations = 0;

  constructor(options: { defaultTtlMs: number; maxSize?: number }) {
    this.defaultTtlMs = options.defaultTtlMs;
    this.maxSize = options.maxSize ?? 10000;
  }

  /**
   * Get a value from the cache.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      this.staleInvalidations++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache.
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const keysToDelete: string[] = [];
      const now = Date.now();

      // First, remove expired entries
      for (const [k, entry] of this.cache) {
        if (now > entry.expiresAt) {
          keysToDelete.push(k);
        }
      }

      // If still at capacity, remove oldest 10%
      if (this.cache.size - keysToDelete.length >= this.maxSize) {
        const toRemove = Math.ceil(this.maxSize * 0.1);
        let removed = 0;
        for (const k of this.cache.keys()) {
          if (removed >= toRemove) break;
          if (!keysToDelete.includes(k)) {
            keysToDelete.push(k);
            removed++;
          }
        }
      }

      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix.
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache metrics.
   */
  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      staleInvalidations: this.staleInvalidations,
    };
  }

  /**
   * Reset metrics (useful for periodic reporting).
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.staleInvalidations = 0;
  }
}

export interface CacheMetrics {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  staleInvalidations: number;
}

// ---------------------------------------------------------------------------
// Global Cache Instances
// ---------------------------------------------------------------------------

// Embedding cache: longer TTL (24 hours) - embeddings rarely change
export const embeddingCache = new TtlCache<number[]>({
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxSize: 5000,
});

// Retrieval cache: shorter TTL (5 minutes) - results may change with new CVs
export const retrievalCache = new TtlCache<unknown>({
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000,
});

// Query rewrite cache: medium TTL (1 hour) - rewrites are deterministic
export const rewriteCache = new TtlCache<unknown>({
  defaultTtlMs: 60 * 60 * 1000, // 1 hour
  maxSize: 2000,
});

// ---------------------------------------------------------------------------
// Cache Key Builders
// ---------------------------------------------------------------------------

/**
 * Build a cache key for query embeddings.
 * Includes scope to prevent cross-user cache pollution.
 */
export function buildEmbeddingCacheKey(
  query: string,
  model: string,
  scopeKey: string,
  indexVersion: number,
): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  return `emb:${hashString(normalized)}:${model}:${scopeKey}:v${indexVersion}`;
}

export interface RetrievalCacheKeyOpts {
  vectorTopK: number;
  lexicalTopK: number;
  finalTopK: number;
  vectorThreshold: number;
  enableRewrite: boolean;
}

/**
 * Build a cache key for retrieval results.
 * Includes topK limits, threshold, and rewrite mode so that different
 * retrieval configurations never share the same cached result.
 */
export function buildRetrievalCacheKey(
  query: string,
  scopeKey: string,
  indexVersion: number,
  opts: RetrievalCacheKeyOpts,
): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  // Encode every dimension that affects retrieval output into the key.
  // Using a deterministic string instead of JSON.stringify keeps the hash stable.
  const optsHash = hashString(
    `vk${opts.vectorTopK}lk${opts.lexicalTopK}fk${opts.finalTopK}th${opts.vectorThreshold}rw${opts.enableRewrite ? 1 : 0}`,
  );
  return `ret:${hashString(normalized)}:${optsHash}:${scopeKey}:v${indexVersion}`;
}

/**
 * Build a scope key for cache partitioning.
 */
export function buildScopeKey(userId: string, role: string): string {
  return role === "admin" ? "global" : `user:${userId}`;
}

/**
 * Build a cache key for query rewrite results.
 */
export function buildRewriteCacheKey(
  query: string,
  indexVersion: number,
): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  return `rw:${hashString(normalized)}:v${indexVersion}`;
}

/**
 * Simple string hash for cache keys.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Cache Invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate all caches for a specific CV.
 * Call this when a CV is updated or re-indexed.
 */
export function invalidateCvCaches(cvId: string): void {
  // Retrieval cache entries might contain this CV
  // Since we can't easily identify them, clear all retrieval cache
  retrievalCache.clear();

  console.log(`[cache] Invalidated caches for CV: ${cvId}`);
}

/**
 * Invalidate all caches (e.g., after bulk re-indexing).
 */
export function invalidateAllCaches(): void {
  embeddingCache.clear();
  retrievalCache.clear();
  rewriteCache.clear();

  console.log("[cache] All caches invalidated");
}

/**
 * Get combined metrics from all caches.
 */
export function getAllCacheMetrics(): Record<string, CacheMetrics> {
  return {
    embedding: embeddingCache.getMetrics(),
    retrieval: retrievalCache.getMetrics(),
    rewrite: rewriteCache.getMetrics(),
  };
}
