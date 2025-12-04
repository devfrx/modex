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
} from "lucide-vue-next";
import { ref, onMounted, computed, watch } from "vue";
import type { Mod } from "@/types/electron";

const mods = ref<Mod[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref("");
const selectedLoader = ref<string>("all");

// Sorting
const sortBy = ref<"name" | "loader" | "created_at" | "version">("name");
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

const filteredMods = computed(() => {
  let result = mods.value.filter((mod) => {
    const matchesSearch = mod.name
      .toLowerCase()
      .includes(searchQuery.value.toLowerCase());
    const matchesLoader =
      selectedLoader.value === "all" || mod.loader === selectedLoader.value;
    return matchesSearch && matchesLoader;
  });

  // Sort
  result.sort((a, b) => {
    const aVal = a[sortBy.value] || "";
    const bVal = b[sortBy.value] || "";
    const cmp = aVal.localeCompare(bVal);
    return sortDir.value === "asc" ? cmp : -cmp;
  });

  return result;
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
    mods.value = await window.api.mods.getAll();
    const currentIds = new Set(mods.value.map((m) => m.id!));
    for (const id of selectedModIds.value) {
      if (!currentIds.has(id)) selectedModIds.value.delete(id);
    }
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
async function importFolder() {
  if (!isElectron()) return;
  const folder = await window.api.scanner.selectFolder();
  if (!folder) return;

  showProgress.value = true;
  progressTitle.value = "Scanning Folder";
  progressMessage.value = "Analyzing mod files...";

  try {
    // Scan to find JAR files
    const metadata = await window.api.scanner.scanFolder(folder);
    if (metadata.length === 0) {
      alert("No mods found.");
      showProgress.value = false;
      return;
    }

    // Extract paths from metadata and import
    const paths = metadata.map(m => m.path);
    progressMessage.value = `Importing ${metadata.length} mods to library...`;
    await window.api.scanner.importMods(paths);
    await loadMods();
  } catch (err) {
    alert("Import failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

async function importFiles() {
  if (!isElectron()) return;
  const files = await window.api.scanner.selectFiles();
  if (files.length === 0) return;

  showProgress.value = true;
  progressTitle.value = "Importing Files";
  progressMessage.value = `Importing ${files.length} mods to library...`;

  try {
    // Directly import selected files
    await window.api.scanner.importMods(files);
    await loadMods();
  } catch (err) {
    alert("Import failed: " + (err as Error).message);
  } finally {
    showProgress.value = false;
  }
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

onMounted(() => loadMods());
</script>

<template>
  <div class="p-6 h-full flex flex-col space-y-4 relative">
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
          @click="importFiles"
          :disabled="!isElectron()"
          variant="secondary"
          class="gap-2"
        >
          <FilePlus class="w-4 h-4" />
          Import Files
        </Button>
        <Button @click="importFolder" :disabled="!isElectron()" class="gap-2">
          <FolderPlus class="w-4 h-4" />
          Import Folder
        </Button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <Search
          class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
        />
        <Input
          v-model="searchQuery"
          placeholder="Search mods..."
          class="pl-9"
        />
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
        @delete="confirmDelete"
        @edit="openEditDialog"
        @toggle-select="toggleSelection"
        @show-details="showModDetails"
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

    <ProgressDialog
      :open="showProgress"
      :title="progressTitle"
      :message="progressMessage"
    />
  </div>
</template>
