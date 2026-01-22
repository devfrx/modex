/**
 * Mods IPC Handlers
 *
 * Handles all IPC communication for mod library operations.
 * Extracted from main.ts for better modularity.
 *
 * @module electron/ipc/mods.ipc
 */

import { ipcMain } from "electron";
import type { MetadataManager, Mod } from "../services/MetadataManager";
import type { ImageCacheService } from "../services/ImageCacheService";
import { createLogger } from "../services/LoggerService";

const log = createLogger("IPC:Mods");

// ==================== TYPES ====================

export interface ModsIpcDeps {
  metadataManager: MetadataManager;
  imageCacheService: ImageCacheService;
}

// ==================== HANDLERS ====================

export function registerModsHandlers(deps: ModsIpcDeps): void {
  const { metadataManager, imageCacheService } = deps;

  // Get all mods from library
  ipcMain.handle("mods:getAll", async () => {
    return metadataManager.getAllMods();
  });

  // Get a single mod by ID
  ipcMain.handle("mods:getById", async (_, id: string) => {
    if (!id || typeof id !== 'string') {
      log.warn('mods:getById called with invalid id:', id);
      return undefined;
    }
    return metadataManager.getModById(id);
  });

  // Add a new mod to library
  ipcMain.handle(
    "mods:add",
    async (_, modData: Omit<Mod, "id" | "created_at">) => {
      if (!modData || !modData.name) {
        throw new Error('Invalid mod data: name is required');
      }
      return metadataManager.addMod(modData);
    }
  );

  // Update an existing mod
  ipcMain.handle(
    "mods:update",
    async (_, id: string, updates: Partial<Mod>) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid mod id');
      }
      return metadataManager.updateMod(id, updates);
    }
  );

  // Delete a single mod
  ipcMain.handle("mods:delete", async (_, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid mod id');
    }
    return metadataManager.deleteMod(id);
  });

  // Delete multiple mods at once
  ipcMain.handle("mods:bulkDelete", async (_, ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return 0;
    }
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

  // Get paginated mods with filtering and sorting
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

  log.info("Mods IPC handlers registered");
}
