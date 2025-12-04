<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import ModpackCard from "@/components/modpacks/ModpackCard.vue";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";
import ModpackCompareDialog from "@/components/modpacks/ModpackCompareDialog.vue";
import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import ShareDialog from "@/components/modpacks/ShareDialog.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import {
  PackagePlus,
  Download,
  Trash2,
  ArrowLeftRight,
  BarChart3,
  Star,
  Share2,
} from "lucide-vue-next";
import type { Modpack, Mod } from "@/types/electron";

const route = useRoute();
const router = useRouter();
const toast = useToast();

interface ModpackWithCount extends Modpack {
  modCount: number;
}

const modpacks = ref<ModpackWithCount[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Selection State
const selectedModpackIds = ref<Set<string>>(new Set());

// Favorites
const favoriteModpacks = ref<Set<string>>(new Set());

// Quick filter
const quickFilter = ref<"all" | "favorites">("all");

// Editor State
const showEditor = ref(false);
const selectedModpackId = ref<string | null>(null);

// Compare State
const showCompare = ref(false);

// Delete State
const showDeleteDialog = ref(false);
const modpackToDelete = ref<string | null>(null);

// Create State
const showCreateDialog = ref(false);

// Share State
const showShareDialog = ref(false);
const shareModpackId = ref<string | null>(null);
const shareModpackName = ref<string>("");

// Import State
const showProgress = ref(false);
const progressTitle = ref("");
const progressMessage = ref("");
const importZipName = ref("");

// Stats
const totalMods = computed(() =>
  modpacks.value.reduce((sum, p) => sum + p.modCount, 0)
);
const loaderBreakdown = computed(() => {
  // This would require loading all mods - simplified for now
  return modpacks.value.length > 0 ? `${modpacks.value.length} packs` : "";
});

// Check if running in Electron
const isElectron = () => window.api !== undefined;

async function loadModpacks() {
  if (!isElectron()) {
    error.value = "This app must be run in Electron, not in a browser.";
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    const packs = await window.api.modpacks.getAll();

    const packsWithCounts = await Promise.all(
      packs.map(async (pack) => {
        const mods = await window.api.modpacks.getMods(pack.id!);
        return { ...pack, modCount: mods.length };
      })
    );

    modpacks.value = packsWithCounts;

    const currentIds = new Set(modpacks.value.map((m) => m.id!));
    for (const id of selectedModpackIds.value) {
      if (!currentIds.has(id)) selectedModpackIds.value.delete(id);
    }
  } catch (err) {
    console.error("Failed to load modpacks:", err);
    error.value = "Failed to load modpacks: " + (err as Error).message;
  } finally {
    isLoading.value = false;
  }
}

// Selection Logic
function toggleSelection(id: string) {
  if (selectedModpackIds.value.has(id)) {
    selectedModpackIds.value.delete(id);
  } else {
    selectedModpackIds.value.add(id);
  }
}

function clearSelection() {
  selectedModpackIds.value.clear();
}

// Bulk Actions
async function deleteSelectedModpacks() {
  if (!confirm(`Delete ${selectedModpackIds.value.size} modpacks?`)) return;

  showProgress.value = true;
  progressTitle.value = "Deleting Modpacks";

  const ids = Array.from(selectedModpackIds.value);
  let deletedCount = 0;

  try {
    for (const id of ids) {
      progressMessage.value = `Deleting ${++deletedCount} of ${ids.length}...`;
      await window.api.modpacks.delete(id);
    }
    await loadModpacks();
    clearSelection();
  } catch (err) {
    alert("Delete failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Create Modpack
async function createModpack(data: {
  name: string;
  version: string;
  description: string;
  image_path?: string;
}) {
  showCreateDialog.value = false;
  try {
    await window.api.modpacks.add(data);
    await loadModpacks();
  } catch (err) {
    alert("Failed to create: " + (err as Error).message);
  }
}

// Export Modpack as ZIP
async function exportModpack(modpackId: string) {
  const pack = modpacks.value.find((p) => p.id === modpackId);
  if (!pack) return;

  const path = await window.api.scanner.selectExportPath(pack.name);
  if (!path) return;

  showProgress.value = true;
  progressTitle.value = "Exporting Modpack";
  progressMessage.value = "Creating ZIP file...";

  try {
    await window.api.scanner.exportModpack(modpackId, path);
    alert(`Exported to: ${path}`);
  } catch (err) {
    alert("Export failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export Modpack to Game Folder
async function exportModpackToGame(modpackId: string) {
  const targetFolder = await window.api.scanner.selectGameFolder();
  if (!targetFolder) return;

  showProgress.value = true;
  progressTitle.value = "Exporting to Game";
  progressMessage.value = "Copying mods to game folder...";

  try {
    const result = await window.api.scanner.exportModpackToGameFolder(modpackId, targetFolder);
    if (result.success) {
      alert(`Successfully exported ${result.count} mods to:\n${targetFolder}`);
    } else {
      alert("Export failed. Please check the target folder and try again.");
    }
  } catch (err) {
    alert("Export failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Clone Modpack
async function cloneModpack(modpackId: string) {
  const original = modpacks.value.find((p) => p.id === modpackId);
  if (!original) return;

  showProgress.value = true;
  progressTitle.value = "Cloning Modpack";
  progressMessage.value = "Creating copy...";

  try {
    // Use the new clone API that handles everything
    const newPackId = await window.api.modpacks.clone(modpackId, `${original.name} (Copy)`);

    if (!newPackId) {
      throw new Error("Clone failed");
    }

    await loadModpacks();
  } catch (err) {
    alert("Clone failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Open modpack folder in Explorer
async function openInExplorer(modpackId: string) {
  try {
    await window.api.scanner.openModpackFolder(modpackId);
  } catch (err) {
    console.error("Failed to open in explorer:", err);
  }
}

// Import CurseForge Modpack
const importProgress = ref({ current: 0, total: 0, modName: '' });

async function importCurseForgeModpack() {
  if (!isElectron()) return;

  showProgress.value = true;
  progressTitle.value = "Importing CurseForge Modpack";
  progressMessage.value = "Select a modpack ZIP file...";
  importProgress.value = { current: 0, total: 0, modName: '' };

  // Listen for progress updates
  const progressHandler = (data: { current: number; total: number; modName: string }) => {
    importProgress.value = data;
    progressMessage.value = `Downloading mod ${data.current}/${data.total}: ${data.modName}`;
  };

  window.api.on('cf-import-progress', progressHandler);

  try {
    const result = await window.api.share.importCurseForgeZip();

    if (!result) {
      // User cancelled - cleanup and return
      window.ipcRenderer.off('cf-import-progress', progressHandler as any);
      showProgress.value = false;
      return;
    }

    if (result.success) {
      let message = `Successfully imported ${result.modsImported} mods.`;
      if (result.modsSkipped > 0) {
        message += ` ${result.modsSkipped} mods were skipped.`;
      }
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 5).join('\n')}`;
        if (result.errors.length > 5) {
          message += `\n... and ${result.errors.length - 5} more errors`;
        }
      }
      toast.success('Import Successful', message, 7000);
      await loadModpacks();
    } else {
      toast.error('Import Failed', result.errors[0] || "Unknown error", 7000);
    }
  } catch (err) {
    toast.error('Import Error', (err as Error).message, 7000);
  } finally {
    window.ipcRenderer.off('cf-import-progress', progressHandler as any);
    showProgress.value = false;
    // Ensure DOM update completes
    await nextTick();
    // Force focus restore - sometimes Electron loses focus after alert()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.focus();
    document.body.blur();
    console.log('[ModpackView] Progress dialog closed, showProgress =', showProgress.value);
  }
}

// Editor
function openEditor(id: string) {
  selectedModpackId.value = id;
  showEditor.value = true;
}

// Share
function openShareExport(id: string, name: string) {
  shareModpackId.value = id;
  shareModpackName.value = name;
  showShareDialog.value = true;
}

function openShareImport() {
  shareModpackId.value = null;
  shareModpackName.value = "";
  showShareDialog.value = true;
}

// Delete Single
function confirmDelete(id: string) {
  modpackToDelete.value = id;
  showDeleteDialog.value = true;
}

async function deleteModpack() {
  if (!modpackToDelete.value) return;
  try {
    await window.api.modpacks.delete(modpackToDelete.value);
    await loadModpacks();
    showDeleteDialog.value = false;
    modpackToDelete.value = null;
  } catch (err) {
    alert("Delete failed: " + (err as Error).message);
  }
}

// Drag & Drop support for ZIP files
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

  if (!event.dataTransfer?.files.length) return;

  const file = event.dataTransfer.files[0];
  if (!file.name.endsWith('.zip')) {
    alert("Please drop a .zip modpack file.");
    return;
  }

  // Use electronUtils to get the file path safely
  const zipPath = window.electronUtils?.getPathForFile(file) || (file as any).path;
  if (!zipPath) {
    alert("Could not read file path. Please try importing via the button.");
    return;
  }

  const zipName = file.name.replace(".zip", "");

  showProgress.value = true;
  progressTitle.value = "Importing Modpack";
  progressMessage.value = "Extracting and importing mods...";

  try {
    const result = await window.api.scanner.importModpack(zipPath, zipName);
    showProgress.value = false;
    alert(`Imported modpack "${zipName}" with ${result.modCount} mods!`);
    await loadModpacks();
  } catch (err) {
    alert("Import failed: " + (err as Error).message);
    showProgress.value = false;
  }
}

// Favorites system
function loadFavoriteModpacks() {
  const stored = localStorage.getItem("modex:favorites:modpacks");
  if (stored) {
    favoriteModpacks.value = new Set(JSON.parse(stored));
  }
}

function saveFavoriteModpacks() {
  localStorage.setItem("modex:favorites:modpacks", JSON.stringify([...favoriteModpacks.value]));
  window.dispatchEvent(new Event("storage"));
}

function toggleFavoriteModpack(id: string) {
  if (favoriteModpacks.value.has(id)) {
    favoriteModpacks.value.delete(id);
  } else {
    favoriteModpacks.value.add(id);
  }
  saveFavoriteModpacks();
}

// Sort and filter modpacks
const sortedModpacks = computed(() => {
  let result = [...modpacks.value];

  // Apply quick filter
  if (quickFilter.value === "favorites") {
    result = result.filter(p => favoriteModpacks.value.has(p.id));
  }

  // Sort - favorites first, then by name
  return result.sort((a, b) => {
    const aFav = favoriteModpacks.value.has(a.id) ? 0 : 1;
    const bFav = favoriteModpacks.value.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.name.localeCompare(b.name);
  });
});

// Handle URL filter parameter
watch(
  () => route.query.filter,
  (filter) => {
    if (filter === "favorites") {
      quickFilter.value = "favorites";
    } else {
      quickFilter.value = "all";
    }
  },
  { immediate: true }
);

onMounted(() => {
  loadFavoriteModpacks();
  loadModpacks();
});
</script>

<template>
  <div class="p-6 h-full flex flex-col space-y-6 relative" @dragenter="handleDragEnter" @dragover="handleDragOver"
    @dragleave="handleDragLeave" @drop="handleDrop">
    <!-- Drag & Drop Overlay -->
    <div v-if="isDragging"
      class="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
      <div class="text-center">
        <Download class="w-16 h-16 mx-auto text-primary mb-4" />
        <p class="text-xl font-semibold">Drop modpack .zip here</p>
        <p class="text-muted-foreground">The modpack will be imported</p>
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Modpacks</h1>
        <p class="text-muted-foreground">
          {{ modpacks.length }} packs • {{ totalMods }} mods total
        </p>
      </div>
      <div class="flex gap-2">
        <Button @click="showCompare = true" :disabled="modpacks.length < 2" variant="outline" class="gap-2">
          <ArrowLeftRight class="w-4 h-4" />
          Compare
        </Button>
        <Button @click="openShareImport" :disabled="!isElectron()" variant="outline" class="gap-2">
          <Share2 class="w-4 h-4" />
          Import .modex
        </Button>
        <Button @click="importCurseForgeModpack" :disabled="!isElectron()" variant="secondary" class="gap-2">
          <Download class="w-4 h-4" />
          Import CF Modpack
        </Button>
        <Button @click="showCreateDialog = true" :disabled="!isElectron()" class="gap-2">
          <PackagePlus class="w-4 h-4" />
          Create
        </Button>
      </div>
    </div>

    <!-- Quick Filters -->
    <div class="flex items-center gap-2">
      <button class="px-3 py-1.5 text-sm rounded-full transition-colors"
        :class="quickFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'"
        @click="quickFilter = 'all'; router.push('/modpacks')">
        All
      </button>
      <button class="px-3 py-1.5 text-sm rounded-full transition-colors flex items-center gap-1.5"
        :class="quickFilter === 'favorites' ? 'bg-yellow-500 text-white' : 'bg-muted hover:bg-accent'"
        @click="quickFilter = 'favorites'; router.push('/modpacks?filter=favorites')">
        <Star class="w-3.5 h-3.5" />
        Favorites
        <span v-if="favoriteModpacks.size > 0" class="text-xs opacity-80">({{ favoriteModpacks.size }})</span>
      </button>
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

    <div v-else-if="modpacks.length === 0" class="flex items-center justify-center flex-1">
      <div class="text-center max-w-md">
        <div class="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <PackagePlus class="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-semibold mb-2">No modpacks yet</h3>
        <p class="text-muted-foreground mb-6">
          Create or import a modpack to get started.
        </p>
        <div class="flex justify-center gap-2">
          <Button @click="importCurseForgeModpack" variant="secondary">Import CF Modpack</Button>
          <Button @click="showCreateDialog = true">Create</Button>
        </div>
      </div>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1 pb-20 overflow-auto">
      <ModpackCard v-for="pack in sortedModpacks" :key="pack.id" :modpack="pack"
        :selected="selectedModpackIds.has(pack.id)" :favorite="favoriteModpacks.has(pack.id)" @delete="confirmDelete"
        @edit="openEditor" @toggle-select="toggleSelection" @clone="cloneModpack" @open-folder="openInExplorer"
        @toggle-favorite="toggleFavoriteModpack" @share="openShareExport" />
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModpackIds.size > 0" :count="selectedModpackIds.size" label="modpacks"
      @clear="clearSelection">
      <Button variant="destructive" size="sm" class="gap-2" @click="deleteSelectedModpacks">
        <Trash2 class="w-4 h-4" />
        Delete
      </Button>
    </BulkActionBar>

    <!-- Modpack Editor Modal -->
    <ModpackEditor v-if="selectedModpackId" :modpack-id="selectedModpackId" :is-open="showEditor"
      @close="showEditor = false" @update="loadModpacks" @export="exportModpack(selectedModpackId || '')"
      @exportToGame="exportModpackToGame(selectedModpackId || '')" />

    <!-- Compare Dialog -->
    <ModpackCompareDialog :open="showCompare" @close="showCompare = false" />

    <!-- Create Dialog -->
    <CreateModpackDialog :open="showCreateDialog" @close="showCreateDialog = false" @create="createModpack" />

    <!-- Delete Confirmation -->
    <Dialog :open="showDeleteDialog" title="Delete Modpack" description="This will not delete the mods inside.">
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="deleteModpack">Delete</Button>
      </template>
    </Dialog>

    <ProgressDialog :open="showProgress" :title="progressTitle" :message="progressMessage" />

    <!-- Share Dialog -->
    <ShareDialog :open="showShareDialog" :modpack-id="shareModpackId ?? undefined" :modpack-name="shareModpackName"
      @close="showShareDialog = false" @refresh="loadModpacks" />
  </div>
</template>
