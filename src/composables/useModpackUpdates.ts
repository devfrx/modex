import { ref, computed, type Ref } from "vue";
import type { Mod, Modpack } from "@/types";
import { useToast } from "./useToast";
import { createLogger } from "@/utils/logger";

const log = createLogger("ModpackUpdates");

// Removed RECENT_THRESHOLD_MS - badges are now dismissed manually by user

export interface UpdateInfo {
  id: number;
  displayName?: string;
  fileName?: string;
}

export interface UseModpackUpdatesOptions {
  modpackId: Ref<string>;
  modpack: Ref<Modpack | null>;
  currentMods: Ref<Mod[]>;
  lockedModIds: Ref<Set<string>>;
  contentTypeTab: Ref<"mods" | "resourcepacks" | "shaders">;
  recentlyUpdatedMods: Ref<Set<string>>;
  loadData: () => Promise<void>;
  onUpdate: () => void;
  // Optional: pass external refs for integration with other composables
  checkingUpdates?: Ref<Record<string, boolean>>;
  updateAvailable?: Ref<Record<string, UpdateInfo | null>>;
  isCheckingAllUpdates?: Ref<boolean>;
}

export function useModpackUpdates(options: UseModpackUpdatesOptions) {
  const {
    modpackId,
    modpack,
    currentMods,
    lockedModIds,
    contentTypeTab,
    recentlyUpdatedMods,
    loadData,
    onUpdate,
  } = options;

  const toast = useToast();

  // Update checking state - use external refs if provided, otherwise create internal ones
  const checkingUpdates = options.checkingUpdates ?? ref<Record<string, boolean>>({});
  const updateAvailable = options.updateAvailable ?? ref<Record<string, UpdateInfo | null>>({});
  const isCheckingAllUpdates = options.isCheckingAllUpdates ?? ref(false);

  // Track mods currently being updated (untouchable during update)
  const updatingMods = ref<Set<string>>(new Set());

  // Single mod update dialog
  const showSingleModUpdateDialog = ref(false);
  const selectedUpdateMod = ref<Mod | null>(null);

  // Version picker dialog
  const showVersionPickerDialog = ref(false);
  const versionPickerMod = ref<{
    id: number;
    name: string;
    slug?: string;
    logo?: { thumbnailUrl: string };
    libraryModId: string;
    currentFileId?: number;
    content_type?: "mod" | "resourcepack" | "shader";
  } | null>(null);

  // Changelog dialog
  const showChangelogDialog = ref(false);
  const changelogMod = ref<{
    id: number;
    fileId: number;
    name: string;
    version: string;
    slug?: string;
  } | null>(null);

  // Check single mod for updates
  async function checkModUpdate(mod: Mod): Promise<void> {
    if (!mod.cf_project_id || !mod.cf_file_id || checkingUpdates.value[mod.id])
      return;

    checkingUpdates.value[mod.id] = true;
    try {
      const latestFile = await window.api.updates.checkMod(
        mod.cf_project_id,
        modpack.value?.minecraft_version || "1.20.1",
        modpack.value?.loader || "forge",
        (mod.content_type || "mod") as "mod" | "resourcepack" | "shader"
      );

      if (
        latestFile &&
        latestFile.id !== mod.cf_file_id &&
        latestFile.id > mod.cf_file_id
      ) {
        updateAvailable.value[mod.id] = latestFile;
      } else {
        updateAvailable.value[mod.id] = null; // Checked, no update
      }
    } catch (err) {
      log.error(`Failed to check update for ${mod.name}:`, err);
    } finally {
      checkingUpdates.value[mod.id] = false;
    }
  }

  // Apply update to a mod
  async function updateMod(mod: Mod): Promise<void> {
    const latest = updateAvailable.value[mod.id];
    if (!latest) return;

    // Check if mod is already being updated
    if (updatingMods.value.has(mod.id)) {
      return;
    }

    updatingMods.value.add(mod.id);

    try {
      const result = await window.api.updates.applyUpdate(
        mod.id,
        latest.id,
        modpackId.value
      );
      if (result.success) {
        delete updateAvailable.value[mod.id];
        onUpdate();
        toast.success(`${mod.name} updated to ${latest.displayName} ✓`);
      } else {
        toast.error(`Couldn't update ${mod.name}: ${result.error}`);
      }
    } catch (err) {
      log.error("Update failed:", err);
      toast.error("Couldn't update mod");
    } finally {
      updatingMods.value.delete(mod.id);
    }
  }

  // Check all mods for updates
  async function checkAllUpdates(): Promise<void> {
    if (isCheckingAllUpdates.value) return;

    const cfMods = currentMods.value.filter((m) => m.cf_project_id && m.cf_file_id);
    if (cfMods.length === 0) return;

    isCheckingAllUpdates.value = true;

    // Process in parallel batches
    const BATCH_SIZE = 5;
    for (let i = 0; i < cfMods.length; i += BATCH_SIZE) {
      const batch = cfMods.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((mod) => checkModUpdate(mod)));
    }

    isCheckingAllUpdates.value = false;
  }

  // Quick update single mod to latest
  async function quickUpdateMod(mod: Mod): Promise<void> {
    // Check if mod is locked
    if (lockedModIds.value.has(mod.id)) {
      toast.error("Mod is locked", "Unlock it first to update.");
      return;
    }

    // Check if mod is already being updated
    if (updatingMods.value.has(mod.id)) {
      return;
    }

    const latest = updateAvailable.value[mod.id];
    if (!latest) return;

    // Mark mod as updating (untouchable)
    updatingMods.value = new Set([...updatingMods.value, mod.id]);
    checkingUpdates.value[mod.id] = true;
    try {
      const result = await window.api.updates.applyUpdate(
        mod.id,
        latest.id,
        modpackId.value
      );
      if (result.success) {
        // Mark as recently updated using the NEW mod ID (not the old one)
        // After loadData(), the mod list will have the newModId, not the old mod.id
        const updatedModId = result.newModId || mod.id;
        recentlyUpdatedMods.value.add(updatedModId);

        delete updateAvailable.value[mod.id];
        await loadData();
        onUpdate();
        toast.success(`${mod.name} updated ✓`);
      } else {
        toast.error(`Couldn't update ${mod.name}: ${result.error}`);
      }
    } catch (err) {
      log.error("Update failed:", err);
      toast.error(`Couldn't update ${mod.name}`);
    } finally {
      checkingUpdates.value[mod.id] = false;
      // Remove from updating set
      const newUpdating = new Set(updatingMods.value);
      newUpdating.delete(mod.id);
      updatingMods.value = newUpdating;
    }
  }

  // Update all mods with available updates (excluding locked)
  async function updateAllMods(): Promise<void> {
    const modsToUpdate = currentMods.value.filter(
      (m) => updateAvailable.value[m.id] && !lockedModIds.value.has(m.id) && !updatingMods.value.has(m.id)
    );
    if (modsToUpdate.length === 0) {
      toast.info("All up to date", "Your mods are on their latest versions.");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // Mark all mods as updating
    const updatingSet = new Set(updatingMods.value);
    for (const mod of modsToUpdate) {
      updatingSet.add(mod.id);
    }
    updatingMods.value = updatingSet;

    for (const mod of modsToUpdate) {
      try {
        const latest = updateAvailable.value[mod.id];
        if (!latest) continue;

        const result = await window.api.updates.applyUpdate(
          mod.id,
          latest.id,
          modpackId.value
        );
        if (result.success) {
          // Mark as recently updated using the NEW mod ID
          const updatedModId = result.newModId || mod.id;
          recentlyUpdatedMods.value.add(updatedModId);
          delete updateAvailable.value[mod.id];
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      } finally {
        // Remove this mod from updating set
        const newUpdating = new Set(updatingMods.value);
        newUpdating.delete(mod.id);
        updatingMods.value = newUpdating;
      }
    }

    await loadData();
    onUpdate();

    if (failCount === 0) {
      toast.success(`${successCount} mods updated ✓`);
    } else {
      toast.warning(`${successCount} updated, ${failCount} couldn't update`);
    }
  }

  // Open version picker dialog
  function openVersionPicker(mod: Mod): void {
    if (!mod.cf_project_id) return;

    // Check if mod is locked
    if (lockedModIds.value.has(mod.id)) {
      toast.error("Mod is locked", "Unlock it first to change the version.");
      return;
    }

    versionPickerMod.value = {
      id: mod.cf_project_id,
      name: mod.name,
      slug: mod.slug,
      logo: mod.thumbnail_url ? { thumbnailUrl: mod.thumbnail_url } : undefined,
      libraryModId: mod.id,
      currentFileId: mod.cf_file_id,
      content_type: mod.content_type || "mod",
    };
    showVersionPickerDialog.value = true;
  }

  // Handle version selection from picker
  async function handleVersionSelected(fileId: number): Promise<void> {
    if (!versionPickerMod.value) return;

    const modId = versionPickerMod.value.libraryModId;

    // Check if mod is already being updated
    if (updatingMods.value.has(modId)) {
      return;
    }

    // Mark mod as updating (untouchable)
    updatingMods.value = new Set([...updatingMods.value, modId]);

    try {
      const result = await window.api.updates.applyUpdate(
        modId,
        fileId,
        modpackId.value
      );
      if (result.success) {
        // Mark as recently updated using the NEW mod ID
        const updatedModId = result.newModId || modId;
        recentlyUpdatedMods.value.add(updatedModId);

        // Clear any cached update status
        if (updateAvailable.value[modId]) {
          delete updateAvailable.value[modId];
        }
        await loadData();
        onUpdate();
        toast.success(`${versionPickerMod.value.name} updated ✓`);
      } else {
        toast.error(`Couldn't change version: ${result.error || "Unknown error"}`);
      }
    } catch (err: unknown) {
      log.error("Version change failed:", err);
      toast.error(`Couldn't change version: ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      // Remove from updating set
      const newUpdating = new Set(updatingMods.value);
      newUpdating.delete(modId);
      updatingMods.value = newUpdating;
    }

    showVersionPickerDialog.value = false;
    versionPickerMod.value = null;
  }

  // Open single mod update dialog
  function openSingleModUpdate(mod: Mod): void {
    selectedUpdateMod.value = mod;
    showSingleModUpdateDialog.value = true;
  }

  // Handle single mod updated event - receives newModId from dialog
  function handleSingleModUpdated(newFileId?: number, newModId?: string): void {
    if (selectedUpdateMod.value) {
      // Use newModId if available, otherwise fall back to the old mod id
      const updatedModId = newModId || selectedUpdateMod.value.id;
      recentlyUpdatedMods.value.add(updatedModId);
    }
  }

  // View changelog for a mod update
  function viewModChangelog(mod: Mod): void {
    const update = updateAvailable.value[mod.id];
    if (!mod.cf_project_id || !update) return;

    changelogMod.value = {
      id: mod.cf_project_id,
      fileId: update.id,
      name: mod.name,
      version: update.displayName || update.fileName || "",
      slug: mod.slug,
    };
    showChangelogDialog.value = true;
  }

  // Count of mods with updates available (per tab)
  const updatesAvailableCount = computed(() => {
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
      return updateAvailable.value[m.id];
    }).length;
  });

  return {
    // State
    checkingUpdates,
    updateAvailable,
    isCheckingAllUpdates,
    updatingMods,

    // Single mod update dialog
    showSingleModUpdateDialog,
    selectedUpdateMod,

    // Version picker dialog
    showVersionPickerDialog,
    versionPickerMod,

    // Changelog dialog
    showChangelogDialog,
    changelogMod,

    // Computed
    updatesAvailableCount,

    // Methods
    checkModUpdate,
    updateMod,
    checkAllUpdates,
    quickUpdateMod,
    updateAllMods,
    openVersionPicker,
    handleVersionSelected,
    openSingleModUpdate,
    handleSingleModUpdated,
    viewModChangelog,
  };
}
