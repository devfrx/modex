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
};

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
    }) => Promise<{ mods: CFMod[]; pagination: CFPagination }>;
    getMod: (modId: number) => Promise<CFMod | null>;
    getModFiles: (
      modId: number,
      options?: {
        gameVersion?: string;
        modLoader?: string;
      }
    ) => Promise<CFFile[]>;
    getCategories: () => Promise<CFCategory[]>;
    getPopular: (gameVersion?: string, modLoader?: string) => Promise<CFMod[]>;
    /** Add a mod from CurseForge to library (metadata only, no download) */
    addToLibrary: (
      projectId: number,
      fileId: number,
      preferredLoader?: string
    ) => Promise<Mod | null>;
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
    clone: (modpackId: string, newName: string) => Promise<string | null>;
    setImage: (modpackId: string, imageUrl: string) => Promise<boolean>;
    openFolder: (modpackId: string) => Promise<boolean>;
  };

  // ========== VERSION CONTROL ==========
  versions: {
    /** Get version history for a modpack */
    getHistory: (modpackId: string) => Promise<ModpackVersionHistory | null>;
    /** Initialize version control for a modpack */
    initialize: (modpackId: string, message?: string) => Promise<ModpackVersion | null>;
    /** Create a new version (commit) */
    create: (modpackId: string, message: string, tag?: string) => Promise<ModpackVersion | null>;
    /** Rollback to a specific version */
    rollback: (modpackId: string, versionId: string) => Promise<boolean>;
    /** Compare two versions */
    compare: (modpackId: string, fromVersionId: string, toVersionId: string) => Promise<ModpackChange[] | null>;
    /** Get a specific version */
    get: (modpackId: string, versionId: string) => Promise<ModpackVersion | null>;
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
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
      };
    } | null>;
    /** Resolve version conflicts during import */
    resolveConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        modEntry: any;
        existingMod: any;
        resolution: 'use_existing' | 'use_new';
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
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
      };
    }>;
    /** Resolve CurseForge import conflicts */
    resolveCFConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        projectID: number;
        fileID: number;
        existingModId: string;
        resolution: 'use_existing' | 'use_new';
      }>;
    }) => Promise<{
      success: boolean;
      modpackId: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }>;
  };

  // ========== UPDATES ==========
  updates: {
    setApiKey: (
      source: "curseforge" | "modrinth",
      apiKey: string
    ) => Promise<{ success: boolean }>;
    getApiKey: (source: "curseforge" | "modrinth") => Promise<string>;
    checkMod: (modId: string) => Promise<ModUpdateInfo>;
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
