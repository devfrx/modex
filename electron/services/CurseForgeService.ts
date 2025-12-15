/**
 * CurseForge API Service - Metadata Only
 *
 * Simplified version without download functionality.
 * Used for searching, fetching mod info, and converting to library format.
 */

import * as fs from "fs-extra";
import * as path from "path";

// ==================== TYPES ====================

export interface CFMod {
  id: number;
  gameId: number;
  classId?: number; // 6=mods, 12=resourcepacks, 6552=shaders
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  logo?: {
    thumbnailUrl: string;
    url: string;
  };
  categories: CFCategory[];
  authors: CFAuthor[];
  latestFiles: CFFile[];
  latestFilesIndexes: CFFileIndex[];
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
}

export interface CFCategory {
  id: number;
  name: string;
  slug: string;
  iconUrl: string;
}

export interface CFAuthor {
  id: number;
  name: string;
  url: string;
}

export interface CFSortableGameVersion {
  gameVersionName: string;
  gameVersionPadded: string;
  gameVersion: string;
  gameVersionReleaseDate: string;
  gameVersionTypeId: number;
}

export interface CFFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: number; // 1=release, 2=beta, 3=alpha
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl: string | null;
  gameVersions: string[];
  sortableGameVersions?: CFSortableGameVersion[];
  dependencies: CFDependency[];
  fileFingerprint: number;
}

export interface CFFileIndex {
  gameVersion: string;
  fileId: number;
  filename: string;
  releaseType: number;
  modLoader: number; // 1=forge, 4=fabric, 5=quilt, 6=neoforge
}

export interface CFDependency {
  modId: number;
  relationType: number; // 1=embedded, 2=optional, 3=required, 4=tool, 5=incompatible, 6=include
}

export interface CFSearchResult {
  mods: CFMod[];
  pagination: {
    index: number;
    pageSize: number;
    resultCount: number;
    totalCount: number;
  };
}

// ModLoader mapping
export const MODLOADER_MAP: Record<number, string> = {
  0: "any",
  1: "forge",
  2: "cauldron",
  3: "liteloader",
  4: "fabric",
  5: "quilt",
  6: "neoforge",
};

export const MODLOADER_REVERSE_MAP: Record<string, number> = {
  any: 0,
  forge: 1,
  cauldron: 2,
  liteloader: 3,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

export interface CFModLoader {
  name: string;
  gameVersionId: number;
  minecraftGameVersionId: number;
  forgeVersion: string;
  type: number;
  downloadUrl: string;
  filename: string;
  installProfileJson: string;
  latest: boolean;
  recommended: boolean;
  dateModified: string;
  mavenVersionString: string;
}

// ==================== SERVICE ====================

// Content Type Class IDs
export const CONTENT_CLASS_IDS = {
  mods: 6,
  resourcepacks: 12,
  shaders: 6552,
} as const;

export type ContentType = keyof typeof CONTENT_CLASS_IDS;

// Helper to get content type from classId
export function getContentTypeFromClassId(classId?: number): ContentType {
  if (classId === CONTENT_CLASS_IDS.resourcepacks) return "resourcepacks";
  if (classId === CONTENT_CLASS_IDS.shaders) return "shaders";
  return "mods"; // Default to mods
}

export class CurseForgeService {
  private apiKey: string = "";
  private readonly apiUrl = "https://api.curseforge.com/v1";
  private readonly MINECRAFT_GAME_ID = 432;
  private readonly MODS_CLASS_ID = 6; // Legacy - use CONTENT_CLASS_IDS instead

  // Simple in-memory cache
  private cache = new Map<string, { data: any; expires: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private configPath: string) {
    this.loadConfig();
  }

  // ==================== CACHE ====================

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expires) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, expires: Date.now() + this.CACHE_TTL });
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ==================== CONFIG ====================

  private async loadConfig() {
    const configFile = path.join(this.configPath, "config.json");
    if (await fs.pathExists(configFile)) {
      const config = await fs.readJson(configFile);
      this.apiKey = config.curseforge_api_key || "";
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    const configFile = path.join(this.configPath, "config.json");
    let config: any = {};

    if (await fs.pathExists(configFile)) {
      config = await fs.readJson(configFile);
    }

    config.curseforge_api_key = apiKey;
    await fs.writeJson(configFile, config, { spaces: 2 });
  }

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Fetch multiple mods by their IDs in a single request
   * Much more efficient than fetching one-by-one
   */
  async getModsByIds(modIds: number[]): Promise<CFMod[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    if (modIds.length === 0) return [];

    // Check cache first
    const cacheKey = `mods:${modIds.sort().join(",")}`;
    const cached = this.getCached<CFMod[]>(cacheKey);
    if (cached) return cached;

    console.log(`[CurseForge] Batch fetching ${modIds.length} mods`);

    const response = await fetch(`${this.apiUrl}/mods`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ modIds }),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    const mods = data.data || [];
    this.setCache(cacheKey, mods);
    return mods;
  }

  /**
   * Fetch multiple files by their IDs in a single request
   * Useful for update checking
   */
  async getFilesByIds(fileIds: number[]): Promise<CFFile[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    if (fileIds.length === 0) return [];

    console.log(`[CurseForge] Batch fetching ${fileIds.length} files`);

    const response = await fetch(`${this.apiUrl}/mods/files`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fileIds }),
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get full mod description (HTML)
   */
  async getModDescription(
    modId: number,
    options?: { stripped?: boolean }
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const cacheKey = `desc:${modId}:${options?.stripped || false}`;
    const cached = this.getCached<string>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (options?.stripped) params.append("stripped", "true");

    const url = `${this.apiUrl}/mods/${modId}/description${
      params.toString() ? "?" + params : ""
    }`;
    const response = await fetch(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    const description = data.data || "";
    this.setCache(cacheKey, description);
    return description;
  }

  /**
   * Get file changelog (HTML)
   */
  async getFileChangelog(modId: number, fileId: number): Promise<string> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const cacheKey = `changelog:${modId}:${fileId}`;
    const cached = this.getCached<string>(cacheKey);
    if (cached) return cached;

    const url = `${this.apiUrl}/mods/${modId}/files/${fileId}/changelog`;
    const response = await fetch(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return "<p>No changelog available</p>";
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    const changelog = data.data || "<p>No changelog available</p>";
    this.setCache(cacheKey, changelog);
    return changelog;
  }

  /**
   * Get a single file by mod ID and file ID
   */
  async getModFile(modId: number, fileId: number): Promise<CFFile | null> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const response = await fetch(
      `${this.apiUrl}/mods/${modId}/files/${fileId}`,
      {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || null;
  }

  // ==================== SEARCH ====================

  async searchMods(options: {
    query?: string;
    gameVersion?: string;
    modLoader?: string;
    categoryId?: number;
    pageSize?: number;
    index?: number;
    sortField?: number;
    sortOrder?: "asc" | "desc";
    contentType?: ContentType;
  }): Promise<CFSearchResult> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    // Use content type class ID or default to mods
    const classId = options.contentType
      ? CONTENT_CLASS_IDS[options.contentType]
      : this.MODS_CLASS_ID;

    const params = new URLSearchParams({
      gameId: this.MINECRAFT_GAME_ID.toString(),
      classId: classId.toString(),
      pageSize: (options.pageSize || 20).toString(),
      index: (options.index || 0).toString(),
      sortField: (options.sortField || 2).toString(),
      sortOrder: options.sortOrder || "desc",
    });

    if (options.query) {
      params.append("searchFilter", options.query);
    }

    if (options.gameVersion) {
      params.append("gameVersion", options.gameVersion);
    }

    // Only apply mod loader filter for mods (not for resourcepacks/shaders)
    if (
      options.modLoader &&
      (!options.contentType || options.contentType === "mods")
    ) {
      const loaderNum = MODLOADER_REVERSE_MAP[options.modLoader.toLowerCase()];
      if (loaderNum !== undefined) {
        params.append("modLoaderType", loaderNum.toString());
      }
    }

    if (options.categoryId) {
      params.append("categoryId", options.categoryId.toString());
    }

    const url = `${this.apiUrl}/mods/search?${params}`;
    console.log("[CurseForge] Searching:", url);

    const response = await fetch(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      mods: data.data || [],
      pagination: data.pagination || {
        index: 0,
        pageSize: 20,
        resultCount: 0,
        totalCount: 0,
      },
    };
  }

  async getMod(modId: number): Promise<CFMod | null> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const response = await fetch(`${this.apiUrl}/mods/${modId}`, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || null;
  }

  async getModFiles(
    modId: number,
    options?: {
      gameVersion?: string;
      modLoader?: string;
      pageSize?: number;
      index?: number;
    }
  ): Promise<CFFile[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const params = new URLSearchParams({
      pageSize: (options?.pageSize || 50).toString(),
      index: (options?.index || 0).toString(),
    });

    if (options?.gameVersion) {
      params.append("gameVersion", options.gameVersion);
    }

    if (options?.modLoader) {
      const loaderNum = MODLOADER_REVERSE_MAP[options.modLoader.toLowerCase()];
      if (loaderNum !== undefined) {
        params.append("modLoaderType", loaderNum.toString());
      }
    }

    const response = await fetch(
      `${this.apiUrl}/mods/${modId}/files?${params}`,
      {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  async getFile(modId: number, fileId: number): Promise<CFFile | null> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const response = await fetch(
      `${this.apiUrl}/mods/${modId}/files/${fileId}`,
      {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || null;
  }

  // ==================== HELPERS ====================

  async getBestFile(
    modId: number,
    gameVersion: string,
    modLoader: string,
    contentType?: "mod" | "resourcepack" | "shader"
  ): Promise<CFFile | null> {
    // For resourcepacks/shaders, loader is not relevant
    const isModContent = !contentType || contentType === "mod";

    // First try exact match with version and loader (for mods only)
    const files = isModContent
      ? await this.getModFiles(modId, {
          gameVersion,
          modLoader,
        })
      : await this.getModFiles(modId, { gameVersion }); // No loader filter for non-mods

    if (files.length === 0) {
      // Fallback: try same version with any loader that matches
      const allFiles = await this.getModFiles(modId, { gameVersion });
      if (allFiles.length > 0) {
        if (isModContent) {
          const loaderLower = modLoader.toLowerCase();
          const matching = allFiles.find((f) =>
            f.gameVersions.some((gv) => gv.toLowerCase() === loaderLower)
          );
          return matching || null; // Return null if no matching loader found
        } else {
          // For non-mods, return the first file
          return allFiles[0];
        }
      }
      return null;
    }

    // Prefer release files over beta/alpha
    const releaseFile = files.find((f) => f.releaseType === 1);
    return releaseFile || files[0];
  }

  /**
   * Convert CF mod+file to library format (metadata only, no file operations)
   *
   * IMPORTANT:
   * - game_version comes from CF API's sortableGameVersions or gameVersions array
   * - version (mod version) uses file.displayName directly - no parsing
   */
  modToLibraryFormat(
    mod: CFMod,
    file: CFFile,
    preferredLoader?: string,
    targetGameVersion?: string,
    contentType?: ContentType
  ): {
    source: "curseforge";
    cf_project_id: number;
    cf_file_id: number;
    name: string;
    slug: string;
    filename: string;
    version: string;
    game_version: string;
    game_versions?: string[];
    loader: string;
    content_type: "mod" | "resourcepack" | "shader";
    description: string;
    author: string;
    thumbnail_url?: string;
    logo_url?: string;
    download_count: number;
    release_type: "release" | "beta" | "alpha";
    date_released: string;
    dependencies: { modId: number; type: string }[];
    categories: string[];
    file_size: number;
    date_created: string;
    date_modified: string;
    website_url: string;
  } {
    let loader = "unknown";
    let game_version = "unknown";
    const foundLoaders: string[] = [];
    const foundVersions: string[] = [];

    // PRIORITY 1: Use sortableGameVersions from CF API (most reliable)
    // These are properly structured game version entries from CurseForge
    if (file.sortableGameVersions && file.sortableGameVersions.length > 0) {
      for (const sgv of file.sortableGameVersions) {
        // gameVersion field contains the actual MC version like "1.20.1"
        if (sgv.gameVersion && /^1\.\d+(\.\d+)?$/.test(sgv.gameVersion)) {
          foundVersions.push(sgv.gameVersion);
        }
      }
    }

    // PRIORITY 2: Fallback to gameVersions array if sortableGameVersions empty
    if (foundVersions.length === 0) {
      for (const gv of file.gameVersions) {
        if (/^1\.\d+(\.\d+)?$/.test(gv)) {
          foundVersions.push(gv);
        }
      }
    }

    // Parse loaders from gameVersions array (loaders are always in gameVersions)
    for (const gv of file.gameVersions) {
      const lower = gv.toLowerCase();
      if (["forge", "fabric", "quilt", "neoforge"].includes(lower)) {
        foundLoaders.push(lower);
      }
    }

    // Determine game_version - prefer target if specified and available
    if (targetGameVersion && foundVersions.includes(targetGameVersion)) {
      game_version = targetGameVersion;
    } else if (foundVersions.length > 0) {
      // Sort versions and pick the most recent (highest)
      foundVersions.sort((a, b) => {
        const aParts = a.split(".").map(Number);
        const bParts = b.split(".").map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return bVal - aVal;
        }
        return 0;
      });
      game_version = foundVersions[0];
    }

    // Determine loader - prefer specified if available
    if (
      preferredLoader &&
      foundLoaders.includes(preferredLoader.toLowerCase())
    ) {
      loader = preferredLoader.toLowerCase();
    } else if (foundLoaders.length > 0) {
      loader = foundLoaders[0];
    }

    // MOD VERSION: Use displayName directly from CF API - no parsing!
    // This is the actual mod version as set by the mod author
    const version = file.displayName;

    const releaseTypes: Record<number, "release" | "beta" | "alpha"> = {
      1: "release",
      2: "beta",
      3: "alpha",
    };

    const dependencyTypes: Record<number, string> = {
      1: "embedded",
      2: "optional",
      3: "required",
      4: "tool",
      5: "incompatible",
      6: "include",
    };

    // Map content type parameter to library format
    const contentTypeMap: Record<string, "mod" | "resourcepack" | "shader"> = {
      mods: "mod",
      resourcepacks: "resourcepack",
      shaders: "shader",
    };
    const mappedContentType = contentType ? contentTypeMap[contentType] : "mod";

    // Website URL path based on content type
    const urlPaths: Record<string, string> = {
      mods: "mc-mods",
      resourcepacks: "texture-packs",
      shaders: "shaders",
    };
    const urlPath = contentType ? urlPaths[contentType] : "mc-mods";

    // Store all compatible game versions for shaders/resourcepacks
    // Sort versions for consistent display (newest first)
    const sortedGameVersions = [...foundVersions].sort((a, b) => {
      const aParts = a.split(".").map(Number);
      const bParts = b.split(".").map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return bVal - aVal;
      }
      return 0;
    });

    return {
      source: "curseforge",
      cf_project_id: mod.id,
      cf_file_id: file.id,
      name: mod.name,
      slug: mod.slug,
      filename: file.fileName,
      version,
      game_version,
      game_versions:
        sortedGameVersions.length > 0 ? sortedGameVersions : undefined,
      loader,
      content_type: mappedContentType,
      description: mod.summary,
      author: mod.authors.map((a) => a.name).join(", "),
      thumbnail_url: mod.logo?.thumbnailUrl || undefined,
      logo_url: mod.logo?.url || undefined,
      download_count: mod.downloadCount,
      release_type: releaseTypes[file.releaseType] || "release",
      date_released: file.fileDate,
      dependencies: file.dependencies.map((d) => ({
        modId: d.modId,
        type: dependencyTypes[d.relationType] || "unknown",
      })),
      categories: Array.from(new Set(mod.categories.map((c) => c.name))),
      file_size: file.fileLength,
      date_created: mod.dateCreated,
      date_modified: mod.dateModified,
      website_url: `https://www.curseforge.com/minecraft/${urlPath}/${mod.slug}`,
    };
  }

  async getPopularMods(
    gameVersion?: string,
    modLoader?: string,
    pageSize: number = 20
  ): Promise<CFMod[]> {
    const result = await this.searchMods({
      gameVersion,
      modLoader,
      pageSize,
      sortField: 2,
      sortOrder: "desc",
    });
    return result.mods;
  }

  async getCategories(contentType?: ContentType): Promise<CFCategory[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const classId = contentType
      ? CONTENT_CLASS_IDS[contentType]
      : this.MODS_CLASS_ID;

    const response = await fetch(
      `${this.apiUrl}/categories?gameId=${this.MINECRAFT_GAME_ID}&classId=${classId}`,
      {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CurseForge API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get all available mod loaders for a specific game version
   */
  async getModLoaders(gameVersion?: string): Promise<CFModLoader[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    let url = `${this.apiUrl}/minecraft/modloader`;

    // Note: CF API doesn't support filtering by gameVersion directly in this endpoint
    // We fetch all and filter client-side if needed, though usually we filter by name/type
    // However, if we need to filter, we can pass it as a query param if supported in future
    // For now, we fetch all and let the caller filter
    if (gameVersion) {
      url += `?version=${gameVersion}`;
    }

    const response = await fetch(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // Fallback or empty if not supported/found
      console.warn(
        `[CurseForge] Failed to fetch modloaders: ${response.status}`
      );
      return [];
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get smart mod recommendations based on installed mods' categories
   */
  /**
   * Get smart mod recommendations based on installed mods' categories
   */
  async getRecommendations(
    installedCategoryIds: number[],
    gameVersion?: string,
    modLoader?: string,
    excludeModIds: number[] = [],
    limit: number = 20, // Increased default limit
    randomize: boolean = false,
    contentType: "mod" | "resourcepack" | "shader" = "mod"
  ): Promise<{ mod: CFMod; reason: string }[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const typeMap: Record<string, "mods" | "resourcepacks" | "shaders"> = {
      mod: "mods",
      resourcepack: "resourcepacks",
      shader: "shaders",
    };
    const searchType = typeMap[contentType] || "mods";

    if (installedCategoryIds.length === 0) {
      // No categories - return popular instead
      // Pass contentType to getPopularMods if possible, but getPopularMods calls searchMods which supports it
      const result = await this.searchMods({
        gameVersion,
        modLoader,
        pageSize: 50,
        sortField: 2, // Popularity
        sortOrder: "desc",
        contentType: searchType, // Pass plural content type
      });

      const popular = result.mods;
      let candidates = popular.filter((m) => !excludeModIds.includes(m.id));

      if (randomize) {
        // Shuffle candidates
        candidates = candidates.sort(() => Math.random() - 0.5);
      }

      return candidates.slice(0, limit).map((mod) => ({
        mod,
        reason: randomize
          ? "Random discovery"
          : `Popular ${
              contentType === "mod"
                ? "Mod"
                : contentType === "resourcepack"
                ? "Resource Pack"
                : "Shader"
            }`,
      }));
    }

    // Count category frequency
    const catCounts = new Map<number, number>();
    for (const catId of installedCategoryIds) {
      catCounts.set(catId, (catCounts.get(catId) || 0) + 1);
    }

    // Get top 5 most common categories (increased from 3)
    const topCategories = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([catId]) => catId);

    // If randomize, shuffle the categories order slightly to vary what we look for first
    if (randomize) {
      topCategories.sort(() => Math.random() - 0.5);
    }

    const recommendations: { mod: CFMod; reason: string }[] = [];
    const seenIds = new Set(excludeModIds);

    // We want to fetch more than we need so we can shuffle the results
    const perCategoryLimit = randomize ? 10 : 5;

    // Search for mods in each top category
    for (const categoryId of topCategories) {
      if (recommendations.length >= limit * 2) break; // Fetch extra to shuffle later

      try {
        const result = await this.searchMods({
          gameVersion,
          modLoader,
          categoryId,
          pageSize: 20, // Fetch more
          sortField: randomize ? undefined : 2,
          sortOrder: "desc",
          contentType: searchType, // Pass plural content type
        });

        const categoryName =
          result.mods[0]?.categories.find((c) => c.id === categoryId)?.name ||
          "Related";

        // Shuffle the results for this category if randomized
        let modsToAdd = result.mods;
        if (randomize) {
          modsToAdd = modsToAdd.sort(() => Math.random() - 0.5);
        }

        let addedForCat = 0;
        for (const mod of modsToAdd) {
          if (!seenIds.has(mod.id) && addedForCat < perCategoryLimit) {
            seenIds.add(mod.id);
            recommendations.push({
              mod,
              reason: `Popular in ${categoryName}`,
            });
            addedForCat++;
          }
        }
      } catch (err) {
        console.warn(
          `[CurseForge] Failed to get recommendations for category ${categoryId}:`,
          err
        );
      }
    }

    // Final shuffle and slice
    if (randomize) {
      recommendations.sort(() => Math.random() - 0.5);
    }

    return recommendations.slice(0, limit);
  }
}
