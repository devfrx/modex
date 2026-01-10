import { ref, computed, type Ref, type ComputedRef } from "vue";
import { refDebounced } from "@vueuse/core";
import type { Mod } from "@/types/electron";

export interface ModGroup {
  groupKey: string;
  primary: Mod;
  variants: Mod[];
  isExpanded: boolean;
}

export interface UseLibraryFilteringOptions {
  mods: Ref<Mod[]>;
  modUsageMap: Ref<Map<string, Set<string>>>;
  favoriteMods: Ref<Set<string>>;
  getModFolder: (modId: string) => string | null;
  // These are passed in from settings composable
  sortBy: Ref<"name" | "loader" | "created_at" | "version">;
  sortDir: Ref<"asc" | "desc">;
  enableGrouping: Ref<boolean>;
  selectedLoader: Ref<string>;
  selectedGameVersion: Ref<string>;
  selectedContentType: Ref<"all" | "mod" | "resourcepack" | "shader">;
  modpackFilter: Ref<string>;
  searchField: Ref<"all" | "name" | "author" | "version" | "description">;
}

/**
 * Composable for managing library filtering, searching, and grouping.
 * Handles all the complex filtering logic for the mod library.
 */
export function useLibraryFiltering(options: UseLibraryFilteringOptions) {
  const {
    mods,
    modUsageMap,
    favoriteMods,
    getModFolder,
    sortBy,
    sortDir,
    enableGrouping,
    selectedLoader,
    selectedGameVersion,
    selectedContentType,
    modpackFilter,
    searchField,
  } = options;

  // Search state
  const searchQuery = ref("");
  const searchQueryDebounced = refDebounced(searchQuery, 200);

  // Quick filter state
  const quickFilter = ref<"all" | "favorites" | "recent">("all");

  // Folder filter
  const selectedFolderId = ref<string | null>(null);

  // Group expansion state
  const expandedGroups = ref<Set<string>>(new Set());

  // Stats
  const loaderStats = computed(() => {
    const stats: Record<string, number> = {};
    for (const mod of mods.value) {
      stats[mod.loader] = (stats[mod.loader] || 0) + 1;
    }
    return stats;
  });

  const loaders = computed(() => Object.keys(loaderStats.value).sort());

  // Content type counts
  const contentTypeCounts = computed(() => {
    const counts = { mod: 0, resourcepack: 0, shader: 0 };
    for (const m of mods.value) {
      const ct = m.content_type || "mod";
      if (ct === "mod") counts.mod++;
      else if (ct === "resourcepack") counts.resourcepack++;
      else if (ct === "shader") counts.shader++;
    }
    return counts;
  });

  const gameVersions = computed(() => {
    const versions = new Set<string>();
    for (const mod of mods.value) {
      if (mod.game_version && mod.game_version !== "unknown") {
        versions.add(mod.game_version);
      }
    }
    return Array.from(versions).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true })
    );
  });

  // Advanced search function
  function matchesSearchQuery(mod: Mod, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();

    switch (searchField.value) {
      case "name":
        return mod.name.toLowerCase().includes(q);
      case "author":
        return (mod.author || "").toLowerCase().includes(q);
      case "version":
        return (
          mod.version.toLowerCase().includes(q) ||
          mod.game_version.toLowerCase().includes(q)
        );
      case "description":
        return (mod.description || "").toLowerCase().includes(q);
      case "all":
      default:
        return (
          mod.name.toLowerCase().includes(q) ||
          (mod.author || "").toLowerCase().includes(q) ||
          mod.version.toLowerCase().includes(q) ||
          (mod.description || "").toLowerCase().includes(q) ||
          mod.loader.toLowerCase().includes(q)
        );
    }
  }

  // Count active filters
  const activeFilterCount = computed(() => {
    let count = 0;
    if (selectedLoader.value !== "all") count++;
    if (selectedGameVersion.value !== "all") count++;
    if (selectedContentType.value !== "all") count++;
    if (modpackFilter.value !== "all") count++;
    if (searchField.value !== "all") count++;
    if (searchQuery.value) count++;
    return count;
  });

  // Clear all filters
  function clearAllFilters(): void {
    selectedLoader.value = "all";
    selectedGameVersion.value = "all";
    selectedContentType.value = "all";
    modpackFilter.value = "all";
    searchField.value = "all";
    searchQuery.value = "";
  }

  const filteredMods = computed(() => {
    let result = mods.value.filter((mod) => {
      const matchesSearch = matchesSearchQuery(mod, searchQueryDebounced.value);

      // Loader filter only applies to mods (resourcepacks/shaders don't have loaders)
      const modContentType = mod.content_type || "mod";
      const matchesLoader =
        selectedLoader.value === "all" ||
        modContentType !== "mod" || // Skip loader check for non-mods
        mod.loader === selectedLoader.value;

      // Version filter - for shaders/resourcepacks, check game_versions array
      let matchesVersion = selectedGameVersion.value === "all";
      if (!matchesVersion) {
        if (
          modContentType !== "mod" &&
          mod.game_versions &&
          mod.game_versions.length > 0
        ) {
          // For shaders/resourcepacks with game_versions array
          matchesVersion = mod.game_versions.some(
            (gv) =>
              gv === selectedGameVersion.value ||
              gv.startsWith(selectedGameVersion.value) ||
              selectedGameVersion.value.startsWith(gv)
          );
        } else {
          // Standard single version check for mods
          matchesVersion = mod.game_version === selectedGameVersion.value;
        }
      }

      // Content type filter
      let matchesContentType = true;
      if (selectedContentType.value !== "all") {
        matchesContentType = modContentType === selectedContentType.value;
      }

      // Quick filter
      let matchesQuickFilter = true;
      if (quickFilter.value === "favorites") {
        matchesQuickFilter = favoriteMods.value.has(mod.id);
      } else if (quickFilter.value === "recent") {
        // Show mods added in last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        matchesQuickFilter = new Date(mod.created_at).getTime() > weekAgo;
      }

      // Folder filter
      let matchesFolder = true;
      if (selectedFolderId.value !== null) {
        matchesFolder = getModFolder(mod.id) === selectedFolderId.value;
      }

      // Modpack filter
      let matchesModpack = true;
      if (modpackFilter.value !== "all") {
        const usedInPacks = modUsageMap.value.get(mod.id);
        if (modpackFilter.value === "any") {
          matchesModpack = !!usedInPacks && usedInPacks.size > 0;
        } else if (modpackFilter.value === "none") {
          matchesModpack = !usedInPacks || usedInPacks.size === 0;
        } else {
          // Specific modpack ID
          matchesModpack = !!usedInPacks && usedInPacks.has(modpackFilter.value);
        }
      }

      return (
        matchesSearch &&
        matchesLoader &&
        matchesVersion &&
        matchesContentType &&
        matchesQuickFilter &&
        matchesFolder &&
        matchesModpack
      );
    });

    // Sort (favorites first if enabled, then by selected field)
    result.sort((a, b) => {
      // Favorites always first
      const aFav = favoriteMods.value.has(a.id) ? 0 : 1;
      const bFav = favoriteMods.value.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;

      const aVal = String(a[sortBy.value] || "");
      const bVal = String(b[sortBy.value] || "");
      const cmp = aVal.localeCompare(bVal);
      return sortDir.value === "asc" ? cmp : -cmp;
    });

    return result;
  });

  // Grouping logic - group mods by their CurseForge/Modrinth project ID
  const groupedMods = computed((): ModGroup[] => {
    if (!enableGrouping.value) {
      // No grouping - each mod is its own group
      return filteredMods.value.map((mod) => ({
        groupKey: mod.id,
        primary: mod,
        variants: [],
        isExpanded: false,
      }));
    }

    // Group by project ID (cf_project_id or mr_project_id) or by name if no project ID
    const groups = new Map<string, Mod[]>();

    for (const mod of filteredMods.value) {
      let groupKey: string;

      if (mod.cf_project_id) {
        groupKey = `cf-${mod.cf_project_id}`;
      } else if (mod.mr_project_id) {
        groupKey = `mr-${mod.mr_project_id}`;
      } else {
        // Fallback: group by normalized name + loader
        groupKey = `name-${mod.name.toLowerCase().replace(/\s+/g, "-")}-${mod.loader}`;
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(mod);
    }

    // Convert to ModGroup array
    const result: ModGroup[] = [];

    for (const [groupKey, groupMods] of groups) {
      // Sort variants by version (newest first) then game_version
      groupMods.sort((a, b) => {
        // Sort by game version descending
        const versionCompare = b.game_version.localeCompare(
          a.game_version,
          undefined,
          { numeric: true }
        );
        if (versionCompare !== 0) return versionCompare;
        // Then by mod version descending
        return b.version.localeCompare(a.version, undefined, { numeric: true });
      });

      result.push({
        groupKey,
        primary: groupMods[0],
        variants: groupMods.slice(1),
        isExpanded: expandedGroups.value.has(groupKey),
      });
    }

    return result;
  });

  // Toggle group expansion
  function toggleGroup(groupKey: string): void {
    if (expandedGroups.value.has(groupKey)) {
      expandedGroups.value.delete(groupKey);
    } else {
      expandedGroups.value.add(groupKey);
    }
  }

  // Get group info for a mod
  function getGroupInfo(
    modId: string
  ): {
    isGrouped: boolean;
    isPrimary: boolean;
    variantCount: number;
    groupKey: string;
  } | null {
    for (const group of groupedMods.value) {
      if (group.primary.id === modId) {
        return {
          isGrouped: group.variants.length > 0,
          isPrimary: true,
          variantCount: group.variants.length,
          groupKey: group.groupKey,
        };
      }
      if (group.variants.some((v) => v.id === modId)) {
        return {
          isGrouped: true,
          isPrimary: false,
          variantCount: 0,
          groupKey: group.groupKey,
        };
      }
    }
    return null;
  }

  // Get displayable mods (considering grouping and expansion)
  const displayMods = computed((): Mod[] => {
    if (!enableGrouping.value) {
      return filteredMods.value;
    }

    const result: Mod[] = [];
    for (const group of groupedMods.value) {
      result.push(group.primary);
      if (group.isExpanded) {
        result.push(...group.variants);
      }
    }
    return result;
  });

  // Sorting toggle
  function toggleSort(field: "name" | "loader" | "created_at" | "version"): void {
    if (sortBy.value === field) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortBy.value = field;
      sortDir.value = "asc";
    }
  }

  return {
    // Search state
    searchQuery,
    searchQueryDebounced,
    quickFilter,
    selectedFolderId,
    expandedGroups,

    // Computed stats
    loaderStats,
    loaders,
    contentTypeCounts,
    gameVersions,
    activeFilterCount,

    // Computed results
    filteredMods,
    groupedMods,
    displayMods,

    // Methods
    matchesSearchQuery,
    clearAllFilters,
    toggleGroup,
    getGroupInfo,
    toggleSort,
  };
}
