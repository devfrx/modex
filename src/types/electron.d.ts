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
      contentType?: "mods" | "resourcepacks" | "shaders";
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
      contentType?: "mods" | "resourcepacks" | "shaders"
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
    update: (id: string, updates: Partial<Modpack>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getMods: (modpackId: string) => Promise<Mod[]>;
    addMod: (modpackId: string, modId: string) => Promise<boolean>;
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
    // Profiles
    createProfile: (
      modpackId: string,
      name: string
    ) => Promise<ModpackProfile | null>;
    deleteProfile: (modpackId: string, profileId: string) => Promise<boolean>;
    applyProfile: (modpackId: string, profileId: string) => Promise<boolean>;
  };

  // ========== VERSION CONTROL ==========
  versions: {
    /** Get version history for a modpack */
    getHistory: (modpackId: string) => Promise<ModpackVersionHistory | null>;
    /** Initialize version control for a modpack */
    initialize: (
      modpackId: string,
      message?: string
    ) => Promise<ModpackVersion | null>;
    /** Create a new version (commit) */
    create: (
      modpackId: string,
      message: string,
      tag?: string
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
        projectID: number;
        fileID: number;
        existingMod: {
          id: string;
          name: string;
          version: string;
        };
      }>;
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
        enabledMods?: string[];
        disabledMods?: string[];
      };
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
    checkDependencies: (modId: string) => Promise<ModAnalysis>;
    getPerformanceTips: (modpackId: string) => Promise<string[]>;
  };

  // ========== EVENTS ==========
  on: (channel: string, callback: (data: any) => void) => void;
}

// ==================== CURSEFORGE TYPES ====================

export interface CFMod {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  logo?: {
    thumbnailUrl: string;
    url: string;
  };
  categories: CFCategory[];
  authors: CFAuthor[];
  latestFiles: CFFile[];
  latestFilesIndexes: CFFileIndex[];
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
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
  mod1: { id: string; name: string };
  mod2: { id: string; name: string };
  reason: string;
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

export {};
