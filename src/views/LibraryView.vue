<script setup lang="ts">
import ModGrid from "@/components/mods/ModGrid.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";

import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import AddToModpackDialog from "@/components/modpacks/AddToModpackDialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
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
  Star,
  AlertTriangle,
  HardDrive,
  Folder,
  FolderInput,
  ArrowUpCircle,
  Globe,
} from "lucide-vue-next";
import { ref, onMounted, computed, watch, nextTick } from "vue";
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
const selectedLoader = ref<string>("all");
const selectedGameVersion = ref<string>("all");
const modpackFilter = ref<string>("all"); // 'all', 'any', 'none', or modpackId
const searchField = ref<"all" | "name" | "author" | "version" | "description">(
  "all"
);

// CurseForge search dialog
const showCurseForgeSearch = ref(false);

// Folder filter
const selectedFolderId = ref<string | null>(null);

// Favorites system (stored in localStorage)
const favoriteMods = ref<Set<string>>(new Set());
const quickFilter = ref<"all" | "favorites" | "recent">("all");

// Duplicate detection
const duplicates = ref<Map<string, string[]>>(new Map());

// Sorting
const sortBy = ref<"name" | "loader" | "created_at" | "version">("name");
const sortDir = ref<"asc" | "desc">("asc");
const sortFields = ["name", "loader", "version", "created_at"] as const;

// View Mode
const viewMode = ref<"grid" | "list" | "compact">("grid");
const showThumbnails = ref<boolean>(true); // Toggle for mod thumbnails

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

  const firstMod = selectedMods[0];
  const gameVersion = firstMod.game_version;
  const loader = firstMod.loader;

  // Check if all mods have the same version and loader
  const allSame = selectedMods.every(
    (m) => m.game_version === gameVersion && m.loader === loader
  );

  return {
    compatible: allSame,
    gameVersion: allSame ? gameVersion : null,
    loader: allSame ? loader : null,
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
    const matchesSearch = matchesSearchQuery(mod, searchQuery.value);
    const matchesLoader =
      selectedLoader.value === "all" || mod.loader === selectedLoader.value;
    const matchesVersion =
      selectedGameVersion.value === "all" ||
      mod.game_version === selectedGameVersion.value;

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
  ],
  () => {
    saveSettings();
  }
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
    const [allMods, allModpacks] = await Promise.all([
      window.api.mods.getAll(),
      window.api.modpacks.getAll()
    ]);

    mods.value = allMods;
    modpacks.value = allModpacks;

    // Build usage map
    const usage = new Map<string, Set<string>>();
    for (const pack of allModpacks) {
      // Assuming modpack has mod_ids or we need to fetch mods for each pack
      // Modpack type usually has mod_ids array if it's lightweight
      // Let's check Modpack type definition or assume we need to fetch usage
    }

    // Actually, let's use checkUsage API for all mods to be accurate
    const allModIds = allMods.map(m => m.id);
    // Chunking might be needed if too many mods, but let's try all at once first
    if (allModIds.length > 0) {
      const usageInfo = await window.api.mods.checkUsage(allModIds);
      for (const info of usageInfo) {
        const packIds = new Set(info.modpacks.map(p => p.id));
        usage.set(info.modId, packIds);
      }
    }
    modUsageMap.value = usage;

    const currentIds = new Set(mods.value.map((m) => m.id!));
    for (const id of selectedModIds.value) {
      if (!currentIds.has(id)) selectedModIds.value.delete(id);
    }
    // Detect duplicates after loading
    detectDuplicates();
  } catch (err) {
    console.error("Failed to load mods:", err);
    error.value = "Failed to load mods: " + (err as Error).message;
  } finally {
    isLoading.value = false;
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

  const ids = Array.from(selectedModIds.value);
  let deletedCount = 0;

  try {
    for (const id of ids) {
      progressMessage.value = `Deleting ${++deletedCount} of ${ids.length}...`;
      await window.api.mods.delete(id);
    }
    await loadMods();
    clearSelection();
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export to Game - Removed: not available in metadata-only mode

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
    for (const modId of ids) {
      await window.api.modpacks.addMod(packId, modId);
    }
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

  try {
    for (const modId of compatibleModIds) {
      progressMessage.value = `Adding mods...`;
      await window.api.modpacks.addMod(packId, modId);
    }
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
    // Show usage warning dialog
    modUsageInfo.value = usage;
    pendingDeleteModIds.value = [modId];
    showUsageWarningDialog.value = true;
  } else {
    // No usage, show simple delete dialog
    modToDelete.value = modId;
    showDeleteDialog.value = true;
  }
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
    <div class="shrink-0 px-3 sm:px-8 py-3 sm:py-4 border-b border-border bg-background">
      <!-- Mobile: Stack vertically, Desktop: Row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
        <!-- Left: Title & Stats -->
        <div class="flex items-center gap-3 sm:gap-4">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
              <HardDrive class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
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
                ? 'bg-yellow-500/20 text-yellow-400 shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                " @click="
                  quickFilter = 'favorites';
                router.push('/library?filter=favorites');
                ">
              <Star class="w-3 h-3" :class="quickFilter === 'favorites' ? 'fill-yellow-400' : ''" />
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
            class="gap-1.5 h-7 sm:h-8 px-2 sm:px-3 shadow-sm hover:shadow transition-all" title="Check for mod updates">
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

      <!-- Search & Filters Bar - Scrollable on mobile -->
      <div class="flex items-center gap-2 sm:gap-3 mt-3 sm:mt-4 overflow-x-auto pb-1 px-2 py-1 -mb-1 scrollbar-thin">
        <!-- Search -->
        <div class="relative flex-shrink-0 w-40 sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search
            class="absolute left-2 sm:left-2.5 top-1/2 transform -translate-y-1/2 h-3 sm:h-3.5 w-3 sm:w-3.5 text-muted-foreground" />
          <Input v-model="searchQuery" :placeholder="searchField === 'all' ? 'Search...' : `By ${searchField}...`
            " class="pl-7 sm:pl-8 h-7 sm:h-8 text-xs sm:text-sm bg-muted/50 border-border" />
        </div>

        <!-- Search Field Selector - Hidden on mobile -->
        <select v-model="searchField"
          class="hidden md:block h-7 sm:h-8 rounded-md border border-border bg-muted/50 px-2 text-[10px] sm:text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          title="Search field">
          <option value="all">All</option>
          <option value="name">Name</option>
          <option value="author">Author</option>
          <option value="version">Version</option>
        </select>

        <!-- Game Version Filter -->
        <select v-model="selectedGameVersion"
          class="flex-shrink-0 h-7 sm:h-8 rounded-md border border-border bg-muted/50 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">All Versions</option>
          <option v-for="v in gameVersions" :key="v" :value="v">
            {{ v }}
          </option>
        </select>

        <!-- Loader Filter -->
        <select v-model="selectedLoader"
          class="flex-shrink-0 h-7 sm:h-8 rounded-md border border-border bg-muted/50 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">All</option>
          <option v-for="loader in loaders" :key="loader" :value="loader">
            {{ loader }}
          </option>
        </select>

        <!-- Modpack Filter -->
        <select v-model="modpackFilter"
          class="flex-shrink-0 h-7 sm:h-8 rounded-md border border-border bg-muted/50 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[120px] sm:max-w-[150px]">
          <option value="all">All Mods</option>
          <option value="any">In Any Modpack</option>
          <option value="none">Unused</option>
          <optgroup v-if="modpacks.length > 0" label="Specific Modpack">
            <option v-for="pack in modpacks" :key="pack.id" :value="pack.id">
              {{ pack.name }}
            </option>
          </optgroup>
        </select>

        <!-- Separator - Hidden on mobile -->
        <div class="hidden lg:block h-6 w-px bg-border" />

        <!-- Sort Buttons - Hidden on mobile -->
        <div class="hidden lg:flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md">
          <button v-for="field in sortFields" :key="field" class="px-2 py-1 text-xs rounded transition-all" :class="sortBy === field
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
            " @click="toggleSort(field)">
            {{
              field === "created_at"
                ? "Date"
                : field.charAt(0).toUpperCase() + field.slice(1)
            }}
          </button>
        </div>

        <!-- View Mode -->
        <div class="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md flex-shrink-0">
          <button class="p-1 sm:p-1.5 rounded transition-all" :class="viewMode === 'grid'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
            " @click="viewMode = 'grid'" title="Grid view">
            <LayoutGrid class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button class="p-1 sm:p-1.5 rounded transition-all" :class="viewMode === 'list'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
            " @click="viewMode = 'list'" title="List view">
            <List class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button class="hidden sm:block p-1.5 rounded transition-all" :class="viewMode === 'compact'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
            " @click="viewMode = 'compact'" title="Compact view">
            <LayoutList class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Thumbnails Toggle - Hidden on mobile -->
        <button class="hidden sm:block p-1.5 rounded-md transition-all flex-shrink-0" :class="showThumbnails
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground'
          " @click="showThumbnails = !showThumbnails" :title="showThumbnails ? 'Hide thumbnails' : 'Show thumbnails'">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </button>

        <!-- Selection Buttons - Hidden on mobile -->
        <div class="hidden md:flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            @click="selectAll" :disabled="filteredMods.length === 0">
            Select All
          </Button>
          <Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            @click="selectNone" :disabled="selectedModIds.size === 0">
            Clear
          </Button>
        </div>
      </div>
    </div>

    <!-- Content -->
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

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="flex-1 overflow-auto p-3 sm:p-6 pb-20 bg-background">
      <ModGrid :mods="filteredMods" :selected-ids="selectedModIds" :favorite-ids="favoriteMods"
        :duplicate-ids="duplicateModIds" :show-thumbnails="showThumbnails" @delete="confirmDelete"
        @toggle-select="toggleSelection" @show-details="showModDetails" @toggle-favorite="toggleFavorite" />
    </div>

    <!-- List View -->
    <div v-else-if="viewMode === 'list'" class="flex-1 overflow-auto p-3 sm:p-6 pb-20 bg-background">
      <div class="bg-card/50 rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table class="w-full text-sm min-w-[400px]">
          <thead class="bg-muted/50 border-b border-border">
            <tr>
              <th class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                Name
              </th>
              <th
                class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs hidden sm:table-cell">
                Version
              </th>
              <th class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                Loader
              </th>
              <th
                class="text-left p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs hidden md:table-cell">
                Author
              </th>
              <th class="text-right p-2 sm:p-3 font-medium text-muted-foreground text-[10px] sm:text-xs">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="mod in filteredMods" :key="mod.id"
              class="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
              :class="{ 'bg-primary/10': selectedModIds.has(mod.id) }" @click="toggleSelection(mod.id)">
              <td class="p-2 sm:p-3 font-medium text-xs sm:text-sm">
                {{ mod.name }}
              </td>
              <td class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs hidden sm:table-cell">
                {{ mod.version }}
              </td>
              <td class="p-2 sm:p-3">
                <span class="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs bg-muted">{{ mod.loader }}</span>
              </td>
              <td class="p-2 sm:p-3 text-muted-foreground text-[10px] sm:text-xs hidden md:table-cell">
                {{ mod.author || "-" }}
              </td>
              <td class="p-2 sm:p-3 text-right">
                <div class="flex justify-end gap-0.5 sm:gap-1" @click.stop>
                  <Button variant="ghost" size="icon"
                    class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground"
                    @click="showModDetails(mod)">
                    <Info class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon"
                    class="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive"
                    @click="confirmDelete(mod.id)">
                    <Trash2 class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Compact View -->
    <div v-else class="flex-1 overflow-auto p-3 sm:p-6 pb-20 bg-background">
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
        <div v-for="mod in filteredMods" :key="mod.id"
          class="p-2 rounded-lg border border-border cursor-pointer transition-all hover:bg-muted/50 hover:border-border group"
          :class="{
            'ring-1 ring-primary bg-primary/5': selectedModIds.has(mod.id),
          }" @click="toggleSelection(mod.id)" @dblclick="showModDetails(mod)">
          <div class="font-medium text-xs truncate">{{ mod.name }}</div>
          <div class="text-[10px] text-muted-foreground truncate">
            {{ mod.loader }} • {{ mod.version }}
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

    <!-- CurseForge Search Dialog -->
    <CurseForgeSearch :open="showCurseForgeSearch" :installed-project-files="installedProjectFiles"
      @close="showCurseForgeSearch = false" @added="loadMods" />
  </div>
</template>
