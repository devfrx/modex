<script setup lang="ts">
/**
 * HytaleModpackEditorView - Full-screen view for editing Hytale modpacks
 * Similar to Minecraft's ModpackEditorView
 */
import { computed, ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import { useHytale } from "@/composables/useHytale";
import type { HytaleModpack, HytaleMod } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import HytaleModCard from "@/components/hytale/HytaleModCard.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const {
    installedMods,
    refreshMods,
    activateModpack,
    saveToModpack,
    deleteModpack,
} = useHytale();

// Route param
const modpackId = computed(() => route.params.id as string);

// State
const modpack = ref<HytaleModpack | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const searchQuery = ref("");
const showAddModDialog = ref(false);
const showDeleteConfirm = ref(false);
const showDuplicateDialog = ref(false);
const duplicateName = ref("");
const filterEnabled = ref<"all" | "enabled" | "disabled">("all");

// Missing mods state
const showMissingModsDialog = ref(false);
const missingModsList = ref<string[]>([]);
const newModsList = ref<string[]>([]);

// Update checking state
interface UpdateInfo {
    modId: string;
    projectId: number;
    projectName: string;
    currentFileId: number;
    latestFileId: number;
    latestVersion: string;
}
const isCheckingUpdates = ref(false);
const checkingModUpdates = ref<Record<string, boolean>>({});
const updateAvailable = ref<Record<string, UpdateInfo>>({});
const updatingMods = ref<Set<string>>(new Set());

// Comparison state
const comparison = ref<{
    matching: Array<{ name: string; enabled: boolean }>;
    different: Array<{ name: string; currentEnabled: boolean; modpackEnabled: boolean }>;
    missingFromFolder: Array<{ name: string; enabled: boolean }>;
    newInFolder: Array<{ name: string; enabled: boolean }>;
} | null>(null);

// Computed
const modpackMods = computed(() => modpack.value?.mods || []);

const filteredMods = computed(() => {
    let mods = modpackMods.value;

    // Filter by search
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        mods = mods.filter(m =>
            m.name.toLowerCase().includes(query) ||
            m.modId.toLowerCase().includes(query)
        );
    }

    // Filter by enabled state
    if (filterEnabled.value === "enabled") {
        mods = mods.filter(m => m.enabled);
    } else if (filterEnabled.value === "disabled") {
        mods = mods.filter(m => !m.enabled);
    }

    return mods;
});

const enabledCount = computed(() => modpackMods.value.filter(m => m.enabled).length);
const disabledCount = computed(() => modpackMods.value.filter(m => !m.enabled).length);
const totalCount = computed(() => modpackMods.value.length);

// Update counts
const updatesAvailableCount = computed(() => Object.keys(updateAvailable.value).length);
const isAnyUpdateInProgress = computed(() => updatingMods.value.size > 0);

// Mods available to add
const availableToAdd = computed(() => {
    const modpackModIds = new Set(modpackMods.value.map(m => m.modId));
    return installedMods.value.filter(m => !modpackModIds.has(m.id));
});

// Has differences from current folder state
const hasDifferences = computed(() => {
    if (!comparison.value) return false;
    return comparison.value.different.length > 0 ||
        comparison.value.missingFromFolder.length > 0 ||
        comparison.value.newInFolder.length > 0;
});

// Load modpack data
async function loadModpack() {
    if (!modpackId.value) return;

    isLoading.value = true;
    try {
        const data = await window.api.hytale.getModpack(modpackId.value);
        if (data) {
            modpack.value = data;
            await loadComparison();
        } else {
            toast.error("Modpack not found", "The modpack could not be loaded");
            goBack();
        }
    } catch (err) {
        console.error("[HytaleModpackEditorView] Error loading modpack:", err);
        toast.error("Error", "Failed to load modpack");
        goBack();
    } finally {
        isLoading.value = false;
    }
}

async function loadComparison() {
    if (!modpackId.value) return;
    try {
        comparison.value = await window.api.hytale.compareWithModpack(modpackId.value);
    } catch (err) {
        console.error("[HytaleModpackEditorView] Error loading comparison:", err);
    }
}

// Navigation
function goBack() {
    router.push("/hytale");
}

// Toggle mod enabled state
async function handleToggleMod(modId: string) {
    if (!modpack.value) return;

    await window.api.hytale.toggleModInModpack(modpack.value.id, modId);
    const updated = await window.api.hytale.getModpack(modpack.value.id);
    if (updated) {
        modpack.value = updated;
        await loadComparison();
    }
}

// Add mod to modpack
async function handleAddMod(mod: HytaleMod) {
    if (!modpack.value) return;

    await window.api.hytale.addModToModpack(modpack.value.id, mod.id);
    const updated = await window.api.hytale.getModpack(modpack.value.id);
    if (updated) {
        modpack.value = updated;
        toast.success("Mod Added", `${mod.name} added to modpack`);
        await loadComparison();
    }
    showAddModDialog.value = false;
}

// Remove mod from modpack
async function handleRemoveMod(modId: string) {
    if (!modpack.value) return;

    await window.api.hytale.removeModFromModpack(modpack.value.id, modId);
    const updated = await window.api.hytale.getModpack(modpack.value.id);
    if (updated) {
        modpack.value = updated;
        toast.success("Mod Removed", "Mod removed from modpack");
        await loadComparison();
    }
}

// Activate modpack
async function handleActivate() {
    if (!modpack.value) return;

    const result = await activateModpack(modpack.value.id);
    if (result.success) {
        let message = `Enabled: ${result.enabled}, Disabled: ${result.disabled}`;

        // Show missing mods dialog if there are any
        if (result.missingMods?.length || result.newMods?.length) {
            missingModsList.value = result.missingMods || [];
            newModsList.value = result.newMods || [];
            showMissingModsDialog.value = true;
            message += `. ${result.missingMods?.length || 0} mod(s) not found.`;
        }

        toast.success("Modpack Activated", message);
        await refreshMods();
        await loadComparison();
    } else if (result.errors?.length) {
        toast.error("Activation Failed", result.errors.join("\n"));
    }
}

// Save current state to modpack
async function handleSave() {
    if (!modpack.value) return;

    isSaving.value = true;
    try {
        const success = await saveToModpack(modpack.value.id);
        if (success) {
            toast.success("Saved", "Current state saved to modpack");
            await loadModpack();
        } else {
            toast.error("Save Failed", "Failed to save to modpack");
        }
    } finally {
        isSaving.value = false;
    }
}

// Duplicate modpack
async function handleDuplicate() {
    if (!modpack.value || !duplicateName.value.trim()) return;

    const duplicate = await window.api.hytale.duplicateModpack(modpack.value.id, duplicateName.value.trim());
    if (duplicate) {
        toast.success("Duplicated", `Created ${duplicate.name}`);
        router.push(`/hytale/modpack/${duplicate.id}`);
    }
    showDuplicateDialog.value = false;
    duplicateName.value = "";
}

// Delete modpack
async function handleDelete() {
    if (!modpack.value) return;

    await deleteModpack(modpack.value.id);
    toast.success("Deleted", `${modpack.value.name} has been deleted`);
    goBack();
}

function openDuplicateDialog() {
    duplicateName.value = `${modpack.value?.name} (Copy)`;
    showDuplicateDialog.value = true;
}

// Find installed mod by modId
function findInstalledMod(modId: string): HytaleMod | undefined {
    return installedMods.value.find(m => m.id === modId);
}

// ==================== UPDATE CHECKING ====================

// Check a single mod for updates
async function checkModUpdate(modId: string): Promise<void> {
    const installedMod = findInstalledMod(modId);
    if (!installedMod?.cfProjectId || !installedMod?.cfFileId) return;
    if (checkingModUpdates.value[modId]) return;

    checkingModUpdates.value[modId] = true;
    try {
        // Use the existing hytale update API to check for a specific mod
        const latestFile = await window.api.curseforge.getModFiles(installedMod.cfProjectId);
        if (latestFile && latestFile.length > 0) {
            const latest = latestFile[0]; // Files are sorted by date, newest first
            if (latest.id > installedMod.cfFileId) {
                updateAvailable.value[modId] = {
                    modId,
                    projectId: installedMod.cfProjectId,
                    projectName: installedMod.name,
                    currentFileId: installedMod.cfFileId,
                    latestFileId: latest.id,
                    latestVersion: latest.displayName || latest.fileName,
                };
            }
        }
    } catch (err) {
        console.error(`Failed to check update for ${modId}:`, err);
    } finally {
        checkingModUpdates.value[modId] = false;
    }
}

// Check all mods in modpack for updates
async function checkAllUpdates(): Promise<void> {
    if (isCheckingUpdates.value) return;

    isCheckingUpdates.value = true;
    updateAvailable.value = {};

    try {
        // Get all mods in modpack that have CurseForge IDs
        const modsToCheck = modpackMods.value
            .map(m => findInstalledMod(m.modId))
            .filter((m): m is HytaleMod => !!m?.cfProjectId && !!m?.cfFileId);

        if (modsToCheck.length === 0) {
            toast.info("No mods to check", "No mods have CurseForge metadata");
            return;
        }

        // Process in batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < modsToCheck.length; i += BATCH_SIZE) {
            const batch = modsToCheck.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(mod => checkModUpdate(mod.id)));
        }

        const updateCount = Object.keys(updateAvailable.value).length;
        if (updateCount > 0) {
            toast.info("Updates Available", `${updateCount} mod(s) can be updated`);
        } else {
            toast.success("All Up to Date", "All mods are on the latest version");
        }
    } catch (err) {
        console.error("Failed to check updates:", err);
        toast.error("Check Failed", "Couldn't check for updates");
    } finally {
        isCheckingUpdates.value = false;
    }
}

// Apply update to a single mod
async function applyUpdate(modId: string): Promise<void> {
    const update = updateAvailable.value[modId];
    if (!update) return;

    updatingMods.value.add(modId);
    try {
        const result = await window.api.hytale.applyUpdate(modId, update.latestFileId);
        if (result.success) {
            delete updateAvailable.value[modId];
            await refreshMods();
            toast.success("Updated", `${update.projectName} has been updated`);
        } else {
            toast.error("Update Failed", result.error || "Unknown error");
        }
    } catch (err) {
        console.error("Update failed:", err);
        toast.error("Update Failed", (err as Error).message);
    } finally {
        updatingMods.value.delete(modId);
    }
}

// Update all mods with available updates
async function updateAllMods(): Promise<void> {
    const updates = Object.values(updateAvailable.value);
    if (updates.length === 0) return;

    let successCount = 0;
    let failCount = 0;

    for (const update of updates) {
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
            console.error(`Failed to update ${update.projectName}:`, err);
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

// Check if a mod has an update available
function hasUpdate(modId: string): boolean {
    return !!updateAvailable.value[modId];
}

// Check if a mod is currently being updated
function isUpdating(modId: string): boolean {
    return updatingMods.value.has(modId);
}

// Mount
onMounted(async () => {
    await refreshMods();
    await loadModpack();
});

watch(() => route.params.id, async () => {
    await loadModpack();
});
</script>

<template>
    <div class="hytale-modpack-editor-view">
        <!-- Header -->
        <header class="editor-header">
            <div class="header-left">
                <button class="back-btn" @click="goBack">
                    <Icon name="ArrowLeft" class="w-5 h-5" />
                </button>
                <div v-if="modpack" class="header-info">
                    <h1 class="header-title">{{ modpack.name }}</h1>
                    <p v-if="modpack.description" class="header-description">{{ modpack.description }}</p>
                </div>
            </div>

            <div class="header-actions">
                <Button variant="outline" size="sm" @click="openDuplicateDialog">
                    <Icon name="Copy" class="w-4 h-4 mr-2" />
                    Duplicate
                </Button>
                <Button variant="outline" size="sm" @click="handleSave" :disabled="isSaving">
                    <Icon name="Save" :class="`w-4 h-4 mr-2 ${isSaving ? 'animate-pulse' : ''}`" />
                    Save Current
                </Button>
                <Button size="sm" @click="handleActivate">
                    <Icon name="Play" class="w-4 h-4 mr-2" />
                    Activate
                </Button>
            </div>
        </header>

        <!-- Loading -->
        <div v-if="isLoading" class="loading-state">
            <Icon name="RefreshCw" class="w-8 h-8 animate-spin text-muted-foreground" />
            <p class="text-muted-foreground mt-2">Loading modpack...</p>
        </div>

        <!-- Content -->
        <div v-else-if="modpack" class="editor-content">
            <!-- Stats Bar -->
            <div class="stats-bar">
                <div class="stats-left">
                    <div class="stat">
                        <Icon name="Package" class="w-4 h-4" />
                        <span class="stat-value">{{ totalCount }}</span>
                        <span class="stat-label">mods</span>
                    </div>
                    <div class="stat stat-enabled">
                        <Icon name="Power" class="w-4 h-4" />
                        <span class="stat-value">{{ enabledCount }}</span>
                        <span class="stat-label">enabled</span>
                    </div>
                    <div class="stat stat-disabled">
                        <Icon name="PowerOff" class="w-4 h-4" />
                        <span class="stat-value">{{ disabledCount }}</span>
                        <span class="stat-label">disabled</span>
                    </div>
                </div>

                <div class="stats-actions">
                    <!-- Check Updates Button -->
                    <button @click="checkAllUpdates" :disabled="isCheckingUpdates || totalCount === 0"
                        class="update-check-btn" :class="{ 'is-checking': isCheckingUpdates }">
                        <Icon name="RefreshCw" :class="`w-4 h-4 ${isCheckingUpdates ? 'animate-spin' : ''}`" />
                        <span>{{ isCheckingUpdates ? 'Checking...' : 'Check Updates' }}</span>
                    </button>

                    <!-- Update All Button (only when updates available) -->
                    <button v-if="updatesAvailableCount > 0" @click="updateAllMods" :disabled="isAnyUpdateInProgress"
                        class="update-all-btn">
                        <Icon name="ArrowUpCircle" class="w-4 h-4" />
                        <span>Update All ({{ updatesAvailableCount }})</span>
                    </button>

                    <Button variant="ghost" size="sm" @click="showAddModDialog = true"
                        :disabled="availableToAdd.length === 0">
                        <Icon name="Plus" class="w-4 h-4 mr-1" />
                        Add Mod
                    </Button>
                </div>
            </div>

            <!-- Comparison Warnings -->
            <div v-if="comparison && hasDifferences" class="warnings-section">
                <div v-if="comparison.missingFromFolder.length > 0" class="warning-card warning-missing">
                    <Icon name="AlertTriangle" class="w-5 h-5" />
                    <div class="warning-content">
                        <span class="warning-title">{{ comparison.missingFromFolder.length }} mod(s) not
                            installed</span>
                        <span class="warning-mods">{{comparison.missingFromFolder.map(m => m.name).join(", ")}}</span>
                    </div>
                </div>

                <div v-if="comparison.different.length > 0" class="warning-card warning-different">
                    <Icon name="RefreshCw" class="w-5 h-5" />
                    <div class="warning-content">
                        <span class="warning-title">{{ comparison.different.length }} mod(s) with different state</span>
                        <span class="warning-mods">Will be changed when activated</span>
                    </div>
                </div>

                <div v-if="comparison.newInFolder.length > 0" class="warning-card warning-new">
                    <Icon name="Plus" class="w-5 h-5" />
                    <div class="warning-content">
                        <span class="warning-title">{{ comparison.newInFolder.length }} new mod(s) in folder</span>
                        <span class="warning-mods">Not tracked by this modpack</span>
                    </div>
                </div>
            </div>

            <!-- Search & Filter Bar -->
            <div class="filter-bar">
                <div class="search-wrapper">
                    <Icon name="Search" class="search-icon" />
                    <Input v-model="searchQuery" placeholder="Search mods..." class="search-input" />
                    <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">
                        <Icon name="X" class="w-4 h-4" />
                    </button>
                </div>

                <div class="filter-buttons">
                    <button class="filter-btn" :class="filterEnabled === 'all' && 'active'"
                        @click="filterEnabled = 'all'">
                        All
                    </button>
                    <button class="filter-btn filter-enabled" :class="filterEnabled === 'enabled' && 'active'"
                        @click="filterEnabled = 'enabled'">
                        <Icon name="Power" class="w-3.5 h-3.5" />
                        Enabled
                    </button>
                    <button class="filter-btn filter-disabled" :class="filterEnabled === 'disabled' && 'active'"
                        @click="filterEnabled = 'disabled'">
                        <Icon name="PowerOff" class="w-3.5 h-3.5" />
                        Disabled
                    </button>
                </div>
            </div>

            <!-- Mods Grid -->
            <div v-if="filteredMods.length === 0" class="empty-state">
                <Icon name="Package" class="w-12 h-12 text-muted-foreground" />
                <p class="text-muted-foreground mt-2">
                    {{ searchQuery ? "No mods match your search" : "No mods in this modpack" }}
                </p>
                <Button v-if="!searchQuery" variant="outline" class="mt-4" @click="showAddModDialog = true">
                    <Icon name="Plus" class="w-4 h-4 mr-2" />
                    Add Mods
                </Button>
            </div>

            <div v-else class="mods-grid">
                <div v-for="mod in filteredMods" :key="mod.modId" class="mod-item"
                    :class="{ 'is-disabled': !mod.enabled, 'has-update': hasUpdate(mod.modId) }">
                    <div class="mod-toggle">
                        <button @click="handleToggleMod(mod.modId)" class="toggle-btn"
                            :class="mod.enabled ? 'toggle-on' : 'toggle-off'">
                            <span class="toggle-thumb" />
                        </button>
                    </div>

                    <div class="mod-info">
                        <div class="mod-name-row">
                            <span class="mod-name">{{ mod.name }}</span>
                            <!-- Update indicator -->
                            <span v-if="hasUpdate(mod.modId)" class="update-badge" title="Update available">
                                <Icon name="ArrowUpCircle" class="w-3.5 h-3.5" />
                            </span>
                        </div>
                        <span v-if="mod.version" class="mod-version">v{{ mod.version }}</span>
                    </div>

                    <div class="mod-actions">
                        <!-- Update button (when update available) -->
                        <button v-if="hasUpdate(mod.modId)" class="mod-update" @click="applyUpdate(mod.modId)"
                            :disabled="isUpdating(mod.modId)" title="Update to latest version">
                            <Icon v-if="!isUpdating(mod.modId)" name="Download" class="w-4 h-4" />
                            <Icon v-else name="RefreshCw" class="w-4 h-4 animate-spin" />
                        </button>

                        <button class="mod-remove" @click="handleRemoveMod(mod.modId)" title="Remove from modpack">
                            <Icon name="Minus" class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Mod Dialog -->
        <Dialog :open="showAddModDialog" @close="showAddModDialog = false" title="Add Mod to Modpack"
            description="Select mods to add to this modpack" size="lg">
            <div class="add-mod-list">
                <div v-if="availableToAdd.length === 0" class="text-center text-muted-foreground py-8">
                    All installed mods are already in this modpack
                </div>
                <button v-for="mod in availableToAdd" :key="mod.id" @click="handleAddMod(mod)" class="add-mod-item">
                    <Icon name="Package" class="w-5 h-5 text-muted-foreground shrink-0" />
                    <div class="add-mod-info">
                        <span class="add-mod-name">{{ mod.name }}</span>
                        <span class="add-mod-folder">{{ mod.folderName }}</span>
                    </div>
                    <Icon name="Plus" class="w-5 h-5 text-primary shrink-0" />
                </button>
            </div>
            <template #footer>
                <Button variant="outline" @click="showAddModDialog = false">Close</Button>
            </template>
        </Dialog>

        <!-- Duplicate Dialog -->
        <Dialog :open="showDuplicateDialog" @close="showDuplicateDialog = false" title="Duplicate Modpack"
            description="Create a copy of this modpack with a new name">
            <div class="space-y-4">
                <div class="space-y-2">
                    <label class="text-sm font-medium">New Name</label>
                    <Input v-model="duplicateName" placeholder="Enter modpack name" @keyup.enter="handleDuplicate" />
                </div>
            </div>
            <template #footer>
                <Button variant="outline" @click="showDuplicateDialog = false">Cancel</Button>
                <Button @click="handleDuplicate" :disabled="!duplicateName.trim()">Duplicate</Button>
            </template>
        </Dialog>

        <!-- Delete Confirm Dialog -->
        <Dialog :open="showDeleteConfirm" @close="showDeleteConfirm = false" title="Delete Modpack"
            :description="`Are you sure you want to delete '${modpack?.name}'? This won't remove the actual mods.`">
            <template #footer>
                <Button variant="outline" @click="showDeleteConfirm = false">Cancel</Button>
                <Button variant="destructive" @click="handleDelete">Delete</Button>
            </template>
        </Dialog>

        <!-- Missing Mods Info Dialog -->
        <Dialog :open="showMissingModsDialog" @close="showMissingModsDialog = false" title="Activation Complete">
            <div class="space-y-4">
                <p class="text-sm text-muted-foreground">
                    The modpack was activated, but some mods may need attention:
                </p>

                <!-- Missing Mods (in modpack but not installed) -->
                <div v-if="missingModsList.length > 0">
                    <h4 class="text-sm font-medium text-destructive mb-2 flex items-center gap-2">
                        <Icon name="AlertTriangle" class="w-4 h-4" />
                        Missing Mods ({{ missingModsList.length }})
                    </h4>
                    <p class="text-xs text-muted-foreground mb-2">
                        These mods are in the modpack but not installed. You may need to download them.
                    </p>
                    <div class="max-h-32 overflow-y-auto bg-muted/50 rounded-lg p-2 space-y-1">
                        <div v-for="modName in missingModsList" :key="modName"
                            class="text-xs px-2 py-1 bg-destructive/10 text-destructive rounded">
                            {{ modName }}
                        </div>
                    </div>
                </div>

                <!-- New Mods (installed but not in modpack) -->
                <div v-if="newModsList.length > 0">
                    <h4 class="text-sm font-medium text-amber-500 mb-2 flex items-center gap-2">
                        <Icon name="AlertTriangle" class="w-4 h-4" />
                        New Mods ({{ newModsList.length }})
                    </h4>
                    <p class="text-xs text-muted-foreground mb-2">
                        These mods were installed after the modpack was created and are not managed by it.
                    </p>
                    <div class="max-h-32 overflow-y-auto bg-muted/50 rounded-lg p-2 space-y-1">
                        <div v-for="modName in newModsList" :key="modName"
                            class="text-xs px-2 py-1 bg-amber-500/10 text-amber-500 rounded">
                            {{ modName }}
                        </div>
                    </div>
                </div>
            </div>
            <template #footer>
                <Button variant="default" @click="showMissingModsDialog = false">
                    Got it
                </Button>
            </template>
        </Dialog>

        <!-- Footer Actions (Delete) -->
        <div v-if="modpack && !isLoading" class="editor-footer">
            <Button variant="outline" size="sm"
                class="text-destructive hover:bg-destructive/10 hover:border-destructive"
                @click="showDeleteConfirm = true">
                <Icon name="Trash2" class="w-4 h-4 mr-2" />
                Delete Modpack
            </Button>
        </div>
    </div>
</template>

<style scoped>
.hytale-modpack-editor-view {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: hsl(var(--background));
}

/* Header */
.editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
}

.header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.back-btn {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    transition: all 0.15s ease;
}

.back-btn:hover {
    background: hsl(var(--muted-foreground) / 0.2);
}

.header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.header-title {
    font-size: 20px;
    font-weight: 700;
    color: hsl(var(--foreground));
}

.header-description {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}

.header-actions {
    display: flex;
    gap: 8px;
}

/* Loading */
.loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

/* Content */
.editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* Stats Bar */
.stats-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-radius: 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
}

.stats-left {
    display: flex;
    gap: 24px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 8px;
    color: hsl(var(--muted-foreground));
}

.stat-value {
    font-size: 18px;
    font-weight: 700;
    color: hsl(var(--foreground));
}

.stat-label {
    font-size: 13px;
}

.stat-enabled {
    color: hsl(142 76% 46%);
}

.stat-enabled .stat-value {
    color: hsl(142 76% 46%);
}

.stat-disabled {
    color: hsl(var(--muted-foreground) / 0.7);
}

.stats-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.update-check-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.update-check-btn:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}

.update-check-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.update-check-btn.is-checking {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}

.update-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.3);
    transition: all 0.15s ease;
}

.update-all-btn:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.25);
}

.update-all-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* Warnings */
.warnings-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.warning-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid;
}

.warning-missing {
    background: hsl(38 92% 50% / 0.1);
    border-color: hsl(38 92% 50% / 0.3);
    color: hsl(38 92% 50%);
}

.warning-different {
    background: hsl(217 91% 60% / 0.1);
    border-color: hsl(217 91% 60% / 0.3);
    color: hsl(217 91% 60%);
}

.warning-new {
    background: hsl(var(--muted));
    border-color: hsl(var(--border));
    color: hsl(var(--muted-foreground));
}

.warning-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.warning-title {
    font-size: 13px;
    font-weight: 600;
}

.warning-mods {
    font-size: 11px;
    opacity: 0.8;
}

/* Filter Bar */
.filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
}

.search-wrapper {
    position: relative;
    flex: 1;
    max-width: 400px;
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

.filter-buttons {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: hsl(var(--muted) / 0.5);
}

.filter-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
}

.filter-btn:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--background) / 0.5);
}

.filter-btn.active {
    color: hsl(var(--foreground));
    background: hsl(var(--background));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-enabled.active {
    color: hsl(142 76% 46%);
}

.filter-disabled.active {
    color: hsl(var(--muted-foreground));
}

/* Empty State */
.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
}

/* Mods Grid */
.mods-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mod-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    transition: all 0.15s ease;
}

.mod-item:hover {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--muted) / 0.3);
}

.mod-item.is-disabled {
    opacity: 0.6;
}

.mod-toggle {
    flex-shrink: 0;
}

.toggle-btn {
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 999px;
    transition: all 0.2s ease;
}

.toggle-on {
    background: hsl(142 76% 36%);
}

.toggle-off {
    background: hsl(var(--muted));
}

.toggle-thumb {
    position: absolute;
    top: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-on .toggle-thumb {
    left: 22px;
}

.toggle-off .toggle-thumb {
    left: 2px;
}

.mod-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mod-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mod-name {
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.update-badge {
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    animation: pulse 2s infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }
}

.mod-version {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    width: fit-content;
}

.mod-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.mod-update {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.1);
    transition: all 0.15s ease;
}

.mod-update:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.2);
}

.mod-update:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.mod-remove {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
    flex-shrink: 0;
}

.mod-remove:hover {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
}

/* Mod item with update available */
.mod-item.has-update {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--primary) / 0.05);
}

/* Add Mod Dialog */
.add-mod-list {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.add-mod-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    transition: all 0.15s ease;
    text-align: left;
}

.add-mod-item:hover {
    background: hsl(var(--muted));
}

.add-mod-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.add-mod-name {
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
}

.add-mod-folder {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}

/* Footer */
.editor-footer {
    padding: 12px 24px;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--card));
}
</style>
