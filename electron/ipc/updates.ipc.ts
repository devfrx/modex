/**
 * Updates IPC Handlers
 *
 * Handles application and mod update operations:
 * - updates:checkAppUpdate - Check for app updates via GitHub API
 * - updates:downloadUpdate - Download app update
 * - updates:installUpdate - Install downloaded app update
 * - updates:setApiKey - Set CurseForge API key
 * - updates:getApiKey - Get CurseForge API key
 * - updates:checkAll - Check updates for all mods in library
 * - updates:checkMod - Check update for a single mod
 * - updates:checkModpack - Check updates for all mods in a modpack
 * - updates:applyUpdate - Apply a mod update (download new version)
 *
 * Also handles auto-updater event listeners for electron-updater.
 *
 * @module electron/ipc/updates
 */

import { ipcMain, app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { MetadataManager } from "../services/MetadataManager";
import type { CurseForgeService } from "../services/CurseForgeService";
import type { InstanceService } from "../services/InstanceService";
import type { DownloadService } from "../services/DownloadService";
import path from "path";
import fs from "fs-extra";

// ==================== TYPES ====================

export interface UpdatesIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  instanceService: InstanceService;
  getDownloadService: () => DownloadService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
  VITE_DEV_SERVER_URL?: string;
}

// ==================== HANDLER REGISTRATION ====================

export function registerUpdatesHandlers(deps: UpdatesIpcDeps): void {
  const { metadataManager, curseforgeService, instanceService, getDownloadService, getWindow, log, VITE_DEV_SERVER_URL } = deps;

  // ========== AUTO-UPDATER SETUP ==========

  // Configure auto-updater
  autoUpdater.autoDownload = false; // Don't auto-download, let user decide
  autoUpdater.autoInstallOnAppQuit = true;

  // Send update events to renderer
  autoUpdater.on("checking-for-update", () => {
    log.info("AutoUpdater: Checking for updates...");
    getWindow()?.webContents.send("update:checking");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("AutoUpdater: Update available:", info.version);
    getWindow()?.webContents.send("update:available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("AutoUpdater: No update available, current:", info.version);
    getWindow()?.webContents.send("update:not-available", {
      version: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(`AutoUpdater: Download progress: ${progress.percent.toFixed(1)}%`);
    getWindow()?.webContents.send("update:download-progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("AutoUpdater: Update downloaded:", info.version);
    getWindow()?.webContents.send("update:downloaded", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("error", (error) => {
    log.error("AutoUpdater: Error:", error);
    // Don't send error to renderer during download attempts - it's handled in the IPC handler
    // Only send if it's an unexpected error (not during an active download/check operation)
  });

  // ========== HELPER FUNCTIONS ==========

  /**
   * Check if instant sync should proceed for an instance
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
   * Update a mod file in the instance (remove old, download new)
   */
  async function updateModInInstance(
    modpackId: string,
    oldMod: { filename: string; content_type?: string },
    newMod: { id: string; name: string; filename: string; cf_project_id?: number; cf_file_id?: number; content_type?: string },
    isDisabled: boolean
  ): Promise<{ success: boolean; error?: string; skipped?: boolean; reason?: string }> {
    try {
      const { canSync, instance, reason } = await canInstantSync(modpackId);
      if (!canSync) {
        return { success: true, skipped: true, reason };
      }

      // Determine folder based on content_type
      let folder: string;
      switch (oldMod.content_type || newMod.content_type) {
        case "resourcepack":
          folder = path.join(instance.path, "resourcepacks");
          break;
        case "shader":
          folder = path.join(instance.path, "shaderpacks");
          break;
        default:
          folder = path.join(instance.path, "mods");
      }

      // Remove old file (both enabled and disabled versions)
      const oldEnabledPath = path.join(folder, oldMod.filename);
      const oldDisabledPath = oldEnabledPath + ".disabled";

      if (await fs.pathExists(oldEnabledPath)) {
        await fs.remove(oldEnabledPath);
        log.info(`DirectSync: Removed old version: ${oldMod.filename}`);
      }
      if (await fs.pathExists(oldDisabledPath)) {
        await fs.remove(oldDisabledPath);
        log.info(`DirectSync: Removed old disabled version: ${oldMod.filename}.disabled`);
      }

      // Build download URL for new file
      let downloadUrl: string | undefined;
      if (newMod.cf_project_id && newMod.cf_file_id) {
        const fileIdStr = newMod.cf_file_id.toString();
        const part1 = fileIdStr.substring(0, 4);
        const part2 = fileIdStr.substring(4);
        downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(newMod.filename)}`;
      }

      if (!downloadUrl) {
        log.info(`DirectSync: No download URL for ${newMod.name} (local mod or missing CF IDs)`);
        return { success: true, skipped: true, reason: "no_download_url" };
      }

      // Download new file with timeout
      log.info(`DirectSync: Downloading new version: ${newMod.filename}...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      try {
        const response = await fetch(downloadUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Write as enabled or disabled based on the mod's state
        const newPath = path.join(folder, newMod.filename);
        const destPath = isDisabled ? newPath + ".disabled" : newPath;

        await fs.writeFile(destPath, buffer);
        log.info(`DirectSync: Downloaded ${newMod.filename} (${buffer.length} bytes)${isDisabled ? ' [disabled]' : ''}`);

        return { success: true };
      } catch (fetchErr) {
        clearTimeout(timeout);
        throw fetchErr;
      }
    } catch (err: any) {
      log.error(`DirectSync: Failed to update mod in instance:`, err);
      return { success: false, error: err.message };
    }
  }

  // ========== IPC HANDLERS ==========

  // Check for app updates - always use GitHub API for reliability
  ipcMain.handle("updates:checkAppUpdate", async () => {
    try {
      const currentVersion = app.getVersion();
      const isProduction = !VITE_DEV_SERVER_URL;

      // Always use GitHub API for checking (more reliable than electron-updater's parser)
      const response = await fetch(
        "https://api.github.com/repos/devfrx/modex/releases",
        {
          headers: {
            "User-Agent": "ModEx-App",
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            hasUpdate: false,
            currentVersion,
            latestVersion: currentVersion,
            noReleases: true,
            canAutoUpdate: isProduction,
          };
        }
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const releases = await response.json();

      if (!Array.isArray(releases) || releases.length === 0) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          noReleases: true,
          canAutoUpdate: isProduction,
        };
      }

      // Find the first non-draft release
      const release = releases.find((r: any) => !r.draft) || releases[0];

      if (!release) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          noReleases: true,
          canAutoUpdate: isProduction,
        };
      }

      const latestVersion = release.tag_name?.replace(/^v/, "") || "";

      const isNewer = latestVersion.localeCompare(currentVersion, undefined, {
        numeric: true,
        sensitivity: "base",
      }) > 0;

      return {
        hasUpdate: isNewer,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url,
        releaseName: release.name || `v${latestVersion}`,
        releaseNotes: release.body || "",
        publishedAt: release.published_at,
        isPrerelease: release.prerelease || false,
        canAutoUpdate: isProduction, // Can only auto-update in production builds
      };
    } catch (error: any) {
      log.error("Updates: Failed to check for app updates:", error);
      return {
        hasUpdate: false,
        currentVersion: app.getVersion(),
        error: error.message || "Failed to check for updates",
        canAutoUpdate: !VITE_DEV_SERVER_URL,
      };
    }
  });

  // Download the update using electron-updater or fallback to manual download
  ipcMain.handle("updates:downloadUpdate", async (_, releaseInfo?: { version: string; releaseUrl?: string }) => {
    try {
      if (VITE_DEV_SERVER_URL) {
        return { success: false, error: "Auto-update not available in development mode" };
      }

      log.info("Updates: Starting update download...");

      // Try electron-updater first
      try {
        // Need to check for updates first to populate the update info
        const checkResult = await autoUpdater.checkForUpdates();
        if (checkResult && checkResult.updateInfo) {
          log.info("Updates: electron-updater found update, downloading...");
          await autoUpdater.downloadUpdate();
          return { success: true, method: "auto" };
        }
      } catch (autoUpdateError: any) {
        log.info("Updates: electron-updater failed, trying manual download:", autoUpdateError.message);
      }

      // Fallback: Download manually using GitHub API and our DownloadService
      log.info("Updates: Falling back to manual download...");

      // Get releases from GitHub (use /releases to include pre-releases)
      const response = await fetch(
        "https://api.github.com/repos/devfrx/modex/releases",
        {
          headers: {
            "User-Agent": "ModEx-App",
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const releases = await response.json();

      // Find the first non-draft release
      const release = Array.isArray(releases)
        ? releases.find((r: any) => !r.draft) || releases[0]
        : null;

      if (!release) {
        return { success: false, error: "No releases found on GitHub." };
      }

      // Find the Windows setup exe
      const windowsAsset = release.assets?.find((asset: any) =>
        asset.name.endsWith('.exe') &&
        (asset.name.includes('Setup') || asset.name.includes('setup'))
      );

      if (!windowsAsset) {
        return { success: false, error: "No Windows installer found in the release." };
      }

      // Download to temp folder
      const os = await import("os");
      const tempDir = path.join(os.tmpdir(), "modex-updates");
      await fs.ensureDir(tempDir);
      const downloadPath = path.join(tempDir, windowsAsset.name);

      // Use DownloadService
      const downloadService = getDownloadService();
      const downloadResult = await downloadService.downloadFile(
        windowsAsset.browser_download_url,
        downloadPath,
        {
          retries: 3,
          onProgress: (progress) => {
            getWindow()?.webContents.send("update:download-progress", {
              percent: progress.percentage,
              bytesPerSecond: progress.speed || 0,
              transferred: progress.downloadedBytes,
              total: progress.totalBytes,
            });
          },
        }
      );

      if (!downloadResult.success) {
        throw new Error(downloadResult.error || "Download failed");
      }

      log.info("Updates: Manual download complete:", downloadPath);

      // Store the path for installation
      (global as any).__pendingUpdatePath = downloadPath;

      // Notify renderer
      getWindow()?.webContents.send("update:downloaded", {
        version: release.tag_name?.replace(/^v/, "") || "unknown",
        releaseNotes: release.body || "",
        manualInstall: true,
      });

      return { success: true, method: "manual", installerPath: downloadPath };
    } catch (error: any) {
      log.error("Updates: Failed to download update:", error);
      return { success: false, error: error.message || "Failed to download update" };
    }
  });

  // Install the update and restart the app
  ipcMain.handle("updates:installUpdate", async () => {
    try {
      log.info("Updates: Installing update...");

      // Check if we have a manually downloaded installer
      const manualInstallerPath = (global as any).__pendingUpdatePath;

      if (manualInstallerPath && await fs.pathExists(manualInstallerPath)) {
        log.info("Updates: Running manual installer:", manualInstallerPath);

        // Run the installer and quit the app
        const { spawn } = await import("child_process");
        const proc = spawn(manualInstallerPath, [], {
          detached: true,
          stdio: "ignore",
        });
        
        // Handle spawn errors (e.g., file deleted, permission denied)
        proc.on('error', (err) => {
          log.error('Updates: Failed to run installer:', err);
        });
        
        proc.unref();

        // Quit the app after a short delay
        setTimeout(() => {
          app.quit();
        }, 1000);

        return { success: true };
      }

      // Use electron-updater's install
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    } catch (error: any) {
      log.error("Updates: Failed to install update:", error);
      return { success: false, error: error.message || "Failed to install update" };
    }
  });

  ipcMain.handle(
    "updates:setApiKey",
    async (_, apiKey: string) => {
      log.info(`Setting CurseForge API key`);
      await metadataManager.setApiKey(apiKey);
      await curseforgeService.setApiKey(apiKey);
      return { success: true };
    }
  );

  ipcMain.handle(
    "updates:getApiKey",
    async () => {
      return metadataManager.getApiKey();
    }
  );

  ipcMain.handle("updates:checkAll", async (event) => {
    const mods = await metadataManager.getAllMods();
    const cfMods = mods.filter(
      (m) => m.source === "curseforge" && m.cf_project_id
    );

    const results: Array<{
      modId: string;
      projectId: string | null;
      projectName: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      source: string;
      updateUrl: string | null;
      newFileId?: number;
    }> = [];

    // Process in parallel batches for better performance
    const BATCH_SIZE = 10;
    let completed = 0;

    for (let i = 0; i < cfMods.length; i += BATCH_SIZE) {
      const batch = cfMods.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (mod) => {
          try {
            const latestFile = await curseforgeService.getBestFile(
              mod.cf_project_id!,
              mod.game_version,
              mod.loader,
              mod.content_type
            );

            return {
              modId: mod.id,
              projectId: mod.cf_project_id?.toString() || null,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: latestFile?.displayName || null,
              hasUpdate: latestFile ? latestFile.id !== mod.cf_file_id : false,
              source: "curseforge",
              updateUrl: mod.cf_project_id ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug || mod.cf_project_id}` : null,
              newFileId:
                latestFile && latestFile.id !== mod.cf_file_id
                  ? latestFile.id
                  : undefined,
            };
          } catch (error) {
            return {
              modId: mod.id,
              projectId: mod.cf_project_id?.toString() || null,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: null,
              hasUpdate: false,
              source: "curseforge",
              updateUrl: mod.cf_project_id ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug || mod.cf_project_id}` : null,
            };
          }
        })
      );

      results.push(...batchResults);
      completed += batch.length;

      // Send progress update after each batch
      event.sender.send("updates:progress", {
        current: completed,
        total: cfMods.length,
        modName: batch[batch.length - 1]?.name || "",
      });
    }

    return results;
  });

  ipcMain.handle(
    "updates:checkMod",
    async (
      _,
      modId: number,
      gameVersion: string,
      loader: string,
      contentType: "mod" | "resourcepack" | "shader" = "mod"
    ) => {
      try {
        const latestFile = await curseforgeService.getBestFile(
          modId,
          gameVersion,
          loader,
          contentType
        );
        return latestFile; // Return full file object or null
      } catch (err) {
        log.error(`Failed to check mod update for ${modId}:`, err);
        return null;
      }
    }
  );

  ipcMain.handle("updates:checkModpack", async (event, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const mods = await metadataManager.getModsInModpack(modpackId);
    const mcVersion = modpack.minecraft_version || "1.20.1";
    const loader = modpack.loader || "forge";

    const cfMods = mods.filter(
      (m) => m.source === "curseforge" && m.cf_project_id
    );

    const results: Array<{
      modId: string;
      projectId: string | null;
      projectName: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      source: string;
      updateUrl: string | null;
      newFileId?: number;
    }> = [];

    // Process in parallel batches for better performance
    const BATCH_SIZE = 10;
    let completed = 0;

    for (let i = 0; i < cfMods.length; i += BATCH_SIZE) {
      const batch = cfMods.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (mod) => {
          try {
            const latestFile = await curseforgeService.getBestFile(
              mod.cf_project_id!,
              mcVersion,
              loader,
              mod.content_type
            );

            return {
              modId: mod.id,
              projectId: mod.cf_project_id?.toString() || null,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: latestFile?.displayName || null,
              hasUpdate: latestFile ? latestFile.id !== mod.cf_file_id : false,
              source: "curseforge",
              updateUrl: mod.cf_project_id ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug || mod.cf_project_id}` : null,
              newFileId:
                latestFile && latestFile.id !== mod.cf_file_id
                  ? latestFile.id
                  : undefined,
            };
          } catch (error) {
            return {
              modId: mod.id,
              projectId: mod.cf_project_id?.toString() || null,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: null,
              hasUpdate: false,
              source: "curseforge",
              updateUrl: mod.cf_project_id ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug || mod.cf_project_id}` : null,
            };
          }
        })
      );

      results.push(...batchResults);
      completed += batch.length;

      // Send progress update after each batch
      event.sender.send("updates:progress", {
        current: completed,
        total: cfMods.length,
        modName: batch[batch.length - 1]?.name || "",
      });
    }

    return results;
  });

  // Apply update = create a new mod entry with the new file and replace in modpacks
  // This maintains proper version history since each mod version has a unique ID
  ipcMain.handle(
    "updates:applyUpdate",
    async (_, modId: string, newFileId: number, modpackId?: string) => {
      // Guard: prevent updating mods in linked modpacks
      if (modpackId) {
        const modpack = await metadataManager.getModpackById(modpackId);
        if (modpack?.remote_source?.url) {
          throw new Error("Cannot update mod: This modpack is linked to a remote source. Unlink it first to make changes.");
        }
      }

      const oldMod = await metadataManager.getModById(modId);
      if (!oldMod) return { success: false, error: "Mod not found" };

      if (!oldMod.cf_project_id) {
        return { success: false, error: "Not a CurseForge mod" };
      }

      // Check if new version already exists in library
      const existingNewMod = await metadataManager.findModByCFIds(
        oldMod.cf_project_id,
        newFileId
      );

      try {
        let newMod: Awaited<ReturnType<typeof metadataManager.getModById>>;

        if (existingNewMod) {
          // New version already exists in library, just use it
          newMod = existingNewMod;
          log.info(`[Update] New version already exists: ${newMod.id}`);
        } else {
          // Download new version info and add to library
          const cfFile = await curseforgeService.getFile(
            oldMod.cf_project_id,
            newFileId
          );
          if (!cfFile)
            return { success: false, error: "File not found on CurseForge" };

          const cfMod = await curseforgeService.getMod(oldMod.cf_project_id);
          if (!cfMod)
            return { success: false, error: "Mod not found on CurseForge" };

          // Detect content type from classId or preserve existing
          const { getContentTypeFromClassId } = await import(
            "../services/CurseForgeService"
          );
          const contentType = getContentTypeFromClassId(cfMod.classId) || oldMod.content_type;

          // Create new mod entry with same properties but new file
          const modData = curseforgeService.modToLibraryFormat(
            cfMod,
            cfFile,
            oldMod.loader,
            oldMod.game_version,
            contentType
          );

          // Add as NEW mod (will get ID: cf-{projectId}-{newFileId})
          newMod = await metadataManager.addMod(modData);
          log.info(`[Update] Created new mod version: ${newMod.id}`);
        }

        if (!newMod) {
          return { success: false, error: "Failed to create new mod version" };
        }

        // Replace old mod ID with new mod ID in the specified modpack or all modpacks
        // Track which modpacks were updated for instant sync
        const updatedModpacks: Array<{ id: string; isDisabled: boolean }> = [];

        if (modpackId) {
          // Update only the specified modpack
          const modpack = await metadataManager.getModpackById(modpackId);
          const isDisabled = modpack?.disabled_mod_ids?.includes(modId) || false;

          await metadataManager.replaceModInModpack(modpackId, modId, newMod.id);
          log.info(`[Update] Replaced ${modId} with ${newMod.id} in modpack ${modpackId}`);

          updatedModpacks.push({ id: modpackId, isDisabled });
        } else {
          // Update all modpacks that contain this mod (skip linked ones)
          const modpacks = await metadataManager.getAllModpacks();
          for (const mp of modpacks) {
            if (mp.mod_ids.includes(modId)) {
              // Skip linked modpacks when updating globally
              if (mp.remote_source?.url) {
                log.info(`[Update] Skipping linked modpack ${mp.id}`);
                continue;
              }
              const isDisabled = mp.disabled_mod_ids?.includes(modId) || false;
              await metadataManager.replaceModInModpack(mp.id, modId, newMod.id);
              log.info(`[Update] Replaced ${modId} with ${newMod.id} in modpack ${mp.id}`);

              updatedModpacks.push({ id: mp.id, isDisabled });
            }
          }
        }

        // Instant sync: update files in all affected instances
        const settings = await metadataManager.getInstanceSyncSettings();
        if (settings.instantSync !== false) {
          for (const { id: mpId, isDisabled } of updatedModpacks) {
            const syncResult = await updateModInInstance(
              mpId,
              { filename: oldMod.filename, content_type: oldMod.content_type },
              {
                id: newMod.id,
                name: newMod.name,
                filename: newMod.filename,
                cf_project_id: newMod.cf_project_id,
                cf_file_id: newMod.cf_file_id,
                content_type: newMod.content_type
              },
              isDisabled
            );
            if (syncResult.success && !syncResult.skipped) {
              log.info(`[Update] Instant synced update to instance for modpack ${mpId}`);
            } else if (syncResult.error) {
              log.warn(`[Update] Instant sync failed for modpack ${mpId}: ${syncResult.error}`);
            }
          }
        }

        return { success: true, newModId: newMod.id, oldModId: modId };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );
}
