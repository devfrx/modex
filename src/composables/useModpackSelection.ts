import { ref, computed, watch, type Ref } from "vue";
import { createLogger } from "@/utils/logger";
import type { Mod } from "@/types";

const log = createLogger("ModpackSelection");

export interface UseModpackSelectionOptions {
  filteredMods: Ref<Mod[]>;
  disabledModIds: Ref<Set<string>>;
  lockedModIds: Ref<Set<string>>;
  contentTypeTab: Ref<"mods" | "resourcepacks" | "shaders">;
}

export function useModpackSelection(options: UseModpackSelectionOptions) {
  const { filteredMods, disabledModIds, lockedModIds, contentTypeTab } = options;
  
  log.debug('Initializing modpack selection');

  const selectedModIds = ref<Set<string>>(new Set());

  // Clear selection when content type tab changes
  watch(contentTypeTab, (newTab) => {
    log.debug('Content type tab changed, clearing selection', { newTab });
    selectedModIds.value = new Set();
  });

  // Toggle single mod selection
  function toggleSelect(modId: string): void {
    const newSet = new Set(selectedModIds.value);
    if (newSet.has(modId)) {
      log.debug('Deselecting mod', { modId });
      newSet.delete(modId);
    } else {
      log.debug('Selecting mod', { modId });
      newSet.add(modId);
    }
    selectedModIds.value = newSet;
  }

  // Select all visible mods
  function selectAll(): void {
    log.debug('Selecting all visible mods', { count: filteredMods.value.length });
    const newSet = new Set(selectedModIds.value);
    for (const mod of filteredMods.value) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Select all enabled mods (excludes disabled and locked)
  function selectAllEnabled(): void {
    const enabledUnlockedMods = filteredMods.value.filter(
      (mod) =>
        mod.id && !disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    );
    log.debug('Selecting all enabled mods', { count: enabledUnlockedMods.length });

    const newSet = new Set<string>();
    for (const mod of enabledUnlockedMods) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Select half of enabled mods (excludes disabled and locked)
  function selectHalfEnabled(): void {
    const enabledUnlockedMods = filteredMods.value.filter(
      (mod) =>
        mod.id && !disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    );

    if (enabledUnlockedMods.length === 0) {
      return;
    }

    const halfCount = Math.ceil(enabledUnlockedMods.length / 2);
    const modsToSelect = enabledUnlockedMods.slice(0, halfCount);

    const newSet = new Set<string>();
    for (const mod of modsToSelect) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Select all disabled mods (excludes locked)
  function selectAllDisabled(): void {
    const disabledUnlockedMods = filteredMods.value.filter(
      (mod) =>
        mod.id && disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    );

    const newSet = new Set<string>();
    for (const mod of disabledUnlockedMods) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Select half of disabled mods (excludes locked)
  function selectHalfDisabled(): void {
    const disabledUnlockedMods = filteredMods.value.filter(
      (mod) =>
        mod.id && disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    );

    if (disabledUnlockedMods.length === 0) {
      return;
    }

    const halfCount = Math.ceil(disabledUnlockedMods.length / 2);
    const modsToSelect = disabledUnlockedMods.slice(0, halfCount);

    const newSet = new Set<string>();
    for (const mod of modsToSelect) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Select all mods with specific environment (excludes locked)
  function selectByEnvironment(environment: "client" | "server" | "both" | "unknown"): void {
    const envMods = filteredMods.value.filter(
      (mod) => {
        if (!mod.id || lockedModIds.value.has(mod.id)) return false;
        if (environment === "unknown") {
          return !mod.environment || mod.environment === "unknown";
        }
        return mod.environment === environment;
      }
    );
    log.debug('Selecting mods by environment', { environment, count: envMods.length });

    const newSet = new Set<string>();
    for (const mod of envMods) {
      if (mod.id) {
        newSet.add(mod.id);
      }
    }
    selectedModIds.value = newSet;
  }

  // Clear all selections
  function clearSelection(): void {
    log.debug('Clearing all selections', { previousCount: selectedModIds.value.size });
    selectedModIds.value = new Set();
  }

  // Check if a mod is selected
  function isSelected(modId: string): boolean {
    return selectedModIds.value.has(modId);
  }

  // Get selected mods count
  const selectedCount = computed(() => selectedModIds.value.size);

  // Get selected mod IDs as array
  const selectedModIdsArray = computed(() => [...selectedModIds.value]);

  // Get counts for selection helpers
  const enabledUnlockedCount = computed(() => {
    return filteredMods.value.filter(
      (mod) =>
        mod.id && !disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    ).length;
  });

  const disabledUnlockedCount = computed(() => {
    return filteredMods.value.filter(
      (mod) =>
        mod.id && disabledModIds.value.has(mod.id) && !lockedModIds.value.has(mod.id)
    ).length;
  });

  return {
    // State
    selectedModIds,

    // Computed
    selectedCount,
    selectedModIdsArray,
    enabledUnlockedCount,
    disabledUnlockedCount,

    // Methods
    toggleSelect,
    selectAll,
    selectAllEnabled,
    selectHalfEnabled,
    selectAllDisabled,
    selectHalfDisabled,
    selectByEnvironment,
    clearSelection,
    isSelected,
  };
}
