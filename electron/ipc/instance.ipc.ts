/**
 * Instance IPC handlers
 * Handles game instance management, launch, sync, and configuration
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import type { InstanceService, ModexInstance, RunningGameInfo } from "../services/InstanceService";
import type { MetadataManager } from "../services/MetadataManager";
import type { ElectronLog } from "electron-log";
import path from "path";
import fs from "fs-extra";

export interface InstanceIpcDeps {
  instanceService: InstanceService;
  metadataManager: MetadataManager;
  getWindow: () => BrowserWindow | null;
  log: ElectronLog;
}

export function registerInstanceHandlers(deps: InstanceIpcDeps): void {
  const { instanceService, metadataManager, getWindow, log } = deps;

  // ========== BASIC INSTANCE CRUD HANDLERS ==========

  ipcMain.handle("instance:getAll", async () => {
    return instanceService.getInstances();
  });

  ipcMain.handle("instance:get", async (_, id: string) => {
    return instanceService.getInstance(id);
  });

  ipcMain.handle("instance:getByModpack", async (_, modpackId: string) => {
    return instanceService.getInstanceByModpack(modpackId);
  });

  ipcMain.handle("instance:create", async (_, options: {
    name: string;
    minecraftVersion: string;
    loader: string;
    loaderVersion?: string;
    modpackId?: string;
    description?: string;
    icon?: string;
    memory?: { min: number; max: number };
    source?: ModexInstance["source"];
  }) => {
    // Validate required fields
    if (!options || typeof options !== 'object') {
      throw new Error('Invalid instance options: must be an object');
    }
    if (!options.name || typeof options.name !== 'string' || options.name.trim() === '') {
      throw new Error('Invalid instance options: name is required and must be a non-empty string');
    }
    if (!options.minecraftVersion || typeof options.minecraftVersion !== 'string') {
      throw new Error('Invalid instance options: minecraftVersion is required');
    }
    if (!options.loader || typeof options.loader !== 'string') {
      throw new Error('Invalid instance options: loader is required');
    }
    return instanceService.createInstance(options);
  });

  ipcMain.handle("instance:delete", async (_, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid instance id: must be a non-empty string');
    }
    return instanceService.deleteInstance(id);
  });

  ipcMain.handle("instance:update", async (_, id: string, updates: Partial<ModexInstance>) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid instance id: must be a non-empty string');
    }
    return instanceService.updateInstance(id, updates);
  });

  // ========== SYNC HANDLERS ==========

  ipcMain.handle("instance:syncModpack", async (_, instanceId: string, modpackId: string, options?: {
    clearExisting?: boolean;
    configSyncMode?: "overwrite" | "new_only" | "skip";
    overridesZipPath?: string;
  }) => {
    log.info(`[instance:syncModpack] Called with instanceId: ${instanceId}, modpackId: ${modpackId}`);

    // Get modpack and mods
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      log.info(`[instance:syncModpack] Modpack not found: ${modpackId}`);
      return { success: false, modsDownloaded: 0, modsSkipped: 0, configsCopied: 0, configsSkipped: 0, errors: ["Modpack not found"], warnings: [] };
    }

    log.info(`[instance:syncModpack] Found modpack: ${modpack.name}, mod_ids count: ${modpack.mod_ids?.length}, disabled_mod_ids: ${JSON.stringify(modpack.disabled_mod_ids)}`);

    // Update instance loader and loaderVersion to match modpack (so next launch installs correct loader)
    const instance = await instanceService.getInstance(instanceId);
    if (instance) {
      const needsLoaderUpdate =
        instance.loader !== modpack.loader ||
        instance.loaderVersion !== modpack.loader_version;

      if (needsLoaderUpdate) {
        log.info(`[instance:syncModpack] Updating instance loader: ${instance.loader}/${instance.loaderVersion} -> ${modpack.loader}/${modpack.loader_version}`);
        await instanceService.updateInstance(instanceId, {
          loader: modpack.loader,
          loaderVersion: modpack.loader_version
        });
      }
    }

    const mods = await metadataManager.getModsInModpack(modpackId);
    const disabledModIds = new Set(modpack.disabled_mod_ids || []);

    log.info(`[instance:syncModpack] Modpack has ${mods.length} mods, ${disabledModIds.size} disabled`);

    // Log mods without CF IDs (potential problems)
    const modsWithoutCFIds = mods.filter(m => !m.cf_project_id || !m.cf_file_id);
    if (modsWithoutCFIds.length > 0) {
      log.info(`[instance:syncModpack] WARNING: ${modsWithoutCFIds.length} mods without CF IDs:`);
      modsWithoutCFIds.forEach(m => log.info(`  - ${m.name} (id: ${m.id})`));
    }

    // Prepare ALL mods data (including disabled) - they'll be renamed to .disabled after download
    const modsToSync = mods
      .map(m => ({
        id: m.id,
        name: m.name,
        filename: m.filename,
        cf_project_id: m.cf_project_id,
        cf_file_id: m.cf_file_id,
        content_type: m.content_type || "mod",
        downloadUrl: m.cf_project_id && m.cf_file_id
          ? undefined // Will be built by InstanceService
          : undefined
      }));

    // Prepare disabled mods data (for .jar.disabled handling)
    const disabledModsToSync = mods
      .filter(m => disabledModIds.has(m.id))
      .map(m => ({
        id: m.id,
        filename: m.filename,
        content_type: m.content_type || "mod" as "mod" | "resourcepack" | "shader"
      }));

    // Get locked mods to preserve during clearExisting
    const lockedModIds = new Set(modpack.locked_mod_ids || []);
    const lockedModFilenames = mods
      .filter(m => lockedModIds.has(m.id))
      .map(m => m.filename);

    // Use passed overridesZipPath, or use the calculated overrides path
    // The overrides are always stored at userData/modex/overrides/{modpackId}
    const overridesSource = options?.overridesZipPath || metadataManager.getOverridesPath(modpackId);

    return instanceService.syncModpackToInstance(instanceId, {
      mods: modsToSync,
      disabledMods: disabledModsToSync,
      lockedModFilenames,
      overridesZipPath: overridesSource
    }, {
      clearExisting: options?.clearExisting,
      configSyncMode: options?.configSyncMode,
      onProgress: (stage, current, total, item) => {
        const win = getWindow(); if (win) {
          win.webContents.send("instance:syncProgress", { stage, current, total, item });
        }
      }
    });
  });

  // Sync configs FROM instance TO modpack (for version control)
  ipcMain.handle("instance:syncConfigsToModpack", async (_, instanceId: string, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      return { filesSynced: 0, warnings: ["Modpack not found"] };
    }

    const overridesPath = metadataManager.getOverridesPath(modpackId);
    return instanceService.syncConfigsToModpack(instanceId, overridesPath);
  });

  // ========== LAUNCH AND GAME TRACKING HANDLERS ==========

  ipcMain.handle("instance:launch", async (_, instanceId: string) => {
    // Send loader installation progress to renderer
    const onProgress = (stage: string, current: number, total: number, detail?: string) => {
      const win = getWindow(); if (win) {
        win.webContents.send("loader:installProgress", { stage, current, total, detail });
      }
    };
    return instanceService.launchInstance(instanceId, onProgress);
  });

  // Game tracking: Get running game info
  ipcMain.handle("instance:getRunningGame", async (_, instanceId: string) => {
    const info = instanceService.getRunningGame(instanceId);
    if (!info) return null;
    // Return serializable object (without logWatcher)
    return {
      instanceId: info.instanceId,
      launcherPid: info.launcherPid,
      gamePid: info.gamePid,
      startTime: info.startTime,
      status: info.status,
      loadedMods: info.loadedMods,
      totalMods: info.totalMods,
      currentMod: info.currentMod,
      gameProcessRunning: info.gameProcessRunning || false
    };
  });

  // Game tracking: Kill running game
  ipcMain.handle("instance:killGame", async (_, instanceId: string) => {
    return instanceService.killGame(instanceId);
  });

  // Game tracking: Get all running games (for reload detection)
  ipcMain.handle("instance:getAllRunningGames", async () => {
    const games = instanceService.getAllRunningGames();
    const result: Array<{
      instanceId: string;
      launcherPid?: number;
      gamePid?: number;
      startTime: number;
      status: "launching" | "loading_mods" | "running" | "stopped";
      loadedMods: number;
      totalMods: number;
      currentMod?: string;
      gameProcessRunning: boolean;
    }> = [];

    for (const [_, info] of games) {
      result.push({
        instanceId: info.instanceId,
        launcherPid: info.launcherPid,
        gamePid: info.gamePid,
        startTime: info.startTime,
        status: info.status,
        loadedMods: info.loadedMods,
        totalMods: info.totalMods,
        currentMod: info.currentMod,
        gameProcessRunning: info.gameProcessRunning || false
      });
    }

    return result;
  });

  // Setup game status change callback
  instanceService.setGameStatusCallback((instanceId, info) => {
    const win = getWindow(); if (win) {
      win.webContents.send("game:statusChange", {
        instanceId,
        launcherPid: info.launcherPid,
        gamePid: info.gamePid,
        startTime: info.startTime,
        status: info.status,
        loadedMods: info.loadedMods,
        totalMods: info.totalMods,
        currentMod: info.currentMod,
        gameProcessRunning: info.gameProcessRunning || false
      });
    }
  });

  // Setup game log line callback for real-time console
  instanceService.setGameLogCallback((instanceId, logLine) => {
    const win = getWindow(); if (win) {
      win.webContents.send("game:logLine", {
        instanceId,
        time: logLine.time,
        level: logLine.level,
        message: logLine.message,
        raw: logLine.raw
      });
    }
  });

  // ========== INSTANCE INFO HANDLERS ==========

  ipcMain.handle("instance:openFolder", async (_, instanceId: string, subfolder?: string) => {
    return instanceService.openInstanceFolder(instanceId, subfolder);
  });

  ipcMain.handle("instance:getStats", async (_, instanceId: string) => {
    return instanceService.getInstanceStats(instanceId);
  });

  ipcMain.handle("instance:checkSyncStatus", async (_, instanceId: string, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      return { needsSync: false, missingInInstance: [], extraInInstance: [], disabledMismatch: [], updatesToApply: [], configDifferences: 0, totalDifferences: 0, loaderVersionMismatch: false };
    }

    const mods = await metadataManager.getModsInModpack(modpackId);
    const modData = mods.map(m => ({
      id: m.id,
      filename: m.filename,
      content_type: m.content_type,
      cf_project_id: m.cf_project_id
    }));

    // Get overrides path for config comparison - use camelCase field name
    const overridesPath = modpack.overridesPath;

    const syncStatus = await instanceService.checkSyncStatus(instanceId, modData, modpack.disabled_mod_ids || [], overridesPath);

    // Check loader version mismatch
    const instance = await instanceService.getInstance(instanceId);
    const loaderVersionMismatch = instance
      ? (instance.loader !== modpack.loader || instance.loaderVersion !== modpack.loader_version)
      : false;

    return {
      ...syncStatus,
      loaderVersionMismatch,
      needsSync: syncStatus.needsSync || loaderVersionMismatch,
      totalDifferences: syncStatus.totalDifferences + (loaderVersionMismatch ? 1 : 0)
    };
  });

  // Get modified configs in instance compared to modpack
  ipcMain.handle("instance:getModifiedConfigs", async (_, instanceId: string, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    const overridesPath = modpack?.overridesPath;
    return instanceService.getModifiedConfigs(instanceId, overridesPath);
  });

  // Import configs from instance to modpack
  ipcMain.handle("instance:importConfigs", async (_, instanceId: string, modpackId: string, configPaths: string[]) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      return { success: false, imported: 0, skipped: 0, errors: ["Modpack not found"] };
    }
    if (!modpack.overridesPath) {
      // Create overrides path if it doesn't exist
      const modpackBasePath = path.join(metadataManager.getBasePath(), 'modpacks', modpackId);
      const overridesPath = path.join(modpackBasePath, 'overrides');
      await fs.ensureDir(overridesPath);

      // Update modpack with overrides path
      await metadataManager.updateModpack(modpackId, { overridesPath });

      return instanceService.importConfigsToModpack(instanceId, overridesPath, configPaths);
    }
    return instanceService.importConfigsToModpack(instanceId, modpack.overridesPath, configPaths);
  });

  // ========== EXPORT/DUPLICATE HANDLERS ==========

  ipcMain.handle("instance:export", async (_, instanceId: string) => {
    const win = getWindow(); if (!win) return false;

    const instance = await instanceService.getInstance(instanceId);
    if (!instance) return false;

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${instance.name}.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      title: "Export Instance"
    });

    if (result.canceled || !result.filePath) return false;
    return instanceService.exportInstance(instanceId, result.filePath);
  });

  ipcMain.handle("instance:duplicate", async (_, instanceId: string, newName: string) => {
    return instanceService.duplicateInstance(instanceId, newName);
  });

  // ========== LAUNCHER CONFIG HANDLERS ==========

  ipcMain.handle("instance:getLauncherConfig", async () => {
    return instanceService.getLauncherConfig();
  });

  ipcMain.handle("instance:setLauncherConfig", async (_, config: any) => {
    return instanceService.setLauncherConfig(config);
  });

  // ========== MOD LOADER VERIFICATION HANDLERS ==========

  ipcMain.handle("instance:verifyModLoader", async (_, loader: string, loaderVersion: string, minecraftVersion: string) => {
    return instanceService.verifyModLoaderInstallation(loader, loaderVersion, minecraftVersion);
  });

  ipcMain.handle("instance:repairModLoader", async (_, loader: string, loaderVersion: string, minecraftVersion: string) => {
    return instanceService.repairModLoaderInstallation(
      loader, 
      loaderVersion, 
      minecraftVersion,
      (stage, current, total, detail) => {
        const win = getWindow(); if (win) {
          win.webContents.send("instance:repairProgress", { stage, current, total, detail });
        }
      }
    );
  });

  ipcMain.handle("instance:verifyAndRepair", async (_, instanceId: string, autoRepair: boolean = true) => {
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) {
      return { canLaunch: false, repaired: false, errors: ["Instance not found"] };
    }
    
    return instanceService.verifyBeforeLaunch(
      instance, 
      autoRepair,
      (stage, current, total, detail) => {
        const win = getWindow(); if (win) {
          win.webContents.send("instance:verifyProgress", { stage, current, total, detail });
        }
      }
    );
  });

  // ========== CREATE FROM MODPACK HANDLER ==========

  ipcMain.handle("instance:createFromModpack", async (_, modpackId: string, options?: {
    overridesZipPath?: string;
  }) => {
    // Get modpack info
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) return null;

    // Create instance
    const instance = await instanceService.createInstance({
      name: modpack.name,
      minecraftVersion: modpack.minecraft_version || "1.20.1",
      loader: modpack.loader || "forge",
      loaderVersion: modpack.loader_version,
      modpackId: modpack.id,
      description: modpack.description,
      source: modpack.cf_project_id ? {
        type: "curseforge",
        projectId: modpack.cf_project_id,
        fileId: modpack.cf_file_id,
        name: modpack.name,
        version: modpack.version
      } : undefined
    });

    // Get mods (include ALL mods, disabled ones will be renamed to .disabled)
    const mods = await metadataManager.getModsInModpack(modpackId);
    const disabledModIds = new Set(modpack.disabled_mod_ids || []);

    const modsToSync = mods.map(m => ({
      id: m.id,
      name: m.name,
      filename: m.filename,
      cf_project_id: m.cf_project_id,
      cf_file_id: m.cf_file_id,
      content_type: m.content_type || "mod"
    }));

    const disabledModsToSync = mods
      .filter(m => disabledModIds.has(m.id))
      .map(m => ({
        id: m.id,
        filename: m.filename,
        content_type: m.content_type || "mod" as "mod" | "resourcepack" | "shader"
      }));

    // Sync mods and configs to instance
    const syncResult = await instanceService.syncModpackToInstance(instance.id, {
      mods: modsToSync,
      disabledMods: disabledModsToSync,
      overridesZipPath: options?.overridesZipPath
    }, {
      onProgress: (stage, current, total, item) => {
        const win = getWindow(); if (win) {
          win.webContents.send("instance:syncProgress", { stage, current, total, item });
        }
      }
    });

    // After successful sync, sync configs from instance back to modpack overrides
    // Then initialize version control with the complete initial state
    if (syncResult.success) {
      try {
        // Sync instance configs back to modpack (captures any default configs)
        const overridesPath = metadataManager.getOverridesPath(modpackId);
        await instanceService.syncConfigsToModpack(instance.id, overridesPath);

        // Initialize version control for the modpack (if not already initialized)
        const existingHistory = await metadataManager.getVersionHistory(modpackId);
        if (!existingHistory || existingHistory.versions.length === 0) {
          await metadataManager.initializeVersionControl(modpackId, "Initial version (after instance sync)");
          log.info(`[CreateFromModpack] Version control initialized for modpack ${modpackId}`);
        }
      } catch (vcError) {
        log.error(`[CreateFromModpack] Failed to initialize version control:`, vcError);
        // Don't fail the overall operation, just log the error
      }
    }

    return { instance, syncResult };
  });

  // ========== SMART LAUNCH HANDLER ==========

  // Smart launch with auto-sync
  ipcMain.handle("instance:smartLaunch", async (_, instanceId: string, modpackId: string, options?: {
    forceSync?: boolean;
    skipSync?: boolean;
    configSyncMode?: "overwrite" | "new_only" | "skip";
  }) => {
    const syncSettings = await metadataManager.getInstanceSyncSettings();

    // Get instance and modpack
    const instance = await instanceService.getInstance(instanceId);
    if (!instance) {
      return { success: false, error: "Instance not found", syncPerformed: false };
    }

    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      return { success: false, error: "Modpack not found", syncPerformed: false };
    }

    let syncPerformed = false;
    let syncResult = null;

    // Check if sync is needed (unless skipped)
    if (!options?.skipSync) {
      const mods = await metadataManager.getModsInModpack(modpackId);
      const modData = mods.map(m => ({
        id: m.id,
        filename: m.filename,
        content_type: m.content_type
      }));

      const overridesPath = modpack.overridesPath;
      const syncStatus = await instanceService.checkSyncStatus(
        instanceId,
        modData,
        modpack.disabled_mod_ids || [],
        overridesPath
      );

      // Check loader version mismatch (not checked by instanceService.checkSyncStatus)
      const loaderVersionMismatch =
        instance.loader !== modpack.loader ||
        instance.loaderVersion !== modpack.loader_version;

      const effectiveNeedsSync = syncStatus.needsSync || loaderVersionMismatch;
      const effectiveTotalDifferences = syncStatus.totalDifferences + (loaderVersionMismatch ? 1 : 0);

      // If needs sync and auto-sync is enabled (or forced)
      if (effectiveNeedsSync && (syncSettings.autoSyncBeforeLaunch || options?.forceSync)) {
        // Return sync needed info if confirmation is required and not forced
        if (syncSettings.showSyncConfirmation && !options?.forceSync) {
          return {
            success: false,
            requiresConfirmation: true,
            needsSync: true,
            syncStatus: {
              ...syncStatus,
              loaderVersionMismatch,
              needsSync: effectiveNeedsSync,
              totalDifferences: effectiveTotalDifferences,
              differences: effectiveTotalDifferences,
              lastSynced: instance.lastSynced
            },
            syncPerformed: false
          };
        }

        // Update loader version on instance before sync if needed
        if (loaderVersionMismatch) {
          log.info(`[smartLaunch] Updating instance loader: ${instance.loader}/${instance.loaderVersion} -> ${modpack.loader}/${modpack.loader_version}`);
          await instanceService.updateInstance(instanceId, {
            loader: modpack.loader,
            loaderVersion: modpack.loader_version
          });
        }

        // Perform sync
        try {
          const library = await metadataManager.getAllMods();
          const modsInPack = mods.map(m => ({
            id: m.id,
            name: m.name,
            filename: m.filename,
            downloadUrl: m.cf_project_id && m.cf_file_id
              ? `https://edge.forgecdn.net/files/${Math.floor(m.cf_file_id / 1000)}/${m.cf_file_id % 1000}/${encodeURIComponent(m.filename)}`
              : undefined,
            cf_project_id: m.cf_project_id,
            cf_file_id: m.cf_file_id,
            content_type: m.content_type as "mod" | "resourcepack" | "shader"
          }));

          const disabledMods = (modpack.disabled_mod_ids || [])
            .map(id => library.find(m => m.id === id))
            .filter((m): m is typeof library[0] => !!m)
            .map(m => ({
              id: m.id,
              filename: m.filename,
              content_type: m.content_type as "mod" | "resourcepack" | "shader"
            }));

          syncResult = await instanceService.syncModpackToInstance(instanceId, {
            mods: modsInPack,
            disabledMods,
            overridesZipPath: overridesPath
          }, {
            // Auto-sync ALWAYS uses new_only to never overwrite user configs/resources
            // Manual sync from UI can use other modes if user explicitly chooses
            configSyncMode: "new_only"
          });

          syncPerformed = true;

          if (!syncResult.success) {
            return {
              success: false,
              error: `Sync failed: ${syncResult.errors.join(", ")}`,
              syncPerformed: true,
              syncResult
            };
          }
        } catch (err: any) {
          return {
            success: false,
            error: `Sync error: ${err.message}`,
            syncPerformed: false
          };
        }
      }
    }

    // Launch the instance
    const onProgress = (stage: string, current: number, total: number, detail?: string) => {
      const win = getWindow(); if (win) {
        win.webContents.send("loader:installProgress", { stage, current, total, detail });
      }
    };

    const launchResult = await instanceService.launchInstance(instanceId, onProgress);

    return {
      ...launchResult,
      syncPerformed,
      syncResult
    };
  });
}
