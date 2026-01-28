<script setup lang="ts">
/**
 * ConfigFolderItem - Recursive tree item for config browser
 */
import { computed } from "vue";
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import type { ConfigFolder, ConfigFile } from "@/types";

const props = defineProps<{
    folder: ConfigFolder;
    expandedFolders: Set<string>;
    selectedFile: ConfigFile | null;
    depth?: number;
}>();

const emit = defineEmits<{
    (e: "toggle", path: string): void;
    (e: "select", file: ConfigFile): void;
    (e: "openExternal", file: ConfigFile): void;
    (e: "openStructured", file: ConfigFile): void;
    (e: "delete", file: ConfigFile): void;
    (e: "openFolder", path: string): void;
}>();

const depth = computed(() => props.depth ?? 0);
const isExpanded = computed(() => props.expandedFolders.has(props.folder.path));

function getFileIcon(type: string): string {
    switch (type) {
        case "json":
        case "json5":
            return "FileJson";
        case "toml":
        case "cfg":
        case "yaml":
            return "FileCode";
        default:
            return "FileText";
    }
}

function getFileTypeClass(type: string): string {
    switch (type) {
        case "json":
        case "json5":
            return "file-json";
        case "toml":
            return "file-toml";
        case "yaml":
            return "file-yaml";
        case "cfg":
            return "file-cfg";
        default:
            return "file-default";
    }
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
    <div class="folder-item-wrapper">
        <!-- Folder Row -->
        <div class="folder-row" :style="{ paddingLeft: depth * 16 + 8 + 'px' }" @click="emit('toggle', folder.path)">
            <Icon :name="isExpanded ? 'ChevronDown' : 'ChevronRight'"
                class="w-4 h-4 text-muted-foreground transition-transform" />
            <Icon :name="isExpanded ? 'FolderOpen' : 'Folder'" class="w-4 h-4 text-amber-400" />
            <span class="folder-name">{{ folder.name }}</span>
            <span class="folder-count">{{ folder.fileCount }}</span>
            <Tooltip content="Open in Explorer" position="top">
                <button class="folder-action" @click.stop="emit('openFolder', folder.path)">
                    <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                </button>
            </Tooltip>
        </div>

        <!-- Children -->
        <div v-if="isExpanded" class="folder-children">
            <!-- Subfolders -->
            <ConfigFolderItem v-for="sub in folder.subfolders" :key="sub.path" :folder="sub"
                :expanded-folders="expandedFolders" :selected-file="selectedFile" :depth="depth + 1"
                @toggle="emit('toggle', $event)" @select="emit('select', $event)"
                @open-external="emit('openExternal', $event)" @open-structured="emit('openStructured', $event)"
                @delete="emit('delete', $event)" @open-folder="emit('openFolder', $event)" />

            <!-- Files -->
            <div v-for="file in folder.files" :key="file.path"
                :class="['file-row', selectedFile?.path === file.path && 'file-row-active']"
                :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }" @click="emit('select', file)">
                <Icon :name="getFileIcon(file.type)" :class="['w-4 h-4', getFileTypeClass(file.type)]" />
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatSize(file.size) }}</span>
                <div class="file-actions">
                    <Tooltip content="Edit as Key-Value" position="top">
                        <button class="file-action file-action-structured" @click.stop="emit('openStructured', file)">
                            <Icon name="Settings2" class="w-3.5 h-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Open External" position="top">
                        <button class="file-action" @click.stop="emit('openExternal', file)">
                            <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Delete" position="top">
                        <button class="file-action file-action-delete" @click.stop="emit('delete', file)">
                            <Icon name="Trash2" class="w-3.5 h-3.5" />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.folder-item-wrapper {
    @apply select-none;
}

.folder-row {
    @apply flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors;
}

.folder-row:hover {
    background-color: hsl(var(--muted) / 0.5);
}

.folder-name {
    @apply text-sm font-medium flex-1;
    color: hsl(var(--foreground));
}

.folder-count {
    @apply text-xs px-1.5 py-0.5 rounded;
    color: hsl(var(--muted-foreground));
    background-color: hsl(var(--muted) / 0.5);
}

.folder-action {
    @apply p-1 rounded-lg transition-all opacity-0;
    color: hsl(var(--muted-foreground));
}

.folder-row:hover .folder-action {
    @apply opacity-100;
}

.folder-action:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
}

.folder-children {
    @apply space-y-0.5;
}

/* File Row */
.file-row {
    @apply flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all;
}

.file-row:hover {
    background-color: hsl(var(--muted) / 0.5);
}

.file-row-active {
    background-color: hsl(var(--primary) / 0.1);
    border-left: 2px solid hsl(var(--primary));
}

.file-name {
    @apply text-sm flex-1 truncate;
    color: hsl(var(--muted-foreground));
}

.file-row:hover .file-name,
.file-row-active .file-name {
    color: hsl(var(--foreground));
}

.file-size {
    @apply text-xs;
    color: hsl(var(--muted-foreground) / 0.7);
}

.file-actions {
    @apply flex items-center gap-0.5 opacity-0 transition-opacity;
}

.file-row:hover .file-actions {
    @apply opacity-100;
}

.file-action {
    @apply p-1 rounded-lg transition-colors;
    color: hsl(var(--muted-foreground));
}

.file-action:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
}

.file-action-delete:hover {
    color: hsl(var(--destructive));
    background-color: hsl(var(--destructive) / 0.1);
}

.file-action-structured:hover {
    color: hsl(var(--primary));
    background-color: hsl(var(--primary) / 0.1);
}

/* File Type Colors */
.file-json {
    color: hsl(var(--warning));
}

.file-toml {
    color: hsl(var(--info));
}

.file-yaml {
    color: hsl(var(--success));
}

.file-cfg {
    color: hsl(var(--primary));
}

.file-default {
    color: hsl(var(--muted-foreground));
}
</style>
