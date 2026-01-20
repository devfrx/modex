/**
 * Rate Limiter using Token Bucket algorithm
 * 
 * Provides configurable rate limiting for API calls to prevent
 * overwhelming external services.
 */

import { CURSEFORGE_RATE_LIMIT, GIST_RATE_LIMIT } from "../config/constants";

export interface RateLimiterOptions {
  /** Maximum number of tokens (burst capacity) */
  maxTokens: number;
  /** Tokens refilled per second */
  refillRate: number;
  /** Initial tokens (defaults to maxTokens) */
  initialTokens?: number;
}

/**
 * Token Bucket rate limiter implementation
 * 
 * @example
 * ```ts
 * const limiter = new RateLimiter({ maxTokens: 10, refillRate: 2 });
 * 
 * // Before making API call
 * await limiter.acquire();
 * const result = await fetch('https://api.example.com/data');
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefillTime: number;
  private waitQueue: Array<{ resolve: () => void; tokens: number }> = [];

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxTokens;
    this.refillRate = options.refillRate;
    this.tokens = options.initialTokens ?? options.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Process waiting requests if tokens are available
   */
  private processQueue(): void {
    while (this.waitQueue.length > 0) {
      this.refill();
      const next = this.waitQueue[0];
      
      if (this.tokens >= next.tokens) {
        this.tokens -= next.tokens;
        this.waitQueue.shift();
        next.resolve();
      } else {
        // Not enough tokens yet, schedule next check
        const tokensNeeded = next.tokens - this.tokens;
        const waitTime = (tokensNeeded / this.refillRate) * 1000;
        setTimeout(() => this.processQueue(), waitTime);
        break;
      }
    }
  }

  /**
   * Acquire tokens (waits if necessary)
   * @param tokens Number of tokens to acquire (default: 1)
   */
  async acquire(tokens: number = 1): Promise<void> {
    if (tokens > this.maxTokens) {
      throw new Error(`Cannot acquire ${tokens} tokens (max: ${this.maxTokens})`);
    }

    this.refill();

    if (this.tokens >= tokens && this.waitQueue.length === 0) {
      // Tokens available and no one waiting
      this.tokens -= tokens;
      return;
    }

    // Need to wait
    return new Promise((resolve) => {
      this.waitQueue.push({ resolve, tokens });
      this.processQueue();
    });
  }

  /**
   * Try to acquire tokens without waiting
   * @returns true if tokens were acquired, false otherwise
   */
  tryAcquire(tokens: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get estimated wait time in milliseconds
   */
  getEstimatedWaitTime(tokens: number = 1): number {
    this.refill();
    
    if (this.tokens >= tokens) {
      return 0;
    }
    
    const tokensNeeded = tokens - this.tokens;
    return (tokensNeeded / this.refillRate) * 1000;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, tokens: number = 1): Promise<T> {
    await this.acquire(tokens);
    return fn();
  }
}

/**
 * Decorator-style rate limiting for batch operations
 */
export async function withRateLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limiter: RateLimiter,
  options: {
    tokensPerItem?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const { tokensPerItem = 1, onProgress } = options;
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    await limiter.acquire(tokensPerItem);
    const result = await fn(items[i], i);
    results.push(result);
    onProgress?.(i + 1, items.length);
  }

  return results;
}

// ==================== PRE-CONFIGURED RATE LIMITERS ====================

/**
 * Rate limiter for CurseForge API
 * Default: 120 requests per minute = 2 requests per second
 */
export const curseForgeRateLimiter = new RateLimiter({
  maxTokens: Math.ceil(CURSEFORGE_RATE_LIMIT / 6), // ~20 token burst
  refillRate: CURSEFORGE_RATE_LIMIT / 60, // requests per second
});

/**
 * Rate limiter for GitHub Gist API
 * Default: 30 requests per hour
 */
export const gistRateLimiter = new RateLimiter({
  maxTokens: 5, // Small burst
  refillRate: GIST_RATE_LIMIT / 3600, // requests per second
});
