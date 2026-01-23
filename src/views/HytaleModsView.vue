<script setup lang="ts">
/**
 * HytaleModsView - View for managing Hytale mods
 * 
 * Separated from HytaleView for better organization
 * 
 * Features:
 * - Card-based mod display with hover effects
 * - ModDetailsModal on double-click
 * - Search, filter, and sort functionality
 */

import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useHytale } from "@/composables/useHytale";
import { useToast } from "@/composables/useToast";
import { useLibraryPagination } from "@/composables/useLibraryPagination";
import type { HytaleMod } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import LibraryPaginationControls from "@/components/library/LibraryPaginationControls.vue";
import HytaleModCard from "@/components/hytale/HytaleModCard.vue";
import HytaleModDetailsModal from "@/components/hytale/HytaleModDetailsModal.vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("HytaleModsView");
const router = useRouter();
const toast = useToast();

const {
    installedMods,
    isLoading,
    isInstalled,
    isInitialized,
    enabledMods,
    disabledMods,
    modCount,
    initialize,
    refreshMods,
    toggleMod,
    removeMod,
    launch,
    openModsFolder,
} = useHytale();

// Local state
const searchQuery = ref("");
const isRefreshing = ref(false);
const isLaunching = ref(false);
const showDeleteModConfirmDialog = ref(false);
const modToDelete = ref<HytaleMod | null>(null);

// Update checking state
interface UpdateInfo {
    modId: string;
    projectId: number;
    projectName: string;
    currentFileId: number;
    latestFileId: number;
    latestVersion: string;
}
const isCheckingAllUpdates = ref(false);
const checkingModUpdates = ref<Record<string, boolean>>({});
const updateAvailable = ref<Record<string, UpdateInfo>>({});
const updatingMods = ref<Set<string>>(new Set());

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

// Pagination
const {
    currentPage,
    itemsPerPage,
    itemsPerPageOptions,
    totalPages,
    paginatedItems: paginatedMods,
    canGoPrev,
    canGoNext,
    goToPage,
    prevPage,
    nextPage,
} = useLibraryPagination({
    items: filteredMods,
    filterDeps: [searchQuery, filterEnabled, sortDir],
    initialItemsPerPage: 50,
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

// ==================== BULK ACTIONS ====================

// State for bulk delete confirmation
const showBulkDeleteDialog = ref(false);

// Get selected mods
const selectedMods = computed(() => {
    return installedMods.value.filter(mod => selectedModIds.value.has(mod.id));
});

// Bulk delete selected mods
async function confirmBulkDelete() {
    showBulkDeleteDialog.value = true;
}

async function executeBulkDelete() {
    const modsToDelete = selectedMods.value;
    let successCount = 0;
    let failCount = 0;

    for (const mod of modsToDelete) {
        try {
            await removeMod(mod.id);
            successCount++;
        } catch (err) {
            log.error(`Failed to delete mod ${mod.name}:`, err);
            failCount++;
        }
    }

    showBulkDeleteDialog.value = false;
    clearSelection();
    await refreshMods();

    if (failCount === 0) {
        toast.success(`Deleted ${successCount} mod(s)`);
    } else {
        toast.warning(`Deleted ${successCount} mod(s), ${failCount} failed`);
    }
}

// Bulk enable selected mods (only toggles currently disabled mods)
async function bulkEnableMods() {
    const modsToEnable = selectedMods.value.filter(mod => mod.isDisabled);
    let successCount = 0;

    for (const mod of modsToEnable) {
        try {
            await toggleMod(mod.id);
            successCount++;
        } catch (err) {
            log.error(`Failed to enable mod ${mod.name}:`, err);
        }
    }

    await refreshMods();
    if (successCount > 0) {
        toast.success(`Enabled ${successCount} mod(s)`);
    } else {
        toast.info("All selected mods are already enabled");
    }
}

// Bulk disable selected mods (only toggles currently enabled mods)
async function bulkDisableMods() {
    const modsToDisable = selectedMods.value.filter(mod => !mod.isDisabled);
    let successCount = 0;

    for (const mod of modsToDisable) {
        try {
            await toggleMod(mod.id);
            successCount++;
        } catch (err) {
            log.error(`Failed to disable mod ${mod.name}:`, err);
        }
    }

    await refreshMods();
    if (successCount > 0) {
        toast.success(`Disabled ${successCount} mod(s)`);
    } else {
        toast.info("All selected mods are already disabled");
    }
}

// Clear filters
function clearFilters() {
    searchQuery.value = "";
    filterEnabled.value = "all";
}

// ==================== UPDATE CHECKING ====================

// Computed: number of updates available
const updatesAvailableCount = computed(() => Object.keys(updateAvailable.value).length);

// Check if a mod has an update
function hasUpdate(modId: string): boolean {
    return !!updateAvailable.value[modId];
}

// Check if a mod is being checked for updates
function isCheckingUpdate(modId: string): boolean {
    return !!checkingModUpdates.value[modId];
}

// Check if a mod is currently updating
function isUpdating(modId: string): boolean {
    return updatingMods.value.has(modId);
}

// Check a single mod for updates
async function checkModUpdate(mod: HytaleMod): Promise<void> {
    if (!mod.cfProjectId || !mod.cfFileId) return;
    if (checkingModUpdates.value[mod.id]) return;

    checkingModUpdates.value[mod.id] = true;
    try {
        const files = await window.api.curseforge.getModFiles(mod.cfProjectId);
        if (files && files.length > 0) {
            const latest = files[0]; // Files sorted by date, newest first
            if (latest.id > mod.cfFileId) {
                updateAvailable.value[mod.id] = {
                    modId: mod.id,
                    projectId: mod.cfProjectId,
                    projectName: mod.name,
                    currentFileId: mod.cfFileId,
                    latestFileId: latest.id,
                    latestVersion: latest.displayName || latest.fileName,
                };
                toast.info("Update Found", `${mod.name} has an update available`);
            } else {
                toast.success("Up to Date", `${mod.name} is on the latest version`);
            }
        }
    } catch (err) {
        log.error(`Failed to check update for ${mod.name}:`, err);
        toast.error("Check Failed", `Couldn't check updates for ${mod.name}`);
    } finally {
        checkingModUpdates.value[mod.id] = false;
    }
}

// Check all mods for updates
async function checkAllUpdates(): Promise<void> {
    if (isCheckingAllUpdates.value) return;

    isCheckingAllUpdates.value = true;
    updateAvailable.value = {};

    try {
        // Get all mods that have CurseForge IDs
        const modsToCheck = installedMods.value.filter(m => m.cfProjectId && m.cfFileId);

        if (modsToCheck.length === 0) {
            toast.info("No mods to check", "No mods have CurseForge metadata");
            return;
        }

        // Process in batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < modsToCheck.length; i += BATCH_SIZE) {
            const batch = modsToCheck.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (mod) => {
                checkingModUpdates.value[mod.id] = true;
                try {
                    const files = await window.api.curseforge.getModFiles(mod.cfProjectId!);
                    if (files && files.length > 0) {
                        const latest = files[0];
                        if (latest.id > mod.cfFileId!) {
                            updateAvailable.value[mod.id] = {
                                modId: mod.id,
                                projectId: mod.cfProjectId!,
                                projectName: mod.name,
                                currentFileId: mod.cfFileId!,
                                latestFileId: latest.id,
                                latestVersion: latest.displayName || latest.fileName,
                            };
                        }
                    }
                } catch (err) {
                    log.error(`Failed to check update for ${mod.name}:`, err);
                } finally {
                    checkingModUpdates.value[mod.id] = false;
                }
            }));
        }

        const updateCount = Object.keys(updateAvailable.value).length;
        if (updateCount > 0) {
            toast.info("Updates Available", `${updateCount} mod(s) can be updated`);
        } else {
            toast.success("All Up to Date", "All mods are on the latest version");
        }
    } catch (err) {
        log.error("Failed to check updates:", err);
        toast.error("Check Failed", "Couldn't check for updates");
    } finally {
        isCheckingAllUpdates.value = false;
    }
}

// Apply update to a single mod
async function applyModUpdate(mod: HytaleMod): Promise<void> {
    const update = updateAvailable.value[mod.id];
    if (!update) return;

    updatingMods.value.add(mod.id);
    try {
        const result = await window.api.hytale.applyUpdate(mod.id, update.latestFileId);
        if (result.success) {
            delete updateAvailable.value[mod.id];
            await refreshMods();
            toast.success("Updated", `${mod.name} has been updated`);
        } else {
            toast.error("Update Failed", result.error || "Unknown error");
        }
    } catch (err) {
        log.error("Update failed:", err);
        toast.error("Update Failed", (err as Error).message);
    } finally {
        updatingMods.value.delete(mod.id);
    }
}

// Update all mods with available updates
async function updateAllMods(): Promise<void> {
    const updates = Object.values(updateAvailable.value);
    if (updates.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
        const mod = installedMods.value.find(m => m.id === update.modId);
        if (!mod) continue;

        updatingMods.value.add(update.modId);
        try {
            const result = await window.api.hytale.applyUpdate(update.modId, update.latestFileId);
            if (result.success) {
                delete updateAvailable.value[update.modId];
                successCount++;
            } else {
                failCount++;
            }
        } catch (err) {
            log.error(`Failed to update ${update.projectName}:`, err);
            failCount++;
        } finally {
            updatingMods.value.delete(update.modId);
        }
    }

    await refreshMods();

    if (successCount > 0 && failCount === 0) {
        toast.success("All Updated", `${successCount} mod(s) updated successfully`);
    } else if (successCount > 0) {
        toast.warning("Partial Update", `${successCount} updated, ${failCount} failed`);
    } else {
        toast.error("Update Failed", "Couldn't update any mods");
    }
}
</script>

<template>
    <div class="hytale-mods-view-container">
        <!-- Mod Details Modal (fullscreen overlay) -->
        <HytaleModDetailsModal :mod="selectedMod" :open="showModDetailsModal" @close="showModDetailsModal = false"
            @toggle-enabled="handleToggleMod" @delete="handleDeleteMod" @open-folder="handleOpenModFolder" />

        <div class="hytale-mods-view">
            <!-- Header -->
            <header class="view-header">
                <div class="header-left">
                    <div>
                        <h1 class="header-title">My Mods</h1>
                        <p class="header-subtitle">Manage your installed Hytale mods</p>
                    </div>
                </div>
                <div class="header-actions">
                    <!-- Update buttons -->
                    <Button v-if="updatesAvailableCount > 0" variant="outline" size="sm" @click="updateAllMods"
                        class="update-all-btn">
                        <Icon name="Download" class="w-4 h-4 mr-2" />
                        Update All ({{ updatesAvailableCount }})
                    </Button>
                    <Button variant="outline" size="sm" @click="checkAllUpdates"
                        :disabled="isCheckingAllUpdates || !isInstalled">
                        <Icon name="RefreshCw" :class="`w-4 h-4 mr-2 ${isCheckingAllUpdates ? 'animate-spin' : ''}`" />
                        {{ isCheckingAllUpdates ? "Checking..." : "Check Updates" }}
                    </Button>

                    <Button variant="outline" size="sm" @click="openModsFolder" :disabled="!isInstalled">
                        <Icon name="FolderOpen" class="w-4 h-4 mr-2" />
                        Open Folder
                    </Button>
                    <Button variant="outline" size="sm" @click="goToSearch">
                        <Icon name="Search" class="w-4 h-4 mr-2" />
                        Browse Mods
                    </Button>
                    <Button @click="handleLaunch" :disabled="isLaunching || !isInstalled" size="sm">
                        <Icon name="Play" :class="`w-4 h-4 mr-2 ${isLaunching ? 'animate-pulse' : ''}`" />
                        {{ isLaunching ? "Launching..." : "Play" }}
                    </Button>
                </div>
            </header>

            <!-- Not Installed Warning -->
            <div v-if="!isInstalled && isInitialized" class="not-installed-warning">
                <Icon name="AlertCircle" class="w-8 h-8 text-warning shrink-0" />
                <div class="flex-1">
                    <p class="font-medium text-foreground">Hytale Not Detected</p>
                    <p class="text-sm text-muted-foreground">
                        Please install Hytale or configure the paths in Settings.
                    </p>
                </div>
                <Button variant="outline" size="sm" @click="router.push('/settings')">
                    <Icon name="Settings" class="w-4 h-4 mr-2" />
                    Settings
                </Button>
            </div>

            <!-- Main Content -->
            <div v-if="isInstalled" class="tab-content">
                <!-- Toolbar -->
                <div class="toolbar">
                    <div class="search-wrapper">
                        <Icon name="Search" class="search-icon" />
                        <Input v-model="searchQuery" placeholder="Search mods..." class="search-input" />
                        <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">
                            <Icon name="X" class="w-4 h-4" />
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
                                <Icon name="Power" class="w-3.5 h-3.5" />
                            </button>
                            <button class="filter-btn filter-disabled" :class="filterEnabled === 'disabled' && 'active'"
                                @click="filterEnabled = 'disabled'">
                                <Icon name="PowerOff" class="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <!-- Sort -->
                        <button class="sort-btn" @click="toggleSort"
                            :title="sortDir === 'asc' ? 'Sort A-Z' : 'Sort Z-A'">
                            <Icon v-if="sortDir === 'asc'" name="SortAsc" class="w-4 h-4" />
                            <Icon v-else name="SortDesc" class="w-4 h-4" />
                        </button>

                        <!-- View toggle -->
                        <div class="view-toggle">
                            <button class="view-btn" :class="viewMode === 'grid' && 'active'"
                                @click="viewMode = 'grid'">
                                <Icon name="Grid3X3" class="w-4 h-4" />
                            </button>
                            <button class="view-btn" :class="viewMode === 'list' && 'active'"
                                @click="viewMode = 'list'">
                                <Icon name="List" class="w-4 h-4" />
                            </button>
                        </div>

                        <!-- Refresh -->
                        <Button variant="outline" size="icon" @click="handleRefresh" :disabled="isRefreshing">
                            <Icon name="RefreshCw" :class="`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`" />
                        </Button>
                    </div>
                </div>

                <!-- Results info + Pagination Controls -->
                <div v-if="!isLoading && filteredMods.length > 0" class="results-bar">
                    <span class="text-xs text-muted-foreground">
                        Showing {{ paginatedMods.length }} of {{ filteredMods.length }} mods
                    </span>
                    <LibraryPaginationControls :current-page="currentPage" :total-pages="totalPages"
                        :items-per-page="itemsPerPage" :items-per-page-options="itemsPerPageOptions"
                        :can-go-prev="canGoPrev" :can-go-next="canGoNext" @update:items-per-page="itemsPerPage = $event"
                        @go-to-page="goToPage" @prev-page="prevPage" @next-page="nextPage" />
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="loading-state">
                    <Icon name="RefreshCw" class="w-8 h-8 animate-spin text-muted-foreground" />
                    <p class="text-muted-foreground mt-2">Loading mods...</p>
                </div>

                <!-- Empty state -->
                <div v-else-if="filteredMods.length === 0" class="empty-state">
                    <Icon name="Package" class="w-16 h-16 text-muted-foreground/30" />
                    <p class="text-muted-foreground mt-4">
                        {{ searchQuery || filterEnabled !== 'all' ? "No mods match your filters" : "No mods installed"
                        }}
                    </p>
                    <div class="empty-actions">
                        <Button v-if="searchQuery || filterEnabled !== 'all'" variant="outline" @click="clearFilters">
                            Clear Filters
                        </Button>
                        <Button variant="outline" @click="goToSearch">
                            <Icon name="Download" class="w-4 h-4 mr-2" />
                            Browse Mods on CurseForge
                        </Button>
                    </div>
                </div>

                <!-- Mods Grid -->
                <div v-else class="mods-grid" :class="viewMode === 'list' && 'list-view'">
                    <HytaleModCard v-for="mod in paginatedMods" :key="mod.id" :mod="mod"
                        :selected="selectedModIds.has(mod.id)" :show-actions="true" :has-update="hasUpdate(mod.id)"
                        :is-checking-update="isCheckingUpdate(mod.id)" :is-updating="isUpdating(mod.id)"
                        :list-view="viewMode === 'list'" @toggle-select="handleToggleSelectMod"
                        @toggle-enabled="handleToggleMod" @delete="handleDeleteMod" @show-details="handleShowModDetails"
                        @check-update="checkModUpdate" @apply-update="applyModUpdate" />
                </div>
            </div>

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

            <!-- Mod Details Modal -->
            <HytaleModDetailsModal :mod="selectedMod" :open="showModDetailsModal" @close="showModDetailsModal = false"
                @toggle-enabled="handleToggleMod" @delete="handleDeleteMod" @refresh="refreshMods" />

            <!-- Bulk Delete Confirmation Dialog -->
            <Dialog :open="showBulkDeleteDialog" @close="showBulkDeleteDialog = false" title="Delete Selected Mods"
                :description="`Are you sure you want to delete ${selectedModIds.size} selected mod(s)? This cannot be undone.`">
                <template #footer>
                    <Button variant="outline" @click="showBulkDeleteDialog = false">
                        Cancel
                    </Button>
                    <Button variant="destructive" @click="executeBulkDelete">
                        Delete All
                    </Button>
                </template>
            </Dialog>
        </div>
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModIds.size > 0" :count="selectedModIds.size" label="mods" @clear="clearSelection">
        <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDelete">
            <Icon name="Trash2" class="w-4 h-4" />
            <span class="hidden sm:inline">Delete</span>
        </Button>
        <Button variant="secondary" size="sm" class="gap-2" @click="bulkEnableMods">
            <Icon name="Power" class="w-4 h-4" />
            <span class="hidden sm:inline">Enable</span>
        </Button>
        <Button variant="secondary" size="sm" class="gap-2" @click="bulkDisableMods">
            <Icon name="PowerOff" class="w-4 h-4" />
            <span class="hidden sm:inline">Disable</span>
        </Button>
    </BulkActionBar>
</template>

<style scoped>
.hytale-mods-view-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.hytale-mods-view {
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
    border-radius: calc(var(--radius) + 4px);
    border: 1px solid hsl(38 92% 50% / 0.3);
    background: hsl(38 92% 50% / 0.1);
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

/* Results bar with pagination */
.results-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
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
    border-radius: calc(var(--radius) - 2px);
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
    border-radius: var(--radius);
    background: hsl(var(--muted) / 0.5);
}

.filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: calc(var(--radius) - 2px);
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
    box-shadow: 0 1px 2px hsl(var(--background) / 0.3);
}

.filter-enabled.active {
    color: hsl(142 76% 46%);
}

.filter-disabled.active {
    color: hsl(var(--muted-foreground));
}

.sort-btn {
    width: 32px;
    height: 32px;
    border-radius: calc(var(--radius) - 2px);
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
    border-radius: var(--radius);
    background: hsl(var(--muted) / 0.5);
}

.view-btn {
    width: 32px;
    height: 32px;
    border-radius: calc(var(--radius) - 2px);
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
</style>
