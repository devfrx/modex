"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Mods API
  mods: {
    getAll: () => electron.ipcRenderer.invoke("mods:getAll"),
    getById: (id) => electron.ipcRenderer.invoke("mods:getById", id),
    add: (mod) => electron.ipcRenderer.invoke("mods:add", mod),
    update: (id, mod) => electron.ipcRenderer.invoke("mods:update", id, mod),
    delete: (id) => electron.ipcRenderer.invoke("mods:delete", id)
  },
  // Modpacks API
  modpacks: {
    getAll: () => electron.ipcRenderer.invoke("modpacks:getAll"),
    getById: (id) => electron.ipcRenderer.invoke("modpacks:getById", id),
    add: (modpack) => electron.ipcRenderer.invoke("modpacks:add", modpack),
    update: (id, modpack) => electron.ipcRenderer.invoke("modpacks:update", id, modpack),
    delete: (id) => electron.ipcRenderer.invoke("modpacks:delete", id),
    getMods: (modpackId) => electron.ipcRenderer.invoke("modpacks:getMods", modpackId),
    addMod: (modpackId, modId) => electron.ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    removeMod: (modpackId, modId) => electron.ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    selectImage: () => electron.ipcRenderer.invoke("modpacks:selectImage")
  },
  // Scanner API
  scanner: {
    selectFolder: () => electron.ipcRenderer.invoke("scanner:selectFolder"),
    selectFiles: () => electron.ipcRenderer.invoke("scanner:selectFiles"),
    scanFolder: (folderPath) => electron.ipcRenderer.invoke("scanner:scanFolder", folderPath),
    scanFiles: (filePaths) => electron.ipcRenderer.invoke("scanner:scanFiles", filePaths),
    importMods: (metadata) => electron.ipcRenderer.invoke("scanner:importMods", metadata),
    importModpack: (zipPath) => electron.ipcRenderer.invoke("scanner:importModpack", zipPath),
    exportModpack: (modpackId, exportPath) => electron.ipcRenderer.invoke("scanner:exportModpack", modpackId, exportPath),
    selectExportPath: (defaultName) => electron.ipcRenderer.invoke("scanner:selectExportPath", defaultName),
    selectZipFile: () => electron.ipcRenderer.invoke("scanner:selectZipFile"),
    openInExplorer: (path) => electron.ipcRenderer.invoke("scanner:openInExplorer", path)
  },
  // Events
  on: (channel, callback) => {
    electron.ipcRenderer.on(channel, (_event, data) => callback(data));
  }
});
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(
      channel,
      (event, ...args2) => listener(event, ...args2)
    );
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
