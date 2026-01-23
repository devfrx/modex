/**
 * Modpacks IPC handlers
 * Handles modpack CRUD, mod management, instant sync, CF updates, and related operations
 */

import { ipcMain, shell, BrowserWindow } from "electron";
import type { MetadataManager, Mod, Modpack } from "../services/MetadataManager";
import type { CurseForgeService, getContentTypeFromClassId as GetContentTypeFromClassIdFn } from "../services/CurseForgeService";
import type { GistService } from "../services/GistService";
import type { InstanceService } from "../services/InstanceService";
import type { DownloadService } from "../services/DownloadService";
import type { ElectronLog } from "electron-log";
import path from "path";
import fs from "fs-extra";

export interface ModpacksIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  gistService: GistService;
  instanceService: InstanceService;
  getDownloadService: () => DownloadService;
  getWindow: () => BrowserWindow | null;
  log: ElectronLog;
}

export function registerModpacksHandlers(deps: ModpacksIpcDeps): void {
  const { metadataManager, curseforgeService, gistService, instanceService, getDownloadService, getWindow, log } = deps;

  // Dynamic import for getContentTypeFromClassId
  let getContentTypeFromClassId: typeof GetContentTypeFromClassIdFn;

  // ========== HELPER FUNCTIONS ==========

  /**
   * Guard function to prevent modifications to linked modpacks
   * Throws an error if the modpack has a remote_source (is linked)
   */
  async function guardLinkedModpack(modpackId: string, operation: string): Promise<void> {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (modpack?.remote_source?.url) {
      throw new Error(`Cannot ${operation}: modpack is linked to a remote source. Sync from remote to update.`);
    }
  }

  /**
   * Check if instant sync should proceed for an instance
   * Returns false if:
   * - No instance linked
   * - Instance is installing/syncing
   * - Game is currently running on this instance
   */
  async function canInstantSync(modpackId: string): Promise<{ canSync: boolean; instance?: any; reason?: string }> {
    const instance = await instanceService.getInstanceByModpack(modpackId);
    if (!instance) {
      return { canSync: false, reason: "no_instance" };
    }

    // Don't sync if instance is currently installing/syncing
    if (instance.state === "installing") {
      log.info(`DirectSync: Skipping - instance ${instance.id} is currently installing`);
      return { canSync: false, instance, reason: "installing" };
    }

    // Don't sync if game is running on this instance
    const runningGame = instanceService.getRunningGame(instance.id);
    if (runningGame) {
      log.info(`DirectSync: Skipping - game is running on instance ${instance.id}`);
      return { canSync: false, instance, reason: "game_running" };
    }

    return { canSync: true, instance };
  }

  /**
   * Helper to sync a single mod file to the instance
   */
  async function syncModToInstance(modpackId: string, mod: { id: string; name: string; filename: string; cf_project_id?: number; cf_file_id?: number; content_type?: string }): Promise<{ success: boolean; error?: string; skipped?: boolean; reason?: string }> {
    try {
      const { canSync, instance, reason } = await canInstantSync(modpackId);
      if (!canSync) {
        return { success: true, skipped: true, reason };
      }

      // Determine destination folder based on content_type
      let destFolder: string;
      switch (mod.content_type) {
        case "resourcepack":
          destFolder = path.join(instance.path, "resourcepacks");
          break;
        case "shader":
          destFolder = path.join(instance.path, "shaderpacks");
          break;
        default:
          destFolder = path.join(instance.path, "mods");
      }
      await fs.ensureDir(destFolder);

      const destPath = path.join(destFolder, mod.filename);
      const disabledDestPath = destPath + ".disabled";

      // Skip if already exists
      if (await fs.pathExists(destPath) || await fs.pathExists(disabledDestPath)) {
        log.info(`DirectSync: Skipping ${mod.name} - already exists`);
        return { success: true, skipped: true, reason: "already_exists" };
      }

      // Build download URL - support both CurseForge and Modrinth
      let downloadUrl: string | undefined;
      if (mod.cf_project_id && mod.cf_file_id) {
        // CurseForge URL
        const fileIdStr = mod.cf_file_id.toString();
        const part1 = fileIdStr.substring(0, 4);
        const part2 = fileIdStr.substring(4);
        downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(mod.filename)}`;
      }

      if (!downloadUrl) {
        log.info(`DirectSync: No download URL for ${mod.name} (local mod or missing CF IDs)`);
        return { success: true, skipped: true, reason: "no_download_url" };
      }

      // Download the file with timeout
      log.info(`DirectSync: Downloading ${mod.filename}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      try {
        const response = await fetch(downloadUrl, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(destPath, buffer);
        log.info(`DirectSync: Downloaded ${mod.filename} (${buffer.length} bytes)`);

        return { success: true };
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          throw new Error('Download timed out');
        }
        throw fetchError;
      }
    } catch (error: any) {
      log.error(`DirectSync: Error syncing ${mod.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper to remove a mod file from the instance
   */
  async function removeModFromInstance(modpackId: string, mod: { filename: string; content_type?: string }): Promise<{ success: boolean; error?: string; skipped?: boolean; reason?: string }> {
    try {
      const { canSync, instance, reason } = await canInstantSync(modpackId);
      if (!canSync) {
        return { success: true, skipped: true, reason };
      }

      // Determine folder based on content_type
      let folder: string;
      switch (mod.content_type) {
        case "resourcepack":
          folder = path.join(instance.path, "resourcepacks");
          break;
        case "shader":
          folder = path.join(instance.path, "shaderpacks");
          break;
        default:
          folder = path.join(instance.path, "mods");
      }

      const filePath = path.join(folder, mod.filename);
      const disabledPath = filePath + ".disabled";

      // Remove both enabled and disabled versions
      let removed = false;
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        log.info(`DirectSync: Removed ${mod.filename}`);
        removed = true;
      }
      if (await fs.pathExists(disabledPath)) {
        await fs.remove(disabledPath);
        log.info(`DirectSync: Removed ${mod.filename}.disabled`);
        removed = true;
      }

      if (!removed) {
        return { success: true, skipped: true, reason: "file_not_found" };
      }

      return { success: true };
    } catch (error: any) {
      // Check for EBUSY (file locked)
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        log.error(`DirectSync: File is locked (game running?): ${mod.filename}`);
        return { success: false, error: 'File is locked - is the game running?' };
      }
      log.error(`DirectSync: Error removing file:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper to toggle mod enabled/disabled state in the instance
   */
  async function toggleModInInstance(modpackId: string, mod: { filename: string; content_type?: string }, enabled: boolean): Promise<{ success: boolean; error?: string; skipped?: boolean; reason?: string }> {
    try {
      const { canSync, instance, reason } = await canInstantSync(modpackId);
      if (!canSync) {
        return { success: true, skipped: true, reason };
      }

      // Determine folder based on content_type
      let folder: string;
      switch (mod.content_type) {
        case "resourcepack":
          folder = path.join(instance.path, "resourcepacks");
          break;
        case "shader":
          folder = path.join(instance.path, "shaderpacks");
          break;
        default:
          folder = path.join(instance.path, "mods");
      }

      const enabledPath = path.join(folder, mod.filename);
      const disabledPath = enabledPath + ".disabled";

      if (enabled) {
        // Enable: rename .disabled to normal
        try {
          await fs.rename(disabledPath, enabledPath);
          log.info(`DirectSync: Enabled ${mod.filename}`);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            if (await fs.pathExists(enabledPath)) {
              return { success: true };
            }
            return { success: true, skipped: true, reason: "file_not_found" };
          }
          throw err;
        }
      } else {
        // Disable: rename to .disabled
        try {
          await fs.rename(enabledPath, disabledPath);
          log.info(`DirectSync: Disabled ${mod.filename}`);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            if (await fs.pathExists(disabledPath)) {
              return { success: true };
            }
            return { success: true, skipped: true, reason: "file_not_found" };
          }
          throw err;
        }
      }

      return { success: true };
    } catch (error: any) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        log.error(`DirectSync: File is locked (game running?): ${mod.filename}`);
        return { success: false, error: 'File is locked - is the game running?' };
      }
      log.error(`DirectSync: Error toggling mod:`, error);
      return { success: false, error: error.message };
    }
  }

  // ========== BASIC MODPACK CRUD HANDLERS ==========

  ipcMain.handle("modpacks:getAll", async () => {
    return metadataManager.getAllModpacks();
  });

  ipcMain.handle("modpacks:getById", async (_, id: string) => {
    if (!id || typeof id !== 'string') {
      log.warn('modpacks:getById called with invalid id:', id);
      return undefined;
    }
    return metadataManager.getModpackById(id);
  });

  // Verify cloud status for all modpacks (called after list load for UI indicators)
  ipcMain.handle("modpacks:verifyCloudStatus", async () => {
    try {
      const modpacks = await metadataManager.getAllModpacks();
      const results: Record<string, "published" | "subscribed" | "error" | null> = {};

      for (const modpack of modpacks) {
        // Check publisher status (has gist_config)
        if (modpack.gist_config?.gist_id) {
          try {
            const exists = await gistService.gistExists(modpack.gist_config.gist_id);
            results[modpack.id] = exists ? "published" : "error";
          } catch (err) {
            log.warn(`verifyCloudStatus: Failed to verify gist for modpack ${modpack.id}:`, err);
            results[modpack.id] = "error";
          }
        }
        // Check subscriber status (has remote_source URL)
        else if (modpack.remote_source?.url) {
          try {
            const response = await fetch(modpack.remote_source.url, { method: "HEAD" });
            results[modpack.id] = response.ok ? "subscribed" : "error";
          } catch (err) {
            log.warn(`verifyCloudStatus: Failed to verify remote source for modpack ${modpack.id}:`, err);
            results[modpack.id] = "error";
          }
        }
        else {
          results[modpack.id] = null;
        }
      }

      return results;
    } catch (error) {
      log.error("Failed to verify cloud status:", error);
      return {};
    }
  });

  ipcMain.handle("modpacks:create", async (_, data: any) => {
    if (!data || !data.name) {
      throw new Error('Invalid modpack data: name is required');
    }
    return metadataManager.createModpack(data);
  });

  // Backward compatibility
  ipcMain.handle("modpacks:add", async (_, data: any) => {
    if (!data || !data.name) {
      throw new Error('Invalid modpack data: name is required');
    }
    return metadataManager.createModpack(data);
  });

  ipcMain.handle(
    "modpacks:update",
    async (_, id: string, updates: Partial<Modpack>) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid modpack id');
      }
      // Protect critical fields on linked modpacks
      const criticalFields = ['mod_ids', 'disabled_mod_ids', 'locked_mod_ids', 'mod_notes'];
      const hasCriticalUpdates = criticalFields.some(f => f in updates);
      
      if (hasCriticalUpdates) {
        await guardLinkedModpack(id, "modify modpack structure");
      }
      
      return metadataManager.updateModpack(id, updates);
    }
  );

  ipcMain.handle("modpacks:delete", async (_, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid modpack id');
    }
    // First, find and delete any linked instance
    const linkedInstance = await instanceService.getInstanceByModpack(id);
    if (linkedInstance) {
      log.info(`Delete Modpack: Also deleting linked instance: ${linkedInstance.id}`);
      await instanceService.deleteInstance(linkedInstance.id);
    }

    // Then delete the modpack
    return metadataManager.deleteModpack(id);
  });

  // ========== MOD QUERY HANDLERS ==========

  ipcMain.handle("modpacks:getMods", async (_, modpackId: string) => {
    if (!modpackId || typeof modpackId !== 'string') {
      return [];
    }
    return metadataManager.getModsInModpack(modpackId);
  });

  ipcMain.handle("modpacks:getModsMultiple", async (_, modpackIds: string[]) => {
    if (!Array.isArray(modpackIds)) {
      return {};
    }
    const result = await metadataManager.getModsInMultipleModpacks(modpackIds);
    // Convert Map to plain object for IPC serialization
    const obj: Record<string, Mod[]> = {};
    for (const [key, value] of result) {
      obj[key] = value;
    }
    return obj;
  });

  ipcMain.handle("modpacks:getDisabledMods", async (_, modpackId: string) => {
    if (!modpackId || typeof modpackId !== 'string') {
      return [];
    }
    return metadataManager.getDisabledMods(modpackId);
  });

  ipcMain.handle("modpacks:getLockedMods", async (_, modpackId: string) => {
    if (!modpackId || typeof modpackId !== 'string') {
      return [];
    }
    return metadataManager.getLockedMods(modpackId);
  });

  // ========== MOD MANAGEMENT WITH INSTANT SYNC ==========

  ipcMain.handle(
    "modpacks:addMod",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || !modId) {
        throw new Error('Invalid modpack or mod id');
      }
      await guardLinkedModpack(modpackId, "add mod");
      
      const syncSettings = await metadataManager.getInstanceSyncSettings();
      
      if (syncSettings.instantSync) {
        return metadataManager.withModpackLock(modpackId, async () => {
          const mod = await metadataManager.getModById(modId);
          if (!mod) {
            throw new Error(`Mod ${modId} not found in library`);
          }
          
          const result = await metadataManager.addModToModpackUnlocked(modpackId, modId);
          
          try {
            await syncModToInstance(modpackId, {
              id: mod.id,
              name: mod.name,
              filename: mod.filename,
              cf_project_id: mod.cf_project_id,
              cf_file_id: mod.cf_file_id,
              content_type: mod.content_type
            });
          } catch (syncError) {
            log.error(`InstantSync: Failed to sync mod ${modId}, rolling back:`, syncError);
            try {
              await metadataManager.removeModFromModpackUnlocked(modpackId, modId);
            } catch (rollbackError) {
              log.error(`InstantSync: Rollback also failed:`, rollbackError);
            }
            throw new Error(`Failed to sync mod to instance: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
          }
          
          return result;
        });
      }
      
      return metadataManager.addModToModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:addModsBatch",
    async (_, modpackId: string, modIds: string[]) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!Array.isArray(modIds)) {
        throw new Error('Invalid modIds: must be an array');
      }
      await guardLinkedModpack(modpackId, "add mods");
      
      const syncSettings = await metadataManager.getInstanceSyncSettings();
      
      if (syncSettings.instantSync) {
        return metadataManager.withModpackLock(modpackId, async () => {
          const mods = await Promise.all(modIds.map(id => metadataManager.getModById(id)));
          const validMods = mods.filter((m): m is NonNullable<typeof m> => m != null);
          
          const result = await metadataManager.addModsToModpackBatchUnlocked(modpackId, modIds);
          
          const syncedModIds: string[] = [];
          try {
            for (const mod of validMods) {
              await syncModToInstance(modpackId, {
                id: mod.id,
                name: mod.name,
                filename: mod.filename,
                cf_project_id: mod.cf_project_id,
                cf_file_id: mod.cf_file_id,
                content_type: mod.content_type
              });
              syncedModIds.push(mod.id);
            }
          } catch (syncError) {
            log.error(`InstantSync: Failed to sync batch, rolling back ${syncedModIds.length} mods:`, syncError);
            try {
              for (const modId of syncedModIds) {
                await metadataManager.removeModFromModpackUnlocked(modpackId, modId);
              }
            } catch (rollbackError) {
              log.error(`InstantSync: Rollback also failed:`, rollbackError);
            }
            throw new Error(`Failed to sync mods to instance: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
          }
          
          return result;
        });
      }
      
      return metadataManager.addModsToModpackBatch(modpackId, modIds);
    }
  );

  ipcMain.handle(
    "modpacks:removeMod",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      await guardLinkedModpack(modpackId, "remove mod");
      
      const syncSettings = await metadataManager.getInstanceSyncSettings();
      
      if (syncSettings.instantSync) {
        return metadataManager.withModpackLock(modpackId, async () => {
          const mod = await metadataManager.getModById(modId);
          if (!mod) {
            return metadataManager.removeModFromModpackUnlocked(modpackId, modId);
          }
          
          const result = await metadataManager.removeModFromModpackUnlocked(modpackId, modId);
          
          try {
            await removeModFromInstance(modpackId, {
              filename: mod.filename,
              content_type: mod.content_type
            });
          } catch (syncError) {
            log.error(`InstantSync: Failed to remove mod ${modId} from instance, rolling back:`, syncError);
            try {
              await metadataManager.addModToModpackUnlocked(modpackId, modId);
            } catch (rollbackError) {
              log.error(`InstantSync: Rollback also failed:`, rollbackError);
            }
            throw new Error(`Failed to remove mod from instance: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
          }
          
          return result;
        });
      }
      
      return metadataManager.removeModFromModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:toggleMod",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      await guardLinkedModpack(modpackId, "toggle mod");
      
      const syncSettings = await metadataManager.getInstanceSyncSettings();
      
      if (syncSettings.instantSync) {
        return metadataManager.withModpackLock(modpackId, async () => {
          const mod = await metadataManager.getModById(modId);
          if (!mod) {
            throw new Error(`Mod ${modId} not found in library`);
          }
          
          const result = await metadataManager.toggleModInModpackUnlocked(modpackId, modId);
          if (!result) {
            return null;
          }
          
          try {
            await toggleModInInstance(modpackId, {
              filename: mod.filename,
              content_type: mod.content_type
            }, result.enabled);
          } catch (syncError) {
            log.error(`InstantSync: Failed to toggle mod ${modId} in instance, rolling back:`, syncError);
            try {
              await metadataManager.toggleModInModpackUnlocked(modpackId, modId);
            } catch (rollbackError) {
              log.error(`InstantSync: Rollback also failed:`, rollbackError);
            }
            throw new Error(`Failed to toggle mod in instance: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
          }
          
          return result;
        });
      }
      
      return metadataManager.toggleModInModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:setModEnabled",
    async (_, modpackId: string, modId: string, enabled: boolean) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      if (typeof enabled !== 'boolean') {
        throw new Error('Invalid enabled: must be a boolean');
      }
      await guardLinkedModpack(modpackId, "change mod state");
      
      const syncSettings = await metadataManager.getInstanceSyncSettings();
      
      if (syncSettings.instantSync) {
        return metadataManager.withModpackLock(modpackId, async () => {
          const mod = await metadataManager.getModById(modId);
          if (!mod) {
            throw new Error(`Mod ${modId} not found in library`);
          }
          
          const result = await metadataManager.setModEnabledInModpackUnlocked(modpackId, modId, enabled);
          
          try {
            await toggleModInInstance(modpackId, {
              filename: mod.filename,
              content_type: mod.content_type
            }, enabled);
          } catch (syncError) {
            log.error(`InstantSync: Failed to set mod ${modId} enabled=${enabled} in instance, rolling back:`, syncError);
            try {
              await metadataManager.setModEnabledInModpackUnlocked(modpackId, modId, !enabled);
            } catch (rollbackError) {
              log.error(`InstantSync: Rollback also failed:`, rollbackError);
            }
            throw new Error(`Failed to update mod state in instance: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`);
          }
          
          return result;
        });
      }
      
      return metadataManager.setModEnabledInModpack(modpackId, modId, enabled);
    }
  );

  // ========== DEPENDENCY ANALYSIS HANDLERS ==========

  ipcMain.handle(
    "modpacks:checkModDependents",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        return [];
      }
      if (!modId || typeof modId !== 'string') {
        return [];
      }
      return metadataManager.checkModDependents(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:analyzeModRemovalImpact",
    async (_, modpackId: string, modId: string, action: "remove" | "disable") => {
      if (!modpackId || typeof modpackId !== 'string') {
        return { warnings: [], errors: [], canProceed: false };
      }
      if (!modId || typeof modId !== 'string') {
        return { warnings: [], errors: [], canProceed: false };
      }
      return metadataManager.analyzeModRemovalImpact(modpackId, modId, action);
    }
  );

  ipcMain.handle(
    "modpacks:refreshDependencies",
    async (_, modpackId: string, force?: boolean) => {
      if (!modpackId || typeof modpackId !== 'string') {
        return { updated: 0, skipped: 0, errors: ['Invalid modpackId'] };
      }
      const onProgress = (current: number, total: number, modName: string) => {
        getWindow()?.webContents.send("modpacks:refreshDependenciesProgress", { current, total, modName });
      };
      return metadataManager.refreshModpackDependencies(modpackId, curseforgeService, onProgress, force);
    }
  );

  // ========== DIRECT FILE OPERATIONS (Legacy, still used by some UI) ==========

  ipcMain.handle(
    "modpacks:addModDirect",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || !modId) {
        throw new Error('Invalid modpack or mod id');
      }
      await guardLinkedModpack(modpackId, "add mod");
      
      const result = await metadataManager.addModToModpack(modpackId, modId);
      
      const mod = await metadataManager.getModById(modId);
      if (mod) {
        await syncModToInstance(modpackId, {
          id: mod.id,
          name: mod.name,
          filename: mod.filename,
          cf_project_id: mod.cf_project_id,
          cf_file_id: mod.cf_file_id,
          content_type: mod.content_type
        });
      }
      
      return result;
    }
  );

  ipcMain.handle(
    "modpacks:addModsBatchDirect",
    async (_, modpackId: string, modIds: string[]) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!Array.isArray(modIds)) {
        throw new Error('Invalid modIds: must be an array');
      }
      await guardLinkedModpack(modpackId, "add mods");
      
      const result = await metadataManager.addModsToModpackBatch(modpackId, modIds);
      
      const mods = await Promise.all(modIds.map(id => metadataManager.getModById(id)));
      await Promise.all(
        mods.filter((m): m is NonNullable<typeof m> => m != null).map(mod =>
          syncModToInstance(modpackId, {
            id: mod.id,
            name: mod.name,
            filename: mod.filename,
            cf_project_id: mod.cf_project_id,
            cf_file_id: mod.cf_file_id,
            content_type: mod.content_type
          })
        )
      );
      
      return result;
    }
  );

  ipcMain.handle(
    "modpacks:removeModDirect",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      await guardLinkedModpack(modpackId, "remove mod");
      
      const mod = await metadataManager.getModById(modId);
      const result = await metadataManager.removeModFromModpack(modpackId, modId);
      
      if (mod) {
        await removeModFromInstance(modpackId, {
          filename: mod.filename,
          content_type: mod.content_type
        });
      }
      
      return result;
    }
  );

  ipcMain.handle(
    "modpacks:toggleModDirect",
    async (_, modpackId: string, modId: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      await guardLinkedModpack(modpackId, "toggle mod");
      
      const mod = await metadataManager.getModById(modId);
      const result = await metadataManager.toggleModInModpack(modpackId, modId);
      
      if (mod && result) {
        await toggleModInInstance(modpackId, {
          filename: mod.filename,
          content_type: mod.content_type
        }, result.enabled);
      }
      
      return result;
    }
  );

  ipcMain.handle(
    "modpacks:setModEnabledDirect",
    async (_, modpackId: string, modId: string, enabled: boolean) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      if (typeof enabled !== 'boolean') {
        throw new Error('Invalid enabled: must be a boolean');
      }
      await guardLinkedModpack(modpackId, "change mod state");
      
      const mod = await metadataManager.getModById(modId);
      const result = await metadataManager.setModEnabledInModpack(modpackId, modId, enabled);
      
      if (mod) {
        await toggleModInInstance(modpackId, {
          filename: mod.filename,
          content_type: mod.content_type
        }, enabled);
      }
      
      return result;
    }
  );

  // ========== LOCKED MODS HANDLERS ==========

  ipcMain.handle(
    "modpacks:setModLocked",
    async (_, modpackId: string, modId: string, locked: boolean) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!modId || typeof modId !== 'string') {
        throw new Error('Invalid modId: must be a non-empty string');
      }
      if (typeof locked !== 'boolean') {
        throw new Error('Invalid locked: must be a boolean');
      }
      await guardLinkedModpack(modpackId, "change mod lock state");
      return metadataManager.setModLocked(modpackId, modId, locked);
    }
  );

  ipcMain.handle(
    "modpacks:updateLockedMods",
    async (_, modpackId: string, lockedModIds: string[]) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!Array.isArray(lockedModIds)) {
        throw new Error('Invalid lockedModIds: must be an array');
      }
      await guardLinkedModpack(modpackId, "update locked mods");
      return metadataManager.updateLockedMods(modpackId, lockedModIds);
    }
  );

  // ========== UTILITY HANDLERS ==========

  ipcMain.handle("modpacks:generateResourceList", async (_, modpackId: string, options?: {
    format?: 'simple' | 'detailed' | 'markdown';
    sortBy?: 'name' | 'type' | 'source';
    includeDisabled?: boolean;
  }) => {
    if (!modpackId || typeof modpackId !== 'string') {
      return '';
    }
    return metadataManager.generateResourceList(modpackId, options);
  });

  ipcMain.handle(
    "modpacks:clone",
    async (_, modpackId: string, newName: string) => {
      if (!modpackId || typeof modpackId !== 'string') {
        throw new Error('Invalid modpackId: must be a non-empty string');
      }
      if (!newName || typeof newName !== 'string' || newName.trim() === '') {
        throw new Error('Invalid newName: must be a non-empty string');
      }
      
      const newModpackId = await metadataManager.cloneModpack(modpackId, newName);

      if (newModpackId) {
        try {
          const existingInstance = await instanceService.getInstanceByModpack(modpackId);
          if (existingInstance) {
            const newInstance = await instanceService.duplicateInstance(
              existingInstance.id,
              newName
            );
            if (newInstance) {
              newInstance.modpackId = newModpackId;
              await instanceService.updateInstance(newInstance.id, { modpackId: newModpackId });
              log.info(`Clone: Created instance ${newInstance.id} for cloned modpack ${newModpackId}`);
            }
          }
        } catch (err) {
          log.error(`Clone: Failed to clone instance:`, err);
        }
      }

      return newModpackId;
    }
  );

  ipcMain.handle(
    "modpacks:setImage",
    async (_, modpackId: string, imageUrl: string) => {
      return metadataManager.updateModpack(modpackId, { image_url: imageUrl });
    }
  );

  ipcMain.handle("modpacks:openFolder", async (_, modpackId: string) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) return false;

      const modpacksDir = path.join(metadataManager.getBasePath(), "modpacks");
      await shell.openPath(modpacksDir);
      return true;
    } catch (err) {
      log.error("Failed to open folder:", err);
      return false;
    }
  });

  ipcMain.handle(
    "modpacks:hasOverrides",
    async (_, modpackId: string) => {
      return metadataManager.hasOverrides(modpackId);
    }
  );

  ipcMain.handle(
    "modpacks:hasUnsavedChanges",
    async (_, modpackId: string) => {
      const result = await metadataManager.getUnsavedChanges(modpackId);
      return result.hasChanges;
    }
  );

  ipcMain.handle(
    "modpacks:getUnsavedChanges",
    async (_, modpackId: string) => {
      return metadataManager.getUnsavedChanges(modpackId);
    }
  );

  ipcMain.handle(
    "modpacks:revertUnsavedChanges",
    async (_, modpackId: string) => {
      return metadataManager.revertUnsavedChanges(modpackId);
    }
  );

  // ========== CURSEFORGE UPDATE HANDLERS ==========

  ipcMain.handle(
    "modpacks:checkCFUpdate",
    async (
      _,
      modpackId: string
    ): Promise<{
      hasUpdate: boolean;
      currentVersion?: string;
      latestVersion?: string;
      latestFileId?: number;
      changelog?: string;
      releaseDate?: string;
      downloadUrl?: string;
    }> => {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack || !modpack.cf_project_id || !modpack.cf_file_id) {
        return { hasUpdate: false };
      }

      try {
        const files = await curseforgeService.getModFiles(modpack.cf_project_id);

        if (!files || files.length === 0) {
          return { hasUpdate: false };
        }

        const sortedFiles = [...files].sort((a: any, b: any) => b.id - a.id);
        const currentFile = sortedFiles.find((f: any) => f.id === modpack.cf_file_id);
        const latestRelease = sortedFiles.find((f: any) => f.releaseType === 1) || sortedFiles[0];

        if (!latestRelease || latestRelease.id === modpack.cf_file_id) {
          return {
            hasUpdate: false,
            currentVersion: currentFile?.displayName || modpack.version,
          };
        }

        if (latestRelease.id > modpack.cf_file_id) {
          return {
            hasUpdate: true,
            currentVersion: currentFile?.displayName || modpack.version,
            latestVersion: latestRelease.displayName,
            latestFileId: latestRelease.id,
            releaseDate: latestRelease.fileDate,
            downloadUrl: latestRelease.downloadUrl || undefined,
          };
        }

        return {
          hasUpdate: false,
          currentVersion: currentFile?.displayName || modpack.version,
        };
      } catch (error) {
        log.error("Error checking modpack update:", error);
        return { hasUpdate: false };
      }
    }
  );

  ipcMain.handle(
    "modpacks:updateCFModpack",
    async (
      _,
      modpackId: string,
      newFileId: number,
      createNew: boolean
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => {
      if (!createNew) {
        await guardLinkedModpack(modpackId, "update CF modpack");
      }
      
      const win = getWindow();
      if (!win) {
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["Window not available"],
        };
      }

      try {
        const modpack = await metadataManager.getModpackById(modpackId);
        if (!modpack || !modpack.cf_project_id) {
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: ["Modpack not found or not from CurseForge"],
          };
        }

        const cfFile = await curseforgeService.getFile(modpack.cf_project_id, newFileId);
        if (!cfFile) {
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: ["Could not find the update file on CurseForge"],
          };
        }

        const downloadUrl = cfFile.downloadUrl ||
          `https://edge.forgecdn.net/files/${Math.floor(newFileId / 1000)}/${newFileId % 1000}/${cfFile.fileName}`;

        const pathModule = await import("path");
        const os = await import("os");

        const tempDir = pathModule.join(os.tmpdir(), "modex-cf-update");
        await fs.ensureDir(tempDir);
        const tempFile = pathModule.join(tempDir, `${Date.now()}_update.zip`);

        win.webContents.send("import:progress", {
          current: 0,
          total: 100,
          modName: "Downloading update...",
        });

        const downloadService = getDownloadService();
        const downloadResult = await downloadService.downloadFile(downloadUrl, tempFile, {
          retries: 3,
          onProgress: (progress) => {
            if (win) {
              win.webContents.send("import:progress", {
                current: Math.round(progress.percentage * 0.1),
                total: 100,
                modName: `Downloading update... ${Math.round(progress.percentage)}%`,
              });
            }
          },
        });

        if (!downloadResult.success) {
          throw new Error(`Failed to download: ${downloadResult.error}`);
        }

        win.webContents.send("import:progress", {
          current: 10,
          total: 100,
          modName: "Extracting manifest...",
        });

        const AdmZip = (await import("adm-zip")).default;
        let zip;
        try {
          zip = new AdmZip(tempFile);
        } catch (zipError: any) {
          await fs.remove(tempFile);
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: [`Corrupted or invalid modpack file: ${zipError.message || "Unable to read ZIP archive"}`],
          };
        }
        const manifestEntry = zip.getEntry("manifest.json");

        if (!manifestEntry) {
          await fs.remove(tempFile);
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: ["Invalid CurseForge modpack: manifest.json not found"],
          };
        }

        let manifest;
        try {
          manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
        } catch (parseError) {
          await fs.remove(tempFile);
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: ["Invalid CurseForge modpack: manifest.json is not valid JSON"],
          };
        }

        const onProgress = (current: number, total: number, modName: string) => {
          win?.webContents.send("import:progress", { current, total, modName });
        };

        if (createNew) {
          let importResult: {
            modpackId: string;
            modsImported: number;
            modsSkipped: number;
            errors: string[];
          };

          try {
            importResult = await metadataManager.importFromCurseForge(
              manifest,
              curseforgeService,
              onProgress
            );
          } catch (importError: any) {
            if (importError.code === "VERSION_CONFLICTS" && importError.partialData?.modpackId) {
              log.info("CF Update: Version conflicts detected but modpack created successfully");
              importResult = {
                modpackId: importError.partialData.modpackId,
                modsImported: importError.partialData.newModIds?.length || 0,
                modsSkipped: importError.conflicts?.length || 0,
                errors: [`${importError.conflicts?.length || 0} mods had version conflicts and were skipped`],
              };
            } else {
              throw importError;
            }
          }

          if (importResult.modpackId) {
            await metadataManager.updateModpack(importResult.modpackId, {
              cf_project_id: modpack.cf_project_id,
              cf_file_id: newFileId,
              cf_slug: modpack.cf_slug,
              name: `${modpack.name} (${cfFile.displayName})`,
            });
          }

          await fs.remove(tempFile);
          return {
            success: !!importResult.modpackId,
            modpackId: importResult.modpackId,
            modsImported: importResult.modsImported,
            modsSkipped: importResult.modsSkipped,
            errors: importResult.errors,
          };
        } else {
          // Replace current modpack
          const currentMods = [...(modpack.mod_ids || [])];
          for (const modIdToRemove of currentMods) {
            await metadataManager.removeModFromModpack(modpackId, modIdToRemove);
          }

          await metadataManager.updateModpack(modpackId, {
            disabled_mod_ids: [],
            incompatible_mods: [],
          });

          const errors: string[] = [];
          const newModIds: string[] = [];
          const disabledModIds: string[] = [];
          const incompatibleMods: Array<{ cf_project_id: number; name: string; reason: string }> = [];

          let loader = "unknown";
          const primaryLoader = manifest.minecraft?.modLoaders?.find((l: any) => l.primary);
          if (primaryLoader) {
            const match = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
            if (match) loader = match[1].toLowerCase();
          }
          const mcVersion = manifest.minecraft?.version || modpack.minecraft_version;

          // Lazy load getContentTypeFromClassId
          if (!getContentTypeFromClassId) {
            const cfModule = await import("../services/CurseForgeService");
            getContentTypeFromClassId = cfModule.getContentTypeFromClassId;
          }

          const totalFiles = manifest.files?.length || 0;
          let processedCount = 0;

          for (const file of manifest.files || []) {
            const { projectID, fileID } = file;
            const isRequired = file.required !== false;
            processedCount++;

            try {
              const cfMod = await curseforgeService.getMod(projectID);
              if (!cfMod) {
                onProgress?.(processedCount, totalFiles, `Mod ${projectID} not found`);
                errors.push(`Mod ${projectID} not found`);
                continue;
              }

              onProgress?.(processedCount, totalFiles, cfMod.name);

              const cfFileData = await curseforgeService.getFile(projectID, fileID);
              if (!cfFileData) {
                errors.push(`File ${fileID} not found for ${cfMod.name}`);
                continue;
              }

              const allMods = await metadataManager.getAllMods();
              let existingMod = allMods.find(
                (m: any) => m.source === "curseforge" && m.cf_project_id === projectID && m.cf_file_id === fileID
              ) || null;

              if (existingMod) {
                newModIds.push(existingMod.id);
                if (!isRequired) disabledModIds.push(existingMod.id);
                continue;
              }

              const contentType = getContentTypeFromClassId(cfMod.classId);
              const formattedMod = curseforgeService.modToLibraryFormat(cfMod, cfFileData, loader, mcVersion, contentType);

              const mod = await metadataManager.addMod({
                name: formattedMod.name,
                slug: formattedMod.slug,
                version: formattedMod.version,
                game_version: formattedMod.game_version,
                game_versions: formattedMod.game_versions,
                loader: formattedMod.loader,
                content_type: formattedMod.content_type,
                filename: formattedMod.filename,
                source: "curseforge",
                cf_project_id: formattedMod.cf_project_id,
                cf_file_id: formattedMod.cf_file_id,
                description: formattedMod.description,
                author: formattedMod.author,
                thumbnail_url: formattedMod.thumbnail_url,
                logo_url: formattedMod.logo_url,
                download_count: formattedMod.download_count,
                release_type: formattedMod.release_type,
                date_released: formattedMod.date_released,
                dependencies: formattedMod.dependencies,
                categories: formattedMod.categories,
                file_size: formattedMod.file_size,
                // Environment from CurseForge gameVersions
                environment: formattedMod.environment,
                isServerPack: formattedMod.isServerPack ?? null,
              });

              newModIds.push(mod.id);
              if (!isRequired) disabledModIds.push(mod.id);
            } catch (error: any) {
              errors.push(`Error processing ${projectID}: ${error.message}`);
            }
          }

          for (const modIdToAdd of newModIds) {
            await metadataManager.addModToModpack(modpackId, modIdToAdd);
          }

          await metadataManager.updateModpack(modpackId, {
            version: manifest.version || cfFile.displayName,
            minecraft_version: mcVersion,
            loader,
            cf_file_id: newFileId,
            disabled_mod_ids: disabledModIds.length > 0 ? disabledModIds : undefined,
            incompatible_mods: incompatibleMods.length > 0 ? incompatibleMods : undefined,
          });

          await fs.remove(tempFile);
          return {
            success: true,
            modpackId,
            modsImported: newModIds.length,
            modsSkipped: errors.length,
            errors,
          };
        }
      } catch (error: any) {
        log.error("Error updating CF modpack:", error);
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: [error.message || "Unknown error"],
        };
      }
    }
  );

  ipcMain.handle(
    "modpacks:getCFChangelog",
    async (_, cfProjectId: number, cfFileId: number): Promise<string> => {
      try {
        return await curseforgeService.getFileChangelog(cfProjectId, cfFileId);
      } catch (error) {
        log.error("Error getting modpack changelog:", error);
        return "";
      }
    }
  );

  ipcMain.handle(
    "modpacks:reSearchIncompatible",
    async (
      _,
      modpackId: string
    ): Promise<{
      found: number;
      notFound: number;
      added: string[];
      stillIncompatible: string[];
    }> => {
      try {
        const onProgress = (current: number, total: number, modName: string) => {
          getWindow()?.webContents.send("import:progress", { current, total, modName });
        };

        return await metadataManager.reSearchIncompatibleMods(
          modpackId,
          curseforgeService,
          onProgress
        );
      } catch (error: any) {
        log.error("Error re-searching incompatible mods:", error);
        throw error;
      }
    }
  );
}
