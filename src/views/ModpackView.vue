<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import ModpackCard from "@/components/modpacks/ModpackCard.vue";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";
import ModpackCompareDialog from "@/components/modpacks/ModpackCompareDialog.vue";
import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
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
} from "lucide-vue-next";
import type { Modpack, Mod } from "@/types/electron";

interface ModpackWithCount extends Modpack {
  modCount: number;
}

const modpacks = ref<ModpackWithCount[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Selection State
const selectedModpackIds = ref<Set<string>>(new Set());

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

// Export Modpack
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

// Import Modpack
async function importModpack() {
  if (!isElectron()) return;

  try {
    const zipPath = await window.api.scanner.selectZipFile();
    if (!zipPath) return;

    const zipName = zipPath.split(/[\\/]/).pop()?.replace(".zip", "") || "Imported Modpack";
    importZipName.value = zipName;

    showProgress.value = true;
    progressTitle.value = "Importing Modpack";
    progressMessage.value = "Extracting and importing mods...";

    try {
      // New API handles everything: extract, import mods, create modpack
      const result = await window.api.scanner.importModpack(zipPath, zipName);
      
      showProgress.value = false;
      alert(`Imported modpack "${zipName}" with ${result.modCount} mods!`);
      await loadModpacks();
    } catch (err) {
      alert("Import failed: " + (err as Error).message);
      showProgress.value = false;
    }
  } catch (err) {
    alert("Import failed: " + (err as Error).message);
    showProgress.value = false;
  }
}

// Editor
function openEditor(id: string) {
  selectedModpackId.value = id;
  showEditor.value = true;
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

onMounted(() => loadModpacks());
</script>

<template>
  <div class="p-6 h-full flex flex-col space-y-6 relative">
    <!-- Header -->
    <div
      class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Modpacks</h1>
        <p class="text-muted-foreground">
          {{ modpacks.length }} packs • {{ totalMods }} mods total
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          @click="showCompare = true"
          :disabled="modpacks.length < 2"
          variant="outline"
          class="gap-2"
        >
          <ArrowLeftRight class="w-4 h-4" />
          Compare
        </Button>
        <Button
          @click="importModpack"
          :disabled="!isElectron()"
          variant="secondary"
          class="gap-2"
        >
          <Download class="w-4 h-4" />
          Import ZIP
        </Button>
        <Button
          @click="showCreateDialog = true"
          :disabled="!isElectron()"
          class="gap-2"
        >
          <PackagePlus class="w-4 h-4" />
          Create
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
      v-else-if="modpacks.length === 0"
      class="flex items-center justify-center flex-1"
    >
      <div class="text-center max-w-md">
        <div
          class="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <PackagePlus class="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-semibold mb-2">No modpacks yet</h3>
        <p class="text-muted-foreground mb-6">
          Create or import a modpack to get started.
        </p>
        <div class="flex justify-center gap-2">
          <Button @click="importModpack" variant="secondary">Import ZIP</Button>
          <Button @click="showCreateDialog = true">Create</Button>
        </div>
      </div>
    </div>

    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1 pb-20 overflow-auto"
    >
      <ModpackCard
        v-for="pack in modpacks"
        :key="pack.id"
        :modpack="pack"
        :selected="selectedModpackIds.has(pack.id)"
        @delete="confirmDelete"
        @edit="openEditor"
        @toggle-select="toggleSelection"
        @clone="cloneModpack"
        @open-folder="openInExplorer"
      />
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar
      v-if="selectedModpackIds.size > 0"
      :count="selectedModpackIds.size"
      label="modpacks"
      @clear="clearSelection"
    >
      <Button
        variant="destructive"
        size="sm"
        class="gap-2"
        @click="deleteSelectedModpacks"
      >
        <Trash2 class="w-4 h-4" />
        Delete
      </Button>
    </BulkActionBar>

    <!-- Modpack Editor Modal -->
    <ModpackEditor
      v-if="selectedModpackId"
      :modpack-id="selectedModpackId"
      :is-open="showEditor"
      @close="showEditor = false"
      @update="loadModpacks"
      @export="exportModpack(selectedModpackId || '')"
    />

    <!-- Compare Dialog -->
    <ModpackCompareDialog :open="showCompare" @close="showCompare = false" />

    <!-- Create Dialog -->
    <CreateModpackDialog
      :open="showCreateDialog"
      @close="showCreateDialog = false"
      @create="createModpack"
    />

    <!-- Delete Confirmation -->
    <Dialog
      :open="showDeleteDialog"
      title="Delete Modpack"
      description="This will not delete the mods inside."
    >
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false"
          >Cancel</Button
        >
        <Button variant="destructive" @click="deleteModpack">Delete</Button>
      </template>
    </Dialog>

    <ProgressDialog
      :open="showProgress"
      :title="progressTitle"
      :message="progressMessage"
    />
  </div>
</template>
