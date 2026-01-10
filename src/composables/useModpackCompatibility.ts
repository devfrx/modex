import { computed, type Ref } from "vue";
import type { Mod, Modpack } from "@/types";

export interface CompatibilityResult {
  compatible: boolean;
  warning?: boolean;
  reason?: string;
}

export interface ModWithCompatibility extends Mod {
  isCompatible: boolean;
  hasWarning?: boolean;
  incompatibilityReason?: string;
}

export interface UseModpackCompatibilityOptions {
  modpack: Ref<Modpack | null>;
  currentMods: Ref<Mod[]>;
  contentTypeTab: Ref<"mods" | "resourcepacks" | "shaders">;
}

export function useModpackCompatibility(options: UseModpackCompatibilityOptions) {
  const { modpack, currentMods, contentTypeTab } = options;

  /**
   * Check mod compatibility with modpack
   * Returns: compatible (green), warning (amber - loader mismatch but might work), incompatible (red - version mismatch)
   */
  function isModCompatible(mod: Mod): CompatibilityResult {
    if (!modpack.value) return { compatible: true };

    const modContentType = mod.content_type || "mod";
    const packVersion = modpack.value.minecraft_version;
    const modVersion = mod.game_version;

    // Track loader mismatch separately - it's a warning, not a hard incompatibility
    // Modpack creators sometimes include mods from other loaders that work via compatibility layers
    // (e.g., Sinytra Connector for Fabric mods on Forge, or mods that genuinely work across loaders)
    let loaderWarning: string | undefined;

    if (modContentType === "mod") {
      const packLoader = modpack.value.loader?.toLowerCase();
      const modLoader = mod.loader?.toLowerCase();

      if (packLoader && modLoader && modLoader !== "unknown") {
        const isNeoForgeForgeCompat =
          (packLoader === "neoforge" && modLoader === "forge") ||
          (packLoader === "forge" && modLoader === "neoforge");

        if (modLoader !== packLoader && !isNeoForgeForgeCompat) {
          loaderWarning = `${modLoader} mod in ${packLoader} pack`;
        }
      }
    }

    // Check MC version compatibility
    if (packVersion && modVersion && modVersion !== "unknown") {
      // Check game_versions array first (works for ALL content types including mods)
      // Many mods support multiple MC versions in a single file
      if (mod.game_versions && mod.game_versions.length > 0) {
        const isVersionCompatible = mod.game_versions.some(
          (gv) =>
            gv === packVersion ||
            gv.startsWith(packVersion) ||
            packVersion.startsWith(gv)
        );
        if (!isVersionCompatible) {
          // Version mismatch is a hard incompatibility
          return {
            compatible: false,
            reason: `Supports MC ${mod.game_versions.slice(0, 3).join(", ")}${
              mod.game_versions.length > 3 ? "..." : ""
            }, modpack is ${packVersion}`,
          };
        }
      } else {
        // Fallback: Standard single version check for items without game_versions array
        const versionsMatch =
          modVersion === packVersion ||
          modVersion.startsWith(packVersion) ||
          packVersion.startsWith(modVersion) ||
          modVersion.includes(packVersion);

        if (!versionsMatch) {
          return {
            compatible: false,
            reason: `For MC ${modVersion}, modpack is ${packVersion}`,
          };
        }
      }
    }

    // If we get here, version is compatible - but we might have a loader warning
    if (loaderWarning) {
      return { compatible: true, warning: true, reason: loaderWarning };
    }

    return { compatible: true };
  }

  // Count of incompatible mods (per content type tab)
  const incompatibleModCount = computed(() => {
    return currentMods.value.filter((m) => {
      const modContentType = m.content_type || "mod";
      if (contentTypeTab.value === "mods" && modContentType !== "mod")
        return false;
      if (
        contentTypeTab.value === "resourcepacks" &&
        modContentType !== "resourcepack"
      )
        return false;
      if (contentTypeTab.value === "shaders" && modContentType !== "shader")
        return false;
      return !isModCompatible(m).compatible;
    }).length;
  });

  // Count of warning mods (different loader but version compatible)
  const warningModCount = computed(() => {
    return currentMods.value.filter((m) => {
      const modContentType = m.content_type || "mod";
      if (contentTypeTab.value === "mods" && modContentType !== "mod")
        return false;
      if (
        contentTypeTab.value === "resourcepacks" &&
        modContentType !== "resourcepack"
      )
        return false;
      if (contentTypeTab.value === "shaders" && modContentType !== "shader")
        return false;
      const compat = isModCompatible(m);
      return compat.compatible && compat.warning;
    }).length;
  });

  // Get all incompatible mods for current content type
  const incompatibleMods = computed(() => {
    return currentMods.value.filter((m) => {
      const modContentType = m.content_type || "mod";
      if (contentTypeTab.value === "mods" && modContentType !== "mod")
        return false;
      if (
        contentTypeTab.value === "resourcepacks" &&
        modContentType !== "resourcepack"
      )
        return false;
      if (contentTypeTab.value === "shaders" && modContentType !== "shader")
        return false;
      return !isModCompatible(m).compatible;
    });
  });

  // Attach compatibility info to mods
  function withCompatibility(mods: Mod[]): ModWithCompatibility[] {
    return mods.map((mod) => {
      const compatibility = isModCompatible(mod);
      return {
        ...mod,
        isCompatible: compatibility.compatible,
        hasWarning: compatibility.warning,
        incompatibilityReason: compatibility.reason,
      };
    });
  }

  return {
    isModCompatible,
    incompatibleModCount,
    warningModCount,
    incompatibleMods,
    withCompatibility,
  };
}
