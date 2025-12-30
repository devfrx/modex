/**
 * useInstances - Composable for managing ModEx game instances
 * 
 * Provides reactive state and methods for:
 * - Creating/deleting isolated game instances
 * - Syncing modpacks to instances (mods + configs)
 * - Launching instances with --gameDir
 * - Instance statistics and management
 */

import { ref, computed, onMounted, onUnmounted } from "vue";
import type {
  ModexInstance,
  InstanceSyncResult,
  InstanceLaunchResult,
  InstanceStats,
} from "@/types";

// Running game info interface
export interface RunningGameInfo {
  instanceId: string;
  launcherPid?: number;
  gamePid?: number;
  startTime: number;
  status: "launching" | "loading_mods" | "running" | "stopped";
  loadedMods: number;
  totalMods: number;
  currentMod?: string;
  gameProcessRunning: boolean;
}

// Reactive state
const instances = ref<ModexInstance[]>([]);
const isLoading = ref(false);
const runningGames = ref<Map<string, RunningGameInfo>>(new Map());
const syncProgress = ref<{
  stage: string;
  current: number;
  total: number;
  item?: string;
} | null>(null);

// Computed
const instanceCount = computed(() => instances.value.length);
const readyInstances = computed(() => 
  instances.value.filter(i => i.state === "ready")
);
const installingInstances = computed(() =>
  instances.value.filter(i => i.state === "installing")
);

/**
 * Load all instances from backend
 */
async function loadInstances(): Promise<ModexInstance[]> {
  isLoading.value = true;
  try {
    instances.value = await window.api.instances.getAll();
    return instances.value;
  } catch (error) {
    console.error("[useInstances] Error loading instances:", error);
    return [];
  } finally {
    isLoading.value = false;
  }
}

/**
 * Get a specific instance
 */
async function getInstance(id: string): Promise<ModexInstance | null> {
  return window.api.instances.get(id);
}

/**
 * Get instance associated with a modpack
 */
async function getInstanceByModpack(modpackId: string): Promise<ModexInstance | null> {
  return window.api.instances.getByModpack(modpackId);
}

/**
 * Create a new instance
 */
async function createInstance(options: {
  name: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion?: string;
  modpackId?: string;
  description?: string;
  icon?: string;
  memory?: { min: number; max: number };
  source?: ModexInstance["source"];
}): Promise<ModexInstance> {
  const instance = await window.api.instances.create(options);
  instances.value.unshift(instance);
  return instance;
}

/**
 * Delete an instance
 */
async function deleteInstance(id: string): Promise<boolean> {
  const success = await window.api.instances.delete(id);
  if (success) {
    instances.value = instances.value.filter(i => i.id !== id);
  }
  return success;
}

/**
 * Update instance metadata
 */
async function updateInstance(
  id: string,
  updates: Partial<ModexInstance>
): Promise<ModexInstance | null> {
  const updated = await window.api.instances.update(id, updates);
  if (updated) {
    const index = instances.value.findIndex(i => i.id === id);
    if (index !== -1) {
      instances.value[index] = updated;
    }
  }
  return updated;
}

/**
 * Sync a modpack to an instance (download mods + extract configs)
 */
async function syncModpackToInstance(
  instanceId: string,
  modpackId: string,
  options?: { 
    clearExisting?: boolean; 
    configSyncMode?: "overwrite" | "new_only" | "skip";
    overridesZipPath?: string;
  }
): Promise<InstanceSyncResult> {
  // Update local state to show installing
  const index = instances.value.findIndex(i => i.id === instanceId);
  if (index !== -1) {
    instances.value[index].state = "installing";
  }

  try {
    const result = await window.api.instances.syncModpack(
      instanceId,
      modpackId,
      options
    );

    // Update instance state based on result
    if (index !== -1) {
      instances.value[index].state = result.success ? "ready" : "error";
      instances.value[index].modCount = result.modsDownloaded + result.modsSkipped;
    }

    return result;
  } catch (error: any) {
    if (index !== -1) {
      instances.value[index].state = "error";
    }
    return {
      success: false,
      modsDownloaded: 0,
      modsSkipped: 0,
      configsCopied: 0,
      configsSkipped: 0,
      errors: [error.message],
      warnings: [],
    };
  }
}

/**
 * Launch an instance
 */
async function launchInstance(instanceId: string): Promise<InstanceLaunchResult> {
  const result = await window.api.instances.launch(instanceId);
  
  // Update lastPlayed in local state
  if (result.success) {
    const index = instances.value.findIndex(i => i.id === instanceId);
    if (index !== -1) {
      instances.value[index].lastPlayed = new Date().toISOString();
    }
  }

  return result;
}

/**
 * Open instance folder in file explorer
 */
async function openInstanceFolder(
  instanceId: string,
  subfolder?: string
): Promise<boolean> {
  return window.api.instances.openFolder(instanceId, subfolder);
}

/**
 * Get instance statistics
 */
async function getInstanceStats(instanceId: string): Promise<InstanceStats | null> {
  return window.api.instances.getStats(instanceId);
}

/**
 * Export instance as zip
 */
async function exportInstance(instanceId: string): Promise<boolean> {
  return window.api.instances.export(instanceId);
}

/**
 * Duplicate an instance
 */
async function duplicateInstance(
  instanceId: string,
  newName: string
): Promise<ModexInstance | null> {
  const duplicate = await window.api.instances.duplicate(instanceId, newName);
  if (duplicate) {
    instances.value.unshift(duplicate);
  }
  return duplicate;
}

/**
 * Create instance from modpack and sync all mods
 */
async function createFromModpack(
  modpackId: string,
  options?: { overridesZipPath?: string }
): Promise<{ instance: ModexInstance; syncResult: InstanceSyncResult } | null> {
  const result = await window.api.instances.createFromModpack(modpackId, options);
  if (result?.instance) {
    instances.value.unshift(result.instance);
  }
  return result;
}

/**
 * Get launcher configuration
 */
async function getLauncherConfig(): Promise<{
  vanillaPath?: string;
  javaPath?: string;
  defaultMemory: { min: number; max: number };
}> {
  return window.api.instances.getLauncherConfig();
}

/**
 * Set launcher configuration
 */
async function setLauncherConfig(config: {
  vanillaPath?: string;
  javaPath?: string;
  defaultMemory?: { min: number; max: number };
}): Promise<void> {
  return window.api.instances.setLauncherConfig(config);
}

/**
 * Get running game info for an instance
 */
async function getRunningGame(instanceId: string): Promise<RunningGameInfo | null> {
  return window.api.instances.getRunningGame(instanceId);
}

/**
 * Kill a running game
 */
async function killGame(instanceId: string): Promise<boolean> {
  const result = await window.api.instances.killGame(instanceId);
  if (result) {
    runningGames.value.delete(instanceId);
  }
  return result;
}

/**
 * Composable hook
 */
export function useInstances() {
  let unsubscribeSyncProgress: (() => void) | null = null;
  let unsubscribeGameStatus: (() => void) | null = null;
  let unsubscribeGameLogLine: (() => void) | null = null;
  
  // Log line callbacks (registered per-component)
  const logLineCallbacks = new Set<(instanceId: string, logLine: { time: string; level: string; message: string; raw: string }) => void>();

  onMounted(async () => {
    // Subscribe to sync progress events
    unsubscribeSyncProgress = window.api.instances.onSyncProgress((data) => {
      syncProgress.value = data;
    });

    // Subscribe to game status change events
    unsubscribeGameStatus = window.api.instances.onGameStatusChange((data) => {
      if (data.status === "stopped") {
        runningGames.value.delete(data.instanceId);
      } else {
        runningGames.value.set(data.instanceId, data);
      }
      // Force reactivity update
      runningGames.value = new Map(runningGames.value);
    });
    
    // Subscribe to game log line events
    unsubscribeGameLogLine = window.api.instances.onLogLine((data) => {
      logLineCallbacks.forEach(cb => cb(data.instanceId, data));
    });

    // Load any running games from backend (for page reload detection)
    try {
      const games = await window.api.instances.getAllRunningGames();
      if (games.length > 0) {
        console.log(`[useInstances] Detected ${games.length} running game(s) from backend`);
        for (const game of games) {
          runningGames.value.set(game.instanceId, game);
        }
        runningGames.value = new Map(runningGames.value);
      }
    } catch (err) {
      console.warn("[useInstances] Failed to load running games:", err);
    }
  });

  onUnmounted(() => {
    unsubscribeSyncProgress?.();
    unsubscribeGameStatus?.();
    unsubscribeGameLogLine?.();
    syncProgress.value = null;
    logLineCallbacks.clear();
  });
  
  /**
   * Register a callback for log lines (for a specific instance or all)
   */
  function onGameLogLine(callback: (instanceId: string, logLine: { time: string; level: string; message: string; raw: string; source?: string }) => void): () => void {
    logLineCallbacks.add(callback);
    return () => logLineCallbacks.delete(callback);
  }

  /**
   * Get instance sync settings
   */
  async function getInstanceSyncSettings() {
    return window.api.settings.getInstanceSync();
  }

  /**
   * Update instance sync settings
   */
  async function setInstanceSyncSettings(settings: {
    autoSyncBeforeLaunch?: boolean;
    autoImportConfigsAfterGame?: boolean;
    showSyncConfirmation?: boolean;
    defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
  }) {
    return window.api.settings.setInstanceSync(settings);
  }

  /**
   * Smart launch with automatic sync if needed
   * Returns sync status if confirmation is needed
   */
  async function smartLaunch(instanceId: string, modpackId: string, options?: {
    forceSync?: boolean;
    skipSync?: boolean;
    configSyncMode?: "overwrite" | "new_only" | "skip";
  }) {
    const result = await window.api.settings.smartLaunch(instanceId, modpackId, options);
    
    // Update lastPlayed in local state if launch was successful
    if (result.success) {
      const index = instances.value.findIndex(i => i.id === instanceId);
      if (index !== -1) {
        instances.value[index].lastPlayed = new Date().toISOString();
      }
    }
    
    return result;
  }

  return {
    // State
    instances,
    isLoading,
    syncProgress,
    runningGames,
    
    // Computed
    instanceCount,
    readyInstances,
    installingInstances,
    
    // Methods
    loadInstances,
    getInstance,
    getInstanceByModpack,
    createInstance,
    deleteInstance,
    updateInstance,
    syncModpackToInstance,
    launchInstance,
    openInstanceFolder,
    getInstanceStats,
    exportInstance,
    duplicateInstance,
    createFromModpack,
    getLauncherConfig,
    setLauncherConfig,
    getRunningGame,
    killGame,
    onGameLogLine,
    // Smart sync methods
    getInstanceSyncSettings,
    setInstanceSyncSettings,
    smartLaunch,
  };
}

export default useInstances;
