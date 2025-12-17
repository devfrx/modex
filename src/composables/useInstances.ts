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

// Reactive state
const instances = ref<ModexInstance[]>([]);
const isLoading = ref(false);
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
 * Composable hook
 */
export function useInstances() {
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    // Subscribe to sync progress events
    unsubscribe = window.api.instances.onSyncProgress((data) => {
      syncProgress.value = data;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
    syncProgress.value = null;
  });

  return {
    // State
    instances,
    isLoading,
    syncProgress,
    
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
  };
}

export default useInstances;
