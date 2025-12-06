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
    checkUsage: (modIds: string[]): Promise<Array<{
      modId: string;
      modName: string;
      modpacks: Array<{ id: string; name: string }>;
    }>> => ipcRenderer.invoke("mods:checkUsage", modIds),
    deleteWithModpackCleanup: (modIds: string[], removeFromModpacks: boolean): Promise<number> =>
      ipcRenderer.invoke("mods:deleteWithModpackCleanup", modIds, removeFromModpacks),
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
    }): Promise<{ mods: any[]; pagination: any }> =>
      ipcRenderer.invoke("curseforge:search", options),
    getMod: (modId: number): Promise<any | null> =>
      ipcRenderer.invoke("curseforge:getMod", modId),
    getModFiles: (
      modId: number,
      options?: { gameVersion?: string; modLoader?: string }
    ): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getModFiles", modId, options),
    getCategories: (): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getCategories"),
    getPopular: (gameVersion?: string, modLoader?: string): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getPopular", gameVersion, modLoader),
    addToLibrary: (
      projectId: number,
      fileId: number,
      preferredLoader?: string
    ): Promise<Mod | null> =>
      ipcRenderer.invoke(
        "curseforge:addToLibrary",
        projectId,
        fileId,
        preferredLoader
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
    addMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    removeMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    clone: (modpackId: string, newName: string): Promise<string | null> =>
      ipcRenderer.invoke("modpacks:clone", modpackId, newName),
    setImage: (modpackId: string, imageUrl: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:setImage", modpackId, imageUrl),
    openFolder: (modpackId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:openFolder", modpackId),
  },

  // ========== VERSION CONTROL ==========
  versions: {
    getHistory: (modpackId: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:getHistory", modpackId),
    initialize: (modpackId: string, message?: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:initialize", modpackId, message),
    create: (modpackId: string, message: string, tag?: string): Promise<any | null> =>
      ipcRenderer.invoke("versions:create", modpackId, message, tag),
    rollback: (modpackId: string, versionId: string): Promise<boolean> =>
      ipcRenderer.invoke("versions:rollback", modpackId, versionId),
    compare: (modpackId: string, fromVersionId: string, toVersionId: string): Promise<any[] | null> =>
      ipcRenderer.invoke("versions:compare", modpackId, fromVersionId, toVersionId),
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
        addedMods: string[];
        removedMods: string[];
      };
    } | null> => ipcRenderer.invoke("import:modex"),
    resolveConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        modEntry: any;
        existingMod: any;
        resolution: 'use_existing' | 'use_new';
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
        addedMods: string[];
        removedMods: string[];
      };
    }> => ipcRenderer.invoke("import:resolveConflicts", data),
    resolveCFConflicts: (data: {
      modpackId: string;
      conflicts: Array<{
        projectID: number;
        fileID: number;
        existingModId: string;
        resolution: 'use_existing' | 'use_new';
      }>;
    }): Promise<{
      success: boolean;
      modpackId: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => ipcRenderer.invoke("import:resolveCFConflicts", data),
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
      modId: string
    ): Promise<{
      modId: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      updateUrl: string | null;
      source: string;
      projectId: string | null;
      projectName: string | null;
      changelog: string | null;
      releaseDate: string | null;
      newFileId?: number;
    }> => ipcRenderer.invoke("updates:checkMod", modId),
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
    analyzeModpack: (modpackId: string): Promise<{
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
    
    checkDependencies: (modId: string): Promise<{
      dependencies: Array<{
        modId: number;
        name: string;
        type: 'required' | 'optional' | 'embedded' | 'incompatible';
        slug?: string;
      }>;
      conflicts: Array<{
        modId: number;
        name: string;
        reason: string;
      }>;
      performanceImpact: 'positive' | 'neutral' | 'negative' | 'unknown';
    }> => ipcRenderer.invoke("analyzer:checkDependencies", modId),
    
    getPerformanceTips: (modpackId: string): Promise<string[]> =>
      ipcRenderer.invoke("analyzer:getPerformanceTips", modpackId),
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
