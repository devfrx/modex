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
import { MinecraftService, MinecraftInstallation, SyncResult } from "./services/MinecraftService.js";
import { ImageCacheService } from "./services/ImageCacheService.js";
import { ModpackAnalyzerService, ModpackPreview, ModpackAnalysis } from "./services/ModpackAnalyzerService.js";
import { InstanceService, ModexInstance, InstanceSyncResult } from "./services/InstanceService.js";
import { ConfigService, ConfigFile, ConfigFolder, ConfigContent, ConfigExport } from "./services/ConfigService.js";

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
let minecraftService: MinecraftService;
let imageCacheService: ImageCacheService;
let modpackAnalyzerService: ModpackAnalyzerService;
let instanceService: InstanceService;
let configService: ConfigService;

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
  minecraftService = new MinecraftService(metadataManager.getBasePath());
  imageCacheService = new ImageCacheService(metadataManager.getBasePath());
  modpackAnalyzerService = new ModpackAnalyzerService();
  instanceService = new InstanceService(metadataManager.getBasePath());
  configService = new ConfigService(metadataManager.getBasePath());

  // Connect instanceService to metadataManager for version control integration
  metadataManager.setInstanceService(instanceService);

  // Initialize services
  await imageCacheService.initialize();
  await minecraftService.detectInstallations();
  await instanceService.initialize();

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
    "curseforge:getModDescription",
    async (_, modId: number) => {
      return curseforgeService.getModDescription(modId);
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
    "curseforge:getModLoaders",
    async (_, gameVersion?: string) => {
      return curseforgeService.getModLoaders(gameVersion);
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
    // First, find and delete any linked instance
    const linkedInstance = await instanceService.getInstanceByModpack(id);
    if (linkedInstance) {
      console.log(`[Delete Modpack] Also deleting linked instance: ${linkedInstance.id}`);
      await instanceService.deleteInstance(linkedInstance.id);
    }

    // Then delete the modpack
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
    "modpacks:checkModDependents",
    async (_, modpackId: string, modId: string) => {
      return metadataManager.checkModDependents(modpackId, modId);
    }
  );

  ipcMain.handle(
    "modpacks:analyzeModRemovalImpact",
    async (_, modpackId: string, modId: string, action: "remove" | "disable") => {
      return metadataManager.analyzeModRemovalImpact(modpackId, modId, action);
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

  ipcMain.handle("modpacks:getLockedMods", async (_, modpackId: string) => {
    return metadataManager.getLockedMods(modpackId);
  });

  // Generate resource list for a modpack
  ipcMain.handle("modpacks:generateResourceList", async (_, modpackId: string, options?: {
    format?: 'simple' | 'detailed' | 'markdown';
    sortBy?: 'name' | 'type' | 'source';
    includeDisabled?: boolean;
  }) => {
    return metadataManager.generateResourceList(modpackId, options);
  });

  ipcMain.handle(
    "modpacks:setModLocked",
    async (_, modpackId: string, modId: string, locked: boolean) => {
      return metadataManager.setModLocked(modpackId, modId, locked);
    }
  );

  ipcMain.handle(
    "modpacks:updateLockedMods",
    async (_, modpackId: string, lockedModIds: string[]) => {
      return metadataManager.updateLockedMods(modpackId, lockedModIds);
    }
  );

  ipcMain.handle(
    "modpacks:clone",
    async (_, modpackId: string, newName: string) => {
      // Clone the modpack (includes configs, version history)
      const newModpackId = await metadataManager.cloneModpack(modpackId, newName);

      if (newModpackId) {
        // Also clone the instance if one exists
        try {
          const existingInstance = await instanceService.getInstanceByModpack(modpackId);
          if (existingInstance) {
            const newInstance = await instanceService.duplicateInstance(
              existingInstance.id,
              newName
            );
            if (newInstance) {
              // Update the new instance to link to the new modpack
              newInstance.modpackId = newModpackId;
              await instanceService.updateInstance(newInstance.id, { modpackId: newModpackId });
              console.log(`[Clone] Created instance ${newInstance.id} for cloned modpack ${newModpackId}`);
            }
          }
        } catch (err) {
          console.error(`[Clone] Failed to clone instance:`, err);
          // Don't fail the whole operation
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
      // Returns detailed result with info about missing mods
      return metadataManager.revertUnsavedChanges(modpackId);
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
    "versions:validateRollback",
    async (_, modpackId: string, versionId: string) => {
      return metadataManager.validateRollbackMods(modpackId, versionId);
    }
  );

  ipcMain.handle(
    "versions:initialize",
    async (_, modpackId: string, message?: string) => {
      return metadataManager.initializeVersionControl(modpackId, message);
    }
  );

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

  ipcMain.handle(
    "versions:rollback",
    async (_, modpackId: string, versionId: string) => {
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
      const snapshotMap = new Map<string, { id: string; name: string; cf_project_id: number; cf_file_id: number; version?: string }>();
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
          if (snapshot && mod.cf_file_id !== snapshot.cf_file_id) {
            // Same ID but file_id changed - this shouldn't happen with current ID scheme
            // but handle it anyway - we need to download the correct version
            console.log(`[Rollback] Mod ${modId} exists but file_id differs: lib=${mod.cf_file_id} vs snapshot=${snapshot.cf_file_id}`);
            modsToDownload.push({
              targetModId: modId,
              modName: snapshot.name || mod.name,
              cfProjectId: snapshot.cf_project_id,
              cfFileId: snapshot.cf_file_id,
              reason: "version_mismatch"
            });
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
            const { getContentTypeFromClassId } = await import("./services/CurseForgeService");
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
            console.log(`[Rollback] Downloaded mod: ${cfMod.name} (${toDownload.reason})`);
          } catch (err) {
            console.error(`[Rollback] Failed to download mod ${toDownload.cfProjectId}:`, err);
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
        console.log(`[Rollback] Restored loader: ${version.loader} ${version.loader_version}`);

        // Update linked instance loader version
        const linkedInstance = await instanceService.getInstanceByModpack(modpackId);
        if (linkedInstance) {
          await instanceService.updateInstance(linkedInstance.id, {
            loader: version.loader,
            loaderVersion: version.loader_version
          });
          console.log(`[Rollback] Updated instance loader: ${version.loader} ${version.loader_version}`);
        }
      }

      // Sync configs to the linked instance if exists
      if (result) {
        const linkedInstance = await instanceService.getInstanceByModpack(modpackId);
        if (linkedInstance) {
          console.log(`[Rollback] Syncing configs to instance ${linkedInstance.id}`);
          const overridesPath = metadataManager.getOverridesPath(modpackId);

          const configFolders = ["config", "kubejs", "defaultconfigs", "scripts"];
          for (const folder of configFolders) {
            const srcPath = path.join(overridesPath, folder);
            const destPath = path.join(linkedInstance.path, folder);
            if (await fs.pathExists(srcPath)) {
              await fs.copy(srcPath, destPath, { overwrite: true });
              console.log(`[Rollback] Synced ${folder} to instance`);
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

  ipcMain.handle("remote:exportManifest", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    return metadataManager.exportRemoteManifest(modpackId, options);
  });

  ipcMain.handle("remote:checkUpdate", async (_, modpackId: string) => {
    return metadataManager.checkForRemoteUpdate(modpackId);
  });

  ipcMain.handle("remote:importFromUrl", async (_, url: string) => {
    if (!win) return { success: false, error: "Window not available" };

    try {
      // Send progress
      win.webContents.send("import:progress", {
        current: 5,
        total: 100,
        modName: "Fetching remote manifest...",
      });

      // Fetch the manifest from URL
      let urlToFetch = url;

      // Sanitize Gist URL: Remove commit hash if present
      const gistRegex =
        /^(https:\/\/gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[0-9a-f]{40}\/(.+)$/;
      const match = urlToFetch.match(gistRegex);
      if (match) {
        urlToFetch = `${match[1]}/${match[2]}`;
      }

      // For Gist URLs, use the GitHub API
      const gistApiRegex =
        /^https:\/\/gist\.githubusercontent\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/;
      const apiMatch = urlToFetch.match(gistApiRegex);

      let manifest: any;

      if (apiMatch) {
        const gistId = apiMatch[2];
        const filename = apiMatch[3];
        const apiUrl = `https://api.github.com/gists/${gistId}`;

        const apiResponse = await fetch(apiUrl, {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });

        if (!apiResponse.ok) {
          throw new Error(`GitHub API request failed: ${apiResponse.statusText}`);
        }

        const gistData = await apiResponse.json();
        const file = gistData.files[filename];
        if (!file) {
          throw new Error(`File "${filename}" not found in gist`);
        }
        manifest = JSON.parse(file.content);
      } else {
        // Regular URL fetch
        const response = await fetch(urlToFetch, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        manifest = await response.json();
      }

      // Validate manifest
      if (!manifest.modex_version || !manifest.share_code) {
        throw new Error("Invalid MODEX manifest: Missing modex_version or share_code");
      }

      win.webContents.send("import:progress", {
        current: 10,
        total: 100,
        modName: `Importing ${manifest.modpack?.name || "modpack"}...`,
      });

      // Progress callback
      const onProgress = (current: number, total: number, modName: string) => {
        if (win) {
          // Map to 10-95% range
          const percent = 10 + Math.round((current / total) * 85);
          win.webContents.send("import:progress", { current: percent, total: 100, modName });
        }
      };

      // Use dedicated importFromUrl function (always creates new modpack)
      const importResult = await metadataManager.importFromUrl(
        manifest,
        urlToFetch,
        curseforgeService,
        onProgress
      );

      win.webContents.send("import:progress", {
        current: 100,
        total: 100,
        modName: "Import complete!",
      });

      return importResult;
    } catch (error: any) {
      console.error("[Remote Import] Error:", error);
      return { success: false, error: error.message };
    }
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

      // Create ZIP with manifest.json, modlist.html and overrides
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile(
        "manifest.json",
        Buffer.from(JSON.stringify(manifest, null, 2))
      );
      zip.addFile("modlist.html", Buffer.from(modlist));

      // Add overrides (config files, resourcepacks, shaderpacks, etc.) if they exist
      const overridesPath = metadataManager.getOverridesPath(modpackId);
      if (await fs.pathExists(overridesPath)) {
        const entries = await fs.readdir(overridesPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "snapshots") continue; // Don't include version snapshots

          const srcPath = path.join(overridesPath, entry.name);
          if (entry.isDirectory()) {
            zip.addLocalFolder(srcPath, `overrides/${entry.name}`);
          } else {
            zip.addLocalFile(srcPath, "overrides");
          }
        }
        console.log(`[Export CF] Added overrides from ${overridesPath}`);
      }

      zip.writeZip(result.filePath);

      return { success: true, path: result.filePath };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("export:modex", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.modex`,
        filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest, code } = await metadataManager.exportToModex(modpackId, options);

      // Create ZIP with modex.json and overrides
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile("modex.json", Buffer.from(JSON.stringify(manifest, null, 2)));

      // Add overrides (config files) if they exist
      const overridesPath = metadataManager.getOverridesPath(modpackId);
      if (await fs.pathExists(overridesPath)) {
        const entries = await fs.readdir(overridesPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "snapshots") continue; // Don't include version snapshots

          const srcPath = path.join(overridesPath, entry.name);
          if (entry.isDirectory()) {
            zip.addLocalFolder(srcPath, `overrides/${entry.name}`);
          } else {
            zip.addLocalFile(srcPath, "overrides");
          }
        }
        console.log(`[Export MODEX] Added overrides from ${overridesPath}`);
      }

      zip.writeZip(result.filePath);

      return { success: true, code, path: result.filePath };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("export:manifest", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.json`,
        filters: [{ name: "JSON Manifest", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest } = await metadataManager.exportToModex(modpackId, options);

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
          console.log(`[CF Import] Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
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
              console.log(`[CF Import] Version control initialized for modpack ${importResult.modpackId}`);
            }

            console.log(`[CF Import] Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
          }
        } catch (autoFlowError) {
          console.error(`[CF Import] Auto-flow failed (non-fatal):`, autoFlowError);
          // Still try to initialize version control even if instance creation failed
          try {
            const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
            if (!existingHistory || existingHistory.versions.length === 0) {
              await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from CurseForge");
              console.log(`[CF Import] Version control initialized (fallback)`);
            }
          } catch (vcError) {
            console.error(`[CF Import] Failed to initialize version control:`, vcError);
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
            console.log(`[CF Import] Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
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
                console.log(`[CF URL Import] Version control initialized for modpack ${importResult.modpackId}`);
              }

              console.log(`[CF URL Import] Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
            }
          } catch (autoFlowError) {
            console.error(`[CF URL Import] Auto-flow failed (non-fatal):`, autoFlowError);
            // Still try to initialize version control even if instance creation failed
            try {
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from CurseForge URL");
                console.log(`[CF URL Import] Version control initialized (fallback)`);
              }
            } catch (vcError) {
              console.error(`[CF URL Import] Failed to initialize version control:`, vcError);
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
          console.log(`[MODEX Import] Saved ${overridesResult.fileCount} override files for modpack ${importResult.modpackId}`);
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
                console.log(`[MODEX Import] Version control initialized for modpack ${importResult.modpackId}`);
              }

              console.log(`[MODEX Import] Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
            }
          } catch (autoFlowError) {
            console.error(`[MODEX Import] Auto-flow failed (non-fatal):`, autoFlowError);
            // Still try to initialize version control even if instance creation failed
            try {
              const existingHistory = await metadataManager.getVersionHistory(importResult.modpackId);
              if (!existingHistory || existingHistory.versions.length === 0) {
                await metadataManager.initializeVersionControl(importResult.modpackId, "Initial import from .modex file");
                console.log(`[MODEX Import] Version control initialized (fallback)`);
              }
            } catch (vcError) {
              console.error(`[MODEX Import] Failed to initialize version control:`, vcError);
            }
          }
        }
      }

      return importResult;
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
                console.log(`[MODEX Manifest Import] Version control initialized for modpack ${importResult.modpackId}`);
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
              console.log(`[MODEX Manifest Update] Created sync version for modpack ${importResult.modpackId}`);
            }
          } catch (vcError) {
            console.error(`[MODEX Manifest Import] Failed to handle version control:`, vcError);
          }
        }

        return importResult;
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
    async (_, apiKey: string) => {
      console.log(`[IPC] Setting CurseForge API key`);
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
          console.log(`[Update] New version already exists: ${newMod.id}`);
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
            "./services/CurseForgeService"
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
          console.log(`[Update] Created new mod version: ${newMod.id}`);
        }

        if (!newMod) {
          return { success: false, error: "Failed to create new mod version" };
        }

        // Replace old mod ID with new mod ID in the specified modpack or all modpacks
        if (modpackId) {
          // Update only the specified modpack
          await metadataManager.replaceModInModpack(modpackId, modId, newMod.id);
          console.log(`[Update] Replaced ${modId} with ${newMod.id} in modpack ${modpackId}`);
        } else {
          // Update all modpacks that contain this mod
          const modpacks = await metadataManager.getAllModpacks();
          for (const mp of modpacks) {
            if (mp.mod_ids.includes(modId)) {
              await metadataManager.replaceModInModpack(mp.id, modId, newMod.id);
              console.log(`[Update] Replaced ${modId} with ${newMod.id} in modpack ${mp.id}`);
            }
          }
        }

        return { success: true, newModId: newMod.id, oldModId: modId };
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
          mod1: { id: c.mod1.id, name: c.mod1.name, curseforge_id: c.mod1.curseforge_id },
          mod2: { id: c.mod2.id, name: c.mod2.name, curseforge_id: c.mod2.curseforge_id },
          type: c.type,
          severity: c.severity,
          description: c.description,
          suggestion: c.suggestion,
          reason: c.description, // legacy field for backwards compatibility
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

  // ========== MINECRAFT INSTALLATIONS IPC HANDLERS ==========

  ipcMain.handle("minecraft:detectInstallations", async () => {
    return minecraftService.detectInstallations();
  });

  ipcMain.handle("minecraft:getInstallations", async () => {
    return minecraftService.getInstallations();
  });

  ipcMain.handle("minecraft:addCustomInstallation", async (_, name: string, mcPath: string, modsPath?: string) => {
    return minecraftService.addCustomInstallation(name, mcPath, modsPath);
  });

  ipcMain.handle("minecraft:removeInstallation", async (_, id: string) => {
    return minecraftService.removeInstallation(id);
  });

  ipcMain.handle("minecraft:setDefault", async (_, id: string) => {
    return minecraftService.setDefaultInstallation(id);
  });

  ipcMain.handle("minecraft:getDefault", async () => {
    return minecraftService.getDefaultInstallation();
  });

  // LEGACY: Direct folder sync (MinecraftService) - syncs to existing Minecraft installation
  // NOTE: This differs from InstanceService - disabled mods are simply NOT synced (excluded),
  // rather than being synced and renamed to .disabled. This is intentional because legacy sync
  // operates on user's existing Minecraft folder where they may have their own mod management.
  ipcMain.handle("minecraft:syncModpack", async (_, installationId: string, modpackId: string, options?: { clearExisting?: boolean; createBackup?: boolean }) => {
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

  ipcMain.handle("minecraft:openModsFolder", async (_, installationId: string) => {
    return minecraftService.openModsFolder(installationId);
  });

  ipcMain.handle("minecraft:launch", async (_, installationId?: string) => {
    return minecraftService.launchMinecraft(installationId);
  });

  ipcMain.handle("minecraft:selectFolder", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Minecraft Installation Folder"
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("minecraft:selectLauncher", async () => {
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

  ipcMain.handle("minecraft:setLauncherPath", async (_, type: string, launcherPath: string) => {
    return minecraftService.setLauncherPath(type as any, launcherPath);
  });

  ipcMain.handle("minecraft:getLauncherPaths", async () => {
    return minecraftService.getLauncherPaths();
  });

  // ========== MODEX INSTANCES IPC HANDLERS ==========

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
    return instanceService.createInstance(options);
  });

  ipcMain.handle("instance:delete", async (_, id: string) => {
    return instanceService.deleteInstance(id);
  });

  ipcMain.handle("instance:update", async (_, id: string, updates: Partial<ModexInstance>) => {
    return instanceService.updateInstance(id, updates);
  });

  ipcMain.handle("instance:syncModpack", async (_, instanceId: string, modpackId: string, options?: {
    clearExisting?: boolean;
    configSyncMode?: "overwrite" | "new_only" | "skip";
    overridesZipPath?: string;
  }) => {
    console.log(`[instance:syncModpack] Called with instanceId: ${instanceId}, modpackId: ${modpackId}`);
    
    // Get modpack and mods
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      console.log(`[instance:syncModpack] Modpack not found: ${modpackId}`);
      return { success: false, modsDownloaded: 0, modsSkipped: 0, configsCopied: 0, configsSkipped: 0, errors: ["Modpack not found"], warnings: [] };
    }
    
    console.log(`[instance:syncModpack] Found modpack: ${modpack.name}, mod_ids count: ${modpack.mod_ids?.length}, disabled_mod_ids: ${JSON.stringify(modpack.disabled_mod_ids)}`);

    // Update instance loader and loaderVersion to match modpack (so next launch installs correct loader)
    const instance = await instanceService.getInstance(instanceId);
    if (instance) {
      const needsLoaderUpdate = 
        instance.loader !== modpack.loader || 
        instance.loaderVersion !== modpack.loader_version;
      
      if (needsLoaderUpdate) {
        console.log(`[instance:syncModpack] Updating instance loader: ${instance.loader}/${instance.loaderVersion} -> ${modpack.loader}/${modpack.loader_version}`);
        await instanceService.updateInstance(instanceId, {
          loader: modpack.loader,
          loaderVersion: modpack.loader_version
        });
      }
    }

    const mods = await metadataManager.getModsInModpack(modpackId);
    const disabledModIds = new Set(modpack.disabled_mod_ids || []);

    console.log(`[instance:syncModpack] Modpack has ${mods.length} mods, ${disabledModIds.size} disabled`);
    
    // Log mods without CF IDs (potential problems)
    const modsWithoutCFIds = mods.filter(m => !m.cf_project_id || !m.cf_file_id);
    if (modsWithoutCFIds.length > 0) {
      console.log(`[instance:syncModpack] WARNING: ${modsWithoutCFIds.length} mods without CF IDs:`);
      modsWithoutCFIds.forEach(m => console.log(`  - ${m.name} (id: ${m.id})`));
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

    // Use passed overridesZipPath, or use the calculated overrides path
    // The overrides are always stored at userData/modex/overrides/{modpackId}
    const overridesSource = options?.overridesZipPath || metadataManager.getOverridesPath(modpackId);

    return instanceService.syncModpackToInstance(instanceId, {
      mods: modsToSync,
      disabledMods: disabledModsToSync,
      overridesZipPath: overridesSource
    }, {
      clearExisting: options?.clearExisting,
      configSyncMode: options?.configSyncMode,
      onProgress: (stage, current, total, item) => {
        if (win) {
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

  ipcMain.handle("instance:launch", async (_, instanceId: string) => {
    // Send loader installation progress to renderer
    const onProgress = (stage: string, current: number, total: number, detail?: string) => {
      if (win) {
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
    if (win) {
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
    if (win) {
      win.webContents.send("game:logLine", {
        instanceId,
        time: logLine.time,
        level: logLine.level,
        message: logLine.message,
        raw: logLine.raw
      });
    }
  });

  ipcMain.handle("instance:openFolder", async (_, instanceId: string, subfolder?: string) => {
    return instanceService.openInstanceFolder(instanceId, subfolder);
  });

  ipcMain.handle("instance:getStats", async (_, instanceId: string) => {
    return instanceService.getInstanceStats(instanceId);
  });

  ipcMain.handle("instance:checkSyncStatus", async (_, instanceId: string, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) {
      return { needsSync: false, missingInInstance: [], extraInInstance: [], disabledMismatch: [], configDifferences: 0, totalDifferences: 0, loaderVersionMismatch: false };
    }

    const mods = await metadataManager.getModsInModpack(modpackId);
    const modData = mods.map(m => ({
      id: m.id,
      filename: m.filename,
      content_type: m.content_type
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

  ipcMain.handle("instance:export", async (_, instanceId: string) => {
    if (!win) return false;

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

  ipcMain.handle("instance:getLauncherConfig", async () => {
    return instanceService.getLauncherConfig();
  });

  ipcMain.handle("instance:setLauncherConfig", async (_, config: any) => {
    return instanceService.setLauncherConfig(config);
  });

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
        if (win) {
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
          console.log(`[CreateFromModpack] Version control initialized for modpack ${modpackId}`);
        }
      } catch (vcError) {
        console.error(`[CreateFromModpack] Failed to initialize version control:`, vcError);
        // Don't fail the overall operation, just log the error
      }
    }

    return { instance, syncResult };
  });

  // ========== IMAGE CACHE IPC HANDLERS ==========

  ipcMain.handle("cache:getImage", async (_, url: string) => {
    return imageCacheService.getCachedUrl(url);
  });

  ipcMain.handle("cache:cacheImage", async (_, url: string) => {
    return imageCacheService.cacheImage(url);
  });

  ipcMain.handle("cache:prefetch", async (_, urls: string[]) => {
    return imageCacheService.prefetchImages(urls);
  });

  ipcMain.handle("cache:getStats", async () => {
    return imageCacheService.getStats();
  });

  ipcMain.handle("cache:clear", async () => {
    return imageCacheService.clearCache();
  });

  // ========== SETTINGS IPC HANDLERS ==========

  ipcMain.handle("settings:getInstanceSync", async () => {
    return metadataManager.getInstanceSyncSettings();
  });

  ipcMain.handle("settings:setInstanceSync", async (_, settings: {
    autoSyncBeforeLaunch?: boolean;
    autoImportConfigsAfterGame?: boolean;
    showSyncConfirmation?: boolean;
    defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
  }) => {
    try {
      await metadataManager.setInstanceSyncSettings(settings);
      return { success: true };
    } catch (error) {
      console.error("Failed to save instance sync settings:", error);
      throw error;
    }
  });

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
          console.log(`[smartLaunch] Updating instance loader: ${instance.loader}/${instance.loaderVersion} -> ${modpack.loader}/${modpack.loader_version}`);
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
      if (win) {
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

  // ========== MODPACK PREVIEW/ANALYSIS IPC HANDLERS ==========

  ipcMain.handle("preview:fromZip", async (_, zipPath: string) => {
    return modpackAnalyzerService.previewFromZip(zipPath);
  });

  ipcMain.handle("preview:fromCurseForge", async (_, modpackData: any, fileData: any) => {
    return modpackAnalyzerService.previewFromCurseForge(modpackData, fileData);
  });

  ipcMain.handle("preview:analyzeModpack", async (_, modpackId: string) => {
    const modpack = await metadataManager.getModpackById(modpackId);
    if (!modpack) return null;

    const mods = await metadataManager.getModsInModpack(modpackId);

    return modpackAnalyzerService.analyzeExistingModpack(
      mods.map(m => ({
        cf_project_id: m.cf_project_id,
        name: m.name,
        file_size: m.file_size
      })),
      {
        minecraftVersion: modpack.minecraft_version || "",
        modLoader: modpack.loader || "forge"
      }
    );
  });

  ipcMain.handle("preview:selectZip", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Modpack Files", extensions: ["zip", "mrpack", "modex"] }
      ],
      title: "Select Modpack to Preview"
    });

    if (result.canceled || !result.filePaths[0]) return null;

    // Return both path and preview
    const zipPath = result.filePaths[0];
    const preview = await modpackAnalyzerService.previewFromZip(zipPath);

    return { path: zipPath, preview };
  });

  // ========== LIBRARY PAGINATION IPC HANDLERS ==========

  ipcMain.handle("mods:getPaginated", async (_, options: {
    page: number;
    pageSize: number;
    search?: string;
    loader?: string;
    gameVersion?: string;
    contentType?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    favorites?: boolean;
    folderId?: string;
  }) => {
    const allMods = await metadataManager.getAllMods();
    let filtered = [...allMods];

    // Apply filters
    if (options.search) {
      const query = options.search.toLowerCase();
      filtered = filtered.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.author?.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
      );
    }

    if (options.loader && options.loader !== "all") {
      filtered = filtered.filter(m => m.loader.toLowerCase() === options.loader!.toLowerCase());
    }

    if (options.gameVersion && options.gameVersion !== "all") {
      filtered = filtered.filter(m => m.game_version === options.gameVersion);
    }

    if (options.contentType && options.contentType !== "all") {
      filtered = filtered.filter(m => (m.content_type || "mod") === options.contentType);
    }

    if (options.favorites) {
      filtered = filtered.filter(m => m.favorite);
    }

    // Sort
    const sortBy = options.sortBy || "name";
    const sortDir = options.sortDir || "asc";

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "download_count":
          comparison = (a.download_count || 0) - (b.download_count || 0);
          break;
        case "author":
          comparison = (a.author || "").localeCompare(b.author || "");
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }
      return sortDir === "desc" ? -comparison : comparison;
    });

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / options.pageSize);
    const start = (options.page - 1) * options.pageSize;
    const end = start + options.pageSize;
    const mods = filtered.slice(start, end);

    // Prefetch images for current page
    const imageUrls = mods
      .map(m => m.thumbnail_url || m.logo_url)
      .filter(Boolean) as string[];
    imageCacheService.prefetchImages(imageUrls);

    return {
      mods,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages,
        hasNext: options.page < totalPages,
        hasPrev: options.page > 1
      }
    };
  });

  // ========== CONFIG SERVICE IPC HANDLERS ==========

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

  // ========== STRUCTURED CONFIG EDITOR IPC HANDLERS ==========

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
    console.log("[config:saveStructured] Instance:", instance.id, "ModpackId:", modpackId);
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

  // ========== SYSTEM INFO IPC HANDLERS ==========

  // Get system memory info
  ipcMain.handle("system:getMemoryInfo", async () => {
    const os = await import("os");
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      total: Math.floor(totalMem / (1024 * 1024)), // MB
      free: Math.floor(freeMem / (1024 * 1024)), // MB
      used: Math.floor((totalMem - freeMem) / (1024 * 1024)), // MB
      // Suggested max for Minecraft (leave 2GB for system)
      suggestedMax: Math.max(4096, Math.floor((totalMem / (1024 * 1024)) - 2048))
    };
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
