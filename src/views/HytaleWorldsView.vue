<script setup lang="ts">
/**
 * HytaleWorldsView - Per-save mod control for Hytale
 * 
 * Hytale mod management:
 * - Global mods are stored in UserData/Mods/{ModName}/
 * - Each save has a config.json with a "Mods" section: { "ModId": { "Enabled": true/false } }
 * - The mods/ folder in saves contains mod STATE DATA (not the actual mods)
 * 
 * This view allows enabling/disabling global mods per save via config.json.
 */

import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
    Globe,
    ArrowLeft,
    Loader2,
    Package,
    FolderOpen,
    Check,
    X,
    RefreshCw,
    Plus,
    AlertCircle,
    Link,
    ToggleLeft,
    ToggleRight,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { useHytale } from "@/composables/useHytale";
import { useToast } from "@/composables/useToast";
import type { HytaleWorld } from "@/types";

// Use HytaleWorld directly from types
type HytaleSave = HytaleWorld;

const router = useRouter();
const toast = useToast();
const { installedMods, refreshMods, isLoading: isHytaleLoading, config, initialize } = useHytale();

// State
const isLoading = ref(true);
const saves = ref<HytaleSave[]>([]);
const selectedSave = ref<HytaleSave | null>(null);

// Get all available global mods
const allMods = computed(() => installedMods.value);

// Load saves from Hytale
async function loadSaves() {
    isLoading.value = true;
    try {
        // Load saves from Hytale service
        const saveData = await window.api.hytale?.getWorlds?.() || [];
        saves.value = saveData;

        console.log("[HytaleWorlds] Loaded saves:", saves.value);

        // Update selected save if it exists
        if (selectedSave.value) {
            const updated = saves.value.find(s => s.id === selectedSave.value?.id);
            if (updated) {
                selectedSave.value = updated;
            }
        } else if (saves.value.length > 0) {
            selectSave(saves.value[0]);
        }
    } catch (err) {
        console.error("[HytaleWorlds] Error loading saves:", err);
        toast.error("Failed to load saves", "Could not fetch save data");
    } finally {
        isLoading.value = false;
    }
}

// Select a save
function selectSave(save: HytaleSave) {
    selectedSave.value = save;
}

// Check if a global mod is enabled in the current save's config.json
function isModEnabledInSave(modId: string): boolean {
    if (!selectedSave.value) return true; // Default to enabled if no save selected

    // Find the mod to get its hytaleModId as well
    const mod = allMods.value.find(m => m.id === modId);
    const hytaleModId = mod?.hytaleModId;

    // Check both ModEx ID and Hytale mod ID (e.g., "JarHax:EyeSpy")
    // The save's enabledMods/disabledMods may contain either depending on cache state
    const idsToCheck = [modId];
    if (hytaleModId) idsToCheck.push(hytaleModId);

    // If any ID is in enabledMods list, it's enabled
    if (idsToCheck.some(id => selectedSave.value!.enabledMods.includes(id))) return true;

    // If any ID is in disabledMods list, it's disabled
    if (idsToCheck.some(id => selectedSave.value!.disabledMods.includes(id))) return false;

    // If mod is not configured for this save, default to enabled
    return true;
}

// Toggle mod for current save (updates config.json)
async function toggleSaveMod(modId: string) {
    if (!selectedSave.value) return;

    const mod = allMods.value.find(m => m.id === modId);
    if (!mod) return;

    const isEnabled = isModEnabledInSave(modId);

    try {
        const success = await window.api.hytale?.toggleSaveMod?.(
            selectedSave.value.id,
            modId, // Use mod ID, not folder name
            !isEnabled
        );

        if (success) {
            // Refresh the save data
            await loadSaves();
            toast.success(
                isEnabled ? "Mod disabled" : "Mod enabled",
                `${mod.name} ${isEnabled ? "disabled for" : "enabled for"} ${selectedSave.value?.name}`
            );
        }
    } catch (err: any) {
        console.error("[HytaleWorlds] Error toggling mod:", err);
        toast.error("Failed to toggle mod", err.message);
    }
}

// Count mods configured in current save
const saveModCount = computed(() => {
    if (!selectedSave.value) return 0;
    return selectedSave.value.enabledMods.length + selectedSave.value.disabledMods.length;
});

const enabledModCount = computed(() => {
    return selectedSave.value?.enabledMods.length || 0;
});

const totalModCount = computed(() => allMods.value.length);

// Open save folder
async function openSaveFolder() {
    if (selectedSave.value?.id) {
        await window.api.hytale?.openSaveFolder?.(selectedSave.value.id);
    }
}

onMounted(async () => {
    // Ensure Hytale is initialized first
    await initialize();
    // Then refresh mods to get latest from disk
    await refreshMods();
    // Then load the saves
    await loadSaves();
});
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- Header -->
        <div class="border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 py-4">
            <div class="flex items-center gap-4">
                <button @click="router.push('/hytale')" class="p-2 hover:bg-muted rounded-lg transition-colors">
                    <ArrowLeft class="w-5 h-5" />
                </button>
                <div class="flex-1">
                    <h1 class="text-xl font-semibold">Save Mod Configuration</h1>
                    <p class="text-sm text-muted-foreground">
                        Enable or disable mods for each save via config.json
                    </p>
                </div>
                <Button @click="loadSaves" variant="outline" size="sm" :disabled="isLoading">
                    <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
                    Refresh
                </Button>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading || isHytaleLoading" class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-4">
                <Loader2 class="w-12 h-12 text-primary animate-spin" />
                <p class="text-muted-foreground">Loading saves...</p>
            </div>
        </div>

        <!-- No Saves State -->
        <div v-else-if="saves.length === 0" class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-4 text-center px-6">
                <Globe class="w-16 h-16 text-muted-foreground" />
                <h2 class="text-xl font-semibold">No Saves Found</h2>
                <p class="text-muted-foreground max-w-md">
                    No Hytale saves were found. Create a world in Hytale first.
                </p>
            </div>
        </div>

        <!-- Main Content -->
        <div v-else class="flex-1 flex overflow-hidden">
            <!-- Save List Sidebar -->
            <div class="w-64 border-r border-border/50 flex flex-col bg-card/30">
                <div class="p-4 border-b border-border/30">
                    <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Saves
                    </h3>
                </div>
                <div class="flex-1 overflow-y-auto p-2 space-y-1">
                    <button v-for="save in saves" :key="save.id" @click="selectSave(save)"
                        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors" :class="selectedSave?.id === save.id
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'hover:bg-muted'">
                        <Globe class="w-5 h-5 shrink-0" />
                        <div class="flex-1 min-w-0">
                            <p class="font-medium truncate">{{ save.name }}</p>
                            <p class="text-xs text-muted-foreground truncate">
                                {{ save.enabledMods.length }} enabled, {{ save.disabledMods.length }} disabled
                            </p>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Save Configuration -->
            <div v-if="selectedSave" class="flex-1 flex flex-col overflow-hidden">
                <!-- Save Header -->
                <div class="p-4 border-b border-border/30 bg-card/30 flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold flex items-center gap-2">
                            <Globe class="w-5 h-5 text-primary" />
                            {{ selectedSave.name }}
                        </h2>
                        <p class="text-sm text-muted-foreground">
                            {{ enabledModCount }} mods enabled, {{ saveModCount }} configured
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <Button variant="outline" size="sm" @click="openSaveFolder">
                            <FolderOpen class="w-4 h-4 mr-2" />
                            Open Folder
                        </Button>
                    </div>
                </div>

                <!-- Info Banner -->
                <div class="mx-4 mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-3">
                    <ToggleLeft class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div class="text-sm">
                        <p class="font-medium text-foreground">How it works</p>
                        <p class="text-muted-foreground">
                            Toggle mods below to enable/disable them for this save. Settings are stored in the save's
                            <code class="px-1 bg-muted rounded">config.json</code> file.
                        </p>
                    </div>
                </div>

                <!-- Mod List -->
                <div class="flex-1 overflow-y-auto p-4">
                    <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Global Mods
                    </h3>
                    <div class="space-y-2">
                        <div v-for="mod in allMods" :key="mod.id"
                            class="flex items-center gap-4 p-3 bg-card border border-border/50 rounded-lg hover:border-border transition-colors">
                            <!-- Mod Icon -->
                            <div class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                                <Package class="w-5 h-5 text-muted-foreground" />
                            </div>

                            <!-- Mod Info -->
                            <div class="flex-1 min-w-0">
                                <p class="font-medium truncate">{{ mod.name }}</p>
                                <p class="text-xs text-muted-foreground truncate">
                                    {{ mod.folderName || mod.version || 'Unknown' }}
                                </p>
                            </div>

                            <!-- Status -->
                            <span :class="isModEnabledInSave(mod.id) ? 'text-green-500' : 'text-muted-foreground'"
                                class="text-xs flex items-center gap-1">
                                <ToggleRight v-if="isModEnabledInSave(mod.id)" class="w-3 h-3" />
                                <ToggleLeft v-else class="w-3 h-3" />
                                {{ isModEnabledInSave(mod.id) ? 'Enabled' : 'Disabled' }}
                            </span>

                            <!-- Toggle -->
                            <button @click="toggleSaveMod(mod.id)"
                                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                                :class="isModEnabledInSave(mod.id) ? 'bg-primary' : 'bg-muted'">
                                <span
                                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm"
                                    :class="isModEnabledInSave(mod.id) ? 'translate-x-6' : 'translate-x-1'" />
                            </button>
                        </div>
                    </div>

                    <!-- Empty Mods Hint -->
                    <div v-if="allMods.length === 0" class="text-center py-12 text-muted-foreground">
                        <Package class="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No mods installed in global folder</p>
                        <Button class="mt-4" @click="router.push('/hytale/browse')">
                            Browse Mods
                        </Button>
                    </div>
                </div>
            </div>

            <!-- No Save Selected -->
            <div v-else class="flex-1 flex items-center justify-center">
                <div class="text-center text-muted-foreground">
                    <Globe class="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a save to manage mods</p>
                </div>
            </div>
        </div>
    </div>
</template>
