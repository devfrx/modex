/**
 * useLazyLibrary - Composable for lazy loading large mod libraries
 */

import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Mod } from "@/types";

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LibraryFilters {
  search: string;
  loader: string;
  gameVersion: string;
  contentType: "all" | "mod" | "resourcepack" | "shader";
  sortBy: "name" | "created_at" | "download_count" | "author";
  sortDir: "asc" | "desc";
  favorites: boolean;
  folderId?: string;
}

const DEFAULT_PAGE_SIZE = 50;

export function useLazyLibrary(initialPageSize = DEFAULT_PAGE_SIZE) {
  // State
  const mods = ref<Mod[]>([]);
  const isLoading = ref(false);
  const isLoadingMore = ref(false);
  const error = ref<string | null>(null);
  
  // Pagination
  const pagination = ref<PaginationInfo>({
    page: 1,
    pageSize: initialPageSize,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  // Filters
  const filters = ref<LibraryFilters>({
    search: "",
    loader: "all",
    gameVersion: "all",
    contentType: "all",
    sortBy: "name",
    sortDir: "asc",
    favorites: false
  });

  // Scroll container ref for infinite scroll
  let scrollContainer: HTMLElement | null = null;
  let scrollHandler: (() => void) | null = null;

  // Computed
  const isEmpty = computed(() => mods.value.length === 0 && !isLoading.value);
  const hasFiltersApplied = computed(() => {
    return filters.value.search !== "" ||
      filters.value.loader !== "all" ||
      filters.value.gameVersion !== "all" ||
      filters.value.contentType !== "all" ||
      filters.value.favorites;
  });

  /**
   * Load mods with current filters and pagination
   */
  async function loadMods(page = 1, append = false): Promise<void> {
    if (append) {
      isLoadingMore.value = true;
    } else {
      isLoading.value = true;
    }
    error.value = null;

    try {
      const result = await window.api.library.getPaginated({
        page,
        pageSize: pagination.value.pageSize,
        search: filters.value.search || undefined,
        loader: filters.value.loader !== "all" ? filters.value.loader : undefined,
        gameVersion: filters.value.gameVersion !== "all" ? filters.value.gameVersion : undefined,
        contentType: filters.value.contentType !== "all" ? filters.value.contentType : undefined,
        sortBy: filters.value.sortBy,
        sortDir: filters.value.sortDir,
        favorites: filters.value.favorites || undefined,
        folderId: filters.value.folderId
      });

      if (append) {
        mods.value = [...mods.value, ...result.mods];
      } else {
        mods.value = result.mods;
      }

      pagination.value = result.pagination;
    } catch (e: any) {
      error.value = e.message || "Failed to load mods";
      console.error("Failed to load mods:", e);
    } finally {
      isLoading.value = false;
      isLoadingMore.value = false;
    }
  }

  /**
   * Load next page (for infinite scroll)
   */
  async function loadMore(): Promise<void> {
    if (!pagination.value.hasNext || isLoadingMore.value) return;
    await loadMods(pagination.value.page + 1, true);
  }

  /**
   * Reset to first page with current filters
   */
  async function refresh(): Promise<void> {
    await loadMods(1, false);
  }

  /**
   * Go to specific page
   */
  async function goToPage(page: number): Promise<void> {
    if (page < 1 || page > pagination.value.totalPages) return;
    await loadMods(page, false);
  }

  /**
   * Update filters and reload
   */
  function setFilters(newFilters: Partial<LibraryFilters>): void {
    Object.assign(filters.value, newFilters);
  }

  /**
   * Reset all filters
   */
  function resetFilters(): void {
    filters.value = {
      search: "",
      loader: "all",
      gameVersion: "all",
      contentType: "all",
      sortBy: "name",
      sortDir: "asc",
      favorites: false
    };
  }

  /**
   * Set up infinite scroll on a container
   */
  function setupInfiniteScroll(container: HTMLElement | null): void {
    if (scrollHandler && scrollContainer) {
      scrollContainer.removeEventListener("scroll", scrollHandler);
    }

    if (!container) return;

    scrollContainer = container;
    scrollHandler = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const threshold = 200; // Load more when 200px from bottom
      
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        if (pagination.value.hasNext && !isLoadingMore.value) {
          loadMore();
        }
      }
    };

    container.addEventListener("scroll", scrollHandler, { passive: true });
  }

  /**
   * Clean up scroll listener
   */
  function cleanupInfiniteScroll(): void {
    if (scrollHandler && scrollContainer) {
      scrollContainer.removeEventListener("scroll", scrollHandler);
      scrollHandler = null;
      scrollContainer = null;
    }
  }

  // Watch filters and reload when they change (debounced for search)
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  
  watch(() => filters.value.search, () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      loadMods(1, false);
    }, 300); // 300ms debounce for search
  });

  watch([
    () => filters.value.loader,
    () => filters.value.gameVersion,
    () => filters.value.contentType,
    () => filters.value.sortBy,
    () => filters.value.sortDir,
    () => filters.value.favorites,
    () => filters.value.folderId
  ], () => {
    loadMods(1, false);
  });

  // Cleanup on unmount
  onUnmounted(() => {
    cleanupInfiniteScroll();
    if (searchDebounce) clearTimeout(searchDebounce);
  });

  return {
    // State
    mods,
    isLoading,
    isLoadingMore,
    error,
    pagination,
    filters,
    
    // Computed
    isEmpty,
    hasFiltersApplied,
    
    // Methods
    loadMods,
    loadMore,
    refresh,
    goToPage,
    setFilters,
    resetFilters,
    setupInfiniteScroll,
    cleanupInfiniteScroll
  };
}
