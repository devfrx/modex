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
 * - File type filters
 * - Recently modified filter
 * - Favorite configs (starred)
 */
import { ref, computed, watch, onMounted } from "vue";
import { createLogger } from "@/utils/logger";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfigFolderItem from "./ConfigFolderItem.vue";
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import type { ConfigFolder, ConfigFile, ConfigBackup } from "@/types";

const log = createLogger("ConfigBrowser");

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

// Filters
const activeFileTypeFilter = ref<string | null>(null);
const showRecentlyModified = ref(false);
const showFavoritesOnly = ref(false);
const showFilters = ref(false);
const favorites = ref<Set<string>>(new Set());

// Folder category filter: 'configs' | 'saves' | 'all'
const folderCategory = ref<'configs' | 'saves' | 'all'>('configs');

// Folder categories mapping
const folderCategories = {
    configs: ['config', 'defaultconfigs', 'kubejs', 'scripts'],
    saves: ['saves'],
    all: ['config', 'defaultconfigs', 'kubejs', 'scripts', 'saves', 'resourcepacks', 'shaderpacks', 'options', 'servers']
};

// Toggle favorites filter
const toggleFavoritesFilter = () => {
    showFavoritesOnly.value = !showFavoritesOnly.value;
};

// Load favorites from localStorage
const loadFavorites = () => {
    try {
        const stored = localStorage.getItem(`config-favorites-${props.instanceId}`);
        if (stored) {
            favorites.value = new Set(JSON.parse(stored));
        }
    } catch (e) {
        log.error("Failed to load favorites", { instanceId: props.instanceId, error: String(e) });
    }
};

// Save favorites to localStorage
const saveFavorites = () => {
    try {
        localStorage.setItem(`config-favorites-${props.instanceId}`, JSON.stringify([...favorites.value]));
    } catch (e) {
        log.error("Failed to save favorites", { instanceId: props.instanceId, error: String(e) });
    }
};

// Toggle favorite
const toggleFavorite = (filePath: string) => {
    if (favorites.value.has(filePath)) {
        favorites.value.delete(filePath);
    } else {
        favorites.value.add(filePath);
    }
    saveFavorites();
};

// File type options for filter
const fileTypeOptions = [
    { value: 'json', label: 'JSON', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { value: 'toml', label: 'TOML', color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { value: 'yaml', label: 'YAML', color: 'text-green-400', bg: 'bg-green-400/10' },
    { value: 'cfg', label: 'CFG', color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { value: 'properties', label: 'Properties', color: 'text-orange-400', bg: 'bg-orange-400/10' },
];

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
        const allFolders = await window.api.configs.getFolders(props.instanceId);
        // Filter based on selected category
        const allowedFolders = folderCategories[folderCategory.value];
        // Also exclude 'local' folder as it contains non-config files
        folders.value = allFolders.filter(f =>
            allowedFolders.includes(f.name) && f.name !== 'local'
        );
    } catch (error: any) {
        log.error("Failed to load config folders", { instanceId: props.instanceId, error: String(error) });
        toast.error("Failed to load configs", error.message);
    } finally {
        isLoading.value = false;
    }
}

// Get all files from folders recursively
const getAllFiles = (folderList: ConfigFolder[]): ConfigFile[] => {
    const files: ConfigFile[] = [];
    const traverse = (folder: ConfigFolder) => {
        files.push(...folder.files);
        folder.subfolders?.forEach(traverse);
    };
    folderList.forEach(traverse);
    return files;
};

// Filtered files based on active filters
const filteredFiles = computed(() => {
    let files = getAllFiles(folders.value);

    // Filter by type
    if (activeFileTypeFilter.value) {
        files = files.filter(f => f.type === activeFileTypeFilter.value);
    }

    // Filter by recently modified (last 24 hours)
    if (showRecentlyModified.value) {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        files = files.filter(f => new Date(f.modified).getTime() > dayAgo);
    }

    return files;
});

// Favorite files
const favoriteFiles = computed(() => {
    const allFiles = getAllFiles(folders.value);
    return allFiles.filter(f => favorites.value.has(f.path));
});

// Search configs
async function searchConfigs() {
    if (!searchQuery.value.trim()) {
        searchResults.value = [];
        return;
    }

    isSearching.value = true;
    try {
        let results = await window.api.configs.search(
            props.instanceId,
            searchQuery.value
        );

        // Apply type filter to search results
        if (activeFileTypeFilter.value) {
            results = results.filter(f => f.type === activeFileTypeFilter.value);
        }

        searchResults.value = results;
    } catch (error: any) {
        log.error("Failed to search configs", { instanceId: props.instanceId, query: searchQuery.value, error: String(error) });
        toast.error("Search failed", error.message);
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

// Handle open structured editor
function handleOpenStructured(file: ConfigFile) {
    emit("openStructured", file);
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
        log.error("Failed to load backups", { instanceId: props.instanceId, error: String(error) });
        toast.error("Failed to load backups", error.message);
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
    loadFavorites();
});

watch(
    () => props.instanceId,
    () => {
        loadFolders();
        loadFavorites();
    }
);

// Reload when folder category changes
watch(folderCategory, () => {
    loadFolders();
});
</script>

<template>
    <div class="config-browser">
        <!-- Modern Header with Gradient -->
        <div class="browser-header">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="header-icon">
                        <Icon name="FileSliders" class="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 class="font-semibold text-foreground flex items-center gap-2">
                            Config Manager
                            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                {{ totalStats.files }} files
                            </span>
                        </h3>
                        <p class="text-xs text-muted-foreground">{{ instanceName }}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <Tooltip content="Refresh" position="bottom">
                        <button @click="loadFolders" :disabled="isLoading" class="header-btn">
                            <Icon name="RefreshCw" :class="['w-4 h-4', isLoading && 'animate-spin']" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Backups" position="bottom">
                        <button @click="showBackupsDialog = true; loadBackups();" class="header-btn">
                            <Icon name="History" class="w-4 h-4" />
                        </button>
                    </Tooltip>
                    <div class="w-px h-4 bg-border/50 mx-1"></div>
                    <Button variant="ghost" size="sm" @click="importConfigs" :disabled="isImporting"
                        class="gap-1.5 h-8">
                        <Icon name="Upload" class="w-4 h-4" />
                        <span class="hidden sm:inline">Import</span>
                    </Button>
                    <Button variant="ghost" size="sm" @click="exportConfigs" :disabled="isExporting"
                        class="gap-1.5 h-8">
                        <Icon name="Download" class="w-4 h-4" />
                        <span class="hidden sm:inline">Export</span>
                    </Button>
                </div>
            </div>

            <!-- Search with Enhanced Design -->
            <div class="search-container">
                <Icon name="Search" class="search-icon" />
                <input v-model="searchQuery" placeholder="Search configs by name or mod..." class="search-input" />
                <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
                    <Icon name="X" class="w-4 h-4" />
                </button>
            </div>

            <!-- Filter Bar -->
            <div class="filter-bar">
                <div class="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-none">
                    <!-- Folder Category Selector -->
                    <div class="flex items-center p-0.5 bg-muted/50 rounded-lg">
                        <button @click="folderCategory = 'configs'" :class="['px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                            folderCategory === 'configs'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground']">
                            Configs
                        </button>
                        <button @click="folderCategory = 'saves'" :class="['px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                            folderCategory === 'saves'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground']">
                            Saves
                        </button>
                        <button @click="folderCategory = 'all'" :class="['px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                            folderCategory === 'all'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground']">
                            All
                        </button>
                    </div>

                    <div class="w-px h-4 bg-border/50"></div>

                    <!-- Filter Toggle -->
                    <button @click="showFilters = !showFilters"
                        :class="['filter-chip', showFilters || activeFileTypeFilter || showRecentlyModified ? 'filter-chip-active' : '']">
                        <Icon name="Filter" class="w-3.5 h-3.5" />
                        <span>Filters</span>
                        <Icon name="ChevronDown"
                            :class="['w-3 h-3 transition-transform', showFilters && 'rotate-180']" />
                    </button>

                    <!-- Quick Filters -->
                    <button @click="showRecentlyModified = !showRecentlyModified"
                        :class="['filter-chip', showRecentlyModified ? 'filter-chip-active' : '']">
                        <Icon name="Clock" class="w-3.5 h-3.5" />
                        <span>Recent</span>
                    </button>

                    <!-- Favorites -->
                    <button @click="toggleFavoritesFilter"
                        :class="['filter-chip', showFavoritesOnly ? 'filter-chip-active' : '']">
                        <Icon name="Star" class="w-3.5 h-3.5"
                            :class="favorites.size > 0 ? 'fill-yellow-400 text-yellow-400' : ''" />
                        <span>Favorites</span>
                        <span v-if="favorites.size > 0" class="text-[10px] ml-0.5">({{ favorites.size }})</span>
                    </button>

                    <!-- Active Type Filters as Pills -->
                    <template v-if="activeFileTypeFilter && activeFileTypeFilter !== 'favorites'">
                        <div class="h-4 w-px bg-border/50"></div>
                        <button @click="activeFileTypeFilter = null" class="filter-chip filter-chip-active gap-1">
                            <span :class="fileTypeOptions.find(f => f.value === activeFileTypeFilter)?.color">
                                {{ activeFileTypeFilter.toUpperCase() }}
                            </span>
                            <Icon name="X" class="w-3 h-3" />
                        </button>
                    </template>
                </div>

                <!-- Stats -->
                <div class="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                    <div class="flex items-center gap-1">
                        <Icon name="HardDrive" class="w-3.5 h-3.5" />
                        {{ totalStats.size }}
                    </div>
                </div>
            </div>

            <!-- Expanded Filter Panel -->
            <div v-if="showFilters" class="filter-panel">
                <div class="text-xs text-muted-foreground mb-2">Filter by file type:</div>
                <div class="flex flex-wrap gap-1.5">
                    <button v-for="type in fileTypeOptions" :key="type.value"
                        @click="activeFileTypeFilter = activeFileTypeFilter === type.value ? null : type.value" :class="[
                            'filter-type-btn',
                            activeFileTypeFilter === type.value ? `${type.bg} ${type.color} border-current` : ''
                        ]">
                        <Icon :name="getFileIcon(type.value)" class="w-3.5 h-3.5" />
                        {{ type.label }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="browser-content custom-scrollbar">
            <!-- Favorites Section (when favorites filter active) -->
            <div v-if="showFavoritesOnly" class="p-3">
                <div v-if="favoriteFiles.length === 0" class="empty-state">
                    <Icon name="Star" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground text-sm">No favorite configs yet</p>
                    <p class="text-xs text-muted-foreground/70 mt-1">Click the star icon on any config to add it to
                        favorites
                    </p>
                </div>
                <div v-else class="space-y-1">
                    <div v-for="file in favoriteFiles" :key="file.path"
                        :class="['search-result', selectedFile?.path === file.path && 'search-result-active']"
                        @click="selectFile(file)">
                        <Icon :name="getFileIcon(file.type)"
                            :class="['w-4 h-4 shrink-0', getFileTypeClass(file.type)]" />
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-foreground truncate">{{ file.name }}</div>
                            <div class="text-xs text-muted-foreground truncate">{{ file.path }}</div>
                        </div>
                        <div class="search-result-actions">
                            <Tooltip content="Remove from favorites" position="top">
                                <button class="action-btn action-btn-star" @click.stop="toggleFavorite(file.path)">
                                    <Icon name="Star" class="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Edit as Key-Value" position="top">
                                <button class="action-btn action-btn-structured"
                                    @click.stop="emit('openStructured', file)">
                                    <Icon name="Settings2" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Open externally" position="top">
                                <button class="action-btn" @click.stop="openExternal(file)">
                                    <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filtered Results (when type filter or recent active, not searching) -->
            <div v-else-if="(activeFileTypeFilter || showRecentlyModified) && !searchQuery.trim() && !showFavoritesOnly"
                class="p-3">
                <div v-if="filteredFiles.length === 0" class="empty-state">
                    <Icon name="Filter" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground text-sm">No matching configs</p>
                    <p class="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>
                </div>
                <div v-else class="space-y-1">
                    <div class="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                        <Icon name="Sparkles" class="w-3.5 h-3.5" />
                        {{ filteredFiles.length }} config{{ filteredFiles.length !== 1 ? 's' : '' }} found
                    </div>
                    <div v-for="file in filteredFiles" :key="file.path"
                        :class="['search-result', selectedFile?.path === file.path && 'search-result-active']"
                        @click="selectFile(file)">
                        <Icon :name="getFileIcon(file.type)"
                            :class="['w-4 h-4 shrink-0', getFileTypeClass(file.type)]" />
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-foreground truncate">{{ file.name }}</div>
                            <div class="text-xs text-muted-foreground truncate">{{ file.path }}</div>
                        </div>
                        <div class="search-result-actions">
                            <Tooltip :content="favorites.has(file.path) ? 'Remove from favorites' : 'Add to favorites'"
                                position="top">
                                <button class="action-btn action-btn-star" @click.stop="toggleFavorite(file.path)">
                                    <Icon name="Star"
                                        :class="['w-3.5 h-3.5', favorites.has(file.path) ? 'fill-yellow-400 text-yellow-400' : '']" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Edit as Key-Value" position="top">
                                <button class="action-btn action-btn-structured"
                                    @click.stop="emit('openStructured', file)">
                                    <Icon name="Settings2" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Open externally" position="top">
                                <button class="action-btn" @click.stop="openExternal(file)">
                                    <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Delete" position="top">
                                <button class="action-btn action-btn-delete" @click.stop="deleteFile(file)">
                                    <Icon name="Trash2" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Search Results -->
            <div v-else-if="searchQuery.trim()" class="p-3">
                <div v-if="isSearching" class="loading-state">
                    <Icon name="Loader2" class="w-6 h-6 animate-spin text-primary" />
                </div>
                <div v-else-if="searchResults.length === 0" class="empty-state">
                    <Icon name="Search" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">
                        No configs found for "{{ searchQuery }}"
                    </p>
                </div>
                <div v-else class="space-y-1">
                    <div v-for="file in searchResults" :key="file.path" :class="[
                        'search-result',
                        selectedFile?.path === file.path && 'search-result-active',
                    ]" @click="selectFile(file)">
                        <Icon :name="getFileIcon(file.type)"
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
                            <Tooltip :content="favorites.has(file.path) ? 'Remove from favorites' : 'Add to favorites'"
                                position="top">
                                <button class="action-btn action-btn-star" @click.stop="toggleFavorite(file.path)">
                                    <Icon name="Star"
                                        :class="['w-3.5 h-3.5', favorites.has(file.path) ? 'fill-yellow-400 text-yellow-400' : '']" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Edit as Key-Value" position="top">
                                <button class="action-btn action-btn-structured"
                                    @click.stop="emit('openStructured', file)">
                                    <Icon name="Settings2" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Open externally" position="top">
                                <button class="action-btn" @click.stop="openExternal(file)">
                                    <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                            <Tooltip content="Delete" position="top">
                                <button class="action-btn action-btn-delete" @click.stop="deleteFile(file)">
                                    <Icon name="Trash2" class="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Folder Tree (default view) -->
            <div v-else class="p-3">
                <div v-if="isLoading" class="loading-state">
                    <Icon name="Loader2" class="w-6 h-6 animate-spin text-primary" />
                </div>
                <div v-else-if="folders.length === 0" class="empty-state">
                    <Icon name="Folder" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">No config folders found</p>
                </div>
                <div v-else class="folder-tree">
                    <ConfigFolderItem v-for="folder in folders" :key="folder.path" :folder="folder"
                        :expanded-folders="expandedFolders" :selected-file="selectedFile" :depth="0"
                        @toggle="toggleFolder" @select="selectFile" @open-external="openExternal"
                        @open-structured="handleOpenStructured" @delete="deleteFile" @open-folder="openFolder" />
                </div>
            </div>
        </div>

        <!-- Backups Dialog -->
        <Dialog :open="showBackupsDialog" title="Config Backups" @close="showBackupsDialog = false">
            <div class="space-y-4 min-w-[400px]">
                <div class="flex items-center justify-between">
                    <p class="text-sm text-muted-foreground">Manage your config backups</p>
                    <Button size="sm" @click="createBackup" :disabled="isCreatingBackup" class="gap-1.5">
                        <Icon name="Archive" :class="['w-4 h-4', isCreatingBackup && 'animate-pulse']" />
                        Create Backup
                    </Button>
                </div>

                <div v-if="backups.length === 0" class="empty-state py-8">
                    <Icon name="Archive" class="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p class="text-muted-foreground">No backups found</p>
                </div>
                <div v-else class="space-y-2 max-h-64 overflow-auto custom-scrollbar">
                    <div v-for="backup in backups" :key="backup.path" class="backup-item">
                        <div class="backup-icon">
                            <Icon name="Archive" class="w-5 h-5 text-primary" />
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
                                <Icon name="History" class="w-4 h-4" />
                            </button>
                            <button @click="deleteBackup(backup)" class="backup-btn backup-btn-delete" title="Delete">
                                <Icon name="Trash2" class="w-4 h-4" />
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
    background: linear-gradient(180deg, hsl(var(--card) / 0.8), transparent);
}

.header-icon {
    @apply w-10 h-10 rounded-xl flex items-center justify-center;
    background: linear-gradient(135deg,
            hsl(var(--primary) / 0.2),
            hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.header-btn {
    @apply p-2 rounded-lg transition-all duration-200;
    color: hsl(var(--muted-foreground));
}

.header-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
    transform: scale(1.05);
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
    @apply w-full pl-9 pr-9 py-2.5 rounded-xl text-sm transition-all duration-200;
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
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
    background-color: hsl(var(--background));
}

.search-clear {
    @apply absolute right-3 top-1/2 -translate-y-1/2 transition-colors p-0.5 rounded;
    color: hsl(var(--muted-foreground));
}

.search-clear:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
}

/* Filter Bar */
.filter-bar {
    @apply flex items-center gap-2;
}

.filter-chip {
    @apply flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer whitespace-nowrap;
    background-color: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    border: 1px solid transparent;
}

.filter-chip:hover {
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
}

.filter-chip-active {
    background-color: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.3);
}

.filter-chip-active:hover {
    background-color: hsl(var(--primary) / 0.2);
}

/* Filter Panel */
.filter-panel {
    @apply p-3 rounded-xl mt-1;
    background-color: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.filter-type-btn {
    @apply flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer;
    background-color: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border) / 0.3);
}

.filter-type-btn:hover {
    background-color: hsl(var(--muted));
    border-color: hsl(var(--border));
}

/* Scrollbar hidden for filter bar */
.scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.scrollbar-none::-webkit-scrollbar {
    display: none;
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
    @apply flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200;
    border: 1px solid transparent;
    max-width: 100%;
    overflow: hidden;
}

.search-result:hover {
    background-color: hsl(var(--muted) / 0.5);
    border-color: hsl(var(--border) / 0.5);
    transform: translateX(2px);
}

.search-result-active {
    background-color: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
}

.search-result-actions {
    @apply flex items-center gap-0.5 opacity-0 transition-opacity shrink-0;
}

.search-result:hover .search-result-actions {
    @apply opacity-100;
}

.action-btn {
    @apply p-1.5 rounded-lg transition-all duration-200;
    color: hsl(var(--muted-foreground));
}

.action-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
    transform: scale(1.1);
}

.action-btn-star:hover {
    color: hsl(var(--warning));
    background-color: hsl(var(--warning) / 0.1);
}

.action-btn-structured:hover {
    color: hsl(var(--primary));
    background-color: hsl(var(--primary) / 0.1);
}

.action-btn-delete:hover {
    color: hsl(var(--destructive));
    background-color: hsl(var(--destructive) / 0.1);
}

/* Folder Tree */
.folder-tree {
    @apply space-y-0.5;
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

/* Backups */
.backup-item {
    @apply flex items-center gap-3 p-3 rounded-xl transition-all duration-200;
    background-color: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
}

.backup-item:hover {
    border-color: hsl(var(--border));
    transform: translateY(-1px);
}

.backup-icon {
    @apply w-10 h-10 rounded-lg flex items-center justify-center;
    background-color: hsl(var(--primary) / 0.1);
}

.backup-btn {
    @apply p-2 rounded-lg transition-all duration-200;
    color: hsl(var(--muted-foreground));
}

.backup-btn:disabled {
    @apply opacity-50;
}

.backup-btn-restore:hover {
    color: hsl(var(--success));
    background-color: hsl(var(--success) / 0.1);
    transform: scale(1.1);
}

.backup-btn-delete:hover {
    color: hsl(var(--destructive));
    background-color: hsl(var(--destructive) / 0.1);
    transform: scale(1.1);
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
