import { ref, computed, type Ref } from "vue";
import type { Mod, Modpack } from "@/types";
import { useToast } from "./useToast";
import { createLogger } from "@/utils/logger";

const log = createLogger("ModpackMods");

// No more timeout - user dismisses manually
// const RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface DependencyImpact {
  action: "remove" | "disable";
  modToAffect: { id: string; name: string } | null;
  dependentMods: Array<{ id: string; name: string; willBreak: boolean; depth?: number }>;
  orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
  warnings: string[];
}

export interface UseModpackModsOptions {
  modpackId: Ref<string>;
  modpack: Ref<Modpack | null>;
  currentMods: Ref<Mod[]>;
  disabledModIds: Ref<Set<string>>;
  lockedModIds: Ref<Set<string>>;
  modNotes: Ref<Record<string, string>>;
  isLinked: Ref<boolean>;
  modsFilter: Ref<string>;
  refreshSyncStatus: () => Promise<void>;
  refreshUnsavedChangesCount: () => Promise<void>;
  loadData: () => Promise<void>;
  onUpdate: () => void;
  // Optional: pass external refs for integration with other composables
  recentlyAddedMods?: Ref<Set<string>>;
  recentlyUpdatedMods?: Ref<Set<string>>;
}

export function useModpackMods(options: UseModpackModsOptions) {
  const {
    modpackId,
    modpack,
    currentMods,
    disabledModIds,
    lockedModIds,
    modNotes,
    isLinked,
    modsFilter,
    refreshSyncStatus,
    refreshUnsavedChangesCount,
    loadData,
    onUpdate,
  } = options;

  const toast = useToast();

  // Recently added/updated tracking - use external refs if provided, otherwise create internal ones
  const recentlyAddedMods = options.recentlyAddedMods ?? ref<Set<string>>(new Set());
  const recentlyUpdatedMods = options.recentlyUpdatedMods ?? ref<Set<string>>(new Set());

  // Operation locking to prevent concurrent operations on the same mod
  const pendingOperations = ref<Set<string>>(new Set());

  // Dependency Impact Dialog state
  const showDependencyImpactDialog = ref(false);
  const dependencyImpact = ref<DependencyImpact | null>(null);
  const pendingModAction = ref<{ modId: string; action: "remove" | "disable" } | null>(null);

  // Mod Notes Dialog state
  const showModNoteDialog = ref(false);
  const noteDialogMod = ref<Mod | null>(null);
  const noteDialogText = ref("");
  const isSavingNote = ref(false);

  // Add mod to modpack (auto-syncs to instance if instantSync is enabled in settings)
  async function addMod(modId: string): Promise<void> {
    if (isLinked.value) {
      toast.error(
        "Action Restricted",
        "Cannot add mods to a linked modpack. Manage mods from the remote source."
      );
      return;
    }
    
    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.debug("Operation already pending for mod", { modId });
      return;
    }
    
    log.info("Adding mod to modpack", { modpackId: modpackId.value, modId });
    pendingOperations.value = new Set([...pendingOperations.value, modId]);
    try {
      // Normal API call - backend handles instant sync if enabled
      await window.api.modpacks.addMod(modpackId.value, modId);

      // Mark as recently added (no timeout - user must manually dismiss)
      // Fix: Trigger Vue reactivity by creating a new Set
      recentlyAddedMods.value = new Set([...recentlyAddedMods.value, modId]);

      await loadData();
      // Refresh sync status (should show "in sync" if instant sync worked)
      await refreshSyncStatus();
      onUpdate();
      log.info("Mod added successfully", { modpackId: modpackId.value, modId });
    } catch (err) {
      const errorMsg = (err as Error).message;
      toast.error("Cannot Add Mod", errorMsg);
      log.error("Failed to add mod", { modpackId: modpackId.value, modId, error: errorMsg });
    } finally {
      // Remove from pending operations
      const newPending = new Set(pendingOperations.value);
      newPending.delete(modId);
      pendingOperations.value = newPending;
    }
  }

  // Remove mod from modpack
  async function removeMod(modId: string): Promise<void> {
    if (isLinked.value) {
      toast.error(
        "Action Restricted",
        "Cannot remove mods from a linked modpack. Manage mods from the remote source."
      );
      return;
    }

    if (lockedModIds.value.has(modId)) {
      toast.error(
        "Mod Locked",
        "This mod is locked and cannot be removed. Unlock it first."
      );
      return;
    }

    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.info(`Operation already pending for mod ${modId}`);
      return;
    }

    // Check dependency impact before removing
    try {
      const impact = await window.api.modpacks.analyzeModRemovalImpact(
        modpackId.value,
        modId,
        "remove"
      );

      // Only show dialog if there are actual visible items
      const breakingMods = impact.dependentMods.filter((d: { willBreak: boolean }) => d.willBreak);
      const unusedOrphans = impact.orphanedDependencies.filter((d: { usedByOthers: boolean }) => !d.usedByOthers);

      if (breakingMods.length > 0 || unusedOrphans.length > 0) {
        // Show impact dialog
        dependencyImpact.value = { ...impact, action: "remove" };
        pendingModAction.value = { modId, action: "remove" };
        showDependencyImpactDialog.value = true;
        return;
      }

      // No impact, proceed directly
      await executeModRemoval(modId);
    } catch (err) {
      log.error("Failed to remove mod:", err);
    }
  }

  // Execute mod removal (auto-syncs to instance if instantSync is enabled)
  async function executeModRemoval(modId: string): Promise<void> {
    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.debug("Operation already pending for mod", { modId });
      return;
    }
    
    log.info("Removing mod from modpack", { modpackId: modpackId.value, modId });
    pendingOperations.value = new Set([...pendingOperations.value, modId]);
    try {
      // Normal API call - backend handles instant sync if enabled
      await window.api.modpacks.removeMod(modpackId.value, modId);
      await loadData();
      // Refresh sync status
      await refreshSyncStatus();
      onUpdate();
      log.info("Mod removed successfully", { modpackId: modpackId.value, modId });
    } catch (err) {
      log.error("Failed to remove mod", { modpackId: modpackId.value, modId, error: (err as Error).message });
      toast.error("Remove Failed", (err as Error).message);
    } finally {
      // Remove from pending operations
      const newPending = new Set(pendingOperations.value);
      newPending.delete(modId);
      pendingOperations.value = newPending;
    }
  }

  // Toggle mod enabled/disabled
  async function toggleModEnabled(modId: string): Promise<void> {
    // Check if mod is locked
    if (lockedModIds.value.has(modId)) {
      toast.error(
        "Mod Locked",
        "This mod is locked and cannot be enabled/disabled. Unlock it first."
      );
      return;
    }

    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.debug("Operation already pending for mod", { modId });
      return;
    }

    // Check if we're disabling (mod is currently enabled)
    const isCurrentlyEnabled = !disabledModIds.value.has(modId);
    log.info("Toggling mod state", { modId, currentlyEnabled: isCurrentlyEnabled });

    if (isCurrentlyEnabled) {
      // We're about to disable - check dependency impact
      try {
        const impact = await window.api.modpacks.analyzeModRemovalImpact(
          modpackId.value,
          modId,
          "disable"
        );

        if (impact.dependentMods.filter((d: { willBreak: boolean }) => d.willBreak).length > 0) {
          // Show impact dialog
          dependencyImpact.value = { ...impact, action: "disable" };
          pendingModAction.value = { modId, action: "disable" };
          showDependencyImpactDialog.value = true;
          return;
        }
      } catch (err) {
        log.error("Failed to check dependency impact", { modId, error: (err as Error).message });
      }
    }

    // No impact or enabling, proceed
    await executeModToggle(modId);
  }

  // Execute mod toggle (auto-syncs to instance if instantSync is enabled)
  async function executeModToggle(modId: string): Promise<void> {
    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.debug("Operation already pending for mod", { modId });
      return;
    }
    
    pendingOperations.value = new Set([...pendingOperations.value, modId]);
    try {
      // Normal API call - backend handles instant sync if enabled
      const result = await window.api.modpacks.toggleMod(modpackId.value, modId);
      if (result) {
        // Update local state immediately for responsive UI
        if (result.enabled) {
          disabledModIds.value.delete(modId);
          // If viewing disabled filter and enabling a mod, switch to "all"
          if (modsFilter.value === "disabled") {
            modsFilter.value = "all";
          }
        } else {
          disabledModIds.value.add(modId);
        }
        // Trigger reactivity
        disabledModIds.value = new Set(disabledModIds.value);
        // Refresh sync status (should show "in sync" if instant sync worked)
        await refreshSyncStatus();
        // Refresh unsaved changes count
        await refreshUnsavedChangesCount();
        onUpdate();
      }
    } catch (err) {
      log.error("Failed to toggle mod:", err);
      toast.error("Toggle Failed", (err as Error).message);
    } finally {
      // Remove from pending operations
      const newPending = new Set(pendingOperations.value);
      newPending.delete(modId);
      pendingOperations.value = newPending;
    }
  }

  // Toggle mod locked status
  async function toggleModLocked(modId: string): Promise<void> {
    // Prevent concurrent operations on the same mod
    if (pendingOperations.value.has(modId)) {
      log.info(`Operation already pending for mod ${modId}`);
      return;
    }
    
    const isCurrentlyLocked = lockedModIds.value.has(modId);
    const mod = currentMods.value.find((m) => m.id === modId);
    const modName = mod?.name || modId;

    pendingOperations.value = new Set([...pendingOperations.value, modId]);
    try {
      const result = await window.api.modpacks.setModLocked(
        modpackId.value,
        modId,
        !isCurrentlyLocked
      );
      if (result) {
        // Update local state immediately
        if (isCurrentlyLocked) {
          lockedModIds.value.delete(modId);
          toast.success("Mod Unlocked", `${modName} can now be modified`);
        } else {
          lockedModIds.value.add(modId);
          toast.success("Mod Locked", `${modName} is now protected from changes`);
        }
        // Trigger reactivity
        lockedModIds.value = new Set(lockedModIds.value);
        // Refresh unsaved changes count
        await refreshUnsavedChangesCount();
        onUpdate();
      }
    } catch (err) {
      log.error("Failed to toggle mod lock:", err);
      toast.error("Lock Failed", (err as Error).message);
    } finally {
      // Remove from pending operations
      const newPending = new Set(pendingOperations.value);
      newPending.delete(modId);
      pendingOperations.value = newPending;
    }
  }

  // Open mod note dialog
  function openModNoteDialog(mod: Mod): void {
    noteDialogMod.value = mod;
    noteDialogText.value = modNotes.value[mod.id] || "";
    showModNoteDialog.value = true;
  }

  // Save mod note
  async function saveModNote(): Promise<void> {
    if (!noteDialogMod.value || !modpack.value) return;

    isSavingNote.value = true;
    try {
      const modId = noteDialogMod.value.id;
      const newNotes = { ...modNotes.value };

      if (noteDialogText.value.trim()) {
        newNotes[modId] = noteDialogText.value.trim();
      } else {
        delete newNotes[modId];
      }

      // Save to database
      await window.api.modpacks.update(modpackId.value, { mod_notes: newNotes });

      // Update local state
      modNotes.value = newNotes;

      // Refresh unsaved changes count for version history badge
      await refreshUnsavedChangesCount();

      toast.success(
        "Note Saved",
        noteDialogText.value.trim()
          ? `Note saved for ${noteDialogMod.value.name}`
          : `Note removed from ${noteDialogMod.value.name}`
      );

      showModNoteDialog.value = false;
      noteDialogMod.value = null;
      noteDialogText.value = "";
    } catch (err) {
      log.error("Failed to save mod note:", err);
      toast.error("Save Failed", (err as Error).message);
    } finally {
      isSavingNote.value = false;
    }
  }

  // Close mod note dialog
  function closeModNoteDialog(): void {
    showModNoteDialog.value = false;
    noteDialogMod.value = null;
    noteDialogText.value = "";
  }

  // Get mod note
  function getModNote(modId: string): string | undefined {
    return modNotes.value[modId];
  }

  // Mark mod as recently updated (no timeout - user dismisses manually)
  function markAsRecentlyUpdated(modId: string): void {
    recentlyUpdatedMods.value.add(modId);
    // Trigger reactivity
    recentlyUpdatedMods.value = new Set(recentlyUpdatedMods.value);
  }

  // Mark mod as recently added (no timeout - user dismisses manually)
  function markAsRecentlyAdded(modId: string): void {
    recentlyAddedMods.value.add(modId);
    // Trigger reactivity
    recentlyAddedMods.value = new Set(recentlyAddedMods.value);
  }

  // Dismiss a single "new" mod badge
  function dismissNewMod(modId: string): void {
    recentlyAddedMods.value.delete(modId);
    recentlyAddedMods.value = new Set(recentlyAddedMods.value);
  }

  // Dismiss a single "updated" mod badge
  function dismissUpdatedMod(modId: string): void {
    recentlyUpdatedMods.value.delete(modId);
    recentlyUpdatedMods.value = new Set(recentlyUpdatedMods.value);
  }

  // Dismiss all "new" badges at once
  function dismissAllNewMods(): void {
    recentlyAddedMods.value.clear();
    recentlyAddedMods.value = new Set(recentlyAddedMods.value);
  }

  // Dismiss all "updated" badges at once
  function dismissAllUpdatedMods(): void {
    recentlyUpdatedMods.value.clear();
    recentlyUpdatedMods.value = new Set(recentlyUpdatedMods.value);
  }

  // Dismiss all badges (new + updated)
  function dismissAllBadges(): void {
    recentlyAddedMods.value.clear();
    recentlyUpdatedMods.value.clear();
    recentlyAddedMods.value = new Set(recentlyAddedMods.value);
    recentlyUpdatedMods.value = new Set(recentlyUpdatedMods.value);
  }

  // Check if there are any new/updated mods to dismiss
  function hasNewOrUpdatedMods(): boolean {
    return recentlyAddedMods.value.size > 0 || recentlyUpdatedMods.value.size > 0;
  }

  // Confirm dependency impact action
  async function confirmDependencyImpactAction(): Promise<void> {
    if (!pendingModAction.value) return;

    const { modId, action } = pendingModAction.value;

    showDependencyImpactDialog.value = false;

    if (action === "remove") {
      await executeModRemoval(modId);
    } else if (action === "disable") {
      await executeModToggle(modId);
    }

    pendingModAction.value = null;
    dependencyImpact.value = null;
  }

  // Cancel dependency impact action
  function cancelDependencyImpactAction(): void {
    showDependencyImpactDialog.value = false;
    pendingModAction.value = null;
    dependencyImpact.value = null;
  }

  return {
    // Recently tracking
    recentlyAddedMods,
    recentlyUpdatedMods,

    // Dependency Impact Dialog
    showDependencyImpactDialog,
    dependencyImpact,
    pendingModAction,

    // Mod Notes Dialog
    showModNoteDialog,
    noteDialogMod,
    noteDialogText,
    isSavingNote,

    // Mod CRUD Methods
    addMod,
    removeMod,
    executeModRemoval,
    toggleModEnabled,
    executeModToggle,
    toggleModLocked,

    // Mod Notes Methods
    openModNoteDialog,
    saveModNote,
    closeModNoteDialog,
    getModNote,

    // Recently tracking methods
    markAsRecentlyUpdated,
    markAsRecentlyAdded,
    
    // Dismiss badges methods
    dismissNewMod,
    dismissUpdatedMod,
    dismissAllNewMods,
    dismissAllUpdatedMods,
    dismissAllBadges,
    hasNewOrUpdatedMods,

    // Dependency Impact Methods
    confirmDependencyImpactAction,
    cancelDependencyImpactAction,
  };
}
