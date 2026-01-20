/**
 * Lock utilities with timeout support to prevent deadlocks
 * 
 * Provides queue-based locking mechanisms with configurable timeouts
 * to ensure operations don't hang indefinitely.
 */

import { FILE_LOCK_TIMEOUT, MODPACK_LOCK_TIMEOUT } from "../config/constants";

export interface LockOptions {
  /** Timeout in milliseconds (default: 30000 = 30 seconds) */
  timeout?: number;
  /** Name for debugging purposes */
  name?: string;
}

export class LockTimeoutError extends Error {
  constructor(lockName: string, timeoutMs: number) {
    super(`Lock acquisition timed out for "${lockName}" after ${timeoutMs}ms`);
    this.name = 'LockTimeoutError';
  }
}

/**
 * A lock manager that provides queue-based locking with timeout support.
 * Each lock is identified by a string key.
 */
export class LockManager {
  private lockQueues: Map<string, Array<{ resolve: (release: () => void) => void; reject: (error: Error) => void }>> = new Map();
  private activeLocks: Set<string> = new Set();
  private defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Acquire a lock with optional timeout
   * Returns a release function that must be called when done
   * @throws {LockTimeoutError} if timeout is exceeded
   */
  async acquire(key: string, options: LockOptions = {}): Promise<() => void> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const lockName = options.name ?? key;

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const tryAcquire = () => {
        if (resolved) return;

        if (!this.activeLocks.has(key)) {
          // Lock is free, acquire it
          resolved = true;
          cleanup();
          this.activeLocks.add(key);
          
          resolve(() => {
            this.activeLocks.delete(key);
            // Process next waiter in queue
            const queue = this.lockQueues.get(key);
            if (queue && queue.length > 0) {
              const next = queue.shift()!;
              if (queue.length === 0) {
                this.lockQueues.delete(key);
              }
              // Trigger next waiter on next tick to avoid stack overflow
              setImmediate(() => {
                if (!resolved) {
                  tryAcquire.call({ resolve: next.resolve, reject: next.reject });
                } else {
                  // Re-attempt acquisition for the next waiter
                  this.activeLocks.delete(key); // Make sure lock is released
                  next.resolve(this.createReleaseFunction(key));
                }
              });
            }
          });
        } else {
          // Lock is held, add to queue
          let queue = this.lockQueues.get(key);
          if (!queue) {
            queue = [];
            this.lockQueues.set(key, queue);
          }
          queue.push({ resolve: (release) => { resolved = true; cleanup(); resolve(release); }, reject });
        }
      };

      // Set timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            // Remove from queue if present
            const queue = this.lockQueues.get(key);
            if (queue) {
              const index = queue.findIndex(item => item.reject === reject);
              if (index !== -1) {
                queue.splice(index, 1);
              }
              if (queue.length === 0) {
                this.lockQueues.delete(key);
              }
            }
            reject(new LockTimeoutError(lockName, timeout));
          }
        }, timeout);
      }

      tryAcquire();
    });
  }

  private createReleaseFunction(key: string): () => void {
    return () => {
      this.activeLocks.delete(key);
      const queue = this.lockQueues.get(key);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (queue.length === 0) {
          this.lockQueues.delete(key);
        }
        this.activeLocks.add(key);
        next.resolve(this.createReleaseFunction(key));
      }
    };
  }

  /**
   * Execute an operation with a lock
   * Automatically acquires and releases the lock
   */
  async withLock<T>(key: string, operation: () => Promise<T>, options: LockOptions = {}): Promise<T> {
    const release = await this.acquire(key, options);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Check if a lock is currently held
   */
  isLocked(key: string): boolean {
    return this.activeLocks.has(key);
  }

  /**
   * Get the number of waiters for a lock
   */
  getQueueLength(key: string): number {
    return this.lockQueues.get(key)?.length ?? 0;
  }

  /**
   * Force release all locks (use with caution, mainly for cleanup)
   */
  releaseAll(): void {
    this.activeLocks.clear();
    for (const [key, queue] of this.lockQueues) {
      for (const waiter of queue) {
        waiter.reject(new Error(`Lock "${key}" was forcibly released`));
      }
    }
    this.lockQueues.clear();
  }
}

// Global lock managers for different purposes
export const fileLockManager = new LockManager(FILE_LOCK_TIMEOUT);
export const modpackLockManager = new LockManager(MODPACK_LOCK_TIMEOUT);
