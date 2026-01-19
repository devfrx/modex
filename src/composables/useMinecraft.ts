/**
 * useMinecraft - Composable for Minecraft installation management
 */

import { ref, reactive, computed, onMounted } from "vue";
import type { MinecraftInstallation } from "@/types";

export interface SyncProgress {
  current: number;
  total: number;
  modName: string;
  percentage: number;
}

export function useMinecraft() {
  const installations = ref<MinecraftInstallation[]>([]);
  const isLoading = ref(false);
  const isScanning = ref(false);
  const isSyncing = ref(false);
  const syncProgress = reactive<SyncProgress>({
    current: 0,
    total: 0,
    modName: "",
    percentage: 0
  });

  const defaultInstallation = computed(() => 
    installations.value.find(i => i.isDefault) || installations.value[0]
  );

  const hasInstallations = computed(() => installations.value.length > 0);

  const installationsByType = computed(() => {
    const grouped: Record<string, MinecraftInstallation[]> = {};
    for (const inst of installations.value) {
      if (!grouped[inst.type]) {
        grouped[inst.type] = [];
      }
      grouped[inst.type].push(inst);
    }
    return grouped;
  });

  /**
   * Scan for Minecraft installations
   */
  async function scanInstallations(): Promise<MinecraftInstallation[]> {
    isScanning.value = true;
    try {
      const detected = await window.api.minecraft.detectInstallations();
      installations.value = detected;
      return detected;
    } catch (error) {
      console.error("Failed to scan installations:", error);
      return [];
    } finally {
      isScanning.value = false;
    }
  }

  /**
   * Get cached installations (without rescanning)
   */
  async function getInstallations(): Promise<MinecraftInstallation[]> {
    isLoading.value = true;
    try {
      const result = await window.api.minecraft.getInstallations();
      installations.value = result;
      return result;
    } catch (error) {
      console.error("Failed to get installations:", error);
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Add a custom Minecraft installation
   */
  async function addCustomInstallation(
    name: string,
    mcPath: string,
    modsPath?: string
  ): Promise<MinecraftInstallation | null> {
    try {
      const installation = await window.api.minecraft.addCustom(name, mcPath, modsPath);
      if (installation) {
        installations.value.push(installation);
      }
      return installation;
    } catch (error) {
      console.error("Failed to add custom installation:", error);
      return null;
    }
  }

  /**
   * Remove an installation from the list
   */
  async function removeInstallation(id: string): Promise<boolean> {
    try {
      const success = await window.api.minecraft.remove(id);
      if (success) {
        const index = installations.value.findIndex(i => i.id === id);
        if (index !== -1) {
          installations.value.splice(index, 1);
        }
      }
      return success;
    } catch (error) {
      console.error("Failed to remove installation:", error);
      return false;
    }
  }

  /**
   * Set the default installation
   */
  async function setDefault(id: string): Promise<boolean> {
    try {
      const success = await window.api.minecraft.setDefault(id);
      if (success) {
        installations.value.forEach(i => {
          i.isDefault = i.id === id;
        });
      }
      return success;
    } catch (error) {
      console.error("Failed to set default installation:", error);
      return false;
    }
  }

  /**
   * Sync a modpack to an installation
   */
  async function syncModpack(
    installationId: string,
    modpackId: string,
    options?: { clearExisting?: boolean; createBackup?: boolean }
  ): Promise<{
    success: boolean;
    synced: number;
    skipped: number;
    errors: string[];
    syncedMods: string[];
  }> {
    isSyncing.value = true;
    syncProgress.current = 0;
    syncProgress.total = 0;
    syncProgress.modName = "";
    syncProgress.percentage = 0;

    try {
      const result = await window.api.minecraft.syncModpack(
        installationId,
        modpackId,
        options,
        (current: number, total: number, modName: string) => {
          syncProgress.current = current;
          syncProgress.total = total;
          syncProgress.modName = modName;
          syncProgress.percentage = total > 0 ? (current / total) * 100 : 0;
        }
      );
      return result;
    } catch (error: any) {
      return {
        success: false,
        synced: 0,
        skipped: 0,
        errors: [error.message || "Sync failed"],
        syncedMods: []
      };
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Open the mods folder of an installation
   */
  async function openModsFolder(installationId: string): Promise<boolean> {
    try {
      return await window.api.minecraft.openModsFolder(installationId);
    } catch (error) {
      console.error("Failed to open mods folder:", error);
      return false;
    }
  }

  /**
   * Launch Minecraft
   */
  async function launchGame(installationId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.api.minecraft.launch(installationId);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Open folder selection dialog
   */
  async function selectFolder(): Promise<string | null> {
    try {
      return await window.api.minecraft.selectFolder();
    } catch (error) {
      console.error("Failed to select folder:", error);
      return null;
    }
  }

  /**
   * Get display name for launcher type
   */
  function getTypeName(type: MinecraftInstallation["type"]): string {
    const names: Record<string, string> = {
      vanilla: "Vanilla Minecraft",
      prism: "Prism Launcher",
      multimc: "MultiMC",
      curseforge: "CurseForge",
      atlauncher: "ATLauncher",
      gdlauncher: "GDLauncher",
      modrinth: "Modrinth App",
      custom: "Custom"
    };
    return names[type] || type;
  }

  /**
   * Get configured launcher paths
   */
  async function getLauncherPaths(): Promise<Record<string, string>> {
    try {
      return await window.api.minecraft.getLauncherPaths();
    } catch (error) {
      console.error("Failed to get launcher paths:", error);
      return {};
    }
  }

  /**
   * Set launcher path for a specific type
   */
  async function setLauncherPath(type: string, launcherPath: string): Promise<boolean> {
    try {
      return await window.api.minecraft.setLauncherPath(type, launcherPath);
    } catch (error) {
      console.error("Failed to set launcher path:", error);
      return false;
    }
  }

  /**
   * Open file dialog to select a launcher
   */
  async function selectLauncher(): Promise<string | null> {
    try {
      return await window.api.minecraft.selectLauncher();
    } catch (error) {
      console.error("Failed to select launcher:", error);
      return null;
    }
  }

  // Auto-load on mount
  onMounted(() => {
    getInstallations();
  });

  return {
    // State
    installations,
    isLoading,
    isScanning,
    isSyncing,
    syncProgress,
    
    // Computed
    defaultInstallation,
    hasInstallations,
    installationsByType,
    
    // Methods
    scanInstallations,
    getInstallations,
    addCustomInstallation,
    removeInstallation,
    setDefault,
    syncModpack,
    openModsFolder,
    launchGame,
    selectFolder,
    selectLauncher,
    getLauncherPaths,
    setLauncherPath,
    getTypeName
  };
}
