/**
 * Hytale IPC Handlers
 * Hytale game mod management and configuration
 */

import { ipcMain, app } from "electron";
import path from "path";
import fs from "fs-extra";
import type { HytaleService, HytaleModpack } from "../services/HytaleService.js";
import type { CurseForgeService } from "../services/CurseForgeService.js";
import type { DownloadService } from "../services/DownloadService.js";

export interface HytaleIpcDeps {
  hytaleService: HytaleService;
  curseforgeService: CurseForgeService;
  getDownloadService: () => DownloadService;
}

export function registerHytaleHandlers(deps: HytaleIpcDeps): void {
  const { hytaleService, curseforgeService, getDownloadService } = deps;

  // Get Hytale configuration
  ipcMain.handle("hytale:getConfig", async () => {
    return hytaleService.getConfig();
  });

  // Set Hytale configuration
  ipcMain.handle("hytale:setConfig", async (_, config: { modsPath?: string; launcherPath?: string }) => {
    return hytaleService.setConfig(config);
  });

  // Scan for installed mods
  ipcMain.handle("hytale:scanMods", async () => {
    return hytaleService.scanInstalledMods();
  });

  // Get installed mods
  ipcMain.handle("hytale:getInstalledMods", async () => {
    return hytaleService.getInstalledMods();
  });

  // Install a mod
  ipcMain.handle("hytale:installMod", async (_, sourceFilePath: string, metadata: {
    id: string;
    name: string;
    version: string;
    cfProjectId?: number;
    cfFileId?: number;
    logoUrl?: string;
  }) => {
    return hytaleService.installMod(sourceFilePath, metadata);
  });

  // Remove a mod
  ipcMain.handle("hytale:removeMod", async (_, id: string) => {
    return hytaleService.removeMod(id);
  });

  // Toggle mod enabled/disabled
  ipcMain.handle("hytale:toggleMod", async (_, id: string) => {
    return hytaleService.toggleMod(id);
  });

  // Get all modpacks
  ipcMain.handle("hytale:getModpacks", async () => {
    return hytaleService.getModpacks();
  });

  // Get a specific modpack
  ipcMain.handle("hytale:getModpack", async (_, id: string) => {
    return hytaleService.getModpack(id);
  });

  // Get active modpack
  ipcMain.handle("hytale:getActiveModpack", async () => {
    return hytaleService.getActiveModpack();
  });

  // Create a new modpack
  ipcMain.handle("hytale:createModpack", async (_, options: {
    name: string;
    description?: string;
    imageUrl?: string;
    modIds?: string[];
  }) => {
    return hytaleService.createModpack(options);
  });

  // Update a modpack
  ipcMain.handle("hytale:updateModpack", async (_, id: string, updates: Partial<HytaleModpack>) => {
    return hytaleService.updateModpack(id, updates);
  });

  // Delete a modpack
  ipcMain.handle("hytale:deleteModpack", async (_, id: string) => {
    return hytaleService.deleteModpack(id);
  });

  // Save current mods to modpack
  ipcMain.handle("hytale:saveToModpack", async (_, modpackId: string) => {
    return hytaleService.saveToModpack(modpackId);
  });

  // Activate a modpack
  ipcMain.handle("hytale:activateModpack", async (_, modpackId: string) => {
    return hytaleService.activateModpack(modpackId);
  });

  // Compare with modpack
  ipcMain.handle("hytale:compareWithModpack", async (_, modpackId: string) => {
    return hytaleService.compareWithModpack(modpackId);
  });

  // Duplicate a modpack
  ipcMain.handle("hytale:duplicateModpack", async (_, modpackId: string, newName: string) => {
    return hytaleService.duplicateModpack(modpackId, newName);
  });

  // Toggle mod in modpack
  ipcMain.handle("hytale:toggleModInModpack", async (_, modpackId: string, modId: string) => {
    return hytaleService.toggleModInModpack(modpackId, modId);
  });

  // Add mod to modpack
  ipcMain.handle("hytale:addModToModpack", async (_, modpackId: string, modId: string) => {
    return hytaleService.addModToModpack(modpackId, modId);
  });

  // Remove mod from modpack
  ipcMain.handle("hytale:removeModFromModpack", async (_, modpackId: string, modId: string) => {
    return hytaleService.removeModFromModpack(modpackId, modId);
  });

  // Check if Hytale is installed
  ipcMain.handle("hytale:isInstalled", async () => {
    return hytaleService.isInstalled();
  });

  // Launch Hytale
  ipcMain.handle("hytale:launch", async () => {
    return hytaleService.launch();
  });

  // Open mods folder
  ipcMain.handle("hytale:openModsFolder", async () => {
    return hytaleService.openModsFolder();
  });

  // Open specific mod folder
  ipcMain.handle("hytale:openModFolder", async (_, modId: string) => {
    return hytaleService.openModFolder(modId);
  });

  // Get Hytale stats
  ipcMain.handle("hytale:getStats", async () => {
    return hytaleService.getStats();
  });

  // Hytale world management
  ipcMain.handle("hytale:getWorlds", async () => {
    return hytaleService.getWorlds();
  });

  ipcMain.handle("hytale:toggleSaveMod", async (_, saveId: string, modId: string, enabled: boolean) => {
    return hytaleService.toggleSaveMod(saveId, modId, enabled);
  });

  ipcMain.handle("hytale:openSaveFolder", async (_, saveId: string) => {
    return hytaleService.openSaveFolder(saveId);
  });

  ipcMain.handle("hytale:saveWorldModConfig", async (_, worldId: string, modConfigs: { modId: string; enabled: boolean }[]) => {
    return hytaleService.saveWorldModConfig(worldId, modConfigs);
  });

  ipcMain.handle("hytale:getWorldModConfig", async (_, worldId: string) => {
    return hytaleService.getWorldModConfig(worldId);
  });

  ipcMain.handle("hytale:applyWorldModConfig", async (_, worldId: string) => {
    return hytaleService.applyWorldModConfig(worldId);
  });

  // Download a mod file for Hytale (actually downloads the file, unlike addToLibrary which is metadata-only)
  ipcMain.handle("hytale:downloadModFile", async (_, downloadUrl: string, fileName: string) => {
    try {
      const tempDir = path.join(app.getPath("temp"), "modex-hytale-downloads");
      await fs.ensureDir(tempDir);
      const destPath = path.join(tempDir, fileName);
      
      // Use the download service for robust downloading
      const downloadService = getDownloadService();
      const result = await downloadService.downloadFile(downloadUrl, destPath, {
        timeout: 120000, // 2 minute timeout for large mods
      });
      
      if (!result.success) {
        throw new Error(result.error || "Download failed");
      }
      
      console.info(`[Hytale] Downloaded mod file: ${fileName} -> ${destPath}`);
      return destPath;
    } catch (error: any) {
      console.error("[Hytale] Error downloading mod file:", error);
      throw error;
    }
  });

  // Check for Hytale mod updates
  ipcMain.handle("hytale:checkForUpdates", async (event) => {
    const mods = hytaleService.getInstalledMods();
    const cfMods = mods.filter(m => m.cfProjectId && m.cfFileId);
    
    const results: Array<{
      modId: string;
      hytaleModId?: string;
      projectId: number | null;
      projectName: string;
      currentVersion: string;
      currentFileId: number | null;
      latestVersion: string | null;
      latestFileId: number | null;
      hasUpdate: boolean;
      updateUrl: string | null;
    }> = [];
    
    // Process in parallel batches
    const BATCH_SIZE = 5;
    let completed = 0;
    
    for (let i = 0; i < cfMods.length; i += BATCH_SIZE) {
      const batch = cfMods.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (mod) => {
          try {
            // For Hytale, we get the latest files without version/loader filtering
            // since Hytale doesn't have those constraints like Minecraft
            const files = await curseforgeService.getModFiles(mod.cfProjectId!, {
              gameId: 70216, // Hytale
            });
            
            // Find the latest release file
            const latestFile = files?.length > 0 
              ? files.sort((a: any, b: any) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime())[0]
              : null;
            
            const hasUpdate = latestFile 
              ? latestFile.id !== mod.cfFileId 
              : false;
            
            return {
              modId: mod.id,
              hytaleModId: mod.hytaleModId,
              projectId: mod.cfProjectId || null,
              projectName: mod.name,
              currentVersion: mod.version,
              currentFileId: mod.cfFileId || null,
              latestVersion: latestFile?.displayName || null,
              latestFileId: hasUpdate && latestFile ? latestFile.id : null,
              hasUpdate,
              updateUrl: mod.cfProjectId 
                ? `https://www.curseforge.com/hytale/mods/${mod.cfProjectId}`
                : null,
            };
          } catch (error) {
            console.error(`[Hytale] Error checking update for ${mod.name}:`, error);
            return {
              modId: mod.id,
              hytaleModId: mod.hytaleModId,
              projectId: mod.cfProjectId || null,
              projectName: mod.name,
              currentVersion: mod.version,
              currentFileId: mod.cfFileId || null,
              latestVersion: null,
              latestFileId: null,
              hasUpdate: false,
              updateUrl: null,
            };
          }
        })
      );
      
      results.push(...batchResults);
      completed += batch.length;
      
      // Send progress update
      event.sender.send("hytale:updates:progress", {
        current: completed,
        total: cfMods.length,
        modName: batch[batch.length - 1]?.name || "",
      });
    }
    
    return results;
  });

  // Apply Hytale mod update
  ipcMain.handle("hytale:applyUpdate", async (_, modId: string, newFileId: number) => {
    try {
      const mods = hytaleService.getInstalledMods();
      const mod = mods.find(m => m.id === modId);
      
      if (!mod || !mod.cfProjectId) {
        return { success: false, error: "Mod not found or not from CurseForge" };
      }
      
      // Get the file info
      const file = await curseforgeService.getModFile(mod.cfProjectId, newFileId);
      if (!file) {
        return { success: false, error: "Could not get file info from CurseForge" };
      }
      
      // Download the new file
      const downloadUrl = file.downloadUrl;
      if (!downloadUrl) {
        return { success: false, error: "Download URL not available" };
      }
      
      const tempDir = path.join(app.getPath("temp"), "modex-hytale-downloads");
      await fs.ensureDir(tempDir);
      const destPath = path.join(tempDir, file.fileName);
      
      const downloadService = getDownloadService();
      const downloadResult = await downloadService.downloadFile(downloadUrl, destPath, {
        timeout: 120000,
      });
      
      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error || "Download failed" };
      }
      
      // Remove the old mod
      await hytaleService.removeMod(modId);
      
      // Install the new mod with proper metadata
      const installResult = await hytaleService.installMod(destPath, {
        id: `cf-file-${newFileId}`,
        name: mod.name,
        version: file.displayName || file.fileName,
        cfProjectId: mod.cfProjectId,
        cfFileId: newFileId,
        logoUrl: mod.logoUrl,
      });
      
      // Clean up temp file
      await fs.remove(destPath).catch(() => {});
      
      if (installResult.success) {
        return { success: true, newModId: installResult.mod?.id };
      } else {
        return { success: false, error: installResult.error };
      }
    } catch (error: any) {
      console.error("[Hytale] Error applying update:", error);
      return { success: false, error: error.message };
    }
  });
}
