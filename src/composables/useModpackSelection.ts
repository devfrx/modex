import { ref, computed, watch, type Ref } from "vue";
import type { Mod } from "@/types";

export interface UseModpackSelectionOptions {
  filteredMods: Ref<Mod[]>;
  disabledModIds: Ref<Set<string>>;
  lockedModIds: Ref<Set<string>>;
  contentTypeTab: Ref<"mods" | "resourcepacks" | "shaders">;
}

export function useModpackSelection(options: UseModpackSelectionOptions) {
  const { filteredMods, disabledModIds, lockedModIds, contentTypeTab } = options;

  const selectedModIds = ref<Set<string>>(new Set());

  // Clear selection when content type tab changes
  watch(contentTypeTab, () => {
    selectedModIds.value = new Set();
  });

  // Toggle single mod selection
  function toggleSelect(modId: string): void {
    const newSet = new Set(selectedModIds.value);
    if (newSet.has(modId)) {
      newSet.delete(modId);
    } else {
      newSet.add(modId);
    }
    selectedModIds.value = newSet;
  }

  // Select all visible mods
  function selectAll(): void {
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

  // Clear all selections
  function clearSelection(): void {
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
    clearSelection,
    isSelected,
  };
}
