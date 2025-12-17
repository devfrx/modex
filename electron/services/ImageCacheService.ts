/**
 * ImageCacheService - Intelligent Image Caching System
 * 
 * Features:
 * - LRU cache for mod/modpack thumbnails
 * - Persistent disk cache with size limits
 * - Background prefetching
 * - Memory-efficient lazy loading
 * - Automatic cleanup of old cache entries
 */

import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import https from "https";
import http from "http";

// ==================== TYPES ====================

export interface CacheEntry {
  hash: string;
  originalUrl: string;
  localPath: string;
  size: number;
  lastAccessed: number;
  createdAt: number;
  mimeType?: string;
}

export interface CacheStats {
  totalSize: number;
  entryCount: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

export interface CacheConfig {
  maxDiskSize: number;      // Max disk cache size in bytes (default 500MB)
  maxMemorySize: number;    // Max memory cache size in bytes (default 100MB)
  maxAge: number;           // Max age in days before auto-cleanup (default 30)
  prefetchBatchSize: number; // Number of images to prefetch at once (default 10)
}

// ==================== SERVICE ====================

export class ImageCacheService {
  private basePath: string;
  private cachePath: string;
  private indexPath: string;
  private cacheIndex: Map<string, CacheEntry> = new Map();
  private memoryCache: Map<string, Buffer> = new Map();
  private memoryUsage: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private config: CacheConfig;
  private initialized: boolean = false;
  private prefetchQueue: string[] = [];
  private isPrefetching: boolean = false;

  constructor(basePath: string, config?: Partial<CacheConfig>) {
    this.basePath = basePath;
    this.cachePath = path.join(basePath, "cache", "images");
    this.indexPath = path.join(basePath, "cache", "image-index.json");
    
    this.config = {
      maxDiskSize: 500 * 1024 * 1024,    // 500MB
      maxMemorySize: 100 * 1024 * 1024,   // 100MB
      maxAge: 30,                          // 30 days
      prefetchBatchSize: 10,
      ...config
    };
  }

  // ==================== INITIALIZATION ====================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.ensureDir(this.cachePath);
      
      // Load existing index
      if (await fs.pathExists(this.indexPath)) {
        const data = await fs.readJson(this.indexPath);
        this.cacheIndex = new Map(Object.entries(data.entries || {}));
        this.hits = data.stats?.hits || 0;
        this.misses = data.stats?.misses || 0;
      }

      // Verify cache integrity
      await this.verifyCacheIntegrity();
      
      // Cleanup old entries
      await this.cleanupOldEntries();

      this.initialized = true;
    } catch (error) {
      console.error("Error initializing image cache:", error);
      this.cacheIndex = new Map();
    }
  }

  // ==================== CORE METHODS ====================

  /**
   * Get cached image URL (returns local path if cached, original if not)
   */
  async getCachedUrl(originalUrl: string): Promise<string> {
    if (!originalUrl) return "";
    
    await this.initialize();
    
    const hash = this.hashUrl(originalUrl);
    const entry = this.cacheIndex.get(hash);

    if (entry && await fs.pathExists(entry.localPath)) {
      // Update last accessed
      entry.lastAccessed = Date.now();
      this.hits++;
      
      // Return as atom:// protocol for Electron
      return `atom:///${entry.localPath.replace(/\\/g, "/")}`;
    }

    this.misses++;
    
    // Queue for background download
    this.queuePrefetch(originalUrl);
    
    return originalUrl;
  }

  /**
   * Download and cache an image immediately
   */
  async cacheImage(url: string): Promise<string | null> {
    if (!url) return null;
    
    await this.initialize();

    const hash = this.hashUrl(url);
    
    // Check if already cached
    const existing = this.cacheIndex.get(hash);
    if (existing && await fs.pathExists(existing.localPath)) {
      existing.lastAccessed = Date.now();
      return `atom:///${existing.localPath.replace(/\\/g, "/")}`;
    }

    try {
      // Download image
      const result = await this.downloadImage(url, hash);
      if (!result) return null;

      // Create cache entry
      const entry: CacheEntry = {
        hash,
        originalUrl: url,
        localPath: result.path,
        size: result.size,
        lastAccessed: Date.now(),
        createdAt: Date.now(),
        mimeType: result.mimeType
      };

      this.cacheIndex.set(hash, entry);
      
      // Check if we need to evict old entries
      await this.enforceMaxSize();
      
      // Save index periodically
      this.scheduleSaveIndex();

      return `atom:///${entry.localPath.replace(/\\/g, "/")}`;
    } catch (error) {
      console.error(`Error caching image ${url}:`, error);
      return null;
    }
  }

  /**
   * Prefetch multiple images in the background
   */
  async prefetchImages(urls: string[]): Promise<void> {
    for (const url of urls) {
      this.queuePrefetch(url);
    }
    this.processPrefetchQueue();
  }

  /**
   * Get image from memory cache (for immediate display)
   */
  getFromMemory(url: string): Buffer | null {
    const hash = this.hashUrl(url);
    return this.memoryCache.get(hash) || null;
  }

  // ==================== DOWNLOAD ====================

  private async downloadImage(
    url: string, 
    hash: string
  ): Promise<{ path: string; size: number; mimeType: string } | null> {
    return new Promise((resolve) => {
      const extension = this.getExtensionFromUrl(url);
      const localPath = path.join(this.cachePath, `${hash}${extension}`);
      
      const protocol = url.startsWith("https") ? https : http;
      
      const request = protocol.get(url, {
        timeout: 30000,
        headers: {
          "User-Agent": "ModEx/1.0"
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadImage(redirectUrl, hash).then(resolve);
            return;
          }
        }

        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }

        const mimeType = response.headers["content-type"] || "image/png";
        const chunks: Buffer[] = [];
        let size = 0;

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          
          // Abort if too large (> 10MB)
          if (size > 10 * 1024 * 1024) {
            request.destroy();
            resolve(null);
          }
        });

        response.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            await fs.writeFile(localPath, buffer);
            
            // Add to memory cache if small enough
            if (buffer.length < 1024 * 1024 && this.memoryUsage + buffer.length < this.config.maxMemorySize) {
              this.memoryCache.set(hash, buffer);
              this.memoryUsage += buffer.length;
            }

            resolve({ path: localPath, size, mimeType });
          } catch (error) {
            resolve(null);
          }
        });

        response.on("error", () => resolve(null));
      });

      request.on("error", () => resolve(null));
      request.on("timeout", () => {
        request.destroy();
        resolve(null);
      });
    });
  }

  // ==================== PREFETCH ====================

  private queuePrefetch(url: string): void {
    if (!url || this.prefetchQueue.includes(url)) return;
    this.prefetchQueue.push(url);
  }

  private async processPrefetchQueue(): Promise<void> {
    if (this.isPrefetching || this.prefetchQueue.length === 0) return;
    
    this.isPrefetching = true;

    try {
      const batch = this.prefetchQueue.splice(0, this.config.prefetchBatchSize);
      
      await Promise.all(
        batch.map(url => this.cacheImage(url).catch(() => null))
      );

      // Continue processing if more in queue
      if (this.prefetchQueue.length > 0) {
        setTimeout(() => this.processPrefetchQueue(), 100);
      }
    } finally {
      this.isPrefetching = false;
    }
  }

  // ==================== CLEANUP ====================

  private async verifyCacheIntegrity(): Promise<void> {
    const toRemove: string[] = [];

    for (const [hash, entry] of this.cacheIndex) {
      if (!await fs.pathExists(entry.localPath)) {
        toRemove.push(hash);
      }
    }

    for (const hash of toRemove) {
      this.cacheIndex.delete(hash);
    }
  }

  private async cleanupOldEntries(): Promise<void> {
    const maxAge = this.config.maxAge * 24 * 60 * 60 * 1000; // Convert days to ms
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [hash, entry] of this.cacheIndex) {
      if (now - entry.lastAccessed > maxAge) {
        toRemove.push(hash);
        try {
          await fs.remove(entry.localPath);
        } catch {}
      }
    }

    for (const hash of toRemove) {
      this.cacheIndex.delete(hash);
    }
  }

  private async enforceMaxSize(): Promise<void> {
    let totalSize = 0;
    for (const entry of this.cacheIndex.values()) {
      totalSize += entry.size;
    }

    if (totalSize <= this.config.maxDiskSize) return;

    // Sort by last accessed (LRU)
    const sorted = [...this.cacheIndex.entries()]
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Remove oldest until under limit
    for (const [hash, entry] of sorted) {
      if (totalSize <= this.config.maxDiskSize * 0.8) break; // Keep 20% headroom
      
      try {
        await fs.remove(entry.localPath);
        this.cacheIndex.delete(hash);
        this.memoryCache.delete(hash);
        totalSize -= entry.size;
      } catch {}
    }
  }

  // ==================== PERSISTENCE ====================

  private saveTimeout: NodeJS.Timeout | null = null;

  private scheduleSaveIndex(): void {
    if (this.saveTimeout) return;
    
    this.saveTimeout = setTimeout(async () => {
      await this.saveIndex();
      this.saveTimeout = null;
    }, 5000); // Debounce saves by 5 seconds
  }

  async saveIndex(): Promise<void> {
    try {
      const data = {
        entries: Object.fromEntries(this.cacheIndex),
        stats: {
          hits: this.hits,
          misses: this.misses
        }
      };
      await fs.writeJson(this.indexPath, data, { spaces: 2 });
    } catch (error) {
      console.error("Error saving cache index:", error);
    }
  }

  // ==================== STATS ====================

  getStats(): CacheStats {
    let totalSize = 0;
    let oldest = Infinity;
    let newest = 0;

    for (const entry of this.cacheIndex.values()) {
      totalSize += entry.size;
      if (entry.createdAt < oldest) oldest = entry.createdAt;
      if (entry.createdAt > newest) newest = entry.createdAt;
    }

    const totalRequests = this.hits + this.misses;

    return {
      totalSize,
      entryCount: this.cacheIndex.size,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      memoryUsage: this.memoryUsage,
      oldestEntry: oldest === Infinity ? 0 : oldest,
      newestEntry: newest
    };
  }

  async clearCache(): Promise<void> {
    try {
      await fs.emptyDir(this.cachePath);
      this.cacheIndex.clear();
      this.memoryCache.clear();
      this.memoryUsage = 0;
      this.hits = 0;
      this.misses = 0;
      await this.saveIndex();
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  // ==================== UTILS ====================

  private hashUrl(url: string): string {
    return crypto.createHash("md5").update(url).digest("hex");
  }

  private getExtensionFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = path.extname(pathname).toLowerCase();
      
      if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
        return ext;
      }
    } catch {}
    
    return ".png"; // Default
  }
}

export default ImageCacheService;
