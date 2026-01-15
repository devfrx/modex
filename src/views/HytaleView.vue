<script setup lang="ts">
/**
 * HytaleView - Main view for Hytale game profile
 * 
 * Redesigned with card-based UI similar to Minecraft views
 * 
 * Features:
 * - Card-based mod display with hover effects
 * - ModDetailsModal on double-click
 * - Card-based modpack display
 * - Fullscreen modpack editor (via route)
 * - Search, filter, and sort functionality
 */

import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useHytale } from "@/composables/useHytale";
import { useGameProfile } from "@/composables/useGameProfile";
import { useToast } from "@/composables/useToast";
import type { HytaleMod, HytaleModpack } from "@/types";
import {
    Play,
    FolderOpen,
    Search,
    RefreshCw,
    Plus,
    Package,
    Power,
    PowerOff,
    Trash2,
    Save,
    Check,
    AlertCircle,
    Download,
    Settings,
    Filter,
    SortAsc,
    SortDesc,
    Grid3X3,
    List,
    X,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import HytaleModCard from "@/components/hytale/HytaleModCard.vue";
import HytaleModpackCard from "@/components/hytale/HytaleModpackCard.vue";
import HytaleModDetailsModal from "@/components/hytale/HytaleModDetailsModal.vue";

const router = useRouter();
const toast = useToast();

const {
    installedMods,
    modpacks,
    activeModpack,
    config,
    stats,
    isLoading,
    isInstalled,
    isInitialized,
    enabledMods,
    disabledMods,
    modCount,
    modpackCount,
    initialize,
    refreshMods,
    toggleMod,
    removeMod,
    createModpack,
    updateModpack,
    deleteModpack,
    saveToModpack,
    activateModpack,
    launch,
    openModsFolder,
} = useHytale();

// Local state
const searchQuery = ref("");
const isRefreshing = ref(false);
const isLaunching = ref(false);
const isSavingToModpack = ref(false);
const showCreateModpackDialog = ref(false);
const showDeleteModConfirmDialog = ref(false);
const showDeleteModpackConfirmDialog = ref(false);
const modToDelete = ref<HytaleMod | null>(null);
const modpackToDelete = ref<HytaleModpack | null>(null);
const newModpackName = ref("");
const newModpackDescription = ref("");
const activeTab = ref<"mods" | "modpacks">("mods");

// View mode
const viewMode = ref<"grid" | "list">("grid");

// Filter & sort state
const filterEnabled = ref<"all" | "enabled" | "disabled">("all");
const sortDir = ref<"asc" | "desc">("asc");

// Mod details modal
const showModDetailsModal = ref(false);
const selectedMod = ref<HytaleMod | null>(null);

// Selected mods (for bulk operations)
const selectedModIds = ref<Set<string>>(new Set());

// Selected modpacks (for bulk operations)
const selectedModpackIds = ref<Set<string>>(new Set());

// Filtered and sorted mods
const filteredMods = computed(() => {
    let mods = installedMods.value;

    // Search filter
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        mods = mods.filter(
            (mod) =>
                mod.name.toLowerCase().includes(query) ||
                mod.folderName.toLowerCase().includes(query) ||
                (mod.hytaleModId && mod.hytaleModId.toLowerCase().includes(query))
        );
    }

    // Enabled filter
    if (filterEnabled.value === "enabled") {
        mods = mods.filter(mod => !mod.isDisabled);
    } else if (filterEnabled.value === "disabled") {
        mods = mods.filter(mod => mod.isDisabled);
    }

    // Sort by name
    mods = [...mods].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortDir.value === "asc" ? comparison : -comparison;
    });

    return mods;
});

// Initialize on mount
onMounted(async () => {
    await initialize();
});

// Mod handlers
function handleShowModDetails(mod: HytaleMod) {
    selectedMod.value = mod;
    showModDetailsModal.value = true;
}

async function handleToggleMod(mod: HytaleMod) {
    await toggleMod(mod.id);
    // If modal is open, refresh the selected mod
    if (selectedMod.value?.id === mod.id) {
        const updated = installedMods.value.find(m => m.id === mod.id);
        if (updated) selectedMod.value = updated;
    }
}

function handleToggleSelectMod(modId: string) {
    if (selectedModIds.value.has(modId)) {
        selectedModIds.value.delete(modId);
    } else {
        selectedModIds.value.add(modId);
    }
    selectedModIds.value = new Set(selectedModIds.value);
}

function handleToggleSelectModpack(modpackId: string) {
    if (selectedModpackIds.value.has(modpackId)) {
        selectedModpackIds.value.delete(modpackId);
    } else {
        selectedModpackIds.value.add(modpackId);
    }
    selectedModpackIds.value = new Set(selectedModpackIds.value);
}

function clearModpackSelection() {
    selectedModpackIds.value = new Set();
}

async function handleDeleteMod(mod: HytaleMod) {
    modToDelete.value = mod;
    showDeleteModConfirmDialog.value = true;
}

async function confirmDeleteMod() {
    if (!modToDelete.value) return;

    const success = await removeMod(modToDelete.value.id);
    if (success) {
        toast.success("Mod Removed", `${modToDelete.value.name} has been removed`);
        if (showModDetailsModal.value && selectedMod.value?.id === modToDelete.value.id) {
            showModDetailsModal.value = false;
            selectedMod.value = null;
        }
    }
    showDeleteModConfirmDialog.value = false;
    modToDelete.value = null;
}

async function handleOpenModFolder(mod: HytaleMod) {
    // Open the specific mod folder
    await window.api.hytale.openModFolder(mod.id);
}

// Refresh handler
async function handleRefresh() {
    isRefreshing.value = true;
    try {
        await refreshMods();
        toast.success("Refreshed", "Mods list has been updated");
    } finally {
        isRefreshing.value = false;
    }
}

// Launch handler
async function handleLaunch() {
    isLaunching.value = true;
    try {
        const result = await launch();
        if (!result.success && result.error) {
            toast.error("Launch Failed", result.error);
        }
    } finally {
        isLaunching.value = false;
    }
}

// Modpack handlers
async function handleCreateModpack() {
    if (!newModpackName.value.trim()) return;

    const modpack = await createModpack({
        name: newModpackName.value.trim(),
        description: newModpackDescription.value.trim() || undefined,
    });

    if (modpack) {
        toast.success("Modpack Created", `${modpack.name} has been created`);
        newModpackName.value = "";
        newModpackDescription.value = "";
        showCreateModpackDialog.value = false;
    }
}

function handleOpenModpackEditor(modpack: HytaleModpack) {
    router.push(`/hytale/modpack/${modpack.id}`);
}

async function handleActivateModpack(modpack: HytaleModpack) {
    const result = await activateModpack(modpack.id);
    if (result.success) {
        let message = `Enabled: ${result.enabled}, Disabled: ${result.disabled}`;
        if (result.missingMods?.length) {
            message += `. ${result.missingMods.length} mod(s) not found.`;
        }
        toast.success("Modpack Activated", message);
        await refreshMods();
    } else if (result.errors?.length) {
        toast.error("Activation Failed", result.errors.join("\n"));
    }
}

async function handleSaveToModpack(modpack: HytaleModpack) {
    isSavingToModpack.value = true;
    try {
        const success = await saveToModpack(modpack.id);
        if (success) {
            toast.success("Saved", `Current state saved to ${modpack.name}`);
        } else {
            toast.error("Save Failed", "Failed to save to modpack");
        }
    } finally {
        isSavingToModpack.value = false;
    }
}

async function handleDuplicateModpack(modpack: HytaleModpack) {
    const duplicate = await window.api.hytale.duplicateModpack(modpack.id, `${modpack.name} (Copy)`);
    if (duplicate) {
        toast.success("Duplicated", `Created ${duplicate.name}`);
        await refreshMods();
    }
}

function handleDeleteModpack(modpack: HytaleModpack) {
    modpackToDelete.value = modpack;
    showDeleteModpackConfirmDialog.value = true;
}

async function confirmDeleteModpack() {
    if (!modpackToDelete.value) return;

    await deleteModpack(modpackToDelete.value.id);
    toast.success("Deleted", `${modpackToDelete.value.name} has been deleted`);
    showDeleteModpackConfirmDialog.value = false;
    modpackToDelete.value = null;
}

// Sort toggle
function toggleSort() {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
}

// Navigate to Hytale Browse Mods
function goToSearch() {
    router.push("/hytale/browse");
}

// Clear selection
function clearSelection() {
    selectedModIds.value = new Set();
}

// Clear filters
function clearFilters() {
    searchQuery.value = "";
    filterEnabled.value = "all";
}

// Helper: check if modpack is active
function isModpackActive(modpack: HytaleModpack): boolean {
    return modpack.isActive || modpack.id === activeModpack.value?.id;
}
</script>

<template>
    <div class="hytale-view-container">
        <!-- Mod Details Modal (fullscreen overlay) -->
        <HytaleModDetailsModal :mod="selectedMod" :open="showModDetailsModal" @close="showModDetailsModal = false"
            @toggle-enabled="handleToggleMod" @delete="handleDeleteMod" @open-folder="handleOpenModFolder" />

        <div class="hytale-view">
            <!-- Header -->
            <header class="view-header">
                <div class="header-left">
                    <div>
                        <h1 class="header-title">Hytale Mods</h1>
                        <p class="header-subtitle">Manage your Hytale mods and virtual modpacks</p>
                    </div>
                </div>
                <div class="header-actions">
                    <Button variant="outline" size="sm" @click="openModsFolder" :disabled="!isInstalled">
                        <FolderOpen class="w-4 h-4 mr-2" />
                        Open Folder
                    </Button>
                    <Button variant="outline" size="sm" @click="goToSearch">
                        <Search class="w-4 h-4 mr-2" />
                        Browse Mods
                    </Button>
                    <Button @click="handleLaunch" :disabled="isLaunching || !isInstalled" size="sm">
                        <Play class="w-4 h-4 mr-2" :class="isLaunching && 'animate-pulse'" />
                        {{ isLaunching ? "Launching..." : "Play" }}
                    </Button>
                </div>
            </header>

            <!-- Not Installed Warning -->
            <div v-if="!isInstalled && isInitialized" class="not-installed-warning">
                <AlertCircle class="w-8 h-8 text-warning shrink-0" />
                <div class="flex-1">
                    <p class="font-medium text-foreground">Hytale Not Detected</p>
                    <p class="text-sm text-muted-foreground">
                        Please install Hytale or configure the paths in Settings.
                    </p>
                </div>
                <Button variant="outline" size="sm" @click="router.push('/settings')">
                    <Settings class="w-4 h-4 mr-2" />
                    Settings
                </Button>
            </div>

            <!-- Stats Cards -->
            <div class="stats-grid" v-if="isInstalled">
                <div class="stat-card">
                    <div class="stat-icon stat-icon-primary">
                        <Package class="w-5 h-5" />
                    </div>
                    <div class="stat-info">
                        <span class="stat-value">{{ modCount }}</span>
                        <span class="stat-label">Total Mods</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon stat-icon-success">
                        <Power class="w-5 h-5" />
                    </div>
                    <div class="stat-info">
                        <span class="stat-value">{{ enabledMods.length }}</span>
                        <span class="stat-label">Enabled</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon stat-icon-muted">
                        <PowerOff class="w-5 h-5" />
                    </div>
                    <div class="stat-info">
                        <span class="stat-value">{{ disabledMods.length }}</span>
                        <span class="stat-label">Disabled</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon stat-icon-accent">
                        <Save class="w-5 h-5" />
                    </div>
                    <div class="stat-info">
                        <span class="stat-value">{{ modpackCount }}</span>
                        <span class="stat-label">Modpacks</span>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="tabs-bar" v-if="isInstalled">
                <button @click="activeTab = 'mods'" class="tab-btn" :class="activeTab === 'mods' && 'active'">
                    <Package class="w-4 h-4" />
                    Installed Mods
                    <span class="tab-count">{{ modCount }}</span>
                </button>
                <button @click="activeTab = 'modpacks'" class="tab-btn" :class="activeTab === 'modpacks' && 'active'">
                    <Save class="w-4 h-4" />
                    Virtual Modpacks
                    <span class="tab-count">{{ modpackCount }}</span>
                </button>
            </div>

            <!-- Mods Tab Content -->
            <div v-if="activeTab === 'mods' && isInstalled" class="tab-content">
                <!-- Toolbar -->
                <div class="toolbar">
                    <div class="search-wrapper">
                        <Search class="search-icon" />
                        <Input v-model="searchQuery" placeholder="Search mods..." class="search-input" />
                        <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">
                            <X class="w-4 h-4" />
                        </button>
                    </div>

                    <div class="toolbar-right">
                        <!-- Filter -->
                        <div class="filter-group">
                            <button class="filter-btn" :class="filterEnabled === 'all' && 'active'"
                                @click="filterEnabled = 'all'">
                                All
                            </button>
                            <button class="filter-btn filter-enabled" :class="filterEnabled === 'enabled' && 'active'"
                                @click="filterEnabled = 'enabled'">
                                <Power class="w-3.5 h-3.5" />
                            </button>
                            <button class="filter-btn filter-disabled" :class="filterEnabled === 'disabled' && 'active'"
                                @click="filterEnabled = 'disabled'">
                                <PowerOff class="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <!-- Sort -->
                        <button class="sort-btn" @click="toggleSort"
                            :title="sortDir === 'asc' ? 'Sort A-Z' : 'Sort Z-A'">
                            <SortAsc v-if="sortDir === 'asc'" class="w-4 h-4" />
                            <SortDesc v-else class="w-4 h-4" />
                        </button>

                        <!-- View toggle -->
                        <div class="view-toggle">
                            <button class="view-btn" :class="viewMode === 'grid' && 'active'"
                                @click="viewMode = 'grid'">
                                <Grid3X3 class="w-4 h-4" />
                            </button>
                            <button class="view-btn" :class="viewMode === 'list' && 'active'"
                                @click="viewMode = 'list'">
                                <List class="w-4 h-4" />
                            </button>
                        </div>

                        <!-- Refresh -->
                        <Button variant="outline" size="icon" @click="handleRefresh" :disabled="isRefreshing">
                            <RefreshCw class="w-4 h-4" :class="isRefreshing && 'animate-spin'" />
                        </Button>
                    </div>
                </div>

                <!-- Selection bar (when mods are selected) -->
                <div v-if="selectedModIds.size > 0" class="selection-bar">
                    <span>{{ selectedModIds.size }} mod(s) selected</span>
                    <Button variant="ghost" size="sm" @click="clearSelection">
                        Clear selection
                    </Button>
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="loading-state">
                    <RefreshCw class="w-8 h-8 animate-spin text-muted-foreground" />
                    <p class="text-muted-foreground mt-2">Loading mods...</p>
                </div>

                <!-- Empty state -->
                <div v-else-if="filteredMods.length === 0" class="empty-state">
                    <Package class="w-16 h-16 text-muted-foreground/30" />
                    <p class="text-muted-foreground mt-4">
                        {{ searchQuery || filterEnabled !== 'all' ? "No mods match your filters" : "No mods installed"
                        }}
                    </p>
                    <div class="empty-actions">
                        <Button v-if="searchQuery || filterEnabled !== 'all'" variant="outline" @click="clearFilters">
                            Clear Filters
                        </Button>
                        <Button variant="outline" @click="goToSearch">
                            <Download class="w-4 h-4 mr-2" />
                            Browse Mods on CurseForge
                        </Button>
                    </div>
                </div>

                <!-- Mods Grid -->
                <div v-else class="mods-grid" :class="viewMode === 'list' && 'list-view'">
                    <HytaleModCard v-for="mod in filteredMods" :key="mod.id" :mod="mod"
                        :selected="selectedModIds.has(mod.id)" :show-actions="true"
                        @toggle-select="handleToggleSelectMod" @toggle-enabled="handleToggleMod"
                        @delete="handleDeleteMod" @show-details="handleShowModDetails" />
                </div>
            </div>

            <!-- Modpacks Tab Content -->
            <div v-if="activeTab === 'modpacks' && isInstalled" class="tab-content">
                <!-- Toolbar -->
                <div class="toolbar">
                    <p class="text-sm text-muted-foreground flex-1">
                        Virtual modpacks let you save and switch between mod configurations.
                    </p>
                    <Button @click="showCreateModpackDialog = true" size="sm">
                        <Plus class="w-4 h-4 mr-2" />
                        New Modpack
                    </Button>
                </div>

                <!-- Selection bar (when modpacks are selected) -->
                <div v-if="selectedModpackIds.size > 0" class="selection-bar">
                    <span>{{ selectedModpackIds.size }} modpack(s) selected</span>
                    <Button variant="ghost" size="sm" @click="clearModpackSelection">
                        Clear selection
                    </Button>
                </div>

                <!-- Active Modpack Banner -->
                <div v-if="activeModpack" class="active-modpack-banner">
                    <Check class="w-5 h-5" />
                    <span class="font-medium">Active: {{ activeModpack.name }}</span>
                </div>

                <!-- Empty state -->
                <div v-if="modpacks.length === 0" class="empty-state">
                    <Save class="w-16 h-16 text-muted-foreground/30" />
                    <p class="text-muted-foreground mt-4">No modpacks created yet</p>
                    <p class="text-xs text-muted-foreground mt-1">
                        Save your current mod setup as a modpack
                    </p>
                    <Button variant="outline" class="mt-4" @click="showCreateModpackDialog = true">
                        <Plus class="w-4 h-4 mr-2" />
                        Create Your First Modpack
                    </Button>
                </div>

                <!-- Modpacks Grid -->
                <div v-else class="modpacks-grid">
                    <HytaleModpackCard v-for="modpack in modpacks" :key="modpack.id" :modpack="modpack"
                        :selected="selectedModpackIds.has(modpack.id)" :is-active="isModpackActive(modpack)"
                        :is-saving="isSavingToModpack" @toggle-select="handleToggleSelectModpack"
                        @open-editor="handleOpenModpackEditor" @activate="handleActivateModpack"
                        @save="handleSaveToModpack" @delete="handleDeleteModpack" @duplicate="handleDuplicateModpack" />
                </div>
            </div>

            <!-- Create Modpack Dialog -->
            <Dialog :open="showCreateModpackDialog" @close="showCreateModpackDialog = false"
                title="Create Virtual Modpack" description="Save your current mod configuration as a modpack.">
                <div class="space-y-4">
                    <div class="space-y-2">
                        <label for="modpack-name" class="text-sm font-medium">Name</label>
                        <Input id="modpack-name" v-model="newModpackName" placeholder="My Modpack" />
                    </div>
                    <div class="space-y-2">
                        <label for="modpack-description" class="text-sm font-medium">Description (optional)</label>
                        <textarea id="modpack-description" v-model="newModpackDescription"
                            placeholder="A brief description..." rows="2"
                            class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                    </div>
                    <p class="text-sm text-muted-foreground">
                        This will save <strong>{{ enabledMods.length }}</strong> currently enabled mods.
                    </p>
                </div>
                <template #footer>
                    <Button variant="outline" @click="showCreateModpackDialog = false">
                        Cancel
                    </Button>
                    <Button @click="handleCreateModpack" :disabled="!newModpackName.trim()">
                        Create Modpack
                    </Button>
                </template>
            </Dialog>

            <!-- Delete Mod Confirmation Dialog -->
            <Dialog :open="showDeleteModConfirmDialog" @close="showDeleteModConfirmDialog = false" title="Delete Mod"
                :description="`Are you sure you want to remove '${modToDelete?.name}'? This will delete the mod files.`">
                <template #footer>
                    <Button variant="outline" @click="showDeleteModConfirmDialog = false">
                        Cancel
                    </Button>
                    <Button variant="destructive" @click="confirmDeleteMod">
                        Delete
                    </Button>
                </template>
            </Dialog>

            <!-- Delete Modpack Confirmation Dialog -->
            <Dialog :open="showDeleteModpackConfirmDialog" @close="showDeleteModpackConfirmDialog = false"
                title="Delete Modpack"
                :description="`Are you sure you want to delete '${modpackToDelete?.name}'? This won't remove the actual mods.`">
                <template #footer>
                    <Button variant="outline" @click="showDeleteModpackConfirmDialog = false">
                        Cancel
                    </Button>
                    <Button variant="destructive" @click="confirmDeleteModpack">
                        Delete
                    </Button>
                </template>
            </Dialog>
        </div>
    </div>
</template>

<style scoped>
.hytale-view-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.hytale-view {
    height: 100%;
    overflow-y: auto;
    padding: 24px;
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

/* Header */
.view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.header-icon {
    font-size: 40px;
}

.header-title {
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--foreground));
}

.header-subtitle {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin-top: 2px;
}

.header-actions {
    display: flex;
    gap: 8px;
}

/* Not Installed Warning */
.not-installed-warning {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    border-radius: 12px;
    border: 1px solid hsl(38 92% 50% / 0.3);
    background: hsl(38 92% 50% / 0.1);
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

@media (max-width: 768px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

.stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
}

.stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.stat-icon-primary {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
}

.stat-icon-success {
    background: hsl(142 76% 36% / 0.1);
    color: hsl(142 76% 46%);
}

.stat-icon-muted {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
}

.stat-icon-accent {
    background: hsl(var(--accent) / 0.2);
    color: hsl(var(--accent-foreground));
}

.stat-info {
    display: flex;
    flex-direction: column;
}

.stat-value {
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--foreground));
    line-height: 1;
}

.stat-label {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin-top: 4px;
}

/* Tabs Bar */
.tabs-bar {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: hsl(var(--muted) / 0.5);
}

.tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.tab-btn:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--background) / 0.5);
}

.tab-btn.active {
    color: hsl(var(--foreground));
    background: hsl(var(--background));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-count {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
}

.tab-btn.active .tab-count {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
}

/* Tab Content */
.tab-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* Toolbar */
.toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
}

.search-wrapper {
    position: relative;
    width: 300px;
}

.search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
}

.search-input {
    padding-left: 36px;
    padding-right: 36px;
}

.clear-search {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.clear-search:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
}

.toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.filter-group {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.5);
}

.filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.filter-btn:hover {
    color: hsl(var(--foreground));
}

.filter-btn.active {
    color: hsl(var(--foreground));
    background: hsl(var(--background));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.filter-enabled.active {
    color: hsl(142 76% 46%);
}

.filter-disabled.active {
    color: hsl(var(--muted-foreground));
}

.sort-select {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 12px;
}

.sort-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.sort-btn:hover {
    color: hsl(var(--foreground));
    border-color: hsl(var(--muted-foreground) / 0.3);
}

.view-toggle {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.5);
}

.view-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.view-btn:hover {
    color: hsl(var(--foreground));
}

.view-btn.active {
    color: hsl(var(--foreground));
    background: hsl(var(--background));
}

/* Selection Bar */
.selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-radius: 8px;
    background: hsl(var(--primary) / 0.1);
    border: 1px solid hsl(var(--primary) / 0.3);
    color: hsl(var(--primary));
    font-size: 13px;
    font-weight: 500;
}

/* Loading & Empty states */
.loading-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 32px;
    text-align: center;
}

.empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}

/* Mods Grid */
.mods-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
}

.mods-grid.list-view {
    grid-template-columns: 1fr;
    gap: 8px;
}

/* Modpacks Grid */
.modpacks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
}

/* Active Modpack Banner */
.active-modpack-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 10px;
    background: hsl(142 76% 36% / 0.1);
    border: 1px solid hsl(142 76% 36% / 0.3);
    color: hsl(142 76% 46%);
}
</style>
