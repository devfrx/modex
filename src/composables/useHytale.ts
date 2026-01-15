/**
 * useHytale - Composable for Hytale-specific mod management
 * 
 * Provides reactive state and methods for:
 * - Managing mods in Hytale's mods folder
 * - Creating and switching virtual modpacks
 * - Launching the game
 * - Tracking installed mods
 */

import { ref, computed, onMounted } from "vue";
import type { HytaleMod, HytaleModpack, HytaleSyncResult, HytaleStats } from "@/types";

// Reactive state (shared across all component instances)
const installedMods = ref<HytaleMod[]>([]);
const modpacks = ref<HytaleModpack[]>([]);
const activeModpack = ref<HytaleModpack | null>(null);
const config = ref<{ modsPath: string; launcherPath: string } | null>(null);
const stats = ref<HytaleStats | null>(null);
const isLoading = ref(false);
const isInstalled = ref(false);
const isInitialized = ref(false);

// Computed
const enabledMods = computed(() => installedMods.value.filter(m => !m.isDisabled));
const disabledMods = computed(() => installedMods.value.filter(m => m.isDisabled));
const modCount = computed(() => installedMods.value.length);
const modpackCount = computed(() => modpacks.value.length);

/**
 * Initialize Hytale state
 */
async function initialize(): Promise<void> {
  if (isInitialized.value) return;
  
  isLoading.value = true;
  try {
    // Check if installed
    isInstalled.value = await window.api.hytale.isInstalled();
    
    // Load config
    config.value = await window.api.hytale.getConfig();
    
    // Scan installed mods
    installedMods.value = await window.api.hytale.scanMods();
    
    // Load modpacks
    modpacks.value = await window.api.hytale.getModpacks();
    
    // Get active modpack
    activeModpack.value = await window.api.hytale.getActiveModpack();
    
    // Get stats
    stats.value = await window.api.hytale.getStats();
    
    isInitialized.value = true;
    console.log("[useHytale] Initialized:", {
      isInstalled: isInstalled.value,
      modCount: installedMods.value.length,
      modpackCount: modpacks.value.length,
    });
  } catch (error) {
    console.error("[useHytale] Error initializing:", error);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Refresh installed mods from disk
 */
async function refreshMods(): Promise<void> {
  try {
    installedMods.value = await window.api.hytale.scanMods();
    modpacks.value = await window.api.hytale.getModpacks();
    activeModpack.value = await window.api.hytale.getActiveModpack();
    stats.value = await window.api.hytale.getStats();
  } catch (error) {
    console.error("[useHytale] Error refreshing mods:", error);
  }
}

/**
 * Toggle a mod's enabled/disabled state
 */
async function toggleMod(id: string): Promise<boolean> {
  try {
    const result = await window.api.hytale.toggleMod(id);
    if (result) {
      // Update local state reactively by creating new array
      installedMods.value = installedMods.value.map(m => 
        m.id === id ? { ...m, isDisabled: !result.enabled } : m
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error("[useHytale] Error toggling mod:", error);
    return false;
  }
}

/**
 * Remove a mod
 */
async function removeMod(id: string): Promise<boolean> {
  try {
    const success = await window.api.hytale.removeMod(id);
    if (success) {
      installedMods.value = installedMods.value.filter(m => m.id !== id);
      stats.value = await window.api.hytale.getStats();
    }
    return success;
  } catch (error) {
    console.error("[useHytale] Error removing mod:", error);
    return false;
  }
}

/**
 * Install a mod from a downloaded file
 */
async function installMod(
  sourceFilePath: string,
  metadata: {
    id: string;
    name: string;
    version: string;
    cfProjectId?: number;
    cfFileId?: number;
    logoUrl?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await window.api.hytale.installMod(sourceFilePath, metadata);
    if (result.success) {
      await refreshMods();
    }
    return result;
  } catch (error: any) {
    console.error("[useHytale] Error installing mod:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Install a mod from CurseForge by project ID and file ID
 * Note: For Hytale, we need to actually download the file (unlike Minecraft which uses metadata)
 */
async function installFromCurseForge(
  projectId: number,
  fileId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, get mod info from CurseForge
    const mod = await window.api.curseforge.getMod(projectId);
    if (!mod) {
      return { success: false, error: "Mod not found on CurseForge" };
    }

    // Get the specific file
    const files = await window.api.curseforge.getModFiles(projectId);
    const file = files.find(f => f.id === fileId);
    if (!file) {
      return { success: false, error: "File not found on CurseForge" };
    }

    // For Hytale, we need the actual file downloaded (not just metadata)
    // Check if file has a download URL
    const downloadUrl = file.downloadUrl;
    if (!downloadUrl) {
      return { success: false, error: "Download URL not available for this mod" };
    }

    // Download the actual file using Hytale's download handler
    const downloadedPath = await window.api.hytale.downloadModFile(downloadUrl, file.fileName);
    if (!downloadedPath) {
      return { success: false, error: "Failed to download mod file" };
    }

    // Install to Hytale mods folder - include logoUrl from CF
    return await installMod(downloadedPath, {
      id: `cf-${projectId}-${fileId}`,
      name: mod.name,
      version: file.displayName || file.fileName,
      cfProjectId: projectId,
      cfFileId: fileId,
      logoUrl: mod.logo?.url || mod.logo?.thumbnailUrl,
    });
  } catch (error: any) {
    console.error("[useHytale] Error installing from CurseForge:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new modpack from current state
 */
async function createModpack(options: {
  name: string;
  description?: string;
  imageUrl?: string;
  modIds?: string[];
}): Promise<HytaleModpack | null> {
  try {
    const modpack = await window.api.hytale.createModpack(options);
    modpacks.value.push(modpack);
    return modpack;
  } catch (error) {
    console.error("[useHytale] Error creating modpack:", error);
    return null;
  }
}

/**
 * Update a modpack
 */
async function updateModpack(
  id: string,
  updates: Partial<Omit<HytaleModpack, "id" | "createdAt">>
): Promise<HytaleModpack | null> {
  try {
    const updated = await window.api.hytale.updateModpack(id, updates);
    if (updated) {
      const index = modpacks.value.findIndex(p => p.id === id);
      if (index !== -1) {
        modpacks.value[index] = updated;
      }
      if (activeModpack.value?.id === id) {
        activeModpack.value = updated;
      }
    }
    return updated;
  } catch (error) {
    console.error("[useHytale] Error updating modpack:", error);
    return null;
  }
}

/**
 * Delete a modpack
 */
async function deleteModpack(id: string): Promise<boolean> {
  try {
    const success = await window.api.hytale.deleteModpack(id);
    if (success) {
      modpacks.value = modpacks.value.filter(p => p.id !== id);
      if (activeModpack.value?.id === id) {
        activeModpack.value = null;
      }
    }
    return success;
  } catch (error) {
    console.error("[useHytale] Error deleting modpack:", error);
    return false;
  }
}

/**
 * Save current mods state to a modpack
 */
async function saveToModpack(modpackId: string): Promise<boolean> {
  try {
    const success = await window.api.hytale.saveToModpack(modpackId);
    if (success) {
      // Refresh modpacks to get updated folder names
      modpacks.value = await window.api.hytale.getModpacks();
    }
    return success;
  } catch (error) {
    console.error("[useHytale] Error saving to modpack:", error);
    return false;
  }
}

/**
 * Activate a modpack (switch to this mod configuration)
 * Only enables/disables mods that exist in the folder AND the modpack.
 */
async function activateModpack(modpackId: string): Promise<HytaleSyncResult> {
  try {
    const result = await window.api.hytale.activateModpack(modpackId);
    
    if (result.success) {
      // Refresh local state
      activeModpack.value = await window.api.hytale.getActiveModpack();
      await refreshMods();
      
      // Reload modpacks to get updated isActive flags
      modpacks.value = await window.api.hytale.getModpacks();
    }
    
    return result;
  } catch (error: any) {
    console.error("[useHytale] Error activating modpack:", error);
    return {
      success: false,
      installed: 0,
      removed: 0,
      disabled: 0,
      enabled: 0,
      errors: [error.message],
    };
  }
}

/**
 * Launch Hytale
 */
async function launch(): Promise<{ success: boolean; error?: string; pid?: number }> {
  try {
    return await window.api.hytale.launch();
  } catch (error: any) {
    console.error("[useHytale] Error launching:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Open mods folder in file explorer
 */
async function openModsFolder(): Promise<boolean> {
  try {
    return await window.api.hytale.openModsFolder();
  } catch (error) {
    console.error("[useHytale] Error opening mods folder:", error);
    return false;
  }
}

/**
 * Update configuration
 */
async function setConfig(newConfig: { modsPath?: string; launcherPath?: string }): Promise<void> {
  try {
    await window.api.hytale.setConfig(newConfig);
    config.value = await window.api.hytale.getConfig();
  } catch (error) {
    console.error("[useHytale] Error setting config:", error);
  }
}

export function useHytale() {
  // Initialize on first use if in Hytale mode
  // (Initialization should be triggered explicitly by components that need it)

  return {
    // State
    installedMods,
    modpacks,
    activeModpack,
    config,
    stats,
    isLoading,
    isInstalled,
    isInitialized,
    
    // Computed
    enabledMods,
    disabledMods,
    modCount,
    modpackCount,
    
    // Methods
    initialize,
    refreshMods,
    toggleMod,
    removeMod,
    installMod,
    installFromCurseForge,
    createModpack,
    updateModpack,
    deleteModpack,
    saveToModpack,
    activateModpack,
    launch,
    openModsFolder,
    setConfig,
  };
}
