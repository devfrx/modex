import * as fs from "fs-extra";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// ==================== TYPES ====================

export interface CFMod {
  id: number;
  gameId: number;
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

// ==================== SERVICE ====================

export class CurseForgeService {
  private apiKey: string = "";
  private readonly apiUrl = "https://api.curseforge.com/v1";
  private readonly MINECRAFT_GAME_ID = 432;
  private readonly MODS_CLASS_ID = 6; // Mods category

  constructor(private configPath: string) {
    this.loadConfig();
  }

  private async loadConfig() {
    const configFile = path.join(this.configPath, "update-config.json");
    if (await fs.pathExists(configFile)) {
      const config = await fs.readJson(configFile);
      this.apiKey = config.curseforgeApiKey || "";
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    const configFile = path.join(this.configPath, "update-config.json");
    let config: any = {};

    if (await fs.pathExists(configFile)) {
      config = await fs.readJson(configFile);
    }

    config.curseforgeApiKey = apiKey;
    await fs.writeJson(configFile, config, { spaces: 2 });
  }

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  // ==================== SEARCH ====================

  /**
   * Search mods on CurseForge
   */
  async searchMods(options: {
    query?: string;
    gameVersion?: string;
    modLoader?: string;
    categoryId?: number;
    pageSize?: number;
    index?: number;
    sortField?: number; // 1=featured, 2=popularity, 3=lastUpdated, 4=name, 5=author, 6=totalDownloads
    sortOrder?: "asc" | "desc";
  }): Promise<CFSearchResult> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const params = new URLSearchParams({
      gameId: this.MINECRAFT_GAME_ID.toString(),
      classId: this.MODS_CLASS_ID.toString(),
      pageSize: (options.pageSize || 20).toString(),
      index: (options.index || 0).toString(),
      sortField: (options.sortField || 2).toString(), // Default: popularity
      sortOrder: options.sortOrder || "desc",
    });

    if (options.query) {
      params.append("searchFilter", options.query);
    }

    if (options.gameVersion) {
      params.append("gameVersion", options.gameVersion);
    }

    if (options.modLoader) {
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

  /**
   * Get a single mod by ID
   */
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

  /**
   * Get files for a mod
   */
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

  /**
   * Get a specific file
   */
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

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(modId: number, fileId: number): Promise<string | null> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const response = await fetch(
      `${this.apiUrl}/mods/${modId}/files/${fileId}/download-url`,
      {
        headers: {
          "x-api-key": this.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      // Some mods don't allow direct download, try to construct URL
      const file = await this.getFile(modId, fileId);
      if (file?.downloadUrl) {
        return file.downloadUrl;
      }
      return null;
    }

    const data = await response.json();
    return data.data || null;
  }

  // ==================== DOWNLOAD ====================

  /**
   * Download a mod file to a destination
   */
  async downloadFile(
    modId: number,
    fileId: number,
    destPath: string,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; filePath: string; error?: string }> {
    try {
      const downloadUrl = await this.getDownloadUrl(modId, fileId);

      if (!downloadUrl) {
        return {
          success: false,
          filePath: "",
          error: "Could not get download URL. Mod author may have disabled direct downloads.",
        };
      }

      // Get file info for filename
      const file = await this.getFile(modId, fileId);
      if (!file) {
        return { success: false, filePath: "", error: "File not found" };
      }

      const filePath = path.join(destPath, file.fileName);

      // Ensure directory exists
      await fs.ensureDir(destPath);

      // Download file
      await this.downloadFromUrl(downloadUrl, filePath, onProgress);

      return { success: true, filePath };
    } catch (err) {
      return {
        success: false,
        filePath: "",
        error: (err as Error).message,
      };
    }
  }

  /**
   * Download file from URL
   */
  private downloadFromUrl(
    url: string,
    destPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;

      const request = protocol.get(url, (response) => {
        // Handle redirects
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          this.downloadFromUrl(response.headers.location, destPath, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(
          response.headers["content-length"] || "0",
          10
        );
        let downloadedSize = 0;

        const file = fs.createWriteStream(destPath);

        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (onProgress && totalSize > 0) {
            onProgress(Math.round((downloadedSize / totalSize) * 100));
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });

        file.on("error", (err) => {
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });
      });

      request.on("error", reject);
    });
  }

  // ==================== HELPERS ====================

  /**
   * Get the best file for a mod given version and loader
   */
  async getBestFile(
    modId: number,
    gameVersion: string,
    modLoader: string
  ): Promise<CFFile | null> {
    const files = await this.getModFiles(modId, {
      gameVersion,
      modLoader,
    });

    if (files.length === 0) {
      // Try without loader filter
      const allFiles = await this.getModFiles(modId, { gameVersion });
      if (allFiles.length > 0) {
        // Find one that matches the loader
        const loaderLower = modLoader.toLowerCase();
        const matching = allFiles.find((f) =>
          f.gameVersions.some((gv) => gv.toLowerCase() === loaderLower)
        );
        return matching || allFiles[0];
      }
      return null;
    }

    // Return the first (most recent) release file, or first file
    const releaseFile = files.find((f) => f.releaseType === 1);
    return releaseFile || files[0];
  }

  /**
   * Find a file that matches EXACTLY the given game version
   * Used when the manifest references a file with wrong version
   */
  async findFileForVersion(
    modId: number,
    gameVersion: string,
    modLoader: string
  ): Promise<{ id: number; fileName: string } | null> {
    try {
      console.log(`[CF findFile] Searching mod ${modId} for version ${gameVersion} + ${modLoader}`);
      
      // Get all files for this exact game version
      const files = await this.getModFiles(modId, {
        gameVersion: gameVersion,
        modLoader: modLoader,
        pageSize: 50,
      });
      
      console.log(`[CF findFile] Found ${files.length} files with version+loader filter`);

      // Find a file that has EXACTLY this game version
      for (const file of files) {
        const mcVersions = file.gameVersions.filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v));
        if (mcVersions.includes(gameVersion)) {
          // Prefer release files
          if (file.releaseType === 1) {
            console.log(`[CF findFile] Found release: ${file.fileName}`);
            return { id: file.id, fileName: file.fileName };
          }
        }
      }

      // If no release found, accept beta/alpha
      for (const file of files) {
        const mcVersions = file.gameVersions.filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v));
        if (mcVersions.includes(gameVersion)) {
          console.log(`[CF findFile] Found beta/alpha: ${file.fileName}`);
          return { id: file.id, fileName: file.fileName };
        }
      }

      // Try without loader filter as last resort
      console.log(`[CF findFile] Trying without loader filter...`);
      const allFiles = await this.getModFiles(modId, {
        gameVersion: gameVersion,
        pageSize: 100,
      });
      
      console.log(`[CF findFile] Found ${allFiles.length} files with version-only filter`);

      for (const file of allFiles) {
        const mcVersions = file.gameVersions.filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v));
        const loaders = file.gameVersions.map(v => v.toLowerCase());
        
        // Check if version matches exactly AND loader is compatible
        if (mcVersions.includes(gameVersion) && loaders.includes(modLoader.toLowerCase())) {
          console.log(`[CF findFile] Found with compatible loader: ${file.fileName}`);
          return { id: file.id, fileName: file.fileName };
        }
      }

      console.log(`[CF findFile] No file found for ${gameVersion}`);
      return null;
    } catch (error) {
      console.error(`[CF findFile] Error:`, error);
      return null;
    }
  }

  /**
   * Convert CF mod to our internal format
   * @param preferredLoader - The loader the user selected in search, to prioritize
   * @param targetGameVersion - The specific MC version to use (from modpack)
   */
  modToLibraryFormat(
    mod: CFMod,
    file: CFFile,
    preferredLoader?: string,
    targetGameVersion?: string
  ): {
    cf_project_id: number;
    cf_file_id: number;
    name: string;
    slug: string;
    filename: string;
    version: string;
    game_version: string;
    loader: string;
    description: string;
    author: string;
    thumbnail_url: string | null;
    download_count: number;
    file_size: number;
    release_type: "release" | "beta" | "alpha";
    date_released: string;
    dependencies: { modId: number; type: string }[];
  } {
    // Extract loader and game version from file
    let loader = "unknown";
    let game_version = "unknown";
    const foundLoaders: string[] = [];
    const foundVersions: string[] = [];

    for (const gv of file.gameVersions) {
      const lower = gv.toLowerCase();
      if (["forge", "fabric", "quilt", "neoforge"].includes(lower)) {
        foundLoaders.push(lower);
      } else if (/^1\.\d+(\.\d+)?$/.test(gv)) {
        foundVersions.push(gv);
      }
    }

    // Use target game version if specified and available, otherwise use the first found
    if (targetGameVersion && foundVersions.includes(targetGameVersion)) {
      game_version = targetGameVersion;
    } else if (foundVersions.length > 0) {
      game_version = foundVersions[0];
    }

    // Prioritize the preferred loader if specified and found
    if (preferredLoader && foundLoaders.includes(preferredLoader.toLowerCase())) {
      loader = preferredLoader.toLowerCase();
    } else if (foundLoaders.length > 0) {
      loader = foundLoaders[0];
    }

    // Extract version from display name or filename
    let version = file.displayName || file.fileName;
    // Try to extract version number
    const versionMatch = version.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) {
      version = versionMatch[1];
    }

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

    return {
      cf_project_id: mod.id,
      cf_file_id: file.id,
      name: mod.name,
      slug: mod.slug,
      filename: file.fileName,
      version,
      game_version,
      loader,
      description: mod.summary,
      author: mod.authors.map((a) => a.name).join(", "),
      thumbnail_url: mod.logo?.thumbnailUrl || null,
      download_count: mod.downloadCount,
      file_size: file.fileLength,
      release_type: releaseTypes[file.releaseType] || "release",
      date_released: file.fileDate,
      dependencies: file.dependencies.map((d) => ({
        modId: d.modId,
        type: dependencyTypes[d.relationType] || "unknown",
      })),
    };
  }

  /**
   * Get popular/featured mods
   */
  async getPopularMods(
    gameVersion?: string,
    modLoader?: string,
    pageSize: number = 20
  ): Promise<CFMod[]> {
    const result = await this.searchMods({
      gameVersion,
      modLoader,
      pageSize,
      sortField: 2, // Popularity
      sortOrder: "desc",
    });
    return result.mods;
  }

  /**
   * Get categories
   */
  async getCategories(): Promise<CFCategory[]> {
    if (!this.apiKey) {
      throw new Error("CurseForge API key not set");
    }

    const response = await fetch(
      `${this.apiUrl}/categories?gameId=${this.MINECRAFT_GAME_ID}&classId=${this.MODS_CLASS_ID}`,
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
}
