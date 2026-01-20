/**
 * useModpackConfigSync
 * 
 * Manages bidirectional config synchronization between modpack and instance.
 * Handles loading, selecting, and importing modified configs.
 * 
 * Extracted from ModpackEditor.vue to reduce complexity and enable reuse.
 */
import { ref, computed, Ref } from 'vue';
import type { ModexInstance } from '@/types';
import { createLogger } from "@/utils/logger";

const log = createLogger("ConfigSync");

export interface ModifiedConfig {
  relativePath: string;
  instancePath: string;
  overridePath?: string;
  status: 'modified' | 'new' | 'deleted';
  lastModified: Date;
  size: number;
}

interface UseModpackConfigSyncOptions {
  modpackId: Ref<string>;
  instance: Ref<ModexInstance | null>;
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
  };
}

export function useModpackConfigSync(options: UseModpackConfigSyncOptions) {
  const { modpackId, instance, toast } = options;

  // === STATE ===

  // Raw modified configs from instance
  const modifiedConfigs = ref<ModifiedConfig[]>([]);

  // UI state
  const showModifiedConfigsDetails = ref(false);
  const selectedConfigsForImport = ref<Set<string>>(new Set());
  const isImportingConfigs = ref(false);
  const showOnlyModifiedConfigs = ref(true); // Only show actually modified, not new

  // === COMPUTED ===

  /**
   * Importable configs (new or modified, not deleted)
   * When showOnlyModifiedConfigs is true, only show 'modified' status
   */
  const importableConfigs = computed(() =>
    modifiedConfigs.value.filter((c) => {
      if (c.status === 'deleted') return false;
      if (showOnlyModifiedConfigs.value && c.status === 'new') return false;
      return true;
    })
  );

  /**
   * Deleted configs (exist in overrides but not in instance)
   */
  const deletedConfigs = computed(() =>
    modifiedConfigs.value.filter((c) => c.status === 'deleted')
  );

  /**
   * Count of new configs (for showing toggle)
   */
  const newConfigsCount = computed(() =>
    modifiedConfigs.value.filter((c) => c.status === 'new').length
  );

  /**
   * Count of selected configs
   */
  const selectedConfigsCount = computed(() => selectedConfigsForImport.value.size);

  /**
   * Whether all importable configs are selected
   */
  const allConfigsSelected = computed(() =>
    importableConfigs.value.length > 0 &&
    importableConfigs.value.every((c) => selectedConfigsForImport.value.has(c.relativePath))
  );

  /**
   * Whether some (but not all) importable configs are selected
   */
  const someConfigsSelected = computed(() =>
    selectedConfigsForImport.value.size > 0 &&
    !allConfigsSelected.value
  );

  // === FUNCTIONS ===

  /**
   * Load modified configs from instance
   */
  async function loadModifiedConfigs(): Promise<void> {
    if (!instance.value) return;

    try {
      const result = await window.api.instances.getModifiedConfigs(
        instance.value.id,
        modpackId.value
      );
      modifiedConfigs.value = result.modifiedConfigs;

      // Auto-select only modified configs (not new ones by default)
      selectedConfigsForImport.value = new Set(
        modifiedConfigs.value
          .filter((c) => c.status === 'modified')
          .map((c) => c.relativePath)
      );
    } catch (err) {
      log.error('Failed to load modified configs:', err);
    }
  }

  /**
   * Toggle config selection for import
   */
  function toggleConfigSelection(relativePath: string): void {
    if (selectedConfigsForImport.value.has(relativePath)) {
      selectedConfigsForImport.value.delete(relativePath);
    } else {
      selectedConfigsForImport.value.add(relativePath);
    }
    // Trigger reactivity
    selectedConfigsForImport.value = new Set(selectedConfigsForImport.value);
  }

  /**
   * Select all configs (respects current filter)
   */
  function selectAllConfigs(): void {
    selectedConfigsForImport.value = new Set(
      importableConfigs.value.map((c) => c.relativePath)
    );
  }

  /**
   * Deselect all configs
   */
  function deselectAllConfigs(): void {
    selectedConfigsForImport.value = new Set();
  }

  /**
   * Toggle select all configs
   */
  function toggleSelectAllConfigs(): void {
    if (allConfigsSelected.value) {
      deselectAllConfigs();
    } else {
      selectAllConfigs();
    }
  }

  /**
   * Import selected configs to modpack
   */
  async function importSelectedConfigs(): Promise<void> {
    if (!instance.value || selectedConfigsForImport.value.size === 0) return;

    isImportingConfigs.value = true;

    try {
      const configPaths = Array.from(selectedConfigsForImport.value);
      const result = await window.api.instances.importConfigs(
        instance.value.id,
        modpackId.value,
        configPaths
      );

      if (result.success) {
        toast.success('Imported ✓', `${result.imported} config files added.`);

        // Small delay to ensure filesystem is synced before reloading
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Reload modified configs
        await loadModifiedConfigs();
        showModifiedConfigsDetails.value = false;

        // If no more configs to import, clear selection
        if (importableConfigs.value.length === 0) {
          selectedConfigsForImport.value = new Set();
        }
      } else {
        toast.error("Couldn't import some files", result.errors.join(', '));
      }
    } catch (err: unknown) {
      toast.error("Couldn't import", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isImportingConfigs.value = false;
    }
  }

  /**
   * Check if a config is selected
   */
  function isConfigSelected(relativePath: string): boolean {
    return selectedConfigsForImport.value.has(relativePath);
  }

  /**
   * Toggle showing only modified configs vs all importable
   */
  function toggleShowOnlyModified(): void {
    showOnlyModifiedConfigs.value = !showOnlyModifiedConfigs.value;
  }

  /**
   * Toggle modified configs details panel
   */
  function toggleModifiedConfigsDetails(): void {
    showModifiedConfigsDetails.value = !showModifiedConfigsDetails.value;
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
    // State
    modifiedConfigs,
    showModifiedConfigsDetails,
    selectedConfigsForImport,
    isImportingConfigs,
    showOnlyModifiedConfigs,

    // Computed
    importableConfigs,
    deletedConfigs,
    newConfigsCount,
    selectedConfigsCount,
    allConfigsSelected,
    someConfigsSelected,

    // Functions
    loadModifiedConfigs,
    toggleConfigSelection,
    selectAllConfigs,
    deselectAllConfigs,
    toggleSelectAllConfigs,
    importSelectedConfigs,
    isConfigSelected,
    toggleShowOnlyModified,
    toggleModifiedConfigsDetails,
    formatFileSize,
  };
}
