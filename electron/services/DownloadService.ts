/**
 * Download Service - Optimized file downloads with streaming and progress
 * 
 * Features:
 * - Streaming downloads (low memory usage)
 * - Progress callbacks with speed calculation
 * - Retry logic with exponential backoff
 * - Parallel download support
 * - Abort controller support
 */

import * as fs from "fs-extra";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createLogger } from "./LoggerService.js";

const log = createLogger("Download");

// ==================== TYPES ====================

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
}

export interface DownloadOptions {
  /** Progress callback for tracking download progress */
  onProgress?: (progress: DownloadProgress) => void;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Initial retry delay in ms (doubles on each retry) */
  retryDelay?: number;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
  /** Custom headers to include in the request */
  headers?: Record<string, string>;
  /** Timeout in ms for the initial connection */
  timeout?: number;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  bytesDownloaded: number;
  durationMs: number;
}

// ==================== SERVICE ====================

export class DownloadService {
  private readonly defaultRetries = 3;
  private readonly defaultRetryDelay = 1000;
  private readonly defaultTimeout = 30000;

  /**
   * Download a file with streaming and progress tracking
   */
  async downloadFile(
    url: string,
    destPath: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const {
      onProgress,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      signal,
      headers = {},
      timeout = this.defaultTimeout,
    } = options;

    const startTime = Date.now();
    let bytesDownloaded = 0;
    let lastProgressTime = startTime;
    let lastBytes = 0;

    // Ensure directory exists
    await fs.ensureDir(path.dirname(destPath));

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Create abort controller with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Combine signals if one was provided
        if (signal) {
          signal.addEventListener("abort", () => controller.abort());
        }

        const response = await fetch(url, {
          headers: {
            "User-Agent": "Modex/1.0",
            ...headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const totalBytes = parseInt(response.headers.get("content-length") || "0", 10);
        bytesDownloaded = 0;

        // Create write stream
        const writeStream = fs.createWriteStream(destPath);

        // Get response body as stream
        if (!response.body) {
          throw new Error("Response body is null");
        }

        // Convert web stream to Node.js readable stream
        const reader = response.body.getReader();
        const nodeStream = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
              } else {
                bytesDownloaded += value.length;
                
                // Calculate progress
                if (onProgress) {
                  const now = Date.now();
                  const elapsed = now - lastProgressTime;
                  
                  // Update speed every 500ms
                  if (elapsed >= 500) {
                    const bytesPerSecond = ((bytesDownloaded - lastBytes) / elapsed) * 1000;
                    const remaining = totalBytes - bytesDownloaded;
                    const eta = bytesPerSecond > 0 ? remaining / bytesPerSecond : 0;
                    
                    onProgress({
                      downloadedBytes: bytesDownloaded,
                      totalBytes,
                      percentage: totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0,
                      speed: bytesPerSecond,
                      eta,
                    });
                    
                    lastProgressTime = now;
                    lastBytes = bytesDownloaded;
                  }
                }
                
                this.push(value);
              }
            } catch (err) {
              this.destroy(err as Error);
            }
          },
        });

        // Pipe the stream to file
        await pipeline(nodeStream, writeStream);

        return {
          success: true,
          filePath: destPath,
          bytesDownloaded,
          durationMs: Date.now() - startTime,
        };
      } catch (error: any) {
        log.error(`Attempt ${attempt + 1} failed:`, error.message);

        // Don't retry on abort
        if (error.name === "AbortError") {
          return {
            success: false,
            error: "Download cancelled",
            bytesDownloaded,
            durationMs: Date.now() - startTime,
          };
        }

        // Retry with exponential backoff
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          log.info(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Clean up failed download
          try {
            await fs.remove(destPath);
          } catch {
            // Ignore cleanup errors - file may not exist or already be removed
          }

          return {
            success: false,
            error: error.message,
            bytesDownloaded,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    return {
      success: false,
      error: "Max retries exceeded",
      bytesDownloaded,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Download a file directly to memory (for small files)
   * More efficient than streaming for files under ~10MB
   */
  async downloadToBuffer(
    url: string,
    options: Omit<DownloadOptions, "onProgress"> = {}
  ): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    const {
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      signal,
      headers = {},
      timeout = this.defaultTimeout,
    } = options;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        if (signal) {
          signal.addEventListener("abort", () => controller.abort());
        }

        const response = await fetch(url, {
          headers: {
            "User-Agent": "Modex/1.0",
            ...headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return {
          success: true,
          buffer: Buffer.from(arrayBuffer),
        };
      } catch (error: any) {
        if (error.name === "AbortError") {
          return { success: false, error: "Download cancelled" };
        }

        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          return { success: false, error: error.message };
        }
      }
    }

    return { success: false, error: "Max retries exceeded" };
  }

  /**
   * Download multiple files in parallel with a concurrency limit
   */
  async downloadMultiple<T extends { url: string; destPath: string }>(
    downloads: T[],
    options: DownloadOptions & {
      concurrency?: number;
      onFileProgress?: (index: number, filename: string, progress: DownloadProgress) => void;
      onFileComplete?: (index: number, filename: string, success: boolean) => void;
    } = {}
  ): Promise<{ results: DownloadResult[]; successful: number; failed: number }> {
    const { concurrency = 5, onFileProgress, onFileComplete, ...downloadOptions } = options;
    const results: DownloadResult[] = new Array(downloads.length);
    const executing: Promise<void>[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < downloads.length; i++) {
      const download = downloads[i];
      const filename = path.basename(download.destPath);

      const task = this.downloadFile(download.url, download.destPath, {
        ...downloadOptions,
        onProgress: onFileProgress
          ? (progress) => onFileProgress(i, filename, progress)
          : undefined,
      }).then((result) => {
        results[i] = result;
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
        onFileComplete?.(i, filename, result.success);
      });

      executing.push(task);

      // Limit concurrency
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // Remove completed tasks
        for (let j = executing.length - 1; j >= 0; j--) {
          const status = await Promise.race([
            executing[j].then(() => "fulfilled"),
            Promise.resolve("pending"),
          ]);
          if (status === "fulfilled") {
            executing.splice(j, 1);
          }
        }
      }
    }

    // Wait for remaining downloads
    await Promise.all(executing);

    return { results, successful, failed };
  }

  /**
   * Get file size from URL without downloading
   */
  async getFileSize(url: string): Promise<number | null> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        const contentLength = response.headers.get("content-length");
        return contentLength ? parseInt(contentLength, 10) : null;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }
}

// Singleton instance
let downloadServiceInstance: DownloadService | null = null;

export function getDownloadService(): DownloadService {
  if (!downloadServiceInstance) {
    downloadServiceInstance = new DownloadService();
  }
  return downloadServiceInstance;
}
