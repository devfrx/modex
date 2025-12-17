/**
 * useImageCache - Composable for intelligent image caching
 */

import { ref, computed, onMounted } from "vue";

export interface CacheStats {
  totalSize: number;
  entryCount: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

// Global cache for URLs that have been resolved
const resolvedUrls = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

export function useImageCache() {
  const stats = ref<CacheStats | null>(null);
  const isClearing = ref(false);

  const formattedStats = computed(() => {
    if (!stats.value) return null;
    return {
      totalSize: formatBytes(stats.value.totalSize),
      memoryUsage: formatBytes(stats.value.memoryUsage),
      entryCount: stats.value.entryCount,
      hitRate: `${(stats.value.hitRate * 100).toFixed(1)}%`
    };
  });

  /**
   * Get cached URL for an image (returns cached path or original URL)
   */
  async function getCachedUrl(originalUrl: string): Promise<string> {
    if (!originalUrl) return "";
    
    // Check local cache first
    if (resolvedUrls.has(originalUrl)) {
      return resolvedUrls.get(originalUrl)!;
    }
    
    // Check if already requesting
    if (pendingRequests.has(originalUrl)) {
      return pendingRequests.get(originalUrl)!;
    }
    
    // Make request
    const request = window.api.cache.getImage(originalUrl).then(cachedUrl => {
      resolvedUrls.set(originalUrl, cachedUrl);
      pendingRequests.delete(originalUrl);
      return cachedUrl;
    }).catch(() => {
      pendingRequests.delete(originalUrl);
      return originalUrl;
    });
    
    pendingRequests.set(originalUrl, request);
    return request;
  }

  /**
   * Force cache an image immediately
   */
  async function cacheImage(url: string): Promise<string | null> {
    if (!url) return null;
    
    try {
      const cached = await window.api.cache.cacheImage(url);
      if (cached) {
        resolvedUrls.set(url, cached);
      }
      return cached;
    } catch (error) {
      console.error("Failed to cache image:", error);
      return null;
    }
  }

  /**
   * Prefetch multiple images in the background
   */
  async function prefetchImages(urls: string[]): Promise<void> {
    const validUrls = urls.filter(u => u && !resolvedUrls.has(u));
    if (validUrls.length === 0) return;
    
    try {
      await window.api.cache.prefetch(validUrls);
    } catch (error) {
      console.error("Failed to prefetch images:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async function getStats(): Promise<CacheStats | null> {
    try {
      const result = await window.api.cache.getStats();
      stats.value = result;
      return result;
    } catch (error) {
      console.error("Failed to get cache stats:", error);
      return null;
    }
  }

  /**
   * Clear all cached images
   */
  async function clearCache(): Promise<boolean> {
    isClearing.value = true;
    try {
      await window.api.cache.clear();
      resolvedUrls.clear();
      stats.value = null;
      return true;
    } catch (error) {
      console.error("Failed to clear cache:", error);
      return false;
    } finally {
      isClearing.value = false;
    }
  }

  // Utility
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return {
    // State
    stats,
    isClearing,
    formattedStats,
    
    // Methods
    getCachedUrl,
    cacheImage,
    prefetchImages,
    getStats,
    clearCache,
    
    // Utilities
    formatBytes
  };
}

/**
 * Vue directive for lazy-loading cached images
 * Usage: <img v-cached-src="thumbnailUrl" />
 */
export const vCachedSrc = {
  async mounted(el: HTMLImageElement, binding: { value: string }) {
    if (!binding.value) {
      el.style.display = "none";
      return;
    }

    // Set placeholder or loading state
    el.classList.add("loading");
    
    try {
      const cachedUrl = await window.api.cache.getImage(binding.value);
      el.src = cachedUrl;
      el.classList.remove("loading");
    } catch {
      el.src = binding.value;
      el.classList.remove("loading");
    }
  },
  
  async updated(el: HTMLImageElement, binding: { value: string; oldValue?: string }) {
    if (binding.value === binding.oldValue) return;
    
    if (!binding.value) {
      el.style.display = "none";
      return;
    }

    el.classList.add("loading");
    
    try {
      const cachedUrl = await window.api.cache.getImage(binding.value);
      el.src = cachedUrl;
      el.classList.remove("loading");
    } catch {
      el.src = binding.value;
      el.classList.remove("loading");
    }
  }
};
