<script setup lang="ts">
import { computed } from "vue";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Pencil,
  Trash2,
  FolderPlus,
  Package,
} from "lucide-vue-next";
import type { TreeNode, ModFolder, Mod } from "@/types/electron";

const props = defineProps<{
  node: TreeNode;
  depth?: number;
  selectedNodeId?: string | null;
  draggedNodeId?: string | null;
  dropTargetId?: string | null;
}>();

const emit = defineEmits<{
  (e: "select", nodeId: string, type: "folder" | "mod"): void;
  (e: "toggle", folderId: string): void;
  (e: "dragStart", nodeId: string, type: "folder" | "mod"): void;
  (e: "dragEnd"): void;
  (e: "dragEnterFolder", folderId: string): void;
  (e: "drop", targetId: string | null, type: "folder" | "root"): void;
  (e: "rename", nodeId: string, type: "folder" | "mod"): void;
  (e: "delete", nodeId: string, type: "folder" | "mod"): void;
  (e: "createSubfolder", parentId: string): void;
}>();

const depth = computed(() => props.depth ?? 0);
const isFolder = computed(() => props.node.type === "folder");
const isExpanded = computed(() => props.node.expanded ?? false);
const isSelected = computed(() => props.node.id === props.selectedNodeId);
const isDragging = computed(() => props.node.id === props.draggedNodeId);
const isDropTarget = computed(() => props.node.id === props.dropTargetId);

const folderData = computed(() => props.node.data as ModFolder | undefined);
const modData = computed(() => props.node.data as Mod | undefined);

// Drag & Drop handlers
function handleDragStart(e: DragEvent) {
  if (!e.dataTransfer) return;
  
  // Required for drag to work
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", props.node.id);
  
  // Set drag image (optional but helps with visual feedback)
  const target = e.target as HTMLElement;
  if (target) {
    e.dataTransfer.setDragImage(target, 0, 0);
  }
  
  // Emit after a small delay to allow the drag to start visually
  setTimeout(() => {
    emit("dragStart", props.node.id, props.node.type);
  }, 0);
}

function handleDragEnd(e: DragEvent) {
  emit("dragEnd");
}

function handleDragOver(e: DragEvent) {
  // Allow drag over for folders to accept drops
  if (isFolder.value) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }
}

function handleDragEnter(e: DragEvent) {
  // When entering a folder, signal it as drop target
  if (isFolder.value) {
    e.preventDefault();
    emit("dragEnterFolder", props.node.id);
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (isFolder.value) {
    emit("drop", props.node.id, "folder");
  }
}

function handleClick(e: MouseEvent) {
  e.stopPropagation();
  if (isFolder.value) {
    emit("toggle", props.node.id);
  }
  emit("select", props.node.id, props.node.type);
}

function handleToggleClick(e: MouseEvent) {
  e.stopPropagation();
  emit("toggle", props.node.id);
}

function handleCreateSubfolderClick(e: MouseEvent) {
  e.stopPropagation();
  emit("createSubfolder", props.node.id);
}

function handleRenameClick(e: MouseEvent) {
  e.stopPropagation();
  emit("rename", props.node.id, props.node.type);
}

function handleDeleteClick(e: MouseEvent) {
  e.stopPropagation();
  emit("delete", props.node.id, props.node.type);
}

// Child event handlers - properly forward events
function onChildSelect(nodeId: string, type: "folder" | "mod") {
  emit("select", nodeId, type);
}

function onChildToggle(folderId: string) {
  emit("toggle", folderId);
}

function onChildDragStart(nodeId: string, type: "folder" | "mod") {
  emit("dragStart", nodeId, type);
}

function onChildDragEnd() {
  emit("dragEnd");
}

function onChildDragEnterFolder(folderId: string) {
  emit("dragEnterFolder", folderId);
}

function onChildDrop(targetId: string | null, type: "folder" | "root") {
  emit("drop", targetId, type);
}

function onChildRename(nodeId: string, type: "folder" | "mod") {
  emit("rename", nodeId, type);
}

function onChildDelete(nodeId: string, type: "folder" | "mod") {
  emit("delete", nodeId, type);
}

function onChildCreateSubfolder(parentId: string) {
  emit("createSubfolder", parentId);
}
</script>

<template>
  <div>
    <!-- Node Row -->
    <div
      class="group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-grab transition-colors"
      :class="[
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
        isDragging ? 'opacity-50 cursor-grabbing' : '',
        isDropTarget ? 'ring-2 ring-primary ring-inset bg-primary/10' : '',
      ]"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      draggable="true"
      @dragstart="handleDragStart"
      @dragend="handleDragEnd"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @drop="handleDrop"
      @click="handleClick"
    >
      <!-- Drag Handle -->
      <GripVertical 
        class="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab shrink-0" 
      />

      <!-- Expand/Collapse Arrow (folders only) -->
      <button
        v-if="isFolder && node.children && node.children.length > 0"
        class="p-0.5 hover:bg-muted rounded shrink-0"
        draggable="false"
        @click="handleToggleClick"
        @mousedown.stop
      >
        <ChevronDown v-if="isExpanded" class="w-3 h-3" />
        <ChevronRight v-else class="w-3 h-3" />
      </button>
      <div v-else-if="isFolder" class="w-4" />

      <!-- Icon -->
      <div class="shrink-0">
        <template v-if="isFolder">
          <FolderOpen
            v-if="isExpanded"
            class="w-4 h-4"
            :style="{ color: folderData?.color || '#6366f1' }"
          />
          <Folder
            v-else
            class="w-4 h-4"
            :style="{ color: folderData?.color || '#6366f1' }"
          />
        </template>
        <Package v-else class="w-4 h-4 text-muted-foreground" />
      </div>

      <!-- Name -->
      <span class="flex-1 truncate text-sm">
        {{ node.name }}
      </span>

      <!-- Count badge for folders -->
      <span
        v-if="isFolder && node.children && node.children.length > 0"
        class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
      >
        {{ node.children.length }}
      </span>

      <!-- Mod info for mods -->
      <span
        v-if="!isFolder && modData"
        class="text-xs text-muted-foreground"
      >
        {{ modData.version }}
      </span>

      <!-- Actions (visible on hover) -->
      <div 
        class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5"
        draggable="false"
        @mousedown.stop
      >
        <button
          v-if="isFolder"
          class="p-1 hover:bg-muted rounded"
          title="Create subfolder"
          @click="handleCreateSubfolderClick"
        >
          <FolderPlus class="w-3 h-3" />
        </button>
        <button
          v-if="isFolder"
          class="p-1 hover:bg-muted rounded"
          title="Rename"
          @click="handleRenameClick"
        >
          <Pencil class="w-3 h-3" />
        </button>
        <button
          class="p-1 hover:bg-destructive hover:text-destructive-foreground rounded"
          :title="isFolder ? 'Delete folder' : 'Remove from folder'"
          @click="handleDeleteClick"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Children (recursive) -->
    <div v-if="isFolder && isExpanded && node.children && node.children.length > 0">
      <TreeNodeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-node-id="selectedNodeId"
        :dragged-node-id="draggedNodeId"
        :drop-target-id="dropTargetId"
        @select="onChildSelect"
        @toggle="onChildToggle"
        @drag-start="onChildDragStart"
        @drag-end="onChildDragEnd"
        @drag-enter-folder="onChildDragEnterFolder"
        @drop="onChildDrop"
        @rename="onChildRename"
        @delete="onChildDelete"
        @create-subfolder="onChildCreateSubfolder"
      />
    </div>
  </div>
</template>

<script lang="ts">
// Self-reference for recursion
export default {
  name: "TreeNodeItem",
};
</script>
