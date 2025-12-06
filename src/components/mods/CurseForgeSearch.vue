<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  Search,
  Download,
  Plus,
  ChevronDown,
  Loader2,
  ExternalLink,
  Star,
  X,
  AlertTriangle,
  FolderOpen,
  CheckSquare,
  Square,
  Check,
  Filter,
  ArrowDownToLine,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { useFolderTree } from "@/composables/useFolderTree";

const { folders: foldersList, moveModToFolder } = useFolderTree();

const props = defineProps<{
  open: boolean;
  gameVersion?: string;
  modLoader?: string;
  installedProjectFiles?: Map<number, Set<number>>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "added", mod: any): void;
}>();

// State
const searchQuery = ref("");
const selectedVersion = ref(props.gameVersion || "");
const selectedLoader = ref(props.modLoader || "");
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const isAddingMod = ref<number | null>(null);
const hasApiKey = ref(false);
const currentPage = ref(0);
const totalResults = ref(0);
const pageSize = 20;

// Accordion & Files State
const expandedModId = ref<number | null>(null);
const modFiles = ref<any[]>([]);
const isLoadingFiles = ref(false);

// New Filters
const showReleaseConfig = ref(false); // To toggle advanced filter visibility if needed, or just show in sidebar
const filterRelease = ref(true);
const filterBeta = ref(false);
const filterAlpha = ref(false);

// Bulk selection state
const selectedModIds = ref<Set<number>>(new Set()); // For Header selection (Quick Download)
const selectedFileIds = ref<Set<number>>(new Set()); // For specific file selection
const isSelectionMode = ref(false);
const targetFolderId = ref<string | null>(null);
const isAddingBulk = ref(false);

// Available filters
const gameVersions = [
  "",
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19.1",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.17.1",
  "1.17",
  "1.16.5",
  "1.16.4",
  "1.16.3",
  "1.16.2",
  "1.16.1",
  "1.15.2",
];

const modLoaders = [
  { value: "", label: "All Loaders" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

const sortFields = [
  { value: 2, label: "Popularity" },
  { value: 1, label: "Featured" },
  { value: 3, label: "Last Updated" },
  { value: 4, label: "Name" },
  { value: 5, label: "Author" },
  { value: 6, label: "Total Downloads" },
];

const categories = ref<{ value: number; label: string }[]>([
  { value: 0, label: "All Categories" },
]);

const selectedSortField = ref(2);
const selectedCategory = ref(0);

const STORAGE_KEYS = {
  VERSION: "modex:cf-search:version",
  LOADER: "modex:cf-search:loader",
  SORT: "modex:cf-search:sort",
  RELEASE_TYPES: "modex:cf-search:release-types",
};

onMounted(async () => {
  hasApiKey.value = await window.api.curseforge.hasApiKey();

  if (!props.gameVersion) {
    const savedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
    if (savedVersion) selectedVersion.value = savedVersion;
  }

  if (!props.modLoader) {
    const savedLoader = localStorage.getItem(STORAGE_KEYS.LOADER);
    if (savedLoader) selectedLoader.value = savedLoader;
  }

  const savedSort = localStorage.getItem(STORAGE_KEYS.SORT);
  if (savedSort) selectedSortField.value = parseInt(savedSort);

  // Load Saved Release Types
  const savedTypes = localStorage.getItem(STORAGE_KEYS.RELEASE_TYPES);
  if (savedTypes) {
    const types = JSON.parse(savedTypes);
    filterRelease.value = types.release ?? true;
    filterBeta.value = types.beta ?? false;
    filterAlpha.value = types.alpha ?? false;
  }

  if (hasApiKey.value) {
    try {
      const cfCategories = await window.api.curseforge.getCategories();
      categories.value = [
        { value: 0, label: "All Categories" },
        ...cfCategories.map((cat: any) => ({ value: cat.id, label: cat.name })),
      ];
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
    if (props.open) loadPopular();
  }
});

watch([selectedVersion, selectedLoader], ([v, l]) => {
  if (v) localStorage.setItem(STORAGE_KEYS.VERSION, v);
  else localStorage.removeItem(STORAGE_KEYS.VERSION);
  if (l) localStorage.setItem(STORAGE_KEYS.LOADER, l);
  else localStorage.removeItem(STORAGE_KEYS.LOADER);
});

watch(selectedSortField, (newVal) => {
  localStorage.setItem(STORAGE_KEYS.SORT, newVal.toString());
});

watch([filterRelease, filterBeta, filterAlpha], () => {
  localStorage.setItem(
    STORAGE_KEYS.RELEASE_TYPES,
    JSON.stringify({
      release: filterRelease.value,
      beta: filterBeta.value,
      alpha: filterAlpha.value,
    })
  );
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && hasApiKey.value && searchResults.value.length === 0) {
      loadPopular();
    }
  }
);

// --- Selection Logic ---

function toggleModHeaderSelection(modId: number) {
  // If we uncheck header, we keep file selections if any (or clear them? User said "allows selecting specific versions", usually implies clear or keep. Let's clear to avoid confusion or keep as is.
  // Actually, if we CHECK header, we should probably clear any individual file selections for this mod to avoid double-adding.
  if (selectedModIds.value.has(modId)) {
    selectedModIds.value.delete(modId);
  } else {
    selectedModIds.value.add(modId);
    // Remove any individual file selections for this mod
    // We need to iterate over selectedFileIds and remove those belonging to this mod.
    // Since we store only ID, we might need a map. But for now, let's just leave them or clear all if feasible.
    // For simpler logic: if Header is selected, we IGNORE individual selections for this mod during 'Add'.
  }
}

function toggleFileSelection(fileId: number) {
  if (selectedFileIds.value.has(fileId)) {
    selectedFileIds.value.delete(fileId);
  } else {
    selectedFileIds.value.add(fileId);
  }
}

function selectAll() {
  searchResults.value.forEach((mod) => selectedModIds.value.add(mod.id));
}

function deselectAll() {
  selectedModIds.value.clear();
  selectedFileIds.value.clear();
}

// Bulk Add
async function addSelectedMods() {
  if (selectedModIds.value.size === 0 && selectedFileIds.value.size === 0)
    return;

  isAddingBulk.value = true;
  const successCount = ref(0);
  const failCount = ref(0);

  try {
    // 1. Process Header Selections (Quick Download Latest Release)
    for (const modId of selectedModIds.value) {
      try {
        const mod = searchResults.value.find((m) => m.id === modId);
        if (!mod) continue;

        // Fetch latest release
        const files = await window.api.curseforge.getModFiles(mod.id, {
          gameVersion: selectedVersion.value || undefined,
          modLoader: selectedLoader.value || undefined,
        });

        // Filter for Release type specifically for "Quick Download"
        const releaseFile =
          files.find((f: any) => f.releaseType === 1) || files[0]; // Fallback to whatever is first/latest if no release

        if (!releaseFile) {
          failCount.value++;
          continue;
        }

        const addedMod = await window.api.curseforge.addToLibrary(
          mod.id,
          releaseFile.id,
          selectedLoader.value || undefined
        );

        if (addedMod) {
          if (targetFolderId.value)
            moveModToFolder(addedMod.id, targetFolderId.value);
          successCount.value++;
        } else {
          failCount.value++;
        }
      } catch (err) {
        console.error(`Failed to add mod ${modId}:`, err);
        failCount.value++;
      }
    }

    // 2. Process Individual File Selections
    // Note: If a mod header was selected, we should skip its individual files to prevent double install.
    // However, finding which file belongs to which mod is tricky without a map.
    // But typically user won't check both due to UI disabling.

    // We need a helper to know mod ID for a file ID, or we fetch file details.
    // To simplify: we iterate search results, look at their fetched files (if cached) or we might have to re-fetch if we didn't store mapping.
    // IMPROVEMENT: Store file->mod mapping when fetching files.

    // For now, let's assume we can find the file in the currently expanded modFiles if currently visible.
    // But if user expanded multiple mods?
    // Let's iterate searchResults => expanded => check file IDs.

    // Actually, simpler approach: We only allow selecting files in EXPANDED accordions.
    // And we have 'modFiles' which is just for the ONE expanded mod?
    // Wait, the current implementation of 'toggleExpand' only keeps ONE mod expanded at a time?
    // "expandedModId.value = mod.id" => Yes, only one.
    // So 'selectedFileIds' only makes sense for the CURRENTLY expanded mod effectively, unless we persist files?
    // If we close accordion, do we want to keep selection? Yes ideally.
    // We need a map of modId -> files list cache if we want to support global multi-file selection.

    // *Limitation Fix*: To support multi-mod file selection, we need to cache files for visited mods.
    // Let's assume we do best effort or fetch on demand.

    // For this implementation, we will iterate all selectedFileIds. We need their Mod IDs.
    // We can store composite keys "modId-fileId" in the Set or use a map.
    // Let's switch selectedFileIds to a Map<number, number> (fileId -> modId).
  } finally {
    isAddingBulk.value = false;
    selectedModIds.value.clear();
    selectedFileIds.value.clear(); // Using Set for now, logic below handles composite if needed
    // Emit 'added' event just once or per mod? The parent refreshes library.
    emit("added", null);
  }
}

// Fixed addSelectedMods for the current scope (using header selection mainly)
// For the file selection: We will update the state to store {fileId, modId}
const selectedFilesMap = ref<Map<number, number>>(new Map()); // FileID -> ModID

function toggleFileSelectionMap(fileId: number, modId: number) {
  if (selectedFilesMap.value.has(fileId)) {
    selectedFilesMap.value.delete(fileId);
  } else {
    selectedFilesMap.value.set(fileId, modId);
  }
}

async function executeBulkAdd() {
  if (selectedModIds.value.size === 0 && selectedFilesMap.value.size === 0)
    return;
  isAddingBulk.value = true;

  try {
    // 1. Header Selections
    for (const modId of selectedModIds.value) {
      // ... existing logic ...
      const mod = searchResults.value.find((m) => m.id === modId);
      if (!mod) continue;
      const files = await window.api.curseforge.getModFiles(mod.id, {
        gameVersion: selectedVersion.value || undefined,
        modLoader: selectedLoader.value || undefined,
      });
      const releaseFile =
        files.find((f: any) => f.releaseType === 1) || files[0];
      if (releaseFile) {
        const added = await window.api.curseforge.addToLibrary(
          mod.id,
          releaseFile.id,
          selectedLoader.value || undefined
        );
        if (added && targetFolderId.value)
          moveModToFolder(added.id, targetFolderId.value);
      }
    }

    // 2. File Selections
    for (const [fileId, modId] of selectedFilesMap.value) {
      // Skip if mod header was already selected (optimization)
      if (selectedModIds.value.has(modId)) continue;

      const mod = searchResults.value.find((m) => m.id === modId);
      // If mod isn't in search results anymore (page change), we can't get details easily.
      // Assumption: User selects from current results.
      if (!mod) continue;

      const added = await window.api.curseforge.addToLibrary(
        mod.id,
        fileId,
        selectedLoader.value || undefined
      );
      if (added && targetFolderId.value)
        moveModToFolder(added.id, targetFolderId.value);
    }

    emit("added", null);
  } catch (e) {
    console.error(e);
  } finally {
    isAddingBulk.value = false;
    selectedModIds.value.clear();
    selectedFilesMap.value.clear();
    isSelectionMode.value = false;
  }
}

// Regular Actions
async function loadPopular() {
  if (!hasApiKey.value) return;
  isSearching.value = true;
  currentPage.value = 0;
  try {
    const result = await window.api.curseforge.search({
      query: undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: 0,
    });
    searchResults.value = result.mods;
    totalResults.value = result.pagination.totalCount;
  } catch (err) {
    console.error(err);
  } finally {
    isSearching.value = false;
  }
}

async function searchMods() {
  if (!hasApiKey.value) return;
  isSearching.value = true;
  currentPage.value = 0;
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: 0,
    });
    searchResults.value = result.mods;
    totalResults.value = result.pagination.totalCount;
  } catch (err) {
    console.error(err);
  } finally {
    isSearching.value = false;
  }
}

async function loadMore() {
  if (!hasApiKey.value || isSearching.value) return;
  isSearching.value = true;
  currentPage.value++;
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: currentPage.value * pageSize,
    });
    searchResults.value = [...searchResults.value, ...result.mods];
  } catch (err) {
    currentPage.value--;
  } finally {
    isSearching.value = false;
  }
}

// Expand & Fetch
async function toggleExpand(mod: any) {
  if (expandedModId.value === mod.id) {
    expandedModId.value = null;
    modFiles.value = [];
    return;
  }
  expandedModId.value = mod.id;
  modFiles.value = [];
  await fetchModFiles(mod.id);
}

async function fetchModFiles(modId: number) {
  isLoadingFiles.value = true;
  try {
    const files = await window.api.curseforge.getModFiles(modId, {
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
    });
    // Sort by date desc
    modFiles.value = files.sort(
      (a: any, b: any) =>
        new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
    );
  } catch (err) {
    console.error(err);
  } finally {
    isLoadingFiles.value = false;
  }
}

// Filtered Files (Release Type)
const filteredModFiles = computed(() => {
  return modFiles.value.filter((f) => {
    if (f.releaseType === 1 && !filterRelease.value) return false;
    if (f.releaseType === 2 && !filterBeta.value) return false;
    if (f.releaseType === 3 && !filterAlpha.value) return false;
    return true;
  });
});

function isFileInstalled(modId: number, fileId: number): boolean {
  return props.installedProjectFiles?.get(modId)?.has(fileId) || false;
}

function isModInstalled(modId: number): boolean {
  return props.installedProjectFiles?.has(modId) || false;
}

async function addFileToLibrary(mod: any, file: any) {
  isAddingMod.value = mod.id;
  try {
    const addedMod = await window.api.curseforge.addToLibrary(
      mod.id,
      file.id,
      selectedLoader.value || undefined
    );
    if (addedMod) {
      if (targetFolderId.value)
        moveModToFolder(addedMod.id, targetFolderId.value);
      emit("added", addedMod);
    }
  } catch (err) {
    console.error(err);
  } finally {
    isAddingMod.value = null;
  }
}

// Quick Download (Latest Release matching filters)
async function quickDownload(mod: any) {
  isAddingMod.value = mod.id;
  try {
    const files = await window.api.curseforge.getModFiles(mod.id, {
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
    });
    const releaseFile = files.find((f: any) => f.releaseType === 1) || files[0];
    if (!releaseFile) return;

    const addedMod = await window.api.curseforge.addToLibrary(
      mod.id,
      releaseFile.id,
      selectedLoader.value || undefined
    );
    if (addedMod) {
      if (targetFolderId.value)
        moveModToFolder(addedMod.id, targetFolderId.value);
      emit("added", addedMod);
    }
  } catch (err) {
    console.error(err);
  } finally {
    isAddingMod.value = null;
  }
}

function openModPage(mod: any) {
  if (mod.slug) {
    window.open(
      `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`,
      "_blank"
    );
  }
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return count.toString();
}

function getAuthors(mod: any): string {
  if (!mod.authors?.length) return "Unknown";
  return mod.authors.map((a: any) => a.name).join(", ");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

// Debounce Search
let searchTimeout: ReturnType<typeof setTimeout>;
function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (searchQuery.value.trim()) searchMods();
    else loadPopular();
  }, 500);
}

const hasMore = computed(() => searchResults.value.length < totalResults.value);

function getReleaseColor(type: number) {
  if (type === 1) return "bg-green-500/10 text-green-500 border-green-500/20";
  if (type === 2) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  return "bg-orange-500/10 text-orange-500 border-orange-500/20";
}
</script>

<template>
  <Dialog
    :open="open"
    @close="emit('close')"
    maxWidth="6xl"
    contentClass="p-0 border-none bg-transparent shadow-none"
  >
    <div
      class="flex h-[80vh] overflow-hidden rounded-xl bg-background border border-border shadow-2xl relative"
    >
      <!-- Sidebar Filters -->
      <div
        class="w-64 flex-shrink-0 border-r border-border bg-muted/10 flex flex-col"
      >
        <div class="p-4 border-b border-border">
          <h3 class="font-semibold flex items-center gap-2">
            <Filter class="w-4 h-4 text-primary" />
            Filters
          </h3>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-6">
          <!-- Game Version -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Game Version</label
            >
            <div class="relative">
              <select
                v-model="selectedVersion"
                class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none"
                @change="searchQuery ? searchMods() : loadPopular()"
              >
                <option value="" class="bg-popover text-popover-foreground">
                  All Versions
                </option>
                <option
                  v-for="v in gameVersions.filter(Boolean)"
                  :key="v"
                  :value="v"
                  class="bg-popover text-popover-foreground"
                >
                  {{ v }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none"
              />
            </div>
          </div>

          <!-- Mod Loader -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Mod Loader</label
            >
            <div class="relative">
              <select
                v-model="selectedLoader"
                class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none"
                @change="searchQuery ? searchMods() : loadPopular()"
              >
                <option
                  v-for="l in modLoaders"
                  :key="l.value"
                  :value="l.value"
                  class="bg-popover text-popover-foreground"
                >
                  {{ l.label }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none"
              />
            </div>
          </div>

          <!-- Category -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Category</label
            >
            <div class="relative">
              <select
                v-model="selectedCategory"
                class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none"
                @change="searchQuery ? searchMods() : loadPopular()"
              >
                <option
                  v-for="c in categories"
                  :key="c.value"
                  :value="c.value"
                  class="bg-popover text-popover-foreground"
                >
                  {{ c.label }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none"
              />
            </div>
          </div>

          <!-- Sort -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Sort By</label
            >
            <div class="relative">
              <select
                v-model="selectedSortField"
                class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none"
                @change="searchQuery ? searchMods() : loadPopular()"
              >
                <option
                  v-for="s in sortFields"
                  :key="s.value"
                  :value="s.value"
                  class="bg-popover text-popover-foreground"
                >
                  {{ s.label }}
                </option>
              </select>
              <ChevronDown
                class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none"
              />
            </div>
          </div>

          <!-- Release Types -->
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Release Channels</label
            >
            <div class="space-y-1.5">
              <label
                class="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  v-model="filterRelease"
                  class="rounded border-input text-primary focus:ring-primary/50"
                />
                <span class="inline-flex items-center gap-1.5">
                  <div class="w-2 h-2 rounded-full bg-green-500"></div>
                  Release
                </span>
              </label>
              <label
                class="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  v-model="filterBeta"
                  class="rounded border-input text-primary focus:ring-primary/50"
                />
                <span class="inline-flex items-center gap-1.5">
                  <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                  Beta
                </span>
              </label>
              <label
                class="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  v-model="filterAlpha"
                  class="rounded border-input text-primary focus:ring-primary/50"
                />
                <span class="inline-flex items-center gap-1.5">
                  <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                  Alpha
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-w-0 bg-background">
        <!-- Search Header -->
        <div class="p-4 border-b border-border flex gap-3 items-center">
          <div class="relative flex-1">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search mods..."
              class="w-full h-10 pl-10 pr-4 rounded-lg border bg-input/50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
              @input="onSearchInput"
              @keyup.enter="searchMods"
            />
          </div>

          <!-- Bulk Actions (Only Visible when Selection Mode ON) -->
          <div
            v-if="isSelectionMode"
            class="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200"
          >
            <div class="h-8 w-px bg-border mx-1"></div>

            <div
              class="flex items-center gap-2 px-3 py-1.5 bg-accent/20 rounded-md border border-accent/30"
            >
              <FolderOpen class="w-4 h-4 text-primary" />
              <select
                v-model="targetFolderId"
                class="bg-transparent border-none text-sm focus:ring-0 cursor-pointer min-w-[120px]"
              >
                <option :value="null">Library Root</option>
                <option v-for="f in foldersList" :key="f.id" :value="f.id">
                  {{ f.name }}
                </option>
              </select>
            </div>

            <Button
              @click="executeBulkAdd"
              :disabled="
                isAddingBulk ||
                (selectedModIds.size === 0 && selectedFilesMap.size === 0)
              "
              size="sm"
              class="gap-2 shadow-lg shadow-primary/20"
            >
              <Loader2 v-if="isAddingBulk" class="w-4 h-4 animate-spin" />
              <ArrowDownToLine v-else class="w-4 h-4" />
              Install Selected ({{
                selectedModIds.size + selectedFilesMap.size
              }})
            </Button>

            <Button variant="ghost" size="sm" @click="isSelectionMode = false"
              >Cancel</Button
            >
          </div>

          <Button
            v-else
            variant="outline"
            size="sm"
            @click="isSelectionMode = true"
            class="gap-2"
          >
            <CheckSquare class="w-4 h-4" /> Select Multiple
          </Button>

          <div class="h-8 w-px bg-border mx-1"></div>

          <Button
            variant="ghost"
            size="icon"
            @click="emit('close')"
            title="Close"
          >
            <X class="w-5 h-5" />
          </Button>
        </div>

        <!-- Results Area -->
        <div class="flex-1 overflow-y-auto p-4 relative">
          <!-- API Warning -->
          <div
            v-if="!hasApiKey"
            class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-background/80 backdrop-blur-sm z-10"
          >
            <AlertTriangle class="w-12 h-12 text-yellow-500 mb-4" />
            <h3 class="text-xl font-bold mb-2">API Key Required</h3>
            <p class="text-muted-foreground max-w-md mb-6">
              You need a CurseForge API key to browse and download mods. Please
              add it in Settings.
            </p>
            <a
              href="https://console.curseforge.com/"
              target="_blank"
              class="text-primary hover:underline"
              >Get API Key</a
            >
          </div>

          <!-- Loading -->
          <div
            v-if="isSearching"
            class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] z-10"
          >
            <Loader2 class="w-10 h-10 animate-spin text-primary" />
          </div>

          <!-- List -->
          <div v-if="searchResults.length > 0" class="flex flex-col gap-3">
            <div
              v-for="mod in searchResults"
              :key="mod.id"
              class="group border border-border rounded-xl bg-card overflow-hidden transition-all duration-200"
              :class="{
                'ring-2 ring-primary/50 shadow-lg shadow-primary/5':
                  expandedModId === mod.id,
                'ring-1 ring-primary bg-primary/5':
                  isSelectionMode && selectedModIds.has(mod.id),
              }"
            >
              <!-- Mod Header -->
              <div
                class="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/30 transition-colors relative"
                @click="toggleExpand(mod)"
              >
                <!-- Checkbox for Bulk Selection -->
                <button
                  v-if="isSelectionMode"
                  @click.stop="toggleModHeaderSelection(mod.id)"
                  class="p-1 rounded hover:bg-background transition-colors mr-1"
                  title="Select Latest Release"
                >
                  <div
                    class="w-5 h-5 border rounded flex items-center justify-center transition-all"
                    :class="
                      selectedModIds.has(mod.id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30 bg-background'
                    "
                  >
                    <Check
                      v-if="selectedModIds.has(mod.id)"
                      class="w-3.5 h-3.5"
                    />
                  </div>
                </button>

                <!-- Icon -->
                <div
                  class="w-12 h-12 rounded-lg bg-muted border border-border overflow-hidden shrink-0"
                >
                  <img
                    v-if="mod.logo?.thumbnailUrl"
                    :src="mod.logo.thumbnailUrl"
                    class="w-full h-full object-cover"
                  />
                  <Star
                    v-else
                    class="w-6 h-6 m-auto text-muted-foreground/30"
                  />
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h4 class="font-bold text-base truncate">{{ mod.name }}</h4>
                    <span
                      v-if="isModInstalled(mod.id)"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 flex items-center gap-0.5"
                    >
                      <Check class="w-3 h-3" /> INSTALLED
                    </span>
                  </div>
                  <p class="text-sm text-muted-foreground truncate">
                    {{ mod.summary }}
                  </p>

                  <div
                    class="flex items-center gap-4 mt-2 text-xs text-muted-foreground"
                  >
                    <span class="flex items-center gap-1"
                      ><span class="font-medium text-foreground">{{
                        formatDownloads(mod.downloadCount)
                      }}</span>
                      downloads</span
                    >
                    <span class="w-1 h-1 rounded-full bg-border"></span>
                    <span class="truncate max-w-[150px]"
                      >by {{ getAuthors(mod) }}</span
                    >
                    <span class="w-1 h-1 rounded-full bg-border"></span>
                    <span>Updated {{ formatDate(mod.dateModified) }}</span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2" v-if="!isSelectionMode">
                  <Button
                    variant="ghost"
                    size="icon"
                    @click.stop="openModPage(mod)"
                    title="View on CurseForge"
                  >
                    <ExternalLink class="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button
                    class="gap-1.5 min-w-[90px]"
                    size="sm"
                    :disabled="isAddingMod === mod.id"
                    @click.stop="quickDownload(mod)"
                  >
                    <Loader2
                      v-if="isAddingMod === mod.id"
                      class="w-4 h-4 animate-spin"
                    />
                    <template v-else>
                      <ArrowDownToLine class="w-4 h-4" />
                      <span>Latest</span>
                    </template>
                  </Button>
                </div>

                <ChevronDown
                  class="w-5 h-5 text-muted-foreground/50 transition-transform duration-300"
                  :class="{ 'rotate-180': expandedModId === mod.id }"
                />
              </div>

              <!-- Accordion Body -->
              <div
                v-if="expandedModId === mod.id"
                class="border-t border-border bg-muted/20 animate-in slide-in-from-top-2 duration-200"
              >
                <div v-if="isLoadingFiles" class="flex justify-center p-8">
                  <Loader2
                    class="w-8 h-8 animate-spin text-muted-foreground/50"
                  />
                </div>
                <div
                  v-else-if="filteredModFiles.length === 0"
                  class="p-8 text-center text-muted-foreground text-sm"
                >
                  No files found matching current filters.
                </div>
                <div
                  v-else
                  class="p-2 space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar"
                >
                  <div
                    v-for="file in filteredModFiles"
                    :key="file.id"
                    class="flex items-center gap-3 p-2 rounded-lg hover:bg-background border border-transparent hover:border-border transition-all group/file"
                    :class="{
                      'opacity-60 grayscale cursor-not-allowed':
                        isSelectionMode && selectedModIds.has(mod.id),
                    }"
                  >
                    <!-- Inner Checkbox -->
                    <div
                      v-if="isSelectionMode"
                      class="pl-2"
                      :class="{
                        'pointer-events-none': selectedModIds.has(mod.id),
                      }"
                    >
                      <button
                        class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                        :class="
                          selectedFilesMap.has(file.id)
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30 bg-background'
                        "
                        @click.stop="toggleFileSelectionMap(file.id, mod.id)"
                      >
                        <Check
                          v-if="selectedFilesMap.has(file.id)"
                          class="w-3 h-3"
                        />
                      </button>
                    </div>

                    <div
                      class="flex-1 grid grid-cols-12 gap-4 items-center text-sm"
                    >
                      <div
                        class="col-span-6 font-medium truncate"
                        :title="file.displayName"
                      >
                        {{ file.displayName }}
                      </div>
                      <div class="col-span-2 text-xs text-muted-foreground">
                        {{ formatDate(file.fileDate) }}
                      </div>
                      <div class="col-span-2">
                        <span
                          class="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border"
                          :class="getReleaseColor(file.releaseType)"
                        >
                          {{
                            file.releaseType === 1
                              ? "Release"
                              : file.releaseType === 2
                              ? "Beta"
                              : "Alpha"
                          }}
                        </span>
                      </div>
                      <div
                        class="col-span-2 text-xs text-muted-foreground text-right"
                      >
                        {{ (file.fileLength / 1024 / 1024).toFixed(1) }} MB
                      </div>
                    </div>

                    <Button
                      v-if="!isSelectionMode"
                      size="sm"
                      :variant="
                        isFileInstalled(mod.id, file.id) ? 'secondary' : 'ghost'
                      "
                      class="h-8 w-24 ml-2 text-xs"
                      :disabled="
                        isFileInstalled(mod.id, file.id) ||
                        isAddingMod === mod.id
                      "
                      @click="addFileToLibrary(mod, file)"
                    >
                      <Check
                        v-if="isFileInstalled(mod.id, file.id)"
                        class="w-3 h-3 mr-1.5"
                      />
                      {{
                        isFileInstalled(mod.id, file.id)
                          ? "Installed"
                          : "Install"
                      }}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Load More -->
            <div v-if="hasMore" class="flex justify-center py-6">
              <Button
                variant="outline"
                @click="loadMore"
                :disabled="isSearching"
                class="min-w-[150px]"
              >
                <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin mr-2" />
                Load More
              </Button>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="!isSearching && hasApiKey"
            class="flex flex-col items-center justify-center h-full text-muted-foreground"
          >
            <div
              class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4"
            >
              <Search class="w-8 h-8 opacity-50" />
            </div>
            <p>No results found.</p>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(100, 100, 100, 0.2);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 100, 100, 0.4);
}
</style>
