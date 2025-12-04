import { contextBridge, ipcRenderer, webUtils } from "electron";

export interface Mod {
  id: string; // Hash SHA256
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string;
  hash: string;
  created_at: string;
  size: number;
}

export interface Modpack {
  id: string; // Folder name
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  image_path?: string;
  created_at: string;
  mod_count?: number;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  // Mods API
  mods: {
    getAll: (): Promise<Mod[]> => ipcRenderer.invoke("mods:getAll"),
    getById: (id: string): Promise<Mod | undefined> => ipcRenderer.invoke("mods:getById", id),
    import: (sourcePaths: string[]): Promise<Mod[]> => ipcRenderer.invoke("mods:import", sourcePaths),
    update: (id: string, updates: Partial<Mod>): Promise<boolean> =>
      ipcRenderer.invoke("mods:update", id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("mods:delete", id),
    bulkDelete: (ids: string[]): Promise<number> => ipcRenderer.invoke("mods:bulkDelete", ids),
    refreshMetadata: (id: string): Promise<{ success: boolean; updates?: Partial<Mod>; error?: string }> =>
      ipcRenderer.invoke("mods:refreshMetadata", id),
    refreshAllMetadata: (): Promise<{ updated: number; failed: number; total: number }> =>
      ipcRenderer.invoke("mods:refreshAllMetadata"),
    addFromCurseForge: (projectId: number, fileId: number, preferredLoader?: string): Promise<Mod | null> =>
      ipcRenderer.invoke("mods:addFromCurseForge", projectId, fileId, preferredLoader),
  },

  // CurseForge API
  curseforge: {
    hasApiKey: (): Promise<boolean> => ipcRenderer.invoke("curseforge:hasApiKey"),
    search: (options: {
      query?: string;
      gameVersion?: string;
      modLoader?: string;
      categoryId?: number;
      pageSize?: number;
      index?: number;
    }): Promise<{ mods: any[]; pagination: any }> => ipcRenderer.invoke("curseforge:search", options),
    getMod: (modId: number): Promise<any | null> => ipcRenderer.invoke("curseforge:getMod", modId),
    getModFiles: (modId: number, options?: { gameVersion?: string; modLoader?: string }): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getModFiles", modId, options),
    getCategories: (): Promise<any[]> => ipcRenderer.invoke("curseforge:getCategories"),
    getPopular: (gameVersion?: string, modLoader?: string): Promise<any[]> =>
      ipcRenderer.invoke("curseforge:getPopular", gameVersion, modLoader),
    downloadMod: (modId: number, fileId: number, destPath: string): Promise<{ success: boolean; filePath: string; error?: string }> =>
      ipcRenderer.invoke("curseforge:downloadMod", modId, fileId, destPath),
  },

  // Modpacks API
  modpacks: {
    getAll: (): Promise<Modpack[]> => ipcRenderer.invoke("modpacks:getAll"),
    getById: (id: string): Promise<Modpack | undefined> => ipcRenderer.invoke("modpacks:getById", id),
    create: (data: { name: string; version?: string; minecraft_version?: string; loader?: string; description?: string }): Promise<string> =>
      ipcRenderer.invoke("modpacks:create", data),
    // Backward compatibility
    add: (data: { name: string; version?: string; minecraft_version?: string; loader?: string; description?: string }): Promise<string> =>
      ipcRenderer.invoke("modpacks:add", data),
    update: (id: string, updates: Partial<Modpack>): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:update", id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke("modpacks:delete", id),
    getMods: (modpackId: string): Promise<Mod[]> =>
      ipcRenderer.invoke("modpacks:getMods", modpackId),
    addMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    removeMod: (modpackId: string, modId: string): Promise<boolean> =>
      ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    clone: (modpackId: string, newName: string): Promise<string | null> =>
      ipcRenderer.invoke("modpacks:clone", modpackId, newName),
    selectImage: (): Promise<string | null> => ipcRenderer.invoke("modpacks:selectImage"),
    setImage: (modpackId: string, imagePath: string): Promise<string | null> =>
      ipcRenderer.invoke("modpacks:setImage", modpackId, imagePath),
  },

  // Scanner API
  scanner: {
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke("scanner:selectFolder"),
    selectFiles: (): Promise<string[]> => ipcRenderer.invoke("scanner:selectFiles"),
    selectZipFile: (): Promise<string | null> => ipcRenderer.invoke("scanner:selectZipFile"),
    selectGameFolder: (): Promise<string | null> => ipcRenderer.invoke("scanner:selectGameFolder"),
    scanFolder: (folderPath: string) =>
      ipcRenderer.invoke("scanner:scanFolder", folderPath),
    scanFiles: (filePaths: string[]) =>
      ipcRenderer.invoke("scanner:scanFiles", filePaths),
    importMods: (filePaths: string[]): Promise<Mod[]> =>
      ipcRenderer.invoke("scanner:importMods", filePaths),
    importModpack: (zipPath: string, modpackName: string): Promise<{ modpackId: string; modCount: number }> =>
      ipcRenderer.invoke("scanner:importModpack", zipPath, modpackName),
    exportModpack: (modpackId: string, exportPath: string): Promise<{ success: boolean; path: string }> =>
      ipcRenderer.invoke("scanner:exportModpack", modpackId, exportPath),
    exportToGameFolder: (modIds: string[], targetFolder: string): Promise<{ success: boolean; count: number }> =>
      ipcRenderer.invoke("scanner:exportToGameFolder", modIds, targetFolder),
    exportModpackToGameFolder: (modpackId: string, targetFolder: string): Promise<{ success: boolean; count: number }> =>
      ipcRenderer.invoke("scanner:exportModpackToGameFolder", modpackId, targetFolder),
    selectExportPath: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke("scanner:selectExportPath", defaultName),
    openInExplorer: (path: string): Promise<void> =>
      ipcRenderer.invoke("scanner:openInExplorer", path),
    openLibrary: (): Promise<void> => ipcRenderer.invoke("scanner:openLibrary"),
    openModpackFolder: (modpackId: string): Promise<void> =>
      ipcRenderer.invoke("scanner:openModpackFolder", modpackId),
    getBasePath: (): Promise<string> => ipcRenderer.invoke("scanner:getBasePath"),
    getLibraryPath: (): Promise<string> => ipcRenderer.invoke("scanner:getLibraryPath"),
  },

  // MODEX Share
  share: {
    exportModex: (modpackId: string): Promise<{ success: boolean; code: string; path: string } | null> =>
      ipcRenderer.invoke("share:exportModex", modpackId),
    importModex: (): Promise<{
      success: boolean;
      modpackId: string;
      code: string;
      isUpdate: boolean;
      changes?: { added: number; removed: number; unchanged: number };
    } | null> => ipcRenderer.invoke("share:importModex"),
    importCurseForgeZip: (): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    } | null> => ipcRenderer.invoke("share:importCurseForgeZip"),
    getInfo: (modpackId: string): Promise<{ shareCode: string | null; lastSync: string | null }> =>
      ipcRenderer.invoke("share:getInfo", modpackId),
    generateCode: (modpackId: string): Promise<{ code: string; checksum: string }> =>
      ipcRenderer.invoke("share:generateCode", modpackId),
  },

  // Mod Updates
  updates: {
    setApiKey: (source: "curseforge" | "modrinth", apiKey: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("updates:setApiKey", source, apiKey),
    getApiKey: (source: "curseforge" | "modrinth"): Promise<string> =>
      ipcRenderer.invoke("updates:getApiKey", source),
    checkMod: (modId: string): Promise<{
      modId: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      updateUrl: string | null;
      downloadUrl: string | null;
      source: "curseforge" | "modrinth" | "unknown";
      projectId: string | null;
      projectName: string | null;
      changelog: string | null;
      releaseDate: string | null;
    }> => ipcRenderer.invoke("updates:checkMod", modId),
    checkAll: (): Promise<Array<{
      modId: string;
      hasUpdate: boolean;
      latestVersion: string | null;
      source: string;
    }>> => ipcRenderer.invoke("updates:checkAll"),
    checkModpack: (modpackId: string): Promise<Array<{
      modId: string;
      hasUpdate: boolean;
      latestVersion: string | null;
      downloadUrl: string | null;
      source: string;
    }>> => ipcRenderer.invoke("updates:checkModpack", modpackId),
    applyUpdate: (modId: string, downloadUrl: string): Promise<{
      success: boolean;
      newPath: string | null;
      error?: string;
    }> => ipcRenderer.invoke("updates:applyUpdate", modId, downloadUrl),
    applyModpackUpdate: (modpackId: string, modId: string, downloadUrl: string): Promise<{
      success: boolean;
      newPath: string | null;
      error?: string;
    }> => ipcRenderer.invoke("updates:applyModpackUpdate", modpackId, modId, downloadUrl),
  },

  // Events
  on: (channel: string, callback: (data: any) => void) => {
    ipcRenderer.on(channel, (_event, data) => callback(data));
  },
});

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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

// Expose webUtils for drag & drop file path extraction
contextBridge.exposeInMainWorld("electronUtils", {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});
