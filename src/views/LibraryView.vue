<script setup lang="ts">
import ModGrid from "@/components/mods/ModGrid.vue";
import ModCard from "@/components/mods/ModCard.vue";
import GalleryCard from "@/components/mods/GalleryCard.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";

import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import AddToModpackDialog from "@/components/modpacks/AddToModpackDialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
import ModUpdateDialog from "@/components/mods/ModUpdateDialog.vue";
import CurseForgeSearch from "@/components/mods/CurseForgeSearch.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useFolderTree } from "@/composables/useFolderTree";
import { useToast } from "@/composables/useToast";
import {
  Search,
  FolderPlus,
  FilePlus,
  Trash2,
  PackagePlus,
  PlusCircle,
  LayoutGrid,
  List,
  LayoutList,
  Info,
  X,
  Heart,
  AlertTriangle,
  HardDrive,
  Folder,
  FolderInput,
  ArrowUpCircle,
  Globe,
  Layers,
  ChevronDown,
  ChevronRight,
  Image,
  Sparkles,
  Filter,
  Settings2,
  Columns,
  GalleryVertical,
  Package,
} from "lucide-vue-next";
import { ref, onMounted, computed, watch, nextTick, shallowRef } from "vue";
import { refDebounced } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import type { Mod, Modpack, ModUsageInfo } from "@/types/electron";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Folder tree integration
const { folders, moveModsToFolder, getModFolder, createFolder } =
  useFolderTree();

// Search input ref for focus
const searchInputRef = ref<HTMLInputElement | null>(null);

const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);
const modUsageMap = ref<Map<string, Set<string>>>(new Map()); // ModID -> Set<ModpackID>
const isLoading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref("");
const searchQueryDebounced = refDebounced(searchQuery, 200);
const selectedLoader = ref<string>("all");
const selectedGameVersion = ref<string>("all");
const selectedContentType = ref<"all" | "mod" | "resourcepack" | "shader">(
  "all"
);
const modpackFilter = ref<string>("all"); // 'all', 'any', 'none', or modpackId
const searchField = ref<"all" | "name" | "author" | "version" | "description">(
  "all"
);

// UI State
const showFilters = ref(false);
const showColumnSelector = ref(false);

// CurseForge search dialog
const showCurseForgeSearch = ref(false);

// Folder filter
const selectedFolderId = ref<string | null>(null);

// Favorites system (stored in localStorage)
const favoriteMods = ref<Set<string>>(new Set());
const quickFilter = ref<"all" | "favorites" | "recent">("all");

// Duplicate detection
const duplicates = ref<Map<string, string[]>>(new Map());

// Resource grouping - group same mod across different versions/loaders
const enableGrouping = ref(true);
const expandedGroups = ref<Set<string>>(new Set());

// Pagination
const currentPage = ref(1);
const itemsPerPage = ref(50);
const itemsPerPageOptions = [25, 50, 100, 200];
const isFiltering = ref(false);

// Sorting
const sortBy = ref<"name" | "loader" | "created_at" | "version">("name");
const sortDir = ref<"asc" | "desc">("asc");
const sortFields = ["name", "loader", "version", "created_at"] as const;

// View Mode
const viewMode = ref<"grid" | "gallery" | "list" | "compact">("grid");
const showThumbnails = ref<boolean>(true); // Toggle for mod thumbnails

// List View Columns
const availableColumns = [
  { id: "thumbnail", label: "Image" },
  { id: "name", label: "Name" },
  { id: "version", label: "Version" },
  { id: "loader", label: "Loader" },
  { id: "author", label: "Author" },
  { id: "game_version", label: "Game Version" },
  { id: "date", label: "Date Added" },
  { id: "size", label: "Size" },
  { id: "usage", label: "Usage" },
] as const;

const visibleColumns = ref<Set<string>>(
  new Set(["name", "version", "loader", "author"])
);

// Selection State
const selectedModIds = ref<Set<string>>(new Set());

// Details Panel
const showDetails = ref(false);
const detailsMod = ref<Mod | null>(null);

// Dialog States
const showDeleteDialog = ref(false);
const showBulkDeleteDialog = ref(false);
const showCreateModpackDialog = ref(false);
const showAddToModpackDialog = ref(false);
const showMoveToFolderDialog = ref(false);
const showUpdatesDialog = ref(false);
const showSingleModUpdateDialog = ref(false);
const selectedUpdateMod = ref<any>(null);
const modToDelete = ref<string | null>(null);

// Mod usage warning state
const showUsageWarningDialog = ref(false);
const modUsageInfo = ref<
  Array<{
    modId: string;
    modName: string;
    modpacks: Array<{ id: string; name: string }>;
  }>
>([]);
const pendingDeleteModIds = ref<string[]>([]);

// Progress State
const showProgress = ref(false);
const progressTitle = ref("");
const progressMessage = ref("");

// Check if running in Electron
const isElectron = () => window.api !== undefined;

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

// Check if all selected mods are compatible (same game_version and loader)
const selectedModsCompatibility = computed(() => {
  if (selectedModIds.value.size === 0) {
    return { compatible: false, gameVersion: null, loader: null };
  }

  const selectedMods = mods.value.filter((m) => selectedModIds.value.has(m.id));
  if (selectedMods.length === 0) {
    return { compatible: false, gameVersion: null, loader: null };
  }

  // Separate mods from non-mods (resourcepacks/shaders)
  const modItems = selectedMods.filter(
    (m) => !m.content_type || m.content_type === "mod"
  );
  const nonModItems = selectedMods.filter(
    (m) => m.content_type && m.content_type !== "mod"
  );

  // Get game versions from mods only (single version per mod)
  const modGameVersions = new Set(
    modItems.map((m) => m.game_version).filter((v) => v && v !== "unknown")
  );

  // Get loaders from mods only (resourcepacks/shaders don't have loaders)
  const loaders = new Set(
    modItems.map((m) => m.loader).filter((l) => l && l !== "unknown")
  );

  // Check compatibility for mods
  const hasSameVersion = modGameVersions.size <= 1;
  const hasSameLoader = loaders.size <= 1;

  // For non-mods, check if they have any overlapping versions with the mod game version
  let nonModsCompatible = true;
  const modGameVersion =
    modGameVersions.size === 1 ? Array.from(modGameVersions)[0] : null;

  if (modGameVersion && nonModItems.length > 0) {
    // Check if all non-mod items support the mod game version
    nonModsCompatible = nonModItems.every((item) => {
      if (!item.game_versions || item.game_versions.length === 0) return true;
      return item.game_versions.includes(modGameVersion);
    });
  }

  // If we have mods with different loaders, it's incompatible
  const compatible = hasSameVersion && hasSameLoader && nonModsCompatible;

  // Determine the locked values
  let gameVersion: string | null = null;
  let loader: string | null = null;

  if (modGameVersions.size === 1) {
    gameVersion = Array.from(modGameVersions)[0];
  } else if (modItems.length === 0 && nonModItems.length > 0) {
    // Only non-mod items - find common version from game_versions arrays
    const versionSets = nonModItems.map(
      (item) => new Set(item.game_versions || [])
    );
    if (versionSets.length > 0 && versionSets[0].size > 0) {
      const intersection = [...versionSets[0]].filter((v) =>
        versionSets.every((set) => set.size === 0 || set.has(v))
      );
      if (intersection.length > 0) {
        // Use the highest version as the common version
        gameVersion = intersection[0]; // Already sorted descending by CurseForgeService
      }
    }
  }

  if (loaders.size === 1) {
    loader = Array.from(loaders)[0];
  } else if (modItems.length === 0 && nonModItems.length > 0) {
    // Only non-mod items selected - no loader lock needed
    loader = null;
  }

  return {
    compatible,
    gameVersion,
    loader,
  };
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

    // Sorting numerically (e.g., download count) not applicable in metadata-only mode

    const aVal = String(a[sortBy.value] || "");
    const bVal = String(b[sortBy.value] || "");
    const cmp = aVal.localeCompare(bVal);
    return sortDir.value === "asc" ? cmp : -cmp;
  });

  return result;
});

// Grouping logic - group mods by their CurseForge/Modrinth project ID
interface ModGroup {
  groupKey: string;
  primary: Mod;
  variants: Mod[];
  isExpanded: boolean;
}

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

  for (const [groupKey, mods] of groups) {
    // Sort variants by version (newest first) then game_version
    mods.sort((a, b) => {
      // Sort by game version descending
      const versionCompare = b.game_version.localeCompare(a.game_version, undefined, { numeric: true });
      if (versionCompare !== 0) return versionCompare;
      // Then by mod version descending
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

    result.push({
      groupKey,
      primary: mods[0],
      variants: mods.slice(1),
      isExpanded: expandedGroups.value.has(groupKey),
    });
  }

  return result;
});

// Pagination computed values
const totalPages = computed(() => Math.ceil(groupedMods.value.length / itemsPerPage.value));
const paginatedGroups = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;
  return groupedMods.value.slice(start, end);
});

// Page navigation helpers
const canGoPrev = computed(() => currentPage.value > 1);
const canGoNext = computed(() => currentPage.value < totalPages.value);

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value));
}

function prevPage() {
  if (canGoPrev.value) currentPage.value--;
}

function nextPage() {
  if (canGoNext.value) currentPage.value++;
}

// Reset to page 1 when filters change
watch([searchQueryDebounced, selectedLoader, selectedGameVersion, selectedContentType, modpackFilter, quickFilter, selectedFolderId], () => {
  currentPage.value = 1;
});

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

// Toggle group expansion
function toggleGroup(groupKey: string) {
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey);
  } else {
    expandedGroups.value.add(groupKey);
  }
}

// Get group info for a mod
function getGroupInfo(modId: string): { isGrouped: boolean; isPrimary: boolean; variantCount: number; groupKey: string } | null {
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

// Move mods to folder
function moveSelectedToFolder(folderId: string | null) {
  const ids = Array.from(selectedModIds.value);
  moveModsToFolder(ids, folderId);
  showMoveToFolderDialog.value = false;
  clearSelection();
}

// Favorite functions
function loadFavorites() {
  const stored = localStorage.getItem("modex:favorites:mods");
  if (stored) {
    favoriteMods.value = new Set(JSON.parse(stored));
  }
}

function saveFavorites() {
  localStorage.setItem(
    "modex:favorites:mods",
    JSON.stringify([...favoriteMods.value])
  );
  // Trigger storage event for sidebar update
  window.dispatchEvent(new Event("storage"));
}

function toggleFavorite(modId: string) {
  if (favoriteMods.value.has(modId)) {
    favoriteMods.value.delete(modId);
  } else {
    favoriteMods.value.add(modId);
  }
  saveFavorites();
}

function isFavorite(modId: string): boolean {
  return favoriteMods.value.has(modId);
}

// Persistent Settings
const SETTINGS_KEY = "modex:library:settings";

function saveSettings() {
  const settings = {
    viewMode: viewMode.value,
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    showThumbnails: showThumbnails.value,
    selectedLoader: selectedLoader.value,
    selectedGameVersion: selectedGameVersion.value,
    searchField: searchField.value,
    modpackFilter: modpackFilter.value,
    selectedContentType: selectedContentType.value,
    visibleColumns: Array.from(visibleColumns.value),
    showFilters: showFilters.value,
    itemsPerPage: itemsPerPage.value,
    enableGrouping: enableGrouping.value,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const settings = JSON.parse(stored);
      if (settings.viewMode) viewMode.value = settings.viewMode;
      if (settings.sortBy) sortBy.value = settings.sortBy;
      if (settings.sortDir) sortDir.value = settings.sortDir;
      if (settings.showThumbnails !== undefined)
        showThumbnails.value = settings.showThumbnails;
      if (settings.selectedLoader)
        selectedLoader.value = settings.selectedLoader;
      if (settings.selectedGameVersion)
        selectedGameVersion.value = settings.selectedGameVersion;
      if (settings.searchField) searchField.value = settings.searchField;
      if (settings.modpackFilter) modpackFilter.value = settings.modpackFilter;
      if (settings.selectedContentType)
        selectedContentType.value = settings.selectedContentType;
      if (settings.visibleColumns)
        visibleColumns.value = new Set(settings.visibleColumns);
      if (settings.showFilters !== undefined)
        showFilters.value = settings.showFilters;
      if (settings.itemsPerPage)
        itemsPerPage.value = settings.itemsPerPage;
      if (settings.enableGrouping !== undefined)
        enableGrouping.value = settings.enableGrouping;
    }
  } catch (e) {
    console.warn("Failed to load settings", e);
  }
}

// Watchers for persistence
watch(
  [
    viewMode,
    sortBy,
    sortDir,
    showThumbnails,
    selectedLoader,
    selectedGameVersion,
    searchField,
    modpackFilter,
    selectedContentType,
    visibleColumns,
    showFilters,
    itemsPerPage,
    enableGrouping,
  ],
  () => {
    saveSettings();
  },
  { deep: true }
);
function detectDuplicates() {
  const keyMap = new Map<string, string[]>();
  for (const mod of mods.value) {
    // Create a composite key from all relevant fields
    const key = [
      mod.name.toLowerCase().trim(),
      (mod.loader || "").toLowerCase().trim(),
      (mod.version || "").toLowerCase().trim(),
      (mod.game_version || "").toLowerCase().trim(),
      (mod.filename || "").toLowerCase().trim(),
    ].join("|");

    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key)!.push(mod.id);
  }

  // Filter to only show actual duplicates (exact same key appears more than once)
  duplicates.value = new Map(
    [...keyMap.entries()].filter(([_, ids]) => ids.length > 1)
  );
}

const duplicateCount = computed(() => duplicates.value.size);

// Set of all duplicate mod IDs for the grid
const duplicateModIds = computed(() => {
  const ids = new Set<string>();
  for (const modIds of duplicates.value.values()) {
    for (const id of modIds) {
      ids.add(id);
    }
  }
  return ids;
});

function isDuplicate(modId: string): boolean {
  for (const ids of duplicates.value.values()) {
    if (ids.includes(modId)) return true;
  }
  return false;
}

// Map of installed CurseForge project IDs to their installed file IDs
const installedProjectFiles = computed(() => {
  const map = new Map<number, Set<number>>();
  for (const mod of mods.value) {
    if (mod.cf_project_id && mod.cf_file_id) {
      if (!map.has(mod.cf_project_id)) {
        map.set(mod.cf_project_id, new Set());
      }
      map.get(mod.cf_project_id)!.add(mod.cf_file_id);
    }
  }
  return map;
});

async function loadMods() {
  if (!isElectron()) {
    error.value = "This app must be run in Electron, not in a browser.";
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    // Load mods and modpacks in parallel - show UI immediately
    const [allMods, allModpacks] = await Promise.all([
      window.api.mods.getAll(),
      window.api.modpacks.getAll(),
    ]);

    mods.value = allMods;
    modpacks.value = allModpacks;

    // Show UI immediately, then load usage data in background
    isLoading.value = false;

    // Detect duplicates (fast, local operation)
    detectDuplicates();

    const currentIds = new Set(mods.value.map((m) => m.id!));
    for (const id of selectedModIds.value) {
      if (!currentIds.has(id)) selectedModIds.value.delete(id);
    }

    // Load usage data in background (deferred)
    loadUsageDataDeferred(allMods.map((m) => m.id));
  } catch (err) {
    console.error("Failed to load mods:", err);
    error.value = "Failed to load mods: " + (err as Error).message;
    isLoading.value = false;
  }
}

// Deferred usage data loading for better initial load time
async function loadUsageDataDeferred(modIds: string[]) {
  if (modIds.length === 0) return;

  try {
    const usageInfo = await window.api.mods.checkUsage(modIds);
    const usage = new Map<string, Set<string>>();
    for (const info of usageInfo) {
      const packIds = new Set(info.modpacks.map((p) => p.id));
      usage.set(info.modId, packIds);
    }
    modUsageMap.value = usage;
  } catch (err) {
    console.warn("Failed to load usage data:", err);
  }
}

// Sorting
function toggleSort(field: "name" | "loader" | "created_at" | "version") {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = field;
    sortDir.value = "asc";
  }
}

// Selection Logic
function toggleSelection(id: string) {
  if (selectedModIds.value.has(id)) {
    selectedModIds.value.delete(id);
  } else {
    selectedModIds.value.add(id);
  }
}

function clearSelection() {
  selectedModIds.value.clear();
}

function selectAll() {
  for (const mod of filteredMods.value) {
    selectedModIds.value.add(mod.id!);
  }
}

function selectNone() {
  selectedModIds.value.clear();
}

// Details Panel
function showModDetails(mod: Mod) {
  detailsMod.value = mod;
  showDetails.value = true;
}

function closeDetails() {
  showDetails.value = false;
  detailsMod.value = null;
}

// Bulk Actions
async function confirmBulkDelete() {
  if (!isElectron()) return;

  const ids = Array.from(selectedModIds.value);

  // Check if any mods are used in modpacks
  // Ensure we pass a plain array
  const usage = await window.api.mods.checkUsage(
    JSON.parse(JSON.stringify(ids))
  );

  if (usage.length > 0) {
    // Show usage warning dialog
    modUsageInfo.value = usage;
    pendingDeleteModIds.value = ids;
    showUsageWarningDialog.value = true;
  } else {
    // No usage, show simple bulk delete dialog
    showBulkDeleteDialog.value = true;
  }
}

async function deleteSelectedMods() {
  showBulkDeleteDialog.value = false;

  showProgress.value = true;
  progressTitle.value = "Deleting Mods";
  progressMessage.value = `Deleting ${selectedModIds.value.size} mods...`;

  const ids = Array.from(selectedModIds.value);

  try {
    // Use batch delete API for much better performance
    const deletedCount = await window.api.mods.bulkDelete(ids);
    await loadMods();
    clearSelection();
    toast.success("Deleted", `Successfully deleted ${deletedCount} mods`);
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export to Game - Removed: not available in metadata-only mode

// Helper functions for template type casting
function setContentType(type: string) {
  selectedContentType.value = type as "all" | "mod" | "resourcepack" | "shader";
}

function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  target.style.display = 'none';
}

async function createModpackFromSelection(data: {
  name: string;
  version: string;
  description: string;
}) {
  showCreateModpackDialog.value = false;
  showProgress.value = true;
  progressTitle.value = "Creating Modpack";
  progressMessage.value = "Setting up modpack...";

  try {
    const packId = await window.api.modpacks.create(data);
    const ids = Array.from(selectedModIds.value);
    // Use batch API for better performance
    await window.api.modpacks.addModsBatch(packId, ids);
    clearSelection();
    toast.success(
      "Modpack Created",
      `Created "${data.name}" with ${ids.length} mods!`
    );
  } catch (err) {
    toast.error("Creation Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

async function addSelectionToModpack(
  packId: string,
  compatibleModIds: string[]
) {
  showAddToModpackDialog.value = false;

  if (compatibleModIds.length === 0) {
    toast.error(
      "No Compatible Mods",
      "None of the selected mods are compatible with this modpack."
    );
    return;
  }

  showProgress.value = true;
  progressTitle.value = "Adding to Modpack";
  progressMessage.value = `Adding ${compatibleModIds.length} mods...`;

  try {
    // Use batch API for better performance
    await window.api.modpacks.addModsBatch(packId, compatibleModIds);
    clearSelection();

    const skippedCount = selectedModIds.value.size - compatibleModIds.length;
    if (skippedCount > 0) {
      toast.success(
        "Mods Added",
        `Added ${compatibleModIds.length} mods to modpack (${skippedCount} skipped as incompatible).`
      );
    } else {
      toast.success(
        "Mods Added",
        `Added ${compatibleModIds.length} mods to modpack!`
      );
    }
  } catch (err) {
    toast.error("Add Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Import Functions - Removed: use CurseForge instead

// Delete Single
async function confirmDelete(modId: string) {
  if (!isElectron()) return;

  // Check if mod is used in any modpacks
  // Ensure we pass a plain array
  const usage = await window.api.mods.checkUsage(
    JSON.parse(JSON.stringify([modId]))
  );

  if (usage.length > 0) {
    modUsageInfo.value = usage;
    pendingDeleteModIds.value = [modId];
    showUsageWarningDialog.value = true;
  } else {
    // No usage, show simple delete dialog
    modToDelete.value = modId;
    showDeleteDialog.value = true;
  }
}

function openUpdateDialog(mod: any) {
  selectedUpdateMod.value = mod;
  showSingleModUpdateDialog.value = true;
}

function handleModUpdated() {
  loadMods();
}

async function deleteMod() {
  if (!modToDelete.value || !isElectron()) return;
  try {
    await window.api.mods.delete(modToDelete.value);
    await loadMods();
    showDeleteDialog.value = false;
    modToDelete.value = null;
    if (showDetails.value && detailsMod.value?.id === modToDelete.value) {
      closeDetails();
    }
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  }
}

// Delete mods with modpack cleanup
async function deleteModsWithCleanup(removeFromModpacks: boolean) {
  if (!isElectron() || pendingDeleteModIds.value.length === 0) return;

  try {
    // Ensure we pass a plain array, not a Proxy
    const ids = JSON.parse(JSON.stringify(pendingDeleteModIds.value));

    const count = await window.api.mods.deleteWithModpackCleanup(
      ids,
      removeFromModpacks
    );

    await loadMods();
    showUsageWarningDialog.value = false;
    pendingDeleteModIds.value = [];
    modUsageInfo.value = [];
    selectedModIds.value = new Set();

    const message = removeFromModpacks
      ? `Deleted ${count} mod(s) and removed from modpacks`
      : `Deleted ${count} mod(s) from library`;
    toast.success("Deleted", message);

    if (
      showDetails.value &&
      pendingDeleteModIds.value.includes(detailsMod.value?.id || "")
    ) {
      closeDetails();
    }
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  }
}

function cancelUsageWarning() {
  showUsageWarningDialog.value = false;
  pendingDeleteModIds.value = [];
  modUsageInfo.value = [];
}

// Drag & Drop support
const isDragging = ref(false);
const dragCounter = ref(0);

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  dragCounter.value++;
  isDragging.value = true;
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  dragCounter.value--;
  if (dragCounter.value === 0) {
    isDragging.value = false;
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  dragCounter.value = 0;

  // Drag & drop import is temporarily disabled
  toast.info(
    "Not Available",
    "Drag & drop import is temporarily disabled. Please use 'Browse CurseForge' to add mods, or go to Modpacks page to 'Import CF Modpack'."
  );
  return;
}

// Handle URL filter parameter
watch(
  () => route.query.filter,
  (filter) => {
    if (filter === "favorites") {
      quickFilter.value = "favorites";
    } else if (filter === "recent") {
      quickFilter.value = "recent";
    } else {
      quickFilter.value = "all";
    }
  },
  { immediate: true }
);

// Handle URL action parameter (e.g. browse)
watch(
  () => route.query.action,
  (action) => {
    if (action === 'browse') {
      showCurseForgeSearch.value = true;
      router.replace({ query: { ...route.query, action: undefined } });
    }
  },
  { immediate: true }
);

// Handle URL mod parameter (from GlobalSearch)
// Store pending mod action for when mods finish loading
const pendingModAction = ref<{ modId: string; action?: string } | null>(null);

watch(
  () => route.query.mod,
  (modId) => {
    if (modId && typeof modId === 'string') {
      const action = route.query.action as string | undefined;
      if (mods.value.length > 0) {
        handleModAction(modId, action);
      } else {
        // Store for later when mods are loaded
        pendingModAction.value = { modId, action };
      }
    }
  },
  { immediate: true }
);

// Also check when mods finish loading
watch(
  () => mods.value.length,
  (length) => {
    if (length > 0 && pendingModAction.value) {
      const { modId, action } = pendingModAction.value;
      pendingModAction.value = null;
      handleModAction(modId, action);
    }
  }
);

function handleModAction(modId: string, action?: string) {
  const mod = mods.value.find((m) => m.id === modId);
  if (mod) {
    if (action === 'add') {
      // Select the mod and open add to modpack dialog
      selectedModIds.value.clear();
      selectedModIds.value.add(modId);
      showAddToModpackDialog.value = true;
    } else {
      // Just show details
      showModDetails(mod);
    }
    // Clear the query params after handling
    router.replace({ path: '/library', query: { ...route.query, mod: undefined, action: undefined } });
  }
}

// Keyboard shortcuts
useKeyboardShortcuts([
  {
    key: "f",
    ctrl: true,
    handler: () => {
      // Focus search input
      const input = document.querySelector(
        'input[placeholder*="Search"]'
      ) as HTMLInputElement;
      input?.focus();
    },
  },
  {
    key: "a",
    ctrl: true,
    handler: () => selectAll(),
  },
  {
    key: "Escape",
    handler: () => {
      if (selectedModIds.value.size > 0) {
        clearSelection();
      } else if (showDetails.value) {
        closeDetails();
      }
    },
  },
  {
    key: "Delete",
    handler: () => {
      if (selectedModIds.value.size > 0) {
        deleteSelectedMods();
      }
    },
  },
  // Removed: import files keyboard shortcut
  {
    key: "n",
    ctrl: true,
    handler: () => {
      if (selectedModIds.value.size > 0) {
        showCreateModpackDialog.value = true;
      }
    },
  },
  {
    key: "1",
    handler: () => {
      viewMode.value = "grid";
    },
  },
  {
    key: "2",
    handler: () => {
      viewMode.value = "list";
    },
  },
  {
    key: "3",
    handler: () => {
      viewMode.value = "compact";
    },
  },
]);

onMounted(() => {
  loadFavorites();
  loadSettings();
  loadMods();
});
</script>

<template>
  <div class="h-full flex flex-col relative" @dragenter="handleDragEnter" @dragover="handleDragOver"
    @dragleave="handleDragLeave" @drop="handleDrop">
    <!-- Drag & Drop Overlay -->
    <div v-if="isDragging"
      class="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
      <div class="text-center">
        <FilePlus class="w-16 h-16 mx-auto text-primary mb-4" />
        <p class="text-xl font-semibold">Drop .jar files here</p>
        <p class="text-muted-foreground">
          Files will be imported to your library
        </p>
      </div>
    </div>

    <!-- Compact Header -->
    <div class="shrink-0 relative border-b border-border z-20">
      <div class="relative px-3 sm:px-8 py-3 sm:py-4 bg-background/80 backdrop-blur-sm">
        <!-- Mobile: Stack vertically, Desktop: Row -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          <!-- Left: Title & Stats -->
          <div class="flex items-center gap-3 sm:gap-4">
            <div class="flex items-center gap-2 sm:gap-3">
              <div
                class="p-2 sm:p-2.5 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl border border-emerald-500/20">
                <HardDrive class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              </div>
              <div>
                <h1 class="text-base sm:text-lg font-semibold tracking-tight">
                  Library
                </h1>
                <p class="text-[10px] sm:text-xs text-muted-foreground">
                  {{ mods.length }} mods
                  <span class="hidden md:inline" v-if="Object.keys(loaderStats).length > 1">
                    •
                    <span v-for="(count, loader, idx) in loaderStats" :key="loader">
                      {{ count }} {{ loader
                      }}{{
                        idx < Object.keys(loaderStats).length - 1 ? ", " : "" }} </span>
                    </span>
                </p>
              </div>
            </div>

            <!-- Separator - hidden on mobile -->
            <div class="hidden sm:block h-8 w-px bg-border" />

            <!-- Quick Filters -->
            <div class="flex items-center gap-1 sm:gap-1.5 py-0.5">
              <button class="px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all" :class="quickFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                " @click="
                  quickFilter = 'all';
                router.push('/library');
                ">
                All
              </button>
              <button
                class="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all"
                :class="quickFilter === 'favorites'
                  ? 'bg-rose-500/20 text-rose-400 shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  " @click="
                    quickFilter = 'favorites';
                  router.push('/library?filter=favorites');
                  ">
                <Heart class="w-3 h-3" :class="quickFilter === 'favorites' ? 'fill-rose-400' : ''" />
                <span v-if="favoriteMods.size > 0" class="hidden xs:inline">({{ favoriteMods.size }})</span>
              </button>
              <button class="px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all" :class="quickFilter === 'recent'
                ? 'bg-blue-500/20 text-blue-400 shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                " @click="
                  quickFilter = 'recent';
                router.push('/library?filter=recent');
                ">
                Recent
              </button>

              <!-- Duplicate Warning Badge -->
              <div v-if="duplicateCount > 0"
                class="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs bg-orange-500/20 text-orange-400 rounded-md cursor-pointer hover:bg-orange-500/30 transition-colors"
                @click="searchQuery = ''" title="Click to show all and review duplicates">
                <AlertTriangle class="w-3 h-3" />
                <span class="hidden sm:inline">{{ duplicateCount }}</span>
              </div>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-2">
            <Button @click="showUpdatesDialog = true" :disabled="!isElectron()" variant="secondary" size="sm"
              class="gap-1.5 h-7 sm:h-8 px-2 sm:px-3 shadow-sm hover:shadow transition-all"
              title="Check for mod updates">
              <ArrowUpCircle class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
              <span class="hidden lg:inline text-xs font-medium">Check Updates</span>
            </Button>
            <Button @click="showCurseForgeSearch = true" variant="default" size="sm"
              class="gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <Globe class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden xs:inline">CurseForge</span>
            </Button>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex items-center gap-2 sm:gap-3 mt-3 sm:mt-4 px-2 py-1">
          <!-- Search -->
          <div class="relative flex-1 max-w-md">
            <Search
              class="absolute left-2 sm:left-2.5 top-1/2 transform -translate-y-1/2 h-3 sm:h-3.5 w-3 sm:w-3.5 text-muted-foreground" />
            <Input v-model="searchQuery" :placeholder="searchField === 'all' ? 'Search...' : `By ${searchField}...`
              " class="pl-7 sm:pl-8 h-8 sm:h-9 text-xs sm:text-sm bg-muted/50 border-border" />
          </div>

          <!-- Search Field Selector (beside search) -->
          <select v-model="searchField" title="Search field"
            class="hidden md:block h-8 sm:h-9 ml-2 rounded-md border border-border bg-muted/50 px-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="all">All</option>
            <option value="name">Name</option>
            <option value="author">Author</option>
            <option value="version">Version</option>
            <option value="description">Description</option>
          </select>

          <!-- Filter Toggle -->
          <Button variant="outline" size="sm" class="h-8 sm:h-9 gap-2" :class="showFilters ? 'bg-primary/10 border-primary/50 text-primary' : ''
            " @click="showFilters = !showFilters">
            <Filter class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Filters</span>
            <span v-if="
              selectedLoader !== 'all' ||
              selectedGameVersion !== 'all' ||
              selectedContentType !== 'all' ||
              modpackFilter !== 'all'
            " class="flex h-1.5 w-1.5 rounded-full bg-primary" />
          </Button>

          <div class="h-6 w-px bg-border mx-1" />

          <!-- View Options -->
          <div class="flex items-center gap-1">
            <!-- Column Selector (List View Only) -->
            <div class="relative" v-if="viewMode === 'list'">
              <Button variant="ghost" size="icon" class="h-8 w-8" :class="showColumnSelector ? 'bg-muted' : ''"
                @click="showColumnSelector = !showColumnSelector" title="Configure columns">
                <Columns class="w-4 h-4" />
              </Button>

              <!-- Column Selector Dropdown -->
              <div v-if="showColumnSelector"
                class="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-md shadow-lg z-[100] p-2 space-y-1">
                <div class="text-xs font-medium text-muted-foreground px-2 py-1">
                  Visible Columns
                </div>
                <label v-for="col in availableColumns" :key="col.id"
                  class="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                  <input type="checkbox" :checked="visibleColumns.has(col.id)" @change="
                    visibleColumns.has(col.id)
                      ? visibleColumns.delete(col.id)
                      : visibleColumns.add(col.id)
                    " class="rounded border-muted-foreground/30 text-primary focus:ring-primary" />
                  {{ col.label }}
                </label>
              </div>

              <!-- Backdrop for dropdown -->
              <div v-if="showColumnSelector" class="fixed inset-0 z-40" @click="showColumnSelector = false" />
            </div>

            <!-- View Mode Toggle -->
            <div class="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md">
              <button class="p-1.5 rounded transition-all" :class="viewMode === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
                " @click="viewMode = 'grid'" title="Grid view">
                <LayoutGrid class="w-4 h-4" />
              </button>
              <button class="p-1.5 rounded transition-all" :class="viewMode === 'gallery'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
                " @click="viewMode = 'gallery'" title="Gallery view">
                <GalleryVertical class="w-4 h-4" />
              </button>
              <button class="p-1.5 rounded transition-all" :class="viewMode === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
                " @click="viewMode = 'list'" title="List view">
                <List class="w-4 h-4" />
              </button>
              <button class="hidden sm:block p-1.5 rounded transition-all" :class="viewMode === 'compact'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
                " @click="viewMode = 'compact'" title="Compact view">
                <LayoutList class="w-4 h-4" />
              </button>
            </div>

            <!-- Group Toggle -->
            <button @click="enableGrouping = !enableGrouping"
              class="p-1.5 rounded-md transition-all flex items-center gap-1.5" :class="enableGrouping
                ? 'bg-primary/20 text-primary'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
              title="Group identical resources">
              <Layers class="w-4 h-4" />
              <span class="hidden lg:inline text-xs">Group</span>
            </button>
          </div>

          <!-- Selection Actions -->
          <div class="hidden md:flex items-center gap-1 ml-auto">
            <Button variant="ghost" size="sm" class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              @click="selectAll" :disabled="filteredMods.length === 0">
              Select All
            </Button>
            <Button variant="ghost" size="sm" class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              @click="selectNone" :disabled="selectedModIds.size === 0">
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Content Wrapper with Filter Sidebar -->
    <div v-if="error" class="flex items-center justify-center flex-1">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="flex items-center justify-center flex-1">
      <div class="flex flex-col items-center gap-2">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <div v-else-if="mods.length === 0" class="flex items-center justify-center flex-1 bg-background">
      <div class="text-center max-w-sm flex flex-col items-center">
        <div class="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-6">
          <Package class="w-8 h-8 text-muted-foreground" />
        </div>

        <h3 class="text-xl font-bold mb-2">Library Empty</h3>
        <p class="text-muted-foreground mb-8 text-sm max-w-xs mx-auto leading-relaxed">
          Your collection is looking a bit light. Start exploring thousands of
          mods on CurseForge.
        </p>

        <Button @click="showCurseForgeSearch = true" size="lg"
          class="gap-2.5 h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
          <Globe class="w-5 h-5" />
          <span class="font-semibold">Browse CurseForge</span>
        </Button>
      </div>
    </div>

    <div v-else class="flex-1 flex overflow-hidden bg-background">
      <!-- Filter Sidebar (inline like ModpackView) -->
      <Transition name="slide">
        <div v-if="showFilters" class="w-64 shrink-0 border-r border-border bg-card/50 p-4 overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-sm flex items-center gap-2">
              <Filter class="w-4 h-4" />
              Filters
            </h3>
            <button @click="showFilters = false" class="p-1 rounded-md hover:bg-muted text-muted-foreground">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="space-y-4">
            <!-- (Search Field moved to toolbar) -->

            <!-- Content Type -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Content Type</label>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="type in ['all', 'mod', 'resourcepack', 'shader']" :key="type"
                  class="px-3 py-2 rounded-md text-sm border transition-all text-left flex items-center gap-2 capitalize"
                  :class="type === 'all'
                    ? selectedContentType === 'all'
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-border hover:border-primary/50'
                    : type === 'mod'
                      ? selectedContentType === 'mod'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                        : 'bg-card border-border hover:border-emerald-500/30 text-muted-foreground'
                      : type === 'resourcepack'
                        ? selectedContentType === 'resourcepack'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                          : 'bg-card border-border hover:border-blue-500/30 text-muted-foreground'
                        : selectedContentType === 'shader'
                          ? 'bg-pink-500/10 border-pink-500 text-pink-400'
                          : 'bg-card border-border hover:border-pink-500/30 text-muted-foreground'
                    " @click="setContentType(type)">
                  <span class="w-4 h-4 flex items-center justify-center text-sm">
                    <template v-if="type === 'mod'">
                      <Layers class="w-3 h-3" />
                    </template>
                    <template v-else-if="type === 'resourcepack'">
                      <Image class="w-3 h-3" />
                    </template>
                    <template v-else-if="type === 'shader'">
                      <Sparkles class="w-3 h-3" />
                    </template>
                    <template v-else>
                      <Layers class="w-3 h-3" />
                    </template>
                  </span>
                  <span class="truncate">{{
                    type === "resourcepack"
                      ? "Resource Pack"
                      : type === "all"
                        ? "All"
                        : type
                  }}</span>
                </button>
              </div>
            </div>

            <!-- Game Version -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Game Version</label>
              <select v-model="selectedGameVersion"
                class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">All Versions</option>
                <option v-for="v in gameVersions" :key="v" :value="v">
                  {{ v }}
                </option>
              </select>
            </div>

            <!-- Loader -->
            <div class="space-y-2" v-if="
              selectedContentType === 'all' || selectedContentType === 'mod'
            ">
              <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mod Loader</label>
              <select v-model="selectedLoader"
                class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">All Loaders</option>
                <option v-for="loader in loaders" :key="loader" :value="loader">
                  {{ loader }}
                </option>
              </select>
            </div>

            <!-- Modpack Status -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modpack Status</label>
              <select v-model="modpackFilter"
                class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="all">All Mods</option>
                <option value="any">In Any Modpack</option>
                <option value="none">Unused</option>
                <optgroup v-if="modpacks.length > 0" label="Specific Modpack">
                  <option v-for="pack in modpacks" :key="pack.id" :value="pack.id">
                    {{ pack.name }}
                  </option>
                </optgroup>
              </select>
            </div>

            <!-- Sorting -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sort By</label>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="field in sortFields" :key="field"
                  class="px-3 py-2 rounded-md text-sm border transition-all text-left capitalize flex items-center justify-between"
                  :class="sortBy === field
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-card border-border hover:border-primary/50'
                    " @click="toggleSort(field)">
                  {{ field === "created_at" ? "Date" : field }}
                  <span v-if="sortBy === field" class="text-xs opacity-70">{{
                    sortDir === "asc" ? "↑" : "↓"
                  }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-border bg-muted/20 mt-auto">
            <button
              class="w-full px-3 py-2 text-sm rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
              @click="
                selectedLoader = 'all';
              selectedGameVersion = 'all';
              selectedContentType = 'all';
              modpackFilter = 'all';
              searchField = 'all';
              searchQuery = '';
              ">
              Clear All Filters
            </button>
          </div>
        </div>
      </Transition>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-auto p-3 sm:p-6 pb-20">
        <!-- Results info + Pagination Controls -->
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing
              <template v-if="enableGrouping">
                {{ paginatedGroups.length }} of {{ groupedMods.length }} groups
              </template>
              <template v-else>
                {{ paginatedGroups.length }} of {{ filteredMods.length }} items
              </template>
              <span v-if="enableGrouping && groupedMods.some(g => g.variants.length > 0)"
                class="text-muted-foreground/70">
                ({{ filteredMods.length }} total mods)
              </span>
            </span>
            <button
              v-if="selectedLoader !== 'all' || selectedGameVersion !== 'all' || selectedContentType !== 'all' || modpackFilter !== 'all' || searchQuery"
              @click="selectedLoader = 'all'; selectedGameVersion = 'all'; selectedContentType = 'all'; modpackFilter = 'all'; searchQuery = '';"
              class="text-primary hover:underline">
              Clear filters
            </button>
          </div>

          <!-- Pagination Controls -->
          <div v-if="totalPages > 1" class="flex items-center gap-2">
            <!-- Items per page selector -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted-foreground hidden sm:inline">Show:</span>
              <select v-model.number="itemsPerPage"
                class="h-7 rounded-md border border-border bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </div>

            <div class="h-4 w-px bg-border mx-1" />

            <!-- Page navigation -->
            <div class="flex items-center gap-1">
              <button @click="goToPage(1)" :disabled="!canGoPrev"
                class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ««
              </button>
              <button @click="prevPage" :disabled="!canGoPrev"
                class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ‹
              </button>

              <span class="px-2 text-xs text-muted-foreground tabular-nums">
                {{ currentPage }} / {{ totalPages }}
              </span>

              <button @click="nextPage" :disabled="!canGoNext"
                class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ›
              </button>
              <button @click="goToPage(totalPages)" :disabled="!canGoNext"
                class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                »»
              </button>
            </div>
          </div>
        </div>

        <!-- Grid View -->
        <div v-if="viewMode === 'grid'">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <template v-for="group in paginatedGroups" :key="group.groupKey">
              <!-- Primary mod card with group indicator -->
              <ModCard :mod="group.primary" :selected="selectedModIds.has(group.primary.id)"
                :favorite="favoriteMods.has(group.primary.id)" :is-duplicate="duplicateModIds.has(group.primary.id)"
                :usage-count="modUsageMap.get(group.primary.id)?.size || 0" :show-thumbnail="showThumbnails"
                :group-variant-count="group.variants.length" :is-group-expanded="group.isExpanded"
                @delete="confirmDelete(group.primary.id)" @toggle-select="toggleSelection(group.primary.id)"
                @show-details="showModDetails(group.primary)" @toggle-favorite="toggleFavorite(group.primary.id)"
                @request-update="openUpdateDialog" @toggle-group="toggleGroup(group.groupKey)" />
              <!-- Variant cards (when expanded) -->
              <template v-if="group.isExpanded">
                <ModCard v-for="variant in group.variants" :key="variant.id" :mod="variant"
                  :selected="selectedModIds.has(variant.id)" :favorite="favoriteMods.has(variant.id)"
                  :is-duplicate="duplicateModIds.has(variant.id)" :usage-count="modUsageMap.get(variant.id)?.size || 0"
                  :show-thumbnail="showThumbnails" :is-variant="true" @delete="confirmDelete(variant.id)"
                  @toggle-select="toggleSelection(variant.id)" @show-details="showModDetails(variant)"
                  @toggle-favorite="toggleFavorite(variant.id)" @request-update="openUpdateDialog" />
              </template>
            </template>
          </div>
        </div>

        <!-- Gallery View - Image-focused masonry layout -->
        <div v-else-if="viewMode === 'gallery'">
          <div class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            <template v-for="group in paginatedGroups" :key="group.groupKey">
              <GalleryCard :mod="group.primary" :selected="selectedModIds.has(group.primary.id)"
                :favorite="favoriteMods.has(group.primary.id)" :is-duplicate="duplicateModIds.has(group.primary.id)"
                :usage-count="modUsageMap.get(group.primary.id)?.size || 0" :group-variant-count="group.variants.length"
                :is-group-expanded="group.isExpanded" @delete="confirmDelete(group.primary.id)"
                @toggle-select="toggleSelection(group.primary.id)" @show-details="showModDetails(group.primary)"
                @toggle-favorite="toggleFavorite(group.primary.id)" @request-update="openUpdateDialog"
                @toggle-group="toggleGroup(group.groupKey)" />
              <!-- Expanded variants -->
              <template v-if="group.isExpanded">
                <GalleryCard v-for="variant in group.variants" :key="variant.id" :mod="variant"
                  :selected="selectedModIds.has(variant.id)" :favorite="favoriteMods.has(variant.id)"
                  :is-duplicate="duplicateModIds.has(variant.id)" :usage-count="modUsageMap.get(variant.id)?.size || 0"
                  :is-variant="true" @delete="confirmDelete(variant.id)" @toggle-select="toggleSelection(variant.id)"
                  @show-details="showModDetails(variant)" @toggle-favorite="toggleFavorite(variant.id)"
                  @request-update="openUpdateDialog" />
              </template>
            </template>
          </div>
        </div>

        <!-- List View -->
        <div v-else-if="viewMode === 'list'">
          <div class="bg-card/50 rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table class="w-full text-sm min-w-[600px]">
              <thead class="bg-muted/50 border-b border-border">
                <tr>
                  <th v-if="visibleColumns.has('thumbnail')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs w-12">
                    Image
                  </th>
                  <th v-if="visibleColumns.has('name')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Name
                  </th>
                  <th v-if="visibleColumns.has('version')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Version
                  </th>
                  <th v-if="visibleColumns.has('loader')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Loader
                  </th>
                  <th v-if="visibleColumns.has('author')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Author
                  </th>
                  <th v-if="visibleColumns.has('game_version')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Game Ver
                  </th>
                  <th v-if="visibleColumns.has('date')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Date
                  </th>
                  <th v-if="visibleColumns.has('size')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Size
                  </th>
                  <th v-if="visibleColumns.has('usage')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Usage
                  </th>
                  <th class="text-right p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in paginatedGroups" :key="group.groupKey">
                  <tr class="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    :class="{ 'bg-primary/10': selectedModIds.has(group.primary.id) }"
                    @click="toggleSelection(group.primary.id)">
                    <td v-if="visibleColumns.has('thumbnail')" class="p-2 sm:p-3 w-12">
                      <div class="w-8 h-8 rounded-md overflow-hidden bg-muted border border-border">
                        <img v-if="group.primary.thumbnail_url || group.primary.logo_url"
                          :src="group.primary.logo_url || group.primary.thumbnail_url"
                          class="w-full h-full object-cover" @error="handleImageError" />
                        <Package v-else class="w-4 h-4 m-auto text-muted-foreground/40" />
                      </div>
                    </td>
                    <td v-if="visibleColumns.has('name')" class="p-2 sm:p-3 font-medium text-xs sm:text-sm">
                      <div class="flex items-center gap-2">
                        <!-- Group expand button (always visible in name column for accessibility) -->
                        <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                          class="p-0.5 rounded hover:bg-muted transition-colors shrink-0">
                          <ChevronRight class="w-3.5 h-3.5 transition-transform text-muted-foreground"
                            :class="{ 'rotate-90': group.isExpanded }" />
                        </button>
                        <span class="truncate">{{ group.primary.name }}</span>
                        <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                          class="px-1.5 py-0.5 rounded-full text-[9px] bg-primary/20 text-primary font-medium hover:bg-primary/30 transition-colors shrink-0">
                          +{{ group.variants.length }}
                        </button>
                      </div>
                    </td>
                    <td v-if="visibleColumns.has('version')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      {{ group.primary.version }}
                    </td>
                    <td v-if="visibleColumns.has('loader')" class="p-2 sm:p-3">
                      <span class="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs bg-muted">{{
                        group.primary.loader }}</span>
                    </td>
                    <td v-if="visibleColumns.has('author')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      {{ group.primary.author || "-" }}
                    </td>
                    <td v-if="visibleColumns.has('game_version')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      {{ group.primary.game_version || "-" }}
                    </td>
                    <td v-if="visibleColumns.has('date')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      {{ new Date(group.primary.created_at).toLocaleDateString() }}
                    </td>
                    <td v-if="visibleColumns.has('size')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      {{
                        group.primary.file_size
                          ? (group.primary.file_size / 1024 / 1024).toFixed(2) + " MB"
                          : "-"
                      }}
                    </td>
                    <td v-if="visibleColumns.has('usage')"
                      class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                      <span v-if="modUsageMap.get(group.primary.id)?.size"
                        class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                        {{ modUsageMap.get(group.primary.id)?.size }} packs
                      </span>
                      <span v-else class="text-muted-foreground/50">-</span>
                    </td>

                    <td class="p-2 sm:p-3 text-right">
                      <div class="flex justify-end gap-0.5 sm:gap-1" @click.stop>
                        <Button variant="ghost" size="icon"
                          class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground"
                          @click="showModDetails(group.primary)">
                          <Info class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                          @click="confirmDelete(group.primary.id)">
                          <Trash2 class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <!-- Variant rows (when expanded) -->
                  <template v-if="group.isExpanded">
                    <tr v-for="variant in group.variants" :key="variant.id"
                      class="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors bg-muted/20"
                      :class="{ 'bg-primary/10': selectedModIds.has(variant.id) }" @click="toggleSelection(variant.id)">
                      <td v-if="visibleColumns.has('thumbnail')" class="p-2 sm:p-3 w-12">
                        <div class="flex items-center gap-1 pl-5">
                          <div class="w-6 h-6 rounded-md overflow-hidden bg-muted border border-border">
                            <img v-if="variant.thumbnail_url || variant.logo_url"
                              :src="variant.logo_url || variant.thumbnail_url" class="w-full h-full object-cover"
                              @error="handleImageError" />
                            <Package v-else class="w-3 h-3 m-auto text-muted-foreground/40" />
                          </div>
                        </div>
                      </td>
                      <td v-if="visibleColumns.has('name')"
                        class="p-2 sm:p-3 font-medium text-xs sm:text-sm text-muted-foreground">
                        <div class="flex items-center gap-2">
                          <ChevronRight class="w-3 h-3" />
                          {{ variant.name }}
                        </div>
                      </td>
                      <td v-if="visibleColumns.has('version')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        {{ variant.version }}
                      </td>
                      <td v-if="visibleColumns.has('loader')" class="p-2 sm:p-3">
                        <span class="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs bg-muted">{{ variant.loader
                        }}</span>
                      </td>
                      <td v-if="visibleColumns.has('author')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        {{ variant.author || "-" }}
                      </td>
                      <td v-if="visibleColumns.has('game_version')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        {{ variant.game_version || "-" }}
                      </td>
                      <td v-if="visibleColumns.has('date')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        {{ new Date(variant.created_at).toLocaleDateString() }}
                      </td>
                      <td v-if="visibleColumns.has('size')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        {{
                          variant.file_size
                            ? (variant.file_size / 1024 / 1024).toFixed(2) + " MB"
                            : "-"
                        }}
                      </td>
                      <td v-if="visibleColumns.has('usage')"
                        class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs">
                        <span v-if="modUsageMap.get(variant.id)?.size"
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          {{ modUsageMap.get(variant.id)?.size }} packs
                        </span>
                        <span v-else class="text-muted-foreground/50">-</span>
                      </td>
                      <td class="p-2 sm:p-3 text-right">
                        <div class="flex justify-end gap-0.5 sm:gap-1" @click.stop>
                          <Button variant="ghost" size="icon"
                            class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground"
                            @click="showModDetails(variant)">
                            <Info class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                            @click="confirmDelete(variant.id)">
                            <Trash2 class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Compact View -->
        <div v-else>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
            <template v-for="group in paginatedGroups" :key="group.groupKey">
              <div
                class="relative p-2 rounded-lg border border-border cursor-pointer transition-all hover:bg-muted/50 hover:border-border group"
                :class="{
                  'ring-1 ring-primary bg-primary/5': selectedModIds.has(group.primary.id),
                }" @click="toggleSelection(group.primary.id)" @dblclick="showModDetails(group.primary)">
                <div class="font-medium text-xs truncate pr-6">{{ group.primary.name }}</div>
                <div class="text-[10px] text-muted-foreground truncate">
                  {{ group.primary.loader }} • {{ group.primary.version }}
                </div>
                <!-- Group badge -->
                <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                  class="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-medium transition-all"
                  :class="group.isExpanded ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'">
                  +{{ group.variants.length }}
                </button>
              </div>
              <!-- Variant cards (when expanded) -->
              <template v-if="group.isExpanded">
                <div v-for="variant in group.variants" :key="variant.id"
                  class="p-2 rounded-lg border border-border/50 cursor-pointer transition-all hover:bg-muted/50 bg-muted/20"
                  :class="{
                    'ring-1 ring-primary bg-primary/5': selectedModIds.has(variant.id),
                  }" @click="toggleSelection(variant.id)" @dblclick="showModDetails(variant)">
                  <div class="font-medium text-xs truncate text-muted-foreground">
                    <ChevronRight class="w-2.5 h-2.5 inline -ml-0.5" /> {{ variant.game_version }}
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate">
                    {{ variant.loader }} • {{ variant.version }}
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Details Sidebar -->
    <Transition enter-active-class="transition-transform duration-200 ease-out" enter-from-class="translate-x-full"
      enter-to-class="translate-x-0" leave-active-class="transition-transform duration-150 ease-in"
      leave-from-class="translate-x-0" leave-to-class="translate-x-full">
      <div v-if="showDetails && detailsMod"
        class="fixed top-0 right-0 h-full w-80 bg-background border-l border-border shadow-2xl z-40 flex flex-col">
        <div class="p-4 border-b border-border flex items-center justify-between">
          <h3 class="font-semibold">Mod Details</h3>
          <Button variant="ghost" size="icon" class="h-7 w-7 text-muted-foreground hover:text-foreground"
            @click="closeDetails">
            <X class="w-4 h-4" />
          </Button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h4 class="text-lg font-bold">{{ detailsMod.name }}</h4>
            <p class="text-sm text-muted-foreground">
              {{ detailsMod.version }}
            </p>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between items-center">
              <span class="text-muted-foreground">Loader</span>
              <span class="px-2 py-0.5 rounded-md text-xs bg-muted">{{
                detailsMod.loader
              }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Author</span>
              <span>{{ detailsMod.author || "-" }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Game Version</span>
              <span class="px-2 py-0.5 rounded-md text-xs bg-emerald-500/20 text-emerald-400">{{ detailsMod.game_version
              }}</span>
            </div>
          </div>
          <div>
            <span class="text-xs text-muted-foreground">Description</span>
            <p class="text-sm mt-1 text-muted-foreground">
              {{ detailsMod.description || "No description" }}
            </p>
          </div>

          <!-- Modpack Usage -->
          <div v-if="modUsageMap.get(detailsMod.id)?.size">
            <span class="text-xs text-muted-foreground">Used in Modpacks</span>
            <div class="mt-1 space-y-1">
              <div v-for="packId in modUsageMap.get(detailsMod.id)" :key="packId"
                class="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/10 text-sm">
                <Package class="w-3.5 h-3.5 text-primary" />
                <span>{{
                  modpacks.find((p) => p.id === packId)?.name ||
                  "Unknown Modpack"
                }}</span>
              </div>
            </div>
          </div>

          <div>
            <span class="text-xs text-muted-foreground">Source</span>
            <p class="text-xs mt-1 font-mono break-all bg-white/5 p-2 rounded-md border border-white/5">
              {{ detailsMod.source }} (ID: {{ detailsMod.cf_project_id }})
            </p>
          </div>
          <div>
            <span class="text-xs text-muted-foreground">Filename</span>
            <p class="text-xs mt-1 font-mono break-all bg-white/5 p-2 rounded-md border border-white/5">
              {{ detailsMod.filename }}
            </p>
          </div>
        </div>
        <div class="p-4 border-t border-white/5 flex gap-2">
          <Button variant="destructive" class="flex-1" @click="confirmDelete(detailsMod.id)">Delete</Button>
        </div>
      </div>
    </Transition>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModIds.size > 0" :count="selectedModIds.size" label="mods" @clear="clearSelection">
      <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDelete">
        <Trash2 class="w-4 h-4" />
        Delete
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" @click="showMoveToFolderDialog = true">
        <FolderInput class="w-4 h-4" />
        Move to Folder
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" :disabled="!selectedModsCompatibility.compatible" :title="selectedModsCompatibility.compatible
        ? 'Create modpack from selected mods'
        : 'Selected mods have different game versions or loaders'
        " @click="showCreateModpackDialog = true">
        <PackagePlus class="w-4 h-4" />
        Create Pack
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" @click="showAddToModpackDialog = true">
        <PlusCircle class="w-4 h-4" />
        Add to Pack
      </Button>
    </BulkActionBar>

    <!-- Dialogs -->
    <Dialog :open="showDeleteDialog" title="Delete Mod" description="This action cannot be undone.">
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="deleteMod">Delete</Button>
      </template>
    </Dialog>

    <ConfirmDialog :open="showBulkDeleteDialog" title="Delete Selected Mods" :message="`Are you sure you want to delete ${selectedModIds.size
      } selected mod${selectedModIds.size > 1 ? 's' : ''
      }? This action cannot be undone.`" confirm-text="Delete" variant="danger" icon="trash"
      @confirm="deleteSelectedMods" @cancel="showBulkDeleteDialog = false" @close="showBulkDeleteDialog = false" />

    <CreateModpackDialog :open="showCreateModpackDialog" :initial-mods-count="selectedModIds.size"
      :forced-minecraft-version="selectedModsCompatibility.gameVersion || undefined
        " :forced-loader="selectedModsCompatibility.loader || undefined" @close="showCreateModpackDialog = false"
      @create="createModpackFromSelection" />

    <AddToModpackDialog :open="showAddToModpackDialog" :mods="mods.filter((m) => selectedModIds.has(m.id))"
      @close="showAddToModpackDialog = false" @select="addSelectionToModpack" />

    <!-- Move to Folder Dialog -->
    <Dialog :open="showMoveToFolderDialog" title="Move to Folder"
      :description="`Move ${selectedModIds.size} mod(s) to a folder`">
      <div class="space-y-2 max-h-64 overflow-auto">
        <!-- Root option (no folder) -->
        <button class="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
          @click="moveSelectedToFolder(null)">
          <Folder class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm">No folder (root)</span>
        </button>

        <!-- Folders list -->
        <button v-for="folder in folders" :key="folder.id"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
          @click="moveSelectedToFolder(folder.id)">
          <Folder class="w-4 h-4" :style="{ color: folder.color }" />
          <span class="text-sm">{{ folder.name }}</span>
        </button>

        <p v-if="folders.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No folders yet. Create one in the Organize view.
        </p>
      </div>

      <template #footer>
        <Button variant="outline" @click="showMoveToFolderDialog = false">Cancel</Button>
        <Button variant="outline" @click="router.push('/organize')">
          <FolderPlus class="w-4 h-4 mr-2" />
          New Folder
        </Button>
      </template>
    </Dialog>

    <ProgressDialog :open="showProgress" :title="progressTitle" :message="progressMessage" />

    <!-- Mod Usage Warning Dialog -->
    <Dialog :open="showUsageWarningDialog" title="Mods Used in Modpacks"
      description="The following mods are used in one or more modpacks:">
      <div class="space-y-3 max-h-64 overflow-auto">
        <div v-for="usage in modUsageInfo" :key="usage.modId"
          class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div class="font-medium text-sm text-amber-600 dark:text-amber-400">
            {{ usage.modName }}
          </div>
          <div class="text-xs text-muted-foreground mt-1">
            Used in: {{usage.modpacks.map((mp) => mp.name).join(", ")}}
          </div>
        </div>
      </div>

      <div class="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
        <div class="text-sm font-medium mb-2">Choose an action:</div>
        <div class="text-xs text-muted-foreground space-y-1">
          <div>
            <strong>Delete & Remove from Modpacks:</strong> The mod will be
            removed from all modpacks before deletion.
          </div>
          <div>
            <strong>Delete Only:</strong> The mod references will remain in the
            modpacks (may cause issues).
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="outline" @click="cancelUsageWarning"> Cancel </Button>
        <Button variant="destructive" @click="deleteModsWithCleanup(true)">
          <Trash2 class="w-4 h-4 mr-2" />
          Delete & Remove
        </Button>
      </template>
    </Dialog>

    <!-- Updates Dialog -->
    <UpdatesDialog :open="showUpdatesDialog" @close="showUpdatesDialog = false" @updated="loadMods" />

    <ModUpdateDialog :open="showSingleModUpdateDialog" :mod="selectedUpdateMod"
      :minecraft-version="selectedUpdateMod?.game_version || '1.20.1'" :loader="selectedUpdateMod?.loader || 'forge'"
      @close="showSingleModUpdateDialog = false" @updated="handleModUpdated" />

    <!-- CurseForge Search Dialog -->
    <CurseForgeSearch :open="showCurseForgeSearch" :installed-project-files="installedProjectFiles"
      @close="showCurseForgeSearch = false" @added="loadMods" />
  </div>
</template>

<style scoped>
/* Slide transition for filter sidebar */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}
</style>
