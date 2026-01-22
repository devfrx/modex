/**
 * Minecraft Installations IPC Handlers
 * Legacy Minecraft installation detection and management
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import type { MinecraftService } from "../services/MinecraftService.js";
import type { MetadataManager } from "../services/MetadataManager.js";

export interface MinecraftIpcDeps {
  minecraftService: MinecraftService;
  metadataManager: MetadataManager;
  getMainWindow: () => BrowserWindow | null;
}

export function registerMinecraftHandlers(deps: MinecraftIpcDeps): void {
  const { minecraftService, metadataManager, getMainWindow } = deps;

  // Detect Minecraft installations
  ipcMain.handle("minecraft:detectInstallations", async () => {
    return minecraftService.detectInstallations();
  });

  // Get all installations
  ipcMain.handle("minecraft:getInstallations", async () => {
    return minecraftService.getInstallations();
  });

  // Add a custom installation
  ipcMain.handle("minecraft:addCustomInstallation", async (_, name: string, mcPath: string, modsPath?: string) => {
    return minecraftService.addCustomInstallation(name, mcPath, modsPath);
  });

  // Remove an installation
  ipcMain.handle("minecraft:removeInstallation", async (_, id: string) => {
    return minecraftService.removeInstallation(id);
  });

  // Set default installation
  ipcMain.handle("minecraft:setDefault", async (_, id: string) => {
    return minecraftService.setDefaultInstallation(id);
  });

  // Get default installation
  ipcMain.handle("minecraft:getDefault", async () => {
    return minecraftService.getDefaultInstallation();
  });

  // LEGACY: Direct folder sync (MinecraftService) - syncs to existing Minecraft installation
  // NOTE: This differs from InstanceService - disabled mods are simply NOT synced (excluded),
  // rather than being synced and renamed to .disabled. This is intentional because legacy sync
  // operates on user's existing Minecraft folder where they may have their own mod management.
  ipcMain.handle("minecraft:syncModpack", async (_, installationId: string, modpackId: string, options?: { clearExisting?: boolean; createBackup?: boolean }) => {
    const win = getMainWindow();
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) return { success: false, synced: 0, skipped: 0, errors: ["Modpack not found"], syncedMods: [] };

    const mods = await metadataManager.getModsInModpack(modpackId);
    const disabledMods = modpack.disabled_mod_ids || [];

    // Filter out disabled mods (they are excluded, not renamed like in InstanceService)
    const modsToSync = mods
      .filter(m => !disabledMods.includes(m.id))
      .map(m => ({
        id: m.id,
        name: m.name,
        filename: m.filename,
        downloadUrl: m.cf_project_id && m.cf_file_id
          ? `https://edge.forgecdn.net/files/${Math.floor(m.cf_file_id / 1000)}/${m.cf_file_id % 1000}/${m.filename}`
          : undefined
      }));

    return minecraftService.syncModpack(installationId, modsToSync, {
      ...options,
      onProgress: (current, total, modName) => {
        if (win) {
          win.webContents.send("sync:progress", { current, total, modName });
        }
      }
    });
  });

  // Open mods folder for an installation
  ipcMain.handle("minecraft:openModsFolder", async (_, installationId: string) => {
    return minecraftService.openModsFolder(installationId);
  });

  // Launch Minecraft
  ipcMain.handle("minecraft:launch", async (_, installationId?: string) => {
    return minecraftService.launchMinecraft(installationId);
  });

  // Select Minecraft folder via dialog
  ipcMain.handle("minecraft:selectFolder", async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Minecraft Installation Folder"
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Select launcher executable via dialog
  ipcMain.handle("minecraft:selectLauncher", async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      title: "Select Launcher Executable",
      filters: [
        { name: "Executables", extensions: ["exe"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Set launcher path
  ipcMain.handle("minecraft:setLauncherPath", async (_, type: string, launcherPath: string) => {
    return minecraftService.setLauncherPath(type as any, launcherPath);
  });

  // Get launcher paths
  ipcMain.handle("minecraft:getLauncherPaths", async () => {
    return minecraftService.getLauncherPaths();
  });
}
