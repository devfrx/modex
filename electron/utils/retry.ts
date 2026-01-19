/**
 * Retry utilities with exponential backoff for network operations
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Custom retry condition - return true to retry (default: retry on any error) */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Called before each retry attempt */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is likely a transient network error that should be retried
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('network') || 
      message.includes('timeout') || 
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')) {
    return true;
  }
  
  // HTTP status codes that might be transient
  if (message.includes('429') || // Too Many Requests
      message.includes('500') || // Internal Server Error
      message.includes('502') || // Bad Gateway
      message.includes('503') || // Service Unavailable
      message.includes('504')) { // Gateway Timeout
    return true;
  }
  
  return false;
}

/**
 * Execute an async function with retry and exponential backoff
 * 
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    initialDelay = DEFAULT_OPTIONS.initialDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if we've exhausted attempts
      if (attempt > maxRetries) {
        break;
      }
      
      // Check if we should retry this error
      if (!shouldRetry(lastError, attempt)) {
        throw lastError;
      }
      
      // Notify caller about retry
      onRetry?.(lastError, attempt, delay);
      
      // Wait before retrying
      await sleep(delay);
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Promise-based sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout wrapper for async operations
 * 
 * @example
 * ```ts
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   30000,
 *   'API request timed out'
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${errorMessage} after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Batch execute with concurrency limit and error handling
 * 
 * @example
 * ```ts
 * const results = await batchExecute(
 *   urls,
 *   async (url) => fetch(url),
 *   { concurrency: 5, continueOnError: true }
 * );
 * ```
 */
export interface BatchResult<T> {
  success: T[];
  errors: Array<{ item: unknown; error: Error }>;
}

export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: {
    concurrency?: number;
    continueOnError?: boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<BatchResult<R>> {
  const { concurrency = 5, continueOnError = false, onProgress } = options;
  
  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];
  let completed = 0;
  
  // Process items in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item, batchIndex) => {
      const index = i + batchIndex;
      try {
        const result = await fn(item, index);
        results.push(result);
      } catch (error) {
        errors.push({ item, error: error as Error });
        if (!continueOnError) {
          throw error;
        }
      } finally {
        completed++;
        onProgress?.(completed, items.length);
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  return { success: results, errors };
}
