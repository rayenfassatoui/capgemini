export class SlidingWindowRateLimiter {
  private requests: Map<string, number[]>

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {
    this.requests = new Map()
  }

  isAllowed(key: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Get existing timestamps for this key
    const timestamps = this.requests.get(key) ?? []

    // Filter to keep only timestamps within the current window
    const validTimestamps = timestamps.filter((ts) => ts > windowStart)

    // Check if we can allow this request
    if (validTimestamps.length < this.maxRequests) {
      validTimestamps.push(now)
      this.requests.set(key, validTimestamps)
      return true
    }

    // Update map with filtered timestamps (without pushing new one)
    this.requests.set(key, validTimestamps)
    return false
  }

  reset(key?: string): void {
    if (key !== undefined) {
      this.requests.delete(key)
    } else {
      this.requests.clear()
    }
  }
}
