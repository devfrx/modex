/**
 * Cache IPC Handlers
 *
 * Handles all IPC communication for image caching operations.
 * Extracted from main.ts for better modularity.
 *
 * @module electron/ipc/cache.ipc
 */

import { ipcMain } from "electron";
import type { ImageCacheService } from "../services/ImageCacheService";
import { createLogger } from "../services/LoggerService";

const log = createLogger("IPC:Cache");

// ==================== TYPES ====================

export interface CacheIpcDeps {
  imageCacheService: ImageCacheService;
}

// ==================== HANDLERS ====================

export function registerCacheHandlers(deps: CacheIpcDeps): void {
  const { imageCacheService } = deps;

  // Get cached URL for an image
  ipcMain.handle("cache:getImage", async (_, url: string) => {
    return imageCacheService.getCachedUrl(url);
  });

  // Cache a single image
  ipcMain.handle("cache:cacheImage", async (_, url: string) => {
    return imageCacheService.cacheImage(url);
  });

  // Prefetch multiple images
  ipcMain.handle("cache:prefetch", async (_, urls: string[]) => {
    return imageCacheService.prefetchImages(urls);
  });

  // Get cache statistics
  ipcMain.handle("cache:getStats", async () => {
    return imageCacheService.getStats();
  });

  // Clear all cached images
  ipcMain.handle("cache:clear", async () => {
    return imageCacheService.clearCache();
  });

  log.info("Cache IPC handlers registered");
}
