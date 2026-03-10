/**
 * Sliding Window Rate Limiter (In-Memory)
 *
 * Tracks request timestamps per key inside a sliding time window.
 * Includes automatic stale-entry cleanup so the Map never grows unbounded.
 */

interface RateLimitEntry {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private lastGlobalCleanup = Date.now();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    /** How often (ms) to run a full sweep of stale entries. Default: 5 min */
    private readonly cleanupIntervalMs: number = 300_000
  ) {}

  /**
   * Check whether a request from `key` is allowed.
   * If allowed, the request is recorded and `true` is returned.
   * If denied, `false` is returned and nothing is recorded.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();

    // Periodically purge all stale entries across the entire map
    this.maybeCleanup(now);

    const windowStart = now - this.windowMs;
    const entry = this.store.get(key);

    if (!entry) {
      // First request from this key
      this.store.set(key, { timestamps: [now] });
      return true;
    }

    // Prune timestamps that fell out of the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  /** Returns how many requests remain for `key` in the current window. */
  remaining(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entry = this.store.get(key);
    if (!entry) return this.maxRequests;
    const active = entry.timestamps.filter((t) => t > windowStart).length;
    return Math.max(0, this.maxRequests - active);
  }

  /** Manually reset one key or the entire store. */
  reset(key?: string): void {
    if (key !== undefined) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  // ---- Internal ----

  /**
   * Sweep the entire map and delete entries whose timestamps
   * have all expired. Runs at most once per `cleanupIntervalMs`.
   */
  private maybeCleanup(now: number): void {
    if (now - this.lastGlobalCleanup < this.cleanupIntervalMs) return;
    this.lastGlobalCleanup = now;

    const windowStart = now - this.windowMs;
    for (const [key, entry] of this.store) {
      // If every timestamp is outside the window, the entry is stale
      const hasActive = entry.timestamps.some((t) => t > windowStart);
      if (!hasActive) {
        this.store.delete(key);
      }
    }
  }
}
