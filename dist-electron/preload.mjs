"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Mods API
  mods: {
    getAll: () => electron.ipcRenderer.invoke("mods:getAll"),
    getById: (id) => electron.ipcRenderer.invoke("mods:getById", id),
    import: (sourcePaths) => electron.ipcRenderer.invoke("mods:import", sourcePaths),
    update: (id, updates) => electron.ipcRenderer.invoke("mods:update", id, updates),
    delete: (id) => electron.ipcRenderer.invoke("mods:delete", id),
    bulkDelete: (ids) => electron.ipcRenderer.invoke("mods:bulkDelete", ids)
  },
  // Modpacks API
  modpacks: {
    getAll: () => electron.ipcRenderer.invoke("modpacks:getAll"),
    getById: (id) => electron.ipcRenderer.invoke("modpacks:getById", id),
    create: (data) => electron.ipcRenderer.invoke("modpacks:create", data),
    // Backward compatibility
    add: (data) => electron.ipcRenderer.invoke("modpacks:add", data),
    update: (id, updates) => electron.ipcRenderer.invoke("modpacks:update", id, updates),
    delete: (id) => electron.ipcRenderer.invoke("modpacks:delete", id),
    getMods: (modpackId) => electron.ipcRenderer.invoke("modpacks:getMods", modpackId),
    addMod: (modpackId, modId) => electron.ipcRenderer.invoke("modpacks:addMod", modpackId, modId),
    removeMod: (modpackId, modId) => electron.ipcRenderer.invoke("modpacks:removeMod", modpackId, modId),
    clone: (modpackId, newName) => electron.ipcRenderer.invoke("modpacks:clone", modpackId, newName),
    selectImage: () => electron.ipcRenderer.invoke("modpacks:selectImage"),
    setImage: (modpackId, imagePath) => electron.ipcRenderer.invoke("modpacks:setImage", modpackId, imagePath)
  },
  // Scanner API
  scanner: {
    selectFolder: () => electron.ipcRenderer.invoke("scanner:selectFolder"),
    selectFiles: () => electron.ipcRenderer.invoke("scanner:selectFiles"),
    selectZipFile: () => electron.ipcRenderer.invoke("scanner:selectZipFile"),
    selectGameFolder: () => electron.ipcRenderer.invoke("scanner:selectGameFolder"),
    scanFolder: (folderPath) => electron.ipcRenderer.invoke("scanner:scanFolder", folderPath),
    scanFiles: (filePaths) => electron.ipcRenderer.invoke("scanner:scanFiles", filePaths),
    importMods: (filePaths) => electron.ipcRenderer.invoke("scanner:importMods", filePaths),
    importModpack: (zipPath, modpackName) => electron.ipcRenderer.invoke("scanner:importModpack", zipPath, modpackName),
    exportModpack: (modpackId, exportPath) => electron.ipcRenderer.invoke("scanner:exportModpack", modpackId, exportPath),
    exportToGameFolder: (modIds, targetFolder) => electron.ipcRenderer.invoke("scanner:exportToGameFolder", modIds, targetFolder),
    exportModpackToGameFolder: (modpackId, targetFolder) => electron.ipcRenderer.invoke("scanner:exportModpackToGameFolder", modpackId, targetFolder),
    selectExportPath: (defaultName) => electron.ipcRenderer.invoke("scanner:selectExportPath", defaultName),
    openInExplorer: (path) => electron.ipcRenderer.invoke("scanner:openInExplorer", path),
    openLibrary: () => electron.ipcRenderer.invoke("scanner:openLibrary"),
    openModpackFolder: (modpackId) => electron.ipcRenderer.invoke("scanner:openModpackFolder", modpackId),
    getBasePath: () => electron.ipcRenderer.invoke("scanner:getBasePath"),
    getLibraryPath: () => electron.ipcRenderer.invoke("scanner:getLibraryPath")
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
electron.contextBridge.exposeInMainWorld("electronUtils", {
  getPathForFile: (file) => electron.webUtils.getPathForFile(file)
});
