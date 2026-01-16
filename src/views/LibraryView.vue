<script setup lang="ts">
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
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ModDetailsModal from "@/components/mods/ModDetailsModal.vue";
import LibraryDragOverlay from "@/components/library/LibraryDragOverlay.vue";
import LibraryEmptyState from "@/components/library/LibraryEmptyState.vue";
import LibraryPaginationControls from "@/components/library/LibraryPaginationControls.vue";
import LibraryResultsInfo from "@/components/library/LibraryResultsInfo.vue";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useToast } from "@/composables/useToast";
import { useLibraryFavorites } from "@/composables/useLibraryFavorites";
import { useLibrarySettings } from "@/composables/useLibrarySettings";
import { useLibrarySelection } from "@/composables/useLibrarySelection";
import { useLibraryFiltering, type ModGroup } from "@/composables/useLibraryFiltering";
import { useLibraryPagination } from "@/composables/useLibraryPagination";
import Icon from "@/components/ui/Icon.vue";
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Mod, Modpack } from "@/types/electron";
import ModsIcon from "@/assets/modex_mods_icon.png";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// ============================================================================
// COMPOSABLES INTEGRATION
// ============================================================================

// Core data state (not extracted - specific to this view)
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);
const modUsageMap = ref<Map<string, Set<string>>>(new Map()); // ModID -> Set<ModpackID>
const isLoading = ref(true);
const error = ref<string | null>(null);

// Favorites composable
const {
  favoriteMods,
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  isFavorite,
} = useLibraryFavorites();

// Settings composable (provides all persistent settings refs)
const {
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
  loadSettings,
  setupAutoSave,
} = useLibrarySettings();

// Filtering composable (provides search, filter, and grouping logic)
const {
  searchQuery,
  searchQueryDebounced,
  quickFilter,
  expandedGroups,
  loaderStats,
  loaders,
  contentTypeCounts,
  gameVersions,
  activeFilterCount,
  filteredMods,
  groupedMods,
  displayMods,
  clearAllFilters,
  toggleGroup,
  getGroupInfo,
  toggleSort,
} = useLibraryFiltering({
  mods,
  modUsageMap,
  favoriteMods,
  sortBy,
  sortDir,
  enableGrouping,
  selectedLoader,
  selectedGameVersion,
  selectedContentType,
  modpackFilter,
  searchField,
});

// Pagination composable
const {
  currentPage,
  itemsPerPage: paginationItemsPerPage,
  itemsPerPageOptions,
  totalPages,
  paginatedItems: paginatedGroups,
  canGoPrev,
  canGoNext,
  goToPage,
  prevPage,
  nextPage,
} = useLibraryPagination({
  items: groupedMods,
  filterDeps: [
    searchQueryDebounced,
    selectedLoader,
    selectedGameVersion,
    selectedContentType,
    modpackFilter,
    quickFilter,
  ],
});

// Sync pagination itemsPerPage with settings
watch(itemsPerPage, (val) => {
  paginationItemsPerPage.value = val;
}, { immediate: true });
watch(paginationItemsPerPage, (val) => {
  itemsPerPage.value = val;
});

// Computed for component props
const hasActiveFilters = computed(() => activeFilterCount.value > 0);
const hasExpandedGroups = computed(() => groupedMods.value.some((g) => g.variants.length > 0));

// Selection composable
const {
  selectedModIds,
  selectedModsCompatibility,
  toggleSelection,
  clearSelection,
  selectAll,
  selectNone,
  cleanupSelection,
} = useLibrarySelection({
  mods,
  filteredMods,
});

// ============================================================================
// LOCAL STATE (not extracted - view-specific)
// ============================================================================

// Search input ref for focus
const searchInputRef = ref<HTMLInputElement | null>(null);

// UI State
const showColumnSelector = ref(false);

// Duplicate detection
const duplicates = ref<Map<string, string[]>>(new Map());

// Sorting fields constant
const sortFields = ["name", "loader", "version", "created_at"] as const;

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

// Details Panel
const showDetails = ref(false);
const detailsMod = ref<Mod | null>(null);

// Dialog States
const showDeleteDialog = ref(false);
const showBulkDeleteDialog = ref(false);
const showCreateModpackDialog = ref(false);
const showAddToModpackDialog = ref(false);
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

// Duplicate detection
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

    // Clean up selection for removed mods
    const currentIds = new Set(mods.value.map((m) => m.id!));
    cleanupSelection(currentIds);

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

// Details Panel - now uses modal
function showModDetails(mod: Mod) {
  detailsMod.value = mod;
  showDetails.value = true;
}

function closeDetails() {
  showDetails.value = false;
  detailsMod.value = null;
}

// Handle version change from ModDetailsModal (for library, this updates the mod)
async function handleLibraryVersionChange(fileId: number) {
  if (!detailsMod.value) return;

  try {
    const result = await window.api.updates.applyUpdate(
      detailsMod.value.id,
      fileId
    );
    if (result.success) {
      toast.success(
        "Updated ✓",
        `${detailsMod.value.name} version changed.`
      );
      await loadMods();
      closeDetails();
    } else {
      toast.error(
        "Couldn't update",
        result.error || "Version change failed."
      );
    }
  } catch (err: any) {
    toast.error("Couldn't update", err?.message || "Unknown error");
  }
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
    toast.success("Deleted ✓", `Removed ${deletedCount} mods.`);
  } catch (err) {
    toast.error("Couldn't delete", (err as Error).message);
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
  target.style.display = "none";
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
      "Pack created ✓",
      `"${data.name}" now has ${ids.length} mods.`
    );
  } catch (err) {
    toast.error("Couldn't create pack", (err as Error).message);
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
      "No compatible mods",
      "The selected mods don't match this pack's version."
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
        "Added ✓",
        `${compatibleModIds.length} mods added (${skippedCount} skipped – not compatible).`
      );
    } else {
      toast.success(
        "Added ✓",
        `${compatibleModIds.length} mods now in your pack.`
      );
    }
  } catch (err) {
    toast.error("Couldn't add mods", (err as Error).message);
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
    toast.error("Couldn't delete", (err as Error).message);
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
      ? `Removed ${count} mod(s) from library and packs.`
      : `Removed ${count} mod(s) from library.`;
    toast.success("Deleted ✓", message);

    if (
      showDetails.value &&
      pendingDeleteModIds.value.includes(detailsMod.value?.id || "")
    ) {
      closeDetails();
    }
  } catch (err) {
    toast.error("Couldn't delete", (err as Error).message);
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
    "Use Add Mods instead",
    "Drag & drop is disabled. Use the 'Add Mods' button to browse CurseForge, or import packs from My Packs."
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
    if (action === "browse") {
      router.push("/library/search");
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
    if (modId && typeof modId === "string") {
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
    if (action === "add") {
      // Select the mod and open add to modpack dialog
      selectedModIds.value.clear();
      selectedModIds.value.add(modId);
      showAddToModpackDialog.value = true;
    } else {
      // Just show details
      showModDetails(mod);
    }
    // Clear the query params after handling
    router.replace({
      path: "/library",
      query: { ...route.query, mod: undefined, action: undefined },
    });
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
        confirmBulkDelete();
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
  setupAutoSave(); // Enable auto-save after loading settings
  loadMods();
});
</script>

<template>
  <div class="h-full flex flex-col relative" @dragenter="handleDragEnter" @dragover="handleDragOver"
    @dragleave="handleDragLeave" @drop="handleDrop">
    <!-- Drag & Drop Overlay -->
    <LibraryDragOverlay :visible="isDragging" />

    <!-- Unified Header -->
    <header class="shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm z-20">
      <div class="px-4 sm:px-6 py-3">
        <div class="flex items-center gap-4">
          <!-- Title Section -->
          <div class="flex items-center gap-3 shrink-0">
            <img :src="ModsIcon" alt="Library" class="w-16 h-16 object-contain" />
            <div>
              <h1 class="text-lg font-semibold">Library</h1>
              <p class="text-xs text-muted-foreground">{{ mods.length }} items</p>
            </div>
          </div>

          <div class="hidden sm:block h-8 w-px bg-border/50" />

          <!-- Quick Filters -->
          <div class="hidden sm:flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg">
            <button class="px-3 py-1.5 text-xs rounded-md transition-all"
              :class="quickFilter === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="quickFilter = 'all'; router.push('/library');">
              All
            </button>
            <button class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all"
              :class="quickFilter === 'favorites' ? 'bg-rose-500/15 text-rose-400' : 'text-muted-foreground hover:text-foreground'"
              @click="quickFilter = 'favorites'; router.push('/library?filter=favorites');">
              <Icon name="Heart" class="w-3 h-3" :class="quickFilter === 'favorites' ? 'fill-rose-400' : ''" />
            </button>
            <button class="px-2.5 py-1.5 text-xs rounded-md transition-all"
              :class="quickFilter === 'recent' ? 'bg-blue-500/15 text-blue-400' : 'text-muted-foreground hover:text-foreground'"
              @click="quickFilter = 'recent'; router.push('/library?filter=recent');">
              Recent
            </button>
          </div>

          <!-- Center: Search & Controls -->
          <div class="hidden md:flex items-center gap-2 flex-1 justify-center max-w-xl">
            <div class="relative flex-1 max-w-xs">
              <Icon name="Search"
                class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input v-model="searchQuery" :placeholder="searchField === 'all' ? 'Search...' : `By ${searchField}...`"
                class="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted/40 border border-border/50 focus:border-primary/50 focus:ring-0 outline-none transition-colors" />
            </div>

            <button @click="showFilters = !showFilters" class="relative p-2 rounded-lg transition-colors"
              :class="showFilters || activeFilterCount > 0 ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'">
              <Icon name="Filter" class="w-4 h-4" />
              <span v-if="activeFilterCount > 0"
                class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {{ activeFilterCount }}
              </span>
            </button>

            <div class="flex items-center p-0.5 bg-muted/40 rounded-lg">
              <button @click="viewMode = 'grid'" class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'">
                <Icon name="LayoutGrid" class="w-3.5 h-3.5" />
              </button>
              <button @click="viewMode = 'gallery'" class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'gallery' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'">
                <Icon name="GalleryVertical" class="w-3.5 h-3.5" />
              </button>
              <button @click="viewMode = 'list'" class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'">
                <Icon name="List" class="w-3.5 h-3.5" />
              </button>
              <button @click="viewMode = 'compact'" class="p-1.5 rounded-md transition-colors"
                :class="viewMode === 'compact' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'">
                <Icon name="LayoutList" class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="relative" v-if="viewMode === 'list'">
              <button @click="showColumnSelector = !showColumnSelector" class="p-1.5 rounded-lg transition-colors"
                :class="showColumnSelector ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'">
                <Icon name="Columns" class="w-3.5 h-3.5" />
              </button>
              <div v-if="showColumnSelector"
                class="absolute top-full right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-[100] p-2 space-y-1">
                <div class="text-xs font-medium text-muted-foreground px-2 py-1">Visible Columns</div>
                <label v-for="col in availableColumns" :key="col.id"
                  class="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                  <input type="checkbox" :checked="visibleColumns.has(col.id)"
                    @change="visibleColumns.has(col.id) ? visibleColumns.delete(col.id) : visibleColumns.add(col.id)"
                    class="rounded border-muted-foreground/30 text-primary focus:ring-primary" />
                  {{ col.label }}
                </label>
              </div>
              <div v-if="showColumnSelector" class="fixed inset-0 z-40" @click="showColumnSelector = false" />
            </div>

            <button @click="enableGrouping = !enableGrouping" class="p-1.5 rounded-lg transition-colors"
              :class="enableGrouping ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'">
              <Icon name="Layers" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 ml-auto shrink-0">
            <Button @click="router.push('/library/search')" size="sm" class="gap-1.5 h-8 px-3 text-xs">
              <Icon name="Globe" class="w-4 h-4" />
              <span class="hidden sm:inline">Add Mods</span>
            </Button>
            <Button @click="showUpdatesDialog = true" :disabled="!isElectron()" variant="outline" size="sm"
              class="gap-1.5 h-8 px-2.5">
              <Icon name="ArrowUpCircle" class="w-4 h-4 text-green-500" />
              <span class="hidden lg:inline text-xs">Updates</span>
            </Button>
          </div>
        </div>

        <!-- Mobile Search Row -->
        <div class="md:hidden flex items-center gap-2 mt-3">
          <div class="relative flex-1">
            <Icon name="Search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input v-model="searchQuery" placeholder="Search..."
              class="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-muted/40 border border-border/50 focus:border-primary/50 outline-none" />
          </div>
          <button @click="showFilters = !showFilters" class="p-2 rounded-lg transition-colors"
            :class="showFilters || activeFilterCount > 0 ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground'">
            <Icon name="Filter" class="w-4 h-4" />
          </button>
          <div class="flex items-center p-0.5 bg-muted/40 rounded-lg">
            <button @click="viewMode = 'grid'" class="p-1.5 rounded-md transition-colors"
              :class="viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">
              <Icon name="LayoutGrid" class="w-3.5 h-3.5" />
            </button>
            <button @click="viewMode = 'list'" class="p-1.5 rounded-md transition-colors"
              :class="viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'">
              <Icon name="List" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>

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

    <div v-else-if="mods.length === 0">
      <LibraryEmptyState />
    </div>

    <div v-else class="flex-1 flex overflow-hidden bg-background">
      <!-- Filter Sidebar (inline like ModpackView) / Mobile Overlay -->
      <Transition name="slide">
        <div v-if="showFilters" class="fixed md:relative inset-0 md:inset-auto z-40 md:z-auto md:w-64 shrink-0 h-full">
          <!-- Mobile Backdrop -->
          <div class="absolute inset-0 bg-black/50 md:hidden" @click="showFilters = false"></div>

          <!-- Filter Panel -->
          <div
            class="absolute md:relative right-0 top-0 bottom-0 w-72 md:w-full h-full border-l md:border-l-0 md:border-r border-border bg-card p-4 overflow-y-auto flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-sm flex items-center gap-2">
                <Icon name="Filter" class="w-4 h-4" />
                Filters
              </h3>
              <button @click="showFilters = false" class="p-1 rounded-md hover:bg-muted text-muted-foreground">
                <Icon name="X" class="w-4 h-4" />
              </button>
            </div>

            <div class="space-y-4">
              <!-- Quick Type Filter (simplified from 2x2 grid) -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <select v-model="selectedContentType"
                  class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="all">All Types</option>
                  <option value="mod">Mods Only</option>
                  <option value="resourcepack">Resource Packs</option>
                  <option value="shader">Shaders</option>
                </select>
              </div>

              <!-- Version & Loader (combined row for visual simplicity) -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Version</label>
                <select v-model="selectedGameVersion"
                  class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="all">Any Version</option>
                  <option v-for="v in gameVersions" :key="v" :value="v">
                    {{ v }}
                  </option>
                </select>
              </div>

              <!-- Loader (only when viewing mods) -->
              <div class="space-y-2" v-if="
                selectedContentType === 'all' || selectedContentType === 'mod'
              ">
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Loader</label>
                <select v-model="selectedLoader"
                  class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="all">Any Loader</option>
                  <option v-for="loader in loaders" :key="loader" :value="loader">
                    {{ loader }}
                  </option>
                </select>
              </div>

              <!-- Usage Status (simplified labels) -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Usage</label>
                <select v-model="modpackFilter"
                  class="w-full h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="all">Any Status</option>
                  <option value="any">Used</option>
                  <option value="none">Unused</option>
                  <optgroup v-if="modpacks.length > 0" label="In Pack">
                    <option v-for="pack in modpacks" :key="pack.id" :value="pack.id">
                      {{ pack.name }}
                    </option>
                  </optgroup>
                </select>
              </div>

              <!-- Sort (simplified to single select) -->
              <div class="space-y-2">
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sort</label>
                <div class="flex gap-2">
                  <select v-model="sortBy"
                    class="flex-1 h-9 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="name">Name</option>
                    <option value="created_at">Date Added</option>
                    <option value="version">Version</option>
                    <option value="loader">Loader</option>
                  </select>
                  <button @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
                    class="h-9 w-9 rounded-md border border-border bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
                    :title="sortDir === 'asc' ? 'Ascending' : 'Descending'">
                    <span class="text-sm">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="p-4 border-t border-border bg-muted/20 mt-auto">
              <button v-if="activeFilterCount > 0"
                class="w-full px-3 py-2 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all flex items-center justify-center gap-2"
                @click="clearAllFilters">
                <Icon name="X" class="w-3.5 h-3.5" />
                Clear All Filters
              </button>
              <p v-else class="text-xs text-muted-foreground text-center">
                No active filters
              </p>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-auto p-3 sm:p-6 pb-20">
        <!-- Results info + Pagination Controls -->
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <LibraryResultsInfo :enable-grouping="enableGrouping" :paginated-groups-length="paginatedGroups.length"
            :grouped-mods-length="groupedMods.length" :filtered-mods-length="filteredMods.length"
            :has-expanded-groups="hasExpandedGroups" :has-active-filters="hasActiveFilters"
            @clear-filters="clearAllFilters" />

          <LibraryPaginationControls :current-page="currentPage" :total-pages="totalPages"
            :items-per-page="itemsPerPage" :items-per-page-options="itemsPerPageOptions" :can-go-prev="canGoPrev"
            :can-go-next="canGoNext" @update:items-per-page="itemsPerPage = $event" @go-to-page="goToPage"
            @prev-page="prevPage" @next-page="nextPage" />
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
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs w-12">
                    Image
                  </th>
                  <th v-if="visibleColumns.has('name')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Name
                  </th>
                  <th v-if="visibleColumns.has('version')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Version
                  </th>
                  <th v-if="visibleColumns.has('loader')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Loader
                  </th>
                  <th v-if="visibleColumns.has('author')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Author
                  </th>
                  <th v-if="visibleColumns.has('game_version')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Game Ver
                  </th>
                  <th v-if="visibleColumns.has('date')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Date
                  </th>
                  <th v-if="visibleColumns.has('size')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Size
                  </th>
                  <th v-if="visibleColumns.has('usage')"
                    class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Usage
                  </th>
                  <th class="text-right p-2 sm:p-3 font-medium text-muted-foreground text-caption sm:text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in paginatedGroups" :key="group.groupKey">
                  <tr class="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    :class="{
                      'bg-primary/10': selectedModIds.has(group.primary.id),
                    }" @click="toggleSelection(group.primary.id)">
                    <td v-if="visibleColumns.has('thumbnail')" class="p-2 sm:p-3 w-12">
                      <div class="w-8 h-8 rounded-md overflow-hidden bg-muted border border-border">
                        <img v-if="
                          group.primary.thumbnail_url ||
                          group.primary.logo_url
                        " :src="group.primary.logo_url ||
                          group.primary.thumbnail_url
                          " class="w-full h-full object-cover" @error="handleImageError" />
                        <Icon v-else name="Package" class="w-4 h-4 m-auto text-muted-foreground/40" />
                      </div>
                    </td>
                    <td v-if="visibleColumns.has('name')" class="p-2 sm:p-3 font-medium text-xs sm:text-sm">
                      <div class="flex items-center gap-2">
                        <!-- Group expand button (always visible in name column for accessibility) -->
                        <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                          class="p-0.5 rounded hover:bg-muted transition-colors shrink-0">
                          <Icon name="ChevronRight" class="w-3.5 h-3.5 transition-transform text-muted-foreground"
                            :class="{ 'rotate-90': group.isExpanded }" />
                        </button>
                        <span class="truncate">{{ group.primary.name }}</span>
                        <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                          class="px-1.5 py-0.5 rounded-full text-micro bg-primary/20 text-primary font-medium hover:bg-primary/30 transition-colors shrink-0">
                          +{{ group.variants.length }}
                        </button>
                      </div>
                    </td>
                    <td v-if="visibleColumns.has('version')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      {{ group.primary.version }}
                    </td>
                    <td v-if="visibleColumns.has('loader')" class="p-2 sm:p-3">
                      <span class="px-1.5 sm:px-2 py-0.5 rounded-md text-caption sm:text-xs bg-muted">{{
                        group.primary.loader }}</span>
                    </td>
                    <td v-if="visibleColumns.has('author')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      {{ group.primary.author || "-" }}
                    </td>
                    <td v-if="visibleColumns.has('game_version')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      {{ group.primary.game_version || "-" }}
                    </td>
                    <td v-if="visibleColumns.has('date')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      {{
                        new Date(group.primary.created_at).toLocaleDateString()
                      }}
                    </td>
                    <td v-if="visibleColumns.has('size')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      {{
                        group.primary.file_size
                          ? (group.primary.file_size / 1024 / 1024).toFixed(2) +
                          " MB"
                          : "-"
                      }}
                    </td>
                    <td v-if="visibleColumns.has('usage')"
                      class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                      <span v-if="modUsageMap.get(group.primary.id)?.size"
                        class="inline-flex items-center px-1.5 py-0.5 rounded-full text-caption font-medium bg-primary/10 text-primary">
                        {{ modUsageMap.get(group.primary.id)?.size }} packs
                      </span>
                      <span v-else class="text-muted-foreground/50">-</span>
                    </td>

                    <td class="p-2 sm:p-3 text-right">
                      <div class="flex justify-end gap-0.5 sm:gap-1" @click.stop>
                        <Button variant="ghost" size="icon"
                          class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground"
                          @click="showModDetails(group.primary)">
                          <Icon name="Info" class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                          @click="confirmDelete(group.primary.id)">
                          <Icon name="Trash2" class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <!-- Variant rows (when expanded) -->
                  <template v-if="group.isExpanded">
                    <tr v-for="variant in group.variants" :key="variant.id"
                      class="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors bg-muted/20"
                      :class="{
                        'bg-primary/10': selectedModIds.has(variant.id),
                      }" @click="toggleSelection(variant.id)">
                      <td v-if="visibleColumns.has('thumbnail')" class="p-2 sm:p-3 w-12">
                        <div class="flex items-center gap-1 pl-5">
                          <div class="w-6 h-6 rounded-md overflow-hidden bg-muted border border-border">
                            <img v-if="variant.thumbnail_url || variant.logo_url"
                              :src="variant.logo_url || variant.thumbnail_url" class="w-full h-full object-cover"
                              @error="handleImageError" />
                            <Icon v-else name="Package" class="w-3 h-3 m-auto text-muted-foreground/40" />
                          </div>
                        </div>
                      </td>
                      <td v-if="visibleColumns.has('name')"
                        class="p-2 sm:p-3 font-medium text-xs sm:text-sm text-muted-foreground">
                        <div class="flex items-center gap-2">
                          <Icon name="ChevronRight" class="w-3 h-3" />
                          {{ variant.name }}
                        </div>
                      </td>
                      <td v-if="visibleColumns.has('version')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        {{ variant.version }}
                      </td>
                      <td v-if="visibleColumns.has('loader')" class="p-2 sm:p-3">
                        <span class="px-1.5 sm:px-2 py-0.5 rounded-md text-caption sm:text-xs bg-muted">{{
                          variant.loader
                        }}</span>
                      </td>
                      <td v-if="visibleColumns.has('author')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        {{ variant.author || "-" }}
                      </td>
                      <td v-if="visibleColumns.has('game_version')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        {{ variant.game_version || "-" }}
                      </td>
                      <td v-if="visibleColumns.has('date')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        {{ new Date(variant.created_at).toLocaleDateString() }}
                      </td>
                      <td v-if="visibleColumns.has('size')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        {{
                          variant.file_size
                            ? (variant.file_size / 1024 / 1024).toFixed(2) +
                            " MB"
                            : "-"
                        }}
                      </td>
                      <td v-if="visibleColumns.has('usage')"
                        class="p-2 sm:p-3 text-muted-foreground text-caption sm:text-xs">
                        <span v-if="modUsageMap.get(variant.id)?.size"
                          class="inline-flex items-center px-1.5 py-0.5 rounded-full text-caption font-medium bg-primary/10 text-primary">
                          {{ modUsageMap.get(variant.id)?.size }} packs
                        </span>
                        <span v-else class="text-muted-foreground/50">-</span>
                      </td>
                      <td class="p-2 sm:p-3 text-right">
                        <div class="flex justify-end gap-0.5 sm:gap-1" @click.stop>
                          <Button variant="ghost" size="icon"
                            class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground"
                            @click="showModDetails(variant)">
                            <Icon name="Info" class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                            @click="confirmDelete(variant.id)">
                            <Icon name="Trash2" class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
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
                  'ring-1 ring-primary bg-primary/5': selectedModIds.has(
                    group.primary.id
                  ),
                }" @click="toggleSelection(group.primary.id)">
                <div class="font-medium text-xs truncate pr-6 hover:text-primary transition-colors"
                  @click.stop="showModDetails(group.primary)" title="Click to view details">
                  {{ group.primary.name }}
                </div>
                <div class="text-caption text-muted-foreground truncate">
                  {{ group.primary.loader }} • {{ group.primary.version }}
                </div>
                <!-- Group badge -->
                <button v-if="group.variants.length > 0" @click.stop="toggleGroup(group.groupKey)"
                  class="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full text-micro font-medium transition-all"
                  :class="group.isExpanded
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    ">
                  +{{ group.variants.length }}
                </button>
              </div>
              <!-- Variant cards (when expanded) -->
              <template v-if="group.isExpanded">
                <div v-for="variant in group.variants" :key="variant.id"
                  class="p-2 rounded-lg border border-border/50 cursor-pointer transition-all hover:bg-muted/50 bg-muted/20"
                  :class="{
                    'ring-1 ring-primary bg-primary/5': selectedModIds.has(
                      variant.id
                    ),
                  }" @click="toggleSelection(variant.id)">
                  <div class="font-medium text-xs truncate text-muted-foreground hover:text-primary transition-colors"
                    @click.stop="showModDetails(variant)" title="Click to view details">
                    <Icon name="ChevronRight" class="w-2.5 h-2.5 inline -ml-0.5" />
                    {{ variant.game_version }}
                  </div>
                  <div class="text-caption text-muted-foreground truncate">
                    {{ variant.loader }} • {{ variant.version }}
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Mod Details Modal -->
    <ModDetailsModal :open="showDetails" :mod="detailsMod" :context="{ type: 'library' }"
      :current-file-id="detailsMod?.cf_file_id" :full-screen="true" @close="closeDetails"
      @version-changed="handleLibraryVersionChange" />

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModIds.size > 0" :count="selectedModIds.size" label="mods" @clear="clearSelection">
      <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDelete">
        <Icon name="Trash2" class="w-4 h-4" />
        Delete
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" :disabled="!selectedModsCompatibility.compatible" :title="selectedModsCompatibility.compatible
        ? 'Create modpack from selected mods'
        : 'Selected mods have different game versions or loaders'
        " @click="showCreateModpackDialog = true">
        <Icon name="PackagePlus" class="w-4 h-4" />
        Create Pack
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" @click="showAddToModpackDialog = true">
        <Icon name="PlusCircle" class="w-4 h-4" />
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
          <Icon name="Trash2" class="w-4 h-4 mr-2" />
          Delete & Remove
        </Button>
      </template>
    </Dialog>

    <!-- Updates Dialog -->
    <UpdatesDialog :open="showUpdatesDialog" @close="showUpdatesDialog = false" @updated="loadMods" />

    <ModUpdateDialog :open="showSingleModUpdateDialog" :mod="selectedUpdateMod"
      :minecraft-version="selectedUpdateMod?.game_version || '1.20.1'" :loader="selectedUpdateMod?.loader || 'forge'"
      @close="showSingleModUpdateDialog = false" @updated="handleModUpdated" />
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
