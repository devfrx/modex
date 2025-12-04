import { contextBridge, ipcRenderer } from "electron";

export interface Mod {
  id?: number;
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string;
  hash: string;
  created_at?: string;
}

export interface Modpack {
  id?: number;
  name: string;
  version: string;
  description?: string;
  created_at?: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  // Mods API
  mods: {
    getAll: () => ipcRenderer.invoke("mods:getAll"),
    getById: (id: number) => ipcRenderer.invoke("mods:getById", id),
    add: (mod: Omit<Mod, "id" | "created_at">) =>
      ipcRenderer.invoke("mods:add", mod),
    update: (id: number, mod: Partial<Mod>) =>
      ipcRenderer.invoke("mods:update", id, mod),
    delete: (id: number) => ipcRenderer.invoke("mods:delete", id),
  },

  // Modpacks API
  modpacks: {
    getAll: () => ipcRenderer.invoke("modpacks:getAll"),
    getById: (id: number) => ipcRenderer.invoke("modpacks:getById", id),
    add: (modpack: Omit<Modpack, "id" | "created_at">) =>
      ipcRenderer.invoke("modpacks:add", modpack),
    update: (id: number, modpack: Partial<Modpack>) =>
      ipcRenderer.invoke("modpacks:update", id, modpack),
    delete: (id: number) => ipcRenderer.invoke("modpacks:delete", id),
    getMods: (modpackId: number) =>
      ipcRenderer.invoke("modpacks:getMods", modpackId),
    addMod: (modpackId: number, modId: number) =>
      ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    removeMod: (modpackId: number, modId: number) =>
      ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    selectImage: () => ipcRenderer.invoke("modpacks:selectImage"),
  },

  // Scanner API
  scanner: {
    selectFolder: () => ipcRenderer.invoke("scanner:selectFolder"),
    selectFiles: () => ipcRenderer.invoke("scanner:selectFiles"),
    scanFolder: (folderPath: string) =>
      ipcRenderer.invoke("scanner:scanFolder", folderPath),
    scanFiles: (filePaths: string[]) =>
      ipcRenderer.invoke("scanner:scanFiles", filePaths),
    importMods: (metadata: Omit<Mod, "id" | "created_at">[]) =>
      ipcRenderer.invoke("scanner:importMods", metadata),
    importModpack: (zipPath: string) =>
      ipcRenderer.invoke("scanner:importModpack", zipPath),
    exportModpack: (modpackId: string, exportPath: string) =>
      ipcRenderer.invoke("scanner:exportModpack", modpackId, exportPath),
    selectExportPath: (defaultName: string) =>
      ipcRenderer.invoke("scanner:selectExportPath", defaultName),
    selectZipFile: () => ipcRenderer.invoke("scanner:selectZipFile"),
    openInExplorer: (path: string) =>
      ipcRenderer.invoke("scanner:openInExplorer", path),
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
