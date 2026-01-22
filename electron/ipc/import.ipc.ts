/**
 * Import IPC Handlers
 *
 * Handles modpack import operations:
 * - import:curseforge - Import from local CurseForge ZIP file
 * - import:curseforgeUrl - Import from CurseForge URL (Browse feature)
 * - import:modex - Import from local .modex file
 * - import:modex:manifest - Import from ModEx manifest (remote sync)
 * - import:resolveConflicts - Resolve MODEX import conflicts
 * - import:resolveCFConflicts - Resolve CurseForge import conflicts
 *
 * @module electron/ipc/import
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import type { MetadataManager, Mod, ModexManifest, ModexManifestMod } from "../services/MetadataManager";
import type { CurseForgeService } from "../services/CurseForgeService";
import type { InstanceService } from "../services/InstanceService";
import type { DownloadService } from "../services/DownloadService";
import path from "path";
import os from "os";
import fs from "fs-extra";

// ==================== TYPES ====================

export interface ImportIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  instanceService: InstanceService;
  getDownloadService: () => DownloadService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

// ==================== HANDLER REGISTRATION ====================

export function registerImportHandlers(deps: ImportIpcDeps): void {
  const { metadataManager, curseforgeService, instanceService, getDownloadService, getWindow, log } = deps;

  // ========== import:curseforge - Import from local CurseForge ZIP ==========
  ipcMain.handle("import:curseforge", async () => {
    const win = getWindow();
    if (!win) return null;

    // Check for API key
    if (!curseforgeService.hasApiKey()) {
      return {
        success: false,
        modsImported: 0,
        modsSkipped: 0,
        errors: ["CurseForge API key required. Please add your API key in Settings > General > API Configuration."],
      };
    }

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "CurseForge Modpack", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const zipFilePath = result.filePaths[0];

    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipFilePath);
      const manifestEntry = zip.getEntry("manifest.json");

      if (!manifestEntry) {
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
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["Invalid CurseForge modpack: manifest.json is not valid JSON"],
        };
      }

      // Progress callback that sends events to renderer
      const onProgress = (current: number, total: number, modName: string) => {
        if (win) {
          win.webContents.send("import:progress", { current, total, modName });
        }
      };

      const importResult = await metadataManager.importFromCurseForge(
        manifest,
        curseforgeService,
        onProgress
      );

      // Extract and save overrides (config files, scripts, etc.)
      if (importResult.modpackId) {
        if (win) {
          win.webContents.send("import:progress", {
            current: 95,
            total: 100,
            modName: "Extracting configurations...",
          });
        }

        const overridesResult = await metadataManager.saveOverridesFromZip(
          zipFilePath,
          importResult.modpackId,
          manifest
        );

        if (overridesResult.fileCount > 0) {
          log.info(`CF Import: Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
        }

        // AUTO-FLOW: Create instance -> sync -> version control
        try {
          if (win) {
            win.webContents.send("import:progress", {
              current: 97,
              total: 100,
              modName: "Creating game instance...",
            });
          }

          const modpack = await metadataManager.getModpackById(importResult.modpackId);
          if (modpack) {
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

            if (win) {
              win.webContents.send("import:progress", {
                current: 98,
                total: 100,
                modName: "Syncing mods to instance...",
              });
            }

            // Get mods and sync to instance (include ALL mods, disabled ones will be renamed)
            const mods = await metadataManager.getModsInModpack(importResult.modpackId);
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

            const overridesPath = metadataManager.getOverridesPath(importResult.modpackId);
            await instanceService.syncModpackToInstance(instance.id, {
              mods: modsToSync,
              disabledMods: disabledModsToSync,
              overridesZipPath: overridesPath
            }, {
              onProgress: (stage, current, total, item) => {
                if (win) {
                  win.webContents.send("instance:syncProgress", { stage, current, total, item });
                }
              }
            });

            if (win) {
              win.webContents.send("import:progress", {
                current: 99,
                total: 100,
                modName: "Initializing version control...",
              });
            }

            // Sync configs from instance back to modpack (captures default configs)
            await instanceService.syncConfigsToModpack(instance.id, overridesPath);

            // Initialize version control with complete config state
            const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
            if (!existingHistory || existingHistory.versions.length === 0) {
              await metadataManager.initializeVersionControl(importResult.modpackId, "Initial version (with instance configs)");
              log.info(`CF Import: Version control initialized for modpack ${importResult.modpackId}`);
            }

            log.info(`CF Import: Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
          }
        } catch (autoFlowError) {
          log.error(`CF Import: Auto-flow failed (non-fatal):`, autoFlowError);
          // Still try to initialize version control even if instance creation failed
          try {
            const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
            if (!existingHistory || existingHistory.versions.length === 0) {
              await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from CurseForge");
              log.info(`CF Import: Version control initialized (fallback)`);
            }
          } catch (vcError) {
            log.error(`CF Import: Failed to initialize version control:`, vcError);
          }
        }
      }

      return {
        // Success if we have a modpack ID (even if all mods were reused from library)
        success: !!importResult.modpackId,
        modpackId: importResult.modpackId,
        modsImported: importResult.modsImported,
        modsSkipped: importResult.modsSkipped,
        errors: importResult.errors,
      };
    } catch (error: any) {
      log.info("CF Import error caught:", { code: error.code, message: error.message });
      // Check if this is a version conflict error
      if (error.code === "VERSION_CONFLICTS") {
        log.info(`Handling ${error.conflicts.length} CF import version conflicts`);
        // Store conflict data in metadata manager for later resolution
        metadataManager.storePendingCFConflicts(
          error.partialData.modpackId,
          error.partialData,
          error.manifest
        );

        return {
          success: false,
          requiresResolution: true,
          modpackId: error.partialData.modpackId,
          conflicts: error.conflicts.map((c: any) => {
            // Get modpack's target MC version from manifest
            const targetMcVersion =
              error.manifest?.minecraft?.version || "1.20.1";

            // Get game version from CF file - prefer sortableGameVersions, fallback to gameVersions
            let newGameVersion = "unknown";
            const foundVersions: string[] = [];

            // Priority 1: sortableGameVersions (most reliable)
            if (
              c.cfFile.sortableGameVersions &&
              c.cfFile.sortableGameVersions.length > 0
            ) {
              for (const sgv of c.cfFile.sortableGameVersions) {
                if (
                  sgv.gameVersion &&
                  /^1\.\d+(\.\d+)?$/.test(sgv.gameVersion)
                ) {
                  foundVersions.push(sgv.gameVersion);
                }
              }
            }

            // Priority 2: gameVersions array fallback
            if (foundVersions.length === 0) {
              const cfGameVersions = c.cfFile.gameVersions || [];
              for (const gv of cfGameVersions) {
                if (/^1\.\d+(\.\d+)?$/.test(gv)) {
                  foundVersions.push(gv);
                }
              }
            }

            // Select version - prefer target if available, otherwise first found
            if (foundVersions.includes(targetMcVersion)) {
              newGameVersion = targetMcVersion;
            } else if (foundVersions.length > 0) {
              newGameVersion = foundVersions[0];
            }

            return {
              modName: c.modName,
              existingVersion: c.existingMod.version,
              existingGameVersion: c.existingMod.game_version,
              newVersion: c.cfFile.displayName || c.cfFile.fileName,
              newGameVersion: newGameVersion,
              projectID: c.projectID,
              fileID: c.fileID,
              existingFileId: c.existingMod.cf_file_id,
              existingMod: {
                id: c.existingMod.id,
                name: c.existingMod.name,
                version: c.existingMod.version,
                game_version: c.existingMod.game_version,
              },
            };
          }),
          modsImported: 0,
          modsSkipped: 0,
          errors: [],
        };
      }
      // Log detailed error info for debugging
      log.error("CF Import error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name,
      });

      const errorMessage =
        error.message || error.toString() || "Unknown import error occurred";
      return {
        success: false,
        modsImported: 0,
        modsSkipped: 0,
        errors: [errorMessage],
      };
    }
  });

  // ========== import:curseforgeUrl - Import from CurseForge URL ==========
  ipcMain.handle(
    "import:curseforgeUrl",
    async (
      _,
      downloadUrl: string,
      modpackName: string,
      cfProjectId?: number,
      cfFileId?: number,
      cfSlug?: string
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => {
      const win = getWindow();
      if (!win) {
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["Window not available"],
        };
      }

      // Check for API key
      if (!curseforgeService.hasApiKey()) {
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["CurseForge API key required. Please add your API key in Settings > General > API Configuration."],
        };
      }

      try {
        // Check if this exact CF project+file already exists
        if (cfProjectId && cfFileId) {
          const allModpacks = await metadataManager.getAllModpacks();
          const existingModpack = allModpacks.find(
            (mp: any) => mp.cf_project_id === cfProjectId && mp.cf_file_id === cfFileId
          );

          if (existingModpack) {
            return {
              success: false,
              modpackId: existingModpack.id,
              modsImported: 0,
              modsSkipped: 0,
              errors: [`This exact version of "${existingModpack.name}" is already imported`],
            };
          }
        }

        // Create temp directory for download
        const tempDir = path.join(os.tmpdir(), "modex-cf-import");
        await fs.ensureDir(tempDir);
        const tempFile = path.join(tempDir, `${Date.now()}_${modpackName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`);

        // Download the file using optimized DownloadService
        win.webContents.send("import:progress", {
          current: 0,
          total: 100,
          modName: "Downloading modpack...",
        });

        const downloadService = getDownloadService();
        const downloadResult = await downloadService.downloadFile(downloadUrl, tempFile, {
          retries: 3,
          onProgress: (progress) => {
            if (win) {
              win.webContents.send("import:progress", {
                current: Math.round(progress.percentage * 0.1), // 0-10%
                total: 100,
                modName: `Downloading modpack... ${Math.round(progress.percentage)}%`,
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

        // Extract and import
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

        // Progress callback
        const onProgress = (current: number, total: number, modName: string) => {
          if (win) {
            win.webContents.send("import:progress", { current, total, modName });
          }
        };

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
          // Handle VERSION_CONFLICTS - the modpack was still created successfully
          if (importError.code === "VERSION_CONFLICTS" && importError.partialData?.modpackId) {
            log.info("CF Import: Version conflicts detected but modpack created successfully");
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

        // Save CurseForge source info to the modpack for update checking
        // Also update the name to include version if this is a second version of same project
        if (importResult.modpackId && cfProjectId && cfFileId) {
          const allModpacks = await metadataManager.getAllModpacks();
          const sameProjectModpacks = allModpacks.filter(
            (mp: any) => mp.cf_project_id === cfProjectId && mp.id !== importResult.modpackId
          );

          const updateData: any = {
            cf_project_id: cfProjectId,
            cf_file_id: cfFileId,
            cf_slug: cfSlug,
          };

          // If there are other versions of this modpack, append version to name
          if (sameProjectModpacks.length > 0) {
            const currentModpack = await metadataManager.getModpackById(importResult.modpackId);
            if (currentModpack) {
              updateData.name = `${manifest.name || modpackName} (${manifest.version || 'v' + cfFileId})`;
            }
          }

          await metadataManager.updateModpack(importResult.modpackId, updateData);
        }

        // Extract and save overrides (config files, scripts, etc.) BEFORE cleaning up temp file
        if (importResult.modpackId) {
          win.webContents.send("import:progress", {
            current: 95,
            total: 100,
            modName: "Extracting configurations...",
          });

          const overridesResult = await metadataManager.saveOverridesFromZip(
            tempFile,
            importResult.modpackId,
            manifest
          );

          if (overridesResult.fileCount > 0) {
            log.info(`CF Import: Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
          }

          // AUTO-FLOW: Create instance -> sync -> version control
          try {
            win.webContents.send("import:progress", {
              current: 97,
              total: 100,
              modName: "Creating game instance...",
            });

            const modpack = await metadataManager.getModpackById(importResult.modpackId);
            if (modpack) {
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

              win.webContents.send("import:progress", {
                current: 98,
                total: 100,
                modName: "Syncing mods to instance...",
              });

              // Get mods and sync to instance (include ALL mods, disabled ones will be renamed)
              const mods = await metadataManager.getModsInModpack(importResult.modpackId);
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

              const overridesPath = metadataManager.getOverridesPath(importResult.modpackId);
              await instanceService.syncModpackToInstance(instance.id, {
                mods: modsToSync,
                disabledMods: disabledModsToSync,
                overridesZipPath: overridesPath
              }, {
                onProgress: (stage, current, total, item) => {
                  if (win) {
                    win.webContents.send("instance:syncProgress", { stage, current, total, item });
                  }
                }
              });

              win.webContents.send("import:progress", {
                current: 99,
                total: 100,
                modName: "Initializing version control...",
              });

              // Sync configs from instance back to modpack
              await instanceService.syncConfigsToModpack(instance.id, overridesPath);

              // Initialize version control with complete config state
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial version (with instance configs)");
                log.info(`CF URL Import: Version control initialized for modpack ${importResult.modpackId}`);
              }

              log.info(`CF URL Import: Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
            }
          } catch (autoFlowError) {
            log.error(`CF URL Import: Auto-flow failed (non-fatal):`, autoFlowError);
            // Still try to initialize version control even if instance creation failed
            try {
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from CurseForge URL");
                log.info(`CF URL Import: Version control initialized (fallback)`);
              }
            } catch (vcError) {
              log.error(`CF URL Import: Failed to initialize version control:`, vcError);
            }
          }
        }

        // Clean up temp file
        await fs.remove(tempFile);

        return {
          success: !!importResult.modpackId,
          modpackId: importResult.modpackId,
          modsImported: importResult.modsImported,
          modsSkipped: importResult.modsSkipped,
          errors: importResult.errors,
        };
      } catch (error: any) {
        log.error("CF URL Import error:", error);
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: [error.message || "Unknown import error"],
        };
      }
    }
  );

  // ========== import:modex - Import from local .modex file ==========
  ipcMain.handle("import:modex", async () => {
    const win = getWindow();
    if (!win) return null;

    // Check for API key (required for fetching mod metadata)
    if (!curseforgeService.hasApiKey()) {
      return {
        success: false,
        modsImported: 0,
        modsSkipped: 0,
        errors: ["CurseForge API key required. Please add your API key in Settings > General > API Configuration."],
        requiresResolution: false,
      };
    }

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const zipFilePath = result.filePaths[0];

    try {
      // Check if file exists and is readable
      const fileStats = await fs.stat(zipFilePath);
      if (fileStats.size === 0) {
        throw new Error("Invalid .modex file: File is empty");
      }

      // Note: Disk space check skipped - will fail gracefully during extraction if space runs out

      const AdmZip = (await import("adm-zip")).default;
      let zip;
      try {
        zip = new AdmZip(zipFilePath);
      } catch (zipError: any) {
        throw new Error(
          `Corrupted or invalid .modex file: ${zipError.message || "Unable to read ZIP archive"}. ` +
          `The file may be damaged or not a valid ZIP format.`
        );
      }

      const manifestEntry = zip.getEntry("modex.json");

      if (!manifestEntry) {
        throw new Error(
          "Invalid .modex file: Missing modex.json manifest. " +
          "Make sure this file was exported from MODEX."
        );
      }

      let manifest;
      try {
        manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
      } catch (parseError) {
        throw new Error(
          "Invalid .modex file: The manifest is corrupted or not valid JSON"
        );
      }

      // Progress callback that sends events to renderer
      const onProgress = (current: number, total: number, modName: string) => {
        if (win) {
          win.webContents.send("import:progress", { current, total, modName });
        }
      };

      const importResult = await metadataManager.importFromModex(
        manifest,
        curseforgeService,
        onProgress
      );

      // Extract and save overrides if the .modex contains them
      if (importResult.modpackId) {
        // .modex files may have an "overrides" folder like CurseForge packs
        const overridesResult = await metadataManager.saveOverridesFromZip(
          zipFilePath,
          importResult.modpackId,
          { overrides: "overrides" } // Standard overrides folder name
        );

        if (overridesResult.fileCount > 0) {
          log.info(`MODEX Import: Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
        }

        // AUTO-FLOW: Create instance -> sync -> version control (only for new imports, not updates)
        if (!importResult.isUpdate) {
          try {
            if (win) {
              win.webContents.send("import:progress", {
                current: 97,
                total: 100,
                modName: "Creating game instance...",
              });
            }

            const modpack = await metadataManager.getModpackById(importResult.modpackId);
            if (modpack) {
              // Create instance
              const instance = await instanceService.createInstance({
                name: modpack.name,
                minecraftVersion: modpack.minecraft_version || "1.20.1",
                loader: modpack.loader || "forge",
                loaderVersion: modpack.loader_version,
                modpackId: modpack.id,
                description: modpack.description,
              });

              if (win) {
                win.webContents.send("import:progress", {
                  current: 98,
                  total: 100,
                  modName: "Syncing mods to instance...",
                });
              }

              // Get mods and sync to instance (include ALL mods, disabled ones will be renamed)
              const mods = await metadataManager.getModsInModpack(importResult.modpackId);
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

              const overridesPath = metadataManager.getOverridesPath(importResult.modpackId);
              await instanceService.syncModpackToInstance(instance.id, {
                mods: modsToSync,
                disabledMods: disabledModsToSync,
                overridesZipPath: overridesPath
              }, {
                onProgress: (stage, current, total, item) => {
                  if (win) {
                    win.webContents.send("instance:syncProgress", { stage, current, total, item });
                  }
                }
              });

              if (win) {
                win.webContents.send("import:progress", {
                  current: 99,
                  total: 100,
                  modName: "Initializing version control...",
                });
              }

              // Sync configs from instance back to modpack
              await instanceService.syncConfigsToModpack(instance.id, overridesPath);

              // Initialize version control with complete config state
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial version (with instance configs)");
                log.info(`MODEX Import: Version control initialized for modpack ${importResult.modpackId}`);
              }

              log.info(`MODEX Import: Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
            }
          } catch (autoFlowError) {
            log.error(`MODEX Import: Auto-flow failed (non-fatal):`, autoFlowError);
            // Still try to initialize version control even if instance creation failed
            try {
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from .modex file");
                log.info(`MODEX Import: Version control initialized (fallback)`);
              }
            } catch (vcError) {
              log.error(`MODEX Import: Failed to initialize version control:`, vcError);
            }
          }
        }
      }

      return importResult;
    } catch (error: any) {
      log.info("Import error:", error.message);
      throw new Error(error.message);
    }
  });

  // ========== import:modex:manifest - Import from ModEx manifest (remote sync) ==========
  ipcMain.handle(
    "import:modex:manifest",
    async (_, manifest: ModexManifest, modpackId?: string) => {
      const win = getWindow();
      if (!win) return null;

      // Check for API key (required for fetching mod metadata)
      if (!curseforgeService.hasApiKey()) {
        throw new Error("CurseForge API key required. Please add your API key in Settings > General > API Configuration.");
      }

      try {
        // Progress callback that sends events to renderer
        const onProgress = (
          current: number,
          total: number,
          modName: string
        ) => {
          if (win) {
            win.webContents.send("import:progress", {
              current,
              total,
              modName,
            });
          }
        };

        const importResult = await metadataManager.importFromModex(
          manifest,
          curseforgeService,
          onProgress,
          modpackId
        );

        if (importResult.success && importResult.modpackId) {
          try {
            // Get history AFTER import (the existingHistory was captured BEFORE import happened)
            const historyAfterImport = await metadataManager.getVersionHistory(importResult.modpackId);
            const versionCountAfterImport = historyAfterImport?.versions.length || 0;

            if (!importResult.isUpdate) {
              // New import: initialize version control if empty
              if (versionCountAfterImport === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from remote manifest");
                log.info(`MODEX Manifest Import: Version control initialized for modpack ${importResult.modpackId}`);
              }
            } else {
              // Update: check if version history was imported from manifest
              // We need to check if the manifest HAD version history that was imported
              // If the manifest included version_history, those versions are now in the local history
              const manifestHadVersionHistory = !!(manifest.version_history &&
                (Array.isArray(manifest.version_history) ? manifest.version_history.length > 0 :
                  manifest.version_history.versions?.length > 0));

              // Always create a version after update to mark current state as "synced"
              // This ensures no "unsaved changes" appear after downloading an update
              const changesSummary = importResult.changes
                ? `Added: ${importResult.changes.added}, Removed: ${importResult.changes.removed}, Updated: ${importResult.changes.updated}`
                : "Remote update applied";

              const versionMessage = manifestHadVersionHistory
                ? `Synced with remote: ${changesSummary}`
                : `Remote update: ${changesSummary}`;

              await metadataManager.createVersion(
                importResult.modpackId,
                versionMessage,
                undefined,
                true, // hasConfigChanges (manifest may include config updates)
                true // forceCreate - always create to mark current state
              );
              log.info(`MODEX Manifest Update: Created sync version for modpack ${importResult.modpackId}`);
            }
          } catch (vcError) {
            log.error(`MODEX Manifest Import: Failed to handle version control:`, vcError);
          }
        }

        return importResult;
      } catch (error: any) {
        log.info("Import manifest error:", error.message);
        throw new Error(error.message);
      }
    }
  );

  // ========== import:resolveConflicts - Resolve MODEX import conflicts ==========
  ipcMain.handle(
    "import:resolveConflicts",
    async (
      _,
      data: {
        modpackId: string;
        conflicts: Array<{
          modEntry: ModexManifestMod;
          existingMod: Mod;
          resolution: "use_existing" | "use_new";
        }>;
        partialData: {
          newModIds: string[];
          addedModNames: string[];
          oldModIds?: string[];
        };
        manifest: ModexManifest;
      }
    ) => {
      try {
        return await metadataManager.resolveImportConflicts(
          data.modpackId,
          data.conflicts,
          data.partialData,
          data.manifest,
          curseforgeService
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(message);
      }
    }
  );

  // ========== import:resolveCFConflicts - Resolve CurseForge import conflicts ==========
  ipcMain.handle(
    "import:resolveCFConflicts",
    async (
      _,
      data: {
        modpackId: string;
        conflicts: Array<{
          projectID: number;
          fileID: number;
          existingModId: string;
          resolution: "use_existing" | "use_new";
        }>;
      }
    ) => {
      try {
        return await metadataManager.resolveCFImportConflicts(
          data.modpackId,
          data.conflicts,
          curseforgeService
        );
      } catch (error: any) {
        throw new Error(error.message);
      }
    }
  );
}
