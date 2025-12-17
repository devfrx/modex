<script setup lang="ts">
/**
 * ConfigBrowser - Modern config file browser with sleek design
 *
 * Features:
 * - Elegant tree view with smooth animations
 * - Fuzzy search with highlights
 * - Quick actions on hover
 * - Backup/restore functionality
 * - Import/export support
 */
import { ref, computed, watch, onMounted } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfigFolderItem from "./ConfigFolderItem.vue";
import {
    File,
    Search,
    Download,
    Upload,
    History,
    RefreshCw,
    HardDrive,
    Loader2,
    X,
    FileSliders,
    Archive,
    Folder,
    FileJson,
    FileCode,
    FileText,
    ExternalLink,
    Trash2,
    Settings2,
} from "lucide-vue-next";
import type { ConfigFolder, ConfigFile, ConfigBackup } from "@/types";

const props = defineProps<{
    instanceId: string;
    instanceName: string;
}>();

const emit = defineEmits<{
    (e: "openFile", file: ConfigFile): void;
    (e: "openStructured", file: ConfigFile): void;
    (e: "refresh"): void;
}>();

const toast = useToast();

// State
const isLoading = ref(false);
const folders = ref<ConfigFolder[]>([]);
const expandedFolders = ref<Set<string>>(new Set(["config"]));
const selectedFile = ref<ConfigFile | null>(null);
const searchQuery = ref("");
const searchResults = ref<ConfigFile[]>([]);
const isSearching = ref(false);

// Backups
const backups = ref<ConfigBackup[]>([]);
const showBackupsDialog = ref(false);
const isCreatingBackup = ref(false);
const isRestoringBackup = ref(false);

// Export/Import
const isExporting = ref(false);
const isImporting = ref(false);

// Load config folders
async function loadFolders() {
    isLoading.value = true;
    try {
        folders.value = await window.api.configs.getFolders(props.instanceId);
    } catch (error: any) {
        console.error("Failed to load config folders:", error);
        toast.error("Failed to load configs", error.message);
    } finally {
        isLoading.value = false;
    }
}

// Search configs
async function searchConfigs() {
    if (!searchQuery.value.trim()) {
        searchResults.value = [];
        return;
    }

    isSearching.value = true;
    try {
        searchResults.value = await window.api.configs.search(
            props.instanceId,
            searchQuery.value
        );
    } catch (error: any) {
        console.error("Failed to search configs:", error);
    } finally {
        isSearching.value = false;
    }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, (query) => {
    clearTimeout(searchTimeout);
    if (query.trim()) {
        searchTimeout = setTimeout(searchConfigs, 300);
    } else {
        searchResults.value = [];
    }
});

// Toggle folder expansion
function toggleFolder(path: string) {
    if (expandedFolders.value.has(path)) {
        expandedFolders.value.delete(path);
    } else {
        expandedFolders.value.add(path);
    }
}

// Select a file
function selectFile(file: ConfigFile) {
    selectedFile.value = file;
    emit("openFile", file);
}

// Open file in external editor
async function openExternal(file: ConfigFile) {
    try {
        await window.api.configs.openExternal(props.instanceId, file.path);
    } catch (error: any) {
        toast.error("Failed to open file", error.message);
    }
}

// Open folder in explorer
async function openFolder(folderPath?: string) {
    try {
        await window.api.configs.openFolder(props.instanceId, folderPath);
    } catch (error: any) {
        toast.error("Failed to open folder", error.message);
    }
}

// Delete a config file
async function deleteFile(file: ConfigFile) {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;

    try {
        await window.api.configs.delete(props.instanceId, file.path);
        toast.success("File deleted", file.name);
        await loadFolders();
    } catch (error: any) {
        toast.error("Failed to delete file", error.message);
    }
}

// Export configs
async function exportConfigs() {
    isExporting.value = true;
    try {
        const result = await window.api.configs.export(props.instanceId);
        if (result) {
            toast.success(
                "Configs exported",
                `${result.manifest.fileCount} files exported`
            );
        }
    } catch (error: any) {
        toast.error("Export failed", error.message);
    } finally {
        isExporting.value = false;
    }
}

// Import configs
async function importConfigs() {
    isImporting.value = true;
    try {
        const result = await window.api.configs.import(props.instanceId, true);
        if (result) {
            toast.success("Configs imported", `${result.imported} files imported`);
            await loadFolders();
        }
    } catch (error: any) {
        toast.error("Import failed", error.message);
    } finally {
        isImporting.value = false;
    }
}

// Load backups
async function loadBackups() {
    try {
        backups.value = await window.api.configs.listBackups(props.instanceId);
    } catch (error: any) {
        console.error("Failed to load backups:", error);
    }
}

// Create backup
async function createBackup() {
    isCreatingBackup.value = true;
    try {
        await window.api.configs.backup(props.instanceId);
        toast.success("Backup created", "Config backup saved");
        await loadBackups();
    } catch (error: any) {
        toast.error("Backup failed", error.message);
    } finally {
        isCreatingBackup.value = false;
    }
}

// Restore backup
async function restoreBackup(backup: ConfigBackup) {
    if (!confirm("Replace all configs with this backup?")) return;

    isRestoringBackup.value = true;
    try {
        const result = await window.api.configs.restoreBackup(
            props.instanceId,
            backup.path
        );
        toast.success("Backup restored", `${result.restored} files restored`);
        await loadFolders();
        showBackupsDialog.value = false;
    } catch (error: any) {
        toast.error("Restore failed", error.message);
    } finally {
        isRestoringBackup.value = false;
    }
}

// Delete backup
async function deleteBackup(backup: ConfigBackup) {
    if (!confirm("Delete this backup?")) return;

    try {
        await window.api.configs.deleteBackup(backup.path);
        toast.success("Backup deleted");
        await loadBackups();
    } catch (error: any) {
        toast.error("Delete failed", error.message);
    }
}

// Get file icon based on type
function getFileIcon(type: string) {
    switch (type) {
        case "json":
        case "json5":
            return FileJson;
        case "toml":
        case "cfg":
        case "yaml":
            return FileCode;
        default:
            return FileText;
    }
}

// Get file type color class
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

// Format file size
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format date
function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
}

// Total stats
const totalStats = computed(() => {
    let files = 0;
    let size = 0;

    const countFolder = (folder: ConfigFolder) => {
        files += folder.fileCount;
        size += folder.totalSize;
    };

    folders.value.forEach(countFolder);

    return { files, size: formatSize(size) };
});

onMounted(() => {
    loadFolders();
});

watch(
    () => props.instanceId,
    () => {
        loadFolders();
    }
);
</script>

<template>
    <div class="config-browser">
        <!-- Header -->
        <div class="browser-header">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="header-icon">
                        <FileSliders class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 class="font-semibold text-foreground">Config Manager</h3>
                        <p class="text-xs text-muted-foreground">{{ instanceName }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button @click="loadFolders" :disabled="isLoading" class="header-btn" title="Refresh">
                        <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
                    </button>
                    <button @click="
                        showBackupsDialog = true;
                    loadBackups();
                    " class="header-btn" title="Backups">
                        <History class="w-4 h-4" />
                    </button>
                    <Button variant="ghost" size="sm" @click="importConfigs" :disabled="isImporting" class="gap-1.5">
                        <Upload class="w-4 h-4" />
                        <span class="hidden sm:inline">Import</span>
                    </Button>
                    <Button variant="ghost" size="sm" @click="exportConfigs" :disabled="isExporting" class="gap-1.5">
                        <Download class="w-4 h-4" />
                        <span class="hidden sm:inline">Export</span>
                    </Button>
                </div>
            </div>

            <!-- Search -->
            <div class="search-container">
                <Search class="search-icon" />
                <input v-model="searchQuery" placeholder="Search configs by name or mod..." class="search-input" />
                <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
                    <X class="w-4 h-4" />
                </button>
            </div>

            <!-- Stats -->
            <div class="stats-bar">
                <div class="stat-item">
                    <File class="w-3.5 h-3.5" />
                    {{ totalStats.files }} files
                </div>
                <div class="stat-item">
                    <HardDrive class="w-3.5 h-3.5" />
                    {{ totalStats.size }}
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="browser-content custom-scrollbar">
            <!-- Search Results -->
            <div v-if="searchQuery.trim()" class="p-3">
                <div v-if="isSearching" class="loading-state">
                    <Loader2 class="w-6 h-6 animate-spin text-primary" />
                </div>
                <div v-else-if="searchResults.length === 0" class="empty-state">
                    <Search class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">
                        No configs found for "{{ searchQuery }}"
                    </p>
                </div>
                <div v-else class="space-y-1">
                    <div v-for="file in searchResults" :key="file.path" :class="[
                        'search-result',
                        selectedFile?.path === file.path && 'search-result-active',
                    ]" @click="selectFile(file)">
                        <component :is="getFileIcon(file.type)"
                            :class="['w-4 h-4 shrink-0', getFileTypeClass(file.type)]" />
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-foreground truncate">
                                {{ file.name }}
                            </div>
                            <div class="text-xs text-muted-foreground truncate">
                                {{ file.path }}
                            </div>
                        </div>
                        <div class="search-result-actions">
                            <button class="action-btn action-btn-structured" @click.stop="emit('openStructured', file)"
                                title="Edit as Key-Value">
                                <Settings2 class="w-3.5 h-3.5" />
                            </button>
                            <button class="action-btn" @click.stop="openExternal(file)" title="Open externally">
                                <ExternalLink class="w-3.5 h-3.5" />
                            </button>
                            <button class="action-btn action-btn-delete" @click.stop="deleteFile(file)" title="Delete">
                                <Trash2 class="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Folder Tree -->
            <div v-else class="p-3">
                <div v-if="isLoading" class="loading-state">
                    <Loader2 class="w-6 h-6 animate-spin text-primary" />
                </div>
                <div v-else-if="folders.length === 0" class="empty-state">
                    <Folder class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">No config folders found</p>
                </div>
                <div v-else class="folder-tree">
                    <ConfigFolderItem v-for="folder in folders" :key="folder.path" :folder="folder"
                        :expanded-folders="expandedFolders" :selected-file="selectedFile" :depth="0"
                        @toggle="toggleFolder" @select="selectFile" @open-external="openExternal"
                        @open-structured="(file: ConfigFile) => emit('openStructured', file)" @delete="deleteFile"
                        @open-folder="openFolder" />
                </div>
            </div>
        </div>

        <!-- Backups Dialog -->
        <Dialog :open="showBackupsDialog" title="Config Backups" @close="showBackupsDialog = false">
            <div class="space-y-4 min-w-[400px]">
                <div class="flex items-center justify-between">
                    <p class="text-sm text-muted-foreground">Manage your config backups</p>
                    <Button size="sm" @click="createBackup" :disabled="isCreatingBackup" class="gap-1.5">
                        <Archive :class="['w-4 h-4', isCreatingBackup && 'animate-pulse']" />
                        Create Backup
                    </Button>
                </div>

                <div v-if="backups.length === 0" class="empty-state py-8">
                    <Archive class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">No backups found</p>
                </div>
                <div v-else class="space-y-2 max-h-64 overflow-auto custom-scrollbar">
                    <div v-for="backup in backups" :key="backup.path" class="backup-item">
                        <div class="backup-icon">
                            <Archive class="w-5 h-5 text-primary" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-foreground">
                                {{ formatDate(backup.date) }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                {{ formatSize(backup.size) }}
                            </div>
                        </div>
                        <div class="flex items-center gap-1">
                            <button @click="restoreBackup(backup)" :disabled="isRestoringBackup"
                                class="backup-btn backup-btn-restore" title="Restore">
                                <History class="w-4 h-4" />
                            </button>
                            <button @click="deleteBackup(backup)" class="backup-btn backup-btn-delete" title="Delete">
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end pt-2">
                    <Button variant="ghost" @click="showBackupsDialog = false">Close</Button>
                </div>
            </div>
        </Dialog>
    </div>
</template>

<style scoped>
.config-browser {
    @apply h-full flex flex-col;
    background-color: hsl(var(--background));
}

/* Header */
.browser-header {
    @apply p-4 space-y-3;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
}

.header-icon {
    @apply w-10 h-10 rounded-xl flex items-center justify-center;
    background: linear-gradient(135deg,
            hsl(var(--primary) / 0.2),
            hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.header-btn {
    @apply p-2 rounded-lg transition-colors;
    color: hsl(var(--muted-foreground));
}

.header-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
}

.header-btn:disabled {
    @apply opacity-50;
}

/* Search */
.search-container {
    @apply relative;
}

.search-icon {
    @apply absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4;
    color: hsl(var(--muted-foreground));
}

.search-input {
    @apply w-full pl-9 pr-9 py-2 rounded-lg text-sm;
    background-color: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
    color: hsl(var(--foreground));
}

.search-input::placeholder {
    color: hsl(var(--muted-foreground));
}

.search-input:focus {
    @apply outline-none;
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
}

.search-clear {
    @apply absolute right-3 top-1/2 -translate-y-1/2 transition-colors;
    color: hsl(var(--muted-foreground));
}

.search-clear:hover {
    color: hsl(var(--foreground));
}

/* Stats */
.stats-bar {
    @apply flex items-center gap-4 text-xs;
    color: hsl(var(--muted-foreground));
}

.stat-item {
    @apply flex items-center gap-1.5;
}

/* Content */
.browser-content {
    @apply flex-1 overflow-auto;
}

/* States */
.loading-state {
    @apply flex items-center justify-center py-8;
}

.empty-state {
    @apply text-center py-8;
}

/* Search Results */
.search-result {
    @apply flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all;
    border: 1px solid transparent;
    max-width: 100%;
    overflow: hidden;
}

.search-result:hover {
    background-color: hsl(var(--muted) / 0.5);
    border-color: hsl(var(--border) / 0.5);
}

.search-result-active {
    background-color: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
}

.search-result-actions {
    @apply flex items-center gap-1 opacity-0 transition-opacity shrink-0;
}

.search-result:hover .search-result-actions {
    @apply opacity-100;
}

.action-btn {
    @apply p-1.5 rounded-lg transition-colors;
    color: hsl(var(--muted-foreground));
}

.action-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
}

.action-btn-structured:hover {
    color: rgb(168 85 247);
    background-color: rgb(168 85 247 / 0.1);
}

.action-btn-delete:hover {
    color: rgb(248 113 113);
    background-color: rgb(239 68 68 / 0.1);
}

/* Folder Tree */
.folder-tree {
    @apply space-y-0.5;
}

/* File Type Colors */
.file-json {
    color: rgb(250 204 21);
}

.file-toml {
    color: rgb(96 165 250);
}

.file-yaml {
    color: rgb(74 222 128);
}

.file-cfg {
    color: rgb(192 132 252);
}

.file-default {
    color: hsl(var(--muted-foreground));
}

/* Backups */
.backup-item {
    @apply flex items-center gap-3 p-3 rounded-xl transition-all;
    background-color: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
}

.backup-item:hover {
    border-color: hsl(var(--border));
}

.backup-icon {
    @apply w-10 h-10 rounded-lg flex items-center justify-center;
    background-color: hsl(var(--primary) / 0.1);
}

.backup-btn {
    @apply p-2 rounded-lg transition-colors;
    color: hsl(var(--muted-foreground));
}

.backup-btn:disabled {
    @apply opacity-50;
}

.backup-btn-restore:hover {
    color: rgb(74 222 128);
    background-color: rgb(34 197 94 / 0.1);
}

.backup-btn-delete:hover {
    color: rgb(248 113 113);
    background-color: rgb(239 68 68 / 0.1);
}

/* Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.2);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.3);
}
</style>
