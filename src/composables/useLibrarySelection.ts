import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { Mod } from "@/types/electron";

export interface UseLibrarySelectionOptions {
  mods: Ref<Mod[]>;
  filteredMods: ComputedRef<Mod[]>;
}

export interface SelectedModsCompatibility {
  compatible: boolean;
  gameVersion: string | null;
  loader: string | null;
}

/**
 * Composable for managing mod selection state in the library.
 * Handles selection toggle, bulk select/deselect, and compatibility checking.
 */
export function useLibrarySelection(options: UseLibrarySelectionOptions) {
  const { mods, filteredMods } = options;

  const selectedModIds = ref<Set<string>>(new Set());

  // Check if all selected mods are compatible (same game_version and loader)
  const selectedModsCompatibility = computed<SelectedModsCompatibility>(() => {
    if (selectedModIds.value.size === 0) {
      return { compatible: false, gameVersion: null, loader: null };
    }

    const selectedMods = mods.value.filter((m) => selectedModIds.value.has(m.id));
    if (selectedMods.length === 0) {
      return { compatible: false, gameVersion: null, loader: null };
    }

    // Separate mods from non-mods (resourcepacks/shaders)
    const modItems = selectedMods.filter(
      (m) => !m.content_type || m.content_type === "mod"
    );
    const nonModItems = selectedMods.filter(
      (m) => m.content_type && m.content_type !== "mod"
    );

    // Get game versions from mods only (single version per mod)
    const modGameVersions = new Set(
      modItems.map((m) => m.game_version).filter((v) => v && v !== "unknown")
    );

    // Get loaders from mods only (resourcepacks/shaders don't have loaders)
    const loaders = new Set(
      modItems.map((m) => m.loader).filter((l) => l && l !== "unknown")
    );

    // Check compatibility for mods
    const hasSameVersion = modGameVersions.size <= 1;
    const hasSameLoader = loaders.size <= 1;

    // For non-mods, check if they have any overlapping versions with the mod game version
    let nonModsCompatible = true;
    const modGameVersion =
      modGameVersions.size === 1 ? Array.from(modGameVersions)[0] : null;

    if (modGameVersion && nonModItems.length > 0) {
      // Check if all non-mod items support the mod game version
      nonModsCompatible = nonModItems.every((item) => {
        if (!item.game_versions || item.game_versions.length === 0) return true;
        return item.game_versions.includes(modGameVersion);
      });
    }

    // If we have mods with different loaders, it's incompatible
    const compatible = hasSameVersion && hasSameLoader && nonModsCompatible;

    // Determine the locked values
    let gameVersion: string | null = null;
    let loader: string | null = null;

    if (modGameVersions.size === 1) {
      gameVersion = Array.from(modGameVersions)[0];
    } else if (modItems.length === 0 && nonModItems.length > 0) {
      // Only non-mod items - find common version from game_versions arrays
      const versionSets = nonModItems.map(
        (item) => new Set(item.game_versions || [])
      );
      if (versionSets.length > 0 && versionSets[0].size > 0) {
        const intersection = [...versionSets[0]].filter((v) =>
          versionSets.every((set) => set.size === 0 || set.has(v))
        );
        if (intersection.length > 0) {
          // Use the highest version as the common version
          gameVersion = intersection[0]; // Already sorted descending by CurseForgeService
        }
      }
    }

    if (loaders.size === 1) {
      loader = Array.from(loaders)[0];
    } else if (modItems.length === 0 && nonModItems.length > 0) {
      // Only non-mod items selected - no loader lock needed
      loader = null;
    }

    return {
      compatible,
      gameVersion,
      loader,
    };
  });

  function toggleSelection(id: string): void {
    if (selectedModIds.value.has(id)) {
      selectedModIds.value.delete(id);
    } else {
      selectedModIds.value.add(id);
    }
  }

  function clearSelection(): void {
    selectedModIds.value.clear();
  }

  function selectAll(): void {
    for (const mod of filteredMods.value) {
      if (mod.id) {
        selectedModIds.value.add(mod.id);
      }
    }
  }

  function selectNone(): void {
    selectedModIds.value.clear();
  }

  // Clean up selection when mods are removed
  function cleanupSelection(currentModIds: Set<string>): void {
    for (const id of selectedModIds.value) {
      if (!currentModIds.has(id)) {
        selectedModIds.value.delete(id);
      }
    }
  }

  return {
    selectedModIds,
    selectedModsCompatibility,
    toggleSelection,
    clearSelection,
    selectAll,
    selectNone,
    cleanupSelection,
  };
}
