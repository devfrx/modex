<script setup lang="ts">
/**
 * HytaleModpacksView - View for managing Hytale virtual modpacks
 * 
 * Separated from HytaleView for better organization
 * 
 * Features:
 * - Card-based modpack display
 * - Create, activate, save, delete modpacks
 * - Fullscreen modpack editor (via route)
 */

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useHytale } from "@/composables/useHytale";
import { useToast } from "@/composables/useToast";
import type { HytaleMod, HytaleModpack } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import HytaleModpackCard from "@/components/hytale/HytaleModpackCard.vue";
import { createLogger } from "@/utils/logger";

const log = createLogger("HytaleModpacksView");
const router = useRouter();
const toast = useToast();

const {
    modpacks,
    activeModpack,
    isLoading,
    isInstalled,
    isInitialized,
    enabledMods,
    modpackCount,
    initialize,
    refreshMods,
    createModpack,
    deleteModpack,
    saveToModpack,
    activateModpack,
    launch,
} = useHytale();

// Local state
const isLaunching = ref(false);
const isSavingToModpack = ref(false);
const showCreateModpackDialog = ref(false);
const showDeleteModpackConfirmDialog = ref(false);
const modpackToDelete = ref<HytaleModpack | null>(null);
const newModpackName = ref("");

// Missing mods state
const showMissingModsDialog = ref(false);
const missingModsList = ref<string[]>([]);
const newModsList = ref<string[]>([]);
const newModpackDescription = ref("");

// Selected modpacks (for bulk operations)
const selectedModpackIds = ref<Set<string>>(new Set());

// Initialize on mount
onMounted(async () => {
    await initialize();
});

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

        // Show missing mods dialog if there are any
        if (result.missingMods?.length || result.newMods?.length) {
            missingModsList.value = result.missingMods || [];
            newModsList.value = result.newMods || [];
            showMissingModsDialog.value = true;
            message += `. ${result.missingMods?.length || 0} mod(s) not found.`;
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

// ==================== BULK ACTIONS ====================

const showBulkDeleteDialog = ref(false);

// Get selected modpacks
const selectedModpacksList = computed(() => {
    return modpacks.value.filter(mp => selectedModpackIds.value.has(mp.id));
});

// Bulk delete selected modpacks
async function confirmBulkDeleteModpacks() {
    showBulkDeleteDialog.value = true;
}

async function executeBulkDeleteModpacks() {
    const modpacksToDelete = selectedModpacksList.value;
    let successCount = 0;

    for (const modpack of modpacksToDelete) {
        try {
            await deleteModpack(modpack.id);
            successCount++;
        } catch (err) {
            log.error(`Failed to delete modpack ${modpack.name}:`, err);
        }
    }

    showBulkDeleteDialog.value = false;
    clearModpackSelection();
    toast.success(`Deleted ${successCount} modpack(s)`);
}

// Helper: check if modpack is active
function isModpackActive(modpack: HytaleModpack): boolean {
    return modpack.isActive || modpack.id === activeModpack.value?.id;
}
</script>

<template>
    <div class="hytale-modpacks-view-container">
        <div class="hytale-modpacks-view">
            <!-- Header -->
            <header class="view-header">
                <div class="header-left">
                    <div>
                        <h1 class="header-title">My Packs</h1>
                        <p class="header-subtitle">Manage your Hytale virtual modpacks</p>
                    </div>
                </div>
                <div class="header-actions">
                    <Button @click="showCreateModpackDialog = true" variant="outline" size="sm">
                        <Icon name="Plus" class="w-4 h-4 mr-2" />
                        New Modpack
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
                    <p class="text-sm text-muted-foreground flex-1">
                        Virtual modpacks let you save and switch between mod configurations.
                    </p>
                </div>

                <!-- Active Modpack Banner -->
                <div v-if="activeModpack" class="active-modpack-banner">
                    <Icon name="Check" class="w-5 h-5" />
                    <span class="font-medium">Active: {{ activeModpack.name }}</span>
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="loading-state">
                    <Icon name="RefreshCw" class="w-8 h-8 animate-spin text-muted-foreground" />
                    <p class="text-muted-foreground mt-2">Loading modpacks...</p>
                </div>

                <!-- Empty state -->
                <div v-else-if="modpacks.length === 0" class="empty-state">
                    <Icon name="Save" class="w-16 h-16 text-muted-foreground/30" />
                    <p class="text-muted-foreground mt-4">No modpacks created yet</p>
                    <p class="text-xs text-muted-foreground mt-1">
                        Save your current mod setup as a modpack
                    </p>
                    <Button variant="outline" class="mt-4" @click="showCreateModpackDialog = true">
                        <Icon name="Plus" class="w-4 h-4 mr-2" />
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

            <!-- Bulk Delete Confirmation Dialog -->
            <Dialog :open="showBulkDeleteDialog" @close="showBulkDeleteDialog = false" title="Delete Selected Modpacks"
                :description="`Are you sure you want to delete ${selectedModpackIds.size} selected modpack(s)? This won't remove the actual mods.`">
                <template #footer>
                    <Button variant="outline" @click="showBulkDeleteDialog = false">
                        Cancel
                    </Button>
                    <Button variant="destructive" @click="executeBulkDeleteModpacks">
                        Delete All
                    </Button>
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
                            <Icon name="AlertCircle" class="w-4 h-4" />
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
                            <Icon name="AlertCircle" class="w-4 h-4" />
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
        </div>
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModpackIds.size > 0" :count="selectedModpackIds.size" label="modpacks"
        @clear="clearModpackSelection">
        <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDeleteModpacks">
            <Icon name="Trash2" class="w-4 h-4" />
            <span class="hidden sm:inline">Delete</span>
        </Button>
    </BulkActionBar>
</template>

<style scoped>
.hytale-modpacks-view-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.hytale-modpacks-view {
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
    border-radius: calc(var(--radius) + 2px);
    background: hsl(142 76% 36% / 0.1);
    border: 1px solid hsl(142 76% 36% / 0.3);
    color: hsl(142 76% 46%);
}
</style>
