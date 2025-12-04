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

onMounted(() => {
  loadMods();
});

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
    <!-- Header -->
    <div class="p-4 border-b bg-card/50 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <FolderTree class="w-6 h-6 text-primary" />
          <div>
            <h1 class="text-xl font-semibold">Organize Library</h1>
            <p class="text-sm text-muted-foreground">
              Drag & drop mods and folders to organize
            </p>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- View Mode Toggle -->
          <div class="flex items-center bg-muted rounded-md p-1">
            <button
              class="p-1.5 rounded transition-colors"
              :class="viewMode === 'tree' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
              @click="viewMode = 'tree'"
              title="Tree View"
            >
              <FolderTree class="w-4 h-4" />
            </button>
            <button
              class="p-1.5 rounded transition-colors"
              :class="viewMode === 'grid' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
              @click="viewMode = 'grid'"
              title="Grid View"
            >
              <LayoutGrid class="w-4 h-4" />
            </button>
          </div>
          
          <Button variant="outline" size="sm" @click="loadMods">
            <RefreshCw class="w-4 h-4" />
          </Button>
          
          <Button 
            size="sm" 
            class="gap-2"
            @click="editingFolderId = null; showCreateFolderDialog = true"
          >
            <FolderPlus class="w-4 h-4" />
            New Folder
          </Button>
        </div>
      </div>
      
      <!-- Search -->
      <div class="relative max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search mods and folders..."
          class="pl-10"
        />
      </div>
      
      <!-- Breadcrumbs (grid view) -->
      <div v-if="viewMode === 'grid'" class="flex items-center gap-2 text-sm">
        <button
          class="flex items-center gap-1 hover:text-primary transition-colors"
          @click="navigateToFolder(null)"
        >
          <Home class="w-4 h-4" />
          Root
        </button>
        <template v-for="(folder, index) in breadcrumbs" :key="folder.id">
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
          <button
            class="hover:text-primary transition-colors"
            :class="index === breadcrumbs.length - 1 ? 'font-medium' : ''"
            @click="navigateToFolder(folder.id)"
          >
            {{ folder.name }}
          </button>
        </template>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden flex">
      <!-- Tree View -->
      <div
        v-if="viewMode === 'tree'"
        class="flex-1 overflow-auto p-4"
        @drop="handleRootDrop"
        @dragover="handleRootDragOver"
      >
        <div v-if="isLoading" class="flex items-center justify-center h-full">
          <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
        
        <div v-else-if="filteredTree.length === 0" class="text-center py-12 text-muted-foreground">
          <FolderTree class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No folders yet. Create your first folder to start organizing!</p>
        </div>
        
        <div v-else class="space-y-0.5">
          <!-- Root drop zone indicator -->
          <div
            v-if="draggedNodeId"
            class="h-8 border-2 border-dashed border-muted-foreground/30 rounded-md flex items-center justify-center text-xs text-muted-foreground mb-2 transition-colors"
            :class="dropTargetId === null ? 'border-primary bg-primary/10' : ''"
            @dragenter="handleRootDragEnter"
            @dragover="handleRootDragOver"
            @drop="handleRootDrop"
          >
            Drop here for root level
          </div>
          
          <TreeNodeItem
            v-for="node in filteredTree"
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-node-id="selectedNodeId"
            :dragged-node-id="draggedNodeId"
            :drop-target-id="dropTargetId"
            @select="handleNodeSelect"
            @toggle="handleToggle"
            @drag-start="handleDragStart"
            @drag-end="handleDragEnd"
            @drag-enter-folder="handleDragEnterFolder"
            @drop="handleDrop"
            @rename="openRenameDialog"
            @delete="openDeleteDialog"
            @create-subfolder="openCreateSubfolder"
          />
        </div>
      </div>

      <!-- Grid View -->
      <div v-else class="flex-1 overflow-auto p-4">
        <!-- Back button -->
        <Button
          v-if="currentFolderId"
          variant="ghost"
          size="sm"
          class="mb-4 gap-2"
          @click="navigateUp"
        >
          <ChevronLeft class="w-4 h-4" />
          Back
        </Button>
        
        <!-- Subfolders -->
        <div v-if="currentFolderSubfolders.length > 0" class="mb-6">
          <h3 class="text-sm font-medium text-muted-foreground mb-3">Folders</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <button
              v-for="folder in currentFolderSubfolders"
              :key="folder.id"
              class="flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
              @click="navigateToFolder(folder.id)"
            >
              <Folder class="w-10 h-10" :style="{ color: folder.color }" />
              <span class="text-sm font-medium truncate w-full text-center">{{ folder.name }}</span>
            </button>
          </div>
        </div>
        
        <!-- Mods in current folder -->
        <div v-if="currentFolderMods.length > 0">
          <h3 class="text-sm font-medium text-muted-foreground mb-3">
            Mods {{ currentFolder ? `in ${currentFolder.name}` : '(Unorganized)' }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div
              v-for="mod in currentFolderMods"
              :key="mod.id"
              class="group relative bg-card border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div class="flex items-start gap-3">
                <Package class="w-10 h-10 text-muted-foreground shrink-0" />
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium truncate">{{ mod.name }}</h4>
                  <p class="text-sm text-muted-foreground">{{ mod.version }}</p>
                  <p class="text-xs text-muted-foreground mt-1">{{ mod.loader }}</p>
                </div>
              </div>
              <!-- Remove from folder button -->
              <button
                class="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all"
                title="Remove from folder"
                @click="moveModToFolder(mod.id, null); rebuildTree()"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        <div 
          v-if="currentFolderSubfolders.length === 0 && currentFolderMods.length === 0" 
          class="text-center py-12 text-muted-foreground"
        >
          <Folder class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>This folder is empty</p>
          <p class="text-sm">Drag mods here from the tree view to organize them</p>
        </div>
      </div>
    </div>

    <!-- Create Folder Dialog -->
    <Dialog 
      :open="showCreateFolderDialog" 
      :title="editingFolderId ? 'Create Subfolder' : 'Create Folder'"
      :description="editingFolderId ? `Creating subfolder in: ${getFolderById(editingFolderId)?.name}` : 'Create a new folder to organize your mods'"
    >
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">Folder Name</label>
          <Input
            v-model="newFolderName"
            placeholder="Enter folder name..."
            class="mt-1"
            @keydown.enter="handleCreateFolder"
          />
        </div>
        
        <div>
          <label class="text-sm font-medium">Color</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button
              v-for="color in colorOptions"
              :key="color"
              class="w-6 h-6 rounded-full transition-transform hover:scale-110"
              :class="newFolderColor === color ? 'ring-2 ring-offset-2 ring-primary' : ''"
              :style="{ backgroundColor: color }"
              @click="newFolderColor = color"
            />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button variant="outline" @click="showCreateFolderDialog = false">Cancel</Button>
        <Button @click="handleCreateFolder" :disabled="!newFolderName.trim()">Create</Button>
      </template>
    </Dialog>

    <!-- Rename Folder Dialog -->
    <Dialog 
      :open="showRenameFolderDialog" 
      title="Rename Folder"
    >
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">Folder Name</label>
          <Input
            v-model="newFolderName"
            placeholder="Enter folder name..."
            class="mt-1"
            @keydown.enter="handleRenameFolder"
          />
        </div>
        
        <div>
          <label class="text-sm font-medium">Color</label>
          <div class="flex flex-wrap gap-2 mt-2">
            <button
              v-for="color in colorOptions"
              :key="color"
              class="w-6 h-6 rounded-full transition-transform hover:scale-110"
              :class="newFolderColor === color ? 'ring-2 ring-offset-2 ring-primary' : ''"
              :style="{ backgroundColor: color }"
              @click="newFolderColor = color"
            />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button variant="outline" @click="showRenameFolderDialog = false">Cancel</Button>
        <Button @click="handleRenameFolder" :disabled="!newFolderName.trim()">Save</Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      :open="showDeleteDialog"
      :title="deletingNodeType === 'folder' ? 'Delete Folder' : 'Remove from Folder'"
      :description="deletingNodeType === 'folder' 
        ? 'The folder will be deleted and its contents moved to the parent folder.' 
        : 'The mod will be removed from this folder but not deleted from the library.'"
    >
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="handleDeleteNode">
          {{ deletingNodeType === 'folder' ? 'Delete' : 'Remove' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>
