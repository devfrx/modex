/**
 * useModpackInstance
 * 
 * Manages instance lifecycle: create, load, sync, launch, kill, delete.
 * Also handles instance settings (memory, JVM args) and sync preferences.
 * 
 * Extracted from ModpackEditor.vue to reduce complexity and enable reuse.
 */
import { ref, computed, Ref, ComputedRef } from 'vue';
import { useInstances } from '@/composables/useInstances';
import type { ModexInstance, InstanceSyncResult, Modpack } from '@/types';

// Re-export the type for consumers
export interface InstanceStats {
  modCount: number;
  configCount: number;
  totalSize: string; // Formatted string like "1.2 GB"
}

export interface SyncSettings {
  autoSyncEnabled: boolean;
  showConfirmation: boolean;
}

export interface PendingLaunchData {
  needsSync: boolean;
  differences: number;
  lastSynced?: string;
}

export interface LoaderProgress {
  stage: string;
  current: number;
  total: number;
  detail: string;
}

// Matches the actual API response from window.api.instances.checkSyncStatus
export interface SyncStatus {
  needsSync: boolean;
  missingInInstance: Array<{ filename: string; type: string }>;
  extraInInstance: Array<{ filename: string; type: string }>;
  disabledMismatch: Array<{ filename: string; issue: string }>;
  configDifferences: number;
  totalDifferences: number;
  loaderVersionMismatch?: boolean;
}

interface UseModpackInstanceOptions {
  modpackId: Ref<string>;
  modpack: Ref<Modpack | null>;
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
  };
  emit: (event: string, ...args: any[]) => void;
}

export function useModpackInstance(options: UseModpackInstanceOptions) {
  const { modpackId, modpack, toast, emit } = options;

  // Get instance helpers from useInstances composable
  const {
    runningGames,
    syncModpackToInstance,
    smartLaunch,
    killGame,
    openInstanceFolder,
    updateInstance,
    getInstanceStats,
  } = useInstances();

  // === STATE ===

  // Core instance state
  const instance = ref<ModexInstance | null>(null);
  const instanceStats = ref<InstanceStats | null>(null);
  const instanceSyncStatus = ref<SyncStatus | null>(null);
  const isLoadingInstance = ref(false);
  const isCreatingInstance = ref(false);

  // Sync state
  const isSyncingInstance = ref(false);
  const syncResult = ref<InstanceSyncResult | null>(null);
  const showSyncDetails = ref(false);
  const selectedSyncMode = ref<'overwrite' | 'new_only' | 'skip'>('new_only');
  const clearExistingMods = ref(false);

  // Sync settings (user preferences)
  const syncSettings = ref<SyncSettings>({
    autoSyncEnabled: true,
    showConfirmation: true,
  });

  // Launch state
  const isLaunching = ref(false);
  const gameLaunched = ref(false);
  const gameLoadingMessage = ref('');

  // Loader installation progress
  const loaderProgress = ref<LoaderProgress | null>(null);

  // Smart launch confirmation dialog
  const showSyncConfirmDialog = ref(false);
  const pendingLaunchData = ref<PendingLaunchData | null>(null);

  // Instance settings dialog
  const showInstanceSettings = ref(false);
  const showDeleteInstanceDialog = ref(false);
  const isDeletingInstance = ref(false);

  // Memory & JVM settings
  const memoryMin = ref(2048);
  const memoryMax = ref(4096);
  const customJavaArgs = ref('');
  const systemMemory = ref<{ total: number; suggestedMax: number } | null>(null);

  // === COMPUTED ===

  // Current running game for this instance
  const runningGame = computed(() => {
    if (!instance.value) return null;
    return runningGames.value.get(instance.value.id) || null;
  });

  // Is the game currently running?
  const isGameRunning = computed(() => {
    return runningGame.value !== null && runningGame.value.status !== 'stopped';
  });

  // Max allowed RAM based on system memory
  const maxAllowedRam = computed(() => {
    if (systemMemory.value) {
      return systemMemory.value.suggestedMax;
    }
    return 32768; // fallback
  });

  // === FUNCTIONS ===

  /**
   * Load instance data for this modpack
   * Uses race condition protection via isLoadingInstance flag
   */
  async function loadInstance(): Promise<void> {
    if (!modpackId.value) return;
    if (isLoadingInstance.value) return; // prevent race conditions

    isLoadingInstance.value = true;
    try {
      const inst = await window.api.instances.getByModpack(modpackId.value);
      instance.value = inst;

      if (inst) {
        // Load instance stats
        const stats = await getInstanceStats(inst.id);
        if (stats) {
          instanceStats.value = {
            modCount: stats.modCount,
            configCount: stats.configCount,
            totalSize: stats.totalSize,
          };
        }

        // Check sync status
        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(
          inst.id,
          modpackId.value
        );

        // Load system memory info (used for RAM slider limits)
        try {
          systemMemory.value = await window.api.system.getMemoryInfo();
        } catch {
          // System memory API may not be available
          systemMemory.value = null;
        }
      } else {
        instanceStats.value = null;
        instanceSyncStatus.value = null;
      }
    } catch (err) {
      console.error('Failed to load instance:', err);
    } finally {
      isLoadingInstance.value = false;
    }
  }

  /**
   * Load user's sync settings from app settings
   */
  async function loadSyncSettings(): Promise<void> {
    try {
      const settings = await window.api.settings.getInstanceSync();
      syncSettings.value = {
        autoSyncEnabled: settings.autoSyncBeforeLaunch !== false,
        showConfirmation: settings.showSyncConfirmation !== false,
      };
    } catch (err) {
      console.error('Failed to load sync settings:', err);
    }
  }

  /**
   * Create a new instance for this modpack
   */
  async function handleCreateInstance(): Promise<void> {
    if (!modpack.value || isCreatingInstance.value) return;
    if (!modpack.value.minecraft_version) {
      toast.error("Can't create instance", 'Modpack has no Minecraft version set');
      return;
    }

    isCreatingInstance.value = true;
    try {
      const created = await window.api.instances.create({
        name: modpack.value.name,
        modpackId: modpackId.value,
        minecraftVersion: modpack.value.minecraft_version,
        loader: modpack.value.loader || 'forge',
        loaderVersion: modpack.value.loader_version,
      });

      if (created) {
        instance.value = created;
        toast.success('Instance Created ✓', 'Ready to sync and play.');
        // Load stats for new instance
        await loadInstance();
      }
    } catch (err: unknown) {
      toast.error("Couldn't create instance", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isCreatingInstance.value = false;
    }
  }

  /**
   * Toggle auto-sync setting
   */
  async function toggleAutoSync(): Promise<void> {
    const newValue = !syncSettings.value.autoSyncEnabled;
    syncSettings.value.autoSyncEnabled = newValue;
    try {
      await window.api.settings.setInstanceSync({
        autoSyncBeforeLaunch: newValue,
      });
    } catch (err) {
      console.error('Failed to save sync setting:', err);
    }
  }

  /**
   * Toggle sync confirmation setting
   */
  async function toggleSyncConfirmation(): Promise<void> {
    const newValue = !syncSettings.value.showConfirmation;
    syncSettings.value.showConfirmation = newValue;
    try {
      await window.api.settings.setInstanceSync({
        showSyncConfirmation: newValue,
      });
    } catch (err) {
      console.error('Failed to save sync setting:', err);
    }
  }

  /**
   * Sync instance with modpack (manual sync)
   */
  async function handleSyncInstance(): Promise<void> {
    if (!instance.value) return;

    isSyncingInstance.value = true;
    syncResult.value = null;

    try {
      const result = await syncModpackToInstance(instance.value.id, modpackId.value, {
        clearExisting: clearExistingMods.value,
        configSyncMode: selectedSyncMode.value,
      });

      syncResult.value = result;

      if (result.success) {
        toast.success('Synced ✓', `${result.modsDownloaded} mods updated`);

        // Refresh instance data (loader version may have been updated)
        await loadInstance();

        // Instance may have been updated by loadInstance - re-check
        if (instance.value) {
          const stats = await getInstanceStats(instance.value.id);
          if (stats) {
            instanceStats.value = {
              modCount: stats.modCount,
              configCount: stats.configCount,
              totalSize: stats.totalSize,
            };
          }

          instanceSyncStatus.value = await window.api.instances.checkSyncStatus(
            instance.value.id,
            modpackId.value
          );
        }
        showSyncDetails.value = false; // Collapse details after sync
      } else {
        toast.error('Sync had issues', result.errors.join(', '));
      }
    } catch (err: unknown) {
      toast.error("Couldn't sync", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isSyncingInstance.value = false;
    }
  }

  /**
   * Launch the instance (with smart sync)
   */
  async function handleLaunch(launchOptions?: {
    forceSync?: boolean;
    skipSync?: boolean;
  }): Promise<void> {
    if (!instance.value) return;

    isLaunching.value = true;
    loaderProgress.value = null;
    gameLaunched.value = false;
    gameLoadingMessage.value = '';

    const removeProgressListener = window.api.on(
      'loader:installProgress',
      (data: { stage: string; current: number; total: number; detail?: string }) => {
        loaderProgress.value = {
          stage: data.stage,
          current: data.current,
          total: data.total,
          detail: data.detail || '',
        };
      }
    );

    try {
      const result = await smartLaunch(instance.value.id, modpackId.value, {
        forceSync: launchOptions?.forceSync,
        skipSync: launchOptions?.skipSync,
        // Note: Auto-sync always uses new_only mode (hardcoded in backend)
        // selectedSyncMode is only for manual sync from the banner
      });

      if (result.requiresConfirmation && result.syncStatus) {
        pendingLaunchData.value = {
          needsSync: result.syncStatus.needsSync,
          differences: result.syncStatus.differences,
          lastSynced: result.syncStatus.lastSynced,
        };
        showSyncConfirmDialog.value = true;
        isLaunching.value = false;
        removeProgressListener();
        return;
      }

      if (result.success) {
        gameLaunched.value = true;
        gameLoadingMessage.value = 'Launching Minecraft...';

        if (result.syncPerformed && instance.value) {
          toast.success('Launching ✓', 'Synced and starting Minecraft...');
          instanceSyncStatus.value = await window.api.instances.checkSyncStatus(
            instance.value.id,
            modpackId.value
          );
        } else {
          toast.success('Launching ✓', 'Starting Minecraft...');
        }

        emit('launched', instance.value);
      } else {
        toast.error("Couldn't launch", result.error || 'Unknown error');
      }
    } catch (err: unknown) {
      toast.error("Couldn't launch", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      removeProgressListener();
      isLaunching.value = false;
      loaderProgress.value = null;
    }
  }

  /**
   * Handle sync confirmation dialog response
   */
  function handleSyncConfirmation(action: 'sync' | 'skip' | 'cancel'): void {
    showSyncConfirmDialog.value = false;
    pendingLaunchData.value = null;

    if (action === 'cancel') return;

    handleLaunch({
      forceSync: action === 'sync',
      skipSync: action === 'skip',
    });
  }

  /**
   * Kill the running game
   */
  async function handleKillGame(): Promise<void> {
    if (!instance.value) return;

    try {
      const result = await killGame(instance.value.id);
      if (result) {
        toast.success('Stopped ✓', 'Minecraft has been closed.');
        gameLaunched.value = false;
      } else {
        toast.error("Couldn't stop game", 'The process may have already ended.');
      }
    } catch (err: unknown) {
      toast.error("Couldn't stop game", err instanceof Error ? err.message : 'Unknown error');
    }
  }

  /**
   * Open instance folder in file explorer
   */
  async function handleOpenInstanceFolder(subfolder?: string): Promise<void> {
    if (!instance.value) return;
    await openInstanceFolder(instance.value.id, subfolder);
  }

  /**
   * Open instance settings dialog with current values
   */
  function openInstanceSettings(): void {
    if (!instance.value) return;

    // Load current values from instance
    memoryMin.value = instance.value.memory?.min || 2048;
    memoryMax.value = instance.value.memory?.max || 4096;
    customJavaArgs.value = instance.value.javaArgs || '';

    showInstanceSettings.value = true;
  }

  /**
   * Save instance settings (memory & JVM args)
   */
  async function saveInstanceSettings(): Promise<void> {
    if (!instance.value) return;

    try {
      await updateInstance(instance.value.id, {
        memory: { min: memoryMin.value, max: memoryMax.value },
        javaArgs: customJavaArgs.value || undefined,
      });

      // Update local instance state with new values
      instance.value = {
        ...instance.value,
        memory: { min: memoryMin.value, max: memoryMax.value },
        javaArgs: customJavaArgs.value || undefined,
      };

      toast.success('Saved ✓', 'Memory and JVM settings updated.');
      showInstanceSettings.value = false;
    } catch (err: unknown) {
      toast.error("Couldn't save", err instanceof Error ? err.message : 'Unknown error');
    }
  }

  /**
   * Delete instance
   */
  async function handleDeleteInstance(): Promise<void> {
    if (!instance.value) return;

    isDeletingInstance.value = true;
    try {
      const success = await window.api.instances.delete(instance.value.id);
      if (success) {
        toast.success('Deleted ✓', 'You can recreate it anytime from Play.');
        instance.value = null;
        instanceStats.value = null;
        instanceSyncStatus.value = null;
      } else {
        toast.error("Couldn't delete instance");
      }
    } catch (err: unknown) {
      toast.error("Couldn't delete", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isDeletingInstance.value = false;
      showDeleteInstanceDialog.value = false;
    }
  }

  /**
   * Refresh sync status (called after mod enable/disable)
   */
  async function refreshSyncStatus(): Promise<void> {
    if (!instance.value) return;
    try {
      instanceSyncStatus.value = await window.api.instances.checkSyncStatus(
        instance.value.id,
        modpackId.value
      );
    } catch (err) {
      console.error('Failed to refresh sync status:', err);
    }
  }

  /**
   * Format play date for display
   */
  function formatPlayDate(dateString?: string): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Format file size for display
   */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return {
    // Core state
    instance,
    instanceStats,
    instanceSyncStatus,
    isLoadingInstance,
    isCreatingInstance,

    // Sync state
    isSyncingInstance,
    syncResult,
    showSyncDetails,
    selectedSyncMode,
    clearExistingMods,
    syncSettings,

    // Launch state
    isLaunching,
    gameLaunched,
    gameLoadingMessage,
    loaderProgress,

    // Sync confirmation dialog
    showSyncConfirmDialog,
    pendingLaunchData,

    // Instance settings dialog
    showInstanceSettings,
    showDeleteInstanceDialog,
    isDeletingInstance,

    // Memory & JVM settings
    memoryMin,
    memoryMax,
    customJavaArgs,
    systemMemory,

    // Computed
    runningGame,
    isGameRunning,
    maxAllowedRam,

    // Functions
    loadInstance,
    loadSyncSettings,
    handleCreateInstance,
    toggleAutoSync,
    toggleSyncConfirmation,
    handleSyncInstance,
    handleLaunch,
    handleSyncConfirmation,
    handleKillGame,
    handleOpenInstanceFolder,
    openInstanceSettings,
    saveInstanceSettings,
    handleDeleteInstance,
    refreshSyncStatus,
    formatPlayDate,
    formatFileSize,
  };
}
