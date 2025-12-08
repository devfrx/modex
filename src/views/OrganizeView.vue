<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from "vue";
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
  Plus,
  ArrowRight,
  CornerDownRight,
  Filter,
  Layers,
  Image,
  Sparkles,
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
const selectedContentType = ref<"all" | "mod" | "resourcepack" | "shader">("all");

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
const contextMenu = ref<{
  x: number;
  y: number;
  modId?: string;
  folderId?: string;
} | null>(null);
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
  return mods.value.filter((mod) => {
    const modFolderId = getModFolder(mod.id);
    return modFolderId === null;
  });
});

const currentFolderMods = computed(() => {
  if (viewMode.value === "tree") return [];

  let filtered = mods.value.filter((mod) => {
    const modFolderId = getModFolder(mod.id);
    return modFolderId === currentFolderId.value;
  });

  // Apply filters
  const query = searchQuery.value.toLowerCase();
  if (query) {
    filtered = filtered.filter(mod => 
      mod.name.toLowerCase().includes(query) || 
      mod.author?.toLowerCase().includes(query)
    );
  }

  if (selectedContentType.value !== 'all') {
    filtered = filtered.filter(mod => {
      const type = mod.content_type || 'mod';
      return type === selectedContentType.value;
    });
  }

  return filtered;
});

const currentFolderSubfolders = computed(() => {
  return folders.value.filter((f) => f.parentId === currentFolderId.value);
});

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

const filteredTree = computed(() => {
  const query = searchQuery.value.toLowerCase();
  const filterByType = selectedContentType.value !== "all";

  function filterNode(node: TreeNode): TreeNode | null {
    if (node.type === "mod") {
      const mod = node.data as Mod;
      
      // Content type filter
      if (filterByType) {
        const modType = mod.content_type || "mod";
        if (modType !== selectedContentType.value) return null;
      }
      
      // Search filter
      if (query && !(
        mod.name.toLowerCase().includes(query) ||
        mod.author?.toLowerCase().includes(query)
      )) {
        return null;
      }
      
      return node;
    }

    // For folders, check children
    const filteredChildren =
      node.children
        ?.map((child) => filterNode(child))
        .filter((n): n is TreeNode => n !== null) || [];

    const folder = node.data as ModFolder;
    
    // Show folder if it matches search OR has matching children
    const folderMatchesSearch = !query || folder.name.toLowerCase().includes(query);
    if (folderMatchesSearch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
        expanded: query || filterByType ? true : node.expanded,
      };
    }

    return null;
  }

  if (!query && !filterByType) return tree.value;

  return tree.value
    .map((node) => filterNode(node))
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
  mods.value.forEach((mod) => selectedModIds.value.add(mod.id));
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
  document.addEventListener("click", handleGlobalClick);
});

onUnmounted(() => {
  document.removeEventListener("click", handleGlobalClick);
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

watch(
  folders,
  () => {
    rebuildTree();
  },
  { deep: true }
);

// Color options
const colorOptions = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
];
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Compact Header -->
    <div class="shrink-0 px-4 py-3 border-b border-border bg-background">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <!-- Left: Title & Stats -->
        <div class="flex items-center gap-3">
          <div class="p-2 bg-indigo-500/10 rounded-lg">
            <FolderTree class="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 class="text-sm font-semibold tracking-tight text-foreground">
              Organize Library
            </h1>
            <p class="text-[10px] text-muted-foreground">
              {{ folders.length }} folders • {{ unorganizedMods.length }} loose
              mods
            </p>
          </div>
        </div>

        <div class="h-6 w-px bg-border hidden sm:block" />

        <!-- View Mode -->
        <div class="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border">
          <button class="p-1.5 rounded-md transition-all" :class="viewMode === 'tree'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
            " @click="viewMode = 'tree'" title="Tree View">
            <FolderTree class="w-4 h-4" />
          </button>
          <button class="p-1.5 rounded-md transition-all" :class="viewMode === 'grid'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
            " @click="viewMode = 'grid'" title="Grid View">
            <LayoutGrid class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 sm:flex-none" />

        <!-- Right: Actions -->
        <div class="flex items-center gap-2">
          <!-- Search -->
          <div class="relative flex-1 sm:w-56">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input v-model="searchQuery" placeholder="Search..."
              class="pl-8 h-8 text-xs bg-muted/50 border-border focus:ring-primary/50" />
          </div>

          <!-- Content Type Filter -->
          <div class="hidden sm:flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50 border border-border">
            <button
              class="px-1.5 py-1 text-[10px] font-medium rounded transition-all"
              :class="selectedContentType === 'all' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'"
              @click="selectedContentType = 'all'"
            >
              All
            </button>
            <button
              class="px-1.5 py-1 text-[10px] font-medium rounded transition-all flex items-center gap-1"
              :class="selectedContentType === 'mod' 
                ? 'bg-emerald-500/15 text-emerald-500' 
                : 'text-muted-foreground hover:text-foreground'"
              @click="selectedContentType = 'mod'"
              :title="`${contentTypeCounts.mod} mods`"
            >
              <Layers class="w-3 h-3" />
            </button>
            <button
              class="px-1.5 py-1 text-[10px] font-medium rounded transition-all flex items-center gap-1"
              :class="selectedContentType === 'resourcepack' 
                ? 'bg-blue-500/15 text-blue-500' 
                : 'text-muted-foreground hover:text-foreground'"
              @click="selectedContentType = 'resourcepack'"
              :title="`${contentTypeCounts.resourcepack} resource packs`"
            >
              <Image class="w-3 h-3" />
            </button>
            <button
              class="px-1.5 py-1 text-[10px] font-medium rounded transition-all flex items-center gap-1"
              :class="selectedContentType === 'shader' 
                ? 'bg-pink-500/15 text-pink-500' 
                : 'text-muted-foreground hover:text-foreground'"
              @click="selectedContentType = 'shader'"
              :title="`${contentTypeCounts.shader} shaders`"
            >
              <Sparkles class="w-3 h-3" />
            </button>
          </div>

          <!-- Selection -->
          <Button variant="ghost" size="sm"
            class="hidden sm:flex items-center gap-1.5 h-8 px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            :class="isSelectionMode
              ? 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
              : ''
              " @click="toggleSelectionMode">
            <Check class="w-3.5 h-3.5" />
            <span class="text-xs">{{
              isSelectionMode ? "Exit Selection" : "Select"
            }}</span>
          </Button>

          <!-- Bulk actions -->
          <template v-if="isSelectionMode && selectedModIds.size > 0">
            <Button variant="secondary" size="sm"
              class="h-8 px-3 text-xs gap-1.5 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
              @click="openMoveDialog">
              <Move class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Move</span> ({{
                selectedModIds.size
              }})
            </Button>
            <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              @click="clearSelection">
              <X class="w-4 h-4" />
            </Button>
          </template>

          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            @click="loadMods">
            <RefreshCw class="w-3.5 h-3.5" />
          </Button>

          <Button size="sm"
            class="h-8 px-3 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-lg shadow-primary/20"
            @click="
              editingFolderId = null;
            showCreateFolderDialog = true;
            ">
            <FolderPlus class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">New Folder</span>
          </Button>
        </div>
      </div>

      <!-- Breadcrumbs (Grid View) -->
      <div v-if="viewMode === 'grid'"
        class="flex items-center gap-1 text-xs mt-3 text-muted-foreground overflow-x-auto pb-1">
        <button class="flex items-center gap-1 hover:text-primary transition-colors px-1 py-0.5 rounded hover:bg-muted"
          @click="navigateToFolder(null)">
          <Home class="w-3.5 h-3.5" />
          <span>Library</span>
        </button>
        <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
          <ChevronRight class="w-3 h-3 text-muted-foreground" />
          <button class="hover:text-primary transition-colors px-1 py-0.5 rounded hover:bg-muted truncate max-w-[120px]"
            :class="index === breadcrumbs.length - 1
              ? 'text-foreground font-medium'
              : ''
              " @click="navigateToFolder(folder.id)">
            {{ folder.name }}
          </button>
        </template>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden flex relative">
      <!-- Tree View -->
      <div v-if="viewMode === 'tree'" class="flex-1 overflow-auto p-4" @drop="handleRootDrop"
        @dragover="handleRootDragOver">
        <div v-if="isLoading" class="flex items-center justify-center h-full text-muted-foreground">
          <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
          Loading...
        </div>

        <div v-else-if="filteredTree.length === 0 && unorganizedMods.length === 0"
          class="flex flex-col items-center justify-center h-full text-muted-foreground">
          <div class="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
            <Package class="w-8 h-8 opacity-20" />
          </div>
          <p class="font-medium text-muted-foreground">Your library is empty</p>
          <p class="text-xs mt-1">
            Add mods from CurseForge to start organizing.
          </p>
        </div>

        <div v-else class="space-y-6">
          <!-- Root drop zone -->
          <div v-if="draggedNodeId"
            class="h-10 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground transition-all"
            :class="dropTargetId === null
              ? 'border-primary/50 bg-primary/5 text-primary'
              : ''
              " @dragenter="handleRootDragEnter" @dragover="handleRootDragOver" @drop="handleRootDrop">
            <CornerDownRight class="w-3.5 h-3.5 mr-2" />
            Drop here to move to root
          </div>

          <!-- Tree -->
          <div class="space-y-1">
            <TreeNodeItem v-for="node in filteredTree" :key="node.id" :node="node" :depth="0"
              :selected-node-id="selectedNodeId" :dragged-node-id="draggedNodeId" :drop-target-id="dropTargetId"
              @select="handleNodeSelect" @toggle="handleToggle" @drag-start="handleDragStart" @drag-end="handleDragEnd"
              @drag-enter-folder="handleDragEnterFolder" @drop="handleDrop" @rename="openRenameDialog"
              @delete="openDeleteDialog" @create-subfolder="openCreateSubfolder" />
          </div>

          <!-- Unorganized Mods -->
          <div v-if="unorganizedMods.length > 0" class="pt-6 border-t border-border">
            <h3
              class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Package class="w-3.5 h-3.5" />
              Unorganized Mods ({{ unorganizedMods.length }})
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <div v-for="mod in unorganizedMods" :key="mod.id"
                class="group flex items-center gap-3 p-2.5 rounded-lg border border-transparent bg-card hover:bg-accent transition-all cursor-grab active:cursor-grabbing"
                :class="selectedModIds.has(mod.id)
                  ? 'ring-1 ring-primary/50 bg-primary/10'
                  : 'border-border'
                  " draggable="true" @dragstart="handleDragStart(mod.id, 'mod')" @dragend="handleDragEnd"
                @click="isSelectionMode ? toggleModSelection(mod.id) : null"
                @contextmenu="openContextMenu($event, mod.id)">
                <!-- Selection Checkbox -->
                <div v-if="isSelectionMode"
                  class="w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0" :class="selectedModIds.has(mod.id)
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input bg-background'
                    ">
                  <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
                </div>

                <div
                  class="w-8 h-8 rounded flex items-center justify-center transition-colors"
                  :class="mod.content_type === 'resourcepack' 
                    ? 'bg-blue-500/10 text-blue-500' 
                    : mod.content_type === 'shader' 
                      ? 'bg-pink-500/10 text-pink-500' 
                      : 'bg-emerald-500/10 text-emerald-500'"
                >
                  <Image v-if="mod.content_type === 'resourcepack'" class="w-4 h-4" />
                  <Sparkles v-else-if="mod.content_type === 'shader'" class="w-4 h-4" />
                  <Package v-else class="w-4 h-4" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm text-foreground truncate group-hover:text-foreground">
                    {{ mod.name }}
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate">
                    {{ mod.version }}
                  </div>
                </div>

                <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Actions" @click.stop="openContextMenu($event, mod.id)">
                    <MoreVertical class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="flex-1 overflow-auto p-4">
        <!-- Back Button -->
        <Button v-if="currentFolderId" variant="ghost" size="sm"
          class="mb-4 text-muted-foreground hover:text-foreground pl-0 gap-1" @click="navigateUp">
          <ChevronLeft class="w-4 h-4" />
          Back to {{ currentFolder?.parentId ? "Parent Folder" : "Library" }}
        </Button>

        <!-- Subfolders -->
        <div v-if="currentFolderSubfolders.length > 0" class="mb-8">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1">
            Folders
          </h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <button v-for="folder in currentFolderSubfolders" :key="folder.id"
              class="group flex flex-col items-center p-4 rounded-xl border border-border bg-card hover:bg-accent transition-all hover:-translate-y-0.5"
              @click="navigateToFolder(folder.id)">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-muted group-hover:bg-muted/80 transition-colors">
                <Folder class="w-6 h-6" :style="{ color: folder.color }" />
              </div>
              <span
                class="text-xs font-medium text-foreground group-hover:text-foreground truncate w-full text-center">{{
                  folder.name }}</span>
            </button>

            <button
              class="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
              @click="openCreateSubfolder(currentFolderId || '')">
              <Plus class="w-6 h-6 mb-2" />
              <span class="text-xs font-medium">New Folder</span>
            </button>
          </div>
        </div>

        <!-- Mods -->
        <div v-if="currentFolderMods.length > 0">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1">
            Mods in this folder
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div v-for="mod in currentFolderMods" :key="mod.id"
              class="group relative bg-card border border-border rounded-xl p-3 transition-all hover:bg-accent" :class="[
                selectedModIds.has(mod.id)
                  ? 'ring-1 ring-primary/50 bg-primary/5'
                  : '',
                isSelectionMode ? 'cursor-pointer' : '',
              ]" @click="isSelectionMode ? toggleModSelection(mod.id) : null"
              @contextmenu="openContextMenu($event, mod.id)">
              <!-- Selection Checkbox -->
              <div v-if="isSelectionMode"
                class="absolute top-3 left-3 z-10 w-5 h-5 rounded border flex items-center justify-center transition-colors shadow-sm"
                :class="selectedModIds.has(mod.id)
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-input bg-background'
                  ">
                <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
              </div>

              <div class="flex items-start gap-3" :class="isSelectionMode ? 'pl-8' : ''">
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                  :class="mod.content_type === 'resourcepack' 
                    ? 'bg-blue-500/10 text-blue-500' 
                    : mod.content_type === 'shader' 
                      ? 'bg-pink-500/10 text-pink-500' 
                      : 'bg-emerald-500/10 text-emerald-500'"
                >
                  <Image v-if="mod.content_type === 'resourcepack'" class="w-5 h-5" />
                  <Sparkles v-else-if="mod.content_type === 'shader'" class="w-5 h-5" />
                  <Package v-else class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-medium text-foreground group-hover:text-foreground truncate">
                    {{ mod.name }}
                  </h4>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{{ mod.version
                    }}</span>
                    <span class="text-[10px] text-muted-foreground">{{
                      mod.loader
                    }}</span>
                  </div>
                </div>
              </div>

              <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button class="p-1.5 rounded hover:bg-primary/10 hover:text-primary text-muted-foreground" title="Move"
                  @click.stop="openContextMenu($event, mod.id)">
                  <FolderInput class="w-3.5 h-3.5" />
                </button>
                <button class="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  title="Remove from folder" @click.stop="
                    moveModToFolder(mod.id, null);
                  rebuildTree();
                  ">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="
          currentFolderSubfolders.length === 0 &&
          currentFolderMods.length === 0
        " class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Folder class="w-12 h-12 mb-4 opacity-20" />
          <p class="font-medium text-muted-foreground">Folder is empty</p>
          <p class="text-xs mt-1">
            Drag mods here from the Tree view or use the Move action.
          </p>
        </div>
      </div>
    </div>

    <!-- Create Folder Dialog -->
    <Dialog :open="showCreateFolderDialog" :title="editingFolderId ? 'Create Subfolder' : 'Create Folder'" :description="editingFolderId
      ? `Creating subfolder in: ${getFolderById(editingFolderId)?.name}`
      : 'Create a new folder to organize your mods'
      ">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-muted-foreground">Folder Name</label>
          <Input v-model="newFolderName" placeholder="e.g. Magic Mods" class="mt-1.5 bg-background border-border"
            @keydown.enter="handleCreateFolder" />
        </div>

        <div>
          <label class="text-xs font-medium text-muted-foreground">Color Tag</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button v-for="color in colorOptions" :key="color"
              class="w-6 h-6 rounded-full transition-all hover:scale-110 ring-offset-2 ring-offset-background" :class="newFolderColor === color ? 'ring-2 ring-foreground/50 scale-110' : ''
                " :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showCreateFolderDialog = false">Cancel</Button>
        <Button @click="handleCreateFolder" :disabled="!newFolderName.trim()"
          class="bg-primary hover:bg-primary/90 text-primary-foreground">Create</Button>
      </template>
    </Dialog>

    <!-- Rename Folder Dialog -->
    <Dialog :open="showRenameFolderDialog" title="Rename Folder">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-muted-foreground">Folder Name</label>
          <Input v-model="newFolderName" placeholder="Enter folder name..." class="mt-1.5 bg-background border-border"
            @keydown.enter="handleRenameFolder" />
        </div>

        <div>
          <label class="text-xs font-medium text-muted-foreground">Color Tag</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button v-for="color in colorOptions" :key="color"
              class="w-6 h-6 rounded-full transition-all hover:scale-110 ring-offset-2 ring-offset-background" :class="newFolderColor === color ? 'ring-2 ring-foreground/50 scale-110' : ''
                " :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showRenameFolderDialog = false">Cancel</Button>
        <Button @click="handleRenameFolder" :disabled="!newFolderName.trim()"
          class="bg-primary hover:bg-primary/90 text-primary-foreground">Save Changes</Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="showDeleteDialog" :title="deletingNodeType === 'folder' ? 'Delete Folder' : 'Remove from Folder'
      " :description="deletingNodeType === 'folder'
        ? 'The folder will be deleted and its contents moved to the parent folder.'
        : 'The mod will be removed from this folder but not deleted from your library.'
        ">
      <template #footer>
        <Button variant="ghost" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="handleDeleteNode">
          {{ deletingNodeType === "folder" ? "Delete Folder" : "Remove Mod" }}
        </Button>
      </template>
    </Dialog>

    <!-- Move Dialog -->
    <Dialog :open="showMoveDialog" title="Move to Folder" :description="`Moving ${selectedModIds.size} mod(s)`"
      @close="showMoveDialog = false">
      <div class="space-y-1 max-h-[300px] overflow-auto p-1">
        <button
          class="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors border border-transparent"
          :class="moveTargetFolderId === null
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            " @click="moveTargetFolderId = null">
          <div class="p-1.5 rounded bg-muted">
            <Home class="w-4 h-4" />
          </div>
          <span class="text-sm font-medium">Library Root</span>
          <Check v-if="moveTargetFolderId === null" class="w-4 h-4 ml-auto text-primary" />
        </button>

        <div v-for="folder in folders" :key="folder.id">
          <button
            class="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors border border-transparent"
            :class="moveTargetFolderId === folder.id
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              " @click="moveTargetFolderId = folder.id">
            <Folder class="w-4 h-4" :style="{ color: folder.color }" />
            <span class="text-sm font-medium">{{ folder.name }}</span>
            <Check v-if="moveTargetFolderId === folder.id" class="w-4 h-4 ml-auto text-primary" />
          </button>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showMoveDialog = false">Cancel</Button>
        <Button @click="handleBulkMove" class="bg-primary hover:bg-primary/90 text-primary-foreground">Move
          Mods</Button>
      </template>
    </Dialog>

    <!-- Context Menu -->
    <div v-if="contextMenu"
      class="fixed z-50 min-w-56 bg-popover border border-border rounded-lg shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
      <div
        class="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-2">
        <Filter class="w-3 h-3" />
        Move to...
      </div>

      <div class="max-h-64 overflow-y-auto custom-scrollbar">
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
          @click="handleContextMenuMove(null)">
          <Home class="w-4 h-4 opacity-70" />
          Library Root
        </button>

        <div class="h-px bg-border my-1 mx-2" />

        <button v-for="folder in folders" :key="folder.id"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
          @click="handleContextMenuMove(folder.id)">
          <Folder class="w-4 h-4" :style="{ color: folder.color }" />
          {{ folder.name }}
        </button>
      </div>
    </div>
  </div>
</template>
