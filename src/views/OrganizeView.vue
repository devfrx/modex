<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import {
  FolderPlus,
  FolderTree,
  Search,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Home,
  RefreshCw,
  Package,
  Folder,
  Trash2,
  Check,
  X,
  Move,
  FolderInput,
  MoreVertical,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import TreeNodeItem from "@/components/tree/TreeNodeItem.vue";
import { useFolderTree } from "@/composables/useFolderTree";
import type { Mod, ModFolder, TreeNode } from "@/types/electron";

const {
  folders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveModToFolder,
  moveModsToFolder,
  getModFolder,
  moveFolderTo,
  toggleFolderExpanded,
  buildTree,
  getFolderById,
  getFolderPath,
} = useFolderTree();

// Data
const mods = ref<Mod[]>([]);
const isLoading = ref(true);
const searchQuery = ref("");

// Tree state
const tree = ref<TreeNode[]>([]);
const selectedNodeId = ref<string | null>(null);
const selectedNodeType = ref<"folder" | "mod" | null>(null);
const draggedNodeId = ref<string | null>(null);
const draggedNodeType = ref<"folder" | "mod" | null>(null);
const dropTargetId = ref<string | null>(null);

// Bulk selection state
const selectedModIds = ref<Set<string>>(new Set());
const isSelectionMode = ref(false);

// Context menu state
const contextMenu = ref<{ x: number; y: number; modId?: string; folderId?: string } | null>(null);
const showMoveDialog = ref(false);
const moveTargetFolderId = ref<string | null>(null);

// Current folder navigation
const currentFolderId = ref<string | null>(null);
const viewMode = ref<"tree" | "grid">("tree");

// Dialogs
const showCreateFolderDialog = ref(false);
const showRenameFolderDialog = ref(false);
const showDeleteDialog = ref(false);
const newFolderName = ref("");
const newFolderColor = ref("#6366f1");
const editingFolderId = ref<string | null>(null);
const deletingNodeId = ref<string | null>(null);
const deletingNodeType = ref<"folder" | "mod" | null>(null);

// Computed
const currentFolder = computed(() => {
  if (!currentFolderId.value) return null;
  return getFolderById(currentFolderId.value);
});

const breadcrumbs = computed(() => {
  if (!currentFolderId.value) return [];
  return getFolderPath(currentFolderId.value);
});

// Mods that are not in any folder
const unorganizedMods = computed(() => {
  return mods.value.filter(mod => {
    const modFolderId = getModFolder(mod.id);
    return modFolderId === null;
  });
});

const currentFolderMods = computed(() => {
  if (viewMode.value === "tree") return [];

  return mods.value.filter(mod => {
    const modFolderId = getModFolder(mod.id);
    return modFolderId === currentFolderId.value;
  });
});

const currentFolderSubfolders = computed(() => {
  return folders.value.filter(f => f.parentId === currentFolderId.value);
});

const filteredTree = computed(() => {
  if (!searchQuery.value.trim()) return tree.value;

  const query = searchQuery.value.toLowerCase();

  function filterNode(node: TreeNode): TreeNode | null {
    if (node.type === "mod") {
      const mod = node.data as Mod;
      if (mod.name.toLowerCase().includes(query) ||
        mod.author?.toLowerCase().includes(query)) {
        return node;
      }
      return null;
    }

    // For folders, check children
    const filteredChildren = node.children
      ?.map(child => filterNode(child))
      .filter((n): n is TreeNode => n !== null) || [];

    const folder = node.data as ModFolder;
    if (folder.name.toLowerCase().includes(query) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
        expanded: true,
      };
    }

    return null;
  }

  return tree.value
    .map(node => filterNode(node))
    .filter((n): n is TreeNode => n !== null);
});

// Load data
async function loadMods() {
  isLoading.value = true;
  try {
    mods.value = await window.api.mods.getAll();
    rebuildTree();
  } catch (err) {
    console.error("Failed to load mods:", err);
  } finally {
    isLoading.value = false;
  }
}

function rebuildTree() {
  tree.value = buildTree(mods.value);
}

// Folder actions
function handleCreateFolder() {
  if (!newFolderName.value.trim()) return;

  createFolder(
    newFolderName.value.trim(),
    editingFolderId.value, // parent
    newFolderColor.value
  );

  newFolderName.value = "";
  newFolderColor.value = "#6366f1";
  editingFolderId.value = null;
  showCreateFolderDialog.value = false;
  rebuildTree();
}

function handleRenameFolder() {
  if (!editingFolderId.value || !newFolderName.value.trim()) return;

  updateFolder(editingFolderId.value, {
    name: newFolderName.value.trim(),
    color: newFolderColor.value,
  });

  newFolderName.value = "";
  editingFolderId.value = null;
  showRenameFolderDialog.value = false;
  rebuildTree();
}

function handleDeleteNode() {
  if (!deletingNodeId.value) return;

  if (deletingNodeType.value === "folder") {
    deleteFolder(deletingNodeId.value, true);
  } else {
    // Remove mod from folder (doesn't delete the mod)
    moveModToFolder(deletingNodeId.value, null);
  }

  deletingNodeId.value = null;
  deletingNodeType.value = null;
  showDeleteDialog.value = false;
  rebuildTree();
}

// Tree events
function handleNodeSelect(nodeId: string, type: "folder" | "mod") {
  selectedNodeId.value = nodeId;
  selectedNodeType.value = type;
}

function handleToggle(folderId: string) {
  toggleFolderExpanded(folderId);
  rebuildTree();
}

function handleDragStart(nodeId: string, type: "folder" | "mod") {
  draggedNodeId.value = nodeId;
  draggedNodeType.value = type;
}

function handleDragEnd() {
  draggedNodeId.value = null;
  draggedNodeType.value = null;
  dropTargetId.value = null;
}

function handleDragEnterFolder(folderId: string) {
  // Don't allow dropping a folder into itself
  if (draggedNodeId.value === folderId) return;
  dropTargetId.value = folderId;
}

function handleDrop(targetId: string | null, targetType: "folder" | "root") {
  if (!draggedNodeId.value) return;

  const actualTargetId = targetType === "root" ? null : targetId;

  if (draggedNodeType.value === "folder") {
    moveFolderTo(draggedNodeId.value, actualTargetId);
  } else {
    moveModToFolder(draggedNodeId.value, actualTargetId);
  }

  handleDragEnd();
  rebuildTree();
}

function handleRootDrop(e: DragEvent) {
  e.preventDefault();
  handleDrop(null, "root");
}

function handleRootDragOver(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
}

function handleRootDragEnter(e: DragEvent) {
  e.preventDefault();
  dropTargetId.value = null; // null means root
}

// Dialog openers
function openCreateSubfolder(parentId: string) {
  editingFolderId.value = parentId;
  newFolderName.value = "";
  showCreateFolderDialog.value = true;
}

// Bulk selection functions
function toggleModSelection(modId: string) {
  if (selectedModIds.value.has(modId)) {
    selectedModIds.value.delete(modId);
  } else {
    selectedModIds.value.add(modId);
  }
  selectedModIds.value = new Set(selectedModIds.value);
}

function selectAllMods() {
  mods.value.forEach(mod => selectedModIds.value.add(mod.id));
  selectedModIds.value = new Set(selectedModIds.value);
}

function clearSelection() {
  selectedModIds.value.clear();
  selectedModIds.value = new Set(selectedModIds.value);
  isSelectionMode.value = false;
}

function toggleSelectionMode() {
  isSelectionMode.value = !isSelectionMode.value;
  if (!isSelectionMode.value) {
    clearSelection();
  }
}

// Context menu functions
function openContextMenu(event: MouseEvent, modId?: string, folderId?: string) {
  event.preventDefault();
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    modId,
    folderId,
  };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function openMoveDialog() {
  moveTargetFolderId.value = null;
  showMoveDialog.value = true;
  closeContextMenu();
}

function handleBulkMove() {
  if (selectedModIds.value.size === 0) return;

  const modIdsArray = Array.from(selectedModIds.value);
  moveModsToFolder(modIdsArray, moveTargetFolderId.value);

  clearSelection();
  showMoveDialog.value = false;
  rebuildTree();
}

function handleContextMenuMove(targetFolderId: string | null) {
  if (contextMenu.value?.modId) {
    // Single mod from context menu
    moveModToFolder(contextMenu.value.modId, targetFolderId);
  } else if (selectedModIds.value.size > 0) {
    // Bulk move
    const modIdsArray = Array.from(selectedModIds.value);
    moveModsToFolder(modIdsArray, targetFolderId);
    clearSelection();
  }

  closeContextMenu();
  rebuildTree();
}

// Close context menu when clicking outside
function handleGlobalClick(event: MouseEvent) {
  if (contextMenu.value) {
    closeContextMenu();
  }
}

onMounted(() => {
  loadMods();
  document.addEventListener('click', handleGlobalClick);
});

import { onUnmounted } from 'vue';
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});

function openRenameDialog(nodeId: string, type: "folder" | "mod") {
  if (type === "folder") {
    const folder = getFolderById(nodeId);
    if (folder) {
      editingFolderId.value = nodeId;
      newFolderName.value = folder.name;
      newFolderColor.value = folder.color || "#6366f1";
      showRenameFolderDialog.value = true;
    }
  }
}

function openDeleteDialog(nodeId: string, type: "folder" | "mod") {
  deletingNodeId.value = nodeId;
  deletingNodeType.value = type;
  showDeleteDialog.value = true;
}

// Navigation
function navigateToFolder(folderId: string | null) {
  currentFolderId.value = folderId;
  viewMode.value = "grid";
}

function navigateUp() {
  if (currentFolder.value?.parentId) {
    currentFolderId.value = currentFolder.value.parentId;
  } else {
    currentFolderId.value = null;
  }
}

watch(folders, () => {
  rebuildTree();
}, { deep: true });

// Color options
const colorOptions = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
];
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Compact Header -->
    <div class="shrink-0 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#0a0a0a]">
      <!-- Mobile: Stack vertically, Desktop: Row -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
        <!-- Left: Title & Stats -->
        <div class="flex items-center gap-3 sm:gap-4">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
              <FolderTree class="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 class="text-base sm:text-lg font-semibold tracking-tight">Organize</h1>
              <p class="text-[10px] sm:text-xs text-muted-foreground">
                {{ folders.length }} folders • {{ unorganizedMods.length }} loose
              </p>
            </div>
          </div>

          <!-- Separator - hidden on mobile -->
          <div class="hidden sm:block h-8 w-px bg-white/10" />

          <!-- View Mode Toggle -->
          <div class="flex items-center bg-white/5 rounded-md p-0.5">
            <button class="p-1.5 rounded transition-colors text-muted-foreground"
              :class="viewMode === 'tree' ? 'bg-white/10 text-foreground' : 'hover:text-foreground'"
              @click="viewMode = 'tree'" title="Tree View">
              <FolderTree class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button class="p-1.5 rounded transition-colors text-muted-foreground"
              :class="viewMode === 'grid' ? 'bg-white/10 text-foreground' : 'hover:text-foreground'"
              @click="viewMode = 'grid'" title="Grid View">
              <LayoutGrid class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        <!-- Right: Actions -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <!-- Search -->
          <div class="relative flex-1 sm:flex-none sm:w-48">
            <Search class="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input v-model="searchQuery" placeholder="Search..."
              class="pl-7 sm:pl-8 h-7 sm:h-8 text-xs bg-white/5 border-white/10" />
          </div>

          <!-- Selection Mode Toggle -->
          <Button variant="ghost" size="sm"
            class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-muted-foreground hover:text-foreground"
            :class="isSelectionMode ? 'bg-primary/20 text-primary' : ''" @click="toggleSelectionMode">
            <Check class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden sm:inline text-xs">{{ isSelectionMode ? 'Exit' : 'Select' }}</span>
          </Button>

          <!-- Bulk actions when selection mode is active -->
          <template v-if="isSelectionMode && selectedModIds.size > 0">
            <Button variant="secondary" size="sm" class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs"
              @click="openMoveDialog">
              <Move class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden xs:inline">Move</span> ({{ selectedModIds.size }})
            </Button>
            <Button variant="ghost" size="sm" class="h-7 sm:h-8 px-2" @click="clearSelection">
              <X class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </template>

          <Button variant="ghost" size="sm" class="h-7 sm:h-8 px-2 text-muted-foreground hover:text-foreground"
            @click="loadMods">
            <RefreshCw class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>

          <Button size="sm" class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs"
            @click="editingFolderId = null; showCreateFolderDialog = true">
            <FolderPlus class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span class="hidden xs:inline">New Folder</span>
          </Button>
        </div>
      </div>

      <!-- Breadcrumbs (grid view) -->
      <div v-if="viewMode === 'grid'" class="flex items-center gap-2 text-xs sm:text-sm mt-3">
        <button class="flex items-center gap-1 hover:text-primary transition-colors" @click="navigateToFolder(null)">
          <Home class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span class="hidden xs:inline">Root</span>
        </button>
        <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
          <ChevronRight class="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
          <button class="hover:text-primary transition-colors truncate max-w-[100px] sm:max-w-none"
            :class="index === breadcrumbs.length - 1 ? 'font-medium' : ''" @click="navigateToFolder(folder.id)">
            {{ folder.name }}
          </button>
        </template>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden flex bg-[#0a0a0a]">
      <!-- Tree View -->
      <div v-if="viewMode === 'tree'" class="flex-1 overflow-auto p-3 sm:p-4" @drop="handleRootDrop"
        @dragover="handleRootDragOver">
        <div v-if="isLoading" class="flex items-center justify-center h-full">
          <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>

        <div v-else-if="filteredTree.length === 0" class="text-center py-12 text-muted-foreground">
          <FolderTree class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No folders yet. Create your first folder to start organizing!</p>
        </div>

        <div v-else class="space-y-0.5">
          <!-- Root drop zone indicator -->
          <div v-if="draggedNodeId"
            class="h-8 border-2 border-dashed border-muted-foreground/30 rounded-md flex items-center justify-center text-xs text-muted-foreground mb-2 transition-colors"
            :class="dropTargetId === null ? 'border-primary bg-primary/10' : ''" @dragenter="handleRootDragEnter"
            @dragover="handleRootDragOver" @drop="handleRootDrop">
            Drop here for root level
          </div>

          <TreeNodeItem v-for="node in filteredTree" :key="node.id" :node="node" :depth="0"
            :selected-node-id="selectedNodeId" :dragged-node-id="draggedNodeId" :drop-target-id="dropTargetId"
            @select="handleNodeSelect" @toggle="handleToggle" @drag-start="handleDragStart" @drag-end="handleDragEnd"
            @drag-enter-folder="handleDragEnterFolder" @drop="handleDrop" @rename="openRenameDialog"
            @delete="openDeleteDialog" @create-subfolder="openCreateSubfolder" />

          <!-- Unorganized Mods Section -->
          <div v-if="unorganizedMods.length > 0" class="mt-6 pt-4 border-t border-border">
            <h3 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Package class="w-4 h-4" />
              Unorganized Mods ({{ unorganizedMods.length }})
            </h3>
            <div class="space-y-1">
              <div v-for="mod in unorganizedMods" :key="mod.id"
                class="flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer group"
                :class="selectedModIds.has(mod.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted'" draggable="true"
                @dragstart="handleDragStart(mod.id, 'mod')" @dragend="handleDragEnd"
                @click="isSelectionMode ? toggleModSelection(mod.id) : null"
                @contextmenu="openContextMenu($event, mod.id)">
                <!-- Selection checkbox -->
                <div v-if="isSelectionMode"
                  class="w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0"
                  :class="selectedModIds.has(mod.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground'">
                  <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
                </div>
                <Package class="w-4 h-4 text-muted-foreground shrink-0" />
                <span class="flex-1 truncate text-sm">{{ mod.name }}</span>
                <span class="text-xs text-muted-foreground">{{ mod.version }}</span>
                <button class="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted" title="Move to folder"
                  @click.stop="openContextMenu($event, mod.id)">
                  <FolderInput class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="flex-1 overflow-auto p-3 sm:p-4">
        <!-- Back button -->
        <Button v-if="currentFolderId" variant="ghost" size="sm" class="mb-3 sm:mb-4 gap-1.5 sm:gap-2"
          @click="navigateUp">
          <ChevronLeft class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Back
        </Button>

        <!-- Subfolders -->
        <div v-if="currentFolderSubfolders.length > 0" class="mb-4 sm:mb-6">
          <h3 class="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Folders</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
            <button v-for="folder in currentFolderSubfolders" :key="folder.id"
              class="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
              @click="navigateToFolder(folder.id)">
              <Folder class="w-8 h-8 sm:w-10 sm:h-10" :style="{ color: folder.color }" />
              <span class="text-xs sm:text-sm font-medium truncate w-full text-center">{{ folder.name }}</span>
            </button>
          </div>
        </div>

        <!-- Mods in current folder -->
        <div v-if="currentFolderMods.length > 0">
          <h3 class="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">
            Mods {{ currentFolder ? `in ${currentFolder.name}` : '(Unorganized)' }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            <div v-for="mod in currentFolderMods" :key="mod.id"
              class="group relative bg-card border rounded-lg p-3 sm:p-4 transition-colors cursor-pointer" :class="[
                selectedModIds.has(mod.id) ? 'border-primary bg-primary/5' : 'hover:border-primary/50',
                isSelectionMode ? 'cursor-pointer' : ''
              ]" @click="isSelectionMode ? toggleModSelection(mod.id) : null"
              @contextmenu="openContextMenu($event, mod.id)">
              <!-- Selection checkbox -->
              <div v-if="isSelectionMode"
                class="absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center transition-colors"
                :class="selectedModIds.has(mod.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground'">
                <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
              </div>

              <div class="flex items-start gap-2 sm:gap-3" :class="isSelectionMode ? 'ml-6' : ''">
                <Package class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground shrink-0" />
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium truncate text-sm sm:text-base">{{ mod.name }}</h4>
                  <p class="text-sm text-muted-foreground">{{ mod.version }}</p>
                  <p class="text-xs text-muted-foreground mt-1">{{ mod.loader }}</p>
                </div>
              </div>
              <!-- Action buttons -->
              <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button class="p-1.5 rounded-md hover:bg-muted" title="Move to folder"
                  @click.stop="openContextMenu($event, mod.id)">
                  <FolderInput class="w-4 h-4" />
                </button>
                <button class="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground"
                  title="Remove from folder" @click.stop="moveModToFolder(mod.id, null); rebuildTree()">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="currentFolderSubfolders.length === 0 && currentFolderMods.length === 0"
          class="text-center py-12 text-muted-foreground">
          <Folder class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>This folder is empty</p>
          <p class="text-sm">Drag mods here from the tree view to organize them</p>
        </div>
      </div>
    </div>

    <!-- Create Folder Dialog -->
    <Dialog :open="showCreateFolderDialog" :title="editingFolderId ? 'Create Subfolder' : 'Create Folder'"
      :description="editingFolderId ? `Creating subfolder in: ${getFolderById(editingFolderId)?.name}` : 'Create a new folder to organize your mods'">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">Folder Name</label>
          <Input v-model="newFolderName" placeholder="Enter folder name..." class="mt-1"
            @keydown.enter="handleCreateFolder" />
        </div>

        <div>
          <label class="text-sm font-medium">Color</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button v-for="color in colorOptions" :key="color"
              class="w-6 h-6 rounded-full transition-transform hover:scale-110"
              :class="newFolderColor === color ? 'ring-2 ring-offset-2 ring-primary' : ''"
              :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="outline" @click="showCreateFolderDialog = false">Cancel</Button>
        <Button @click="handleCreateFolder" :disabled="!newFolderName.trim()">Create</Button>
      </template>
    </Dialog>

    <!-- Rename Folder Dialog -->
    <Dialog :open="showRenameFolderDialog" title="Rename Folder">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">Folder Name</label>
          <Input v-model="newFolderName" placeholder="Enter folder name..." class="mt-1"
            @keydown.enter="handleRenameFolder" />
        </div>

        <div>
          <label class="text-sm font-medium">Color</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button v-for="color in colorOptions" :key="color"
              class="w-6 h-6 rounded-full transition-transform hover:scale-110"
              :class="newFolderColor === color ? 'ring-2 ring-offset-2 ring-primary' : ''"
              :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="outline" @click="showRenameFolderDialog = false">Cancel</Button>
        <Button @click="handleRenameFolder" :disabled="!newFolderName.trim()">Save</Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="showDeleteDialog" :title="deletingNodeType === 'folder' ? 'Delete Folder' : 'Remove from Folder'"
      :description="deletingNodeType === 'folder'
        ? 'The folder will be deleted and its contents moved to the parent folder.'
        : 'The mod will be removed from this folder but not deleted from the library.'">
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="handleDeleteNode">
          {{ deletingNodeType === 'folder' ? 'Delete' : 'Remove' }}
        </Button>
      </template>
    </Dialog>

    <!-- Move Dialog -->
    <Dialog :open="showMoveDialog" title="Move Mods to Folder"
      :description="`Moving ${selectedModIds.size} mod(s) to a folder`" @close="showMoveDialog = false">
      <div class="space-y-2 max-h-60 overflow-auto">
        <button class="w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors"
          :class="moveTargetFolderId === null ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'"
          @click="moveTargetFolderId = null">
          <Home class="w-4 h-4" />
          <span>Root (No Folder)</span>
        </button>
        <button v-for="folder in folders" :key="folder.id"
          class="w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors"
          :class="moveTargetFolderId === folder.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'"
          @click="moveTargetFolderId = folder.id">
          <Folder class="w-4 h-4" :style="{ color: folder.color }" />
          <span>{{ folder.name }}</span>
        </button>
      </div>

      <template #footer>
        <Button variant="outline" @click="showMoveDialog = false">Cancel</Button>
        <Button @click="handleBulkMove">Move</Button>
      </template>
    </Dialog>

    <!-- Context Menu -->
    <div v-if="contextMenu" class="fixed z-50 min-w-48 bg-popover border rounded-md shadow-md py-1"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
      <div class="px-2 py-1.5 text-xs text-muted-foreground font-medium">Move to</div>
      <button class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        @click="handleContextMenuMove(null)">
        <Home class="w-4 h-4" />
        Root (No Folder)
      </button>
      <button v-for="folder in folders" :key="folder.id"
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        @click="handleContextMenuMove(folder.id)">
        <Folder class="w-4 h-4" :style="{ color: folder.color }" />
        {{ folder.name }}
      </button>
    </div>
  </div>
</template>
