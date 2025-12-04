<script setup lang="ts">
import ModGrid from "@/components/mods/ModGrid.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";
import ModEditDialog from "@/components/mods/ModEditDialog.vue";
import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import AddToModpackDialog from "@/components/modpacks/AddToModpackDialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
import CurseForgeSearch from "@/components/mods/CurseForgeSearch.vue";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { useFolderTree } from "@/composables/useFolderTree";
import {
  Search,
  Filter,
  FolderPlus,
  FilePlus,
  Trash2,
  PackagePlus,
  PlusCircle,
  ArrowUpDown,
  LayoutGrid,
  List,
  LayoutList,
  Info,
  X,
  Star,
  Copy,
  AlertTriangle,
  FolderOutput,
  HardDrive,
  Folder,
  FolderInput,
  ArrowUpCircle,
  Globe,
} from "lucide-vue-next";
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Mod, ModFolder } from "@/types/electron";

const route = useRoute();
const router = useRouter();

// Folder tree integration
const { folders, moveModsToFolder, getModFolder, createFolder } = useFolderTree();

// Search input ref for focus
const searchInputRef = ref<HTMLInputElement | null>(null);

const mods = ref<Mod[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref("");
const selectedLoader = ref<string>("all");
const searchField = ref<"all" | "name" | "author" | "version" | "description">("all");

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
const sortBy = ref<"name" | "loader" | "created_at" | "version" | "size">("name");
const sortDir = ref<"asc" | "desc">("asc");

// View Mode
const viewMode = ref<"grid" | "list" | "compact">("grid");

// Selection State
const selectedModIds = ref<Set<string>>(new Set());

// Details Panel
const showDetails = ref(false);
const detailsMod = ref<Mod | null>(null);

// Dialog States
const showDeleteDialog = ref(false);
const showEditDialog = ref(false);
const showCreateModpackDialog = ref(false);
const showAddToModpackDialog = ref(false);
const showMoveToFolderDialog = ref(false);
const showUpdatesDialog = ref(false);
const modToDelete = ref<string | null>(null);
const modToEdit = ref<Mod | null>(null);

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
      return mod.version.toLowerCase().includes(q) || 
             mod.game_version.toLowerCase().includes(q);
    case "description":
      return (mod.description || "").toLowerCase().includes(q);
    case "all":
    default:
      return mod.name.toLowerCase().includes(q) ||
             (mod.author || "").toLowerCase().includes(q) ||
             mod.version.toLowerCase().includes(q) ||
             (mod.description || "").toLowerCase().includes(q) ||
             mod.loader.toLowerCase().includes(q);
  }
}

const filteredMods = computed(() => {
  let result = mods.value.filter((mod) => {
    const matchesSearch = matchesSearchQuery(mod, searchQuery.value);
    const matchesLoader =
      selectedLoader.value === "all" || mod.loader === selectedLoader.value;
    
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
    
    return matchesSearch && matchesLoader && matchesQuickFilter && matchesFolder;
  });

  // Sort (favorites first if enabled, then by selected field)
  result.sort((a, b) => {
    // Favorites always first
    const aFav = favoriteMods.value.has(a.id) ? 0 : 1;
    const bFav = favoriteMods.value.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    
    // Handle size sorting numerically
    if (sortBy.value === "size") {
      const diff = (a.size || 0) - (b.size || 0);
      return sortDir.value === "asc" ? diff : -diff;
    }
    
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
  localStorage.setItem("modex:favorites:mods", JSON.stringify([...favoriteMods.value]));
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

// Duplicate detection
function detectDuplicates() {
  const nameMap = new Map<string, string[]>();
  for (const mod of mods.value) {
    const key = mod.name.toLowerCase();
    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }
    nameMap.get(key)!.push(mod.id);
  }
  
  // Filter to only show actual duplicates
  duplicates.value = new Map(
    [...nameMap.entries()].filter(([_, ids]) => ids.length > 1)
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

async function loadMods() {
  if (!isElectron()) {
    error.value = "This app must be run in Electron, not in a browser.";
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    mods.value = await window.api.mods.getAll();
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
function toggleSort(field: "name" | "loader" | "created_at" | "version" | "size") {
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
async function deleteSelectedMods() {
  if (!confirm(`Delete ${selectedModIds.value.size} mods?`)) return;

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
    alert("Delete failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

async function exportToGame() {
  // Let user select game mods folder
  const targetFolder = await window.api.scanner.selectGameFolder();
  if (!targetFolder) return;

  showProgress.value = true;
  progressTitle.value = "Exporting Mods";
  progressMessage.value = "Copying mods to game folder...";

  try {
    const ids = Array.from(selectedModIds.value);
    const result = await window.api.scanner.exportToGameFolder(ids, targetFolder);
    
    if (result.success) {
      alert(`Successfully exported ${result.count} mods to:\n${targetFolder}`);
      clearSelection();
    } else {
      alert("Export failed. Please check the target folder and try again.");
    }
  } catch (err) {
    alert("Export failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
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
    const packId = await window.api.modpacks.add(data);
    const ids = Array.from(selectedModIds.value);
    for (const modId of ids) {
      await window.api.modpacks.addMod(packId, modId);
    }
    clearSelection();
    alert(`Created modpack "${data.name}" with ${ids.length} mods!`);
  } catch (err) {
    alert("Failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

async function addSelectionToModpack(packId: string) {
  showAddToModpackDialog.value = false;
  showProgress.value = true;
  progressTitle.value = "Adding to Modpack";

  try {
    const ids = Array.from(selectedModIds.value);
    for (const modId of ids) {
      progressMessage.value = `Adding mods...`;
      await window.api.modpacks.addMod(packId, modId);
    }
    clearSelection();
    alert(`Added ${ids.length} mods to modpack!`);
  } catch (err) {
    alert("Failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Import Functions
// NOTE: Local file imports disabled - use CurseForge instead
async function importFolder() {
  alert("Local folder import is temporarily disabled. Please use 'Browse CurseForge' to add mods, or go to Modpacks page to 'Import CF Modpack'.");
  return;
}

async function importFiles() {
  alert("Local file import is temporarily disabled. Please use 'Browse CurseForge' to add mods, or go to Modpacks page to 'Import CF Modpack'.");
  return;
}

// Delete Single
function confirmDelete(modId: string) {
  modToDelete.value = modId;
  showDeleteDialog.value = true;
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
    alert("Delete failed: " + (err as Error).message);
  }
}

function openEditDialog(modId: string) {
  const mod = mods.value.find((m) => m.id === modId);
  if (mod) {
    modToEdit.value = mod;
    showEditDialog.value = true;
  }
}

async function saveMod(updatedMod: Partial<Mod>) {
  if (!modToEdit.value?.id || !isElectron()) return;
  try {
    await window.api.mods.update(modToEdit.value.id, updatedMod);
    await loadMods();
    showEditDialog.value = false;
    modToEdit.value = null;
  } catch (err) {
    alert("Update failed: " + (err as Error).message);
  }
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
  alert("Drag & drop import is temporarily disabled. Please use 'Browse CurseForge' to add mods, or go to Modpacks page to 'Import CF Modpack'.");
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
      const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
      input?.focus();
    }
  },
  {
    key: "a",
    ctrl: true,
    handler: () => selectAll()
  },
  {
    key: "Escape",
    handler: () => {
      if (selectedModIds.value.size > 0) {
        clearSelection();
      } else if (showDetails.value) {
        closeDetails();
      }
    }
  },
  {
    key: "Delete",
    handler: () => {
      if (selectedModIds.value.size > 0) {
        deleteSelectedMods();
      }
    }
  },
  {
    key: "i",
    ctrl: true,
    handler: () => importFiles()
  },
  {
    key: "n",
    ctrl: true,
    handler: () => {
      if (selectedModIds.value.size > 0) {
        showCreateModpackDialog.value = true;
      }
    }
  },
  {
    key: "1",
    handler: () => { viewMode.value = "grid"; }
  },
  {
    key: "2",
    handler: () => { viewMode.value = "list"; }
  },
  {
    key: "3",
    handler: () => { viewMode.value = "compact"; }
  }
]);

onMounted(() => {
  loadFavorites();
  loadMods();
});
</script>

<template>
  <div 
    class="p-6 h-full flex flex-col space-y-4 relative"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Drag & Drop Overlay -->
    <div 
      v-if="isDragging"
      class="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none"
    >
      <div class="text-center">
        <FilePlus class="w-16 h-16 mx-auto text-primary mb-4" />
        <p class="text-xl font-semibold">Drop .jar files here</p>
        <p class="text-muted-foreground">Files will be imported to your library</p>
      </div>
    </div>

    <!-- Header -->
    <div
      class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Library</h1>
        <p class="text-muted-foreground">
          {{ mods.length }} mods
          <template v-if="Object.keys(loaderStats).length">
            •
            <span
              v-for="(count, loader) in loaderStats"
              :key="loader"
              class="ml-1"
            >
              {{ count }} {{ loader }}
            </span>
          </template>
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          @click="showUpdatesDialog = true"
          :disabled="!isElectron()"
          variant="outline"
          class="gap-2"
          title="Controlla aggiornamenti mod"
        >
          <ArrowUpCircle class="w-4 h-4" />
          Updates
        </Button>
        <Button
          @click="showCurseForgeSearch = true"
          variant="default"
          class="gap-2"
        >
          <Globe class="w-4 h-4" />
          Browse CurseForge
        </Button>
      </div>
    </div>

    <!-- Quick Filters -->
    <div class="flex items-center gap-2">
      <button
        class="px-3 py-1.5 text-sm rounded-full transition-colors"
        :class="quickFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'"
        @click="quickFilter = 'all'; router.push('/library')"
      >
        All
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5"
        :class="quickFilter === 'favorites' ? 'bg-yellow-500 text-white' : 'bg-muted hover:bg-accent'"
        @click="quickFilter = 'favorites'; router.push('/library?filter=favorites')"
      >
        <Star class="w-3.5 h-3.5" />
        Favorites
        <span v-if="favoriteMods.size > 0" class="text-xs opacity-80">({{ favoriteMods.size }})</span>
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-full transition-colors"
        :class="quickFilter === 'recent' ? 'bg-blue-500 text-white' : 'bg-muted hover:bg-accent'"
        @click="quickFilter = 'recent'; router.push('/library?filter=recent')"
      >
        Recent
      </button>
      
      <!-- Duplicate Warning -->
      <div 
        v-if="duplicateCount > 0"
        class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-500/20 text-orange-500 rounded-full cursor-pointer hover:bg-orange-500/30"
        @click="searchQuery = ''"
        title="Click to show all and review duplicates"
      >
        <AlertTriangle class="w-3.5 h-3.5" />
        {{ duplicateCount }} potential duplicates
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px] max-w-md flex gap-2">
        <div class="relative flex-1">
          <Search
            class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
          />
          <Input
            v-model="searchQuery"
            :placeholder="searchField === 'all' ? 'Search all fields...' : `Search by ${searchField}...`"
            class="pl-9"
          />
        </div>
        <select
          v-model="searchField"
          class="h-10 rounded-md border border-input bg-background px-2 py-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          title="Search field"
        >
          <option value="all">All</option>
          <option value="name">Name</option>
          <option value="author">Author</option>
          <option value="version">Version</option>
          <option value="description">Description</option>
        </select>
      </div>

      <!-- Loader Filter -->
      <div class="flex items-center gap-2">
        <Filter class="w-4 h-4 text-muted-foreground" />
        <select
          v-model="selectedLoader"
          class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Loaders</option>
          <option v-for="loader in loaders" :key="loader" :value="loader">
            {{ loader }} ({{ loaderStats[loader] }})
          </option>
        </select>
      </div>

      <!-- Sort -->
      <div class="flex items-center gap-1 border rounded-md">
        <button
          class="h-9 px-3 text-xs rounded-l-md transition-colors"
          :class="
            sortBy === 'name'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="toggleSort('name')"
        >
          Name
        </button>
        <button
          class="h-9 px-3 text-xs transition-colors"
          :class="
            sortBy === 'loader'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="toggleSort('loader')"
        >
          Loader
        </button>
        <button
          class="h-9 px-3 text-xs transition-colors"
          :class="
            sortBy === 'size'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="toggleSort('size')"
        >
          Size
        </button>
        <button
          class="h-9 px-3 text-xs rounded-r-md transition-colors"
          :class="
            sortBy === 'created_at'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="toggleSort('created_at')"
        >
          Date
        </button>
      </div>

      <!-- View Mode -->
      <div class="flex items-center gap-1 border rounded-md">
        <button
          class="h-9 w-9 flex items-center justify-center rounded-l-md transition-colors"
          :class="
            viewMode === 'grid'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="viewMode = 'grid'"
          title="Grid view"
        >
          <LayoutGrid class="w-4 h-4" />
        </button>
        <button
          class="h-9 w-9 flex items-center justify-center transition-colors"
          :class="
            viewMode === 'list'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="viewMode = 'list'"
          title="List view"
        >
          <List class="w-4 h-4" />
        </button>
        <button
          class="h-9 w-9 flex items-center justify-center rounded-r-md transition-colors"
          :class="
            viewMode === 'compact'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          "
          @click="viewMode = 'compact'"
          title="Compact view"
        >
          <LayoutList class="w-4 h-4" />
        </button>
      </div>

      <!-- Selection Buttons -->
      <div class="flex items-center gap-1 border-l pl-3 ml-auto">
        <Button
          variant="ghost"
          size="sm"
          class="text-xs"
          @click="selectAll"
          :disabled="filteredMods.length === 0"
        >
          Select All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-xs"
          @click="selectNone"
          :disabled="selectedModIds.size === 0"
        >
          Deselect
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="error" class="flex items-center justify-center flex-1">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="flex items-center justify-center flex-1">
      <div class="flex flex-col items-center gap-2">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
        ></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <div
      v-else-if="mods.length === 0"
      class="flex items-center justify-center flex-1"
    >
      <div class="text-center max-w-md">
        <div
          class="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <FolderPlus class="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-semibold mb-2">No mods yet</h3>
        <p class="text-muted-foreground mb-6">Import mods to get started.</p>
        <div class="flex justify-center gap-2">
          <Button @click="importFiles" variant="secondary">Import Files</Button>
          <Button @click="importFolder">Import Folder</Button>
        </div>
      </div>
    </div>

    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="flex-1 overflow-auto p-1 pb-20">
      <ModGrid
        :mods="filteredMods"
        :selected-ids="selectedModIds"
        :favorite-ids="favoriteMods"
        :duplicate-ids="duplicateModIds"
        @delete="confirmDelete"
        @edit="openEditDialog"
        @toggle-select="toggleSelection"
        @show-details="showModDetails"
        @toggle-favorite="toggleFavorite"
      />
    </div>

    <!-- List View -->
    <div v-else-if="viewMode === 'list'" class="flex-1 overflow-auto pb-20">
      <div class="bg-card rounded-lg border overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/50 border-b">
            <tr>
              <th class="text-left p-3 font-medium">Name</th>
              <th class="text-left p-3 font-medium">Version</th>
              <th class="text-left p-3 font-medium">Loader</th>
              <th class="text-left p-3 font-medium">Author</th>
              <th class="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="mod in filteredMods"
              :key="mod.id"
              class="border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
              :class="{ 'bg-primary/10': selectedModIds.has(mod.id) }"
              @click="toggleSelection(mod.id)"
            >
              <td class="p-3 font-medium">{{ mod.name }}</td>
              <td class="p-3 text-muted-foreground">{{ mod.version }}</td>
              <td class="p-3">
                <span class="px-2 py-0.5 rounded-full text-xs bg-secondary">{{
                  mod.loader
                }}</span>
              </td>
              <td class="p-3 text-muted-foreground">{{ mod.author || "-" }}</td>
              <td class="p-3 text-right">
                <div class="flex justify-end gap-1" @click.stop>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="showModDetails(mod)"
                  >
                    <Info class="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="openEditDialog(mod.id)"
                  >
                    <FilePlus class="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 hover:text-destructive"
                    @click="confirmDelete(mod.id)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Compact View -->
    <div v-else class="flex-1 overflow-auto pb-20 p-1">
      <div
        class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2"
      >
        <div
          v-for="mod in filteredMods"
          :key="mod.id"
          class="p-2 rounded-md border cursor-pointer transition-colors hover:bg-accent/50 group"
          :class="{ 'ring-2 ring-primary bg-primary/5': selectedModIds.has(mod.id) }"
          @click="toggleSelection(mod.id)"
          @dblclick="showModDetails(mod)"
        >
          <div class="font-medium text-xs truncate">{{ mod.name }}</div>
          <div class="text-[10px] text-muted-foreground truncate">
            {{ mod.loader }} • {{ mod.version }}
          </div>
        </div>
      </div>
    </div>

    <!-- Details Sidebar -->
    <div
      v-if="showDetails && detailsMod"
      class="fixed top-0 right-0 h-full w-80 bg-background border-l shadow-lg z-40 flex flex-col animate-in slide-in-from-right duration-200"
    >
      <div class="p-4 border-b flex items-center justify-between">
        <h3 class="font-semibold">Mod Details</h3>
        <Button variant="ghost" size="icon" @click="closeDetails">
          <X class="w-4 h-4" />
        </Button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 class="text-lg font-bold">{{ detailsMod.name }}</h4>
          <p class="text-sm text-muted-foreground">{{ detailsMod.version }}</p>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Loader</span>
            <span class="px-2 py-0.5 rounded-full text-xs bg-secondary">{{
              detailsMod.loader
            }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Author</span>
            <span>{{ detailsMod.author || "-" }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Game Version</span>
            <span>{{ detailsMod.game_version }}</span>
          </div>
        </div>
        <div>
          <span class="text-xs text-muted-foreground">Description</span>
          <p class="text-sm mt-1">
            {{ detailsMod.description || "No description" }}
          </p>
        </div>
        <div>
          <span class="text-xs text-muted-foreground">File Path</span>
          <p class="text-xs mt-1 font-mono break-all bg-muted p-2 rounded">
            {{ detailsMod.path }}
          </p>
        </div>
        <div>
          <span class="text-xs text-muted-foreground">Hash (SHA256)</span>
          <p class="text-xs mt-1 font-mono break-all bg-muted p-2 rounded">
            {{ detailsMod.hash }}
          </p>
        </div>
      </div>
      <div class="p-4 border-t flex gap-2">
        <Button
          variant="outline"
          class="flex-1"
          @click="openEditDialog(detailsMod.id)"
          >Edit</Button
        >
        <Button
          variant="destructive"
          class="flex-1"
          @click="confirmDelete(detailsMod.id)"
          >Delete</Button
        >
      </div>
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar
      v-if="selectedModIds.size > 0"
      :count="selectedModIds.size"
      label="mods"
      @clear="clearSelection"
    >
      <Button
        variant="destructive"
        size="sm"
        class="gap-2"
        @click="deleteSelectedMods"
      >
        <Trash2 class="w-4 h-4" />
        Delete
      </Button>
      <Button
        variant="secondary"
        size="sm"
        class="gap-2"
        @click="showMoveToFolderDialog = true"
      >
        <FolderInput class="w-4 h-4" />
        Move to Folder
      </Button>
      <Button
        variant="secondary"
        size="sm"
        class="gap-2"
        @click="exportToGame"
      >
        <HardDrive class="w-4 h-4" />
        Export to Game
      </Button>
      <Button
        variant="secondary"
        size="sm"
        class="gap-2"
        @click="showCreateModpackDialog = true"
      >
        <PackagePlus class="w-4 h-4" />
        Create Pack
      </Button>
      <Button
        variant="secondary"
        size="sm"
        class="gap-2"
        @click="showAddToModpackDialog = true"
      >
        <PlusCircle class="w-4 h-4" />
        Add to Pack
      </Button>
    </BulkActionBar>

    <!-- Dialogs -->
    <Dialog
      :open="showDeleteDialog"
      title="Delete Mod"
      description="This action cannot be undone."
    >
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false"
          >Cancel</Button
        >
        <Button variant="destructive" @click="deleteMod">Delete</Button>
      </template>
    </Dialog>

    <ModEditDialog
      v-if="modToEdit"
      :mod="modToEdit"
      :open="showEditDialog"
      @close="showEditDialog = false"
      @save="saveMod"
    />

    <CreateModpackDialog
      :open="showCreateModpackDialog"
      @close="showCreateModpackDialog = false"
      @create="createModpackFromSelection"
    />

    <AddToModpackDialog
      :open="showAddToModpackDialog"
      :mods-count="selectedModIds.size"
      @close="showAddToModpackDialog = false"
      @select="addSelectionToModpack"
    />

    <!-- Move to Folder Dialog -->
    <Dialog
      :open="showMoveToFolderDialog"
      title="Move to Folder"
      :description="`Move ${selectedModIds.size} mod(s) to a folder`"
    >
      <div class="space-y-2 max-h-64 overflow-auto">
        <!-- Root option (no folder) -->
        <button
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
          @click="moveSelectedToFolder(null)"
        >
          <Folder class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm">No folder (root)</span>
        </button>
        
        <!-- Folders list -->
        <button
          v-for="folder in folders"
          :key="folder.id"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
          @click="moveSelectedToFolder(folder.id)"
        >
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

    <ProgressDialog
      :open="showProgress"
      :title="progressTitle"
      :message="progressMessage"
    />

    <!-- Updates Dialog -->
    <UpdatesDialog
      :open="showUpdatesDialog"
      @close="showUpdatesDialog = false"
      @updated="loadMods"
    />

    <!-- CurseForge Search Dialog -->
    <CurseForgeSearch
      :open="showCurseForgeSearch"
      @close="showCurseForgeSearch = false"
      @added="loadMods"
    />
  </div>
</template>
