import { computed, ref, type Ref } from "vue";
import type { Mod } from "@/types";
import type { CompatibilityResult } from "./useModpackCompatibility";

export type ModsFilterType =
  | "all"
  | "incompatible"
  | "warning"
  | "disabled"
  | "locked"
  | "updates"
  | "recent-updated"
  | "recent-added"
  | "with-notes";

export type ContentTypeTab = "mods" | "resourcepacks" | "shaders";
export type SortByField = "name" | "version" | "date";
export type SortDirection = "asc" | "desc";

export interface UseModpackFilteringOptions {
  currentMods: Ref<Mod[]>;
  disabledModIds: Ref<Set<string>>;
  lockedModIds: Ref<Set<string>>;
  modNotes: Ref<Record<string, string>>;
  updateAvailable: Ref<Record<string, unknown>>;
  recentlyUpdatedMods: Ref<Set<string>>;
  recentlyAddedMods: Ref<Set<string>>;
  isModCompatible: (mod: Mod) => CompatibilityResult;
  /** Optional: pass existing contentTypeTab ref to share state */
  contentTypeTab?: Ref<ContentTypeTab>;
}

export function useModpackFiltering(options: UseModpackFilteringOptions) {
  const {
    currentMods,
    disabledModIds,
    lockedModIds,
    modNotes,
    updateAvailable,
    recentlyUpdatedMods,
    recentlyAddedMods,
    isModCompatible,
    contentTypeTab: externalContentTypeTab,
  } = options;

  // Filter state
  const searchQueryInstalled = ref("");
  const modsFilter = ref<ModsFilterType>("all");
  // Use external contentTypeTab if provided, otherwise create own
  const contentTypeTab = externalContentTypeTab ?? ref<ContentTypeTab>("mods");
  const sortBy = ref<SortByField>("name");
  const sortDir = ref<SortDirection>("asc");

  // Content type counts
  const contentTypeCounts = computed(() => {
    const counts = { mods: 0, resourcepacks: 0, shaders: 0 };
    for (const m of currentMods.value) {
      const ct = m.content_type || "mod";
      if (ct === "mod") counts.mods++;
      else if (ct === "resourcepack") counts.resourcepacks++;
      else if (ct === "shader") counts.shaders++;
    }
    return counts;
  });

  // Filtered & Sorted Mods
  const filteredInstalledMods = computed(() => {
    let mods = currentMods.value.filter((m) => {
      // Content type filter
      const modContentType = m.content_type || "mod";
      if (contentTypeTab.value === "mods" && modContentType !== "mod")
        return false;
      if (
        contentTypeTab.value === "resourcepacks" &&
        modContentType !== "resourcepack"
      )
        return false;
      if (contentTypeTab.value === "shaders" && modContentType !== "shader")
        return false;

      // Search filter
      const matchesSearch = m.name
        .toLowerCase()
        .includes(searchQueryInstalled.value.toLowerCase());
      if (!matchesSearch) return false;

      // Quick filter
      if (modsFilter.value === "incompatible") {
        return !isModCompatible(m).compatible;
      }
      if (modsFilter.value === "warning") {
        const compat = isModCompatible(m);
        return compat.compatible && compat.warning;
      }
      if (modsFilter.value === "disabled") {
        return disabledModIds.value.has(m.id);
      }
      if (modsFilter.value === "locked") {
        return lockedModIds.value.has(m.id);
      }
      if (modsFilter.value === "updates") {
        return !!updateAvailable.value[m.id];
      }
      if (modsFilter.value === "recent-updated") {
        return recentlyUpdatedMods.value.has(m.id);
      }
      if (modsFilter.value === "recent-added") {
        return recentlyAddedMods.value.has(m.id);
      }
      if (modsFilter.value === "with-notes") {
        return !!modNotes.value[m.id];
      }
      return true;
    });

    // Sort
    mods.sort((a, b) => {
      if (sortBy.value === "date") {
        const aDate = new Date(a.created_at || 0).getTime();
        const bDate = new Date(b.created_at || 0).getTime();
        return sortDir.value === "asc" ? aDate - bDate : bDate - aDate;
      }
      const aVal = String(a[sortBy.value] || "");
      const bVal = String(b[sortBy.value] || "");
      const cmp = aVal.localeCompare(bVal);
      return sortDir.value === "asc" ? cmp : -cmp;
    });

    return mods;
  });

  // Toggle sort
  function toggleSort(field: SortByField): void {
    if (sortBy.value === field) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortBy.value = field;
      sortDir.value = "asc";
    }
  }

  // Clear all filters
  function clearFilters(): void {
    searchQueryInstalled.value = "";
    modsFilter.value = "all";
  }

  // Count of active filters
  const activeFilterCount = computed(() => {
    let count = 0;
    if (searchQueryInstalled.value) count++;
    if (modsFilter.value !== "all") count++;
    return count;
  });

  return {
    // State
    searchQueryInstalled,
    modsFilter,
    contentTypeTab,
    sortBy,
    sortDir,

    // Computed
    contentTypeCounts,
    filteredInstalledMods,
    activeFilterCount,

    // Methods
    toggleSort,
    clearFilters,
  };
}
