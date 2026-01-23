/**
 * Electron Preload - Metadata-Only Architecture
 *
 * Exposes simplified API without file-based operations.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// Import type definitions from IPC
import type {
  UpdateInfo,
  UpdateNotAvailableInfo,
  DownloadProgressInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  RefreshDependenciesProgress,
  RunningGameInfo,
} from "./types/ipc";

// Import shared types - canonical source for Mod and Modpack
import type { Mod, Modpack } from "../shared/types";

// Re-export for consumers that import from preload
export type { Mod, Modpack };

// ==================== API ====================

contextBridge.exposeInMainWorld("api", {
  // ========== MODS ==========
  mods: {
    getAll: (): Promise<Mod[]> => ipcRenderer.invoke("mods:getAll"),
    getById: (id: string): Promise<Mod | undefined> =>
      ipcRenderer.invoke("mods:getById", id),
    add: (mod: Omit<Mod, "id" | "created_at">): Promise<Mod> =>
      ipcRenderer.invoke("mods:add", mod),
    update: (id: string, updates: Partial<Mod>): Promise<boolean> =>
      ipcRenderer.invoke("mods:update", id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("mods:delete", id),
    bulkDelete: (ids: string[]): Promise<number> =>
      ipcRenderer.invoke("mods:bulkDelete", ids),
    checkUsage: (
      modIds: string[]
    ): Promise<
      Array<{
        modId: string;
        modName: string;
        modpacks: Array<{ id: string; name: string }>;
      }>
    > => ipcRenderer.invoke("mods:checkUsage", modIds),
    deleteWithModpackCleanup: (
      modIds: string[],
      removeFromModpacks: boolean
    ): Promise<number> =>
      ipcRenderer.invoke(
        "mods:deleteWithModpackCleanup",
        modIds,
        removeFromModpacks
      ),
  },

  // ========== CURSEFORGE ==========
  curseforge: {
    hasApiKey: (): Promise<boolean> =>
      ipcRenderer.invoke("curseforge:hasApiKey"),
    search: (options: {
      query?: string;
      gameVersion?: string;
      modLoader?: string;
      categoryId?: number;
      pageSize?: number;
      index?: number;
      sortField?: number;
      sortOrder?: "asc" | "desc";
      contentType?: "mods" | "resourcepacks" | "shaders" | "modpacks";
      gameType?: "minecraft" | "hytale";
    }): Promise<{ mods: any[]; pagination: any }> =>
      ipcRenderer.invoke("curseforge:search", options),
    getMod: (modId: number): Promise<any | null> =>
      ipcRenderer.invoke("curseforge:getMod", modId),
    getModFiles: (
      modId: number,
      options?: { gameVersion?: string; modLoader?: string }
    ): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getModFiles", modId, options),
    getCategories: (
      contentType?: "mods" | "resourcepacks" | "shaders" | "modpacks",
      gameType?: "minecraft" | "hytale"
    ): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getCategories", contentType, gameType),
    getPopular: (gameVersion?: string, modLoader?: string): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getPopular", gameVersion, modLoader),
    getModLoaders: (gameVersion?: string): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getModLoaders", gameVersion),
    getMinecraftVersions: (): Promise<{ versionString: string; approved: boolean }[]> =>
      ipcRenderer.invoke("curseforge:getMinecraftVersions"),
    getGameClasses: (gameType?: string): Promise<{ id: number; name: string; slug: string }[]> =>
      ipcRenderer.invoke("curseforge:getGameClasses", gameType),
    getLoaderTypes: (): Promise<string[]> =>
      ipcRenderer.invoke("curseforge:getLoaderTypes"),
    addToLibrary: (
      projectId: number,
      fileId: number,
      preferredLoader?: string,
      contentType?: "mods" | "resourcepacks" | "shaders"
    ): Promise<Mod | null> =>
      ipcRenderer.invoke(
        "curseforge:addToLibrary",
        projectId,
        fileId,
        preferredLoader,
        contentType
      ),
    getChangelog: (modId: number, fileId: number): Promise<string> =>
      ipcRenderer.invoke("curseforge:getChangelog", modId, fileId),
    getModDescription: (modId: number): Promise<string> =>
      ipcRenderer.invoke("curseforge:getModDescription", modId),
    getRecommendations: (
      installedCategoryIds: number[],
      gameVersion?: string,
      modLoader?: string,
      excludeModIds?: number[],
      limit?: number,
      randomize?: boolean,
      contentType: "mod" | "resourcepack" | "shader" = "mod"
    ): Promise<Array<{ mod: any; reason: string }>> =>
      ipcRenderer.invoke(
        "curseforge:getRecommendations",
        installedCategoryIds,
        gameVersion,
        modLoader,
        excludeModIds,
        limit,
        randomize,
        contentType
      ),
  },

  // ========== MODPACKS ==========
  modpacks: {
    getAll: (): Promise<Modpack[]> => ipcRenderer.invoke("modpacks:getAll"),
    getById: (id: string): Promise<Modpack | undefined> =>
      ipcRenderer.invoke("modpacks:getById", id),
    verifyCloudStatus: (): Promise<Record<string, "published" | "subscribed" | "error" | null>> =>
      ipcRenderer.invoke("modpacks:verifyCloudStatus"),
    create: (data: {
      name: string;
      version?: string;
      minecraft_version?: string;
      loader?: string;
      description?: string;
    }): Promise<string> => ipcRenderer.invoke("modpacks:create", data),
    add: (data: {
      name: string;
      version?: string;
      minecraft_version?: string;
      loader?: string;
      description?: string;
    }): Promise<string> => ipcRenderer.invoke("modpacks:add", data),
    update: (id: string, updates: Partial<Modpack>): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:update", id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:delete", id),
    getMods: (modpackId: string): Promise<Mod[]> =>
      ipcRenderer.invoke("modpacks:getMods", modpackId),
    getModsMultiple: (modpackIds: string[]): Promise<Record<string, Mod[]>> =>
      ipcRenderer.invoke("modpacks:getModsMultiple", modpackIds),
    addMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    addModsBatch: (modpackId: string, modIds: string[]): Promise<number> =>
      ipcRenderer.invoke("modpacks:addModsBatch", modpackId, modIds),
    checkModDependents: (modpackId: string, modId: string): Promise<Array<{ id: string; name: string; dependencyType: string }>> =>
      ipcRenderer.invoke("modpacks:checkModDependents", modpackId, modId),
    analyzeModRemovalImpact: (
      modpackId: string,
      modId: string,
      action: "remove" | "disable"
    ): Promise<{
      modToAffect: { id: string; name: string } | null;
      dependentMods: Array<{ id: string; name: string; willBreak: boolean; depth?: number }>;
      orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
      warnings: string[];
    }> => ipcRenderer.invoke("modpacks:analyzeModRemovalImpact", modpackId, modId, action),
    refreshDependencies: (modpackId: string, force?: boolean): Promise<{
      updated: number;
      skipped: number;
      errors: string[];
    }> => ipcRenderer.invoke("modpacks:refreshDependencies", modpackId, force),
    onRefreshDependenciesProgress: (callback: (data: RefreshDependenciesProgress) => void) => {
      const handler = (_: IpcRendererEvent, data: RefreshDependenciesProgress) => callback(data);
      ipcRenderer.on("modpacks:refreshDependenciesProgress", handler);
      return () => ipcRenderer.removeListener("modpacks:refreshDependenciesProgress", handler);
    },
    removeMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    toggleMod: (
      modpackId: string,
      modId: string
    ): Promise<{ enabled: boolean } | null> =>
      ipcRenderer.invoke("modpacks:toggleMod", modpackId, modId),
    setModEnabled: (
      modpackId: string,
      modId: string,
      enabled: boolean
    ): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:setModEnabled", modpackId, modId, enabled),
    getDisabledMods: (modpackId: string): Promise<string[]> =>
      ipcRenderer.invoke("modpacks:getDisabledMods", modpackId),
    getLockedMods: (modpackId: string): Promise<string[]> =>
      ipcRenderer.invoke("modpacks:getLockedMods", modpackId),
    generateResourceList: (modpackId: string, options?: {
      format?: 'simple' | 'detailed' | 'markdown';
      sortBy?: 'name' | 'type' | 'source';
      includeDisabled?: boolean;
    }): Promise<{
      list: Array<{
        name: string;
        version: string;
        type: string;
        source: string;
        enabled: boolean;
        locked: boolean;
        url?: string;
      }>;
      formatted: string;
      stats: {
        total: number;
        mods: number;
        resourcepacks: number;
        shaders: number;
        enabled: number;
        disabled: number;
        locked: number;
      };
    }> => ipcRenderer.invoke("modpacks:generateResourceList", modpackId, options),
    setModLocked: (
      modpackId: string,
      modId: string,
      locked: boolean
    ): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:setModLocked", modpackId, modId, locked),
    
    // ========== DIRECT FILE OPERATIONS (Auto-sync to instance) ==========
    // These methods perform database operations AND immediately sync files to the instance
    // Use these instead of the non-Direct versions to eliminate the need for manual sync
    
    /** Add mod and immediately sync file to instance */
    addModDirect: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:addModDirect", modpackId, modId),
    
    /** Add multiple mods and immediately sync files to instance */
    addModsBatchDirect: (modpackId: string, modIds: string[]): Promise<number> =>
      ipcRenderer.invoke("modpacks:addModsBatchDirect", modpackId, modIds),
    
    /** Remove mod and immediately delete file from instance */
    removeModDirect: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:removeModDirect", modpackId, modId),
    
    /** Toggle mod enabled state and immediately rename file in instance */
    toggleModDirect: (
      modpackId: string,
      modId: string
    ): Promise<{ enabled: boolean } | null> =>
      ipcRenderer.invoke("modpacks:toggleModDirect", modpackId, modId),
    
    /** Set mod enabled state and immediately rename file in instance */
    setModEnabledDirect: (
      modpackId: string,
      modId: string,
      enabled: boolean
    ): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:setModEnabledDirect", modpackId, modId, enabled),
    
    updateLockedMods: (
      modpackId: string,
      lockedModIds: string[]
    ): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:updateLockedMods", modpackId, lockedModIds),
    clone: (modpackId: string, newName: string): Promise<string | null> =>
      ipcRenderer.invoke("modpacks:clone", modpackId, newName),
    setImage: (modpackId: string, imageUrl: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:setImage", modpackId, imageUrl),
    openFolder: (modpackId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:openFolder", modpackId),

    // Import from CurseForge URL (for CF Browse feature)
    importFromCurseForgeUrl: (
      downloadUrl: string,
      modpackName: string,
      cfProjectId?: number,
      cfFileId?: number,
      cfSlug?: string,
      onProgress?: (current: number, total: number, modName: string) => void
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => {
      // Set up progress listener if callback provided
      if (onProgress) {
        const progressHandler = (
          _event: Electron.IpcRendererEvent,
          data: { current: number; total: number; modName: string }
        ) => {
          onProgress(data.current, data.total, data.modName);
        };
        ipcRenderer.on("import:progress", progressHandler);
        // Clean up after import completes
        return ipcRenderer
          .invoke("import:curseforgeUrl", downloadUrl, modpackName, cfProjectId, cfFileId, cfSlug)
          .finally(() => {
            ipcRenderer.removeListener("import:progress", progressHandler);
          });
      }
      return ipcRenderer.invoke("import:curseforgeUrl", downloadUrl, modpackName, cfProjectId, cfFileId, cfSlug);
    },

    hasOverrides: (modpackId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:hasOverrides", modpackId),

    hasUnsavedChanges: (modpackId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:hasUnsavedChanges", modpackId),

    getUnsavedChanges: (modpackId: string): Promise<{
      hasChanges: boolean;
      changes: {
        modsAdded: Array<{ id: string; name: string }>;
        modsRemoved: Array<{ id: string; name: string }>;
        modsEnabled: Array<{ id: string; name: string }>;
        modsDisabled: Array<{ id: string; name: string }>;
        modsUpdated: Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>;
        modsLocked: Array<{ id: string; name: string }>;
        modsUnlocked: Array<{ id: string; name: string }>;
        notesAdded: Array<{ id: string; name: string; note: string }>;
        notesRemoved: Array<{ id: string; name: string; note: string }>;
        notesChanged: Array<{ id: string; name: string; oldNote: string; newNote: string }>;
        loaderChanged: { oldLoader?: string; newLoader?: string; oldVersion?: string; newVersion?: string } | null;
        configsChanged: boolean;
        configDetails?: Array<{
          filePath: string;
          keyPath: string;
          line?: number;
          oldValue: any;
          newValue: any;
          timestamp: string;
        }>;
      };
    }> => ipcRenderer.invoke("modpacks:getUnsavedChanges", modpackId),

    revertUnsavedChanges: (modpackId: string): Promise<{
      success: boolean;
      restoredMods: number;
      skippedMods: number;
      missingMods: Array<{ id: string; name: string }>;
    }> => ipcRenderer.invoke("modpacks:revertUnsavedChanges", modpackId),

    // CurseForge update checking
    checkCFUpdate: (
      modpackId: string
    ): Promise<{
      hasUpdate: boolean;
      currentVersion?: string;
      latestVersion?: string;
      latestFileId?: number;
      changelog?: string;
      releaseDate?: string;
      downloadUrl?: string;
    }> => ipcRenderer.invoke("modpacks:checkCFUpdate", modpackId),

    getCFChangelog: (cfProjectId: number, cfFileId: number): Promise<string> =>
      ipcRenderer.invoke("modpacks:getCFChangelog", cfProjectId, cfFileId),

    updateCFModpack: (
      modpackId: string,
      newFileId: number,
      createNew: boolean,
      onProgress?: (current: number, total: number, modName: string) => void
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => {
      if (onProgress) {
        const progressHandler = (
          _event: Electron.IpcRendererEvent,
          data: { current: number; total: number; modName: string }
        ) => {
          onProgress(data.current, data.total, data.modName);
        };
        ipcRenderer.on("import:progress", progressHandler);
        return ipcRenderer
          .invoke("modpacks:updateCFModpack", modpackId, newFileId, createNew)
          .finally(() => {
            ipcRenderer.removeListener("import:progress", progressHandler);
          });
      }
      return ipcRenderer.invoke("modpacks:updateCFModpack", modpackId, newFileId, createNew);
    },

    reSearchIncompatible: (
      modpackId: string,
      onProgress?: (current: number, total: number, modName: string) => void
    ): Promise<{
      found: number;
      notFound: number;
      added: string[];
      stillIncompatible: string[];
    }> => {
      if (onProgress) {
        const progressHandler = (
          _event: Electron.IpcRendererEvent,
          data: { current: number; total: number; modName: string }
        ) => {
          onProgress(data.current, data.total, data.modName);
        };
        ipcRenderer.on("import:progress", progressHandler);
        return ipcRenderer
          .invoke("modpacks:reSearchIncompatible", modpackId)
          .finally(() => {
            ipcRenderer.removeListener("import:progress", progressHandler);
          });
      }
      return ipcRenderer.invoke("modpacks:reSearchIncompatible", modpackId);
    },
  },

  // ========== VERSION CONTROL ==========
  versions: {
    getHistory: (modpackId: string): Promise<{
      modpack_id: string;
      current_version_id: string;
      versions: Array<{
        id: string;
        tag: string;
        message: string;
        created_at: string;
        author?: string;
        changes: Array<{
          type: "added" | "removed" | "updated" | "enabled" | "disabled" | "locked" | "unlocked" | "note_added" | "note_updated" | "note_removed";
          mod_id: string;
          mod_name: string;
          previous_version?: string;
          new_version?: string;
          note?: string;
        }>;
        mod_ids: string[];
        disabled_mod_ids?: string[];
        locked_mod_ids?: string[];
        mod_notes?: Record<string, string>;
        loader?: string;
        loader_version?: string;
        parent_id?: string;
        mod_snapshots?: Array<{
          id: string;
          name: string;
          version?: string;
          source: "curseforge" | "modrinth";
          cf_project_id?: number;
          cf_file_id?: number;
          mr_project_id?: string;
          mr_version_id?: string;
        }>;
        config_snapshot_id?: string;
      }>;
    } | null> =>
      ipcRenderer.invoke("versions:getHistory", modpackId),
    validateRollback: (modpackId: string, versionId: string): Promise<{
      valid: boolean;
      availableMods: Array<{ id: string; name: string }>;
      missingMods: Array<{ id: string; name: string; reason: string }>;
      brokenDependencies: Array<{ modId: string; modName: string; dependsOn: string }>;
    }> =>
      ipcRenderer.invoke("versions:validateRollback", modpackId, versionId),
    initialize: (modpackId: string, message?: string): Promise<{
      id: string;
      tag: string;
      message: string;
      created_at: string;
      changes: Array<any>;
      mod_ids: string[];
    } | null> =>
      ipcRenderer.invoke("versions:initialize", modpackId, message),
    create: (
      modpackId: string,
      message: string,
      tag?: string,
      syncFromInstanceId?: string
    ): Promise<{
      id: string;
      tag: string;
      message: string;
      created_at: string;
      changes: Array<any>;
      mod_ids: string[];
    } | null> =>
      ipcRenderer.invoke("versions:create", modpackId, message, tag, syncFromInstanceId),
    rollback: (modpackId: string, versionId: string): Promise<{
      success: boolean;
      restoredCount: number;
      failedCount: number;
      failedMods: Array<{ modId: string; modName: string; reason: string }>;
      totalMods: number;
      originalModCount: number;
      loaderRestored?: boolean;
    }> =>
      ipcRenderer.invoke("versions:rollback", modpackId, versionId),
    compare: (
      modpackId: string,
      fromVersionId: string,
      toVersionId: string
    ): Promise<Array<{
      type: "added" | "removed" | "updated" | "enabled" | "disabled" | "locked" | "unlocked" | "note_added" | "note_updated" | "note_removed";
      mod_id: string;
      mod_name: string;
      previous_version?: string;
      new_version?: string;
      note?: string;
    }> | null> =>
      ipcRenderer.invoke(
        "versions:compare",
        modpackId,
        fromVersionId,
        toVersionId
      ),
    get: (modpackId: string, versionId: string): Promise<{
      id: string;
      tag: string;
      message: string;
      created_at: string;
      changes: Array<any>;
      mod_ids: string[];
      disabled_mod_ids?: string[];
      locked_mod_ids?: string[];
    } | null> =>
      ipcRenderer.invoke("versions:get", modpackId, versionId),
  },

  // ========== EXPORT ==========
  export: {
    /** Get folder tree for export selection UI */
    getOverridesTree: (
      modpackId: string
    ): Promise<Array<{
      name: string;
      type: "folder" | "file";
      path: string;
      children?: Array<{ name: string; type: "folder" | "file"; path: string }>;
    }>> =>
      ipcRenderer.invoke("export:getOverridesTree", modpackId),
    curseforge: (
      modpackId: string,
      options?: {
        profileName?: string;
        version?: string;
        selectedFolders?: string[];
        /** Specific file/folder paths to exclude (relative paths like "config/mymod.toml") */
        excludedPaths?: string[];
        includeRamRecommendation?: boolean;
        ramRecommendation?: number;
        /** If true, only include server-side mods (isServerPack=true or unspecified) */
        serverModsOnly?: boolean;
      }
    ): Promise<{ success: boolean; path: string } | null> =>
      ipcRenderer.invoke("export:curseforge", modpackId, options),
    modex: (
      modpackId: string,
      options?: {
        versionHistoryMode?: 'full' | 'current';
      }
    ): Promise<{ success: boolean; code: string; path: string } | null> =>
      ipcRenderer.invoke("export:modex", modpackId, options),
    selectPath: (
      defaultName: string,
      extension: string
    ): Promise<string | null> =>
      ipcRenderer.invoke("export:selectPath", defaultName, extension),
    manifest: (
      modpackId: string,
      options?: {
        versionHistoryMode?: 'full' | 'current';
      }
    ): Promise<{ success: boolean; path: string } | null> =>
      ipcRenderer.invoke("export:manifest", modpackId, options),
  },

  // ========== IMPORT ==========
  import: {
    curseforge: (): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
      requiresResolution?: boolean;
      conflicts?: Array<{
        modName: string;
        existingVersion: string;
        newVersion: string;
        existingModId: string;
        projectID: number;
        fileID: number;
        cfMod: any;
        cfFile: any;
        existingMod: {
          id: string;
          name: string;
          version: string;
        };
      }>;
      partialData?: any;
      manifest?: any;
    } | null> => ipcRenderer.invoke("import:curseforge"),
    modex: (): Promise<{
      success: boolean;
      modpackId: string;
      code: string;
      isUpdate: boolean;
      requiresResolution?: boolean;
      conflicts?: Array<{
        modName: string;
        existingVersion: string;
        newVersion: string;
        existingModId: string;
        modEntry: any;
        existingMod: {
          id: string;
          name: string;
          version: string;
        };
      }>;
      partialData?: any;
      manifest?: any;
      changes?: {
        added: number;
        removed: number;
        unchanged: number;
        updated: number;
        downloaded: number;
        enabled: number;
        disabled: number;
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
        enabledMods: string[];
        disabledMods: string[];
      };
    } | null> => ipcRenderer.invoke("import:modex"),
    modexFromData: (
      manifest: any,
      modpackId?: string
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported?: number;
      modsSkipped?: number;
      errors?: string[];
      requiresResolution?: boolean;
      conflicts?: any[];
      isUpdate?: boolean;
      changes?: any;
    } | null> =>
      ipcRenderer.invoke("import:modex:manifest", manifest, modpackId),
    resolveConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        modEntry: any;
        existingMod: any;
        resolution: "use_existing" | "use_new";
      }>;
      partialData: any;
      manifest: any;
    }): Promise<{
      success: boolean;
      modpackId: string;
      code: string;
      isUpdate: boolean;
      changes?: {
        added: number;
        removed: number;
        unchanged: number;
        updated: number;
        downloaded: number;
        enabled: number;
        disabled: number;
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
        enabledMods: string[];
        disabledMods: string[];
      };
    }> => ipcRenderer.invoke("import:resolveConflicts", data),
    resolveCFConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        projectID: number;
        fileID: number;
        existingModId: string;
        resolution: "use_existing" | "use_new";
      }>;
    }): Promise<{
      success: boolean;
      modpackId: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => ipcRenderer.invoke("import:resolveCFConflicts", data),
  },

  // ========== REMOTE UPDATES ==========
  remote: {
    exportManifest: (modpackId: string, options?: {
      versionHistoryMode?: 'full' | 'current';
    }): Promise<string> =>
      ipcRenderer.invoke("remote:exportManifest", modpackId, options),
    checkUpdate: (
      modpackId: string
    ): Promise<{
      hasUpdate: boolean;
      remoteManifest?: any;
      changes?: {
        added: number;
        removed: number;
        updated: number;
        addedMods: { name: string; version: string }[];
        removedMods: string[];
        updatedMods: string[];
        enabledMods: string[];
        disabledMods: string[];
        lockedMods: string[];
        unlockedMods: string[];
        notesAdded: Array<{ modName: string; note: string }>;
        notesRemoved: Array<{ modName: string; note: string }>;
        notesChanged: Array<{ modName: string; oldNote: string; newNote: string }>;
        hasVersionHistoryChanges?: boolean;
        // Metadata changes
        loaderChanged?: { from?: string; to?: string };
        loaderVersionChanged?: { from?: string; to?: string };
        minecraftVersionChanged?: { from?: string; to?: string };
      };
    }> => ipcRenderer.invoke("remote:checkUpdate", modpackId),
    /** Import a modpack directly from a remote Gist/URL */
    importFromUrl: (
      url: string
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modpackName?: string;
      modsImported?: number;
      error?: string;
      alreadyExists?: boolean;
      message?: string;
    }> => ipcRenderer.invoke("remote:importFromUrl", url),
  },

  // ========== UPDATES ==========
  updates: {
    checkAppUpdate: (): Promise<{
      hasUpdate: boolean;
      currentVersion?: string;
      latestVersion?: string;
      releaseUrl?: string;
      releaseName?: string;
      releaseNotes?: string;
      publishedAt?: string;
      noReleases?: boolean;
      error?: string;
      isPrerelease?: boolean;
      canAutoUpdate?: boolean;
    }> => ipcRenderer.invoke("updates:checkAppUpdate"),
    
    /** Download the update in background */
    downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("updates:downloadUpdate"),
    
    /** Install the downloaded update and restart */
    installUpdate: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("updates:installUpdate"),
    
    /** Listen to update events */
    onUpdateChecking: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("update:checking", listener);
      return () => ipcRenderer.removeListener("update:checking", listener);
    },
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const listener = (_: IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on("update:available", listener);
      return () => ipcRenderer.removeListener("update:available", listener);
    },
    onUpdateNotAvailable: (callback: (info: UpdateNotAvailableInfo) => void) => {
      const listener = (_: IpcRendererEvent, info: UpdateNotAvailableInfo) => callback(info);
      ipcRenderer.on("update:not-available", listener);
      return () => ipcRenderer.removeListener("update:not-available", listener);
    },
    onDownloadProgress: (callback: (progress: DownloadProgressInfo) => void) => {
      const listener = (_: IpcRendererEvent, progress: DownloadProgressInfo) => callback(progress);
      ipcRenderer.on("update:download-progress", listener);
      return () => ipcRenderer.removeListener("update:download-progress", listener);
    },
    onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void) => {
      const listener = (_: IpcRendererEvent, info: UpdateDownloadedInfo) => callback(info);
      ipcRenderer.on("update:downloaded", listener);
      return () => ipcRenderer.removeListener("update:downloaded", listener);
    },
    onUpdateError: (callback: (error: UpdateErrorInfo) => void) => {
      const listener = (_: IpcRendererEvent, error: UpdateErrorInfo) => callback(error);
      ipcRenderer.on("update:error", listener);
      return () => ipcRenderer.removeListener("update:error", listener);
    },
    
    setApiKey: (apiKey: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("updates:setApiKey", apiKey),
    getApiKey: (): Promise<string> =>
      ipcRenderer.invoke("updates:getApiKey"),
    checkMod: (
      modId: number,
      gameVersion: string,
      loader: string,
      contentType: "mod" | "resourcepack" | "shader"
    ): Promise<{
      id: number;
      modId: number;
      displayName: string;
      fileName: string;
      releaseType: number;
      fileDate: string;
      fileLength: number;
      downloadCount: number;
      downloadUrl: string | null;
      gameVersions: string[];
      dependencies: Array<{ modId: number; relationType: number }>;
      fileFingerprint: number;
    } | null> =>
      ipcRenderer.invoke(
        "updates:checkMod",
        modId,
        gameVersion,
        loader,
        contentType
      ),
    checkAll: (): Promise<
      Array<{
        modId: string;
        projectId: string | null;
        projectName: string;
        currentVersion: string;
        hasUpdate: boolean;
        latestVersion: string | null;
        source: string;
        updateUrl: string | null;
        newFileId?: number;
      }>
    > => ipcRenderer.invoke("updates:checkAll"),
    checkModpack: (
      modpackId: string
    ): Promise<
      Array<{
        modId: string;
        projectId: string | null;
        projectName: string;
        currentVersion: string;
        hasUpdate: boolean;
        latestVersion: string | null;
        source: string;
        updateUrl: string | null;
        newFileId?: number;
      }>
    > => ipcRenderer.invoke("updates:checkModpack", modpackId),
    applyUpdate: (
      modId: string,
      newFileId: number,
      modpackId?: string
    ): Promise<{
      success: boolean;
      error?: string;
      newModId?: string;
      oldModId?: string;
    }> => ipcRenderer.invoke("updates:applyUpdate", modId, newFileId, modpackId),
  },

  // ========== GIST ==========
  gist: {
    hasToken: (): Promise<boolean> => ipcRenderer.invoke("gist:hasToken"),
    getToken: (): Promise<string> => ipcRenderer.invoke("gist:getToken"),
    setToken: (token: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("gist:setToken", token),
    getUser: (): Promise<{ login: string; avatarUrl: string } | null> =>
      ipcRenderer.invoke("gist:getUser"),
    listGists: (options?: { perPage?: number; page?: number }): Promise<Array<{
      id: string;
      description: string;
      htmlUrl: string;
      rawUrl: string;
      files: string[];
      isPublic: boolean;
      createdAt: string;
      updatedAt: string;
    }>> => ipcRenderer.invoke("gist:listGists", options),
    getGist: (gistId: string): Promise<{
      id: string;
      description: string;
      htmlUrl: string;
      rawUrl: string;
      files: string[];
      isPublic: boolean;
      createdAt: string;
      updatedAt: string;
    } | null> => ipcRenderer.invoke("gist:getGist", gistId),
    gistExists: (gistId: string): Promise<boolean> => 
      ipcRenderer.invoke("gist:gistExists", gistId),
    deleteGist: (modpackId: string): Promise<{
      success: boolean;
      error?: string;
    }> => ipcRenderer.invoke("gist:deleteGist", modpackId),
    createGist: (options: {
      description: string;
      filename: string;
      content: string;
      isPublic?: boolean;
    }): Promise<{
      success: boolean;
      gistId?: string;
      htmlUrl?: string;
      rawUrl?: string;
      error?: string;
    }> => ipcRenderer.invoke("gist:createGist", options),
    updateGist: (options: {
      gistId: string;
      filename: string;
      content: string;
      description?: string;
    }): Promise<{
      success: boolean;
      gistId?: string;
      htmlUrl?: string;
      rawUrl?: string;
      error?: string;
    }> => ipcRenderer.invoke("gist:updateGist", options),
    pushManifest: (
      modpackId: string,
      options?: {
        gistId?: string;
        filename?: string;
        isPublic?: boolean;
        versionHistoryMode?: 'full' | 'current';
      }
    ): Promise<{
      success: boolean;
      gistId?: string;
      htmlUrl?: string;
      rawUrl?: string;
      error?: string;
    }> => ipcRenderer.invoke("gist:pushManifest", modpackId, options),
  },

  // ========== DIALOGS ==========
  dialogs: {
    selectZipFile: (): Promise<string | null> =>
      ipcRenderer.invoke("dialogs:selectZipFile"),
    selectImage: (): Promise<string | null> =>
      ipcRenderer.invoke("dialogs:selectImage"),
  },

  // ========== ANALYZER ==========
  analyzer: {
    analyzeModpack: (
      modpackId: string
    ): Promise<{
      missingDependencies: Array<{
        modId: number;
        modName: string;
        requiredBy: string[];
        slug?: string;
      }>;
      conflicts: Array<{
        mod1: { id: string; name: string; curseforge_id?: number };
        mod2: { id: string; name: string; curseforge_id?: number };
        type: 'duplicate' | 'loader_mismatch';
        severity: 'error' | 'warning' | 'info';
        description: string;
        suggestion?: string;
        reason?: string;
      }>;
      orphanedDependencies: Array<{
        id: string;
        name: string;
        wasRequiredBy: string[];
        confidence: 'high' | 'medium' | 'low';
        reason: string;
      }>;
      dependencyChains: Array<{
        rootMod: { id: string; name: string };
        chain: Array<{ id: string; name: string; depth: number }>;
      }>;
      totalMods: number;
      satisfiedDependencies: number;
    }> => ipcRenderer.invoke("analyzer:analyzeModpack", modpackId),

    checkDependencies: (
      curseforgeId: number,
      loader: string,
      gameVersion: string
    ): Promise<Array<{
      modId: number;
      name: string;
      type: "required" | "optional" | "embedded" | "incompatible";
      slug?: string;
    }>> => ipcRenderer.invoke("analyzer:checkDependencies", curseforgeId, loader, gameVersion),

    /** Analyze all mods in the library for conflicts and dependencies */
    analyzeLibrary: (): Promise<{
      missingDependencies: Array<{
        modId: number;
        modName: string;
        modSlug: string;
        thumbnailUrl?: string;
        relationType: 'required' | 'optional' | 'embedded' | 'tool' | 'include';
        status: 'missing' | 'present' | 'outdated';
        requiredBy: string[];
        suggestedFile?: {
          fileId: number;
          fileName: string;
          gameVersion: string;
          downloadUrl: string | null;
        };
      }>;
      conflicts: Array<{
        mod1: { id: string; name: string; curseforge_id?: number };
        mod2: { id: string; name: string; curseforge_id?: number };
        type: 'duplicate' | 'loader_mismatch';
        severity: 'error' | 'warning' | 'info';
        description: string;
        suggestion?: string;
        reason?: string;
      }>;
      orphanedDependencies: Array<{
        id: string;
        name: string;
        wasRequiredBy: string[];
        confidence: 'high' | 'medium' | 'low';
        reason: string;
      }>;
      dependencyChains: Array<{
        rootMod: { id: string; name: string };
        chain: Array<{ id: string; name: string; depth: number }>;
      }>;
      totalMods: number;
      satisfiedDependencies: number;
    }> => ipcRenderer.invoke("analyzer:analyzeLibrary"),

    /** Get performance tips for a modpack */
    getPerformanceTips: (modpackId: string): Promise<string[]> =>
      ipcRenderer.invoke("analyzer:getPerformanceTips", modpackId),

    /** Install a missing dependency into the library and optionally a modpack */
    installDependency: (
      depInfo: {
        modId: number;
        modName: string;
        modSlug: string;
        thumbnailUrl?: string;
        relationType: 'required' | 'optional' | 'embedded' | 'tool' | 'include';
        status: 'missing' | 'present' | 'outdated';
        requiredBy: string[];
        suggestedFile?: {
          fileId: number;
          fileName: string;
          gameVersion: string;
          downloadUrl: string | null;
        };
      },
      modpackId?: string
    ): Promise<{ success: boolean; mod?: any; error?: string }> =>
      ipcRenderer.invoke("analyzer:installDependency", depInfo, modpackId),
  },

  // ========== MINECRAFT INSTALLATIONS ==========
  minecraft: {
    detectInstallations: (): Promise<Array<{
      id: string;
      name: string;
      type: "vanilla" | "prism" | "multimc" | "curseforge" | "atlauncher" | "gdlauncher" | "modrinth" | "custom";
      path: string;
      modsPath: string;
      version?: string;
      loader?: string;
      lastUsed?: string;
      isDefault?: boolean;
      icon?: string;
    }>> => ipcRenderer.invoke("minecraft:detectInstallations"),

    getInstallations: (): Promise<Array<{
      id: string;
      name: string;
      type: string;
      path: string;
      modsPath: string;
      version?: string;
      loader?: string;
      lastUsed?: string;
      isDefault?: boolean;
      icon?: string;
    }>> => ipcRenderer.invoke("minecraft:getInstallations"),

    addCustom: (name: string, mcPath: string, modsPath?: string): Promise<{
      id: string;
      name: string;
      type: string;
      path: string;
      modsPath: string;
      version?: string;
      loader?: string;
      lastUsed?: string;
      isDefault?: boolean;
      icon?: string;
    }> =>
      ipcRenderer.invoke("minecraft:addCustomInstallation", name, mcPath, modsPath),

    remove: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:removeInstallation", id),

    setDefault: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:setDefault", id),

    getDefault: (): Promise<{
      id: string;
      name: string;
      type: string;
      path: string;
      modsPath: string;
      version?: string;
      loader?: string;
      lastUsed?: string;
      isDefault?: boolean;
      icon?: string;
    } | undefined> =>
      ipcRenderer.invoke("minecraft:getDefault"),

    syncModpack: (
      installationId: string,
      modpackId: string,
      options?: { clearExisting?: boolean; createBackup?: boolean },
      onProgress?: (current: number, total: number, modName: string) => void
    ): Promise<{
      success: boolean;
      synced: number;
      skipped: number;
      errors: string[];
      syncedMods: string[];
    }> => {
      if (onProgress) {
        const handler = (_event: Electron.IpcRendererEvent, data: { current: number; total: number; modName: string }) => {
          onProgress(data.current, data.total, data.modName);
        };
        ipcRenderer.on("sync:progress", handler);
        return ipcRenderer.invoke("minecraft:syncModpack", installationId, modpackId, options)
          .finally(() => ipcRenderer.removeListener("sync:progress", handler));
      }
      return ipcRenderer.invoke("minecraft:syncModpack", installationId, modpackId, options);
    },

    openModsFolder: (installationId: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:openModsFolder", installationId),

    launch: (installationId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("minecraft:launch", installationId),

    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke("minecraft:selectFolder"),

    selectLauncher: (): Promise<string | null> =>
      ipcRenderer.invoke("minecraft:selectLauncher"),

    setLauncherPath: (type: string, launcherPath: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:setLauncherPath", type, launcherPath),

    getLauncherPaths: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke("minecraft:getLauncherPaths"),
  },

  // ========== MODEX INSTANCES ==========
  instances: {
    getAll: (): Promise<Array<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      memory?: { min: number; max: number };
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    }>> => ipcRenderer.invoke("instance:getAll"),

    get: (id: string): Promise<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      lastSynced?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    } | null> =>
      ipcRenderer.invoke("instance:get", id),

    getByModpack: (modpackId: string): Promise<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      lastSynced?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    } | null> =>
      ipcRenderer.invoke("instance:getByModpack", modpackId),

    create: (options: {
      name: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      modpackId?: string;
      description?: string;
      icon?: string;
      memory?: { min: number; max: number };
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    }): Promise<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      lastSynced?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    }> => ipcRenderer.invoke("instance:create", options),

    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:delete", id),

    update: (id: string, updates: Partial<{
      name: string;
      description?: string;
      icon?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      minecraftVersion?: string;
      loader?: string;
      loaderVersion?: string;
    }>): Promise<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      lastSynced?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    } | null> =>
      ipcRenderer.invoke("instance:update", id, updates),

    syncModpack: (
      instanceId: string,
      modpackId: string,
      options?: {
        clearExisting?: boolean;
        configSyncMode?: "overwrite" | "new_only" | "skip";
        overridesZipPath?: string;
      }
    ): Promise<{
      success: boolean;
      modsDownloaded: number;
      modsSkipped: number;
      configsCopied: number;
      configsSkipped: number;
      errors: string[];
      warnings: string[];
    }> => ipcRenderer.invoke("instance:syncModpack", instanceId, modpackId, options),

    syncConfigsToModpack: (
      instanceId: string,
      modpackId: string
    ): Promise<{ filesSynced: number; warnings: string[] }> =>
      ipcRenderer.invoke("instance:syncConfigsToModpack", instanceId, modpackId),

    launch: (instanceId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("instance:launch", instanceId),

    openFolder: (instanceId: string, subfolder?: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:openFolder", instanceId, subfolder),

    getStats: (instanceId: string): Promise<{
      modCount: number;
      configCount: number;
      totalSize: string;
      folders: Array<{ name: string; count: number }>;
    } | null> => ipcRenderer.invoke("instance:getStats", instanceId),

    checkSyncStatus: (instanceId: string, modpackId: string): Promise<{
      needsSync: boolean;
      missingInInstance: Array<{ filename: string; type: string }>;
      extraInInstance: Array<{ filename: string; type: string }>;
      disabledMismatch: Array<{ filename: string; issue: string }>;
      updatesToApply: Array<{ oldFilename: string; newFilename: string; type: string; willBeDisabled?: boolean }>;
      configDifferences: number;
      totalDifferences: number;
      loaderVersionMismatch?: boolean;
    }> => ipcRenderer.invoke("instance:checkSyncStatus", instanceId, modpackId),

    getModifiedConfigs: (instanceId: string, modpackId: string): Promise<{
      modifiedConfigs: Array<{
        relativePath: string;
        instancePath: string;
        overridePath?: string;
        status: 'modified' | 'new' | 'deleted';
        lastModified: Date;
        size: number;
      }>;
      instanceConfigPath: string;
      overridesConfigPath?: string;
    }> => ipcRenderer.invoke("instance:getModifiedConfigs", instanceId, modpackId),

    importConfigs: (instanceId: string, modpackId: string, configPaths: string[]): Promise<{
      success: boolean;
      imported: number;
      skipped: number;
      errors: string[];
    }> => ipcRenderer.invoke("instance:importConfigs", instanceId, modpackId, configPaths),

    export: (instanceId: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:export", instanceId),

    duplicate: (instanceId: string, newName: string): Promise<{
      id: string;
      name: string;
      description?: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      path: string;
      modpackId?: string;
      icon?: string;
      modCount?: number;
      createdAt: string;
      lastPlayed?: string;
      playTime?: number;
      state: "ready" | "installing" | "error";
      lastSynced?: string;
      memory?: { min: number; max: number };
      javaArgs?: string;
      source?: {
        type: "curseforge" | "modrinth" | "local";
        projectId?: number;
        fileId?: number;
        name?: string;
        version?: string;
      };
    } | null> =>
      ipcRenderer.invoke("instance:duplicate", instanceId, newName),

    getLauncherConfig: (): Promise<{
      vanillaPath?: string;
      javaPath?: string;
      defaultMemory: { min: number; max: number };
    }> => ipcRenderer.invoke("instance:getLauncherConfig"),

    setLauncherConfig: (config: {
      vanillaPath?: string;
      javaPath?: string;
      defaultMemory?: { min: number; max: number };
    }): Promise<void> => ipcRenderer.invoke("instance:setLauncherConfig", config),

    // Mod Loader Verification & Repair
    verifyModLoader: (loader: string, loaderVersion: string, minecraftVersion: string): Promise<{
      isValid: boolean;
      loader: "fabric" | "forge" | "neoforge" | "quilt" | "vanilla";
      loaderVersion: string;
      minecraftVersion: string;
      versionJsonValid: boolean;
      versionJsonPath: string;
      totalLibraries: number;
      validLibraries: number;
      invalidLibraries: Array<{ name: string; path: string; exists: boolean; size?: number; sha1Valid?: boolean }>;
      missingLibraries: Array<{ name: string; path: string; exists: boolean }>;
      baseVersionInstalled: boolean;
      errors: string[];
      warnings: string[];
      canRepair: boolean;
    }> => ipcRenderer.invoke("instance:verifyModLoader", loader, loaderVersion, minecraftVersion),

    repairModLoader: (loader: string, loaderVersion: string, minecraftVersion: string): Promise<{
      success: boolean;
      librariesRepaired: number;
      librariesFailed: number;
      errors: string[];
      fullReinstall: boolean;
    }> => ipcRenderer.invoke("instance:repairModLoader", loader, loaderVersion, minecraftVersion),

    verifyAndRepair: (instanceId: string, autoRepair?: boolean): Promise<{
      canLaunch: boolean;
      repaired: boolean;
      errors: string[];
    }> => ipcRenderer.invoke("instance:verifyAndRepair", instanceId, autoRepair),

    onRepairProgress: (callback: (data: { stage: string; current: number; total: number; detail?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("instance:repairProgress", handler);
      return () => ipcRenderer.removeListener("instance:repairProgress", handler);
    },

    onVerifyProgress: (callback: (data: { stage: string; current: number; total: number; detail?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("instance:verifyProgress", handler);
      return () => ipcRenderer.removeListener("instance:verifyProgress", handler);
    },

    createFromModpack: (
      modpackId: string,
      options?: { overridesZipPath?: string }
    ): Promise<{
      instance: {
        id: string;
        name: string;
        description?: string;
        minecraftVersion: string;
        loader: string;
        loaderVersion?: string;
        path: string;
        modpackId?: string;
        icon?: string;
        modCount?: number;
        createdAt: string;
        lastPlayed?: string;
        playTime?: number;
        state: "ready" | "installing" | "error";
        lastSynced?: string;
        memory?: { min: number; max: number };
        javaArgs?: string;
        source?: {
          type: "curseforge" | "modrinth" | "local";
          projectId?: number;
          fileId?: number;
          name?: string;
          version?: string;
        };
      };
      syncResult: {
        success: boolean;
        modsDownloaded: number;
        modsSkipped: number;
        configsCopied: number;
        configsSkipped: number;
        errors: string[];
        warnings: string[];
      };
    } | null> => ipcRenderer.invoke("instance:createFromModpack", modpackId, options),

    onSyncProgress: (callback: (data: { stage: string; current: number; total: number; item?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("instance:syncProgress", handler);
      return () => ipcRenderer.removeListener("instance:syncProgress", handler);
    },

    // Game tracking
    getRunningGame: (instanceId: string): Promise<{
      instanceId: string;
      launcherPid?: number;
      gamePid?: number;
      startTime: number;
      status: "launching" | "loading_mods" | "running" | "stopped";
      loadedMods: number;
      totalMods: number;
      currentMod?: string;
      gameProcessRunning: boolean;
    } | null> => ipcRenderer.invoke("instance:getRunningGame", instanceId),

    killGame: (instanceId: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:killGame", instanceId),

    /** Get all running games (for reload detection) */
    getAllRunningGames: (): Promise<Array<{
      instanceId: string;
      launcherPid?: number;
      gamePid?: number;
      startTime: number;
      status: "launching" | "loading_mods" | "running" | "stopped";
      loadedMods: number;
      totalMods: number;
      currentMod?: string;
      gameProcessRunning: boolean;
    }>> => ipcRenderer.invoke("instance:getAllRunningGames"),

    onGameStatusChange: (callback: (data: {
      instanceId: string;
      launcherPid?: number;
      gamePid?: number;
      startTime: number;
      status: "launching" | "loading_mods" | "running" | "stopped";
      loadedMods: number;
      totalMods: number;
      currentMod?: string;
      gameProcessRunning: boolean;
    }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("game:statusChange", handler);
      return () => ipcRenderer.removeListener("game:statusChange", handler);
    },

    /** Subscribe to real-time game log lines */
    onLogLine: (callback: (data: {
      instanceId: string;
      time: string;
      level: string;
      message: string;
      raw: string;
    }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("game:logLine", handler);
      return () => ipcRenderer.removeListener("game:logLine", handler);
    },
  },

  // ========== IMAGE CACHE ==========
  cache: {
    getImage: (url: string): Promise<string> =>
      ipcRenderer.invoke("cache:getImage", url),

    cacheImage: (url: string): Promise<string | null> =>
      ipcRenderer.invoke("cache:cacheImage", url),

    prefetch: (urls: string[]): Promise<void> =>
      ipcRenderer.invoke("cache:prefetch", urls),

    getStats: (): Promise<{
      totalSize: number;
      entryCount: number;
      hitRate: number;
      memoryUsage: number;
      oldestEntry: number;
      newestEntry: number;
    }> => ipcRenderer.invoke("cache:getStats"),

    clear: (): Promise<void> =>
      ipcRenderer.invoke("cache:clear"),
  },

  // ========== SETTINGS ==========
  settings: {
    getInstanceSync: (): Promise<{
      autoSyncBeforeLaunch: boolean;
      autoImportConfigsAfterGame: boolean;
      showSyncConfirmation: boolean;
      defaultConfigSyncMode: "overwrite" | "new_only" | "skip";
      /** Instant sync: immediately apply mod changes to instance files */
      instantSync: boolean;
    }> => ipcRenderer.invoke("settings:getInstanceSync"),

    setInstanceSync: (settings: {
      autoSyncBeforeLaunch?: boolean;
      autoImportConfigsAfterGame?: boolean;
      showSyncConfirmation?: boolean;
      defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
      /** Instant sync: immediately apply mod changes to instance files */
      instantSync?: boolean;
    }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("settings:setInstanceSync", settings),

    getGist: (): Promise<{
      defaultManifestMode: "full" | "current";
    }> => ipcRenderer.invoke("settings:getGist"),

    setGist: (settings: {
      defaultManifestMode?: "full" | "current";
    }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("settings:setGist", settings),

    /** Smart launch with automatic sync if needed */
    smartLaunch: (instanceId: string, modpackId: string, options?: {
      forceSync?: boolean;
      skipSync?: boolean;
      configSyncMode?: "overwrite" | "new_only" | "skip";
    }): Promise<{
      success: boolean;
      error?: string;
      needsSync?: boolean;
      requiresConfirmation?: boolean;
      syncStatus?: {
        needsSync: boolean;
        loaderVersionMismatch?: boolean;
        differences?: number;
        lastSynced?: string;
        missingInInstance: Array<{ filename: string; type: string }>;
        extraInInstance: Array<{ filename: string; type: string }>;
        disabledMismatch: Array<{ filename: string; issue: string }>;
        configDifferences: number;
        totalDifferences?: number;
      };
      syncPerformed: boolean;
      syncResult?: {
        success: boolean;
        modsDownloaded: number;
        modsSkipped: number;
        configsCopied: number;
        configsSkipped: number;
        errors: string[];
        warnings: string[];
      };
    }> => ipcRenderer.invoke("instance:smartLaunch", instanceId, modpackId, options),
  },

  // ========== MODPACK PREVIEW ==========
  preview: {
    fromZip: (zipPath: string): Promise<{
      name: string;
      version: string;
      author?: string;
      description?: string;
      minecraftVersion: string;
      modLoader: string;
      modLoaderVersion?: string;
      modCount: number;
      mods: Array<{ projectId: number; fileId: number; name?: string; required: boolean }>;
      resourcePackCount: number;
      shaderCount: number;
      source: string;
      overridesCount: number;
      configFilesCount: number;
      totalSize?: number;
    } | null> => ipcRenderer.invoke("preview:fromZip", zipPath),

    fromCurseForge: (modpackData: { id: number; name: string; authors?: Array<{ name: string }>; summary?: string }, fileData: { id: number; displayName?: string; fileName?: string; gameVersions?: string[]; dependencies?: Array<{ modId: number; fileId?: number; relationType?: number }>; modules?: Array<{ type: number }>; fileLength?: number }): Promise<{
      name: string;
      version: string;
      author?: string;
      description?: string;
      minecraftVersion: string;
      modLoader: string;
      modLoaderVersion?: string;
      modCount: number;
      mods: Array<{ projectId: number; fileId: number; name?: string; required: boolean }>;
      resourcePackCount: number;
      shaderCount: number;
      source: string;
      cfProjectId?: number;
      cfFileId?: number;
      overridesCount: number;
      configFilesCount: number;
      totalSize?: number;
    } | null> =>
      ipcRenderer.invoke("preview:fromCurseForge", modpackData, fileData),

    // Deprecated - returns null (RAM analysis removed)
    analyzeModpack: (_modpackId: string): Promise<null> => ipcRenderer.invoke("preview:analyzeModpack"),

    selectAndPreview: (): Promise<{
      path: string;
      preview: {
        name: string;
        version: string;
        author?: string;
        description?: string;
        minecraftVersion: string;
        modLoader: string;
        modLoaderVersion?: string;
        modCount: number;
        mods: Array<{ projectId: number; fileId: number; name?: string; required: boolean }>;
        resourcePackCount: number;
        shaderCount: number;
        source: string;
        overridesCount: number;
        configFilesCount: number;
        totalSize?: number;
      } | null;
    } | null> => ipcRenderer.invoke("preview:selectZip"),
  },

  // ========== LIBRARY PAGINATION ==========
  library: {
    getPaginated: (options: {
      page: number;
      pageSize: number;
      search?: string;
      loader?: string;
      gameVersion?: string;
      contentType?: string;
      sortBy?: string;
      sortDir?: "asc" | "desc";
      favorites?: boolean;
      folderId?: string;
    }): Promise<{
      mods: any[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }> => ipcRenderer.invoke("mods:getPaginated", options),
  },

  // ========== CONFIG SERVICE ==========
  configs: {
    /** Get all config folders for an instance */
    getFolders: (instanceId: string): Promise<Array<{
      path: string;
      name: string;
      fileCount: number;
      totalSize: number;
      subfolders: any[];
      files: Array<{
        path: string;
        name: string;
        extension: string;
        size: number;
        modified: string;
        type: string;
        folder: string;
        modId?: string;
      }>;
    }>> => ipcRenderer.invoke("config:getFolders", instanceId),

    /** Search for config files */
    search: (instanceId: string, query: string): Promise<Array<{
      path: string;
      name: string;
      extension: string;
      size: number;
      modified: string;
      type: string;
      folder: string;
      modId?: string;
    }>> => ipcRenderer.invoke("config:search", instanceId, query),

    /** Read a config file's content */
    read: (instanceId: string, configPath: string): Promise<{
      content: string;
      parsed?: any;
      encoding: string;
      parseError?: string;
    }> => ipcRenderer.invoke("config:read", instanceId, configPath),

    /** Write content to a config file */
    write: (instanceId: string, configPath: string, content: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:write", instanceId, configPath, content),

    /** Delete a config file */
    delete: (instanceId: string, configPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:delete", instanceId, configPath),

    /** Create a new config file */
    create: (instanceId: string, configPath: string, content?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:create", instanceId, configPath, content),

    /** Export configs to zip file */
    export: (instanceId: string, folders?: string[]): Promise<{
      path: string;
      manifest: {
        exportedAt: string;
        sourceInstanceId: string;
        sourceInstanceName: string;
        modpackId?: string;
        folders: string[];
        fileCount: number;
      };
    } | null> => ipcRenderer.invoke("config:export", instanceId, folders),

    /** Import configs from zip file */
    import: (instanceId: string, overwrite?: boolean): Promise<{
      imported: number;
      skipped: number;
      errors: string[];
    } | null> => ipcRenderer.invoke("config:import", instanceId, overwrite),

    /** Compare configs between two instances */
    compare: (instanceId1: string, instanceId2: string, folder?: string): Promise<{
      onlyInFirst: string[];
      onlyInSecond: string[];
      different: string[];
      identical: string[];
    }> => ipcRenderer.invoke("config:compare", instanceId1, instanceId2, folder),

    /** Get diff of a specific config between two instances */
    diff: (instanceId1: string, instanceId2: string, configPath: string): Promise<{
      content1: string;
      content2: string;
    }> => ipcRenderer.invoke("config:diff", instanceId1, instanceId2, configPath),

    /** Create a backup of all configs */
    backup: (instanceId: string): Promise<{ path: string }> =>
      ipcRenderer.invoke("config:backup", instanceId),

    /** List available config backups */
    listBackups: (instanceId: string): Promise<Array<{
      path: string;
      date: string;
      size: number;
    }>> => ipcRenderer.invoke("config:listBackups", instanceId),

    /** Restore a config backup */
    restoreBackup: (instanceId: string, backupPath: string): Promise<{ restored: number }> =>
      ipcRenderer.invoke("config:restoreBackup", instanceId, backupPath),

    /** Delete a config backup */
    deleteBackup: (backupPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:deleteBackup", backupPath),

    /** Copy specific config files between instances */
    copyFiles: (sourceInstanceId: string, targetInstanceId: string, configPaths: string[], overwrite?: boolean): Promise<{
      copied: number;
      skipped: number;
      errors: string[];
    }> => ipcRenderer.invoke("config:copyFiles", sourceInstanceId, targetInstanceId, configPaths, overwrite),

    /** Copy entire config folder between instances */
    copyFolder: (sourceInstanceId: string, targetInstanceId: string, folder?: string, overwrite?: boolean): Promise<{
      copied: number;
    }> => ipcRenderer.invoke("config:copyFolder", sourceInstanceId, targetInstanceId, folder, overwrite),

    /** Open config file in external editor */
    openExternal: (instanceId: string, configPath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:openExternal", instanceId, configPath),

    /** Open config folder in file explorer */
    openFolder: (instanceId: string, folder?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:openFolder", instanceId, folder),

    // ========== STRUCTURED CONFIG EDITOR ==========

    /** Parse a config file into structured key-value pairs */
    parseStructured: (instanceId: string, configPath: string): Promise<{
      path: string;
      type: string;
      sections: Array<{
        name: string;
        displayName: string;
        comment?: string;
        entries: Array<{
          keyPath: string;
          key: string;
          value: any;
          originalValue: any;
          type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
          comment?: string;
          section?: string;
          depth: number;
          modified: boolean;
          line?: number;
        }>;
        subsections: any[];
        expanded: boolean;
      }>;
      allEntries: Array<{
        keyPath: string;
        key: string;
        value: any;
        originalValue: any;
        type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
        comment?: string;
        section?: string;
        depth: number;
        modified: boolean;
        line?: number;
      }>;
      errors: string[];
      rawContent: string;
      encoding: string;
    }> => ipcRenderer.invoke("config:parseStructured", instanceId, configPath),

    /** Save structured config modifications with version control */
    saveStructured: (instanceId: string, configPath: string, modifications: Array<{
      key: string;
      oldValue: any;
      newValue: any;
      section?: string;
    }>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:saveStructured", instanceId, configPath, modifications),

    /** Get all config modifications history for an instance */
    getModifications: (instanceId: string): Promise<Array<{
      id: string;
      timestamp: string;
      configPath: string;
      modifications: Array<{
        key: string;
        oldValue: any;
        newValue: any;
        section?: string;
      }>;
    }>> => ipcRenderer.invoke("config:getModifications", instanceId),

    /** Rollback a specific config change set */
    rollbackChanges: (instanceId: string, changeSetId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("config:rollbackChanges", instanceId, changeSetId),
  },

  // ========== GAME PROFILES ==========
  game: {
    getProfiles: () => ipcRenderer.invoke("game:getProfiles"),
    getProfilesByGameType: (gameType: string) => ipcRenderer.invoke("game:getProfilesByGameType", gameType),
    getProfile: (id: string) => ipcRenderer.invoke("game:getProfile", id),
    getDefaultProfile: (gameType: string) => ipcRenderer.invoke("game:getDefaultProfile", gameType),
    getGameConfig: (gameType: string) => ipcRenderer.invoke("game:getGameConfig", gameType),
    getActiveGameType: () => ipcRenderer.invoke("game:getActiveGameType"),
    setActiveGameType: (gameType: string) => ipcRenderer.invoke("game:setActiveGameType", gameType),
    createProfile: (options: {
      gameType: string;
      name: string;
      description?: string;
      icon?: string;
      launcherPath?: string;
      modsPath?: string;
    }) => ipcRenderer.invoke("game:createProfile", options),
    updateProfile: (id: string, updates: Record<string, any>) => ipcRenderer.invoke("game:updateProfile", id, updates),
    deleteProfile: (id: string) => ipcRenderer.invoke("game:deleteProfile", id),
    setDefaultProfile: (id: string) => ipcRenderer.invoke("game:setDefaultProfile", id),
    detectGame: (gameType: string) => ipcRenderer.invoke("game:detectGame", gameType),
    detectAllGames: () => ipcRenderer.invoke("game:detectAllGames"),
    launchGame: (profileId: string) => ipcRenderer.invoke("game:launchGame", profileId),
    openModsFolder: (profileId: string) => ipcRenderer.invoke("game:openModsFolder", profileId),
  },

  // ========== HYTALE ==========
  hytale: {
    getConfig: () => ipcRenderer.invoke("hytale:getConfig"),
    setConfig: (config: { modsPath?: string; launcherPath?: string }) => ipcRenderer.invoke("hytale:setConfig", config),
    scanMods: () => ipcRenderer.invoke("hytale:scanMods"),
    getInstalledMods: () => ipcRenderer.invoke("hytale:getInstalledMods"),
    installMod: (sourceFilePath: string, metadata: {
      id: string;
      name: string;
      version: string;
      cfProjectId?: number;
      cfFileId?: number;
      logoUrl?: string;
    }) => ipcRenderer.invoke("hytale:installMod", sourceFilePath, metadata),
    removeMod: (id: string) => ipcRenderer.invoke("hytale:removeMod", id),
    toggleMod: (id: string) => ipcRenderer.invoke("hytale:toggleMod", id),
    getModpacks: () => ipcRenderer.invoke("hytale:getModpacks"),
    getModpack: (id: string) => ipcRenderer.invoke("hytale:getModpack", id),
    getActiveModpack: () => ipcRenderer.invoke("hytale:getActiveModpack"),
    createModpack: (options: {
      name: string;
      description?: string;
      imageUrl?: string;
      modIds?: string[];
    }) => ipcRenderer.invoke("hytale:createModpack", options),
    updateModpack: (id: string, updates: Record<string, any>) => ipcRenderer.invoke("hytale:updateModpack", id, updates),
    deleteModpack: (id: string) => ipcRenderer.invoke("hytale:deleteModpack", id),
    saveToModpack: (modpackId: string) => ipcRenderer.invoke("hytale:saveToModpack", modpackId),
    activateModpack: (modpackId: string) => ipcRenderer.invoke("hytale:activateModpack", modpackId),
    compareWithModpack: (modpackId: string) => ipcRenderer.invoke("hytale:compareWithModpack", modpackId),
    duplicateModpack: (modpackId: string, newName: string) => ipcRenderer.invoke("hytale:duplicateModpack", modpackId, newName),
    toggleModInModpack: (modpackId: string, modId: string) => ipcRenderer.invoke("hytale:toggleModInModpack", modpackId, modId),
    addModToModpack: (modpackId: string, modId: string) => ipcRenderer.invoke("hytale:addModToModpack", modpackId, modId),
    removeModFromModpack: (modpackId: string, modId: string) => ipcRenderer.invoke("hytale:removeModFromModpack", modpackId, modId),
    isInstalled: () => ipcRenderer.invoke("hytale:isInstalled"),
    launch: () => ipcRenderer.invoke("hytale:launch"),
    openModsFolder: () => ipcRenderer.invoke("hytale:openModsFolder"),
    openModFolder: (modId: string) => ipcRenderer.invoke("hytale:openModFolder", modId),
    getStats: () => ipcRenderer.invoke("hytale:getStats"),
    // World management
    getWorlds: () => ipcRenderer.invoke("hytale:getWorlds"),
    toggleSaveMod: (saveId: string, modId: string, enabled: boolean) =>
      ipcRenderer.invoke("hytale:toggleSaveMod", saveId, modId, enabled),
    openSaveFolder: (saveId: string) => ipcRenderer.invoke("hytale:openSaveFolder", saveId),
    saveWorldModConfig: (worldId: string, modConfigs: { modId: string; enabled: boolean }[]) => 
      ipcRenderer.invoke("hytale:saveWorldModConfig", worldId, modConfigs),
    getWorldModConfig: (worldId: string) => ipcRenderer.invoke("hytale:getWorldModConfig", worldId),
    applyWorldModConfig: (worldId: string) => ipcRenderer.invoke("hytale:applyWorldModConfig", worldId),
    // Download mod file (actually downloads the file for Hytale installation)
    downloadModFile: (downloadUrl: string, fileName: string): Promise<string> =>
      ipcRenderer.invoke("hytale:downloadModFile", downloadUrl, fileName),
    // Delete a mod
    deleteMod: (modId: string) => ipcRenderer.invoke("hytale:removeMod", modId),
    // Update checking
    checkForUpdates: (): Promise<Array<{
      modId: string;
      hytaleModId?: string;
      projectId: number | null;
      projectName: string;
      currentVersion: string;
      currentFileId: number | null;
      latestVersion: string | null;
      latestFileId: number | null;
      hasUpdate: boolean;
      updateUrl: string | null;
    }>> => ipcRenderer.invoke("hytale:checkForUpdates"),
    applyUpdate: (modId: string, newFileId: number): Promise<{ success: boolean; error?: string; newModId?: string }> =>
      ipcRenderer.invoke("hytale:applyUpdate", modId, newFileId),
  },

  // ========== LOGGING ==========
  logging: {
    /** Send a log entry from renderer to main process */
    log: (entry: {
      timestamp: string;
      level: "debug" | "info" | "warn" | "error";
      context: string;
      message: string;
      data?: unknown;
      stack?: string;
    }): void => {
      ipcRenderer.send("logging:log", entry);
    },
    
    /** Get recent log entries */
    getRecentLogs: (count?: number): Promise<Array<{
      timestamp: string;
      level: "debug" | "info" | "warn" | "error";
      context: string;
      message: string;
      data?: unknown;
      stack?: string;
    }>> => ipcRenderer.invoke("logging:getRecentLogs", count),
    
    /** Get path to current log file */
    getLogFilePath: (): Promise<string | null> => 
      ipcRenderer.invoke("logging:getLogFilePath"),
    
    /** Get all log files */
    getLogFiles: (): Promise<string[]> => 
      ipcRenderer.invoke("logging:getLogFiles"),
    
    /** Clear all log files */
    clearLogs: (): Promise<void> => 
      ipcRenderer.invoke("logging:clearLogs"),
    
    /** Open logs folder in file explorer */
    openLogsFolder: (): Promise<void> => 
      ipcRenderer.invoke("logging:openLogsFolder"),
  },

  // ========== EVENTS ==========
  on: (channel: string, callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(channel, handler);
    // Return a cleanup function to properly remove the listener
    return () => {
      ipcRenderer.off(channel, handler);
    };
  },

  // ========== SYSTEM INFO ==========
  system: {
    getMemoryInfo: (): Promise<{
      total: number;
      free: number;
      used: number;
      suggestedMax: number;
    }> => ipcRenderer.invoke("system:getMemoryInfo"),
  },
});

// ==================== IPC RENDERER ====================

contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) =>
      listener(event, ...args)
    );
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});
