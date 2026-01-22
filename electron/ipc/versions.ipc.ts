/**
 * versions.ipc.ts - Version Control IPC Handlers
 *
 * Handles version history, rollback, and snapshot management for modpacks.
 * Includes complex rollback logic with mod restoration from CurseForge.
 */

import { ipcMain, BrowserWindow } from "electron";
import path from "path";
import fs from "fs-extra";
import type { MetadataManager } from "../services/MetadataManager";
import type { CurseForgeService } from "../services/CurseForgeService";
import type { InstanceService } from "../services/InstanceService";

export interface VersionsIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  instanceService: InstanceService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export function registerVersionsHandlers(deps: VersionsIpcDeps): void {
  const { metadataManager, curseforgeService, instanceService, getWindow, log } = deps;

  // Get version history for a modpack
  ipcMain.handle("versions:getHistory", async (_, modpackId: string) => {
    return metadataManager.getVersionHistory(modpackId);
  });

  // Validate rollback feasibility
  ipcMain.handle(
    "versions:validateRollback",
    async (_, modpackId: string, versionId: string) => {
      return metadataManager.validateRollbackMods(modpackId, versionId);
    }
  );

  // Initialize version control for a modpack
  ipcMain.handle(
    "versions:initialize",
    async (_, modpackId: string, message?: string) => {
      return metadataManager.initializeVersionControl(modpackId, message);
    }
  );

  // Create a new version snapshot
  ipcMain.handle(
    "versions:create",
    async (_, modpackId: string, message: string, tag?: string, syncFromInstanceId?: string) => {
      // If an instance is specified, sync its configs to modpack first
      // This ensures the version snapshot includes instance modifications
      if (syncFromInstanceId) {
        const overridesPath = metadataManager.getOverridesPath(modpackId);
        await instanceService.syncConfigsToModpack(syncFromInstanceId, overridesPath);
      }

      // Check if configs have actually changed compared to last snapshot
      const hasConfigChanges = await metadataManager.hasConfigChanges(modpackId);

      return metadataManager.createVersion(modpackId, message, tag, hasConfigChanges);
    }
  );

  // Rollback to a specific version with mod restoration
  ipcMain.handle(
    "versions:rollback",
    async (_, modpackId: string, versionId: string) => {
      const win = getWindow();
      
      // Get the target version
      const version = await metadataManager.getVersion(modpackId, versionId);
      if (!version) {
        throw new Error("Version not found");
      }

      // Get modpack for context
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) {
        throw new Error("Modpack not found");
      }

      // Build a map of snapshots by mod ID for quick lookup
      const snapshotMap = new Map<string, { 
        id: string; 
        name: string; 
        source: "curseforge" | "modrinth"; 
        cf_project_id?: number; 
        cf_file_id?: number; 
        mr_project_id?: string; 
        mr_version_id?: string; 
        version?: string;
      }>();
      for (const snapshot of version.mod_snapshots || []) {
        snapshotMap.set(snapshot.id, snapshot);
      }

      // Categorize mods: existing in library, need download (missing or different version)
      const existingModIds: string[] = [];
      const modsToDownload: Array<{
        targetModId: string;
        modName: string;
        cfProjectId: number;
        cfFileId: number;
        reason: "missing" | "version_mismatch";
      }> = [];
      const unrestorableMods: Array<{ modId: string; modName: string; reason: string }> = [];

      for (const modId of version.mod_ids) {
        const mod = await metadataManager.getModById(modId);
        const snapshot = snapshotMap.get(modId);

        if (mod) {
          // Mod exists in library with exact ID - check if version matches
          if (snapshot && snapshot.cf_file_id && mod.cf_file_id !== snapshot.cf_file_id) {
            // Same ID but file_id changed - we need to download the correct version
            log.info(`Rollback: Mod ${modId} exists but file_id differs: lib=${mod.cf_file_id} vs snapshot=${snapshot.cf_file_id}`);
            if (snapshot.cf_project_id) {
              modsToDownload.push({
                targetModId: modId,
                modName: snapshot.name || mod.name,
                cfProjectId: snapshot.cf_project_id,
                cfFileId: snapshot.cf_file_id,
                reason: "version_mismatch"
              });
            } else {
              unrestorableMods.push({
                modId,
                modName: snapshot.name || modId,
                reason: "No CurseForge info available"
              });
            }
          } else {
            existingModIds.push(modId);
          }
        } else {
          // Mod not in library - check snapshot for CF info
          if (snapshot?.cf_project_id && snapshot?.cf_file_id) {
            modsToDownload.push({
              targetModId: modId,
              modName: snapshot.name || modId,
              cfProjectId: snapshot.cf_project_id,
              cfFileId: snapshot.cf_file_id,
              reason: "missing"
            });
          } else {
            // Try parsing CF info from mod ID
            const cfIdMatch = modId.match(/^cf-(\d+)-(\d+)$/);
            if (cfIdMatch) {
              const projectId = parseInt(cfIdMatch[1], 10);
              const fileId = parseInt(cfIdMatch[2], 10);
              modsToDownload.push({
                targetModId: modId,
                modName: `CurseForge Mod ${projectId}`,
                cfProjectId: projectId,
                cfFileId: fileId,
                reason: "missing"
              });
            } else {
              unrestorableMods.push({
                modId,
                modName: snapshot?.name || modId,
                reason: "No CurseForge info available"
              });
            }
          }
        }
      }

      // Track results
      const restoredModIds: string[] = [];
      const failedMods: Array<{ modId: string; modName: string; reason: string }> = [];

      // Download missing/different version mods from CurseForge
      if (modsToDownload.length > 0 && win) {
        let downloadedCount = 0;

        for (const toDownload of modsToDownload) {
          try {
            win.webContents.send("rollback:progress", {
              current: ++downloadedCount,
              total: modsToDownload.length,
              modName: toDownload.modName,
            });

            // Get mod info from CF
            const cfMod = await curseforgeService.getMod(toDownload.cfProjectId);
            if (!cfMod) {
              failedMods.push({
                modId: toDownload.targetModId,
                modName: toDownload.modName,
                reason: "Mod not found on CurseForge",
              });
              continue;
            }

            const cfFile = await curseforgeService.getFile(toDownload.cfProjectId, toDownload.cfFileId);
            if (!cfFile) {
              failedMods.push({
                modId: toDownload.targetModId,
                modName: toDownload.modName,
                reason: "File version not found on CurseForge",
              });
              continue;
            }

            // Add to library - this will create an entry with ID cf-{projectId}-{fileId}
            const { getContentTypeFromClassId } = await import("../services/CurseForgeService");
            const contentType = getContentTypeFromClassId(cfMod.classId);
            const formattedMod = curseforgeService.modToLibraryFormat(
              cfMod,
              cfFile,
              modpack.loader || "forge",
              modpack.minecraft_version || "1.20.1",
              contentType
            );

            const addedMod = await metadataManager.addMod(formattedMod);
            restoredModIds.push(addedMod.id);
            log.info(`Rollback: Downloaded mod: ${cfMod.name} (${toDownload.reason})`);
          } catch (err) {
            log.error(`Rollback: Failed to download mod ${toDownload.cfProjectId}:`, err);
            failedMods.push({
              modId: toDownload.targetModId,
              modName: toDownload.modName,
              reason: (err as Error).message,
            });
          }
        }
      }

      // Add unrestorable mods to failedMods
      for (const unrestorable of unrestorableMods) {
        failedMods.push({
          modId: unrestorable.modId,
          modName: unrestorable.modName,
          reason: unrestorable.reason,
        });
      }

      // Combine existing mods with successfully restored mods
      const finalModIds = [...existingModIds, ...restoredModIds];

      // Perform rollback with the final mod list
      const result = await metadataManager.rollbackToVersionWithMods(
        modpackId,
        versionId,
        finalModIds,
        { restoreConfigs: true }
      );

      // Restore loader version from the target version
      if (result && (version.loader || version.loader_version)) {
        const loaderUpdate: { loader?: string; loader_version?: string } = {};
        if (version.loader) loaderUpdate.loader = version.loader;
        if (version.loader_version) loaderUpdate.loader_version = version.loader_version;

        await metadataManager.updateModpack(modpackId, loaderUpdate);
        log.info(`Rollback: Restored loader: ${version.loader} ${version.loader_version}`);

        // Update linked instance loader version
        const linkedInstance = await instanceService.getInstanceByModpack(modpackId);
        if (linkedInstance) {
          await instanceService.updateInstance(linkedInstance.id, {
            loader: version.loader,
            loaderVersion: version.loader_version
          });
          log.info(`Rollback: Updated instance loader: ${version.loader} ${version.loader_version}`);
        }
      }

      // Sync configs to the linked instance if exists
      if (result) {
        const linkedInstance = await instanceService.getInstanceByModpack(modpackId);
        if (linkedInstance) {
          log.info(`Rollback: Syncing configs to instance ${linkedInstance.id}`);
          const overridesPath = metadataManager.getOverridesPath(modpackId);

          const configFolders = ["config", "kubejs", "defaultconfigs", "scripts"];
          for (const folder of configFolders) {
            const srcPath = path.join(overridesPath, folder);
            const destPath = path.join(linkedInstance.path, folder);
            if (await fs.pathExists(srcPath)) {
              await fs.copy(srcPath, destPath, { overwrite: true });
              log.info(`Rollback: Synced ${folder} to instance`);
            }
          }
        }
      }

      return {
        success: result,
        restoredCount: restoredModIds.length,
        failedCount: failedMods.length,
        failedMods: failedMods,
        totalMods: finalModIds.length,
        originalModCount: version.mod_ids.length,
        loaderRestored: !!(version.loader || version.loader_version)
      };
    }
  );

  // Compare two versions
  ipcMain.handle(
    "versions:compare",
    async (
      _,
      modpackId: string,
      fromVersionId: string,
      toVersionId: string
    ) => {
      return metadataManager.compareVersions(
        modpackId,
        fromVersionId,
        toVersionId
      );
    }
  );

  // Get a specific version
  ipcMain.handle(
    "versions:get",
    async (_, modpackId: string, versionId: string) => {
      return metadataManager.getVersion(modpackId, versionId);
    }
  );
}
