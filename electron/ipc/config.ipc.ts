/**
 * Config Editor IPC Handlers
 * Configuration file management for Minecraft instances
 */

import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import path from "path";
import type { ConfigService } from "../services/ConfigService.js";
import type { InstanceService } from "../services/InstanceService.js";

export interface ConfigIpcDeps {
  configService: ConfigService;
  instanceService: InstanceService;
  getWindow: () => BrowserWindow | null;
}

export function registerConfigHandlers(deps: ConfigIpcDeps): void {
  const { configService, instanceService, getWindow } = deps;

  // Get config folders for an instance
  ipcMain.handle("config:getFolders", async (_, instanceId: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) return [];
    return configService.getConfigFolders(instance.path);
  });

  // Search for config files
  ipcMain.handle("config:search", async (_, instanceId: string, query: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) return [];
    return configService.searchConfigs(instance.path, query);
  });

  // Read a config file
  ipcMain.handle("config:read", async (_, instanceId: string, configPath: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    return configService.readConfig(instance.path, configPath);
  });

  // Write a config file
  ipcMain.handle("config:write", async (_, instanceId: string, configPath: string, content: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    await configService.writeConfig(instance.path, configPath, content);
    return { success: true };
  });

  // Delete a config file
  ipcMain.handle("config:delete", async (_, instanceId: string, configPath: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    await configService.deleteConfig(instance.path, configPath);
    return { success: true };
  });

  // Create a new config file
  ipcMain.handle("config:create", async (_, instanceId: string, configPath: string, content?: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    await configService.createConfig(instance.path, configPath, content || "");
    return { success: true };
  });

  // Export configs to zip
  ipcMain.handle("config:export", async (_, instanceId: string, folders?: string[]) => {
    const win = getWindow();
    if (!win) return null;

    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${instance.name}-configs.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      title: "Export Configs"
    });

    if (result.canceled || !result.filePath) return null;

    const manifest = await configService.exportConfigs(
      instance.path,
      instance.id,
      instance.name,
      result.filePath,
      folders
    );

    return { path: result.filePath, manifest };
  });

  // Import configs from zip
  ipcMain.handle("config:import", async (_, instanceId: string, overwrite?: boolean) => {
    const win = getWindow();
    if (!win) return null;

    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");

    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Config Archive", extensions: ["zip"] }],
      title: "Import Configs"
    });

    if (result.canceled || !result.filePaths[0]) return null;

    return configService.importConfigs(instance.path, result.filePaths[0], overwrite ?? false);
  });

  // Compare configs between two instances
  ipcMain.handle("config:compare", async (_, instanceId1: string, instanceId2: string, folder?: string) => {
    const instance1 = await instanceService.getInstance(instanceId1);
    const instance2 = await instanceService.getInstance(instanceId2);
    if (!instance1 || !instance2) throw new Error("Instance not found");
    return configService.compareConfigs(instance1.path, instance2.path, folder);
  });

  // Get config diff between two instances
  ipcMain.handle("config:diff", async (_, instanceId1: string, instanceId2: string, configPath: string) => {
    const instance1 = await instanceService.getInstance(instanceId1);
    const instance2 = await instanceService.getInstance(instanceId2);
    if (!instance1 || !instance2) throw new Error("Instance not found");
    return configService.diffConfig(instance1.path, instance2.path, configPath);
  });

  // Create config backup
  ipcMain.handle("config:backup", async (_, instanceId: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    const backupPath = await configService.backupConfigs(instance.path);
    return { path: backupPath };
  });

  // List config backups
  ipcMain.handle("config:listBackups", async (_, instanceId: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) return [];
    return configService.listBackups(instance.path);
  });

  // Restore config backup
  ipcMain.handle("config:restoreBackup", async (_, instanceId: string, backupPath: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    return configService.restoreBackup(instance.path, backupPath);
  });

  // Delete config backup
  ipcMain.handle("config:deleteBackup", async (_, backupPath: string) => {
    await configService.deleteBackup(backupPath);
    return { success: true };
  });

  // Copy config files between instances
  ipcMain.handle("config:copyFiles", async (_, sourceInstanceId: string, targetInstanceId: string, configPaths: string[], overwrite?: boolean) => {
    const sourceInstance = await instanceService.getInstance(sourceInstanceId);
    const targetInstance = await instanceService.getInstance(targetInstanceId);
    if (!sourceInstance || !targetInstance) throw new Error("Instance not found");
    return configService.copyConfigFiles(sourceInstance.path, targetInstance.path, configPaths, overwrite ?? true);
  });

  // Copy entire config folder between instances
  ipcMain.handle("config:copyFolder", async (_, sourceInstanceId: string, targetInstanceId: string, folder?: string, overwrite?: boolean) => {
    const sourceInstance = await instanceService.getInstance(sourceInstanceId);
    const targetInstance = await instanceService.getInstance(targetInstanceId);
    if (!sourceInstance || !targetInstance) throw new Error("Instance not found");
    return configService.copyConfigFolder(sourceInstance.path, targetInstance.path, folder || "config", overwrite ?? true);
  });

  // Open config in external editor
  ipcMain.handle("config:openExternal", async (_, instanceId: string, configPath: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    const fullPath = path.join(instance.path, configPath);
    shell.openPath(fullPath);
    return { success: true };
  });

  // Open config folder in file explorer
  ipcMain.handle("config:openFolder", async (_, instanceId: string, folder?: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    const folderPath = folder ? path.join(instance.path, folder) : path.join(instance.path, "config");
    shell.openPath(folderPath);
    return { success: true };
  });

  // ========== STRUCTURED CONFIG EDITOR ==========

  // Parse a config file into structured key-value pairs
  ipcMain.handle("config:parseStructured", async (_, instanceId: string, configPath: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    return configService.parseConfigStructured(instance.path, configPath);
  });

  // Save structured config modifications with version control tracking
  ipcMain.handle("config:saveStructured", async (_, instanceId: string, configPath: string, modifications: Array<{
    key: string;
    oldValue: any;
    newValue: any;
    section?: string;
    line?: number;
  }>) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");

    // Convert modifications to ConfigEntry format expected by saveConfigStructured
    const entries = modifications.map(mod => ({
      keyPath: mod.key,
      key: mod.key.split('.').pop() || mod.key,
      value: mod.newValue,
      originalValue: mod.oldValue,
      type: typeof mod.newValue as any,
      section: mod.section,
      depth: 0,
      modified: true,
      line: mod.line,
    }));

    // Pass the modpackId from the instance for version control tracking
    const modpackId = instance.modpackId;
    console.info("[config:saveStructured] Instance and ModpackId:", { instanceId: instance.id, modpackId });
    await configService.saveConfigStructured(instance.path, configPath, entries, modpackId);
    return { success: true };
  });

  // Get all config modifications for an instance (version control history)
  ipcMain.handle("config:getModifications", async (_, instanceId: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    return configService.getConfigModifications(instance.path);
  });

  // Rollback a specific config change set
  ipcMain.handle("config:rollbackChanges", async (_, instanceId: string, changeSetId: string) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) throw new Error("Instance not found");
    await configService.rollbackConfigChanges(instance.path, changeSetId);
    return { success: true };
  });
}
