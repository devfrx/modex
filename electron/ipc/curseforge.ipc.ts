/**
 * CurseForge IPC Handlers
 * CurseForge API integration for mod browsing and downloading
 */

import { ipcMain } from "electron";
import type { CurseForgeService } from "../services/CurseForgeService.js";
import type { MetadataManager, Mod } from "../services/MetadataManager.js";
import { getContentTypeFromClassId } from "../services/CurseForgeService.js";

export interface CurseForgeIpcDeps {
  curseforgeService: CurseForgeService;
  metadataManager: MetadataManager;
}

export function registerCurseForgeHandlers(deps: CurseForgeIpcDeps): void {
  const { curseforgeService, metadataManager } = deps;

  // Check if API key is configured
  ipcMain.handle("curseforge:hasApiKey", async () => {
    return curseforgeService.hasApiKey();
  });

  // Search for mods
  ipcMain.handle("curseforge:search", async (_, options) => {
    console.info("CurseForge search options:", JSON.stringify(options));
    const result = await curseforgeService.searchMods(options);
    return { mods: result.mods, pagination: result.pagination };
  });

  // Get a specific mod
  ipcMain.handle("curseforge:getMod", async (_, modId: number) => {
    return curseforgeService.getMod(modId);
  });

  // Get mod files
  ipcMain.handle("curseforge:getModFiles", async (_, modId: number, options?: any) => {
    return curseforgeService.getModFiles(modId, options);
  });

  // Get file changelog
  ipcMain.handle("curseforge:getChangelog", async (_, modId: number, fileId: number) => {
    return curseforgeService.getFileChangelog(modId, fileId);
  });

  // Get mod description
  ipcMain.handle("curseforge:getModDescription", async (_, modId: number) => {
    return curseforgeService.getModDescription(modId);
  });

  // Get categories
  ipcMain.handle("curseforge:getCategories", async (_, contentType?: string, gameType?: string) => {
    return curseforgeService.getCategories(contentType as any, gameType as any);
  });

  // Get popular mods
  ipcMain.handle("curseforge:getPopular", async (_, gameVersion?: string, modLoader?: string) => {
    return curseforgeService.getPopularMods(gameVersion, modLoader);
  });

  // Get mod loaders
  ipcMain.handle("curseforge:getModLoaders", async (_, gameVersion?: string) => {
    return curseforgeService.getModLoaders(gameVersion);
  });

  // Get Minecraft versions
  ipcMain.handle("curseforge:getMinecraftVersions", async () => {
    return curseforgeService.getMinecraftVersions();
  });

  // Get game classes
  ipcMain.handle("curseforge:getGameClasses", async (_, gameType?: string) => {
    return curseforgeService.fetchGameClasses(gameType as any);
  });

  // Get loader types
  ipcMain.handle("curseforge:getLoaderTypes", async () => {
    return curseforgeService.getLoaderTypes();
  });

  // Get mod recommendations
  ipcMain.handle("curseforge:getRecommendations", async (
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
  });

  // Add mod from CurseForge to library (metadata only)
  ipcMain.handle("curseforge:addToLibrary", async (
    _,
    projectId: number,
    fileId: number,
    preferredLoader?: string,
    contentType?: string
  ) => {
    try {
      // Check if mod already exists in library
      const existingMod = await metadataManager.findModByCFIds(projectId, fileId);
      if (existingMod) {
        console.info(
          `Mod cf-${projectId}-${fileId} already exists in library, reusing. (Existing ID: ${existingMod.id})`
        );

        // Verify content_type is correct by checking classId from API
        const cfMod = await curseforgeService.getMod(projectId);
        if (cfMod?.classId) {
          const correctContentType = getContentTypeFromClassId(cfMod.classId);
          const mappedCorrectType = correctContentType === "resourcepacks" ? "resourcepack"
            : correctContentType === "shaders" ? "shader"
              : "mod";

          if (existingMod.content_type !== mappedCorrectType) {
            console.info(`Correcting content_type for ${existingMod.name}: ${existingMod.content_type} -> ${mappedCorrectType}`);
            await metadataManager.updateMod(existingMod.id, { content_type: mappedCorrectType });
            existingMod.content_type = mappedCorrectType;
          }
        }

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
        cf_categories: modData.cf_categories,
        file_size: modData.file_size,
        date_created: modData.date_created,
        date_modified: modData.date_modified,
        website_url: modData.website_url,
        environment: modData.environment,
        isServerPack: modData.isServerPack ?? null,
      });

      return mod;
    } catch (error) {
      console.error("Error adding mod from CurseForge:", error);
      return null;
    }
  });
}
