/**
 * Electron API Types - Metadata-Only Architecture
 */

import type {
  Mod,
  Modpack,
  CreateModpackData,
  ModUpdateInfo,
  CurseForgeManifest,
  ModexManifest,
  ModFolder,
  TreeNode,
  ModpackVersion,
  ModpackVersionHistory,
  ModpackChange,
  ModpackProfile,
  MinecraftInstallation,
  SyncResult,
  ModpackPreview,
  CacheStats,
  PaginationInfo,
  ModexInstance,
  InstanceSyncResult,
  InstanceLaunchResult,
  InstanceStats,
  ConfigFile,
  ConfigFolder,
  ConfigContent,
  ConfigExport,
  ConfigBackup,
  ConfigComparison,
} from "./index";

// Re-export core types
export type {
  Mod,
  Modpack,
  CreateModpackData,
  ModUpdateInfo,
  ModFolder,
  TreeNode,
  ModpackVersion,
  ModpackVersionHistory,
  ModpackChange,
  ModpackProfile,
};

// ==================== MOD USAGE ====================

export interface ModUsageInfo {
  modId: string;
  modName: string;
  modpacks: Array<{ id: string; name: string }>;
}

// ==================== ROLLBACK RESULT ====================

export interface RollbackResult {
  success: boolean;
  restoredCount: number;
  failedCount: number;
  failedMods: Array<{ modId: string; modName: string; reason: string }>;
  totalMods: number;
  originalModCount: number;
}

// ==================== ELECTRON API ====================

export interface ElectronAPI {
  // ========== MODS ==========
  mods: {
    getAll: () => Promise<Mod[]>;
    getById: (id: string) => Promise<Mod | undefined>;
    add: (mod: Omit<Mod, "id" | "created_at">) => Promise<Mod>;
    update: (id: string, updates: Partial<Mod>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    bulkDelete: (ids: string[]) => Promise<number>;
    checkUsage: (modIds: string[]) => Promise<ModUsageInfo[]>;
    deleteWithModpackCleanup: (
      modIds: string[],
      removeFromModpacks: boolean
    ) => Promise<number>;
  };

  // ========== CURSEFORGE ==========
  curseforge: {
    hasApiKey: () => Promise<boolean>;
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
    }) => Promise<{ mods: CFMod[]; pagination: CFPagination }>;
    getMod: (modId: number) => Promise<CFMod | null>;
    getModFiles: (
      modId: number,
      options?: {
        gameVersion?: string;
        modLoader?: string;
      }
    ) => Promise<CFFile[]>;
    getCategories: (
      contentType?: "mods" | "resourcepacks" | "shaders" | "modpacks"
    ) => Promise<CFCategory[]>;
    getPopular: (gameVersion?: string, modLoader?: string) => Promise<CFMod[]>;
    /** Add a mod from CurseForge to library (metadata only, no download) */
    addToLibrary: (
      projectId: number,
      fileId: number,
      preferredLoader?: string,
      contentType?: "mods" | "resourcepacks" | "shaders"
    ) => Promise<Mod | null>;
    /** Get changelog HTML for a specific file */
    getChangelog: (modId: number, fileId: number) => Promise<string>;
    /** Get full description HTML for a mod */
    getModDescription: (modId: number) => Promise<string>;
    /** Get smart mod recommendations based on installed mod categories */
    getRecommendations: (
      installedCategoryIds: number[],
      gameVersion?: string,
      modLoader?: string,
      excludeModIds?: number[],
      limit?: number,
      randomize?: boolean,
      contentType?: "mod" | "resourcepack" | "shader"
    ) => Promise<Array<{ mod: CFMod; reason: string }>>;
  };

  // ========== MODPACKS ==========
  modpacks: {
    getAll: () => Promise<Modpack[]>;
    getById: (id: string) => Promise<Modpack | undefined>;
    create: (data: CreateModpackData) => Promise<string>;
    /** Alias for create - adds a new modpack */
    add: (data: CreateModpackData) => Promise<string>;
    update: (id: string, updates: Partial<Modpack>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getMods: (modpackId: string) => Promise<Mod[]>;
    /** Get mods for multiple modpacks in a single call */
    getModsMultiple: (modpackIds: string[]) => Promise<Record<string, Mod[]>>;
    addMod: (modpackId: string, modId: string) => Promise<boolean>;
    /** Add multiple mods to a modpack in a single call */
    addModsBatch: (modpackId: string, modIds: string[]) => Promise<number>;
    /** Check which mods depend on a given mod (for removal warnings) */
    checkModDependents: (modpackId: string, modId: string) => Promise<Array<{
      id: string;
      name: string;
      dependencyType: string;
    }>>;
    /** Analyze full impact of removing or disabling a mod */
    analyzeModRemovalImpact: (
      modpackId: string,
      modId: string,
      action: "remove" | "disable"
    ) => Promise<{
      modToAffect: { id: string; name: string } | null;
      dependentMods: Array<{ id: string; name: string; willBreak: boolean }>;
      orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
      warnings: string[];
    }>;
    removeMod: (modpackId: string, modId: string) => Promise<boolean>;
    /** Toggle a mod's enabled/disabled state */
    toggleMod: (
      modpackId: string,
      modId: string
    ) => Promise<{ enabled: boolean } | null>;
    /** Set a mod's enabled state explicitly */
    setModEnabled: (
      modpackId: string,
      modId: string,
      enabled: boolean
    ) => Promise<boolean>;
    /** Get list of disabled mod IDs */
    getDisabledMods: (modpackId: string) => Promise<string[]>;
    clone: (modpackId: string, newName: string) => Promise<string | null>;
    setImage: (modpackId: string, imageUrl: string) => Promise<boolean>;
    openFolder: (modpackId: string) => Promise<boolean>;
    /** Import modpack from CurseForge download URL */
    importFromCurseForgeUrl: (
      downloadUrl: string,
      modpackName: string,
      cfProjectId?: number,
      cfFileId?: number,
      cfSlug?: string,
      onProgress?: (current: number, total: number, modName: string) => void
    ) => Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }>;
    // Profiles
    createProfile: (
      modpackId: string,
      name: string
    ) => Promise<ModpackProfile | null>;
    deleteProfile: (modpackId: string, profileId: string) => Promise<boolean>;
    applyProfile: (modpackId: string, profileId: string) => Promise<boolean>;

    // Profile config management
    /** Save current configs as profile-specific configs */
    saveProfileConfigs: (modpackId: string, profileId: string) => Promise<string | null>;
    /** Apply profile-specific config overrides */
    applyProfileConfigs: (modpackId: string, profileId: string) => Promise<boolean>;
    /** Check if modpack has saved overrides */
    hasOverrides: (modpackId: string) => Promise<boolean>;
    /** Check if modpack has unsaved changes (compared to last saved version) */
    hasUnsavedChanges: (modpackId: string) => Promise<boolean>;
    /** Get detailed unsaved changes for a modpack */
    getUnsavedChanges: (modpackId: string) => Promise<{
      hasChanges: boolean;
      changes: {
        modsAdded: Array<{ id: string; name: string }>;
        modsRemoved: Array<{ id: string; name: string }>;
        modsEnabled: Array<{ id: string; name: string }>;
        modsDisabled: Array<{ id: string; name: string }>;
        modsUpdated: Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>;
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
    }>;
    /** Revert all unsaved changes to the last saved version */
    revertUnsavedChanges: (modpackId: string) => Promise<{
      success: boolean;
      restoredMods: number;
      skippedMods: number;
      missingMods: Array<{ id: string; name: string }>;
    }>;

    // CurseForge update checking
    /** Check for CurseForge modpack updates */
    checkCFUpdate: (modpackId: string) => Promise<{
      hasUpdate: boolean;
      currentVersion?: string;
      latestVersion?: string;
      latestFileId?: number;
      changelog?: string;
      releaseDate?: string;
      downloadUrl?: string;
    }>;
    /** Get changelog for a CurseForge modpack file */
    getCFChangelog: (cfProjectId: number, cfFileId: number) => Promise<string>;
    /** Update CurseForge modpack to a new version */
    updateCFModpack: (
      modpackId: string,
      newFileId: number,
      createNew: boolean,
      onProgress?: (current: number, total: number, modName: string) => void
    ) => Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }>;
    /** Re-search CurseForge for compatible versions of incompatible mods */
    reSearchIncompatible: (
      modpackId: string,
      onProgress?: (current: number, total: number, modName: string) => void
    ) => Promise<{
      found: number;
      notFound: number;
      added: string[];
      stillIncompatible: string[];
    }>;
  };

  // ========== VERSION CONTROL ==========
  versions: {
    /** Get version history for a modpack */
    getHistory: (modpackId: string) => Promise<ModpackVersionHistory | null>;
    /** Validate mods before rollback - check availability and dependencies */
    validateRollback: (modpackId: string, versionId: string) => Promise<{
      valid: boolean;
      availableMods: Array<{ id: string; name: string }>;
      missingMods: Array<{ id: string; name: string; reason: string }>;
      brokenDependencies: Array<{ modId: string; modName: string; dependsOn: string }>;
    }>;
    /** Initialize version control for a modpack */
    initialize: (
      modpackId: string,
      message?: string
    ) => Promise<ModpackVersion | null>;
    /** Create a new version (commit) - optionally sync configs from instance first */
    create: (
      modpackId: string,
      message: string,
      tag?: string,
      syncFromInstanceId?: string
    ) => Promise<ModpackVersion | null>;
    /** Rollback to a specific version */
    rollback: (modpackId: string, versionId: string) => Promise<RollbackResult>;
    /** Compare two versions */
    compare: (
      modpackId: string,
      fromVersionId: string,
      toVersionId: string
    ) => Promise<ModpackChange[] | null>;
    /** Get a specific version */
    get: (
      modpackId: string,
      versionId: string
    ) => Promise<ModpackVersion | null>;
  };

  // ========== EXPORT/IMPORT ==========
  export: {
    /** Export modpack as CurseForge manifest.json inside ZIP */
    curseforge: (
      modpackId: string
    ) => Promise<{ success: boolean; path: string } | null>;
    /** Export modpack as MODEX manifest */
    modex: (
      modpackId: string
    ) => Promise<{ success: boolean; code: string; path: string } | null>;
    /** Select save location */
    selectPath: (
      defaultName: string,
      extension: string
    ) => Promise<string | null>;
    /** Export raw manifest JSON for debug/sharing */
    manifest: (
      modpackId: string
    ) => Promise<{ success: boolean; path: string } | null>;
  };

  import: {
    /** Import CurseForge modpack from ZIP (manifest.json) */
    curseforge: () => Promise<{
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
    } | null>;
    /** Import MODEX modpack */
    modex: () => Promise<{
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
    } | null>;
    /** Import MODEX modpack from manifest data */
    modexFromData: (
      manifest: any,
      modpackId?: string
    ) => Promise<{
      success: boolean;
      modpackId?: string;
      modsImported?: number;
      modsSkipped?: number;
      errors?: string[];
      requiresResolution?: boolean;
      conflicts?: any[];
      isUpdate?: boolean;
      changes?: any;
    } | null>;
    /** Resolve version conflicts during import */
    resolveConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        modEntry: any;
        existingMod: any;
        resolution: "use_existing" | "use_new";
      }>;
      partialData: any;
      manifest: any;
    }) => Promise<{
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
    }>;
    /** Resolve CurseForge import conflicts */
    resolveCFConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        projectID: number;
        fileID: number;
        existingModId: string;
        resolution: "use_existing" | "use_new";
      }>;
    }) => Promise<{
      success: boolean;
      modpackId: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }>;
  };

  remote: {
    exportManifest: (modpackId: string) => Promise<string>;
    checkUpdate: (modpackId: string) => Promise<{
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
        hasVersionHistoryChanges?: boolean;
      };
    }>;
    /** Import a modpack directly from a remote Gist/URL */
    importFromUrl: (url: string) => Promise<{
      success: boolean;
      modpackId?: string;
      modpackName?: string;
      modsImported?: number;
      error?: string;
      alreadyExists?: boolean;
      message?: string;
    }>;
  };

  // ========== UPDATES ==========
  updates: {
    setApiKey: (
      source: "curseforge" | "modrinth",
      apiKey: string
    ) => Promise<{ success: boolean }>;
    getApiKey: (source: "curseforge" | "modrinth") => Promise<string>;
    checkMod: (
      modId: number,
      gameVersion: string,
      loader: string,
      contentType: "mod" | "resourcepack" | "shader"
    ) => Promise<CFFile | null>;
    checkAll: () => Promise<ModUpdateInfo[]>;
    checkModpack: (modpackId: string) => Promise<ModUpdateInfo[]>;
    /** Apply update by storing new file ID in metadata */
    applyUpdate: (
      modId: string,
      newFileId: number
    ) => Promise<{ success: boolean; error?: string }>;
  };

  // ========== DIALOGS ==========
  dialogs: {
    selectZipFile: () => Promise<string | null>;
    selectImage: () => Promise<string | null>;
  };

  // ========== ANALYZER ==========
  analyzer: {
    analyzeModpack: (modpackId: string) => Promise<ModpackAnalysis>;
    checkDependencies: (
      curseforgeId: number,
      loader: string,
      gameVersion: string
    ) => Promise<Array<{
      modId: number;
      name: string;
      type: "required" | "optional" | "embedded" | "incompatible";
      slug?: string;
    }>>;
    getPerformanceTips: (modpackId: string) => Promise<string[]>;
  };

  // ========== MINECRAFT INSTALLATIONS ==========
  minecraft: {
    detectInstallations: () => Promise<MinecraftInstallation[]>;
    getInstallations: () => Promise<MinecraftInstallation[]>;
    addCustom: (name: string, mcPath: string, modsPath?: string) => Promise<MinecraftInstallation>;
    remove: (id: string) => Promise<boolean>;
    setDefault: (id: string) => Promise<boolean>;
    getDefault: () => Promise<MinecraftInstallation | null>;
    syncModpack: (
      installationId: string,
      modpackId: string,
      options?: { clearExisting?: boolean; createBackup?: boolean },
      onProgress?: (current: number, total: number, modName: string) => void
    ) => Promise<SyncResult>;
    openModsFolder: (installationId: string) => Promise<boolean>;
    launch: (installationId?: string) => Promise<{ success: boolean; error?: string }>;
    selectFolder: () => Promise<string | null>;
    selectLauncher: () => Promise<string | null>;
    setLauncherPath: (type: string, launcherPath: string) => Promise<boolean>;
    getLauncherPaths: () => Promise<Record<string, string>>;
  };

  // ========== IMAGE CACHE ==========
  cache: {
    getImage: (url: string) => Promise<string>;
    cacheImage: (url: string) => Promise<string | null>;
    prefetch: (urls: string[]) => Promise<void>;
    getStats: () => Promise<CacheStats>;
    clear: () => Promise<void>;
  };

  // ========== SETTINGS ==========
  settings: {
    getInstanceSync: () => Promise<{
      autoSyncBeforeLaunch: boolean;
      autoImportConfigsAfterGame: boolean;
      showSyncConfirmation: boolean;
      defaultConfigSyncMode: "overwrite" | "new_only" | "skip";
    }>;
    setInstanceSync: (settings: {
      autoSyncBeforeLaunch?: boolean;
      autoImportConfigsAfterGame?: boolean;
      showSyncConfirmation?: boolean;
      defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
    }) => Promise<{ success: boolean }>;
    /** Smart launch with automatic sync if needed */
    smartLaunch: (instanceId: string, modpackId: string, options?: {
      forceSync?: boolean;
      skipSync?: boolean;
      configSyncMode?: "overwrite" | "new_only" | "skip";
    }) => Promise<{
      success: boolean;
      error?: string;
      needsSync?: boolean;
      requiresConfirmation?: boolean;
      syncStatus?: {
        needsSync: boolean;
        differences: number;
        lastSynced?: string;
        missingInInstance: Array<{ filename: string; type: string }>;
        extraInInstance: Array<{ filename: string; type: string }>;
        disabledMismatch: Array<{ filename: string; issue: string }>;
        configDifferences: number;
        totalDifferences: number;
      };
      syncPerformed: boolean;
      syncResult?: InstanceSyncResult;
    }>;
  };

  // ========== SYSTEM INFO ==========
  system: {
    getMemoryInfo: () => Promise<{
      total: number;
      free: number;
      used: number;
      suggestedMax: number;
    }>;
  };

  // ========== MODPACK PREVIEW ==========
  preview: {
    fromZip: (zipPath: string) => Promise<ModpackPreview | null>;
    fromCurseForge: (modpackData: any, fileData: any) => Promise<ModpackPreview | null>;
    analyzeModpack: (modpackId: string) => Promise<{
      estimatedRamMin: number;
      estimatedRamRecommended: number;
      estimatedRamMax: number;
      performanceImpact: number;
      loadTimeImpact: number;
      storageImpact: number;
      modCategories: Record<string, number>;
      warnings: string[];
      recommendations: string[];
      compatibilityScore: number;
      compatibilityNotes: string[];
    } | null>;
    selectAndPreview: () => Promise<{ path: string; preview: ModpackPreview } | null>;
  };

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
    }) => Promise<{
      mods: Mod[];
      pagination: PaginationInfo;
    }>;
  };

  // ========== MODEX INSTANCES ==========
  instances: {
    getAll: () => Promise<ModexInstance[]>;
    get: (id: string) => Promise<ModexInstance | null>;
    getByModpack: (modpackId: string) => Promise<ModexInstance | null>;
    create: (options: {
      name: string;
      minecraftVersion: string;
      loader: string;
      loaderVersion?: string;
      modpackId?: string;
      description?: string;
      icon?: string;
      memory?: { min: number; max: number };
      source?: ModexInstance["source"];
    }) => Promise<ModexInstance>;
    delete: (id: string) => Promise<boolean>;
    update: (id: string, updates: Partial<ModexInstance>) => Promise<ModexInstance | null>;
    syncModpack: (
      instanceId: string,
      modpackId: string,
      options?: {
        clearExisting?: boolean;
        configSyncMode?: "overwrite" | "new_only" | "skip";
        overridesZipPath?: string;
      }
    ) => Promise<InstanceSyncResult>;
    syncConfigsToModpack: (instanceId: string, modpackId: string) => Promise<{ filesSynced: number; warnings: string[] }>;
    launch: (instanceId: string) => Promise<InstanceLaunchResult>;
    openFolder: (instanceId: string, subfolder?: string) => Promise<boolean>;
    getStats: (instanceId: string) => Promise<InstanceStats | null>;
    /** Check sync status between instance and modpack */
    checkSyncStatus: (instanceId: string, modpackId: string) => Promise<{
      needsSync: boolean;
      missingInInstance: Array<{ filename: string; type: string }>;
      extraInInstance: Array<{ filename: string; type: string }>;
      disabledMismatch: Array<{ filename: string; issue: string }>;
      configDifferences: number;
      totalDifferences: number;
    }>;
    export: (instanceId: string) => Promise<boolean>;
    duplicate: (instanceId: string, newName: string) => Promise<ModexInstance | null>;
    getLauncherConfig: () => Promise<{
      vanillaPath?: string;
      javaPath?: string;
      defaultMemory: { min: number; max: number };
    }>;
    setLauncherConfig: (config: {
      vanillaPath?: string;
      javaPath?: string;
      defaultMemory?: { min: number; max: number };
    }) => Promise<void>;
    createFromModpack: (
      modpackId: string,
      options?: { overridesZipPath?: string }
    ) => Promise<{ instance: ModexInstance; syncResult: InstanceSyncResult } | null>;
    onSyncProgress: (callback: (data: { stage: string; current: number; total: number; item?: string }) => void) => () => void;

    // Game tracking
    getRunningGame: (instanceId: string) => Promise<{
      instanceId: string;
      launcherPid?: number;
      gamePid?: number;
      startTime: number;
      status: "launching" | "loading_mods" | "running" | "stopped";
      loadedMods: number;
      totalMods: number;
      currentMod?: string;
      gameProcessRunning: boolean;
    } | null>;
    killGame: (instanceId: string) => Promise<boolean>;
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
    }) => void) => () => void;

    // Bidirectional config sync
    getModifiedConfigs: (instanceId: string, modpackId: string) => Promise<{
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
    }>;
    importConfigs: (instanceId: string, modpackId: string, configPaths: string[]) => Promise<{
      success: boolean;
      imported: number;
      skipped: number;
      errors: string[];
    }>;

    /** Subscribe to real-time game log lines */
    onLogLine: (callback: (data: {
      instanceId: string;
      time: string;
      level: string;
      message: string;
      raw: string;
    }) => void) => () => void;
  };

  // ========== CONFIG SERVICE ==========
  configs: {
    /** Get all config folders for an instance */
    getFolders: (instanceId: string) => Promise<ConfigFolder[]>;
    /** Search for config files */
    search: (instanceId: string, query: string) => Promise<ConfigFile[]>;
    /** Read a config file's content */
    read: (instanceId: string, configPath: string) => Promise<ConfigContent>;
    /** Write content to a config file */
    write: (instanceId: string, configPath: string, content: string) => Promise<{ success: boolean }>;
    /** Delete a config file */
    delete: (instanceId: string, configPath: string) => Promise<{ success: boolean }>;
    /** Create a new config file */
    create: (instanceId: string, configPath: string, content?: string) => Promise<{ success: boolean }>;
    /** Export configs to zip file */
    export: (instanceId: string, folders?: string[]) => Promise<{ path: string; manifest: ConfigExport } | null>;
    /** Import configs from zip file */
    import: (instanceId: string, overwrite?: boolean) => Promise<{ imported: number; skipped: number; errors: string[] } | null>;
    /** Compare configs between two instances */
    compare: (instanceId1: string, instanceId2: string, folder?: string) => Promise<ConfigComparison>;
    /** Get diff of a specific config between two instances */
    diff: (instanceId1: string, instanceId2: string, configPath: string) => Promise<{ content1: string; content2: string }>;
    /** Create a backup of all configs */
    backup: (instanceId: string) => Promise<{ path: string }>;
    /** List available config backups */
    listBackups: (instanceId: string) => Promise<ConfigBackup[]>;
    /** Restore a config backup */
    restoreBackup: (instanceId: string, backupPath: string) => Promise<{ restored: number }>;
    /** Delete a config backup */
    deleteBackup: (backupPath: string) => Promise<{ success: boolean }>;
    /** Copy specific config files between instances */
    copyFiles: (sourceInstanceId: string, targetInstanceId: string, configPaths: string[], overwrite?: boolean) => Promise<{ copied: number; skipped: number; errors: string[] }>;
    /** Copy entire config folder between instances */
    copyFolder: (sourceInstanceId: string, targetInstanceId: string, folder?: string, overwrite?: boolean) => Promise<{ copied: number }>;
    /** Open config file in external editor */
    openExternal: (instanceId: string, configPath: string) => Promise<{ success: boolean }>;
    /** Open config folder in file explorer */
    openFolder: (instanceId: string, folder?: string) => Promise<{ success: boolean }>;

    // ========== STRUCTURED CONFIG EDITOR ==========

    /** Config entry type */
    ConfigEntry: {
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
    };

    /** Config section type */
    ConfigSection: {
      name: string;
      displayName: string;
      comment?: string;
      entries: Array<ConfigsAPI['ConfigEntry']>;
      subsections: Array<ConfigsAPI['ConfigSection']>;
      expanded: boolean;
    };

    /** Parsed config type */
    ParsedConfig: {
      path: string;
      type: string;
      sections: Array<ConfigsAPI['ConfigSection']>;
      allEntries: Array<ConfigsAPI['ConfigEntry']>;
      errors: string[];
      rawContent: string;
      encoding: string;
    };

    /** Parse a config file into structured key-value pairs */
    parseStructured: (instanceId: string, configPath: string) => Promise<ConfigsAPI['ParsedConfig']>;

    /** Save structured config modifications with version control */
    saveStructured: (instanceId: string, configPath: string, modifications: Array<{
      key: string;
      oldValue: any;
      newValue: any;
      section?: string;
    }>) => Promise<{ success: boolean }>;

    /** Get all config modifications history for an instance */
    getModifications: (instanceId: string) => Promise<Array<{
      id: string;
      timestamp: string;
      configPath: string;
      modifications: Array<{
        key: string;
        oldValue: any;
        newValue: any;
        section?: string;
      }>;
    }>>;

    /** Rollback a specific config change set */
    rollbackChanges: (instanceId: string, changeSetId: string) => Promise<{ success: boolean }>;
  };

  // ========== EVENTS ==========
  /** Register an event listener. Returns a cleanup function to remove the listener. */
  on: (channel: string, callback: (data: any) => void) => () => void;
}

// ==================== CURSEFORGE TYPES ====================

export interface CFModAsset {
  id: number;
  modId: number;
  title: string;
  description: string;
  thumbnailUrl: string;
  url: string;
}

export interface CFMod {
  id: number;
  gameId: number;
  classId?: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  logo?: {
    thumbnailUrl: string;
    url: string;
  };
  screenshots?: CFModAsset[];
  categories: CFCategory[];
  authors: CFAuthor[];
  latestFiles: CFFile[];
  latestFilesIndexes: CFFileIndex[];
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
  links?: {
    websiteUrl?: string;
    wikiUrl?: string;
    issuesUrl?: string;
    sourceUrl?: string;
  };
}

export interface CFCategory {
  id: number;
  name: string;
  slug: string;
  iconUrl: string;
}

export interface CFAuthor {
  id: number;
  name: string;
  url: string;
}

export interface CFFile {
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
  dependencies: CFDependency[];
  fileFingerprint: number;
}

export interface CFFileIndex {
  gameVersion: string;
  fileId: number;
  filename: string;
  releaseType: number;
  modLoader: number;
}

export interface CFDependency {
  modId: number;
  relationType: number;
}

export interface CFPagination {
  index: number;
  pageSize: number;
  resultCount: number;
  totalCount: number;
}

// ==================== ANALYZER TYPES ====================

export interface ModpackAnalysis {
  missingDependencies: DependencyInfo[];
  conflicts: ConflictInfo[];
  performanceStats: PerformanceStats;
  recommendations: string[];
}

export interface ModAnalysis {
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
}

export interface DependencyInfo {
  modId: number;
  modName: string;
  requiredBy: string[];
  slug?: string;
}

export interface ConflictInfo {
  mod1: { id: string; name: string; curseforge_id?: number };
  mod2: { id: string; name: string; curseforge_id?: number };
  type: 'incompatible' | 'duplicate' | 'version_mismatch' | 'loader_mismatch';
  severity: 'error' | 'warning' | 'info';
  description: string;
  suggestion?: string;
  reason?: string; // legacy field for backwards compatibility
}

export interface PerformanceStats {
  totalMods: number;
  clientOnly: number;
  optimizationMods: number;
  resourceHeavy: number;
  graphicsIntensive: number;
  worldGenMods: number;
}

// ==================== GLOBAL WINDOW ====================

declare global {
  interface Window {
    api: ElectronAPI;
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      off: (channel: string, func: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}

export { };
