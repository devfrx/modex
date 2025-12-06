/**
 * MetadataManager - Pure JSON-based storage for metadata-only architecture
 *
 * Replaces FileSystemManager. No file downloads, no JAR scanning.
 * Stores mod references (CF/Modrinth IDs) and modpack definitions in JSON.
 *
 * Storage structure:
 *   userData/modex/
 *     config.json       <- API keys, settings
 *     library.json      <- All mods (metadata + source IDs)
 *     modpacks/
 *       {id}.json       <- Individual modpack files
 *     cache/            <- Thumbnail cache (optional)
 */

import { app } from "electron";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";

// ==================== TYPES ====================

export interface Mod {
  id: string;
  name: string;
  slug?: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  thumbnail_url?: string;
  download_count?: number;
  release_type?: "release" | "beta" | "alpha";
  date_released?: string;
  created_at: string;
  filename: string;
  source: "curseforge" | "modrinth";
  cf_project_id?: number;
  cf_file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
  tags?: string[];
  favorite?: boolean;
  dependencies?: { modId: number | string; type: string }[];
  // Additional metadata for better UX
  logo_url?: string; // Full size logo
  categories?: string[]; // Mod categories (e.g., "Technology", "Magic")
  file_size?: number; // File size in bytes
  date_created?: string; // Mod project creation date
  date_modified?: string; // Last mod update date
  website_url?: string; // Mod website/CurseForge page
  issues_url?: string; // Issue tracker URL
  source_url?: string; // Source code URL
  wiki_url?: string; // Wiki URL
}

export interface Modpack {
  id: string;
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at?: string;
  mod_count?: number;
  favorite?: boolean;
  share_code?: string;
  last_sync?: string;
  mod_ids: string[];
}

export interface CreateModpackData {
  name: string;
  version?: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
}

interface LibraryData {
  version: string;
  mods: Mod[];
}

interface AppConfig {
  curseforge_api_key?: string;
  modrinth_api_key?: string;
}

// ==================== VERSION CONTROL TYPES ====================

export interface ModpackChange {
  type: "add" | "remove" | "update";
  modId: string;
  modName: string;
  previousVersion?: string;
  newVersion?: string;
  previousFileId?: number;
  newFileId?: number;
}

export interface ModpackVersion {
  id: string;
  tag: string;
  message: string;
  created_at: string;
  author?: string;
  changes: ModpackChange[];
  mod_ids: string[];
  parent_id?: string;
  /** Snapshots of CF mods for rollback restoration */
  mod_snapshots?: Array<{
    id: string;
    name: string;
    cf_project_id: number;
    cf_file_id: number;
  }>;
}

export interface ModpackVersionHistory {
  modpack_id: string;
  current_version_id: string;
  versions: ModpackVersion[];
}

// ==================== MANAGER ====================

export class MetadataManager {
  private baseDir: string;
  private modpacksDir: string;
  private versionsDir: string;
  private cacheDir: string;
  private libraryPath: string;
  private configPath: string;
  
  // Storage for pending CF import conflicts
  private pendingCFConflicts: Map<string, { partialData: any; manifest: any }> = new Map();

  constructor() {
    this.baseDir = path.join(app.getPath("userData"), "modex");
    this.modpacksDir = path.join(this.baseDir, "modpacks");
    this.versionsDir = path.join(this.baseDir, "versions");
    this.cacheDir = path.join(this.baseDir, "cache");
    this.libraryPath = path.join(this.baseDir, "library.json");
    this.configPath = path.join(this.baseDir, "config.json");
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.baseDir);
    await fs.ensureDir(this.modpacksDir);
    await fs.ensureDir(this.versionsDir);
    await fs.ensureDir(this.cacheDir);
  }

  // ==================== CONFIG ====================

  async getConfig(): Promise<AppConfig> {
    try {
      if (await fs.pathExists(this.configPath)) {
        return await fs.readJson(this.configPath);
      }
    } catch (error) {
      console.error("Failed to read config:", error);
    }
    return {};
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await fs.writeJson(this.configPath, config, { spaces: 2 });
  }

  async getApiKey(source: "curseforge" | "modrinth"): Promise<string> {
    const config = await this.getConfig();
    return source === "curseforge"
      ? config.curseforge_api_key || ""
      : config.modrinth_api_key || "";
  }

  async setApiKey(
    source: "curseforge" | "modrinth",
    apiKey: string
  ): Promise<void> {
    const config = await this.getConfig();
    if (source === "curseforge") {
      config.curseforge_api_key = apiKey;
    } else {
      config.modrinth_api_key = apiKey;
    }
    await this.saveConfig(config);
  }

  // ==================== PENDING CF CONFLICTS ====================
  
  storePendingCFConflicts(modpackId: string, partialData: any, manifest: any): void {
    console.log(`[MetadataManager] Storing pending CF conflicts for modpack ${modpackId}`);
    this.pendingCFConflicts.set(modpackId, { partialData, manifest });
  }

  getPendingCFConflicts(modpackId: string): { partialData: any; manifest: any } | undefined {
    return this.pendingCFConflicts.get(modpackId);
  }

  clearPendingCFConflicts(modpackId: string): void {
    this.pendingCFConflicts.delete(modpackId);
  }

  // ==================== LIBRARY (MODS) ====================

  private async loadLibrary(): Promise<LibraryData> {
    try {
      if (await fs.pathExists(this.libraryPath)) {
        return await fs.readJson(this.libraryPath);
      }
    } catch (error) {
      console.error("Failed to load library:", error);
    }
    return { version: "2.0", mods: [] };
  }

  private async saveLibrary(data: LibraryData): Promise<void> {
    await fs.writeJson(this.libraryPath, data, { spaces: 2 });
  }

  async getAllMods(): Promise<Mod[]> {
    const library = await this.loadLibrary();
    return library.mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModById(id: string): Promise<Mod | undefined> {
    const library = await this.loadLibrary();
    return library.mods.find((m) => m.id === id);
  }

  async findModByCFIds(projectId: number, fileId: number): Promise<Mod | undefined> {
    const library = await this.loadLibrary();
    const id = `cf-${projectId}-${fileId}`;
    return library.mods.find((m) => m.id === id);
  }

  async findModByMRIds(projectId: string, versionId: string): Promise<Mod | undefined> {
    const library = await this.loadLibrary();
    const id = `mr-${projectId}-${versionId}`;
    return library.mods.find((m) => m.id === id);
  }

  async addMod(modData: Omit<Mod, "id" | "created_at">): Promise<Mod> {
    const library = await this.loadLibrary();

    // Generate ID based on source
    let id: string;
    if (
      modData.source === "curseforge" &&
      modData.cf_project_id &&
      modData.cf_file_id
    ) {
      id = `cf-${modData.cf_project_id}-${modData.cf_file_id}`;
    } else if (
      modData.source === "modrinth" &&
      modData.mr_project_id &&
      modData.mr_version_id
    ) {
      id = `mr-${modData.mr_project_id}-${modData.mr_version_id}`;
    } else {
      id = `unknown-${crypto.randomUUID()}`;
    }

    // Check if already exists - return existing mod without modifying it
    const existingIndex = library.mods.findIndex((m) => m.id === id);
    if (existingIndex >= 0) {
      console.log(`[MetadataManager] Mod ${id} already exists in library, reusing existing`);
      return library.mods[existingIndex];
    }

    // Create new mod
    const mod: Mod = {
      ...modData,
      id,
      created_at: new Date().toISOString(),
    };

    library.mods.push(mod);
    await this.saveLibrary(library);
    console.log(`[MetadataManager] Added new mod ${id} to library`);
    return mod;
  }

  async updateMod(id: string, updates: Partial<Mod>): Promise<boolean> {
    const library = await this.loadLibrary();
    const index = library.mods.findIndex((m) => m.id === id);

    if (index < 0) return false;

    // Don't allow changing id
    delete updates.id;

    library.mods[index] = { ...library.mods[index], ...updates };
    await this.saveLibrary(library);
    return true;
  }

  async deleteMod(id: string): Promise<boolean> {
    const library = await this.loadLibrary();
    const initialLength = library.mods.length;
    library.mods = library.mods.filter((m) => m.id !== id);

    if (library.mods.length === initialLength) return false;

    await this.saveLibrary(library);

    // Also remove from all modpacks
    const modpacks = await this.getAllModpacks();
    for (const modpack of modpacks) {
      if (modpack.mod_ids.includes(id)) {
        await this.removeModFromModpack(modpack.id, id);
      }
    }

    return true;
  }

  async deleteMods(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.deleteMod(id)) deleted++;
    }
    return deleted;
  }

  // ==================== MODPACKS ====================

  private getModpackPath(id: string): string {
    return path.join(this.modpacksDir, `${id}.json`);
  }

  private sanitizeId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
  }

  async getAllModpacks(): Promise<Modpack[]> {
    await this.ensureDirectories();
    const modpacks: Modpack[] = [];

    try {
      const files = await fs.readdir(this.modpacksDir);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const modpackPath = path.join(this.modpacksDir, file);
          const modpack = await fs.readJson(modpackPath);
          modpack.mod_count = modpack.mod_ids?.length || 0;
          modpacks.push(modpack);
        } catch (error) {
          console.error(`Failed to read modpack ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Failed to list modpacks:", error);
    }

    return modpacks.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModpackById(id: string): Promise<Modpack | undefined> {
    const modpackPath = this.getModpackPath(id);

    try {
      if (await fs.pathExists(modpackPath)) {
        const modpack = await fs.readJson(modpackPath);
        modpack.mod_count = modpack.mod_ids?.length || 0;
        return modpack;
      }
    } catch (error) {
      console.error(`Failed to read modpack ${id}:`, error);
    }

    return undefined;
  }

  async createModpack(data: CreateModpackData): Promise<string> {
    // Validate name
    const trimmedName = (data.name || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error("Modpack name must be at least 2 characters");
    }

    // Generate unique ID
    let id = this.sanitizeId(trimmedName);
    if (!id) {
      id = `modpack-${Date.now()}`;
    }

    let counter = 1;
    while (await fs.pathExists(this.getModpackPath(id))) {
      id = `${this.sanitizeId(trimmedName)}-${counter}`;
      counter++;
    }

    const modpack: Modpack = {
      id,
      name: data.name,
      version: data.version || "1.0.0",
      minecraft_version: data.minecraft_version,
      loader: data.loader,
      description: data.description,
      created_at: new Date().toISOString(),
      mod_ids: [],
    };

    await fs.writeJson(this.getModpackPath(id), modpack, { spaces: 2 });
    return id;
  }

  async updateModpack(id: string, updates: Partial<Modpack>): Promise<boolean> {
    const modpack = await this.getModpackById(id);
    if (!modpack) return false;

    // Don't allow changing id
    delete updates.id;
    delete updates.mod_count; // Computed field

    const updated: Modpack = {
      ...modpack,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await fs.writeJson(this.getModpackPath(id), updated, { spaces: 2 });
    return true;
  }

  async deleteModpack(id: string): Promise<boolean> {
    const modpackPath = this.getModpackPath(id);

    if (!(await fs.pathExists(modpackPath))) return false;

    try {
      await fs.remove(modpackPath);
      // Also delete version history
      await this.deleteVersionHistory(id);
      return true;
    } catch (error) {
      console.error(`Failed to delete modpack ${id}:`, error);
      return false;
    }
  }

  async cloneModpack(id: string, newName: string): Promise<string | null> {
    const original = await this.getModpackById(id);
    if (!original) return null;

    const newId = await this.createModpack({
      name: newName,
      version: original.version,
      minecraft_version: original.minecraft_version,
      loader: original.loader,
      description: original.description,
    });

    // Copy mod_ids
    const newModpack = await this.getModpackById(newId);
    if (newModpack) {
      newModpack.mod_ids = [...original.mod_ids];
      newModpack.image_url = original.image_url;
      await fs.writeJson(this.getModpackPath(newId), newModpack, { spaces: 2 });
    }

    return newId;
  }

  // ==================== MODPACK-MOD RELATIONS ====================

  async getModsInModpack(modpackId: string): Promise<Mod[]> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return [];

    const library = await this.loadLibrary();
    const modIds = new Set(modpack.mod_ids);

    return library.mods
      .filter((m) => modIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async addModToModpack(modpackId: string, modId: string): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    // Check mod exists
    const mod = await this.getModById(modId);
    if (!mod) return false;

    // Already in modpack?
    if (modpack.mod_ids.includes(modId)) return true;

    modpack.mod_ids.push(modId);
    modpack.updated_at = new Date().toISOString();

    await fs.writeJson(this.getModpackPath(modpackId), modpack, { spaces: 2 });
    return true;
  }

  async removeModFromModpack(
    modpackId: string,
    modId: string
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const initialLength = modpack.mod_ids.length;
    modpack.mod_ids = modpack.mod_ids.filter((id) => id !== modId);

    if (modpack.mod_ids.length === initialLength) return false;

    modpack.updated_at = new Date().toISOString();
    await fs.writeJson(this.getModpackPath(modpackId), modpack, { spaces: 2 });
    return true;
  }

  // ==================== VERSION CONTROL ====================

  private getVersionHistoryPath(modpackId: string): string {
    return path.join(this.versionsDir, `${modpackId}.json`);
  }

  /**
   * Get version history for a modpack
   */
  async getVersionHistory(modpackId: string): Promise<ModpackVersionHistory | null> {
    const historyPath = this.getVersionHistoryPath(modpackId);
    
    try {
      if (await fs.pathExists(historyPath)) {
        return await fs.readJson(historyPath);
      }
    } catch (error) {
      console.error(`Failed to read version history for ${modpackId}:`, error);
    }
    
    return null;
  }

  /**
   * Save version history for a modpack
   */
  private async saveVersionHistory(history: ModpackVersionHistory): Promise<void> {
    const historyPath = this.getVersionHistoryPath(history.modpack_id);
    await fs.writeJson(historyPath, history, { spaces: 2 });
  }

  /**
   * Initialize version control for a modpack (create first version)
   */
  async initializeVersionControl(modpackId: string, message: string = "Initial version"): Promise<ModpackVersion | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    // Check if already initialized
    const existing = await this.getVersionHistory(modpackId);
    if (existing && existing.versions.length > 0) {
      console.log(`Version control already initialized for ${modpackId}`);
      return existing.versions[existing.versions.length - 1];
    }

    const versionId = `v1`;
    const version: ModpackVersion = {
      id: versionId,
      tag: modpack.version || "1.0.0",
      message,
      created_at: new Date().toISOString(),
      changes: [],
      mod_ids: [...modpack.mod_ids],
    };

    const history: ModpackVersionHistory = {
      modpack_id: modpackId,
      current_version_id: versionId,
      versions: [version],
    };

    await this.saveVersionHistory(history);
    return version;
  }

  /**
   * Create a new version (commit) for a modpack
   */
  async createVersion(
    modpackId: string, 
    message: string, 
    tag?: string
  ): Promise<ModpackVersion | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    let history = await this.getVersionHistory(modpackId);
    
    // Auto-initialize if no history exists
    if (!history) {
      const initialVersion = await this.initializeVersionControl(modpackId, "Initial version");
      if (!initialVersion) return null;
      history = await this.getVersionHistory(modpackId);
      if (!history) return null;
    }

    const currentVersion = history.versions.find(v => v.id === history!.current_version_id);
    if (!currentVersion) return null;

    // Calculate changes from current version
    const changes = this.calculateChanges(currentVersion.mod_ids, modpack.mod_ids, await this.loadLibrary());

    // If no changes, don't create a new version
    if (changes.length === 0) {
      console.log(`No changes detected for modpack ${modpackId}`);
      return currentVersion;
    }

    // Generate next version ID
    const nextVersionNumber = history.versions.length + 1;
    const versionId = `v${nextVersionNumber}`;
    
    // Generate tag if not provided
    const versionTag = tag || this.generateNextTag(currentVersion.tag);

    // Create snapshots of CF mods for potential rollback restoration
    const library = await this.loadLibrary();
    const modSnapshots = modpack.mod_ids
      .map(modId => {
        const mod = library.mods.find(m => m.id === modId);
        if (mod && mod.source === 'curseforge' && mod.cf_project_id && mod.cf_file_id) {
          return {
            id: mod.id,
            name: mod.name,
            cf_project_id: mod.cf_project_id,
            cf_file_id: mod.cf_file_id,
          };
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const newVersion: ModpackVersion = {
      id: versionId,
      tag: versionTag,
      message,
      created_at: new Date().toISOString(),
      changes,
      mod_ids: [...modpack.mod_ids],
      parent_id: currentVersion.id,
      mod_snapshots: modSnapshots,
    };

    history.versions.push(newVersion);
    history.current_version_id = versionId;

    await this.saveVersionHistory(history);
    
    // Update modpack version to match
    await this.updateModpack(modpackId, { version: versionTag });

    return newVersion;
  }

  /**
   * Calculate changes between two mod_ids arrays
   */
  private calculateChanges(
    oldModIds: string[], 
    newModIds: string[], 
    library: LibraryData
  ): ModpackChange[] {
    const changes: ModpackChange[] = [];
    const oldSet = new Set(oldModIds);
    const newSet = new Set(newModIds);
    const modMap = new Map(library.mods.map(m => [m.id, m]));

    // Find removed mods
    for (const modId of oldModIds) {
      if (!newSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "remove",
          modId,
          modName: mod?.name || modId,
          previousVersion: mod?.version,
        });
      }
    }

    // Find added mods
    for (const modId of newModIds) {
      if (!oldSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "add",
          modId,
          modName: mod?.name || modId,
          newVersion: mod?.version,
        });
      }
    }

    // Note: Updates are detected when mod IDs change (because file ID is part of the ID)
    // We could also track same-project updates by comparing cf_project_id

    return changes;
  }

  /**
   * Generate the next semantic version tag
   */
  private generateNextTag(currentTag: string): string {
    const parts = currentTag.split(".");
    if (parts.length === 3) {
      const patch = parseInt(parts[2], 10) || 0;
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
    return `${currentTag}.1`;
  }

  /**
   * Rollback modpack to a specific version
   */
  async rollbackToVersion(modpackId: string, versionId: string): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const history = await this.getVersionHistory(modpackId);
    if (!history) return false;

    const targetVersion = history.versions.find(v => v.id === versionId);
    if (!targetVersion) return false;

    // Update modpack with the version's mod_ids
    modpack.mod_ids = [...targetVersion.mod_ids];
    modpack.version = targetVersion.tag;
    modpack.updated_at = new Date().toISOString();
    
    await fs.writeJson(this.getModpackPath(modpackId), modpack, { spaces: 2 });

    // Create a rollback commit
    const rollbackVersion = await this.createVersion(
      modpackId, 
      `Rollback to ${targetVersion.tag}`,
      `${targetVersion.tag}-rollback`
    );

    return rollbackVersion !== null;
  }

  /**
   * Get version by ID
   */
  async getVersion(modpackId: string, versionId: string): Promise<ModpackVersion | null> {
    const history = await this.getVersionHistory(modpackId);
    if (!history) return null;
    
    return history.versions.find(v => v.id === versionId) || null;
  }

  /**
   * Compare two versions and return the diff
   */
  async compareVersions(
    modpackId: string, 
    fromVersionId: string, 
    toVersionId: string
  ): Promise<ModpackChange[] | null> {
    const history = await this.getVersionHistory(modpackId);
    if (!history) return null;

    const fromVersion = history.versions.find(v => v.id === fromVersionId);
    const toVersion = history.versions.find(v => v.id === toVersionId);
    
    if (!fromVersion || !toVersion) return null;

    const library = await this.loadLibrary();
    return this.calculateChanges(fromVersion.mod_ids, toVersion.mod_ids, library);
  }

  /**
   * Delete version history when modpack is deleted
   */
  async deleteVersionHistory(modpackId: string): Promise<void> {
    const historyPath = this.getVersionHistoryPath(modpackId);
    try {
      if (await fs.pathExists(historyPath)) {
        await fs.remove(historyPath);
      }
    } catch (error) {
      console.error(`Failed to delete version history for ${modpackId}:`, error);
    }
  }

  // ==================== EXPORT ====================

  /**
   * Generate CurseForge manifest for a modpack
   */
  async exportToCurseForge(modpackId: string): Promise<{
    manifest: any;
    modpack: Modpack;
    mods: Mod[];
    modlist: string;
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const mods = await this.getModsInModpack(modpackId);

    // Filter to CF mods only
    const cfMods = mods.filter(
      (m) => m.source === "curseforge" && m.cf_project_id && m.cf_file_id
    );

    const manifest = {
      minecraft: {
        version: modpack.minecraft_version || "1.20.1",
        modLoaders: [
          {
            id: `${modpack.loader || "forge"}-0.0.0`,
            primary: true,
          },
        ],
      },
      manifestType: "minecraftModpack",
      manifestVersion: 1,
      name: modpack.name,
      version: modpack.version,
      author: "ModEx User",
      files: cfMods.map((m) => ({
        projectID: m.cf_project_id!,
        fileID: m.cf_file_id!,
        required: true,
      })),
      overrides: "overrides",
    };

    // Generate modlist.html
    const modlist = this.generateModlistHtml(cfMods);

    return { manifest, modpack, mods: cfMods, modlist };
  }

  /**
   * Generate modlist.html for CurseForge export
   */
  private generateModlistHtml(mods: Mod[]): string {
    const sortedMods = [...mods].sort((a, b) => a.name.localeCompare(b.name));
    
    const modLinks = sortedMods
      .map((mod) => {
        const url = mod.website_url || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug || mod.cf_project_id}`;
        const author = mod.author || "Unknown";
        return `<li><a href="${url}">${mod.name} (by ${author})</a></li>`;
      })
      .join('\n');

    return `<ul>
${modLinks}
</ul>`;
  }

  /**
   * Generate MODEX manifest for a modpack
   */
  async exportToModex(modpackId: string): Promise<{
    manifest: any;
    code: string;
    checksum: string;
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const mods = await this.getModsInModpack(modpackId);

    // Generate or reuse share code
    const code = modpack.share_code || this.generateShareCode();

    // Update modpack with share code if new
    if (!modpack.share_code) {
      await this.updateModpack(modpackId, { share_code: code });
    }

    // Generate checksum from mod IDs
    const modIds = mods
      .map((m) => m.id)
      .sort()
      .join("");
    const checksum = crypto
      .createHash("sha256")
      .update(modIds)
      .digest("hex")
      .substring(0, 16);

    // Get version history if available
    const versionHistory = await this.getVersionHistory(modpackId);

    const manifest = {
      modex_version: "2.0",
      share_code: code,
      checksum,
      exported_at: new Date().toISOString(),
      modpack: {
        name: modpack.name,
        version: modpack.version,
        minecraft_version: modpack.minecraft_version,
        loader: modpack.loader,
        description: modpack.description,
      },
      mods: mods.map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        filename: m.filename,
        source: m.source,
        cf_project_id: m.cf_project_id,
        cf_file_id: m.cf_file_id,
        mr_project_id: m.mr_project_id,
        mr_version_id: m.mr_version_id,
        description: m.description,
        author: m.author,
        thumbnail_url: m.thumbnail_url,
      })),
      stats: {
        mod_count: mods.length,
      },
      // Include version history if available
      version_history: versionHistory || undefined,
    };

    return { manifest, code, checksum };
  }

  private generateShareCode(): string {
    const uuid = crypto.randomUUID();
    const hash = crypto
      .createHash("sha256")
      .update(uuid)
      .digest("hex")
      .substring(0, 8)
      .toUpperCase();
    return `MDX-${hash}`;
  }

  // ==================== IMPORT ====================

  /**
   * Import mods from CurseForge manifest
   * Returns created modpack ID and import stats
   */
  async importFromCurseForge(
    manifest: any,
    cfService: any,
    onProgress?: (current: number, total: number, modName: string) => void
  ): Promise<{
    modpackId: string;
    modsImported: number;
    modsSkipped: number;
    errors: string[];
  }> {
    // Extract loader from modLoaders
    let loader = "unknown";
    const primaryLoader = manifest.minecraft?.modLoaders?.find(
      (l: any) => l.primary
    );
    if (primaryLoader) {
      const match = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
      if (match) loader = match[1].toLowerCase();
    }

    const mcVersion = manifest.minecraft?.version || "1.20.1";

    // Create modpack
    const modpackId = await this.createModpack({
      name: manifest.name || "Imported Modpack",
      version: manifest.version || "1.0.0",
      minecraft_version: mcVersion,
      loader,
      description: `Imported from CurseForge. Author: ${
        manifest.author || "Unknown"
      }`,
    });

    const errors: string[] = [];
    const newModIds: string[] = [];
    const addedModNames: string[] = [];
    const conflicts: Array<{
      projectID: number;
      fileID: number;
      modName: string;
      existingMod: Mod;
      cfMod: any;
      cfFile: any;
    }> = [];

    const totalFiles = manifest.files?.length || 0;
    let processedCount = 0;

    // Process each file entry
    for (const file of manifest.files || []) {
      const { projectID, fileID } = file;
      processedCount++;

      try {
        console.log(`[CF Import] Processing mod: Project ${projectID}, File ${fileID}`);
        
        // Get mod info from CF API
        const cfMod = await cfService.getMod(projectID);
        if (!cfMod) {
          onProgress?.(processedCount, totalFiles, `Mod ${projectID} not found`);
          errors.push(`Mod ${projectID} not found`);
          continue;
        }
        
        // Send progress update
        onProgress?.(processedCount, totalFiles, cfMod.name);

        const cfFile = await cfService.getFile(projectID, fileID);
        if (!cfFile) {
          errors.push(`File ${fileID} not found for ${cfMod.name}`);
          continue;
        }

        // Check if mod already exists in library
        const allMods = await this.getAllMods();
        const existingMod = allMods.find(m => 
          m.source === 'curseforge' && 
          m.cf_project_id === projectID && 
          m.cf_file_id === fileID
        ) || null;

        if (existingMod) {
          console.log(`[CF Import] Found exact match: ${existingMod.name}`);
          newModIds.push(existingMod.id);
          continue;
        }

        // Check for version conflict
        const conflictingMod = allMods.find(m => 
          m.source === 'curseforge' && 
          m.cf_project_id === projectID && 
          m.cf_file_id !== fileID
        ) || null;

        if (conflictingMod) {
          console.log(`[CF Import] Version conflict detected: ${conflictingMod.name} (existing file: ${conflictingMod.cf_file_id} vs new file: ${fileID})`);
          conflicts.push({
            projectID,
            fileID,
            modName: cfMod.name,
            existingMod: conflictingMod,
            cfMod,
            cfFile
          });
          continue;
        }

        // New mod - use modToLibraryFormat for consistent metadata
        console.log(`[CF Import] Adding new mod: ${cfMod.name}`);
        const formattedMod = cfService.modToLibraryFormat(
          cfMod,
          cfFile,
          loader,
          mcVersion
        );

        const mod = await this.addMod({
          name: formattedMod.name,
          slug: formattedMod.slug,
          version: formattedMod.version,
          game_version: formattedMod.game_version,
          loader: formattedMod.loader,
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
          date_created: formattedMod.date_created,
          date_modified: formattedMod.date_modified,
          website_url: formattedMod.website_url,
        });

        newModIds.push(mod.id);
        addedModNames.push(mod.name);
      } catch (error: any) {
        console.error(`[CF Import] Error processing ${projectID}:`, error);
        errors.push(`Error processing ${projectID}: ${error.message}`);
      }
    }

    // If there are conflicts, throw an error with conflict data
    if (conflicts.length > 0) {
      console.log(`[CF Import] ${conflicts.length} version conflicts detected, throwing error`);
      const error: any = new Error('Version conflicts detected');
      error.code = 'VERSION_CONFLICTS';
      error.conflicts = conflicts;
      error.partialData = { 
        modpackId, 
        newModIds, 
        addedModNames
      };
      error.manifest = manifest;
      throw error;
    }

    // Add all mods to modpack
    for (const modId of newModIds) {
      await this.addModToModpack(modpackId, modId);
    }

    return { 
      modpackId, 
      modsImported: addedModNames.length, 
      modsSkipped: errors.length, 
      errors 
    };
  }

  /**
   * Import MODEX manifest
   */
  async importFromModex(
    manifest: any, 
    cfService: any,
    onProgress?: (current: number, total: number, modName: string) => void
  ): Promise<{
    modpackId: string;
    code: string;
    isUpdate: boolean;
    changes?: { 
      added: number; 
      removed: number; 
      unchanged: number;
      addedMods: string[];
      removedMods: string[];
    };
  }> {
    if (!manifest.modex_version || !manifest.share_code) {
      throw new Error("Invalid MODEX manifest");
    }

    // Check for existing modpack with same share code
    const existingModpack = await this.findModpackByShareCode(
      manifest.share_code
    );
    const isUpdate = !!existingModpack;

    let modpackId: string;
    let oldModIds: string[] = [];

    if (isUpdate && existingModpack) {
      modpackId = existingModpack.id;
      oldModIds = [...existingModpack.mod_ids];

      // Update modpack metadata
      await this.updateModpack(modpackId, {
        name: manifest.modpack.name,
        version: manifest.modpack.version,
        minecraft_version: manifest.modpack.minecraft_version,
        loader: manifest.modpack.loader,
        description: manifest.modpack.description,
        last_sync: new Date().toISOString(),
      });
    } else {
      modpackId = await this.createModpack({
        name: manifest.modpack.name,
        version: manifest.modpack.version,
        minecraft_version: manifest.modpack.minecraft_version,
        loader: manifest.modpack.loader,
        description: manifest.modpack.description,
      });

      // Set share code
      await this.updateModpack(modpackId, {
        share_code: manifest.share_code,
        last_sync: new Date().toISOString(),
      });
    }

    // Add mods from manifest
    const newModIds: string[] = [];
    const addedModNames: string[] = []; // Mod aggiunte al pack (nuove o già in libreria)
    const downloadedModNames: string[] = []; // Mod scaricate in libreria (non le avevo)
    const updatedModNames: string[] = []; // Mod aggiornate (stessa mod, versione diversa)

    const totalMods = manifest.mods?.length || 0;
    let processedCount = 0;

    for (const modEntry of manifest.mods || []) {
      processedCount++;
      
      // Send progress update
      onProgress?.(processedCount, totalMods, modEntry.name || `Mod ${processedCount}`);
      
      // Check if mod already exists in library by CF/MR ID, not by internal ID
      let existingMod: Mod | null = null;
      let conflictingMod: Mod | null = null;
      
      if (modEntry.source === 'curseforge' && modEntry.cf_project_id && modEntry.cf_file_id) {
        const allMods = await this.getAllMods();
        
        console.log(`[Import] Checking mod: ${modEntry.name} (Project: ${modEntry.cf_project_id}, File: ${modEntry.cf_file_id})`);
        
        // Exact match (same project ID and file ID)
        existingMod = allMods.find(m => 
          m.source === 'curseforge' && 
          m.cf_project_id === modEntry.cf_project_id && 
          m.cf_file_id === modEntry.cf_file_id
        ) || null;
        
        if (existingMod) {
          console.log(`[Import] Found exact match: ${existingMod.name}`);
        }
        
        // Check for same project but different file (version conflict)
        if (!existingMod) {
          conflictingMod = allMods.find(m => 
            m.source === 'curseforge' && 
            m.cf_project_id === modEntry.cf_project_id && 
            m.cf_file_id !== modEntry.cf_file_id
          ) || null;
          
          if (conflictingMod) {
            console.log(`[Import] Version conflict detected: ${conflictingMod.name} (existing file: ${conflictingMod.cf_file_id} vs new file: ${modEntry.cf_file_id})`);
          }
        }
      } else if (modEntry.source === 'modrinth' && modEntry.mr_version_id) {
        const allMods = await this.getAllMods();
        existingMod = allMods.find(m => 
          m.source === 'modrinth' && 
          m.mr_version_id === modEntry.mr_version_id
        ) || null;
        
        // Check for same project but different version
        if (!existingMod) {
          conflictingMod = allMods.find(m => 
            m.source === 'modrinth' && 
            m.mr_project_id === modEntry.mr_project_id && 
            m.mr_version_id !== modEntry.mr_version_id
          ) || null;
        }
      }

      if (existingMod) {
        // Exact match - reuse existing mod
        console.log(`[Import] Reusing existing mod from library: ${existingMod.name}`);
        newModIds.push(existingMod.id);
        
        // Check if this mod is being added to the pack (was not in old pack)
        if (isUpdate && !oldModIds.includes(existingMod.id)) {
          addedModNames.push(existingMod.name);
          console.log(`[Import] Mod added to pack (reused): ${existingMod.name}`);
        }
        // Don't add to downloadedModNames - it was already in library
      } else if (conflictingMod) {
        // Version conflict - automatically update to new version for .modex imports
        console.log(`[Import] Auto-updating mod: ${conflictingMod.name} (${conflictingMod.version} -> ${modEntry.version})`);
        updatedModNames.push(`${conflictingMod.name} (${conflictingMod.version} → ${modEntry.version})`);
        
        // Remove old version if it's not used in other modpacks
        const allModpacks = await this.getAllModpacks();
        const isUsedElsewhere = allModpacks.some(mp => 
          mp.id !== modpackId && mp.mod_ids.includes(conflictingMod!.id)
        );
        
        if (!isUsedElsewhere) {
          await this.deleteMod(conflictingMod.id);
          console.log(`[Import] Removed old version from library: ${conflictingMod.name}`);
        }
        
        // Add new version - will be handled by the fetch logic below
        conflictingMod = null; // Clear to trigger fetch
      }
      
      if (!existingMod && !conflictingMod) {
        // New mod - fetch from CurseForge API for complete metadata
        console.log(`[Import] Fetching mod from CurseForge: ${modEntry.name} (${modEntry.cf_project_id}/${modEntry.cf_file_id})`);
        
        let newMod: Mod;
        
        if (modEntry.source === 'curseforge' && modEntry.cf_project_id && modEntry.cf_file_id) {
          try {
            // Fetch complete data from CurseForge API
            const cfMod = await cfService.getMod(modEntry.cf_project_id);
            const cfFile = await cfService.getFile(modEntry.cf_project_id, modEntry.cf_file_id);
            
            if (cfMod && cfFile) {
              // Use modToLibraryFormat to get consistent metadata
              const formattedMod = cfService.modToLibraryFormat(
                cfMod,
                cfFile,
                manifest.modpack.loader,
                manifest.modpack.minecraft_version
              );
              
              newMod = await this.addMod({
                name: formattedMod.name,
                slug: formattedMod.slug,
                version: formattedMod.version,
                game_version: formattedMod.game_version,
                loader: formattedMod.loader,
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
                date_created: formattedMod.date_created,
                date_modified: formattedMod.date_modified,
                website_url: formattedMod.website_url,
              });
              console.log(`[Import] Added mod from CF API: ${newMod.name} v${newMod.version}`);
            } else {
              throw new Error('Mod or file not found on CurseForge');
            }
          } catch (error) {
            console.warn(`[Import] Failed to fetch from CF API, using manifest data:`, error);
            // Fallback to manifest data if API fetch fails
            newMod = await this.addMod({
              name: modEntry.name,
              version: modEntry.version,
              game_version: manifest.modpack.minecraft_version || "unknown",
              loader: manifest.modpack.loader || "unknown",
              filename: modEntry.filename,
              source: modEntry.source,
              cf_project_id: modEntry.cf_project_id,
              cf_file_id: modEntry.cf_file_id,
              mr_project_id: modEntry.mr_project_id,
              mr_version_id: modEntry.mr_version_id,
              description: modEntry.description,
              author: modEntry.author,
              thumbnail_url: modEntry.thumbnail_url,
            });
          }
        } else {
          // Modrinth or fallback - use manifest data
          newMod = await this.addMod({
            name: modEntry.name,
            version: modEntry.version,
            game_version: manifest.modpack.minecraft_version || "unknown",
            loader: manifest.modpack.loader || "unknown",
            filename: modEntry.filename,
            source: modEntry.source,
            cf_project_id: modEntry.cf_project_id,
            cf_file_id: modEntry.cf_file_id,
            mr_project_id: modEntry.mr_project_id,
            mr_version_id: modEntry.mr_version_id,
            description: modEntry.description,
            author: modEntry.author,
            thumbnail_url: modEntry.thumbnail_url,
          });
        }
        
        newModIds.push(newMod.id);
        addedModNames.push(newMod.name);
        downloadedModNames.push(newMod.name);
        console.log(`[Import] Downloaded new mod to library: ${newMod.name}`);
      }
    }

    // Get names of removed mods if updating
    const removedModNames: string[] = [];
    if (isUpdate) {
      const oldMods = await Promise.all(
        oldModIds.map(id => this.getModById(id))
      );
      const newSet = new Set(newModIds);
      
      for (let i = 0; i < oldModIds.length; i++) {
        if (!newSet.has(oldModIds[i]) && oldMods[i]) {
          removedModNames.push(oldMods[i]!.name);
        }
      }
    }

    // Update modpack mod list
    const modpack = await this.getModpackById(modpackId);
    if (modpack) {
      modpack.mod_ids = newModIds;
      modpack.updated_at = new Date().toISOString();
      await fs.writeJson(this.getModpackPath(modpackId), modpack, {
        spaces: 2,
      });
    }

    // Import version history if present in manifest
    if (manifest.version_history && Array.isArray(manifest.version_history) && manifest.version_history.length > 0) {
      console.log(`[Import] Importing ${manifest.version_history.length} version history entries`);
      
      // Get existing history (if updating)
      let existingHistory = await this.getVersionHistory(modpackId);
      if (!existingHistory) {
        // Initialize if not existing
        await this.initializeVersionControl(modpackId, 'Imported modpack');
        existingHistory = await this.getVersionHistory(modpackId);
      }
      
      if (existingHistory) {
        // Create a map of existing version IDs to avoid duplicates
        const existingVersionIds = new Set(existingHistory.versions.map((v: ModpackVersion) => v.id));
        
        // Add only new entries from manifest
        let importedCount = 0;
        for (const entry of manifest.version_history) {
          // Convert manifest entry to ModpackVersion format
          const version: ModpackVersion = {
            id: entry.version_id || entry.id,
            tag: entry.tag || entry.version_id || 'imported',
            message: entry.message || 'Imported version',
            created_at: entry.timestamp || entry.created_at || new Date().toISOString(),
            changes: entry.changes || [],
            mod_ids: entry.mod_ids || [],
            parent_id: entry.parent_id,
          };
          
          if (!existingVersionIds.has(version.id)) {
            existingHistory.versions.push(version);
            importedCount++;
          }
        }
        
        // Sort by timestamp (oldest first)
        existingHistory.versions.sort((a: ModpackVersion, b: ModpackVersion) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        await this.saveVersionHistory(existingHistory);
        console.log(`[Import] Imported ${importedCount} new version history entries (${manifest.version_history.length - importedCount} duplicates skipped)`);
      }
    }

    // Calculate changes if update
    let changes:
      | { 
        added: number; 
        removed: number; 
        unchanged: number;
        updated: number;
        downloaded: number;
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
      }
      | undefined;
    if (isUpdate) {
      const oldSet = new Set(oldModIds);
      const newSet = new Set(newModIds);

      changes = {
        added: addedModNames.length,
        removed: removedModNames.length,
        unchanged: newModIds.filter((id) => oldSet.has(id)).length,
        updated: updatedModNames.length,
        downloaded: downloadedModNames.length,
        addedMods: addedModNames,
        removedMods: removedModNames,
        updatedMods: updatedModNames,
        downloadedMods: downloadedModNames,
      };
      
      console.log('[Import] Update summary:', {
        added: addedModNames.length,
        removed: removedModNames.length,
        updated: updatedModNames.length,
        downloaded: downloadedModNames.length,
      });
    }

    return {
      modpackId,
      code: manifest.share_code,
      isUpdate,
      changes,
    };
  }

  async findModpackByShareCode(code: string): Promise<Modpack | null> {
    const modpacks = await this.getAllModpacks();
    return modpacks.find((m) => m.share_code === code) || null;
  }

  /**
   * Resolve version conflicts during import
   * @param modpackId - The modpack being imported to
   * @param conflicts - Array of conflict resolutions
   * @param partialData - Data from the partial import
   * @param cfService - CurseForge service for fetching complete mod data
   */
  async resolveImportConflicts(
    modpackId: string,
    conflicts: Array<{
      modEntry: any;
      existingMod: Mod;
      resolution: 'use_existing' | 'use_new';
    }>,
    partialData: {
      newModIds: string[];
      addedModNames: string[];
      oldModIds?: string[];
    },
    manifest: any,
    cfService: any
  ): Promise<{
    modpackId: string;
    code: string;
    isUpdate: boolean;
    changes?: { 
      added: number; 
      removed: number; 
      unchanged: number;
      addedMods: string[];
      removedMods: string[];
    };
  }> {
    const newModIds = [...partialData.newModIds];
    const addedModNames = [...partialData.addedModNames];

    // Process each conflict based on user resolution
    for (const conflict of conflicts) {
      if (conflict.resolution === 'use_existing') {
        // Use the existing mod
        newModIds.push(conflict.existingMod.id);
      } else if (conflict.resolution === 'use_new') {
        // Add the new version to library - fetch from CurseForge API
        let newMod: Mod;
        
        if (conflict.modEntry.source === 'curseforge' && conflict.modEntry.cf_project_id && conflict.modEntry.cf_file_id) {
          try {
            console.log(`[Conflict] Fetching new version from CF: ${conflict.modEntry.name} (${conflict.modEntry.cf_project_id}/${conflict.modEntry.cf_file_id})`);
            
            const cfMod = await cfService.getMod(conflict.modEntry.cf_project_id);
            const cfFile = await cfService.getFile(conflict.modEntry.cf_project_id, conflict.modEntry.cf_file_id);
            
            if (cfMod && cfFile) {
              const formattedMod = cfService.modToLibraryFormat(
                cfMod,
                cfFile,
                manifest.modpack.loader,
                manifest.modpack.minecraft_version
              );
              
              newMod = await this.addMod({
                name: formattedMod.name,
                slug: formattedMod.slug,
                version: formattedMod.version,
                game_version: formattedMod.game_version,
                loader: formattedMod.loader,
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
                date_created: formattedMod.date_created,
                date_modified: formattedMod.date_modified,
                website_url: formattedMod.website_url,
              });
            } else {
              throw new Error('Mod or file not found on CurseForge');
            }
          } catch (error) {
            console.warn(`[Conflict] Failed to fetch from CF API, using manifest data:`, error);
            // Fallback to manifest data
            newMod = await this.addMod({
              name: conflict.modEntry.name,
              version: conflict.modEntry.version,
              game_version: manifest.modpack.minecraft_version || "unknown",
              loader: manifest.modpack.loader || "unknown",
              filename: conflict.modEntry.filename,
              source: conflict.modEntry.source,
              cf_project_id: conflict.modEntry.cf_project_id,
              cf_file_id: conflict.modEntry.cf_file_id,
              mr_project_id: conflict.modEntry.mr_project_id,
              mr_version_id: conflict.modEntry.mr_version_id,
              description: conflict.modEntry.description,
              author: conflict.modEntry.author,
              thumbnail_url: conflict.modEntry.thumbnail_url,
            });
          }
        } else {
          // Modrinth or fallback
          newMod = await this.addMod({
            name: conflict.modEntry.name,
            version: conflict.modEntry.version,
            game_version: manifest.modpack.minecraft_version || "unknown",
            loader: manifest.modpack.loader || "unknown",
            filename: conflict.modEntry.filename,
            source: conflict.modEntry.source,
            cf_project_id: conflict.modEntry.cf_project_id,
            cf_file_id: conflict.modEntry.cf_file_id,
            mr_project_id: conflict.modEntry.mr_project_id,
            mr_version_id: conflict.modEntry.mr_version_id,
            description: conflict.modEntry.description,
            author: conflict.modEntry.author,
            thumbnail_url: conflict.modEntry.thumbnail_url,
          });
        }
        
        newModIds.push(newMod.id);
        addedModNames.push(newMod.name);
      }
    }

    // Check if this is an update
    const isUpdate = !!partialData.oldModIds;
    const oldModIds = partialData.oldModIds || [];

    // Get names of removed mods if updating
    const removedModNames: string[] = [];
    if (isUpdate) {
      const oldMods = await Promise.all(
        oldModIds.map(id => this.getModById(id))
      );
      const newSet = new Set(newModIds);
      
      for (let i = 0; i < oldModIds.length; i++) {
        if (!newSet.has(oldModIds[i]) && oldMods[i]) {
          removedModNames.push(oldMods[i]!.name);
        }
      }
    }

    // Update modpack mod list
    const modpack = await this.getModpackById(modpackId);
    if (modpack) {
      modpack.mod_ids = newModIds;
      modpack.updated_at = new Date().toISOString();
      await fs.writeJson(this.getModpackPath(modpackId), modpack, {
        spaces: 2,
      });
    }

    // Calculate changes
    let changes:
      | { 
        added: number; 
        removed: number; 
        unchanged: number;
        addedMods: string[];
        removedMods: string[];
      }
      | undefined;
    
    if (isUpdate) {
      const oldSet = new Set(oldModIds);
      changes = {
        added: addedModNames.length,
        removed: removedModNames.length,
        unchanged: newModIds.filter((id) => oldSet.has(id)).length,
        addedMods: addedModNames,
        removedMods: removedModNames,
      };
    }

    return {
      modpackId,
      code: manifest.share_code,
      isUpdate,
      changes,
    };
  }

  /**
   * Resolve version conflicts during CurseForge import
   */
  async resolveCFImportConflicts(
    modpackId: string,
    conflicts: Array<{
      projectID: number;
      fileID: number;
      existingModId: string;
      resolution: 'use_existing' | 'use_new';
    }>,
    cfService: any
  ): Promise<{
    success: boolean;
    modpackId: string;
    modsImported: number;
    modsSkipped: number;
    errors: string[];
  }> {
    // Retrieve stored conflict data
    const storedData = this.getPendingCFConflicts(modpackId);
    if (!storedData) {
      throw new Error('No pending conflicts found for this modpack');
    }

    const { partialData, manifest } = storedData;
    const newModIds = [...partialData.newModIds];
    const addedModNames = [...partialData.addedModNames];
    const errors: string[] = [];

    const mcVersion = manifest.minecraft?.version || "1.20.1";
    let loader = "unknown";
    const primaryLoader = manifest.minecraft?.modLoaders?.find((l: any) => l.primary);
    if (primaryLoader) {
      const match = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
      if (match) loader = match[1].toLowerCase();
    }

    // Process each conflict based on user resolution
    for (const conflict of conflicts) {
      if (conflict.resolution === 'use_existing') {
        // Use the existing mod by ID
        newModIds.push(conflict.existingModId);
      } else if (conflict.resolution === 'use_new') {
        try {
          console.log(`[CF Conflict] Fetching and adding new version: Project ${conflict.projectID}, File ${conflict.fileID}`);
          
          // Fetch mod data from CurseForge API
          const cfMod = await cfService.getMod(conflict.projectID);
          const cfFile = await cfService.getFile(conflict.projectID, conflict.fileID);
          
          if (!cfMod || !cfFile) {
            throw new Error('Mod or file not found on CurseForge');
          }
          
          // Use modToLibraryFormat for consistent metadata
          const formattedMod = cfService.modToLibraryFormat(
            cfMod,
            cfFile,
            loader,
            mcVersion
          );

          const newMod = await this.addMod({
            name: formattedMod.name,
            slug: formattedMod.slug,
            version: formattedMod.version,
            game_version: formattedMod.game_version,
            loader: formattedMod.loader,
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
            date_created: formattedMod.date_created,
            date_modified: formattedMod.date_modified,
            website_url: formattedMod.website_url,
          });

          newModIds.push(newMod.id);
          addedModNames.push(newMod.name);
        } catch (error: any) {
          console.error(`[CF Conflict] Error adding new version:`, error);
          errors.push(`Error adding mod (project ${conflict.projectID}): ${error.message}`);
        }
      }
    }

    // Add all mods to modpack
    for (const modId of newModIds) {
      await this.addModToModpack(modpackId, modId);
    }

    // Clean up stored conflict data
    this.clearPendingCFConflicts(modpackId);

    return {
      success: true,
      modpackId,
      modsImported: addedModNames.length,
      modsSkipped: errors.length,
      errors,
    };
  }

  // ==================== HELPERS ====================

  private mapReleaseType(type: number): "release" | "beta" | "alpha" {
    switch (type) {
      case 1:
        return "release";
      case 2:
        return "beta";
      case 3:
        return "alpha";
      default:
        return "release";
    }
  }

  private mapDependencyType(type: number): string {
    switch (type) {
      case 1:
        return "embedded";
      case 2:
        return "optional";
      case 3:
        return "required";
      case 4:
        return "tool";
      case 5:
        return "incompatible";
      case 6:
        return "include";
      default:
        return "optional";
    }
  }

  getBasePath(): string {
    return this.baseDir;
  }

  getCachePath(): string {
    return this.cacheDir;
  }
}

export default MetadataManager;
