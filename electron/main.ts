/**
 * Electron Main Process - Metadata-Only Architecture
 *
 * Uses MetadataManager for pure JSON storage.
 * No file downloads, no JAR scanning.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  shell,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs-extra";
import MetadataManager, { Mod, Modpack } from "./services/MetadataManager.js";
import { CurseForgeService, getContentTypeFromClassId } from "./services/CurseForgeService.js";
import {
  ModAnalyzerService,
  AnalysisResult,
  DependencyInfo,
} from "./services/ModAnalyzerService.js";
import { getDownloadService } from "./services/DownloadService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let metadataManager: MetadataManager;
let curseforgeService: CurseForgeService;
let modAnalyzerService: ModAnalyzerService;

// Register custom protocol for local file access (thumbnails cache)
protocol.registerSchemesAsPrivileged([
  {
    scheme: "atom",
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
  },
]);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

async function initializeBackend() {
  metadataManager = new MetadataManager();
  curseforgeService = new CurseForgeService(metadataManager.getBasePath());
  modAnalyzerService = new ModAnalyzerService(curseforgeService);

  // Register atom:// protocol for cached images
  protocol.handle("atom", (request) => {
    const filePath = decodeURIComponent(request.url.replace("atom:///", ""));
    const normalizedPath = path.normalize(filePath);

    if (normalizedPath.includes("..") || !path.isAbsolute(normalizedPath)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!fs.existsSync(normalizedPath)) {
      return new Response("Not Found", { status: 404 });
    }

    return net.fetch("file:///" + normalizedPath);
  });

  // ========== MODS IPC HANDLERS ==========

  ipcMain.handle("mods:getAll", async () => {
    return metadataManager.getAllMods();
  });

  ipcMain.handle("mods:getById", async (_, id: string) => {
    return metadataManager.getModById(id);
  });

  ipcMain.handle(
    "mods:add",
    async (_, modData: Omit<Mod, "id" | "created_at">) => {
      return metadataManager.addMod(modData);
    }
  );

  ipcMain.handle(
    "mods:update",
    async (_, id: string, updates: Partial<Mod>) => {
      return metadataManager.updateMod(id, updates);
    }
  );

  ipcMain.handle("mods:delete", async (_, id: string) => {
    return metadataManager.deleteMod(id);
  });

  ipcMain.handle("mods:bulkDelete", async (_, ids: string[]) => {
    return metadataManager.deleteMods(ids);
  });

  // Check which modpacks use the specified mod(s)
  ipcMain.handle("mods:checkUsage", async (_, modIds: string[]) => {
    const allModpacks = await metadataManager.getAllModpacks();
    const usage: Array<{
      modId: string;
      modName: string;
      modpacks: Array<{ id: string; name: string }>;
    }> = [];

    for (const modId of modIds) {
      const mod = await metadataManager.getModById(modId);
      if (!mod) continue;

      const usedInModpacks = allModpacks.filter((mp) =>
        mp.mod_ids.includes(modId)
      );
      if (usedInModpacks.length > 0) {
        usage.push({
          modId,
          modName: mod.name,
          modpacks: usedInModpacks.map((mp) => ({ id: mp.id, name: mp.name })),
        });
      }
    }

    // Return a plain JSON object to avoid cloning issues
    return JSON.parse(JSON.stringify(usage));
  });

  // Delete mods and optionally remove from modpacks
  ipcMain.handle(
    "mods:deleteWithModpackCleanup",
    async (_, modIds: string[], removeFromModpacks: boolean) => {
      if (removeFromModpacks) {
        const allModpacks = await metadataManager.getAllModpacks();
        for (const modId of modIds) {
          for (const modpack of allModpacks) {
            if (modpack.mod_ids.includes(modId)) {
              await metadataManager.removeModFromModpack(modpack.id, modId);
            }
          }
        }
      }
      return metadataManager.deleteMods(modIds);
    }
  );

  // ========== CURSEFORGE IPC HANDLERS ==========

  ipcMain.handle("curseforge:hasApiKey", async () => {
    return curseforgeService.hasApiKey();
  });

  ipcMain.handle("curseforge:search", async (_, options) => {
    const result = await curseforgeService.searchMods(options);
    return { mods: result.mods, pagination: result.pagination };
  });

  ipcMain.handle("curseforge:getMod", async (_, modId: number) => {
    return curseforgeService.getMod(modId);
  });

  ipcMain.handle(
    "curseforge:getModFiles",
    async (_, modId: number, options?: any) => {
      return curseforgeService.getModFiles(modId, options);
    }
  );

  ipcMain.handle(
    "curseforge:getChangelog",
    async (_, modId: number, fileId: number) => {
      return curseforgeService.getFileChangelog(modId, fileId);
    }
  );

  ipcMain.handle(
    "curseforge:getCategories",
    async (_, contentType?: string) => {
      return curseforgeService.getCategories(contentType as any);
    }
  );

  ipcMain.handle(
    "curseforge:getPopular",
    async (_, gameVersion?: string, modLoader?: string) => {
      return curseforgeService.getPopularMods(gameVersion, modLoader);
    }
  );

  ipcMain.handle(
    "curseforge:getRecommendations",
    async (
      _,
      installedCategoryIds: number[],
      gameVersion?: string,
      modLoader?: string,
      excludeModIds?: number[],
      limit?: number,
      randomize?: boolean,
      contentType: "mod" | "resourcepack" | "shader" = "mod"
    ) => {
      return curseforgeService.getRecommendations(
        installedCategoryIds,
        gameVersion,
        modLoader,
        excludeModIds || [],
        limit,
        randomize,
        contentType
      );
    }
  );

  // Add mod from CurseForge to library (metadata only)
  ipcMain.handle(
    "curseforge:addToLibrary",
    async (
      _,
      projectId: number,
      fileId: number,
      preferredLoader?: string,
      contentType?: string
    ) => {
      try {
        // Check if mod already exists in library
        const existingMod = await metadataManager.findModByCFIds(
          projectId,
          fileId
        );
        if (existingMod) {
          console.log(
            `[IPC] Mod cf-${projectId}-${fileId} already exists in library, reusing. (Existing ID: ${existingMod.id})`
          );
          return existingMod;
        }

        const cfMod = await curseforgeService.getMod(projectId);
        if (!cfMod) return null;

        const cfFile = await curseforgeService.getFile(projectId, fileId);
        if (!cfFile) return null;

        // Pass preferredLoader and contentType to get correct detection
        const modData = curseforgeService.modToLibraryFormat(
          cfMod,
          cfFile,
          preferredLoader,
          undefined,
          contentType as any
        );

        const mod = await metadataManager.addMod({
          name: modData.name,
          slug: modData.slug,
          version: modData.version,
          game_version: modData.game_version,
          game_versions: modData.game_versions,
          loader: modData.loader,
          content_type: modData.content_type,
          description: modData.description,
          author: modData.author,
          thumbnail_url: modData.thumbnail_url || undefined,
          logo_url: modData.logo_url || undefined,
          download_count: modData.download_count,
          release_type: modData.release_type,
          date_released: modData.date_released,
          filename: modData.filename,
          source: "curseforge",
          cf_project_id: projectId,
          cf_file_id: fileId,
          dependencies: modData.dependencies,
          categories: modData.categories,
          file_size: modData.file_size,
          date_created: modData.date_created,
          date_modified: modData.date_modified,
          website_url: modData.website_url,
        });

        return mod;
      } catch (error) {
        console.error("Error adding mod from CurseForge:", error);
        return null;
      }
    }
  );

  // ========== MODPACKS IPC HANDLERS ==========

  ipcMain.handle("modpacks:getAll", async () => {
    return metadataManager.getAllModpacks();
  });

  ipcMain.handle("modpacks:getById", async (_, id: string) => {
    return metadataManager.getModpackById(id);
  });

  ipcMain.handle("modpacks:create", async (_, data: any) => {
    return metadataManager.createModpack(data);
  });

  // Backward compatibility
  ipcMain.handle("modpacks:add", async (_, data: any) => {
    return metadataManager.createModpack(data);
  });

  ipcMain.handle(
    "modpacks:update",
    async (_, id: string, updates: Partial<Modpack>) => {
      return metadataManager.updateModpack(id, updates);
    }
  );

  ipcMain.handle("modpacks:delete", async (_, id: string) => {
    return metadataManager.deleteModpack(id);
  });

  ipcMain.handle("modpacks:getMods", async (_, modpackId: string) => {
    return metadataManager.getModsInModpack(modpackId);
  });

  ipcMain.handle("modpacks:getModsMultiple", async (_, modpackIds: string[]) => {
    const result = await metadataManager.getModsInMultipleModpacks(modpackIds);
    // Convert Map to plain object for IPC serialization
    const obj: Record<string, Mod[]> = {};
    for (const [key, value] of result) {
      obj[key] = value;
    }
    return obj;
  });

  ipcMain.handle(
    "modpacks:addMod",
    async (_, modpackId: string, modId: string) => {
      return metadataManager.addModToModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:addModsBatch",
    async (_, modpackId: string, modIds: string[]) => {
      return metadataManager.addModsToModpackBatch(modpackId, modIds);
    }
  );

  ipcMain.handle(
    "modpacks:removeMod",
    async (_, modpackId: string, modId: string) => {
      return metadataManager.removeModFromModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:toggleMod",
    async (_, modpackId: string, modId: string) => {
      return metadataManager.toggleModInModpack(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:setModEnabled",
    async (_, modpackId: string, modId: string, enabled: boolean) => {
      return metadataManager.setModEnabledInModpack(modpackId, modId, enabled);
    }
  );

  ipcMain.handle("modpacks:getDisabledMods", async (_, modpackId: string) => {
    return metadataManager.getDisabledMods(modpackId);
  });

  ipcMain.handle(
    "modpacks:clone",
    async (_, modpackId: string, newName: string) => {
      return metadataManager.cloneModpack(modpackId, newName);
    }
  );

  ipcMain.handle(
    "modpacks:setImage",
    async (_, modpackId: string, imageUrl: string) => {
      return metadataManager.updateModpack(modpackId, { image_url: imageUrl });
    }
  );

  // Open modpack folder in file explorer
  ipcMain.handle("modpacks:openFolder", async (_, modpackId: string) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) return false;

      // Open the modpacks directory (since we store as JSON, open the base modpacks folder)
      const modpacksDir = path.join(metadataManager.getBasePath(), "modpacks");
      await shell.openPath(modpacksDir);
      return true;
    } catch (err) {
      console.error("Failed to open folder:", err);
      return false;
    }
  });

  // ========== MODPACK PROFILES ==========

  ipcMain.handle(
    "modpacks:createProfile",
    async (_, modpackId: string, name: string) => {
      return metadataManager.createProfile(modpackId, name);
    }
  );

  ipcMain.handle(
    "modpacks:deleteProfile",
    async (_, modpackId: string, profileId: string) => {
      return metadataManager.deleteProfile(modpackId, profileId);
    }
  );

  ipcMain.handle(
    "modpacks:applyProfile",
    async (_, modpackId: string, profileId: string) => {
      return metadataManager.applyProfile(modpackId, profileId);
    }
  );

  // Check for CurseForge modpack updates
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
        // Get all files for this modpack (don't filter by version/loader to find all updates)
        const files = await curseforgeService.getModFiles(modpack.cf_project_id);

        if (!files || files.length === 0) {
          return { hasUpdate: false };
        }

        // Sort by file ID descending (newest first)
        const sortedFiles = [...files].sort((a: any, b: any) => b.id - a.id);

        // Find the current file and latest release
        const currentFile = sortedFiles.find((f: any) => f.id === modpack.cf_file_id);
        // Find latest release (type 1) or just the newest file
        const latestRelease = sortedFiles.find((f: any) => f.releaseType === 1) || sortedFiles[0];

        if (!latestRelease || latestRelease.id === modpack.cf_file_id) {
          return {
            hasUpdate: false,
            currentVersion: currentFile?.displayName || modpack.version,
          };
        }

        // Check if latest is newer (higher file ID = newer)
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
        console.error("[IPC] Error checking modpack update:", error);
        return { hasUpdate: false };
      }
    }
  );

  // Update CurseForge modpack to a new version
  ipcMain.handle(
    "modpacks:updateCFModpack",
    async (
      _,
      modpackId: string,
      newFileId: number,
      createNew: boolean // If true, create new modpack; if false, replace current
    ): Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    }> => {
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

        // Get the new file info
        const cfFile = await curseforgeService.getFile(modpack.cf_project_id, newFileId);
        if (!cfFile) {
          return {
            success: false,
            modsImported: 0,
            modsSkipped: 0,
            errors: ["Could not find the update file on CurseForge"],
          };
        }

        // Get download URL
        const downloadUrl = cfFile.downloadUrl || 
          `https://edge.forgecdn.net/files/${Math.floor(newFileId / 1000)}/${newFileId % 1000}/${cfFile.fileName}`;

        // Download the modpack using optimized DownloadService
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
                current: Math.round(progress.percentage * 0.1), // 0-10%
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

        // Extract manifest
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(tempFile);
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

        const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));

        // Progress callback
        const onProgress = (current: number, total: number, modName: string) => {
          if (win) {
            win.webContents.send("import:progress", { current, total, modName });
          }
        };

        if (createNew) {
          // Create new modpack with updated name
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
              console.log("[CF Update] Version conflicts detected but modpack created successfully");
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

          // Update the new modpack with CF source info
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
          // Replace current modpack - remove all mods first
          const currentMods = [...(modpack.mod_ids || [])];
          for (const modId of currentMods) {
            await metadataManager.removeModFromModpack(modpackId, modId);
          }

          // Clear disabled mods and incompatible mods
          await metadataManager.updateModpack(modpackId, {
            disabled_mod_ids: [],
            incompatible_mods: [],
          });

          // Import the new mods using a custom version that adds to existing modpack
          const errors: string[] = [];
          const newModIds: string[] = [];
          const disabledModIds: string[] = [];
          const incompatibleMods: Array<{ cf_project_id: number; name: string; reason: string }> = [];
          
          // Get loader and MC version from manifest
          let loader = "unknown";
          const primaryLoader = manifest.minecraft?.modLoaders?.find((l: any) => l.primary);
          if (primaryLoader) {
            const match = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
            if (match) loader = match[1].toLowerCase();
          }
          const mcVersion = manifest.minecraft?.version || modpack.minecraft_version;

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

              // Check if mod already exists in library
              const allMods = await metadataManager.getAllMods();
              let existingMod = allMods.find(
                (m: any) => m.source === "curseforge" && m.cf_project_id === projectID && m.cf_file_id === fileID
              ) || null;

              if (existingMod) {
                newModIds.push(existingMod.id);
                if (!isRequired) disabledModIds.push(existingMod.id);
                continue;
              }

              // Add new mod
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
              });

              newModIds.push(mod.id);
              if (!isRequired) disabledModIds.push(mod.id);
            } catch (error: any) {
              errors.push(`Error processing ${projectID}: ${error.message}`);
            }
          }

          // Add all mods to modpack
          for (const modId of newModIds) {
            await metadataManager.addModToModpack(modpackId, modId);
          }

          // Update modpack metadata
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
        console.error("[IPC] Error updating CF modpack:", error);
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: [error.message || "Unknown error"],
        };
      }
    }
  );

  // Get CurseForge modpack changelog
  ipcMain.handle(
    "modpacks:getCFChangelog",
    async (_, cfProjectId: number, cfFileId: number): Promise<string> => {
      try {
        return await curseforgeService.getFileChangelog(cfProjectId, cfFileId);
      } catch (error) {
        console.error("[IPC] Error getting modpack changelog:", error);
        return "";
      }
    }
  );

  // Re-search CurseForge for compatible versions of incompatible mods
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
        // Progress callback
        const onProgress = (current: number, total: number, modName: string) => {
          if (win) {
            win.webContents.send("import:progress", { current, total, modName });
          }
        };
        
        return await metadataManager.reSearchIncompatibleMods(
          modpackId,
          curseforgeService,
          onProgress
        );
      } catch (error: any) {
        console.error("[IPC] Error re-searching incompatible mods:", error);
        throw error;
      }
    }
  );

  // ========== VERSION CONTROL IPC HANDLERS ==========

  ipcMain.handle("versions:getHistory", async (_, modpackId: string) => {
    return metadataManager.getVersionHistory(modpackId);
  });

  ipcMain.handle(
    "versions:initialize",
    async (_, modpackId: string, message?: string) => {
      return metadataManager.initializeVersionControl(modpackId, message);
    }
  );

  ipcMain.handle(
    "versions:create",
    async (_, modpackId: string, message: string, tag?: string) => {
      return metadataManager.createVersion(modpackId, message, tag);
    }
  );

  ipcMain.handle(
    "versions:rollback",
    async (_, modpackId: string, versionId: string) => {
      // Get the target version to check for missing mods
      const version = await metadataManager.getVersion(modpackId, versionId);
      if (!version) {
        throw new Error("Version not found");
      }

      // Check if all mods in the version still exist in library
      const missingMods: Array<{
        modId: string;
        modName: string;
        cfProjectId?: number;
        cfFileId?: number;
      }> = [];
      const existingModIds: string[] = [];
      const unrestorableMods: Array<{ modId: string; reason: string }> = [];

      for (const modId of version.mod_ids) {
        const mod = await metadataManager.getModById(modId);
        if (mod) {
          existingModIds.push(modId);
        } else {
          // Mod is missing - check if we have CF info in the version snapshot
          const snapshot = version.mod_snapshots?.find(
            (s: any) => s.id === modId
          );
          if (snapshot?.cf_project_id && snapshot?.cf_file_id) {
            missingMods.push({
              modId,
              modName: snapshot.name || `Mod ${snapshot.cf_project_id}`,
              cfProjectId: snapshot.cf_project_id,
              cfFileId: snapshot.cf_file_id,
            });
          } else {
            // Fallback: try to parse CF info from mod ID (format: cf-{projectId}-{fileId})
            const cfIdMatch = modId.match(/^cf-(\d+)-(\d+)$/);
            if (cfIdMatch) {
              const projectId = parseInt(cfIdMatch[1], 10);
              const fileId = parseInt(cfIdMatch[2], 10);
              console.log(
                `[Rollback] Parsed CF info from mod ID: ${modId} -> project ${projectId}, file ${fileId}`
              );
              missingMods.push({
                modId,
                modName: `CurseForge Mod ${projectId}`,
                cfProjectId: projectId,
                cfFileId: fileId,
              });
            } else {
              // Mod is missing and has no CF info - cannot restore
              console.warn(
                `[Rollback] Mod ${modId} is missing and cannot be restored (no CF info)`
              );
              unrestorableMods.push({ modId, reason: "Not a CurseForge mod" });
            }
          }
        }
      }

      // Track successfully restored mods
      const restoredModIds: string[] = [];
      const failedMods: Array<{
        modId: string;
        modName: string;
        reason: string;
      }> = [];

      // Download missing mods from CurseForge
      if (missingMods.length > 0 && win) {
        let downloadedCount = 0;

        for (const missing of missingMods) {
          if (!missing.cfProjectId || !missing.cfFileId) {
            failedMods.push({
              modId: missing.modId,
              modName: missing.modName,
              reason: "No CurseForge info",
            });
            continue;
          }

          try {
            win.webContents.send("rollback:progress", {
              current: ++downloadedCount,
              total: missingMods.length,
              modName: missing.modName,
            });

            // Get mod info from CF
            const cfMod = await curseforgeService.getMod(missing.cfProjectId);
            if (!cfMod) {
              failedMods.push({
                modId: missing.modId,
                modName: missing.modName,
                reason: "Mod not found on CurseForge",
              });
              continue;
            }

            const cfFile = await curseforgeService.getFile(
              missing.cfProjectId,
              missing.cfFileId
            );
            if (!cfFile) {
              failedMods.push({
                modId: missing.modId,
                modName: missing.modName,
                reason: "File version not found on CurseForge",
              });
              continue;
            }

            // Add to library
            const modpack = await metadataManager.getModpackById(modpackId);
            // Detect content type from classId
            const { getContentTypeFromClassId } = await import(
              "./services/CurseForgeService"
            );
            const contentType = getContentTypeFromClassId(cfMod.classId);
            const formattedMod = curseforgeService.modToLibraryFormat(
              cfMod,
              cfFile,
              modpack?.loader || "forge",
              modpack?.minecraft_version || "1.20.1",
              contentType
            );

            // addMod will generate the same ID based on cf_project_id and cf_file_id
            const addedMod = await metadataManager.addMod(formattedMod);
            restoredModIds.push(addedMod.id);

            console.log(`[Rollback] Downloaded missing mod: ${cfMod.name}`);
          } catch (err) {
            console.error(
              `[Rollback] Failed to download mod ${missing.cfProjectId}:`,
              err
            );
            failedMods.push({
              modId: missing.modId,
              modName: missing.modName,
              reason: (err as Error).message,
            });
          }
        }
      }

      // Combine existing mods with successfully restored mods
      const finalModIds = [...existingModIds, ...restoredModIds];

      // Add unrestorable mods to failedMods
      for (const unrestorable of unrestorableMods) {
        failedMods.push({
          modId: unrestorable.modId,
          modName: unrestorable.modId,
          reason: unrestorable.reason,
        });
      }

      // Perform rollback with only the mods that exist
      const result = await metadataManager.rollbackToVersionWithMods(
        modpackId,
        versionId,
        finalModIds
      );

      // Return detailed result
      return {
        success: result,
        restoredCount: restoredModIds.length,
        failedCount: failedMods.length,
        failedMods: failedMods,
        totalMods: finalModIds.length,
        originalModCount: version.mod_ids.length,
      };
    }
  );

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

  ipcMain.handle(
    "versions:get",
    async (_, modpackId: string, versionId: string) => {
      return metadataManager.getVersion(modpackId, versionId);
    }
  );

  // ========== REMOTE UPDATES IPC HANDLERS ==========

  ipcMain.handle("remote:exportManifest", async (_, modpackId: string) => {
    return metadataManager.exportRemoteManifest(modpackId);
  });

  ipcMain.handle("remote:checkUpdate", async (_, modpackId: string) => {
    return metadataManager.checkForRemoteUpdate(modpackId);
  });

  // ========== EXPORT IPC HANDLERS ==========

  ipcMain.handle("export:curseforge", async (_, modpackId: string) => {
    if (!win) return null;

    try {
      const { manifest, modpack, modlist } =
        await metadataManager.exportToCurseForge(modpackId, curseforgeService);

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.zip`,
        filters: [{ name: "ZIP Files", extensions: ["zip"] }],
      });

      if (result.canceled || !result.filePath) return null;

      // Create ZIP with manifest.json and modlist.html
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile(
        "manifest.json",
        Buffer.from(JSON.stringify(manifest, null, 2))
      );
      zip.addFile("modlist.html", Buffer.from(modlist));
      zip.writeZip(result.filePath);

      return { success: true, path: result.filePath };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("export:modex", async (_, modpackId: string) => {
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.modex`,
        filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest, code } = await metadataManager.exportToModex(modpackId);

      // Create ZIP with modex.json
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile("modex.json", Buffer.from(JSON.stringify(manifest, null, 2)));
      zip.writeZip(result.filePath);

      return { success: true, code, path: result.filePath };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("export:manifest", async (_, modpackId: string) => {
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.json`,
        filters: [{ name: "JSON Manifest", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest } = await metadataManager.exportToModex(modpackId);

      await fs.writeJson(result.filePath, manifest, { spaces: 2 });

      return { success: true, path: result.filePath };
    } catch (error: any) {
      console.error("Export manifest error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle(
    "export:selectPath",
    async (_, defaultName: string, extension: string) => {
      if (!win) return null;
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${defaultName}.${extension}`,
        filters: [
          { name: `${extension.toUpperCase()} Files`, extensions: [extension] },
        ],
      });
      return result.canceled ? null : result.filePath;
    }
  );

  // ========== IMPORT IPC HANDLERS ==========

  ipcMain.handle("import:curseforge", async () => {
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "CurseForge Modpack", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(result.filePaths[0]);
      const manifestEntry = zip.getEntry("manifest.json");

      if (!manifestEntry) {
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["Invalid CurseForge modpack: manifest.json not found"],
        };
      }

      const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));

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

      return {
        // Success if we have a modpack ID (even if all mods were reused from library)
        success: !!importResult.modpackId,
        modpackId: importResult.modpackId,
        modsImported: importResult.modsImported,
        modsSkipped: importResult.modsSkipped,
        errors: importResult.errors,
      };
    } catch (error: any) {
      console.log("[IPC] CF Import error caught:", error.code, error.message);
      // Check if this is a version conflict error
      if (error.code === "VERSION_CONFLICTS") {
        console.log(
          `[IPC] Handling ${error.conflicts.length} CF import version conflicts`
        );
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
      console.error("[IPC] CF Import error details:", {
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

  // Import CurseForge modpack from URL (for CF Browse feature)
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
      if (!win) {
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: ["Window not available"],
        };
      }

      try {
        const fs = await import("fs-extra");
        const path = await import("path");
        const os = await import("os");

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
        const zip = new AdmZip(tempFile);
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

        const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));

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
            console.log("[CF Import] Version conflicts detected but modpack created successfully");
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
        console.error("[IPC] CF URL Import error:", error);
        return {
          success: false,
          modsImported: 0,
          modsSkipped: 0,
          errors: [error.message || "Unknown import error"],
        };
      }
    }
  );

  ipcMain.handle("import:modex", async () => {
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(result.filePaths[0]);
      const manifestEntry = zip.getEntry("modex.json");

      if (!manifestEntry) {
        throw new Error("Invalid .modex file: missing manifest");
      }

      const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));

      // Progress callback that sends events to renderer
      const onProgress = (current: number, total: number, modName: string) => {
        if (win) {
          win.webContents.send("import:progress", { current, total, modName });
        }
      };

      return metadataManager.importFromModex(
        manifest,
        curseforgeService,
        onProgress
      );
    } catch (error: any) {
      console.log("[IPC] Import error:", error.message);
      throw new Error(error.message);
    }
  });

  ipcMain.handle(
    "import:modex:manifest",
    async (_, manifest: any, modpackId?: string) => {
      if (!win) return null;

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

        return metadataManager.importFromModex(
          manifest,
          curseforgeService,
          onProgress,
          modpackId
        );
      } catch (error: any) {
        console.log("[IPC] Import manifest error:", error.message);
        throw new Error(error.message);
      }
    }
  );

  // Handler for resolving MODEX import conflicts
  ipcMain.handle(
    "import:resolveConflicts",
    async (
      _,
      data: {
        modpackId: string;
        conflicts: Array<{
          modEntry: any;
          existingMod: any;
          resolution: "use_existing" | "use_new";
        }>;
        partialData: any;
        manifest: any;
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
      } catch (error: any) {
        throw new Error(error.message);
      }
    }
  );

  // Handler for resolving CurseForge import conflicts
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

  // ========== UPDATES IPC HANDLERS ==========

  ipcMain.handle(
    "updates:setApiKey",
    async (_, source: "curseforge" | "modrinth", apiKey: string) => {
      console.log(`[IPC] Setting API key for ${source}`);
      await metadataManager.setApiKey(source, apiKey);
      if (source === "curseforge") {
        await curseforgeService.setApiKey(apiKey);
      }
      return { success: true };
    }
  );

  ipcMain.handle(
    "updates:getApiKey",
    async (_, source: "curseforge" | "modrinth") => {
      return metadataManager.getApiKey(source);
    }
  );

  ipcMain.handle("updates:checkAll", async (event) => {
    const mods = await metadataManager.getAllMods();
    const cfMods = mods.filter(
      (m) => m.source === "curseforge" && m.cf_project_id
    );
    
    const results: Array<{
      modId: string;
      projectName: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      source: string;
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
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: latestFile?.displayName || null,
              hasUpdate: latestFile ? latestFile.id !== mod.cf_file_id : false,
              source: "curseforge",
              newFileId:
                latestFile && latestFile.id !== mod.cf_file_id
                  ? latestFile.id
                  : undefined,
            };
          } catch (error) {
            return {
              modId: mod.id,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: null,
              hasUpdate: false,
              source: "curseforge",
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
        console.error(`[IPC] Failed to check mod update for ${modId}:`, err);
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
      projectName: string;
      currentVersion: string;
      latestVersion: string | null;
      hasUpdate: boolean;
      source: string;
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
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: latestFile?.displayName || null,
              hasUpdate: latestFile ? latestFile.id !== mod.cf_file_id : false,
              source: "curseforge",
              newFileId:
                latestFile && latestFile.id !== mod.cf_file_id
                  ? latestFile.id
                  : undefined,
            };
          } catch (error) {
            return {
              modId: mod.id,
              projectName: mod.name,
              currentVersion: mod.version,
              latestVersion: null,
              hasUpdate: false,
              source: "curseforge",
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

  // Apply update = update the file ID in metadata
  ipcMain.handle(
    "updates:applyUpdate",
    async (_, modId: string, newFileId: number) => {
      const mod = await metadataManager.getModById(modId);
      if (!mod) return { success: false, error: "Mod not found" };

      if (!mod.cf_project_id) {
        return { success: false, error: "Not a CurseForge mod" };
      }

      try {
        const cfFile = await curseforgeService.getFile(
          mod.cf_project_id,
          newFileId
        );
        if (!cfFile)
          return { success: false, error: "File not found on CurseForge" };

        const cfMod = await curseforgeService.getMod(mod.cf_project_id);
        if (!cfMod)
          return { success: false, error: "Mod not found on CurseForge" };

        // Detect content type from classId or preserve existing
        const { getContentTypeFromClassId } = await import(
          "./services/CurseForgeService"
        );
        const contentType = getContentTypeFromClassId(cfMod.classId);

        // Preserve the original loader preference when converting
        const modData = curseforgeService.modToLibraryFormat(
          cfMod,
          cfFile,
          mod.loader,
          mod.game_version,
          contentType
        );

        // Update mod in library with all new metadata
        await metadataManager.updateMod(modId, {
          cf_file_id: newFileId,
          version: modData.version,
          filename: modData.filename,
          date_released: modData.date_released,
          release_type: modData.release_type,
          game_version: modData.game_version,
          loader: modData.loader,
          description: modData.description,
          thumbnail_url: modData.thumbnail_url || undefined,
        });

        // Note: The mod is updated in the library, and since modpacks reference
        // mods by ID, all modpacks automatically see the updated version
        // No need to update modpack files individually

        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // ========== MOD ANALYZER IPC HANDLERS ==========

  ipcMain.handle("analyzer:analyzeModpack", async (_, modpackId: string) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) {
        throw new Error("Modpack not found");
      }

      const modIds = modpack.mod_ids || [];
      const mods = await Promise.all(
        modIds.map(async (modId) => {
          const mod = await metadataManager.getModById(modId);
          return mod;
        })
      );

      const validMods = mods
        .filter(
          (m): m is NonNullable<typeof m> => m !== null && m !== undefined
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          curseforge_id: m.cf_project_id,
          loader: m.loader,
          game_version: m.game_version,
          version: m.version,
        }));

      const result = await modAnalyzerService.analyzeModpack(validMods);

      // Transform to frontend format
      return {
        missingDependencies: result.dependencies.missing.map((dep) => ({
          modId: dep.modId,
          modName: dep.modName,
          requiredBy: dep.requiredBy,
          slug: dep.modSlug,
        })),
        conflicts: result.conflicts.map((c) => ({
          mod1: { id: c.mod1.id, name: c.mod1.name },
          mod2: { id: c.mod2.id, name: c.mod2.name },
          reason: c.description,
        })),
        performanceStats: {
          totalMods: result.modCount,
          clientOnly: 0,
          optimizationMods: result.performance.filter(
            (p) => p.type === "add_mod"
          ).length,
          resourceHeavy: result.performance.filter(
            (p) => p.severity === "critical"
          ).length,
          graphicsIntensive: 0,
          worldGenMods: 0,
        },
        recommendations: result.performance.map((p) => p.description),
      };
    } catch (error: any) {
      console.error("[Main] Analyzer error:", error);
      throw error;
    }
  });

  ipcMain.handle("analyzer:analyzeLibrary", async () => {
    try {
      const allMods = await metadataManager.getAllMods();
      const mods = allMods.map((m) => ({
        id: m.id,
        name: m.name,
        curseforge_id: m.cf_project_id,
        loader: m.loader,
        game_version: m.game_version,
        version: m.version,
      }));

      return await modAnalyzerService.analyzeModpack(mods);
    } catch (error: any) {
      console.error("[Main] Analyzer error:", error);
      throw error;
    }
  });

  ipcMain.handle(
    "analyzer:checkDependencies",
    async (_, curseforgeId: number, loader: string, gameVersion: string) => {
      try {
        return await modAnalyzerService.checkModDependencies(
          curseforgeId,
          loader,
          gameVersion
        );
      } catch (error: any) {
        console.error("[Main] Dependency check error:", error);
        return [];
      }
    }
  );

  ipcMain.handle(
    "analyzer:installDependency",
    async (_, depInfo: DependencyInfo, modpackId?: string) => {
      try {
        if (!depInfo.suggestedFile) {
          throw new Error("No suggested file for this dependency");
        }

        // Fetch the mod details from CurseForge
        const cfMods = await curseforgeService.getModsByIds([depInfo.modId]);
        if (cfMods.length === 0) {
          throw new Error("Mod not found on CurseForge");
        }

        const cfMod = cfMods[0];
        const cfFile = await curseforgeService.getFile(
          depInfo.modId,
          depInfo.suggestedFile.fileId
        );

        if (!cfFile) {
          throw new Error("File not found on CurseForge");
        }

        // Get modpack for loader/version info
        const modpack = modpackId
          ? await metadataManager.getModpackById(modpackId)
          : null;

        // Detect content type from classId
        const { getContentTypeFromClassId } = await import(
          "./services/CurseForgeService"
        );
        const contentType = getContentTypeFromClassId(cfMod.classId);

        // Convert to library format and save
        const modData = curseforgeService.modToLibraryFormat(
          cfMod,
          cfFile,
          modpack?.loader || "forge",
          modpack?.minecraft_version || "1.20.1",
          contentType
        );
        const savedMod = await metadataManager.addMod(modData);

        // Add to modpack if specified
        if (modpackId && modpack) {
          if (!modpack.mod_ids.includes(savedMod.id)) {
            await metadataManager.addModToModpack(modpackId, savedMod.id);
          }
        }

        return { success: true, mod: savedMod };
      } catch (error: any) {
        console.error("[Main] Install dependency error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // ========== DIALOGS IPC HANDLERS ==========

  ipcMain.handle("dialogs:selectZipFile", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("dialogs:selectImage", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

// Quit when all windows are closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  await initializeBackend();
  createWindow();
});
