import { ref, computed, watch, type Ref, type ComputedRef, type WatchSource } from "vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("LibraryPagination");

export const ITEMS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export interface UseLibraryPaginationOptions<T> {
  items: ComputedRef<T[]>;
  filterDeps?: WatchSource[];
  initialItemsPerPage?: number;
}

/**
 * Composable for managing pagination state and navigation.
 * Automatically resets to page 1 when filter dependencies change.
 */
export function useLibraryPagination<T>(options: UseLibraryPaginationOptions<T>) {
  const { items, filterDeps = [], initialItemsPerPage = 50 } = options;

  const currentPage = ref(1);
  const itemsPerPage = ref(initialItemsPerPage);

  const totalPages = computed(() =>
    Math.ceil(items.value.length / itemsPerPage.value)
  );

  const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return items.value.slice(start, end);
  });

  const canGoPrev = computed(() => currentPage.value > 1);
  const canGoNext = computed(() => currentPage.value < totalPages.value);

  function goToPage(page: number): void {
    const newPage = Math.max(1, Math.min(page, totalPages.value));
    log.debug('Navigating to page', { from: currentPage.value, to: newPage, totalPages: totalPages.value });
    currentPage.value = newPage;
  }

  function prevPage(): void {
    if (canGoPrev.value) currentPage.value--;
  }

  function nextPage(): void {
    if (canGoNext.value) currentPage.value++;
  }

  function firstPage(): void {
    currentPage.value = 1;
  }

  function lastPage(): void {
    currentPage.value = totalPages.value;
  }

  // Reset to page 1 when filters change
  if (filterDeps.length > 0) {
    watch(filterDeps, () => {
      currentPage.value = 1;
    });
  }

  // Also reset if current page exceeds total pages (after filtering reduces results)
  watch(totalPages, (newTotal) => {
    if (currentPage.value > newTotal && newTotal > 0) {
      currentPage.value = newTotal;
    }
  });

  return {
    currentPage,
    itemsPerPage,
    itemsPerPageOptions: ITEMS_PER_PAGE_OPTIONS,
    totalPages,
    paginatedItems,
    canGoPrev,
    canGoNext,
    goToPage,
    prevPage,
    nextPage,
    firstPage,
    lastPage,
  };
}
