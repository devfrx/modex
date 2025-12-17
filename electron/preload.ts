/**
 * Electron Preload - Metadata-Only Architecture
 *
 * Exposes simplified API without file-based operations.
 */

import { contextBridge, ipcRenderer } from "electron";

// ==================== TYPES ====================

export interface Mod {
  id: string;
  name: string;
  slug?: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  thumbnail_url?: string;
  download_count?: number;
  release_type?: "release" | "beta" | "alpha";
  date_released?: string;
  created_at: string;
  filename: string;
  source: "curseforge" | "modrinth";
  cf_project_id?: number;
  cf_file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
  tags?: string[];
  favorite?: boolean;
}

export interface Modpack {
  id: string;
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at?: string;
  mod_count?: number;
  favorite?: boolean;
  share_code?: string;
  mod_ids: string[];
}

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
      contentType?: "mods" | "resourcepacks" | "shaders"
    ): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getCategories", contentType),
    getPopular: (gameVersion?: string, modLoader?: string): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getPopular", gameVersion, modLoader),
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
      dependentMods: Array<{ id: string; name: string; willBreak: boolean }>;
      orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
      warnings: string[];
    }> => ipcRenderer.invoke("modpacks:analyzeModRemovalImpact", modpackId, modId, action),
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
          _event: any,
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

    // Profiles
    createProfile: (modpackId: string, name: string): Promise<any | null> =>
      ipcRenderer.invoke("modpacks:createProfile", modpackId, name),

    deleteProfile: (modpackId: string, profileId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:deleteProfile", modpackId, profileId),

    applyProfile: (modpackId: string, profileId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:applyProfile", modpackId, profileId),

    // Profile config management
    saveProfileConfigs: (modpackId: string, profileId: string): Promise<string | null> =>
      ipcRenderer.invoke("modpacks:saveProfileConfigs", modpackId, profileId),

    applyProfileConfigs: (modpackId: string, profileId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:applyProfileConfigs", modpackId, profileId),

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
        configsChanged: boolean;
      };
    }> => ipcRenderer.invoke("modpacks:getUnsavedChanges", modpackId),

    revertUnsavedChanges: (modpackId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:revertUnsavedChanges", modpackId),

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
          _event: any,
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
          _event: any,
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
    getHistory: (modpackId: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:getHistory", modpackId),
    validateRollback: (modpackId: string, versionId: string): Promise<{
      valid: boolean;
      availableMods: Array<{ id: string; name: string }>;
      missingMods: Array<{ id: string; name: string; reason: string }>;
      brokenDependencies: Array<{ modId: string; modName: string; dependsOn: string }>;
    }> =>
      ipcRenderer.invoke("versions:validateRollback", modpackId, versionId),
    initialize: (modpackId: string, message?: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:initialize", modpackId, message),
    create: (
      modpackId: string,
      message: string,
      tag?: string,
      syncFromInstanceId?: string
    ): Promise<any | null> =>
      ipcRenderer.invoke("versions:create", modpackId, message, tag, syncFromInstanceId),
    rollback: (modpackId: string, versionId: string): Promise<boolean> =>
      ipcRenderer.invoke("versions:rollback", modpackId, versionId),
    compare: (
      modpackId: string,
      fromVersionId: string,
      toVersionId: string
    ): Promise<any[] | null> =>
      ipcRenderer.invoke(
        "versions:compare",
        modpackId,
        fromVersionId,
        toVersionId
      ),
    get: (modpackId: string, versionId: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:get", modpackId, versionId),
  },

  // ========== EXPORT ==========
  export: {
    curseforge: (
      modpackId: string
    ): Promise<{ success: boolean; path: string } | null> =>
      ipcRenderer.invoke("export:curseforge", modpackId),
    modex: (
      modpackId: string
    ): Promise<{ success: boolean; code: string; path: string } | null> =>
      ipcRenderer.invoke("export:modex", modpackId),
    selectPath: (
      defaultName: string,
      extension: string
    ): Promise<string | null> =>
      ipcRenderer.invoke("export:selectPath", defaultName, extension),
    manifest: (
      modpackId: string
    ): Promise<{ success: boolean; path: string } | null> =>
      ipcRenderer.invoke("export:manifest", modpackId),
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
    exportManifest: (modpackId: string): Promise<string> =>
      ipcRenderer.invoke("remote:exportManifest", modpackId),
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
        enabledMods?: string[];
        disabledMods?: string[];
        hasVersionHistoryChanges?: boolean;
      };
    }> => ipcRenderer.invoke("remote:checkUpdate", modpackId),
  },

  // ========== UPDATES ==========
  updates: {
    setApiKey: (
      source: "curseforge" | "modrinth",
      apiKey: string
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("updates:setApiKey", source, apiKey),
    getApiKey: (source: "curseforge" | "modrinth"): Promise<string> =>
      ipcRenderer.invoke("updates:getApiKey", source),
    checkMod: (
      modId: number,
      gameVersion: string,
      loader: string,
      contentType: "mod" | "resourcepack" | "shader"
    ) =>
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
        hasUpdate: boolean;
        latestVersion: string | null;
        source: string;
        newFileId?: number;
      }>
    > => ipcRenderer.invoke("updates:checkAll"),
    checkModpack: (
      modpackId: string
    ): Promise<
      Array<{
        modId: string;
        hasUpdate: boolean;
        latestVersion: string | null;
        source: string;
        newFileId?: number;
      }>
    > => ipcRenderer.invoke("updates:checkModpack", modpackId),
    applyUpdate: (
      modId: string,
      newFileId: number
    ): Promise<{
      success: boolean;
      error?: string;
    }> => ipcRenderer.invoke("updates:applyUpdate", modId, newFileId),
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
        mod1: { id: string; name: string };
        mod2: { id: string; name: string };
        reason: string;
      }>;
      performanceStats: {
        totalMods: number;
        clientOnly: number;
        optimizationMods: number;
        resourceHeavy: number;
        graphicsIntensive: number;
        worldGenMods: number;
      };
      recommendations: string[];
    }> => ipcRenderer.invoke("analyzer:analyzeModpack", modpackId),

    checkDependencies: (
      modId: string
    ): Promise<{
      dependencies: Array<{
        modId: number;
        name: string;
        type: "required" | "optional" | "embedded" | "incompatible";
        slug?: string;
      }>;
      conflicts: Array<{
        modId: number;
        name: string;
        reason: string;
      }>;
      performanceImpact: "positive" | "neutral" | "negative" | "unknown";
    }> => ipcRenderer.invoke("analyzer:checkDependencies", modId),

    getPerformanceTips: (modpackId: string): Promise<string[]> =>
      ipcRenderer.invoke("analyzer:getPerformanceTips", modpackId),
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
    
    addCustom: (name: string, mcPath: string, modsPath?: string): Promise<any> =>
      ipcRenderer.invoke("minecraft:addCustomInstallation", name, mcPath, modsPath),
    
    remove: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:removeInstallation", id),
    
    setDefault: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("minecraft:setDefault", id),
    
    getDefault: (): Promise<any> =>
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
        const handler = (_event: any, data: { current: number; total: number; modName: string }) => {
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

    get: (id: string): Promise<any | null> =>
      ipcRenderer.invoke("instance:get", id),

    getByModpack: (modpackId: string): Promise<any | null> =>
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
    }): Promise<any> => ipcRenderer.invoke("instance:create", options),

    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:delete", id),

    update: (id: string, updates: any): Promise<any | null> =>
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
      configDifferences: number;
      totalDifferences: number;
    }> => ipcRenderer.invoke("instance:checkSyncStatus", instanceId, modpackId),

    export: (instanceId: string): Promise<boolean> =>
      ipcRenderer.invoke("instance:export", instanceId),

    duplicate: (instanceId: string, newName: string): Promise<any | null> =>
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

    createFromModpack: (
      modpackId: string,
      options?: { overridesZipPath?: string }
    ): Promise<{
      instance: any;
      syncResult: {
        success: boolean;
        modsDownloaded: number;
        modsSkipped: number;
        configsCopied: number;
        errors: string[];
        warnings: string[];
      };
    } | null> => ipcRenderer.invoke("instance:createFromModpack", modpackId, options),

    onSyncProgress: (callback: (data: { stage: string; current: number; total: number; item?: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("instance:syncProgress", handler);
      return () => ipcRenderer.removeListener("instance:syncProgress", handler);
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

  // ========== MODPACK PREVIEW/ANALYSIS ==========
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
      analysis: {
        estimatedRamMin: number;
        estimatedRamRecommended: number;
        estimatedRamMax: number;
        performanceImpact: number;
        loadTimeImpact: number;
        storageImpact: number;
        warnings: string[];
        recommendations: string[];
        compatibilityScore: number;
      };
      source: string;
      overridesCount: number;
      configFilesCount: number;
      totalSize?: number;
    } | null> => ipcRenderer.invoke("preview:fromZip", zipPath),
    
    fromCurseForge: (modpackData: any, fileData: any): Promise<any> =>
      ipcRenderer.invoke("preview:fromCurseForge", modpackData, fileData),
    
    analyzeModpack: (modpackId: string): Promise<{
      estimatedRamMin: number;
      estimatedRamRecommended: number;
      estimatedRamMax: number;
      performanceImpact: number;
      loadTimeImpact: number;
      storageImpact: number;
      warnings: string[];
      recommendations: string[];
      compatibilityScore: number;
    } | null> => ipcRenderer.invoke("preview:analyzeModpack", modpackId),
    
    selectAndPreview: (): Promise<{
      path: string;
      preview: any;
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

  // ========== EVENTS ==========
  on: (channel: string, callback: (data: any) => void) => {
    ipcRenderer.on(channel, (_event, data) => callback(data));
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
