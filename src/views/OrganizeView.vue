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
  FolderOpen,
  FileStack,
  ArrowUpRight,
  GripVertical,
  Boxes,
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

// Stats computed
const totalMods = computed(() => mods.value.length);
const organizedMods = computed(() => mods.value.filter(m => getModFolder(m.id) !== null).length);
const organizationPercentage = computed(() => {
  if (totalMods.value === 0) return 0;
  return Math.round((organizedMods.value / totalMods.value) * 100);
});

// Dialog descriptions
const createFolderDescription = computed(() => {
  if (editingFolderId.value) {
    const folder = getFolderById(editingFolderId.value);
    return 'Creating a subfolder inside "' + (folder?.name || '') + '"';
  }
  return 'Organize your mods by creating custom folders';
});

const moveDialogDescription = computed(() => {
  return 'Select a destination for ' + selectedModIds.value.size + ' selected mod(s)';
});
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Modern Header -->
    <div class="shrink-0 border-b border-border bg-gradient-to-b from-card to-background">
      <!-- Top Row: Title, Stats Cards, Actions -->
      <div class="px-5 py-4">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <!-- Left: Title & Description -->
          <div class="flex items-center gap-4">
            <div class="relative">
              <div
                class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <FolderTree class="w-6 h-6 text-white" />
              </div>
              <div
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                <Boxes class="w-3 h-3 text-muted-foreground" />
              </div>
            </div>
            <div>
              <h1 class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                Organize Library
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">
                  {{ viewMode === 'tree' ? 'Tree' : 'Grid' }} View
                </span>
              </h1>
              <p class="text-xs text-muted-foreground mt-0.5">
                Structure your mods with folders for easy management
              </p>
            </div>
          </div>

          <!-- Center: Quick Stats Cards -->
          <div class="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0">
            <!-- Folders Card -->
            <div
              class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-card border border-border flex-shrink-0">
              <div
                class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Folder class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-amber-500" />
              </div>
              <div>
                <div class="text-base sm:text-lg font-semibold text-foreground leading-none">{{ folders.length }}</div>
                <div class="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">Folders</div>
              </div>
            </div>

            <!-- Organized Card -->
            <div
              class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-card border border-border flex-shrink-0">
              <div
                class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <FileStack class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-emerald-500" />
              </div>
              <div>
                <div
                  class="text-base sm:text-lg font-semibold text-foreground leading-none flex items-center gap-1 sm:gap-1.5">
                  {{ organizedMods }}
                  <span class="text-[10px] sm:text-xs font-normal text-muted-foreground">/ {{ totalMods }}</span>
                </div>
                <div class="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">Organized</div>
              </div>
            </div>

            <!-- Progress Ring -->
            <div class="hidden md:flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-border">
              <div class="relative w-9 h-9">
                <svg class="w-9 h-9 transform -rotate-90">
                  <circle cx="18" cy="18" r="14" stroke="currentColor" stroke-width="3" fill="none"
                    class="text-muted/30" />
                  <circle cx="18" cy="18" r="14" stroke="currentColor" stroke-width="3" fill="none"
                    class="text-indigo-500 transition-all duration-500"
                    :stroke-dasharray="`${organizationPercentage * 0.88} 88`" />
                </svg>
                <span class="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
                  {{ organizationPercentage }}%
                </span>
              </div>
              <div>
                <div class="text-[10px] font-medium text-foreground">Progress</div>
                <div class="text-[10px] text-muted-foreground">{{ unorganizedMods.length }} loose</div>
              </div>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-2">
            <Button size="sm"
              class="h-9 px-4 gap-2 text-xs bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-lg shadow-indigo-500/25"
              @click="editingFolderId = null; showCreateFolderDialog = true;">
              <FolderPlus class="w-4 h-4" />
              <span>New Folder</span>
            </Button>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Search, Filters, View Toggle -->
      <div class="px-5 py-3 border-t border-border/50 bg-muted/20">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <!-- Search -->
          <div class="relative flex-1 max-w-md">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input v-model="searchQuery" placeholder="Search mods and folders..."
              class="pl-10 h-9 text-sm bg-background border-border focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50" />
            <kbd v-if="!searchQuery"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-mono">
              /
            </kbd>
          </div>

          <!-- Content Type Filter Pills -->
          <div class="flex items-center gap-1 p-1 rounded-lg bg-muted/30">
            <button class="px-3 py-1.5 text-xs font-medium rounded-md transition-all" :class="selectedContentType === 'all'
              ? 'bg-background ring-1 ring-border/50 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="selectedContentType = 'all'">
              All
            </button>
            <button class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
              :class="selectedContentType === 'mod'
                ? 'bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="selectedContentType = 'mod'"
              :title="`${contentTypeCounts.mod} mods`">
              <Layers class="w-3.5 h-3.5" />
              <span class="hidden md:inline">Mods</span>
              <span class="text-[10px] opacity-70">{{ contentTypeCounts.mod }}</span>
            </button>
            <button class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
              :class="selectedContentType === 'resourcepack'
                ? 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="selectedContentType = 'resourcepack'"
              :title="`${contentTypeCounts.resourcepack} resource packs`">
              <Image class="w-3.5 h-3.5" />
              <span class="hidden md:inline">Packs</span>
              <span class="text-[10px] opacity-70">{{ contentTypeCounts.resourcepack }}</span>
            </button>
            <button class="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5"
              :class="selectedContentType === 'shader'
                ? 'bg-pink-500/15 text-pink-500 ring-1 ring-pink-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="selectedContentType = 'shader'"
              :title="`${contentTypeCounts.shader} shaders`">
              <Sparkles class="w-3.5 h-3.5" />
              <span class="hidden md:inline">Shaders</span>
              <span class="text-[10px] opacity-70">{{ contentTypeCounts.shader }}</span>
            </button>
          </div>

          <div class="flex-1" />

          <!-- Selection Mode -->
          <Button variant="ghost" size="sm" class="h-9 px-3 text-muted-foreground hover:text-foreground"
            :class="isSelectionMode ? 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 hover:text-indigo-500' : ''"
            @click="toggleSelectionMode">
            <Check class="w-4 h-4 mr-1.5" />
            {{ isSelectionMode ? `${selectedModIds.size} selected` : 'Select' }}
          </Button>

          <!-- Bulk Actions -->
          <template v-if="isSelectionMode && selectedModIds.size > 0">
            <Button variant="secondary" size="sm"
              class="h-9 px-3 text-xs gap-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30"
              @click="openMoveDialog">
              <Move class="w-3.5 h-3.5" />
              Move
            </Button>
            <Button variant="ghost" size="sm" class="h-9 w-9 p-0" @click="clearSelection">
              <X class="w-4 h-4" />
            </Button>
          </template>

          <!-- Refresh -->
          <Button variant="ghost" size="sm" class="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            @click="loadMods">
            <RefreshCw class="w-4 h-4" />
          </Button>

          <!-- View Toggle -->
          <div class="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
            <button class="p-2 rounded-md transition-all"
              :class="viewMode === 'tree' ? 'bg-background text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
              @click="viewMode = 'tree'" title="Tree View">
              <FolderTree class="w-4 h-4" />
            </button>
            <button class="p-2 rounded-md transition-all"
              :class="viewMode === 'grid' ? 'bg-background text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
              @click="viewMode = 'grid'" title="Grid View">
              <LayoutGrid class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Breadcrumbs (Grid View) -->
      <div v-if="viewMode === 'grid'" class="px-5 py-2.5 border-t border-border/50 bg-muted/10">
        <div class="flex items-center gap-1.5 text-sm overflow-x-auto">
          <button
            class="flex items-center gap-1.5 hover:text-indigo-500 transition-colors px-2 py-1 rounded-md hover:bg-indigo-500/10"
            :class="!currentFolderId ? 'text-foreground font-medium' : 'text-muted-foreground'"
            @click="navigateToFolder(null)">
            <Home class="w-4 h-4" />
            <span>Library</span>
          </button>
          <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
            <ChevronRight class="w-4 h-4 text-muted-foreground/50" />
            <button
              class="hover:text-indigo-500 transition-colors px-2 py-1 rounded-md hover:bg-indigo-500/10 truncate max-w-[150px] flex items-center gap-1.5"
              :class="index === breadcrumbs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'"
              @click="navigateToFolder(folder.id)">
              <Folder class="w-3.5 h-3.5 shrink-0" :style="{ color: folder.color }" />
              {{ folder.name }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden flex relative">
      <!-- Tree View -->
      <div v-if="viewMode === 'tree'" class="flex-1 overflow-auto p-5" @drop="handleRootDrop"
        @dragover="handleRootDragOver">

        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center h-full">
          <div class="flex flex-col items-center gap-4">
            <div class="relative">
              <div
                class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                <div class="animate-spin w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            </div>
            <div class="text-sm text-muted-foreground">Loading your library...</div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredTree.length === 0 && unorganizedMods.length === 0"
          class="flex flex-col items-center justify-center h-full">
          <div class="max-w-md text-center">
            <div class="relative mx-auto w-24 h-24 mb-6">
              <div
                class="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rotate-6" />
              <div class="absolute inset-0 rounded-3xl bg-card border border-border flex items-center justify-center">
                <Package class="w-10 h-10 text-muted-foreground/30" />
              </div>
            </div>
            <h3 class="text-lg font-semibold text-foreground mb-2">Your library is empty</h3>
            <p class="text-sm text-muted-foreground mb-6">
              Start by adding mods from CurseForge, then organize them into folders for easy management.
            </p>
            <div class="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" class="gap-2">
                <ArrowUpRight class="w-4 h-4" />
                Browse CurseForge
              </Button>
              <Button size="sm" class="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0"
                @click="editingFolderId = null; showCreateFolderDialog = true;">
                <FolderPlus class="w-4 h-4" />
                Create Folder
              </Button>
            </div>
          </div>
        </div>

        <!-- Tree Content -->
        <div v-else class="space-y-6">
          <!-- Root Drop Zone (visible when dragging) -->
          <Transition enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2" enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div v-if="draggedNodeId"
              class="h-14 border-2 border-dashed rounded-xl flex items-center justify-center text-sm transition-all"
              :class="dropTargetId === null
                ? 'border-indigo-500/50 bg-indigo-500/5 text-indigo-500'
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                " @dragenter="handleRootDragEnter" @dragover="handleRootDragOver" @drop="handleRootDrop">
              <CornerDownRight class="w-4 h-4 mr-2" />
              Drop here to move to root level
            </div>
          </Transition>

          <!-- Folders Section -->
          <div v-if="filteredTree.length > 0">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <FolderOpen class="w-3.5 h-3.5" />
                Folders
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{{ folders.length }}</span>
              </h3>
            </div>
            <div class="space-y-1 bg-card/50 rounded-xl border border-border p-2">
              <TreeNodeItem v-for="node in filteredTree" :key="node.id" :node="node" :depth="0"
                :selected-node-id="selectedNodeId" :dragged-node-id="draggedNodeId" :drop-target-id="dropTargetId"
                @select="handleNodeSelect" @toggle="handleToggle" @drag-start="handleDragStart"
                @drag-end="handleDragEnd" @drag-enter-folder="handleDragEnterFolder" @drop="handleDrop"
                @rename="openRenameDialog" @delete="openDeleteDialog" @create-subfolder="openCreateSubfolder" />
            </div>
          </div>

          <!-- Unorganized Mods Section -->
          <div v-if="unorganizedMods.length > 0" class="pt-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Package class="w-3.5 h-3.5" />
                Unorganized
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                  {{ unorganizedMods.length }}
                </span>
              </h3>
              <p class="text-[10px] text-muted-foreground">
                Drag mods to folders or use the context menu
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              <div v-for="mod in unorganizedMods" :key="mod.id"
                class="group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing hover:shadow-md"
                :class="selectedModIds.has(mod.id)
                  ? 'ring-2 ring-indigo-500/50 bg-indigo-500/5 border-indigo-500/30'
                  : 'border-border bg-card hover:bg-accent hover:border-accent'" draggable="true"
                @dragstart="handleDragStart(mod.id, 'mod')" @dragend="handleDragEnd"
                @click="isSelectionMode ? toggleModSelection(mod.id) : null"
                @contextmenu="openContextMenu($event, mod.id)">
                <!-- Selection Checkbox -->
                <div v-if="isSelectionMode"
                  class="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0"
                  :class="selectedModIds.has(mod.id)
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-border bg-background hover:border-muted-foreground'">
                  <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
                </div>

                <!-- Drag Handle -->
                <div class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <GripVertical class="w-4 h-4 text-muted-foreground/50" />
                </div>

                <!-- Content Type Icon -->
                <div class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0" :class="mod.content_type === 'resourcepack'
                  ? 'bg-blue-500/10 text-blue-500'
                  : mod.content_type === 'shader'
                    ? 'bg-pink-500/10 text-pink-500'
                    : 'bg-emerald-500/10 text-emerald-500'">
                  <Image v-if="mod.content_type === 'resourcepack'" class="w-5 h-5" />
                  <Sparkles v-else-if="mod.content_type === 'shader'" class="w-5 h-5" />
                  <Package v-else class="w-5 h-5" />
                </div>

                <!-- Mod Info -->
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm text-foreground truncate group-hover:text-foreground">
                    {{ mod.name }}
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {{ mod.version }}
                    </span>
                    <span v-if="mod.loader" class="text-[10px] text-muted-foreground">
                      {{ mod.loader }}
                    </span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button
                    class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Move to folder" @click.stop="openContextMenu($event, mod.id)">
                    <FolderInput class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="flex-1 overflow-auto p-5">
        <!-- Back Button -->
        <Button v-if="currentFolderId" variant="ghost" size="sm"
          class="mb-5 text-muted-foreground hover:text-foreground gap-2 pl-2" @click="navigateUp">
          <ChevronLeft class="w-4 h-4" />
          Back to {{ currentFolder?.parentId ? "Parent Folder" : "Library" }}
        </Button>

        <!-- Subfolders Grid -->
        <div v-if="currentFolderSubfolders.length > 0" class="mb-8">
          <h3
            class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1 flex items-center gap-2">
            <Folder class="w-3.5 h-3.5" />
            Folders
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{{ currentFolderSubfolders.length }}</span>
          </h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <button v-for="folder in currentFolderSubfolders" :key="folder.id"
              class="group flex flex-col items-center p-5 rounded-2xl border border-border bg-card hover:bg-accent transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5"
              @click="navigateToFolder(folder.id)">
              <div
                class="w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-all group-hover:scale-110"
                :style="{ backgroundColor: folder.color + '15' }">
                <FolderOpen class="w-7 h-7" :style="{ color: folder.color }" />
              </div>
              <span class="text-sm font-medium text-foreground group-hover:text-foreground truncate w-full text-center">
                {{ folder.name }}
              </span>
              <span class="text-[10px] text-muted-foreground mt-1">
                {{mods.filter(m => getModFolder(m.id) === folder.id).length}} items
              </span>
            </button>

            <!-- Add Folder Button -->
            <button
              class="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all"
              @click="openCreateSubfolder(currentFolderId || '')">
              <div class="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                <Plus class="w-6 h-6" />
              </div>
              <span class="text-sm font-medium">New Folder</span>
            </button>
          </div>
        </div>

        <!-- Mods Grid -->
        <div v-if="currentFolderMods.length > 0">
          <h3
            class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-1 flex items-center gap-2">
            <Package class="w-3.5 h-3.5" />
            Mods in this folder
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{{ currentFolderMods.length }}</span>
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="mod in currentFolderMods" :key="mod.id"
              class="group relative bg-card border border-border rounded-2xl p-4 transition-all hover:bg-accent hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5"
              :class="[
                selectedModIds.has(mod.id) ? 'ring-2 ring-indigo-500/50 bg-indigo-500/5 border-indigo-500/30' : '',
                isSelectionMode ? 'cursor-pointer' : '',
              ]" @click="isSelectionMode ? toggleModSelection(mod.id) : null"
              @contextmenu="openContextMenu($event, mod.id)">
              <!-- Selection Checkbox -->
              <div v-if="isSelectionMode"
                class="absolute top-3 left-3 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm"
                :class="selectedModIds.has(mod.id)
                  ? 'bg-indigo-500 border-indigo-500 text-white'
                  : 'border-border bg-background'">
                <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3" />
              </div>

              <div class="flex items-start gap-4" :class="isSelectionMode ? 'pl-8' : ''">
                <!-- Mod Thumbnail/Logo or Icon fallback -->
                <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 transition-all group-hover:scale-105 ring-1 ring-border/50">
                  <img 
                    v-if="mod.logo_url || mod.thumbnail_url" 
                    :src="mod.logo_url || mod.thumbnail_url" 
                    :alt="mod.name"
                    class="w-full h-full object-cover"
                  />
                  <div 
                    v-else 
                    class="w-full h-full flex items-center justify-center"
                    :class="mod.content_type === 'resourcepack'
                      ? 'bg-blue-500/10 text-blue-500'
                      : mod.content_type === 'shader'
                        ? 'bg-pink-500/10 text-pink-500'
                        : 'bg-emerald-500/10 text-emerald-500'"
                  >
                    <Image v-if="mod.content_type === 'resourcepack'" class="w-6 h-6" />
                    <Sparkles v-else-if="mod.content_type === 'shader'" class="w-6 h-6" />
                    <Package v-else class="w-6 h-6" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-semibold text-foreground group-hover:text-foreground truncate">
                    {{ mod.name }}
                  </h4>
                  <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {{ mod.version }}
                    </span>
                    <span v-if="mod.loader"
                      class="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                      {{ mod.loader }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Hover Actions -->
              <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button
                  class="p-2 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-indigo-500/10 hover:text-indigo-500 text-muted-foreground transition-colors shadow-sm border border-border"
                  title="Move" @click.stop="openContextMenu($event, mod.id)">
                  <FolderInput class="w-4 h-4" />
                </button>
                <button
                  class="p-2 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shadow-sm border border-border"
                  title="Remove from folder" @click.stop="moveModToFolder(mod.id, null); rebuildTree();">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty Folder State -->
        <div v-if="currentFolderSubfolders.length === 0 && currentFolderMods.length === 0"
          class="flex flex-col items-center justify-center py-24">
          <div class="relative mx-auto w-20 h-20 mb-6">
            <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 rotate-6" />
            <div class="absolute inset-0 rounded-2xl bg-card border border-border flex items-center justify-center">
              <FolderOpen class="w-8 h-8 text-muted-foreground/30" />
            </div>
          </div>
          <h3 class="text-base font-semibold text-foreground mb-2">This folder is empty</h3>
          <p class="text-sm text-muted-foreground mb-6 text-center max-w-sm">
            Drag mods here from the Tree view, or use the Move action to organize your content.
          </p>
          <Button variant="outline" size="sm" class="gap-2" @click="viewMode = 'tree'">
            <FolderTree class="w-4 h-4" />
            Switch to Tree View
          </Button>
        </div>
      </div>
    </div>

    <!-- Create Folder Dialog -->
    <Dialog :open="showCreateFolderDialog" :title="editingFolderId ? 'Create Subfolder' : 'Create New Folder'"
      :description="createFolderDescription">
      <div class="space-y-5">
        <div>
          <label class="text-sm font-medium text-foreground">Folder Name</label>
          <Input v-model="newFolderName" placeholder="e.g. Magic Mods, Performance, QoL..."
            class="mt-2 h-11 bg-background border-border focus:ring-2 focus:ring-indigo-500/20"
            @keydown.enter="handleCreateFolder" />
        </div>

        <div>
          <label class="text-sm font-medium text-foreground">Color Tag</label>
          <p class="text-xs text-muted-foreground mt-1 mb-3">Choose a color to quickly identify this folder</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="color in colorOptions" :key="color"
              class="w-8 h-8 rounded-lg transition-all hover:scale-110 ring-offset-2 ring-offset-background border-2 border-transparent"
              :class="newFolderColor === color ? 'ring-2 ring-foreground/50 scale-110 border-white/20' : 'hover:border-white/10'"
              :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showCreateFolderDialog = false">Cancel</Button>
        <Button @click="handleCreateFolder" :disabled="!newFolderName.trim()"
          class="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0">
          <FolderPlus class="w-4 h-4 mr-2" />
          Create Folder
        </Button>
      </template>
    </Dialog>

    <!-- Rename Folder Dialog -->
    <Dialog :open="showRenameFolderDialog" title="Rename Folder" description="Update the folder name and color">
      <div class="space-y-5">
        <div>
          <label class="text-sm font-medium text-foreground">Folder Name</label>
          <Input v-model="newFolderName" placeholder="Enter folder name..."
            class="mt-2 h-11 bg-background border-border focus:ring-2 focus:ring-indigo-500/20"
            @keydown.enter="handleRenameFolder" />
        </div>

        <div>
          <label class="text-sm font-medium text-foreground">Color Tag</label>
          <div class="flex flex-wrap gap-2 mt-3">
            <button v-for="color in colorOptions" :key="color"
              class="w-8 h-8 rounded-lg transition-all hover:scale-110 ring-offset-2 ring-offset-background border-2 border-transparent"
              :class="newFolderColor === color ? 'ring-2 ring-foreground/50 scale-110 border-white/20' : 'hover:border-white/10'"
              :style="{ backgroundColor: color }" @click="newFolderColor = color" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showRenameFolderDialog = false">Cancel</Button>
        <Button @click="handleRenameFolder" :disabled="!newFolderName.trim()"
          class="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0">
          Save Changes
        </Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog :open="showDeleteDialog" :title="deletingNodeType === 'folder' ? 'Delete Folder' : 'Remove from Folder'
      " :description="deletingNodeType === 'folder'
        ? 'This folder will be deleted and all its contents will be moved to the parent folder.'
        : 'The mod will be removed from this folder but will remain in your library.'
        ">
      <div class="flex items-center gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <Trash2 class="w-5 h-5 text-amber-500" />
        </div>
        <p class="text-sm text-muted-foreground">
          {{ deletingNodeType === 'folder'
            ? 'Mods inside this folder won\'t be deleted from your library.'
            : 'You can always add this mod back to a folder later.'
          }}
        </p>
      </div>
      <template #footer>
        <Button variant="ghost" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="handleDeleteNode" class="gap-2">
          <Trash2 class="w-4 h-4" />
          {{ deletingNodeType === "folder" ? "Delete Folder" : "Remove Mod" }}
        </Button>
      </template>
    </Dialog>

    <!-- Move Dialog -->
    <Dialog :open="showMoveDialog" title="Move to Folder" :description="moveDialogDescription"
      @close="showMoveDialog = false">
      <div class="space-y-1 max-h-[350px] overflow-auto rounded-xl border border-border bg-muted/30 p-2">
        <!-- Library Root Option -->
        <button class="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all" :class="moveTargetFolderId === null
          ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30 text-indigo-500'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground'" @click="moveTargetFolderId = null">
          <div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <Home class="w-4 h-4" />
          </div>
          <div class="flex-1">
            <span class="text-sm font-medium">Library Root</span>
            <p class="text-[10px] text-muted-foreground">No folder - top level</p>
          </div>
          <Check v-if="moveTargetFolderId === null" class="w-5 h-5 text-indigo-500" />
        </button>

        <div class="h-px bg-border my-2" />

        <!-- Folder Options -->
        <div v-for="folder in folders" :key="folder.id">
          <button class="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all" :class="moveTargetFolderId === folder.id
            ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30 text-indigo-500'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground'" @click="moveTargetFolderId = folder.id">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center"
              :style="{ backgroundColor: folder.color + '15' }">
              <Folder class="w-4 h-4" :style="{ color: folder.color }" />
            </div>
            <div class="flex-1">
              <span class="text-sm font-medium">{{ folder.name }}</span>
              <p class="text-[10px] text-muted-foreground">
                {{mods.filter(m => getModFolder(m.id) === folder.id).length}} items
              </p>
            </div>
            <Check v-if="moveTargetFolderId === folder.id" class="w-5 h-5 text-indigo-500" />
          </button>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" @click="showMoveDialog = false">Cancel</Button>
        <Button @click="handleBulkMove"
          class="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 gap-2">
          <Move class="w-4 h-4" />
          Move {{ selectedModIds.size }} Mods
        </Button>
      </template>
    </Dialog>

    <!-- Context Menu -->
    <Transition enter-active-class="transition-all duration-150 ease-out" enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100" leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
      <div v-if="contextMenu"
        class="fixed z-50 min-w-60 bg-popover/95 backdrop-blur-lg border border-border rounded-xl shadow-2xl py-2 overflow-hidden"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <div
          class="px-3 py-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-2 border-b border-border mb-1 pb-2">
          <FolderInput class="w-3.5 h-3.5" />
          Move to Folder
        </div>

        <div class="max-h-72 overflow-y-auto px-1">
          <button
            class="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-indigo-500 hover:text-white rounded-lg transition-colors mx-auto"
            style="width: calc(100% - 8px)" @click="handleContextMenuMove(null)">
            <Home class="w-4 h-4 opacity-70" />
            Library Root
          </button>

          <div class="h-px bg-border my-1.5 mx-2" />

          <button v-for="folder in folders" :key="folder.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-indigo-500 hover:text-white rounded-lg transition-colors mx-auto"
            style="width: calc(100% - 8px)" @click="handleContextMenuMove(folder.id)">
            <Folder class="w-4 h-4" :style="{ color: folder.color }" />
            {{ folder.name }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
