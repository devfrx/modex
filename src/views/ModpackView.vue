<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import ModpackCard from "@/components/modpacks/ModpackCard.vue";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";
import ModpackCompareDialog from "@/components/modpacks/ModpackCompareDialog.vue";
import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import ShareDialog from "@/components/modpacks/ShareDialog.vue";
import ConvertModpackDialog from "@/components/modpacks/ConvertModpackDialog.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
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
  RefreshCw,
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
const showBulkDeleteDialog = ref(false);
const modpackToDelete = ref<string | null>(null);

// Create State
const showCreateDialog = ref(false);

// Share State
const showShareDialog = ref(false);
const shareModpackId = ref<string | null>(null);
const shareModpackName = ref<string>("");

// Convert State
const showConvertDialog = ref(false);
const convertModpack = ref<Modpack | null>(null);

// Import State
const showProgress = ref(false);
const progressTitle = ref("");
const progressMessage = ref("");
const importZipName = ref("");

// CF Import Conflicts
const showCFConflictDialog = ref(false);
const pendingCFConflicts = ref<{
  conflicts: Array<{
    modName: string;
    existingVersion: string;
    existingGameVersion: string;
    newVersion: string;
    newGameVersion: string;
    projectID: number;
    fileID: number;
    existingFileId: number;
    existingMod: {
      id: string;
      name: string;
      version: string;
      game_version: string;
    };
    resolution?: 'use_existing' | 'use_new';
  }>;
  modpackId: string;
} | null>(null);

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
function confirmBulkDelete() {
  showBulkDeleteDialog.value = true;
}

async function deleteSelectedModpacks() {
  showBulkDeleteDialog.value = false;

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
    toast.error("Delete Failed", (err as Error).message);
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
    await window.api.modpacks.create(data);
    await loadModpacks();
  } catch (err) {
    toast.error("Create Failed", (err as Error).message);
  }
}

// Export Modpack as CurseForge ZIP
async function exportModpack(modpackId: string) {
  showProgress.value = true;
  progressTitle.value = "Exporting Modpack";
  progressMessage.value = "Creating CurseForge manifest...";

  try {
    const result = await window.api.export.curseforge(modpackId);
    if (result) {
      toast.success("Export Complete", `Exported to: ${result.path}`);
    }
  } catch (err) {
    toast.error("Export Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export to Game Folder - Not available in metadata-only mode
async function exportModpackToGame(_modpackId: string) {
  toast.info(
    "Not Available",
    "Export to game folder is not available in this version. Mods are stored as references only. Export as CurseForge format and import in your launcher."
  );
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
    const newPackId = await window.api.modpacks.clone(
      modpackId,
      `${original.name} (Copy)`
    );

    if (!newPackId) {
      throw new Error("Clone failed");
    }

    await loadModpacks();
  } catch (err) {
    toast.error("Clone Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Open modpack folder in explorer
async function openInExplorer(modpackId: string) {
  try {
    await window.api.modpacks.openFolder(modpackId);
  } catch (err) {
    console.error("Failed to open folder:", err);
  }
}

// Import CurseForge Modpack
const importProgress = ref({ current: 0, total: 0, modName: "" });

async function importCurseForgeModpack() {
  if (!isElectron()) return;

  showProgress.value = true;
  progressTitle.value = "Importing CurseForge Modpack";
  progressMessage.value = "Select a modpack ZIP file...";
  importProgress.value = { current: 0, total: 0, modName: "" };

  // Listen for progress updates
  const progressHandler = (data: {
    current: number;
    total: number;
    modName: string;
  }) => {
    importProgress.value = data;
    progressMessage.value = `Downloading mod ${data.current}/${data.total}: ${data.modName}`;
  };

  window.api.on("import:progress", progressHandler);

  try {
    const result = await window.api.import.curseforge();
    console.log('[CF Import] Result:', result);

    if (!result) {
      // User cancelled - cleanup and return
      window.ipcRenderer.off("import:progress", progressHandler as any);
      showProgress.value = false;
      return;
    }

    // Check if conflicts need resolution
    if (result.requiresResolution && result.conflicts) {
      console.log(`[CF Import] ${result.conflicts.length} conflicts detected, showing dialog`);
      window.ipcRenderer.off("import:progress", progressHandler as any);
      showProgress.value = false;

      pendingCFConflicts.value = {
        conflicts: result.conflicts.map((c: any) => ({
          ...c,
          resolution: 'use_existing' as const,
          existingGameVersion: c.existingGameVersion || c.existingMod?.game_version || 'unknown',
          newGameVersion: c.newGameVersion || 'unknown',
          existingFileId: c.existingFileId || c.existingMod?.cf_file_id || 0,
        })),
        modpackId: result.modpackId || '',
      };
      showCFConflictDialog.value = true;
      return;
    }

    if (result.success) {
      let message = `Successfully imported ${result.modsImported} mods.`;
      if (result.modsSkipped > 0) {
        message += ` ${result.modsSkipped} mods were skipped.`;
      }
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 5).join("\n")}`;
        if (result.errors.length > 5) {
          message += `\n... and ${result.errors.length - 5} more errors`;
        }
      }
      toast.success("Import Successful", message, 7000);
      await loadModpacks();
    } else {
      toast.error("Import Failed", result.errors[0] || "Unknown error", 7000);
    }
  } catch (err) {
    toast.error("Import Error", (err as Error).message, 7000);
  } finally {
    window.ipcRenderer.off("import:progress", progressHandler as any);
    showProgress.value = false;
    // Ensure DOM update completes
    await nextTick();
    // Force focus restore
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.focus();
    document.body.blur();
    console.log(
      "[ModpackView] Progress dialog closed, showProgress =",
      showProgress.value
    );
  }
}

async function resolveCFConflicts() {
  if (!pendingCFConflicts.value) return;

  showProgress.value = true;
  progressTitle.value = "Resolving conflicts...";
  progressMessage.value = "Applying your choices";

  try {
    const result = await window.api.import.resolveCFConflicts({
      modpackId: pendingCFConflicts.value.modpackId,
      conflicts: pendingCFConflicts.value.conflicts.map(c => ({
        projectID: c.projectID,
        fileID: c.fileID,
        existingModId: c.existingMod.id,
        resolution: c.resolution || 'use_existing',
      })),
    });

    if (result.success) {
      showCFConflictDialog.value = false;
      pendingCFConflicts.value = null;

      let message = `Successfully imported ${result.modsImported} mods.`;
      if (result.modsSkipped > 0) {
        message += ` ${result.modsSkipped} mods were skipped.`;
      }
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 3).join("\n")}`;
      }
      toast.success("Import Successful", message, 7000);
      await loadModpacks();
    } else {
      toast.error("Import Failed", result.errors[0] || "Unknown error");
    }
  } catch (err) {
    console.error('[CF Conflicts] Resolution failed:', err);
    toast.error("Resolution Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
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
    toast.error("Delete Failed", (err as Error).message);
  }
}

// Convert Modpack
function openConvertDialog(id: string) {
  const pack = modpacks.value.find((p) => p.id === id);
  if (pack) {
    convertModpack.value = pack;
    showConvertDialog.value = true;
  }
}

function closeConvertDialog() {
  showConvertDialog.value = false;
  convertModpack.value = null;
}

async function handleConvertSuccess() {
  await loadModpacks();
  closeConvertDialog();
  toast.success("Conversion Complete", "Your converted modpack is ready!");
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

  // Drag and drop import not supported in metadata-only mode
  toast.info(
    "Not Available",
    "Drag and drop import is not available. Please use the 'Import CF Modpack' button instead."
  );
}

// Favorites system
function loadFavoriteModpacks() {
  const stored = localStorage.getItem("modex:favorites:modpacks");
  if (stored) {
    favoriteModpacks.value = new Set(JSON.parse(stored));
  }
}

function saveFavoriteModpacks() {
  localStorage.setItem(
    "modex:favorites:modpacks",
    JSON.stringify([...favoriteModpacks.value])
  );
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
    result = result.filter((p) => favoriteModpacks.value.has(p.id));
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
  <div class="h-full flex flex-col relative" @dragenter="handleDragEnter" @dragover="handleDragOver"
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

    <!-- Compact Header -->
    <div class="shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#0a0a0a]">
      <!-- Mobile: Stack vertically, Desktop: Row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
        <!-- Left: Title & Stats -->
        <div class="flex items-center gap-3 sm:gap-4">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
              <PackagePlus class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 class="text-base sm:text-lg font-semibold tracking-tight">Modpacks</h1>
              <p class="text-[10px] sm:text-xs text-muted-foreground">
                {{ modpacks.length }} packs • {{ totalMods }} mods
              </p>
            </div>
          </div>

          <!-- Separator - hidden on mobile -->
          <div class="hidden sm:block h-8 w-px bg-white/10" />

          <!-- Quick Filters -->
          <div class="flex items-center gap-1 sm:gap-1.5">
            <button class="px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all" :class="quickFilter === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'"
              @click="quickFilter = 'all'; router.push('/modpacks');">
              All
            </button>
            <button
              class="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all"
              :class="quickFilter === 'favorites'
                ? 'bg-yellow-500/20 text-yellow-400 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'"
              @click="quickFilter = 'favorites'; router.push('/modpacks?filter=favorites');">
              <Star class="w-3 h-3" :class="quickFilter === 'favorites' ? 'fill-yellow-400' : ''" />
              <span v-if="favoriteModpacks.size > 0" class="hidden xs:inline">({{ favoriteModpacks.size }})</span>
            </button>
          </div>
        </div>

        <!-- Right: Actions -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <Button @click="showCompare = true" :disabled="modpacks.length < 2" variant="ghost" size="sm"
            class="gap-1 sm:gap-1.5 text-muted-foreground hover:text-foreground h-7 sm:h-8 px-2 sm:px-3">
            <ArrowLeftRight class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden lg:inline text-xs">Compare</span>
          </Button>
          <Button @click="openShareImport" :disabled="!isElectron()" variant="ghost" size="sm"
            class="gap-1 sm:gap-1.5 text-muted-foreground hover:text-foreground h-7 sm:h-8 px-2 sm:px-3 hidden sm:flex">
            <Share2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden lg:inline text-xs">.modex</span>
          </Button>
          <Button @click="importCurseForgeModpack" :disabled="!isElectron()" variant="secondary" size="sm"
            class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
            <Download class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden xs:inline">Import</span>
          </Button>
          <Button @click="showCreateDialog = true" :disabled="!isElectron()" size="sm"
            class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
            <PackagePlus class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden xs:inline">Create</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-if="error" class="flex items-center justify-center flex-1 bg-[#0a0a0a]">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="flex items-center justify-center flex-1 bg-[#0a0a0a]">
      <div class="flex flex-col items-center gap-2">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <div v-else-if="modpacks.length === 0" class="flex items-center justify-center flex-1 bg-[#0a0a0a]">
      <div class="text-center max-w-md">
        <div class="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <PackagePlus class="w-8 h-8 text-primary" />
        </div>
        <h3 class="text-lg font-semibold mb-2">No modpacks yet</h3>
        <p class="text-muted-foreground mb-6 text-sm">
          Create or import a modpack to get started.
        </p>
        <div class="flex justify-center gap-2">
          <Button @click="importCurseForgeModpack" variant="secondary" size="sm" class="gap-1.5">
            <Download class="w-4 h-4" />
            Import CF
          </Button>
          <Button @click="showCreateDialog = true" size="sm" class="gap-1.5">
            <PackagePlus class="w-4 h-4" />
            Create
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 overflow-auto p-3 sm:p-6 pb-20 bg-[#0a0a0a]">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        <ModpackCard v-for="pack in sortedModpacks" :key="pack.id" :modpack="pack"
          :selected="selectedModpackIds.has(pack.id)" :favorite="favoriteModpacks.has(pack.id)" @delete="confirmDelete"
          @edit="openEditor" @toggle-select="toggleSelection" @clone="cloneModpack" @open-folder="openInExplorer"
          @toggle-favorite="toggleFavoriteModpack" @share="openShareExport" @convert="openConvertDialog" />
      </div>
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModpackIds.size > 0" :count="selectedModpackIds.size" label="modpacks"
      @clear="clearSelection">
      <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDelete">
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

    <ConfirmDialog :open="showBulkDeleteDialog" title="Delete Selected Modpacks"
      :message="`Are you sure you want to delete ${selectedModpackIds.size} selected modpack${selectedModpackIds.size > 1 ? 's' : ''}? This will not delete the mods inside.`"
      confirm-text="Delete" variant="danger" icon="trash" @confirm="deleteSelectedModpacks"
      @cancel="showBulkDeleteDialog = false" @close="showBulkDeleteDialog = false" />

    <ProgressDialog :open="showProgress" :title="progressTitle" :message="progressMessage" />

    <!-- Share Dialog -->
    <ShareDialog :open="showShareDialog" :modpack-id="shareModpackId ?? undefined" :modpack-name="shareModpackName"
      @close="showShareDialog = false" @refresh="loadModpacks" />

    <!-- Convert Dialog -->
    <ConvertModpackDialog :open="showConvertDialog" :modpack="convertModpack" @close="closeConvertDialog"
      @success="handleConvertSuccess" />

    <!-- CF Import Conflict Resolution Dialog -->
    <Dialog :open="showCFConflictDialog" @close="showCFConflictDialog = false">
      <template #header>
        <h2 class="text-xl font-bold">Version Conflicts Detected</h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Some mods already exist in your library with different versions. Choose which version to use:
        </p>

        <div v-if="pendingCFConflicts" class="space-y-3 max-h-96 overflow-y-auto">
          <div v-for="(conflict, idx) in pendingCFConflicts.conflicts" :key="idx"
            class="p-4 rounded-lg border bg-card space-y-3">
            <div class="flex items-center justify-between">
              <div class="font-semibold">{{ conflict.modName }}</div>
              <div class="text-xs text-muted-foreground">
                File ID: {{ conflict.existingFileId }} → {{ conflict.fileID }}
              </div>
            </div>

            <!-- Use Existing Version -->
            <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_existing'
              ? 'bg-primary/10 border-primary'
              : 'bg-muted/50 border-border hover:bg-muted'
              ">
              <input type="radio" :name="`cf-conflict-${idx}`" value="use_existing" v-model="conflict.resolution"
                class="mt-1" />
              <div class="flex-1">
                <div class="font-medium text-sm">Keep existing version</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{
                    conflict.existingGameVersion || 'unknown' }}</span>
                  <span class="text-xs text-muted-foreground truncate max-w-[200px]"
                    :title="conflict.existingVersion">{{
                      conflict.existingVersion }}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  Already in your library
                </div>
              </div>
            </label>

            <!-- Use New Version -->
            <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_new'
              ? 'bg-primary/10 border-primary'
              : 'bg-muted/50 border-border hover:bg-muted'
              ">
              <input type="radio" :name="`cf-conflict-${idx}`" value="use_new" v-model="conflict.resolution"
                class="mt-1" />
              <div class="flex-1">
                <div class="font-medium text-sm">Download new version</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{
                    conflict.newGameVersion
                    || 'unknown' }}</span>
                  <span class="text-xs text-muted-foreground truncate max-w-[200px]" :title="conflict.newVersion">{{
                    conflict.newVersion }}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  From the imported modpack
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2">
          <Button variant="outline" @click="showCFConflictDialog = false; pendingCFConflicts = null">
            Cancel
          </Button>
          <Button @click="resolveCFConflicts">
            Apply Choices
          </Button>
        </div>
      </template>
    </Dialog>
  </div>
</template>
