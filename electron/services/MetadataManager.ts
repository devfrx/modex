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
import { getContentTypeFromClassId } from "./CurseForgeService";
import type { InstanceService } from "./InstanceService";

// ==================== TYPES ====================

export interface Mod {
  id: string;
  name: string;
  slug?: string;
  version: string;
  game_version: string;
  game_versions?: string[]; // List of compatible MC versions (mainly for shaders/resourcepacks)
  loader: string;
  content_type?: "mod" | "resourcepack" | "shader";
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
  loader_version?: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at?: string;
  mod_count?: number;
  favorite?: boolean;
  share_code?: string;
  last_sync?: string;
  mod_ids: string[];
  disabled_mod_ids?: string[];
  locked_mod_ids?: string[];
  remote_source?: {
    url: string;
    auto_check: boolean;
    last_checked?: string;
    skip_initial_check?: boolean;
  };
  // Track mods that failed to import due to incompatibility
  incompatible_mods?: Array<{
    cf_project_id: number;
    name: string;
    reason: string;
  }>;
  // CurseForge source tracking for imported modpacks
  cf_project_id?: number;
  cf_file_id?: number;
  cf_slug?: string;
  // Path to saved overrides (config files, scripts, etc.) for this modpack
  overridesPath?: string;
}

export interface CreateModpackData {
  name: string;
  version?: string;
  minecraft_version?: string;
  loader?: string;
  loader_version?: string;
  description?: string;
}

interface LibraryData {
  version: string;
  mods: Mod[];
}

interface AppConfig {
  curseforge_api_key?: string;
  /** Instance sync settings */
  instanceSync?: {
    /** Auto-sync modpack to instance before launching */
    autoSyncBeforeLaunch?: boolean;
    /** Auto-import config changes from instance after game closes */
    autoImportConfigsAfterGame?: boolean;
    /** Show confirmation dialog before auto-sync */
    showSyncConfirmation?: boolean;
    /** Default config sync mode when syncing */
    defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
  };
}

// ==================== VERSION CONTROL TYPES ====================

export interface ModpackChange {
  type: "add" | "remove" | "update" | "enable" | "disable" | "version_control" | "loader_change" | "lock" | "unlock";
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
  disabled_mod_ids?: string[];
  locked_mod_ids?: string[];
  /** Loader type at this version (forge, fabric, etc.) */
  loader?: string;
  /** Loader version at this version */
  loader_version?: string;
  parent_id?: string;
  /** Snapshots of CF mods for rollback restoration */
  mod_snapshots?: Array<{
    id: string;
    name: string;
    version?: string;
    cf_project_id: number;
    cf_file_id: number;
  }>;
  /** ID of the config snapshot for this version (stored in overrides/{modpackId}/snapshots/{versionId}/) */
  config_snapshot_id?: string;
  /** Config changes included in this version */
  config_changes?: Array<{
    filePath: string;
    keyPath: string;
    line?: number;
    oldValue: any;
    newValue: any;
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
  private overridesDir: string;
  private cacheDir: string;
  private libraryPath: string;
  private configPath: string;

  // Reference to InstanceService for accessing instance data
  private instanceService: InstanceService | null = null;

  // Storage for pending CF import conflicts
  private pendingCFConflicts: Map<string, { partialData: any; manifest: any }> =
    new Map();

  // File locks to prevent race conditions on concurrent writes
  private fileLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.baseDir = path.join(app.getPath("userData"), "modex");
    this.modpacksDir = path.join(this.baseDir, "modpacks");
    this.versionsDir = path.join(this.baseDir, "versions");
    this.overridesDir = path.join(this.baseDir, "overrides");
    this.cacheDir = path.join(this.baseDir, "cache");
    this.libraryPath = path.join(this.baseDir, "library.json");
    this.configPath = path.join(this.baseDir, "config.json");
    this.ensureDirectories();
  }

  /**
   * Set the InstanceService reference (called after InstanceService is created)
   */
  setInstanceService(instanceService: InstanceService): void {
    this.instanceService = instanceService;
  }

  /**
   * Acquire a lock for a file to prevent concurrent writes
   * Returns a release function that must be called when done
   */
  private async acquireFileLock(filePath: string): Promise<() => void> {
    // Wait for any existing lock on this file
    while (this.fileLocks.has(filePath)) {
      await this.fileLocks.get(filePath);
    }

    // Create a new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.fileLocks.set(filePath, lockPromise);

    return () => {
      this.fileLocks.delete(filePath);
      releaseLock!();
    };
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.baseDir);
    await fs.ensureDir(this.modpacksDir);
    await fs.ensureDir(this.versionsDir);
    await fs.ensureDir(this.overridesDir);
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

  private async safeWriteJson(filePath: string, data: any): Promise<void> {
    // Acquire lock for this file to prevent race conditions
    const releaseLock = await this.acquireFileLock(filePath);

    try {
      // Ensure the directory exists before writing
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir);

      // Use unique temp file to avoid conflicts
      const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeJson(tempPath, data, { spaces: 2 });
      try {
        await fs.move(tempPath, filePath, { overwrite: true });
      } catch (error) {
        // If move fails, try to clean up temp file
        await fs.remove(tempPath).catch(() => { });
        throw error;
      }
    } finally {
      releaseLock();
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.safeWriteJson(this.configPath, config);
  }

  async getApiKey(): Promise<string> {
    const config = await this.getConfig();
    return config.curseforge_api_key || "";
  }

  async setApiKey(apiKey: string): Promise<void> {
    const config = await this.getConfig();
    config.curseforge_api_key = apiKey;
    await this.saveConfig(config);
  }

  // ==================== INSTANCE SYNC SETTINGS ====================

  async getInstanceSyncSettings(): Promise<NonNullable<AppConfig["instanceSync"]>> {
    const config = await this.getConfig();
    return {
      autoSyncBeforeLaunch: config.instanceSync?.autoSyncBeforeLaunch ?? true,
      autoImportConfigsAfterGame: config.instanceSync?.autoImportConfigsAfterGame ?? false,
      showSyncConfirmation: config.instanceSync?.showSyncConfirmation ?? true,
      defaultConfigSyncMode: config.instanceSync?.defaultConfigSyncMode ?? "new_only",
    };
  }

  async setInstanceSyncSettings(settings: Partial<NonNullable<AppConfig["instanceSync"]>>): Promise<void> {
    try {
      const config = await this.getConfig();
      config.instanceSync = {
        ...config.instanceSync,
        ...settings,
      };
      await this.saveConfig(config);
    } catch (error) {
      console.error("[MetadataManager] Failed to set instance sync settings:", error);
      throw error;
    }
  }

  // ==================== PENDING CF CONFLICTS ====================

  storePendingCFConflicts(
    modpackId: string,
    partialData: any,
    manifest: any
  ): void {
    console.log(
      `[MetadataManager] Storing pending CF conflicts for modpack ${modpackId}`
    );
    this.pendingCFConflicts.set(modpackId, { partialData, manifest });
  }

  getPendingCFConflicts(
    modpackId: string
  ): { partialData: any; manifest: any } | undefined {
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
    await this.safeWriteJson(this.libraryPath, data);
  }

  async getAllMods(): Promise<Mod[]> {
    const library = await this.loadLibrary();
    return library.mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModById(id: string): Promise<Mod | undefined> {
    const library = await this.loadLibrary();
    return library.mods.find((m) => m.id === id);
  }

  async findModByCFIds(
    projectId: number,
    fileId: number
  ): Promise<Mod | undefined> {
    const library = await this.loadLibrary();
    const id = `cf-${projectId}-${fileId}`;
    const found = library.mods.find((m) => m.id === id);
    console.log(`[findModByCFIds] Looking for ${id} - found: ${found ? found.name : 'NOT FOUND'}`);
    return found;
  }

  async findModByMRIds(
    projectId: string,
    versionId: string
  ): Promise<Mod | undefined> {
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
      console.log(
        `[MetadataManager] Mod ${id} already exists in library, reusing existing`
      );
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

  /**
   * Add multiple mods to the library in a single batch operation
   * This is much more efficient than calling addMod individually when importing many mods
   * Returns an array of added mods (or existing mods if they were already in the library)
   */
  async addModsBatch(modsData: Array<Omit<Mod, "id" | "created_at">>): Promise<Mod[]> {
    const library = await this.loadLibrary();
    const existingIds = new Set(library.mods.map(m => m.id));
    const results: Mod[] = [];

    for (const modData of modsData) {
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

      // Check if already exists
      if (existingIds.has(id)) {
        const existingMod = library.mods.find((m) => m.id === id);
        if (existingMod) {
          results.push(existingMod);
          continue;
        }
      }

      // Create new mod
      const mod: Mod = {
        ...modData,
        id,
        created_at: new Date().toISOString(),
      };

      library.mods.push(mod);
      existingIds.add(id);
      results.push(mod);
    }

    // Save library once with all new mods
    await this.saveLibrary(library);
    console.log(`[MetadataManager] Batch added ${modsData.length} mods to library`);
    return results;
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
    if (ids.length === 0) return 0;

    // Batch delete: single library load/save
    const library = await this.loadLibrary();
    const idsToDelete = new Set(ids);
    const initialLength = library.mods.length;

    library.mods = library.mods.filter((m) => !idsToDelete.has(m.id));
    const deletedCount = initialLength - library.mods.length;

    if (deletedCount === 0) return 0;

    await this.saveLibrary(library);

    // Batch remove from all modpacks
    const modpacks = await this.getAllModpacks();
    const modpackUpdates: Promise<void>[] = [];

    for (const modpack of modpacks) {
      const modsToRemove = modpack.mod_ids.filter((id) => idsToDelete.has(id));
      if (modsToRemove.length > 0) {
        // Update modpack once with all removed mods
        modpackUpdates.push(
          this.updateModpack(modpack.id, {
            mod_ids: modpack.mod_ids.filter((id) => !idsToDelete.has(id)),
          }).then(() => { })
        );
      }
    }

    // Execute all modpack updates in parallel
    await Promise.all(modpackUpdates);

    return deletedCount;
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
        } catch (error: any) {
          console.error(`Failed to read modpack ${file}:`, error);

          // Attempt recovery for corrupted JSON (e.g. garbage at end of file)
          if (error instanceof SyntaxError) {
            const modpackPath = path.join(this.modpacksDir, file);
            try {
              console.log(`Attempting to recover corrupted modpack: ${file}`);
              const content = await fs.readFile(modpackPath, "utf-8");
              let recovered = false;

              // Strategy 1: Use position from error message
              // Error format: "Unexpected non-whitespace character after JSON at position 3182"
              const match = error.message.match(/at position (\d+)/);
              if (match) {
                const pos = parseInt(match[1], 10);
                if (pos > 0 && pos < content.length) {
                  try {
                    const fixedContent = content.substring(0, pos);
                    const modpack = JSON.parse(fixedContent);
                    await this.safeWriteJson(modpackPath, modpack);
                    modpack.mod_count = modpack.mod_ids?.length || 0;
                    modpacks.push(modpack);
                    console.log(
                      `Successfully recovered modpack using position: ${file}`
                    );
                    recovered = true;
                  } catch (e) {
                    console.log(`Position-based recovery failed for ${file}`);
                  }
                }
              }

              // Strategy 2: Find last closing brace (fallback)
              if (!recovered) {
                const lastBrace = content.lastIndexOf("}");
                if (lastBrace !== -1) {
                  const fixedContent = content.substring(0, lastBrace + 1);
                  const modpack = JSON.parse(fixedContent);
                  await this.safeWriteJson(modpackPath, modpack);
                  modpack.mod_count = modpack.mod_ids?.length || 0;
                  modpacks.push(modpack);
                  console.log(
                    `Successfully recovered modpack using brace search: ${file}`
                  );
                  recovered = true;
                }
              }

              if (!recovered) {
                throw new Error("All recovery strategies failed");
              }
            } catch (recoveryError) {
              console.error(
                `Failed to recover modpack ${file}, renaming to .corrupted:`,
                recoveryError
              );
              // Rename corrupted file so it doesn't crash the app on next load
              try {
                await fs.rename(modpackPath, `${modpackPath}.corrupted`);
              } catch (renameError) {
                console.error(
                  `Failed to rename corrupted file ${file}:`,
                  renameError
                );
              }
            }
          }
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
      loader_version: data.loader_version,
      description: data.description,
      created_at: new Date().toISOString(),
      mod_ids: [],
    };

    await this.safeWriteJson(this.getModpackPath(id), modpack);
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

    await this.safeWriteJson(this.getModpackPath(id), updated);
    return true;
  }

  async deleteModpack(id: string): Promise<boolean> {
    const modpackPath = this.getModpackPath(id);

    if (!(await fs.pathExists(modpackPath))) return false;

    try {
      await fs.remove(modpackPath);
      // Also delete version history
      await this.deleteVersionHistory(id);
      // Also delete overrides
      await this.deleteOverrides(id);
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
      loader_version: original.loader_version,
      description: original.description,
    });

    // Copy mod_ids and other properties
    const newModpack = await this.getModpackById(newId);
    if (newModpack) {
      newModpack.mod_ids = [...original.mod_ids];
      newModpack.image_url = original.image_url;
      newModpack.disabled_mod_ids = original.disabled_mod_ids ? [...original.disabled_mod_ids] : [];
      newModpack.locked_mod_ids = original.locked_mod_ids ? [...original.locked_mod_ids] : [];
      // Don't copy share_code, remote_source, or cf_* fields - clone should be independent
      await this.safeWriteJson(this.getModpackPath(newId), newModpack);
    }

    // Copy overrides/configs folder
    const originalOverridesPath = this.getOverridesPath(id);
    const newOverridesPath = this.getOverridesPath(newId);
    try {
      if (await fs.pathExists(originalOverridesPath)) {
        await fs.copy(originalOverridesPath, newOverridesPath);
        console.log(`[Clone] Copied overrides from ${id} to ${newId}`);
      }
    } catch (err) {
      console.error(`[Clone] Failed to copy overrides:`, err);
    }

    // Copy version history
    try {
      const originalHistory = await this.getVersionHistory(id);
      if (originalHistory && originalHistory.versions.length > 0) {
        // Create new version history with copied versions but new IDs
        const newVersions = originalHistory.versions.map(v => ({
          ...v,
          id: crypto.randomUUID(),
          // Keep the same relative timestamps but mark as cloned
        }));

        const newHistory: ModpackVersionHistory = {
          modpack_id: newId,
          versions: newVersions,
          current_version_id: newVersions[newVersions.length - 1]?.id,
        };

        const historyPath = path.join(this.versionsDir, `${newId}.json`);
        await this.safeWriteJson(historyPath, newHistory);
        console.log(`[Clone] Copied version history from ${id} to ${newId}`);
      }
    } catch (err) {
      console.error(`[Clone] Failed to copy version history:`, err);
    }

    return newId;
  }

  // ==================== MODPACK OVERRIDES ====================

  /**
   * Get the overrides directory path for a modpack
   */
  getOverridesPath(modpackId: string): string {
    return path.join(this.overridesDir, modpackId);
  }

  /**
   * Extract and save overrides from a CurseForge ZIP to the modpack's overrides folder
   * @param zipPath Path to the ZIP file
   * @param modpackId The modpack ID to save overrides for
   * @param manifest Optional CurseForge manifest (to get custom overrides folder name)
   * @returns Path to the saved overrides folder, or null if no overrides found
   */
  async saveOverridesFromZip(
    zipPath: string,
    modpackId: string,
    manifest?: any
  ): Promise<{ path: string | null; fileCount: number }> {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Get overrides folder name from manifest (defaults to "overrides")
    const overridesFolderName = manifest?.overrides || "overrides";

    // Find entries in the overrides folder
    const overridesEntries = entries.filter(
      (e) =>
        e.entryName.startsWith(overridesFolderName + "/") && !e.isDirectory
    );

    if (overridesEntries.length === 0) {
      // Also check for direct config/kubejs folders (some modpacks structure them differently)
      const directFolders = ["config/", "kubejs/", "defaultconfigs/", "scripts/", "resourcepacks/", "shaderpacks/"];
      const directEntries = entries.filter((e) =>
        directFolders.some((f) => e.entryName.startsWith(f)) && !e.isDirectory
      );

      if (directEntries.length === 0) {
        return { path: null, fileCount: 0 };
      }

      // Extract direct folders
      const overridesPath = this.getOverridesPath(modpackId);
      await fs.ensureDir(overridesPath);

      let fileCount = 0;
      for (const entry of directEntries) {
        const destPath = path.join(overridesPath, entry.entryName);
        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, entry.getData());
        fileCount++;
      }

      // Update modpack with overrides path
      await this.updateModpack(modpackId, { overridesPath });

      return { path: overridesPath, fileCount };
    }

    // Extract overrides folder
    const overridesPath = this.getOverridesPath(modpackId);
    await fs.ensureDir(overridesPath);

    let fileCount = 0;
    for (const entry of overridesEntries) {
      // Remove "overrides/" prefix
      const relativePath = entry.entryName.substring(overridesFolderName.length + 1);
      if (relativePath) {
        const destPath = path.join(overridesPath, relativePath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, entry.getData());
        fileCount++;
      }
    }

    // Update modpack with overrides path
    await this.updateModpack(modpackId, { overridesPath });

    return { path: overridesPath, fileCount };
  }

  /**
   * Delete overrides folder for a modpack
   */
  async deleteOverrides(modpackId: string): Promise<boolean> {
    const overridesPath = this.getOverridesPath(modpackId);
    try {
      if (await fs.pathExists(overridesPath)) {
        await fs.remove(overridesPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete overrides for ${modpackId}:`, error);
      return false;
    }
  }

  /**
   * Check if a modpack has saved overrides
   */
  async hasOverrides(modpackId: string): Promise<boolean> {
    const overridesPath = this.getOverridesPath(modpackId);
    return fs.pathExists(overridesPath);
  }

  /**
   * Check if configs have changed compared to the last snapshot
   * Optimized: Uses stat-based comparison for faster detection
   * Compares against the current version's config snapshot
   */
  async hasConfigChanges(modpackId: string): Promise<boolean> {
    const overridesPath = this.getOverridesPath(modpackId);

    if (!(await fs.pathExists(overridesPath))) {
      return false;
    }

    // Quick check: if no config files exist, return false
    if (!(await this.hasConfigFiles(overridesPath))) {
      return false;
    }

    // Get the current version's snapshot ID
    const history = await this.getVersionHistory(modpackId);
    if (!history || history.versions.length === 0) {
      // No version history but configs exist means unsaved
      return true;
    }

    const currentVersion = history.versions.find(v => v.id === history.current_version_id)
      || history.versions[history.versions.length - 1];

    if (!currentVersion.config_snapshot_id) {
      // Version has no config snapshot but configs exist
      return true;
    }

    const snapshotPath = path.join(this.overridesDir, modpackId, "snapshots", currentVersion.config_snapshot_id);
    if (!(await fs.pathExists(snapshotPath))) {
      // Snapshot doesn't exist but configs exist
      return true;
    }

    try {
      // Compute hashes for both directories in parallel
      const [currentHash, snapshotHash] = await Promise.all([
        this.computeDirectoryHash(overridesPath, ["snapshots"]),
        this.computeDirectoryHash(snapshotPath, [])
      ]);

      return currentHash !== snapshotHash;
    } catch (error) {
      console.error(`Error checking config changes for ${modpackId}:`, error);
      return false;
    }
  }

  /**
   * Get detailed unsaved changes for a modpack compared to the last saved version
   * Returns all types of changes: mods added/removed, configs changed, etc.
   */
  async getUnsavedChanges(modpackId: string): Promise<{
    hasChanges: boolean;
    changes: {
      modsAdded: Array<{ id: string; name: string }>;
      modsRemoved: Array<{ id: string; name: string }>;
      modsEnabled: Array<{ id: string; name: string }>;
      modsDisabled: Array<{ id: string; name: string }>;
      modsUpdated: Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>;
      modsLocked: Array<{ id: string; name: string }>;
      modsUnlocked: Array<{ id: string; name: string }>;
      loaderChanged: { oldLoader?: string; newLoader?: string; oldVersion?: string; newVersion?: string } | null;
      configsChanged: boolean;
      configDetails: Array<{
        filePath: string;
        keyPath: string;
        line?: number;
        oldValue: any;
        newValue: any;
        timestamp: string;
      }>;
    };
    lastVersion: ModpackVersion | null;
  }> {
    const result = {
      hasChanges: false,
      changes: {
        modsAdded: [] as Array<{ id: string; name: string }>,
        modsRemoved: [] as Array<{ id: string; name: string }>,
        modsEnabled: [] as Array<{ id: string; name: string }>,
        modsDisabled: [] as Array<{ id: string; name: string }>,
        modsUpdated: [] as Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>,
        modsLocked: [] as Array<{ id: string; name: string }>,
        modsUnlocked: [] as Array<{ id: string; name: string }>,
        loaderChanged: null as { oldLoader?: string; newLoader?: string; oldVersion?: string; newVersion?: string } | null,
        configsChanged: false,
        configDetails: [] as Array<{ filePath: string; keyPath: string; line?: number; oldValue: any; newValue: any; timestamp: string }>,
      },
      lastVersion: null as ModpackVersion | null,
    };

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return result;

    // Get version history
    const history = await this.getVersionHistory(modpackId);
    if (!history || history.versions.length === 0) {
      // No version history, check if there are any mods or configs
      if (modpack.mod_ids.length > 0) {
        const library = await this.loadLibrary();
        result.changes.modsAdded = modpack.mod_ids.map(id => {
          const mod = library.mods.find(m => m.id === id);
          return { id, name: mod?.name || id };
        });
        result.hasChanges = true;
      }
      // Check for configs
      const hasConfigs = await this.hasConfigChanges(modpackId);
      if (hasConfigs) {
        result.changes.configsChanged = true;
        result.hasChanges = true;
      }
      return result;
    }

    // Get the current (latest) version
    const currentVersion = history.versions.find(v => v.id === history.current_version_id)
      || history.versions[history.versions.length - 1];
    result.lastVersion = currentVersion;

    // Check for loader changes
    const savedLoader = currentVersion.loader || modpack.loader; // Fallback to current if not saved in version
    const savedLoaderVersion = currentVersion.loader_version;
    const currentLoader = modpack.loader;
    const currentLoaderVersion = modpack.loader_version;

    if (savedLoader !== currentLoader || savedLoaderVersion !== currentLoaderVersion) {
      result.changes.loaderChanged = {
        oldLoader: savedLoader,
        newLoader: currentLoader,
        oldVersion: savedLoaderVersion,
        newVersion: currentLoaderVersion
      };
    }

    // Compare current mod list with saved version
    const savedModIds = new Set(currentVersion.mod_ids || []);
    const currentModIds = new Set(modpack.mod_ids || []);
    const savedDisabledIds = new Set(currentVersion.disabled_mod_ids || []);
    const currentDisabledIds = new Set(modpack.disabled_mod_ids || []);
    const savedSnapshots = currentVersion.mod_snapshots || [];
    const snapshotMap = new Map(savedSnapshots.map(s => [s.id, s]));
    // Map by cf_project_id to detect updates (same project, different file)
    const snapshotByProjectId = new Map(savedSnapshots.filter(s => s.cf_project_id).map(s => [s.cf_project_id, s]));

    const library = await this.loadLibrary();

    // Build maps of current mods by project ID
    const currentModsByProjectId = new Map<number, typeof library.mods[0]>();
    for (const modId of currentModIds) {
      const mod = library.mods.find(m => m.id === modId);
      if (mod?.cf_project_id) {
        currentModsByProjectId.set(mod.cf_project_id, mod);
      }
    }

    // Track which mods are updates (to exclude from add/remove)
    const updatedProjectIds = new Set<number>();

    // First pass: detect updates (same cf_project_id, different file)
    for (const modId of currentModIds) {
      const mod = library.mods.find(m => m.id === modId);
      if (!mod?.cf_project_id) continue;

      // Check if same project existed in saved version with different file
      const savedSnapshot = snapshotByProjectId.get(mod.cf_project_id);
      if (savedSnapshot && savedSnapshot.id !== modId) {
        // Same project, different ID = update
        updatedProjectIds.add(mod.cf_project_id);
        const oldVersion = savedSnapshot.version || `file:${savedSnapshot.cf_file_id}`;
        const newVersion = mod.version || `file:${mod.cf_file_id}`;
        result.changes.modsUpdated.push({
          id: modId,
          name: mod.name || modId,
          oldVersion,
          newVersion
        });
      }
    }

    // Find added mods (excluding updates)
    for (const modId of currentModIds) {
      if (!savedModIds.has(modId)) {
        const mod = library.mods.find(m => m.id === modId);
        // Skip if this is an update
        if (mod?.cf_project_id && updatedProjectIds.has(mod.cf_project_id)) continue;
        result.changes.modsAdded.push({ id: modId, name: mod?.name || modId });
      }
    }

    // Find removed mods (excluding updates)
    for (const modId of savedModIds) {
      if (!currentModIds.has(modId)) {
        // Check if this was replaced by an update
        const savedSnapshot = snapshotMap.get(modId);
        if (savedSnapshot?.cf_project_id && updatedProjectIds.has(savedSnapshot.cf_project_id)) continue;

        // First try to find in library
        let modName = library.mods.find(m => m.id === modId)?.name;
        // If not in library, try to get from saved version snapshots
        if (!modName && savedSnapshots.length > 0) {
          const snapshot = savedSnapshots.find(s => s.id === modId);
          modName = snapshot?.name;
        }
        result.changes.modsRemoved.push({ id: modId, name: modName || modId });
      }
    }

    // Find updated mods with same ID but different cf_file_id (edge case: in-place update)
    for (const modId of currentModIds) {
      if (!savedModIds.has(modId)) continue;

      const mod = library.mods.find(m => m.id === modId);
      if (!mod || !mod.cf_file_id) continue;

      const savedSnapshot = snapshotMap.get(modId);
      if (!savedSnapshot) continue;

      // Compare file IDs - if different, the mod has been updated
      if (mod.cf_file_id !== savedSnapshot.cf_file_id) {
        // Use real versions if available, fall back to file IDs
        const oldVersion = savedSnapshot.version || `file:${savedSnapshot.cf_file_id}`;
        const newVersion = mod.version || `file:${mod.cf_file_id}`;
        // Avoid duplicates
        if (!result.changes.modsUpdated.find(u => u.id === modId)) {
          result.changes.modsUpdated.push({
            id: modId,
            name: mod.name || modId,
            oldVersion,
            newVersion
          });
        }
      }
    }

    // Find enabled mods (were disabled, now enabled)
    for (const modId of savedDisabledIds) {
      if (currentModIds.has(modId) && !currentDisabledIds.has(modId)) {
        const mod = library.mods.find(m => m.id === modId);
        result.changes.modsEnabled.push({ id: modId, name: mod?.name || modId });
      }
    }

    // Find disabled mods (were enabled, now disabled)
    for (const modId of currentDisabledIds) {
      if (savedModIds.has(modId) && !savedDisabledIds.has(modId)) {
        const mod = library.mods.find(m => m.id === modId);
        result.changes.modsDisabled.push({ id: modId, name: mod?.name || modId });
      }
    }

    // Find locked/unlocked mods
    const savedLockedIds = new Set(currentVersion.locked_mod_ids || []);
    const currentLockedIds = new Set(modpack.locked_mod_ids || []);

    // Find newly locked mods
    for (const modId of currentLockedIds) {
      if (!savedLockedIds.has(modId)) {
        const mod = library.mods.find(m => m.id === modId);
        result.changes.modsLocked.push({ id: modId, name: mod?.name || modId });
      }
    }

    // Find newly unlocked mods
    for (const modId of savedLockedIds) {
      if (!currentLockedIds.has(modId) && currentModIds.has(modId)) {
        const mod = library.mods.find(m => m.id === modId);
        result.changes.modsUnlocked.push({ id: modId, name: mod?.name || modId });
      }
    }

    // Check for config changes and load details
    result.changes.configsChanged = await this.hasConfigChanges(modpackId);

    // Load detailed config modifications from instance if available
    try {
      if (!this.instanceService) {
        console.warn("[MetadataManager] InstanceService not set, cannot load config modifications");
      } else {
        // Find instance by modpackId
        const instance = await this.instanceService.getInstanceByModpack(modpackId);
        console.log("[MetadataManager] getUnsavedChanges - Looking for instance with modpackId:", modpackId, "Found:", instance?.id);

        if (instance) {
          const configChangesPath = path.join(instance.path, ".modex-changes", "config-changes.json");
          console.log("[MetadataManager] Checking config changes at:", configChangesPath);

          if (await fs.pathExists(configChangesPath)) {
            const changeSets = JSON.parse(await fs.readFile(configChangesPath, "utf-8"));
            console.log("[MetadataManager] Found", changeSets.length, "change sets");

            // Get only uncommitted changes
            const uncommittedChanges = changeSets.filter((cs: any) => !cs.committed);
            console.log("[MetadataManager] Uncommitted changes:", uncommittedChanges.length);

            for (const changeSet of uncommittedChanges) {
              for (const mod of changeSet.modifications) {
                result.changes.configDetails.push({
                  filePath: mod.filePath,
                  keyPath: mod.keyPath,
                  line: mod.line,
                  oldValue: mod.oldValue,
                  newValue: mod.newValue,
                  timestamp: mod.timestamp,
                });
              }
            }
            // If we have config details, mark configsChanged as true
            if (result.changes.configDetails.length > 0) {
              result.changes.configsChanged = true;
            }
          } else {
            console.log("[MetadataManager] No config-changes.json file found");
          }
        } else {
          console.log("[MetadataManager] No instance found for modpack");
        }
      }
    } catch (err) {
      console.error("Error loading config modifications:", err);
    }

    // Determine if there are any changes
    result.hasChanges =
      result.changes.modsAdded.length > 0 ||
      result.changes.modsRemoved.length > 0 ||
      result.changes.modsUpdated.length > 0 ||
      result.changes.modsEnabled.length > 0 ||
      result.changes.modsDisabled.length > 0 ||
      result.changes.modsLocked.length > 0 ||
      result.changes.modsUnlocked.length > 0 ||
      result.changes.loaderChanged !== null ||
      result.changes.configsChanged;

    return result;
  }

  /**
   * Revert all unsaved changes to the last saved version
   * Returns detailed info about what was reverted and any issues
   */
  async revertUnsavedChanges(modpackId: string): Promise<{
    success: boolean;
    restoredMods: number;
    skippedMods: number;
    missingMods: Array<{ id: string; name: string }>;
  }> {
    const result = {
      success: false,
      restoredMods: 0,
      skippedMods: 0,
      missingMods: [] as Array<{ id: string; name: string }>,
    };

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return result;

    const history = await this.getVersionHistory(modpackId);
    if (!history || history.versions.length === 0) {
      console.log(`No version history for ${modpackId}, cannot revert`);
      return result;
    }

    // Get the current (latest) version
    const currentVersion = history.versions.find(v => v.id === history.current_version_id)
      || history.versions[history.versions.length - 1];

    // Load library to check which mods still exist
    const library = await this.loadLibrary();
    const libraryModIds = new Set(library.mods.map(m => m.id));

    // Filter mod_ids to only include mods that still exist in library
    const validModIds: string[] = [];
    const missingModIds: string[] = [];

    for (const modId of (currentVersion.mod_ids || [])) {
      if (libraryModIds.has(modId)) {
        validModIds.push(modId);
      } else {
        missingModIds.push(modId);
        // Try to get name from snapshot
        const snapshot = currentVersion.mod_snapshots?.find((s: any) => s.id === modId);
        result.missingMods.push({
          id: modId,
          name: snapshot?.name || modId,
        });
      }
    }

    // Filter disabled_mod_ids to only include mods that exist
    const validDisabledIds = (currentVersion.disabled_mod_ids || []).filter(
      (id: string) => libraryModIds.has(id)
    );

    // Filter locked_mod_ids to only include mods that exist
    const validLockedIds = (currentVersion.locked_mod_ids || []).filter(
      (id: string) => libraryModIds.has(id)
    );

    // Restore mod list (only existing mods)
    modpack.mod_ids = validModIds;
    modpack.disabled_mod_ids = validDisabledIds;
    modpack.locked_mod_ids = validLockedIds;

    // Restore loader from the saved version
    if (currentVersion.loader) {
      modpack.loader = currentVersion.loader;
    }
    if (currentVersion.loader_version) {
      modpack.loader_version = currentVersion.loader_version;
    }

    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    result.restoredMods = validModIds.length;
    result.skippedMods = missingModIds.length;

    // Note: We don't modify library mods here - each mod version has its own unique ID
    // (cf-{projectId}-{fileId}). If a mod was updated, the old version ID would be different.
    // The validModIds already contains the correct IDs from the saved version.

    // Restore config snapshot if available (overrides folder)
    if (currentVersion.config_snapshot_id) {
      await this.restoreConfigSnapshot(modpackId, currentVersion.config_snapshot_id);
    }

    // Revert config changes in instance and clear uncommitted changes
    await this.revertInstanceConfigChanges(modpackId);

    console.log(`[Version Control] Reverted modpack ${modpackId} to version ${currentVersion.id}`);
    console.log(`  - Restored: ${result.restoredMods} mods`);
    console.log(`  - Skipped (deleted from library): ${result.skippedMods} mods`);
    if (currentVersion.loader || currentVersion.loader_version) {
      console.log(`  - Restored loader: ${currentVersion.loader} ${currentVersion.loader_version}`);
    }

    result.success = true;
    return result;
  }

  /**
   * Revert uncommitted config changes in instance by restoring original values
   */
  private async revertInstanceConfigChanges(modpackId: string): Promise<void> {
    console.log("[MetadataManager] revertInstanceConfigChanges called for modpack:", modpackId);

    if (!this.instanceService) {
      console.warn("[MetadataManager] InstanceService not set, cannot revert config changes");
      return;
    }

    try {
      const instance = await this.instanceService.getInstanceByModpack(modpackId);
      console.log("[MetadataManager] Instance found:", instance?.id, "Path:", instance?.path);

      if (!instance) {
        console.log("[MetadataManager] No instance found for modpack, skipping config revert");
        return;
      }

      const configChangesPath = path.join(instance.path, ".modex-changes", "config-changes.json");
      console.log("[MetadataManager] Checking config changes at:", configChangesPath);

      if (!await fs.pathExists(configChangesPath)) {
        console.log("[MetadataManager] No config-changes.json found, nothing to revert");
        return;
      }

      const changeSets = JSON.parse(await fs.readFile(configChangesPath, "utf-8"));
      const uncommittedChanges = changeSets.filter((cs: any) => !cs.committed);

      if (uncommittedChanges.length === 0) {
        console.log("[MetadataManager] No uncommitted config changes to revert");
        return;
      }

      // Group modifications by file path for efficient reverting
      const modificationsByFile = new Map<string, Array<{ keyPath: string; oldValue: any; line?: number }>>();

      for (const changeSet of uncommittedChanges) {
        for (const mod of changeSet.modifications) {
          const filePath = mod.filePath;
          if (!modificationsByFile.has(filePath)) {
            modificationsByFile.set(filePath, []);
          }
          modificationsByFile.get(filePath)!.push({
            keyPath: mod.keyPath,
            oldValue: mod.oldValue,
            line: mod.line,
          });
        }
      }

      // Revert each file
      for (const [filePath, modifications] of modificationsByFile) {
        const fullPath = path.join(instance.path, filePath);
        if (!await fs.pathExists(fullPath)) {
          console.warn(`[MetadataManager] Config file not found: ${fullPath}`);
          continue;
        }

        try {
          // Read current file content
          const content = await fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");

          // Determine file format
          const ext = path.extname(filePath).toLowerCase();

          if (ext === ".json" || ext === ".json5") {
            // For JSON, parse, modify, and rewrite
            const json = JSON.parse(content);
            for (const mod of modifications) {
              this.setNestedValue(json, mod.keyPath, mod.oldValue);
            }
            await fs.writeFile(fullPath, JSON.stringify(json, null, 2));
          } else if (ext === ".toml") {
            // For TOML files, we need to reload and revert line by line
            // Since we have oldValue, we can reconstruct
            let newLines = [...lines];
            for (const mod of modifications) {
              if (mod.line && mod.line > 0 && mod.line <= lines.length) {
                const lineIndex = mod.line - 1;
                const currentLine = lines[lineIndex];
                // Extract key from the line
                const keyMatch = currentLine.match(/^(\s*)([^=]+)=/);
                if (keyMatch) {
                  const indent = keyMatch[1];
                  const key = keyMatch[2].trim();
                  const formattedValue = this.formatTomlValue(mod.oldValue);
                  newLines[lineIndex] = `${indent}${key} = ${formattedValue}`;
                }
              }
            }
            await fs.writeFile(fullPath, newLines.join("\n"));
          } else if (ext === ".properties" || ext === ".cfg") {
            // For Forge cfg files and properties files
            let newLines = [...lines];
            for (const mod of modifications) {
              if (mod.line && mod.line > 0 && mod.line <= lines.length) {
                const lineIndex = mod.line - 1;
                const currentLine = lines[lineIndex];

                // Forge cfg format: B:"Key Name"=value or S:keyName=value
                // Also handles: I:someKey=123, D:doubleKey=1.5
                const forgeCfgMatch = currentLine.match(/^(\s*)([BIDSFL]:"[^"]+"|[BIDSFL]:[^=]+)=(.*)$/i);
                if (forgeCfgMatch) {
                  const indent = forgeCfgMatch[1];
                  const keyPart = forgeCfgMatch[2];
                  // Format value based on type prefix
                  let formattedValue = mod.oldValue;
                  if (typeof mod.oldValue === 'boolean') {
                    formattedValue = mod.oldValue ? 'true' : 'false';
                  }
                  newLines[lineIndex] = `${indent}${keyPart}=${formattedValue}`;
                  console.log(`[MetadataManager] Reverted line ${mod.line}: "${currentLine}" -> "${newLines[lineIndex]}"`);
                } else {
                  // Standard properties format: key=value or key:value
                  const propsMatch = currentLine.match(/^(\s*)([^=:]+)[=:]/);
                  if (propsMatch) {
                    const indent = propsMatch[1];
                    const key = propsMatch[2];
                    const separator = currentLine.includes(":") && !currentLine.match(/^[BIDSFL]:/) ? ":" : "=";
                    newLines[lineIndex] = `${indent}${key}${separator}${mod.oldValue}`;
                    console.log(`[MetadataManager] Reverted line ${mod.line}: "${currentLine}" -> "${newLines[lineIndex]}"`);
                  }
                }
              }
            }
            await fs.writeFile(fullPath, newLines.join("\n"));
          }

          console.log(`[MetadataManager] Reverted config file: ${filePath}`);
        } catch (err) {
          console.error(`[MetadataManager] Failed to revert ${filePath}:`, err);
        }
      }

      // Remove uncommitted changes from the file (keep committed ones)
      const committedChanges = changeSets.filter((cs: any) => cs.committed);
      if (committedChanges.length > 0) {
        await fs.writeFile(configChangesPath, JSON.stringify(committedChanges, null, 2));
      } else {
        // No committed changes, remove the file entirely
        await fs.remove(configChangesPath);
      }

      console.log(`[MetadataManager] Reverted ${uncommittedChanges.length} uncommitted config change sets`);
    } catch (err) {
      console.error("[MetadataManager] Error reverting instance config changes:", err);
    }
  }

  /**
   * Set a nested value in an object using dot-notation path
   */
  private setNestedValue(obj: any, keyPath: string, value: any): void {
    const keys = keyPath.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      // Handle array indices like "items[0]"
      const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = current[arrayMatch[1]][parseInt(arrayMatch[2])];
      } else {
        current = current[key];
      }
      if (current === undefined) return;
    }
    const lastKey = keys[keys.length - 1];
    const arrayMatch = lastKey.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      current[arrayMatch[1]][parseInt(arrayMatch[2])] = value;
    } else {
      current[lastKey] = value;
    }
  }

  /**
   * Format a value for TOML output
   */
  private formatTomlValue(value: any): string {
    if (typeof value === "string") {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    } else if (typeof value === "boolean") {
      return value ? "true" : "false";
    } else if (typeof value === "number") {
      return String(value);
    } else if (Array.isArray(value)) {
      return `[${value.map(v => this.formatTomlValue(v)).join(", ")}]`;
    }
    return String(value);
  }

  /**
   * Check if a directory has any config files
   */
  private async hasConfigFiles(dir: string): Promise<boolean> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "snapshots") continue;
      if (entry.isDirectory()) {
        const hasFiles = await this.hasConfigFiles(path.join(dir, entry.name));
        if (hasFiles) return true;
      } else {
        return true;
      }
    }
    return false;
  }

  /**
   * Compute a hash of all files in a directory
   * Optimized: Uses file stats (mtime + size) for faster comparison instead of reading file contents
   */
  private async computeDirectoryHash(dir: string, exclude: string[]): Promise<string> {
    const fileInfos: string[] = [];

    const collectFiles = async (currentPath: string, relativePath: string = ""): Promise<void> => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Sort entries for consistent ordering
      entries.sort((a, b) => a.name.localeCompare(b.name));

      const tasks = entries
        .filter(entry => !exclude.includes(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(currentPath, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await collectFiles(fullPath, relPath);
          } else {
            // Use stat instead of reading file content for speed
            const stat = await fs.stat(fullPath);
            // Include path, size, and mtime for change detection
            fileInfos.push(`${relPath}:${stat.size}:${stat.mtimeMs.toFixed(0)}`);
          }
        });

      await Promise.all(tasks);
    };

    await collectFiles(dir);

    // Sort for consistent ordering (parallel processing may change order)
    fileInfos.sort();

    // Combine all file info into one hash
    return crypto.createHash("md5").update(fileInfos.join("|")).digest("hex");
  }

  /**
   * Create a config snapshot for version control
   * Copies current overrides to a versioned snapshot folder
   * Optimized with parallel file copying
   */
  async createConfigSnapshot(modpackId: string, versionId: string): Promise<string | null> {
    const overridesPath = this.getOverridesPath(modpackId);

    // Check if there are any overrides to snapshot
    if (!(await fs.pathExists(overridesPath))) {
      return null;
    }

    const snapshotId = `${versionId}-${Date.now()}`;
    const snapshotsDir = path.join(this.overridesDir, modpackId, "snapshots");
    const snapshotPath = path.join(snapshotsDir, snapshotId);

    try {
      await fs.ensureDir(snapshotPath);

      // Copy only the config folders (not the snapshots folder itself)
      const entries = await fs.readdir(overridesPath, { withFileTypes: true });
      const copyPromises = entries
        .filter(entry => entry.name !== "snapshots")
        .map(entry => {
          const srcPath = path.join(overridesPath, entry.name);
          const destPath = path.join(snapshotPath, entry.name);
          return fs.copy(srcPath, destPath);
        });

      // Copy all entries in parallel
      await Promise.all(copyPromises);

      return snapshotId;
    } catch (error) {
      console.error(`Failed to create config snapshot for ${modpackId}:`, error);
      return null;
    }
  }

  /**
   * Restore a config snapshot (for rollback)
   * Optimized with parallel operations
   */
  async restoreConfigSnapshot(modpackId: string, snapshotId: string): Promise<boolean> {
    const snapshotPath = path.join(this.overridesDir, modpackId, "snapshots", snapshotId);
    const overridesPath = this.getOverridesPath(modpackId);

    if (!(await fs.pathExists(snapshotPath))) {
      console.error(`Config snapshot ${snapshotId} not found for modpack ${modpackId}`);
      return false;
    }

    try {
      // Remove current config folders in parallel (but keep snapshots)
      const entries = await fs.readdir(overridesPath, { withFileTypes: true });
      await Promise.all(
        entries
          .filter(entry => entry.name !== "snapshots")
          .map(entry => fs.remove(path.join(overridesPath, entry.name)))
      );

      // Copy snapshot content back in parallel
      const snapshotEntries = await fs.readdir(snapshotPath, { withFileTypes: true });
      await Promise.all(
        snapshotEntries.map(entry => {
          const srcPath = path.join(snapshotPath, entry.name);
          const destPath = path.join(overridesPath, entry.name);
          return fs.copy(srcPath, destPath);
        })
      );

      return true;
    } catch (error) {
      console.error(`Failed to restore config snapshot ${snapshotId}:`, error);
      return false;
    }
  }

  /**
   * List config snapshots for a modpack
   */
  async listConfigSnapshots(modpackId: string): Promise<Array<{ id: string; createdAt: Date }>> {
    const snapshotsDir = path.join(this.overridesDir, modpackId, "snapshots");

    if (!(await fs.pathExists(snapshotsDir))) {
      return [];
    }

    try {
      const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
      const snapshots = await Promise.all(
        entries
          .filter(e => e.isDirectory())
          .map(async (entry) => {
            const stat = await fs.stat(path.join(snapshotsDir, entry.name));
            return {
              id: entry.name,
              createdAt: stat.birthtime
            };
          })
      );
      return snapshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error(`Failed to list config snapshots for ${modpackId}:`, error);
      return [];
    }
  }

  // ==================== MODPACK-MOD RELATIONS ====================

  async getModsInModpack(modpackId: string): Promise<Mod[]> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return [];

    const library = await this.loadLibrary();
    const modIds = new Set(modpack.mod_ids);

    console.log(`[getModsInModpack] Modpack ${modpackId} has ${modpack.mod_ids.length} mod_ids`);
    console.log(`[getModsInModpack] disabled_mod_ids: ${JSON.stringify(modpack.disabled_mod_ids)}`);

    const result = library.mods
      .filter((m) => modIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`[getModsInModpack] Found ${result.length} mods in library matching mod_ids`);

    // Log any missing mods
    const foundIds = new Set(result.map(m => m.id));
    const missingIds = modpack.mod_ids.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      console.log(`[getModsInModpack] WARNING: ${missingIds.length} mod_ids not found in library: ${missingIds.join(', ')}`);
    }

    return result;
  }

  /**
   * Batch get mods for multiple modpacks in a single library load.
   * Returns a map of modpackId -> Mod[]
   */
  async getModsInMultipleModpacks(modpackIds: string[]): Promise<Map<string, Mod[]>> {
    const result = new Map<string, Mod[]>();
    if (modpackIds.length === 0) return result;

    // Load library and modpacks once
    const library = await this.loadLibrary();
    const modpacks = await this.getAllModpacks();

    // Create a map of mod id -> mod for fast lookup
    const modById = new Map<string, Mod>();
    for (const mod of library.mods) {
      modById.set(mod.id, mod);
    }

    // Process each modpack
    for (const modpackId of modpackIds) {
      const modpack = modpacks.find(p => p.id === modpackId);
      if (!modpack) {
        result.set(modpackId, []);
        continue;
      }

      const mods: Mod[] = [];
      for (const modId of modpack.mod_ids) {
        const mod = modById.get(modId);
        if (mod) {
          mods.push(mod);
        }
      }

      // Sort by name
      mods.sort((a, b) => a.name.localeCompare(b.name));
      result.set(modpackId, mods);
    }

    return result;
  }

  async addModToModpack(modpackId: string, modId: string, disabled: boolean = false): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    // Check mod exists
    const modToAdd = await this.getModById(modId);
    if (!modToAdd) return false;

    // Already in modpack?
    if (modpack.mod_ids.includes(modId)) return true;

    // Check for conflicts (same project, different version)
    const currentMods = await this.getModsInModpack(modpackId);
    const modsToRemove: string[] = [];

    for (const existingMod of currentMods) {
      // Check CurseForge conflict
      if (
        modToAdd.source === "curseforge" &&
        existingMod.source === "curseforge" &&
        modToAdd.cf_project_id &&
        existingMod.cf_project_id === modToAdd.cf_project_id
      ) {
        console.log(
          `[MetadataManager] Replacing existing version of ${existingMod.name} (ID: ${existingMod.id}) with new version (ID: ${modId})`
        );
        modsToRemove.push(existingMod.id);
      }
      // Check Modrinth conflict
      else if (
        modToAdd.source === "modrinth" &&
        existingMod.source === "modrinth" &&
        modToAdd.mr_project_id &&
        existingMod.mr_project_id === modToAdd.mr_project_id
      ) {
        console.log(
          `[MetadataManager] Replacing existing version of ${existingMod.name} (ID: ${existingMod.id}) with new version (ID: ${modId})`
        );
        modsToRemove.push(existingMod.id);
      }
    }

    // Remove conflicting mods
    if (modsToRemove.length > 0) {
      modpack.mod_ids = modpack.mod_ids.filter(
        (id) => !modsToRemove.includes(id)
      );
      // Also clean up disabled list
      if (modpack.disabled_mod_ids) {
        modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(
          (id) => !modsToRemove.includes(id)
        );
      }
    }

    modpack.mod_ids.push(modId);
    console.log(`[addModToModpack] Added ${modId} to modpack ${modpackId}, now has ${modpack.mod_ids.length} mods`);

    // Handle disabled state
    if (disabled) {
      if (!modpack.disabled_mod_ids) {
        modpack.disabled_mod_ids = [];
      }
      if (!modpack.disabled_mod_ids.includes(modId)) {
        modpack.disabled_mod_ids.push(modId);
        console.log(`[addModToModpack] Marked ${modId} as disabled`);
      }
    }

    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  /**
   * Add multiple mods to a modpack in a single batch operation
   * This is much faster than calling addModToModpack individually
   */
  async addModsToModpackBatch(modpackId: string, modIds: string[]): Promise<number> {
    if (modIds.length === 0) return 0;

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return 0;

    // Pre-fetch all mods at once
    const library = await this.loadLibrary();
    const modsMap = new Map(library.mods.map(m => [m.id, m]));

    // Track existing mods in modpack by project ID for conflict detection
    const existingByProjectId = new Map<number | string, string>();
    for (const existingModId of modpack.mod_ids) {
      const existingMod = modsMap.get(existingModId);
      if (existingMod) {
        if (existingMod.source === "curseforge" && existingMod.cf_project_id) {
          existingByProjectId.set(existingMod.cf_project_id, existingModId);
        } else if (existingMod.source === "modrinth" && existingMod.mr_project_id) {
          existingByProjectId.set(existingMod.mr_project_id, existingModId);
        }
      }
    }

    const modsToRemove = new Set<string>();
    const modsToAdd: string[] = [];
    const existingModIds = new Set(modpack.mod_ids);

    for (const modId of modIds) {
      // Check mod exists
      const modToAdd = modsMap.get(modId);
      if (!modToAdd) continue;

      // Already in modpack?
      if (existingModIds.has(modId)) continue;

      // Check for conflicts (same project, different version)
      let conflictId: string | undefined;
      if (modToAdd.source === "curseforge" && modToAdd.cf_project_id) {
        conflictId = existingByProjectId.get(modToAdd.cf_project_id);
      } else if (modToAdd.source === "modrinth" && modToAdd.mr_project_id) {
        conflictId = existingByProjectId.get(modToAdd.mr_project_id);
      }

      if (conflictId && conflictId !== modId) {
        modsToRemove.add(conflictId);
        // Update the index for subsequent conflicts
        if (modToAdd.source === "curseforge" && modToAdd.cf_project_id) {
          existingByProjectId.set(modToAdd.cf_project_id, modId);
        } else if (modToAdd.source === "modrinth" && modToAdd.mr_project_id) {
          existingByProjectId.set(modToAdd.mr_project_id, modId);
        }
      }

      modsToAdd.push(modId);
      existingModIds.add(modId);
    }

    // Remove conflicting mods
    if (modsToRemove.size > 0) {
      modpack.mod_ids = modpack.mod_ids.filter(id => !modsToRemove.has(id));
      if (modpack.disabled_mod_ids) {
        modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(id => !modsToRemove.has(id));
      }
    }

    // Add new mods
    modpack.mod_ids.push(...modsToAdd);
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return modsToAdd.length;
  }

  /**
   * Check which mods depend on a given mod
   * Returns list of dependent mods that would break if this mod is removed
   */
  async checkModDependents(
    modpackId: string,
    modId: string
  ): Promise<Array<{ id: string; name: string; dependencyType: string }>> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return [];

    const modToRemove = await this.getModById(modId);
    if (!modToRemove) return [];

    const dependents: Array<{ id: string; name: string; dependencyType: string }> = [];
    const library = await this.loadLibrary();

    // Check all mods in this modpack for dependencies on the mod being removed
    for (const packModId of modpack.mod_ids) {
      if (packModId === modId) continue; // Skip self

      const mod = library.mods.find(m => m.id === packModId);
      if (!mod || !mod.dependencies) continue;

      // Check if this mod depends on the mod being removed
      for (const dep of mod.dependencies) {
        const depMatches =
          (modToRemove.cf_project_id && dep.modId === modToRemove.cf_project_id) ||
          (modToRemove.mr_project_id && dep.modId === modToRemove.mr_project_id);

        if (depMatches && dep.type === "required") {
          dependents.push({
            id: mod.id,
            name: mod.name,
            dependencyType: dep.type
          });
          break; // Only add once per mod
        }
      }
    }

    return dependents;
  }

  /**
   * Analyze the full impact of removing or disabling a mod
   * Returns both mods that depend on this one AND any dependencies that will be orphaned
   */
  async analyzeModRemovalImpact(
    modpackId: string,
    modId: string,
    action: "remove" | "disable"
  ): Promise<{
    modToAffect: { id: string; name: string } | null;
    dependentMods: Array<{ id: string; name: string; willBreak: boolean }>;
    orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
    warnings: string[];
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) {
      return { modToAffect: null, dependentMods: [], orphanedDependencies: [], warnings: ["Modpack not found"] };
    }

    const modToAffect = await this.getModById(modId);
    if (!modToAffect) {
      return { modToAffect: null, dependentMods: [], orphanedDependencies: [], warnings: ["Mod not found"] };
    }

    const library = await this.loadLibrary();
    const packModIds = new Set(modpack.mod_ids);
    const disabledModIds = new Set(modpack.disabled_mod_ids || []);

    const dependentMods: Array<{ id: string; name: string; willBreak: boolean }> = [];
    const orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }> = [];
    const warnings: string[] = [];

    // 1. Find mods that depend on this mod (will break if removed/disabled)
    for (const packModId of packModIds) {
      if (packModId === modId) continue;

      const mod = library.mods.find(m => m.id === packModId);
      if (!mod || !mod.dependencies) continue;

      for (const dep of mod.dependencies) {
        const depMatches =
          (modToAffect.cf_project_id && dep.modId === modToAffect.cf_project_id) ||
          (modToAffect.mr_project_id && dep.modId === modToAffect.mr_project_id);

        if (depMatches && dep.type === "required") {
          const isModDisabled = disabledModIds.has(mod.id);
          dependentMods.push({
            id: mod.id,
            name: mod.name,
            // Will break only if the dependent mod is currently enabled
            willBreak: !isModDisabled
          });
          break;
        }
      }
    }

    // 2. Find dependencies of the mod being removed that might become orphaned
    if (modToAffect.dependencies) {
      for (const dep of modToAffect.dependencies) {
        if (dep.type !== "required") continue;

        // Find the dependency mod in the pack
        const depMod = library.mods.find(m =>
          packModIds.has(m.id) &&
          (m.cf_project_id === dep.modId || m.mr_project_id === dep.modId)
        );

        if (depMod) {
          // Check if any other mod in the pack uses this dependency
          let usedByOthers = false;
          for (const otherModId of packModIds) {
            if (otherModId === modId || otherModId === depMod.id) continue;

            const otherMod = library.mods.find(m => m.id === otherModId);
            if (otherMod?.dependencies) {
              for (const otherDep of otherMod.dependencies) {
                if (otherDep.modId === dep.modId && otherDep.type === "required") {
                  usedByOthers = true;
                  break;
                }
              }
            }
            if (usedByOthers) break;
          }

          orphanedDependencies.push({
            id: depMod.id,
            name: depMod.name,
            usedByOthers
          });
        }
      }
    }

    // Generate warnings
    if (dependentMods.filter(d => d.willBreak).length > 0) {
      warnings.push(
        `${dependentMods.filter(d => d.willBreak).length} mod(s) depend on this mod and may not work correctly`
      );
    }

    const orphanedNotUsed = orphanedDependencies.filter(d => !d.usedByOthers);
    if (orphanedNotUsed.length > 0 && action === "remove") {
      warnings.push(
        `${orphanedNotUsed.length} dependency mod(s) may no longer be needed`
      );
    }

    return {
      modToAffect: { id: modToAffect.id, name: modToAffect.name },
      dependentMods,
      orphanedDependencies,
      warnings
    };
  }

  async removeModFromModpack(
    modpackId: string,
    modId: string
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const initialLength = modpack.mod_ids.length;
    modpack.mod_ids = modpack.mod_ids.filter((id) => id !== modId);

    // Also remove from disabled list if present
    if (modpack.disabled_mod_ids) {
      modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(
        (id) => id !== modId
      );
    }

    if (modpack.mod_ids.length === initialLength) return false;

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  /**
   * Replace one mod with another in a modpack
   * Used for updating mods (old version -> new version)
   */
  async replaceModInModpack(
    modpackId: string,
    oldModId: string,
    newModId: string
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    // Check if old mod is in the pack
    const oldIndex = modpack.mod_ids.indexOf(oldModId);
    if (oldIndex < 0) return false;

    // Check if new mod is already in the pack (avoid duplicates)
    if (modpack.mod_ids.includes(newModId)) {
      // Just remove the old one
      modpack.mod_ids = modpack.mod_ids.filter(id => id !== oldModId);
    } else {
      // Replace old with new at the same position
      modpack.mod_ids[oldIndex] = newModId;
    }

    // If old mod was disabled, make new mod disabled too
    if (modpack.disabled_mod_ids?.includes(oldModId)) {
      modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(id => id !== oldModId);
      if (!modpack.disabled_mod_ids.includes(newModId)) {
        modpack.disabled_mod_ids.push(newModId);
      }
    }

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  /**
   * Toggle a mod's enabled/disabled state in a modpack
   * Disabled mods remain in the pack but won't be included in exports
   */
  async toggleModInModpack(
    modpackId: string,
    modId: string
  ): Promise<{ enabled: boolean } | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    // Check if mod is in the pack
    if (!modpack.mod_ids.includes(modId)) return null;

    // Initialize disabled_mod_ids if not present
    if (!modpack.disabled_mod_ids) {
      modpack.disabled_mod_ids = [];
    }

    let enabled: boolean;
    if (modpack.disabled_mod_ids.includes(modId)) {
      // Currently disabled, enable it
      modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(
        (id) => id !== modId
      );
      enabled = true;
    } else {
      // Currently enabled, disable it
      modpack.disabled_mod_ids.push(modId);
      enabled = false;
    }

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    return { enabled };
  }

  /**
   * Set a mod's enabled state in a modpack
   */
  async setModEnabledInModpack(
    modpackId: string,
    modId: string,
    enabled: boolean
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    // Check if mod is in the pack
    if (!modpack.mod_ids.includes(modId)) return false;

    // Initialize disabled_mod_ids if not present
    if (!modpack.disabled_mod_ids) {
      modpack.disabled_mod_ids = [];
    }

    const isCurrentlyDisabled = modpack.disabled_mod_ids.includes(modId);

    if (enabled && isCurrentlyDisabled) {
      // Enable the mod
      modpack.disabled_mod_ids = modpack.disabled_mod_ids.filter(
        (id) => id !== modId
      );
    } else if (!enabled && !isCurrentlyDisabled) {
      // Disable the mod
      modpack.disabled_mod_ids.push(modId);
    } else {
      // No change needed
      return true;
    }

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  /**
   * Get the list of disabled mod IDs for a modpack
   */
  async getDisabledMods(modpackId: string): Promise<string[]> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return [];
    return modpack.disabled_mod_ids || [];
  }

  /**
   * Get the list of locked mod IDs for a modpack
   */
  async getLockedMods(modpackId: string): Promise<string[]> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return [];
    return modpack.locked_mod_ids || [];
  }

  /**
   * Set locked status for a mod
   */
  async setModLocked(modpackId: string, modId: string, locked: boolean): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    if (!modpack.locked_mod_ids) {
      modpack.locked_mod_ids = [];
    }

    const isCurrentlyLocked = modpack.locked_mod_ids.includes(modId);

    if (locked && !isCurrentlyLocked) {
      modpack.locked_mod_ids.push(modId);
    } else if (!locked && isCurrentlyLocked) {
      modpack.locked_mod_ids = modpack.locked_mod_ids.filter(id => id !== modId);
    } else {
      return true; // Already in desired state
    }

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  /**
   * Update locked mod IDs for a modpack
   */
  async updateLockedMods(modpackId: string, lockedModIds: string[]): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    modpack.locked_mod_ids = lockedModIds;
    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  // ==================== VERSION CONTROL ====================

  private getVersionHistoryPath(modpackId: string): string {
    return path.join(this.versionsDir, `${modpackId}.json`);
  }

  /**
   * Get version history for a modpack
   */
  async getVersionHistory(
    modpackId: string
  ): Promise<ModpackVersionHistory | null> {
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
  private async saveVersionHistory(
    history: ModpackVersionHistory
  ): Promise<void> {
    const historyPath = this.getVersionHistoryPath(history.modpack_id);
    await this.safeWriteJson(historyPath, history);
  }

  /**
   * Import version history from remote manifest
   */
  async importVersionHistory(
    modpackId: string,
    versions: ModpackVersion[]
  ): Promise<void> {
    if (!versions || versions.length === 0) {
      // No versions to import, initialize fresh
      await this.initializeVersionControl(modpackId, "Initial import from remote");
      return;
    }

    // Find the latest version ID
    const sortedVersions = [...versions].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const currentVersionId = sortedVersions[0].id;

    const history: ModpackVersionHistory = {
      modpack_id: modpackId,
      current_version_id: currentVersionId,
      versions: versions,
    };

    await this.saveVersionHistory(history);
  }

  /**
   * Initialize version control for a modpack (create first version)
   */
  async initializeVersionControl(
    modpackId: string,
    message: string = "Initial version"
  ): Promise<ModpackVersion | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    // Check if already initialized
    const existing = await this.getVersionHistory(modpackId);
    if (existing && existing.versions.length > 0) {
      console.log(`Version control already initialized for ${modpackId}`);
      return existing.versions[existing.versions.length - 1];
    }

    // Create snapshots of CF mods for potential rollback restoration
    const library = await this.loadLibrary();
    const modSnapshots = modpack.mod_ids
      .map((modId) => {
        const mod = library.mods.find((m) => m.id === modId);
        if (
          mod &&
          mod.source === "curseforge" &&
          mod.cf_project_id &&
          mod.cf_file_id
        ) {
          return {
            id: mod.id,
            name: mod.name,
            version: mod.version,
            cf_project_id: mod.cf_project_id,
            cf_file_id: mod.cf_file_id,
          };
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const versionId = `v1`;

    // Create config snapshot for the initial version
    const configSnapshotId = await this.createConfigSnapshot(modpackId, versionId);

    const version: ModpackVersion = {
      id: versionId,
      tag: modpack.version || "1.0.0",
      message,
      created_at: new Date().toISOString(),
      changes: [],
      mod_ids: [...modpack.mod_ids],
      disabled_mod_ids: [...(modpack.disabled_mod_ids || [])],
      locked_mod_ids: [...(modpack.locked_mod_ids || [])],
      loader: modpack.loader,
      loader_version: modpack.loader_version,
      mod_snapshots: modSnapshots,
      config_snapshot_id: configSnapshotId || undefined,
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
   * @param modpackId - The modpack ID
   * @param message - Version message
   * @param tag - Optional version tag
   * @param hasConfigChanges - If true, create version even if only configs changed
   * @param forceCreate - If true, always create a new version (for rollbacks)
   */
  async createVersion(
    modpackId: string,
    message: string,
    tag?: string,
    hasConfigChanges?: boolean,
    forceCreate?: boolean
  ): Promise<ModpackVersion | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    let history = await this.getVersionHistory(modpackId);

    // Auto-initialize if no history exists
    if (!history) {
      const initialVersion = await this.initializeVersionControl(
        modpackId,
        "Initial version"
      );
      if (!initialVersion) return null;
      history = await this.getVersionHistory(modpackId);
      if (!history) return null;
    }

    const currentVersion = history.versions.find(
      (v) => v.id === history!.current_version_id
    );
    if (!currentVersion) return null;

    // Calculate changes from current version (including disabled state changes)
    const library = await this.loadLibrary();
    const modChanges = this.calculateChanges(
      currentVersion.mod_ids,
      modpack.mod_ids,
      library,
      currentVersion.mod_snapshots // Pass snapshots to detect version updates
    );
    const disabledChanges = this.calculateDisabledChanges(
      currentVersion.disabled_mod_ids || [],
      modpack.disabled_mod_ids || [],
      library
    );
    const lockedChanges = this.calculateLockedChanges(
      currentVersion.locked_mod_ids || [],
      modpack.locked_mod_ids || [],
      library
    );
    const changes = [...modChanges, ...disabledChanges, ...lockedChanges];

    // Check for loader changes
    const savedLoader = currentVersion.loader || modpack.loader;
    const savedLoaderVersion = currentVersion.loader_version;
    const currentLoader = modpack.loader;
    const currentLoaderVersion = modpack.loader_version;

    if (savedLoader !== currentLoader || savedLoaderVersion !== currentLoaderVersion) {
      const oldLoaderStr = savedLoaderVersion ? `${savedLoader} ${savedLoaderVersion}` : savedLoader;
      const newLoaderStr = currentLoaderVersion ? `${currentLoader} ${currentLoaderVersion}` : currentLoader;
      changes.push({
        type: "loader_change" as const,
        modId: "_loader_",
        modName: "Mod Loader",
        previousVersion: oldLoaderStr,
        newVersion: newLoaderStr
      });
    }

    // If no mod changes and no config changes flag and not forced, don't create a new version
    if (changes.length === 0 && !hasConfigChanges && !forceCreate) {
      console.log(`No changes detected for modpack ${modpackId}`);
      return currentVersion;
    }

    // Add config changes marker if flagged
    if (hasConfigChanges && changes.length === 0) {
      changes.push({
        type: "update" as const,
        modId: "_configs_",
        modName: "Configuration files",
      });
    }

    // For forced creation (rollbacks), add a rollback marker if no other changes
    if (forceCreate && changes.length === 0) {
      changes.push({
        type: "update" as const,
        modId: "_rollback_",
        modName: "Rollback operation",
      });
    }

    // Generate next version ID
    const nextVersionNumber = history.versions.length + 1;
    const versionId = `v${nextVersionNumber}`;

    // Generate tag if not provided
    const versionTag = tag || this.generateNextTag(currentVersion.tag);

    // Create snapshots of CF mods for potential rollback restoration
    const modSnapshots = modpack.mod_ids
      .map((modId) => {
        const mod = library.mods.find((m) => m.id === modId);
        if (
          mod &&
          mod.source === "curseforge" &&
          mod.cf_project_id &&
          mod.cf_file_id
        ) {
          return {
            id: mod.id,
            name: mod.name,
            version: mod.version,
            cf_project_id: mod.cf_project_id,
            cf_file_id: mod.cf_file_id,
          };
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Create config snapshot if modpack has overrides
    const configSnapshotId = await this.createConfigSnapshot(modpackId, versionId);

    // Get uncommitted config changes to store in the version
    const configChanges = await this.getUncommittedConfigChanges(modpackId);

    const newVersion: ModpackVersion = {
      id: versionId,
      tag: versionTag,
      message,
      created_at: new Date().toISOString(),
      changes,
      mod_ids: [...modpack.mod_ids],
      disabled_mod_ids: [...(modpack.disabled_mod_ids || [])],
      locked_mod_ids: [...(modpack.locked_mod_ids || [])],
      loader: modpack.loader,
      loader_version: modpack.loader_version,
      parent_id: currentVersion.id,
      mod_snapshots: modSnapshots,
      config_snapshot_id: configSnapshotId || undefined,
      config_changes: configChanges.length > 0 ? configChanges : undefined,
    };

    history.versions.push(newVersion);
    history.current_version_id = versionId;

    await this.saveVersionHistory(history);

    // Update modpack version to match
    await this.updateModpack(modpackId, { version: versionTag });

    // Mark config changes as committed in the instance
    await this.markConfigChangesAsCommitted(modpackId, versionId);

    return newVersion;
  }

  /**
   * Mark all uncommitted config changes as committed
   */
  private async markConfigChangesAsCommitted(modpackId: string, versionId: string): Promise<void> {
    try {
      if (!this.instanceService) {
        console.warn("[MetadataManager] InstanceService not set, cannot mark config changes");
        return;
      }
      const instance = await this.instanceService.getInstanceByModpack(modpackId);
      if (!instance) return;

      const configChangesPath = path.join(instance.path, ".modex-changes", "config-changes.json");
      if (!await fs.pathExists(configChangesPath)) return;

      const changeSets = JSON.parse(await fs.readFile(configChangesPath, "utf-8"));
      let modified = false;

      for (const changeSet of changeSets) {
        if (!changeSet.committed) {
          changeSet.committed = true;
          changeSet.commitVersionId = versionId;
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(configChangesPath, JSON.stringify(changeSets, null, 2));
      }
    } catch (err) {
      console.error("Error marking config changes as committed:", err);
    }
  }

  /**
   * Get uncommitted config changes for a modpack
   */
  private async getUncommittedConfigChanges(modpackId: string): Promise<Array<{
    filePath: string;
    keyPath: string;
    line?: number;
    oldValue: any;
    newValue: any;
  }>> {
    const configChanges: Array<{
      filePath: string;
      keyPath: string;
      line?: number;
      oldValue: any;
      newValue: any;
    }> = [];

    try {
      if (!this.instanceService) return configChanges;

      const instance = await this.instanceService.getInstanceByModpack(modpackId);
      if (!instance) return configChanges;

      const configChangesPath = path.join(instance.path, ".modex-changes", "config-changes.json");
      if (!await fs.pathExists(configChangesPath)) return configChanges;

      const changeSets = JSON.parse(await fs.readFile(configChangesPath, "utf-8"));
      const uncommittedChanges = changeSets.filter((cs: any) => !cs.committed);

      for (const changeSet of uncommittedChanges) {
        for (const mod of changeSet.modifications) {
          configChanges.push({
            filePath: mod.filePath,
            keyPath: mod.keyPath,
            line: mod.line,
            oldValue: mod.oldValue,
            newValue: mod.newValue,
          });
        }
      }
    } catch (err) {
      console.error("Error getting uncommitted config changes:", err);
    }

    return configChanges;
  }

  /**
   * Calculate changes between two mod_ids arrays
   * Also detects mod version updates by comparing cf_file_id from snapshots
   */
  private calculateChanges(
    oldModIds: string[],
    newModIds: string[],
    library: LibraryData,
    oldSnapshots?: Array<{ id: string; name: string; version?: string; cf_project_id: number; cf_file_id: number }>
  ): ModpackChange[] {
    const changes: ModpackChange[] = [];
    const oldSet = new Set(oldModIds);
    const newSet = new Set(newModIds);
    const modMap = new Map(library.mods.map((m) => [m.id, m]));
    const snapshotMap = new Map(oldSnapshots?.map(s => [s.id, s]) || []);

    // Build maps by cf_project_id for detecting updates (same project, different file)
    const snapshotByProjectId = new Map(
      oldSnapshots?.filter(s => s.cf_project_id).map(s => [s.cf_project_id, s]) || []
    );
    const currentModsByProjectId = new Map<number, typeof library.mods[0]>();
    for (const modId of newModIds) {
      const mod = modMap.get(modId);
      if (mod?.cf_project_id) {
        currentModsByProjectId.set(mod.cf_project_id, mod);
      }
    }

    // Track which project IDs are updates (to exclude from add/remove)
    const updatedProjectIds = new Set<number>();

    // First pass: detect updates (same cf_project_id, different ID/file)
    for (const modId of newModIds) {
      const mod = modMap.get(modId);
      if (!mod?.cf_project_id) continue;

      const oldSnapshot = snapshotByProjectId.get(mod.cf_project_id);
      if (oldSnapshot && oldSnapshot.id !== modId) {
        // Same project, different ID = update
        updatedProjectIds.add(mod.cf_project_id);
        const prevVersion = oldSnapshot.version || `file:${oldSnapshot.cf_file_id}`;
        const newVersion = mod.version || `file:${mod.cf_file_id}`;
        changes.push({
          type: "update",
          modId,
          modName: mod.name || modId,
          previousVersion: prevVersion,
          newVersion: newVersion,
          previousFileId: oldSnapshot.cf_file_id,
          newFileId: mod.cf_file_id,
        });
      }
    }

    // Find removed mods (excluding updates)
    for (const modId of oldModIds) {
      if (!newSet.has(modId)) {
        const snapshot = snapshotMap.get(modId);
        // Skip if this was replaced by an update
        if (snapshot?.cf_project_id && updatedProjectIds.has(snapshot.cf_project_id)) continue;

        const mod = modMap.get(modId);
        changes.push({
          type: "remove",
          modId,
          modName: mod?.name || snapshot?.name || modId,
          previousVersion: mod?.version || snapshot?.version,
        });
      }
    }

    // Find added mods (excluding updates)
    for (const modId of newModIds) {
      if (!oldSet.has(modId)) {
        const mod = modMap.get(modId);
        // Skip if this is an update
        if (mod?.cf_project_id && updatedProjectIds.has(mod.cf_project_id)) continue;

        changes.push({
          type: "add",
          modId,
          modName: mod?.name || modId,
          newVersion: mod?.version,
        });
      }
    }

    // Find updated mods with same ID but different cf_file_id (edge case: in-place update)
    for (const modId of newModIds) {
      if (oldSet.has(modId)) {
        const mod = modMap.get(modId);
        const snapshot = snapshotMap.get(modId);

        if (mod && snapshot && mod.cf_file_id && snapshot.cf_file_id) {
          if (mod.cf_file_id !== snapshot.cf_file_id) {
            // Check if already tracked
            if (!changes.find(c => c.modId === modId && c.type === "update")) {
              const prevVersion = snapshot.version || `file:${snapshot.cf_file_id}`;
              const newVersion = mod.version || `file:${mod.cf_file_id}`;
              changes.push({
                type: "update",
                modId,
                modName: mod.name || modId,
                previousVersion: prevVersion,
                newVersion: newVersion,
                previousFileId: snapshot.cf_file_id,
                newFileId: mod.cf_file_id,
              });
            }
          }
        }
      }
    }

    return changes;
  }

  /**
   * Calculate enable/disable changes between two disabled_mod_ids arrays
   */
  private calculateDisabledChanges(
    oldDisabledIds: string[],
    newDisabledIds: string[],
    library: LibraryData
  ): ModpackChange[] {
    const changes: ModpackChange[] = [];
    const oldSet = new Set(oldDisabledIds);
    const newSet = new Set(newDisabledIds);
    const modMap = new Map(library.mods.map((m) => [m.id, m]));

    // Find newly disabled mods (in new but not in old)
    for (const modId of newDisabledIds) {
      if (!oldSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "disable",
          modId,
          modName: mod?.name || modId,
        });
      }
    }

    // Find newly enabled mods (was in old disabled, not in new disabled)
    for (const modId of oldDisabledIds) {
      if (!newSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "enable",
          modId,
          modName: mod?.name || modId,
        });
      }
    }

    return changes;
  }

  /**
   * Calculate lock/unlock changes between two locked_mod_ids arrays
   */
  private calculateLockedChanges(
    oldLockedIds: string[],
    newLockedIds: string[],
    library: LibraryData
  ): ModpackChange[] {
    const changes: ModpackChange[] = [];
    const oldSet = new Set(oldLockedIds);
    const newSet = new Set(newLockedIds);
    const modMap = new Map(library.mods.map((m) => [m.id, m]));

    // Find newly locked mods (in new but not in old)
    for (const modId of newLockedIds) {
      if (!oldSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "lock",
          modId,
          modName: mod?.name || modId,
        });
      }
    }

    // Find newly unlocked mods (was in old locked, not in new locked)
    for (const modId of oldLockedIds) {
      if (!newSet.has(modId)) {
        const mod = modMap.get(modId);
        changes.push({
          type: "unlock",
          modId,
          modName: mod?.name || modId,
        });
      }
    }

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
   * Validate that mods in a version can be restored (exist in library or on CF)
   * Returns info about which mods are available and which are missing
   */
  async validateRollbackMods(
    modpackId: string,
    versionId: string
  ): Promise<{
    valid: boolean;
    availableMods: Array<{ id: string; name: string }>;
    missingMods: Array<{ id: string; name: string; reason: string }>;
    brokenDependencies: Array<{ modId: string; modName: string; dependsOn: string }>;
  }> {
    const history = await this.getVersionHistory(modpackId);
    if (!history) {
      return { valid: false, availableMods: [], missingMods: [], brokenDependencies: [] };
    }

    const targetVersion = history.versions.find((v) => v.id === versionId);
    if (!targetVersion) {
      return { valid: false, availableMods: [], missingMods: [], brokenDependencies: [] };
    }

    const library = await this.loadLibrary();
    const availableMods: Array<{ id: string; name: string }> = [];
    const missingMods: Array<{ id: string; name: string; reason: string }> = [];

    // Check each mod in the version
    for (const modId of targetVersion.mod_ids) {
      const mod = library.mods.find(m => m.id === modId);

      if (mod) {
        // Mod exists in library
        availableMods.push({ id: mod.id, name: mod.name });
      } else {
        // Mod not in library - check if we have snapshot info
        const snapshot = targetVersion.mod_snapshots?.find(s => s.id === modId);
        if (snapshot) {
          missingMods.push({
            id: modId,
            name: snapshot.name,
            reason: "Mod no longer in library - will need to be re-downloaded from CurseForge"
          });
        } else {
          missingMods.push({
            id: modId,
            name: modId,
            reason: "Mod not found in library and no snapshot available for restoration"
          });
        }
      }
    }

    // Check for broken dependencies in the restored modpack
    const brokenDependencies: Array<{ modId: string; modName: string; dependsOn: string }> = [];
    const restoredModIds = new Set(targetVersion.mod_ids);

    for (const modId of targetVersion.mod_ids) {
      const mod = library.mods.find(m => m.id === modId);
      if (!mod || !mod.dependencies) continue;

      for (const dep of mod.dependencies) {
        if (dep.type !== "required") continue;

        // Check if the required dependency is in the restored mod list
        const depModInPack = library.mods.find(m =>
          restoredModIds.has(m.id) &&
          (m.cf_project_id === dep.modId || m.mr_project_id === dep.modId)
        );

        if (!depModInPack) {
          // Try to get dependency name
          const depMod = library.mods.find(m =>
            m.cf_project_id === dep.modId || m.mr_project_id === dep.modId
          );
          brokenDependencies.push({
            modId: mod.id,
            modName: mod.name,
            dependsOn: depMod?.name || `Project ID: ${dep.modId}`
          });
        }
      }
    }

    return {
      valid: missingMods.length === 0,
      availableMods,
      missingMods,
      brokenDependencies
    };
  }

  /**
   * Rollback modpack to a specific version
   */
  async rollbackToVersion(
    modpackId: string,
    versionId: string,
    options?: { restoreConfigs?: boolean }
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const history = await this.getVersionHistory(modpackId);
    if (!history) return false;

    const targetVersion = history.versions.find((v) => v.id === versionId);
    if (!targetVersion) return false;

    // Update modpack with the version's mod_ids, disabled_mod_ids, and locked_mod_ids
    modpack.mod_ids = [...targetVersion.mod_ids];
    modpack.disabled_mod_ids = [...(targetVersion.disabled_mod_ids || [])];
    modpack.locked_mod_ids = [...(targetVersion.locked_mod_ids || [])];
    modpack.version = targetVersion.tag;
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    // Note: We don't modify library mods here - the caller (main.ts) handles
    // downloading the correct mod versions. Each mod version has a unique ID
    // (cf-{projectId}-{fileId}), so we just need the correct IDs in mod_ids.

    // Restore config snapshot if available and requested
    if (options?.restoreConfigs !== false && targetVersion.config_snapshot_id) {
      await this.restoreConfigSnapshot(modpackId, targetVersion.config_snapshot_id);
    }

    // Create a rollback commit
    const rollbackVersion = await this.createVersion(
      modpackId,
      `Rollback to ${targetVersion.tag}`,
      `${targetVersion.tag}-rollback`,
      false, // hasConfigChanges
      true   // forceCreate - always create a new version for rollbacks
    );

    return rollbackVersion !== null;
  }

  /**
   * Rollback modpack to a specific version with explicit mod list
   * This allows the caller to filter which mods are actually restored
   * (e.g., when some mods couldn't be re-downloaded)
   */
  async rollbackToVersionWithMods(
    modpackId: string,
    versionId: string,
    modIds: string[],
    options?: { restoreConfigs?: boolean }
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const history = await this.getVersionHistory(modpackId);
    if (!history) return false;

    const targetVersion = history.versions.find((v) => v.id === versionId);
    if (!targetVersion) return false;

    // Filter disabled_mod_ids to only include mods that were restored
    const modIdSet = new Set(modIds);
    const restoredDisabledIds = (targetVersion.disabled_mod_ids || []).filter(
      (id) => modIdSet.has(id)
    );
    // Filter locked_mod_ids to only include mods that were restored
    const restoredLockedIds = (targetVersion.locked_mod_ids || []).filter(
      (id) => modIdSet.has(id)
    );

    // Update modpack with the provided mod_ids (filtered to only existing mods)
    modpack.mod_ids = [...modIds];
    modpack.disabled_mod_ids = restoredDisabledIds;
    modpack.locked_mod_ids = restoredLockedIds;
    modpack.version = targetVersion.tag;
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    // Note: We don't modify library mods here - the caller (main.ts) handles
    // downloading the correct mod versions. Each mod version has a unique ID
    // (cf-{projectId}-{fileId}), so we just need the correct IDs in mod_ids.

    // Restore config snapshot if available and requested
    if (options?.restoreConfigs !== false && targetVersion.config_snapshot_id) {
      await this.restoreConfigSnapshot(modpackId, targetVersion.config_snapshot_id);
    }

    // Create a rollback commit with info about partial restoration
    const wasPartial = modIds.length < targetVersion.mod_ids.length;
    const message = wasPartial
      ? `Partial rollback to ${targetVersion.tag} (${modIds.length}/${targetVersion.mod_ids.length} mods)`
      : `Rollback to ${targetVersion.tag}`;

    const rollbackVersion = await this.createVersion(
      modpackId,
      message,
      `${targetVersion.tag}-rollback`,
      false, // hasConfigChanges
      true   // forceCreate - always create a new version for rollbacks
    );

    return rollbackVersion !== null;
  }

  /**
   * Get version by ID
   */
  async getVersion(
    modpackId: string,
    versionId: string
  ): Promise<ModpackVersion | null> {
    const history = await this.getVersionHistory(modpackId);
    if (!history) return null;

    return history.versions.find((v) => v.id === versionId) || null;
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

    const fromVersion = history.versions.find((v) => v.id === fromVersionId);
    const toVersion = history.versions.find((v) => v.id === toVersionId);

    if (!fromVersion || !toVersion) return null;

    const library = await this.loadLibrary();
    return this.calculateChanges(
      fromVersion.mod_ids,
      toVersion.mod_ids,
      library,
      fromVersion.mod_snapshots // Pass snapshots from the "from" version to detect updates
    );
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
      console.error(
        `Failed to delete version history for ${modpackId}:`,
        error
      );
    }
  }

  // ==================== EXPORT ====================

  /**
   * Generate CurseForge manifest for a modpack
   */
  async exportToCurseForge(
    modpackId: string,
    cfService: any // Need to pass CF service to get loader versions
  ): Promise<{
    manifest: any;
    modpack: Modpack;
    mods: Mod[];
    modlist: string;
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const allMods = await this.getModsInModpack(modpackId);

    // Get disabled mod IDs set
    const disabledIds = new Set(modpack.disabled_mod_ids || []);

    // Filter to CF mods only (include both enabled and disabled)
    const cfMods = allMods.filter(
      (m) => m.source === "curseforge" && m.cf_project_id && m.cf_file_id
    );

    // Build the modloader ID
    const mcVersion = modpack.minecraft_version || "1.20.1";
    const targetLoaderType = (modpack.loader || "forge").toLowerCase();
    let loaderId: string | null = null;

    // Try to get loader_version - if not saved, try to fetch from original CF manifest
    let loaderVersion = modpack.loader_version;
    if (!loaderVersion && modpack.cf_project_id && modpack.cf_file_id && cfService) {
      try {
        console.log(`[Export] No loader_version saved, fetching from CF API for file ${modpack.cf_file_id}...`);
        const fileInfo = await cfService.getModFile(modpack.cf_project_id, modpack.cf_file_id);
        if (fileInfo?.downloadUrl) {
          // Download and extract manifest to get loader version
          const response = await fetch(fileInfo.downloadUrl);
          const arrayBuffer = await response.arrayBuffer();
          const AdmZip = (await import("adm-zip")).default;
          const zip = new AdmZip(Buffer.from(arrayBuffer));
          const manifestEntry = zip.getEntry("manifest.json");
          if (manifestEntry) {
            const originalManifest = JSON.parse(manifestEntry.getData().toString("utf8"));
            const primaryLoader = originalManifest.minecraft?.modLoaders?.find((l: any) => l.primary);
            if (primaryLoader?.id) {
              // Extract version from loader ID
              // CurseForge uses fabric-X.X.X, but also handle fabric-loader-X.X.X
              const fabricLoaderMatch = primaryLoader.id.match(/^fabric-loader-(.+)/i);
              const fabricMatch = primaryLoader.id.match(/^fabric-([\d.]+)/i);
              if (fabricLoaderMatch) {
                loaderVersion = fabricLoaderMatch[1];
              } else if (fabricMatch) {
                loaderVersion = fabricMatch[1];
              } else {
                const match = primaryLoader.id.match(/^(?:forge|quilt|neoforge)-(.+)/i);
                if (match) {
                  loaderVersion = match[1];
                }
              }
              console.log(`[Export] Extracted loader version from CF manifest: ${loaderVersion}`);

              // Save it for future exports
              if (loaderVersion) {
                await this.updateModpack(modpackId, { loader_version: loaderVersion });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Export] Failed to fetch loader version from CF:`, err);
      }
    }

    // First, try to use the loader_version (saved or fetched from CF)
    if (loaderVersion) {
      let cleanVersion = loaderVersion;

      // Clean up version if it contains loader prefix (from old bug)
      // e.g., "loader-0.18.2" should become "0.18.2"
      if (cleanVersion.startsWith("loader-")) {
        cleanVersion = cleanVersion.replace("loader-", "");
      }

      // Remove game version suffix if present (e.g., "0.18.4-1.21.1" -> "0.18.4")
      // Game versions are like "1.20.1", "1.21", "1.21.1", etc.
      // Pattern: anything followed by -1.XX or -1.XX.X
      const gameVersionSuffixMatch = cleanVersion.match(/^([\d.]+)-1\.\d+(?:\.\d+)?$/);
      if (gameVersionSuffixMatch) {
        cleanVersion = gameVersionSuffixMatch[1];
        console.log(`[Export] Removed game version suffix: ${loaderVersion} -> ${cleanVersion}`);
      }

      // For Fabric, CurseForge uses "fabric-X.X.X" format (not "fabric-loader-X.X.X")
      if (targetLoaderType === "fabric") {
        loaderId = `fabric-${cleanVersion}`;
      } else {
        loaderId = `${targetLoaderType}-${cleanVersion}`;
      }
      console.log(`[Export] Using loader version: ${loaderId}`);
    }

    // If no saved version, try to fetch from CurseForge API
    if (!loaderId) {
      try {
        if (cfService && typeof cfService.getModLoaders === "function") {
          const loaders = await cfService.getModLoaders(mcVersion);

          // Filter by type - handle different naming conventions
          const typeLoaders = loaders.filter((l: any) => {
            const name = l.name.toLowerCase();
            // Fabric loaders are named "fabric-loader-X.X.X" or "fabric-loader-X.X.X-Y.Y.Y"
            if (targetLoaderType === "fabric") {
              return name.startsWith("fabric-loader-") || name.startsWith("fabric-");
            }
            // Other loaders are typically "loader-version"
            return name.startsWith(`${targetLoaderType}-`);
          });

          if (typeLoaders.length > 0) {
            // Find recommended or latest
            const recommended = typeLoaders.find((l: any) => l.recommended);
            let selectedLoader: any;
            if (recommended) {
              selectedLoader = recommended;
            } else {
              // Sort by date to get latest
              typeLoaders.sort(
                (a: any, b: any) =>
                  new Date(b.dateModified).getTime() -
                  new Date(a.dateModified).getTime()
              );
              selectedLoader = typeLoaders[0];
            }

            // Convert API loader name to manifest format
            // API returns: "fabric-loader-0.18.4-1.21.1" (with game version)
            // Manifest needs: "fabric-0.18.4" (without game version)
            const apiName = selectedLoader.name;
            if (targetLoaderType === "fabric") {
              // fabric-loader-X.X.X or fabric-loader-X.X.X-Y.Y.Y
              const match = apiName.match(/^fabric-loader-([\d.]+)/i);
              if (match) {
                loaderId = `fabric-${match[1]}`;
              } else {
                // Fallback: try fabric-X.X.X format
                const simpleMatch = apiName.match(/^fabric-([\d.]+)/i);
                if (simpleMatch) {
                  loaderId = `fabric-${simpleMatch[1]}`;
                } else {
                  loaderId = apiName; // Use as-is if no match
                }
              }
            } else {
              // For forge/neoforge/quilt, extract just the version part
              // API might return: "forge-47.2.0" or "forge-47.2.0-1.20.1"
              const match = apiName.match(new RegExp(`^${targetLoaderType}-([\\d.]+)`, "i"));
              if (match) {
                loaderId = `${targetLoaderType}-${match[1]}`;
              } else {
                loaderId = apiName; // Use as-is if no match
              }
            }

            console.log(
              `[Export] Selected modloader from API: ${apiName} -> ${loaderId} for ${targetLoaderType} ${mcVersion}`
            );
          } else {
            console.warn(
              `[Export] No matching modloaders found for ${targetLoaderType} ${mcVersion}`
            );
          }
        }
      } catch (error) {
        console.warn(
          `[Export] Failed to fetch modloaders, using fallback:`,
          error
        );
      }
    }

    // Final fallback - construct a valid-looking ID based on loader type
    if (!loaderId) {
      // Use known recent versions as fallbacks (updated for 2024+)
      const fallbackVersions: Record<string, string> = {
        "forge": "47.2.0",       // Common 1.20.1 version
        "fabric": "0.16.9",      // Recent Fabric version  
        "neoforge": "20.4.167",  // Common version
        "quilt": "0.19.0",       // Common version
      };

      const fallbackVersion = fallbackVersions[targetLoaderType] || "0.0.0";
      if (targetLoaderType === "fabric") {
        loaderId = `fabric-${fallbackVersion}`;
      } else {
        const fallbackVersion = fallbackVersions[targetLoaderType] || "0.0.0";
        loaderId = `${targetLoaderType}-${fallbackVersion}`;
      }
      console.warn(`[Export] Using fallback loader: ${loaderId}`);
    }

    const manifest = {
      minecraft: {
        version: mcVersion,
        modLoaders: [
          {
            id: loaderId,
            primary: true,
          },
        ],
      },
      manifestType: "minecraftModpack",
      manifestVersion: 1,
      name: modpack.name,
      version: modpack.version,
      author: "ModEx User",
      // Include all mods - disabled mods have required: false
      files: cfMods.map((m) => ({
        projectID: m.cf_project_id!,
        fileID: m.cf_file_id!,
        required: !disabledIds.has(m.id),
      })),
      overrides: "overrides",
    };

    // Generate modlist.html (only enabled mods)
    const enabledMods = cfMods.filter((m) => !disabledIds.has(m.id));
    const modlist = this.generateModlistHtml(enabledMods);

    return { manifest, modpack, mods: cfMods, modlist };
  }

  /**
   * Generate modlist.html for CurseForge export
   */
  private generateModlistHtml(mods: Mod[]): string {
    const sortedMods = [...mods].sort((a, b) => a.name.localeCompare(b.name));

    const modLinks = sortedMods
      .map((mod) => {
        // Determine URL path based on content type
        const urlPath =
          mod.content_type === "resourcepack"
            ? "texture-packs"
            : mod.content_type === "shader"
              ? "shaders"
              : "mc-mods";
        const url =
          mod.website_url ||
          `https://www.curseforge.com/minecraft/${urlPath}/${mod.slug || mod.cf_project_id
          }`;
        const author = mod.author || "Unknown";
        return `<li><a href="${url}">${mod.name} (by ${author})</a></li>`;
      })
      .join("\n");

    return `<ul>
${modLinks}
</ul>`;
  }

  /**
   * Generate MODEX manifest for a modpack
   * @param modpackId - The modpack ID
   * @param options - Export options
   * @param options.versionHistoryMode - 'full' exports all history, 'current' exports only current version snapshot
   */
  async exportToModex(modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }): Promise<{
    manifest: any;
    code: string;
    checksum: string;
  }> {
    const versionHistoryMode = options?.versionHistoryMode || 'full';

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const allMods = await this.getModsInModpack(modpackId);

    // Get disabled mod IDs set
    const disabledIds = new Set(modpack.disabled_mod_ids || []);

    // Include ALL mods (enabled and disabled) for export
    const mods = allMods;

    // Generate or reuse share code
    const code = modpack.share_code || this.generateShareCode();

    // Update modpack with share code if new
    if (!modpack.share_code) {
      await this.updateModpack(modpackId, { share_code: code });
    }

    // Generate checksum from ALL mod IDs (includes disabled mods to detect any change)
    const modIds = mods
      .map((m) => m.id)
      .sort()
      .join("");
    const modChecksum = crypto
      .createHash("sha256")
      .update(modIds)
      .digest("hex")
      .substring(0, 16);

    // Get version history if available
    const versionHistory = await this.getVersionHistory(modpackId);

    // Generate version history hash (for detecting version control changes)
    let versionHistoryHash: string | undefined;
    if (versionHistory && versionHistory.versions.length > 0) {
      const vhData = JSON.stringify(versionHistory.versions.map(v => ({
        id: v.id,
        tag: v.tag,
        message: v.message,
        created_at: v.created_at,
        config_snapshot_id: v.config_snapshot_id
      })));
      versionHistoryHash = crypto
        .createHash("sha256")
        .update(vhData)
        .digest("hex")
        .substring(0, 16);
    }

    // Generate disabled mods hash
    const disabledHash = crypto
      .createHash("sha256")
      .update((modpack.disabled_mod_ids || []).sort().join(","))
      .digest("hex")
      .substring(0, 8);

    // Generate locked mods hash
    const lockedHash = crypto
      .createHash("sha256")
      .update((modpack.locked_mod_ids || []).sort().join(","))
      .digest("hex")
      .substring(0, 8);

    // Generate modpack metadata hash (loader, version, minecraft_version)
    const metadataHash = crypto
      .createHash("sha256")
      .update(`${modpack.loader || ''}-${modpack.loader_version || ''}-${modpack.minecraft_version || ''}`)
      .digest("hex")
      .substring(0, 8);

    // Generate content types hash (to detect resourcepack/shader changes)
    const contentTypesHash = crypto
      .createHash("sha256")
      .update(mods.map(m => `${m.id}:${m.content_type || 'mod'}`).sort().join(","))
      .digest("hex")
      .substring(0, 8);

    // Combined checksum that includes all data
    const checksum = crypto
      .createHash("sha256")
      .update(`${modChecksum}-${disabledHash}-${lockedHash}-${metadataHash}-${contentTypesHash}-${versionHistoryHash || 'none'}`)
      .digest("hex")
      .substring(0, 16);

    const manifest = {
      modex_version: "2.1", // Bump version for new format
      share_code: code,
      checksum,
      version_history_hash: versionHistoryHash, // New field for detecting version control changes
      exported_at: new Date().toISOString(),
      modpack: {
        name: modpack.name,
        version: modpack.version,
        minecraft_version: modpack.minecraft_version,
        loader: modpack.loader,
        loader_version: modpack.loader_version,
        description: modpack.description,
        // Include CF source for config download during import (only if present)
        ...(modpack.cf_project_id && modpack.cf_file_id ? {
          cf_project_id: modpack.cf_project_id,
          cf_file_id: modpack.cf_file_id,
        } : {}),
      },
      mods: mods.map((m) => ({
        // Include name and version for update dialog display
        name: m.name,
        version: m.version,
        // IDs for lookup
        cf_project_id: m.cf_project_id,
        cf_file_id: m.cf_file_id,
        mr_project_id: m.mr_project_id,
        mr_version_id: m.mr_version_id,
        source: m.source,
        content_type: m.content_type,
        filename: m.filename,
      })),
      // Include disabled mods using stable identifiers (cf_project_id/mr_project_id) for cross-import compatibility
      // Also include internal IDs for backwards compatibility
      disabled_mods: modpack.disabled_mod_ids || [],
      disabled_mods_by_project: allMods
        .filter(m => disabledIds.has(m.id))
        .map(m => ({
          cf_project_id: m.cf_project_id,
          mr_project_id: m.mr_project_id,
          name: m.name
        })),
      // Include locked mods using stable identifiers for cross-import compatibility
      locked_mods: modpack.locked_mod_ids || [],
      locked_mods_by_project: allMods
        .filter(m => (modpack.locked_mod_ids || []).includes(m.id))
        .map(m => ({
          cf_project_id: m.cf_project_id,
          mr_project_id: m.mr_project_id,
          name: m.name
        })),
      stats: {
        mod_count: mods.length,
        disabled_count: disabledIds.size,
        locked_count: (modpack.locked_mod_ids || []).length,
      },
      // Include version history based on export mode
      version_history: versionHistory ? (
        versionHistoryMode === 'current' && versionHistory.versions.length > 0
          ? {
            // Export only current version as single-entry history
            modpack_id: versionHistory.modpack_id,
            current_version_id: versionHistory.current_version_id,
            versions: [versionHistory.versions.find(v => v.id === versionHistory.current_version_id) || versionHistory.versions[versionHistory.versions.length - 1]]
          }
          : {
            // Export full history
            modpack_id: versionHistory.modpack_id,
            current_version_id: versionHistory.current_version_id,
            versions: versionHistory.versions
          }
      ) : undefined,
      // Include incompatible mods for preservation across imports
      incompatible_mods: modpack.incompatible_mods || [],
    };

    return { manifest, code, checksum };
  }

  /**
   * Generate a sorted resource list for a modpack
   * Returns a simple list of all resources (mods, resourcepacks, shaders) with key info
   * Useful for quick reference, sharing, or documentation
   */
  async generateResourceList(modpackId: string, options?: {
    format?: 'simple' | 'detailed' | 'markdown';
    sortBy?: 'name' | 'type' | 'source';
    includeDisabled?: boolean;
  }): Promise<{
    list: Array<{
      name: string;
      version: string;
      type: string;
      source: string;
      enabled: boolean;
      locked: boolean;
      url?: string;
    }>;
    formatted: string;
    stats: {
      total: number;
      mods: number;
      resourcepacks: number;
      shaders: number;
      enabled: number;
      disabled: number;
      locked: number;
    };
  }> {
    const format = options?.format || 'simple';
    const sortBy = options?.sortBy || 'name';
    const includeDisabled = options?.includeDisabled !== false;

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const allMods = await this.getModsInModpack(modpackId);
    const disabledIds = new Set(modpack.disabled_mod_ids || []);
    const lockedIds = new Set(modpack.locked_mod_ids || []);

    // Filter and map resources
    let resources = allMods
      .filter(m => includeDisabled || !disabledIds.has(m.id))
      .map(m => ({
        name: m.name,
        version: m.version || 'Unknown',
        type: m.content_type || 'mod',
        source: m.source || 'unknown',
        enabled: !disabledIds.has(m.id),
        locked: lockedIds.has(m.id),
        url: m.cf_project_id
          ? `https://www.curseforge.com/minecraft/mc-mods/${m.cf_project_id}`
          : m.mr_project_id
            ? `https://modrinth.com/mod/${m.mr_project_id}`
            : undefined
      }));

    // Sort resources
    resources.sort((a, b) => {
      if (sortBy === 'type') {
        const typeCompare = a.type.localeCompare(b.type);
        return typeCompare !== 0 ? typeCompare : a.name.localeCompare(b.name);
      } else if (sortBy === 'source') {
        const sourceCompare = a.source.localeCompare(b.source);
        return sourceCompare !== 0 ? sourceCompare : a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    // Calculate stats
    const stats = {
      total: resources.length,
      mods: resources.filter(r => r.type === 'mod').length,
      resourcepacks: resources.filter(r => r.type === 'resourcepack').length,
      shaders: resources.filter(r => r.type === 'shader').length,
      enabled: resources.filter(r => r.enabled).length,
      disabled: resources.filter(r => !r.enabled).length,
      locked: resources.filter(r => r.locked).length,
    };

    // Format output
    let formatted: string;
    if (format === 'markdown') {
      const lines = [
        `# ${modpack.name} - Resource List`,
        ``,
        `**Minecraft:** ${modpack.minecraft_version} | **Loader:** ${modpack.loader} ${modpack.loader_version || ''}`,
        `**Total:** ${stats.total} | **Mods:** ${stats.mods} | **Resource Packs:** ${stats.resourcepacks} | **Shaders:** ${stats.shaders}`,
        ``,
        `| Name | Version | Type | Source | Status |`,
        `|------|---------|------|--------|--------|`,
      ];
      for (const r of resources) {
        const status = !r.enabled ? '❌ Disabled' : r.locked ? '🔒 Locked' : '✓';
        const name = r.url ? `[${r.name}](${r.url})` : r.name;
        lines.push(`| ${name} | ${r.version} | ${r.type} | ${r.source} | ${status} |`);
      }
      formatted = lines.join('\n');
    } else if (format === 'detailed') {
      const lines = [
        `${modpack.name} - Resource List`,
        `${'='.repeat(50)}`,
        `Minecraft: ${modpack.minecraft_version} | Loader: ${modpack.loader} ${modpack.loader_version || ''}`,
        `Total: ${stats.total} | Mods: ${stats.mods} | Resource Packs: ${stats.resourcepacks} | Shaders: ${stats.shaders}`,
        ``,
      ];
      for (const r of resources) {
        const status = !r.enabled ? '[DISABLED]' : r.locked ? '[LOCKED]' : '';
        lines.push(`• ${r.name} v${r.version} (${r.type}, ${r.source}) ${status}`);
        if (r.url) lines.push(`  └─ ${r.url}`);
      }
      formatted = lines.join('\n');
    } else {
      // Simple format - just names and versions
      const lines = [
        `${modpack.name} (${stats.total} resources)`,
        ``,
      ];
      for (const r of resources) {
        const status = !r.enabled ? ' [disabled]' : r.locked ? ' [locked]' : '';
        lines.push(`${r.name} - ${r.version}${status}`);
      }
      formatted = lines.join('\n');
    }

    return { list: resources, formatted, stats };
  }

  /**
   * Export modpack manifest for remote hosting (JSON string)
   * @param modpackId - The modpack ID
   * @param options - Export options (passed to exportToModex)
   */
  async exportRemoteManifest(modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }): Promise<string> {
    const { manifest } = await this.exportToModex(modpackId, options);
    return JSON.stringify(manifest, null, 2);
  }

  /**
   * Check for updates from a remote source
   */
  async checkForRemoteUpdate(modpackId: string): Promise<{
    hasUpdate: boolean;
    remoteManifest?: any;
    changes?: {
      added: number;
      removed: number;
      updated: number;
      addedMods: { name: string; version: string }[];
      removedMods: string[];
      updatedMods: string[];
      enabledMods: string[];
      disabledMods: string[];
      lockedMods: string[];
      unlockedMods: string[];
      hasVersionHistoryChanges?: boolean;
      loaderChanged?: { from?: string; to?: string };
      loaderVersionChanged?: { from?: string; to?: string };
      minecraftVersionChanged?: { from?: string; to?: string };
    };
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack || !modpack.remote_source?.url) {
      return { hasUpdate: false };
    }

    try {
      let urlToFetch = modpack.remote_source.url;

      // Sanitize Gist URL: Remove commit hash if present to ensure we get HEAD
      // Format: https://gist.githubusercontent.com/<user>/<id>/raw/<hash>/<file>
      const gistRegex =
        /^(https:\/\/gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[0-9a-f]{40}\/(.+)$/;
      const match = urlToFetch.match(gistRegex);
      if (match) {
        urlToFetch = `${match[1]}/${match[2]}`;
      }

      // Helper: fetch with timeout
      const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          return response;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. Check your internet connection or try again later.`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // For Gist URLs, use the GitHub API to get the latest content (bypasses caching)
      const gistApiRegex =
        /^https:\/\/gist\.githubusercontent\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/;
      const apiMatch = urlToFetch.match(gistApiRegex);

      let remoteManifest: any;

      if (apiMatch) {
        // Use GitHub Gist API to get fresh content
        const gistId = apiMatch[2];
        const filename = apiMatch[3];
        const apiUrl = `https://api.github.com/gists/${gistId}`;

        const apiResponse = await fetchWithTimeout(apiUrl, {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        });

        if (!apiResponse.ok) {
          throw new Error(
            `GitHub API request failed: ${apiResponse.statusText}`
          );
        }

        const gistData = await apiResponse.json();

        // Find the file in the gist
        const file = gistData.files[filename];
        if (!file) {
          throw new Error(
            `File "${filename}" not found in gist. Available: ${Object.keys(
              gistData.files
            ).join(", ")}`
          );
        }

        // Parse the content
        remoteManifest = JSON.parse(file.content);
      } else {
        // Non-Gist URL: use regular fetch with cache busting
        const urlObj = new URL(urlToFetch);
        urlObj.searchParams.append("_t", Date.now().toString());

        const response = await fetchWithTimeout(urlObj.toString(), {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch remote manifest (HTTP ${response.status}): ${response.statusText}`
          );
        }

        // Check content type to provide better error messages
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json") && !contentType.includes("text/plain")) {
          throw new Error(
            `Invalid response type: Expected JSON but received "${contentType}". ` +
            `Make sure the URL points directly to a JSON file.`
          );
        }

        const responseText = await response.text();
        try {
          remoteManifest = JSON.parse(responseText);
        } catch (parseError) {
          // Provide helpful error for common issues
          const preview = responseText.substring(0, 100);
          if (responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
            throw new Error(
              `URL returned an HTML page instead of JSON. ` +
              `Make sure you're using the "raw" URL for your manifest file.`
            );
          }
          throw new Error(
            `Invalid JSON response from URL. Preview: "${preview}..."`
          );
        }
      }

      // Enhanced validation with specific error messages
      if (!remoteManifest.modpack || !remoteManifest.mods) {
        const hasModexVersion = !!remoteManifest.modex_version;
        const hasShareCode = !!remoteManifest.share_code;
        throw new Error(
          `Invalid remote manifest format: Missing required fields. ` +
          `Has modex_version: ${hasModexVersion}, Has share_code: ${hasShareCode}, ` +
          `Has modpack: ${!!remoteManifest.modpack}, Has mods: ${!!remoteManifest.mods}`
        );
      }

      // Let's calculate the diff to be precise
      const currentMods = await this.getModsInModpack(modpackId);

      const addedMods: { name: string; version: string }[] = [];
      const removedMods: string[] = [];
      const updatedMods: string[] = [];

      // Create maps for easier comparison
      const currentMap = new Map<string, Mod>(); // Key: exact mod id (source-projectId-fileId)
      const currentProjectMap = new Map<string, Mod>(); // Key: project-id only (to detect updates)

      for (const mod of currentMods) {
        const key =
          mod.source === "curseforge"
            ? `cf-${mod.cf_project_id}-${mod.cf_file_id}`
            : `mr-${mod.mr_project_id}-${mod.mr_version_id}`;
        currentMap.set(key, mod);

        const projectKey =
          mod.source === "curseforge"
            ? `cf-${mod.cf_project_id}`
            : `mr-${mod.mr_project_id}`;
        currentProjectMap.set(projectKey, mod);
      }

      const remoteMods = remoteManifest.mods;
      const remoteProjectKeys = new Set<string>();

      for (const rMod of remoteMods) {
        const key =
          rMod.source === "curseforge"
            ? `cf-${rMod.cf_project_id}-${rMod.cf_file_id}`
            : `mr-${rMod.mr_project_id}-${rMod.mr_version_id}`;

        const projectKey =
          rMod.source === "curseforge"
            ? `cf-${rMod.cf_project_id}`
            : `mr-${rMod.mr_project_id}`;

        remoteProjectKeys.add(projectKey);

        if (!currentMap.has(key)) {
          // Not an exact match
          if (currentProjectMap.has(projectKey)) {
            // Same project, different file -> Update
            const oldMod = currentProjectMap.get(projectKey)!;
            // Use rMod.version if available, otherwise use filename as fallback
            const newVersion = rMod.version || rMod.filename || 'unknown';
            // Only report update if version string is different or file ID is different
            // This prevents "phantom" updates if IDs match but something else differs
            updatedMods.push(
              `${oldMod.name} (${oldMod.version} → ${newVersion})`
            );
          } else {
            // New project -> Add (use filename as fallback for name/version)
            addedMods.push({
              name: rMod.name || rMod.filename || 'Unknown Mod',
              version: rMod.version || rMod.filename || 'unknown'
            });
          }
        }
      }

      // Check for removed
      for (const [projectKey, mod] of currentProjectMap.entries()) {
        if (!remoteProjectKeys.has(projectKey)) {
          removedMods.push(mod.name);
        }
      }

      // Check for enabled/disabled status changes
      const currentDisabled = new Set(modpack.disabled_mod_ids || []);
      const remoteDisabled = new Set(remoteManifest.disabled_mods || []);

      const enabledMods: string[] = [];
      const disabledMods: string[] = [];

      // Check for mods that exist in both (or are being updated) and have different status
      for (const rMod of remoteMods) {
        // Find the corresponding local mod ID (or what it will be)
        let modId = "";
        if (rMod.source === "curseforge") {
          modId = `cf-${rMod.cf_project_id}-${rMod.cf_file_id}`;
        } else {
          modId = `mr-${rMod.mr_project_id}-${rMod.mr_version_id}`;
        }

        // If this mod is in the remote manifest, check its status
        const isRemoteDisabled = remoteDisabled.has(modId);

        // We need to check against the LOCAL mod's status.
        // But if the mod is being updated, the ID changes.
        // So we should check if the PROJECT was disabled locally.

        const projectKey =
          rMod.source === "curseforge"
            ? `cf-${rMod.cf_project_id}`
            : `mr-${rMod.mr_project_id}`;

        const localMod = currentProjectMap.get(projectKey);

        if (localMod) {
          const isLocalDisabled = currentDisabled.has(localMod.id);
          // Use local mod name (we know it exists) with remote as fallback
          const modName = localMod.name || rMod.name || rMod.filename || 'Unknown Mod';

          if (isLocalDisabled && !isRemoteDisabled) {
            enabledMods.push(modName);
          } else if (!isLocalDisabled && isRemoteDisabled) {
            disabledMods.push(modName);
          }
        }
      }

      // Check for version history changes
      // Only report changes if the REMOTE has versions that the LOCAL doesn't have
      // (not the reverse - local can have more versions after updates)
      let hasVersionHistoryChanges = false;
      if (remoteManifest.version_history) {
        const localHistory = await this.getVersionHistory(modpackId);
        const localVersionIds = new Set(
          localHistory?.versions.map(v => v.id) || []
        );

        // Get remote versions (handle both array and object format)
        const remoteVersions = Array.isArray(remoteManifest.version_history)
          ? remoteManifest.version_history
          : remoteManifest.version_history.versions || [];

        // Check if any remote version is missing locally
        for (const remoteVersion of remoteVersions) {
          const remoteId = remoteVersion.version_id || remoteVersion.id;
          if (remoteId && !localVersionIds.has(remoteId)) {
            hasVersionHistoryChanges = true;
            break;
          }
        }
      }

      // Check for locked/unlocked status changes
      const currentLocked = new Set(modpack.locked_mod_ids || []);
      const remoteLocked = new Set(remoteManifest.locked_mods || []);

      const lockedMods: string[] = [];
      const unlockedMods: string[] = [];

      // Check for mods that exist in both and have different lock status
      for (const rMod of remoteMods) {
        const projectKey =
          rMod.source === "curseforge"
            ? `cf-${rMod.cf_project_id}`
            : `mr-${rMod.mr_project_id}`;

        const localMod = currentProjectMap.get(projectKey);

        if (localMod) {
          // Check using project-based lookup for remote locked status
          let isRemoteLocked = false;
          if (remoteManifest.locked_mods_by_project && Array.isArray(remoteManifest.locked_mods_by_project)) {
            isRemoteLocked = remoteManifest.locked_mods_by_project.some((entry: any) =>
              (entry.cf_project_id && rMod.cf_project_id === entry.cf_project_id) ||
              (entry.mr_project_id && rMod.mr_project_id === entry.mr_project_id)
            );
          } else {
            // Fallback to old format
            const modId = rMod.source === "curseforge"
              ? `cf-${rMod.cf_project_id}-${rMod.cf_file_id}`
              : `mr-${rMod.mr_project_id}-${rMod.mr_version_id}`;
            isRemoteLocked = remoteLocked.has(modId);
          }

          const isLocalLocked = currentLocked.has(localMod.id);
          // Use local mod name (we know it exists) with remote as fallback
          const modName = localMod.name || rMod.name || rMod.filename || 'Unknown Mod';

          if (isLocalLocked && !isRemoteLocked) {
            unlockedMods.push(modName);
          } else if (!isLocalLocked && isRemoteLocked) {
            lockedMods.push(modName);
          }
        }
      }

      // Check for loader/version/minecraft_version changes
      let loaderChanged = false;
      let loaderVersionChanged = false;
      let minecraftVersionChanged = false;

      if (remoteManifest.modpack) {
        if (modpack.loader !== remoteManifest.modpack.loader) {
          loaderChanged = true;
        }
        if (modpack.loader_version !== remoteManifest.modpack.loader_version) {
          loaderVersionChanged = true;
        }
        if (modpack.minecraft_version !== remoteManifest.modpack.minecraft_version) {
          minecraftVersionChanged = true;
        }
      }

      const hasMetadataChanges = loaderChanged || loaderVersionChanged || minecraftVersionChanged;

      const hasUpdate =
        addedMods.length > 0 ||
        removedMods.length > 0 ||
        updatedMods.length > 0 ||
        enabledMods.length > 0 ||
        disabledMods.length > 0 ||
        lockedMods.length > 0 ||
        unlockedMods.length > 0 ||
        hasVersionHistoryChanges ||
        hasMetadataChanges;

      // Update last_checked timestamp
      if (modpack.remote_source) {
        modpack.remote_source.last_checked = new Date().toISOString();
        await this.updateModpack(modpackId, {
          remote_source: modpack.remote_source,
        });
      }

      return {
        hasUpdate,
        remoteManifest: hasUpdate ? remoteManifest : undefined,
        changes: hasUpdate
          ? {
            added: addedMods.length,
            removed: removedMods.length,
            updated: updatedMods.length,
            addedMods,
            removedMods,
            updatedMods,
            enabledMods,
            disabledMods,
            lockedMods,
            unlockedMods,
            hasVersionHistoryChanges,
            // Metadata changes
            loaderChanged: loaderChanged ? { from: modpack.loader, to: remoteManifest.modpack?.loader } : undefined,
            loaderVersionChanged: loaderVersionChanged ? { from: modpack.loader_version, to: remoteManifest.modpack?.loader_version } : undefined,
            minecraftVersionChanged: minecraftVersionChanged ? { from: modpack.minecraft_version, to: remoteManifest.modpack?.minecraft_version } : undefined,
          }
          : undefined,
      };
    } catch (error) {
      console.error("Remote update check failed:", error);
      throw error;
    }
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
   * Parallel processing helper with concurrency limit
   */
  private async parallelLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const p = fn(item).then((result) => {
        results.push(result);
      });
      executing.push(p as Promise<void>);

      if (executing.length >= limit) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const status = await Promise.race([
            executing[i].then(() => "fulfilled"),
            Promise.resolve("pending"),
          ]);
          if (status === "fulfilled") {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Import mods from CurseForge manifest
   * Returns created modpack ID and import stats
   * 
   * Optimized with:
   * - Batch API calls to fetch all mod/file data upfront
   * - Parallel processing with concurrency limit
   * - Pre-cached library lookup
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
    const startTime = Date.now();

    // Extract loader from modLoaders
    let loader = "unknown";
    let loaderVersion: string | undefined;
    const primaryLoader = manifest.minecraft?.modLoaders?.find(
      (l: any) => l.primary
    );
    if (primaryLoader) {
      // CurseForge uses "fabric-X.X.X" format (not "fabric-loader-X.X.X"), others use "loader-X.X.X"
      // Also handle "fabric-loader-X.X.X" format for compatibility
      const fabricLoaderMatch = primaryLoader.id.match(/^fabric-loader-(.+)/i);
      const fabricMatch = primaryLoader.id.match(/^fabric-([\d.]+)/i);
      if (fabricLoaderMatch) {
        loader = "fabric";
        loaderVersion = fabricLoaderMatch[1]; // Extract version (e.g., "0.18.2" from "fabric-loader-0.18.2")
      } else if (fabricMatch) {
        loader = "fabric";
        loaderVersion = fabricMatch[1]; // Extract version (e.g., "0.18.2" from "fabric-0.18.2")
      } else {
        const match = primaryLoader.id.match(/^(forge|quilt|neoforge)-(.+)/i);
        if (match) {
          loader = match[1].toLowerCase();
          loaderVersion = match[2]; // Extract version part (e.g., "47.2.0" from "forge-47.2.0")
        } else {
          // Try simpler pattern without version
          const simpleMatch = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
          if (simpleMatch) loader = simpleMatch[1].toLowerCase();
        }
      }
    }

    const mcVersion = manifest.minecraft?.version || "1.20.1";

    // Create modpack with loader version
    const modpackId = await this.createModpack({
      name: manifest.name || "Imported Modpack",
      version: manifest.version || "1.0.0",
      minecraft_version: mcVersion,
      loader,
      loader_version: loaderVersion,
      description: `Imported from CurseForge. Author: ${manifest.author || "Unknown"
        }`,
    });

    const errors: string[] = [];
    const newModIds: string[] = [];
    const addedModNames: string[] = [];
    const disabledModIds: string[] = [];
    const incompatibleMods: Array<{
      cf_project_id: number;
      name: string;
      reason: string;
    }> = [];

    const files = manifest.files || [];
    const totalFiles = files.length;

    if (totalFiles === 0) {
      return {
        modpackId,
        modsImported: 0,
        modsSkipped: 0,
        errors: ["No mods found in manifest"],
      };
    }

    // ==================== PHASE 1: Batch Prefetch ====================
    onProgress?.(0, totalFiles, "Prefetching mod data...");
    console.log(`[CF Import] Phase 1: Batch prefetching ${totalFiles} mods...`);
    const prefetchStart = Date.now();

    // Use batch API to fetch all mods and files in 2 requests instead of 2N requests
    const entries = files.map((f: any) => ({
      projectID: f.projectID,
      fileID: f.fileID,
    }));

    let modsMap: Map<number, any>;
    let filesMap: Map<number, any>;
    let prefetchErrors: string[];

    try {
      const batchResult = await cfService.getModsAndFilesBatch(entries);
      modsMap = batchResult.mods;
      filesMap = batchResult.files;
      prefetchErrors = batchResult.errors;
      errors.push(...prefetchErrors);
    } catch (err: any) {
      console.warn(`[CF Import] Batch prefetch failed, falling back to sequential: ${err.message}`);
      // Initialize empty maps - will fall back to individual fetches
      modsMap = new Map();
      filesMap = new Map();
      prefetchErrors = [];
    }

    console.log(`[CF Import] Prefetch completed in ${Date.now() - prefetchStart}ms`);

    // ==================== PHASE 2: Pre-cache library lookup ====================
    console.log(`[CF Import] Phase 2: Caching library data...`);
    const allMods = await this.getAllMods();
    const existingModsIndex = new Map<string, any>();
    for (const mod of allMods) {
      if (mod.source === "curseforge" && mod.cf_project_id && mod.cf_file_id) {
        existingModsIndex.set(`${mod.cf_project_id}:${mod.cf_file_id}`, mod);
      }
    }

    // ==================== PHASE 3: Parallel Processing (Data Collection) ====================
    console.log(`[CF Import] Phase 3: Processing ${totalFiles} mods with parallel limit...`);
    const processStart = Date.now();

    // Track progress atomically
    let processedCount = 0;

    // Process mod entries - collect data but don't write to library yet
    const CONCURRENCY_LIMIT = 10; // Process 10 mods simultaneously

    interface ProcessResult {
      existingMod?: Mod;
      newModData?: Omit<Mod, "id" | "created_at">;
      modName?: string;
      error?: string;
      isDisabled?: boolean;
      cacheKey?: string;
    }

    const processMod = async (file: any): Promise<ProcessResult> => {
      const { projectID, fileID } = file;
      const isRequired = file.required !== false;

      try {
        // Try to get from prefetched cache first, fallback to individual fetch
        let cfMod = modsMap.get(projectID);
        if (!cfMod) {
          cfMod = await cfService.getMod(projectID);
        }

        // Update progress (atomic increment)
        const currentProgress = ++processedCount;
        onProgress?.(currentProgress, totalFiles, cfMod?.name || `Mod ${projectID}`);

        if (!cfMod) {
          return { error: `Mod ${projectID} not found` };
        }

        // Try to get file from prefetched cache, fallback to individual fetch
        let cfFile = filesMap.get(fileID);
        if (!cfFile) {
          cfFile = await cfService.getFile(projectID, fileID);
        }

        if (!cfFile) {
          return { error: `File ${fileID} not found for ${cfMod.name}` };
        }

        // Check if mod already exists in library (using pre-indexed lookup)
        const cacheKey = `${projectID}:${fileID}`;
        const existingMod = existingModsIndex.get(cacheKey);

        if (existingMod) {
          console.log(`[CF Import] Found exact match: ${existingMod.name}`);
          return {
            existingMod,
            modName: existingMod.name,
            isDisabled: !isRequired,
          };
        }

        // Detect content type from CF mod classId
        const contentType = getContentTypeFromClassId(cfMod.classId);

        // New mod - use modToLibraryFormat for consistent metadata
        const formattedMod = cfService.modToLibraryFormat(
          cfMod,
          cfFile,
          loader,
          mcVersion,
          contentType
        );

        // Return the data for batch insertion
        return {
          newModData: {
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
            date_created: formattedMod.date_created,
            date_modified: formattedMod.date_modified,
            website_url: formattedMod.website_url,
          } as Omit<Mod, "id" | "created_at">,
          modName: formattedMod.name,
          isDisabled: !isRequired,
          cacheKey,
        };
      } catch (error: any) {
        console.error(`[CF Import] Error processing ${projectID}:`, error);
        return { error: `Error processing ${projectID}: ${error.message}` };
      }
    };

    // Process all mods with concurrency limit
    const results = await this.parallelLimit(files, CONCURRENCY_LIMIT, processMod);

    // Collect new mods data for batch insertion
    const newModsData: Array<Omit<Mod, "id" | "created_at">> = [];
    const newModsMetadata: Array<{ isDisabled: boolean; cacheKey: string }> = [];

    for (const result of results) {
      if (result.error) {
        errors.push(result.error);
      } else if (result.existingMod) {
        // Existing mod - directly add to results
        newModIds.push(result.existingMod.id);
        if (result.modName) {
          addedModNames.push(result.modName);
        }
        if (result.isDisabled) {
          disabledModIds.push(result.existingMod.id);
        }
      } else if (result.newModData) {
        // New mod - collect for batch insertion
        newModsData.push(result.newModData);
        newModsMetadata.push({
          isDisabled: result.isDisabled || false,
          cacheKey: result.cacheKey || "",
        });
        if (result.modName) {
          addedModNames.push(result.modName);
        }
      }
    }

    console.log(`[CF Import] Processing completed in ${Date.now() - processStart}ms`);

    // ==================== PHASE 3.5: Batch Insert New Mods ====================
    if (newModsData.length > 0) {
      console.log(`[CF Import] Phase 3.5: Batch inserting ${newModsData.length} new mods to library...`);
      const batchStart = Date.now();
      const insertedMods = await this.addModsBatch(newModsData);

      // Collect inserted mod IDs
      for (let i = 0; i < insertedMods.length; i++) {
        const mod = insertedMods[i];
        const metadata = newModsMetadata[i];
        newModIds.push(mod.id);
        if (metadata.isDisabled) {
          disabledModIds.push(mod.id);
        }
        // Update cache
        if (metadata.cacheKey) {
          existingModsIndex.set(metadata.cacheKey, mod);
        }
      }
      console.log(`[CF Import] Batch insert completed in ${Date.now() - batchStart}ms`);
    }

    // ==================== PHASE 4: Add mods to modpack ====================
    console.log(`[CF Import] Phase 4: Adding ${newModIds.length} mods to modpack...`);
    const phase4Start = Date.now();

    // Use batch method for efficient modpack updates
    const addedCount = await this.addModsToModpackBatch(modpackId, newModIds);
    console.log(`[CF Import] Added ${addedCount} mods to modpack in ${Date.now() - phase4Start}ms`);

    // Save modpack settings
    const modpack = await this.getModpackById(modpackId);
    if (modpack) {
      if (disabledModIds.length > 0) {
        modpack.disabled_mod_ids = disabledModIds;
        console.log(`[CF Import] Set ${disabledModIds.length} mods as disabled`);
      }

      if (incompatibleMods.length > 0) {
        modpack.incompatible_mods = incompatibleMods;
        console.log(`[CF Import] Tracked ${incompatibleMods.length} incompatible mods for re-search`);
      }

      await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[CF Import] Import completed in ${totalTime}ms (${addedModNames.length} mods imported)`);

    return {
      modpackId,
      modsImported: addedModNames.length,
      modsSkipped: errors.length,
      errors,
    };
  }

  /**
   * Re-search CurseForge for compatible versions of incompatible mods
   * This finds mods that were marked incompatible during import and tries to find
   * versions that match the modpack's MC version and loader
   * 
   * Optimized with parallel processing for faster re-search
   */
  async reSearchIncompatibleMods(
    modpackId: string,
    cfService: any,
    onProgress?: (current: number, total: number, modName: string) => void
  ): Promise<{
    found: number;
    notFound: number;
    added: string[];
    stillIncompatible: string[];
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) {
      throw new Error("Modpack not found");
    }

    const incompatible = modpack.incompatible_mods || [];
    if (incompatible.length === 0) {
      return { found: 0, notFound: 0, added: [], stillIncompatible: [] };
    }

    const mcVersion = modpack.minecraft_version;
    const loader = modpack.loader;
    const added: string[] = [];
    const stillIncompatible: string[] = [];

    console.log(`[Re-search] Searching for ${incompatible.length} incompatible mods`);
    console.log(`[Re-search] Target: MC ${mcVersion}, Loader: ${loader}`);

    let processed = 0;
    const total = incompatible.length;

    // Pre-cache library data
    const allMods = await this.getAllMods();
    const existingModsIndex = new Map<string, any>();
    for (const mod of allMods) {
      if (mod.source === "curseforge" && mod.cf_project_id && mod.cf_file_id) {
        existingModsIndex.set(`${mod.cf_project_id}:${mod.cf_file_id}`, mod);
      }
    }

    interface ReSearchResult {
      incompMod: { cf_project_id: number; name: string; reason: string };
      success: boolean;
      modId?: string;
      modName?: string;
    }

    const processIncompMod = async (incompMod: { cf_project_id: number; name: string; reason: string }): Promise<ReSearchResult> => {
      const currentProgress = ++processed;
      onProgress?.(currentProgress, total, incompMod.name);

      try {
        console.log(`[Re-search] Searching for compatible version of ${incompMod.name} (${incompMod.cf_project_id})`);

        // Get all files for this mod
        const files = await cfService.getModFiles(incompMod.cf_project_id, {
          gameVersion: mcVersion,
          modLoader: loader,
        });

        if (!files || files.length === 0) {
          console.log(`[Re-search] No compatible files found for ${incompMod.name}`);
          return { incompMod, success: false };
        }

        // Find the best matching file (prefer release, then most recent)
        const releaseFiles = files.filter((f: any) => f.releaseType === 1);
        const bestFile = releaseFiles.length > 0 ? releaseFiles[0] : files[0];

        // Get mod info
        const cfMod = await cfService.getMod(incompMod.cf_project_id);
        if (!cfMod) {
          return { incompMod, success: false };
        }

        // Detect content type
        const contentType = getContentTypeFromClassId(cfMod.classId);

        // Format the mod
        const formattedMod = cfService.modToLibraryFormat(
          cfMod,
          bestFile,
          loader,
          mcVersion,
          contentType
        );

        // Verify it actually matches (strict check)
        const modGameVersions = formattedMod.game_versions || [formattedMod.game_version];
        const supportsExactVersion = modGameVersions.includes(mcVersion);
        const loaderMatches = contentType !== "mods" || formattedMod.loader === loader || formattedMod.loader === "unknown";

        if (!supportsExactVersion || !loaderMatches) {
          console.log(`[Re-search] Found file but still incompatible: ${incompMod.name}`);
          return { incompMod, success: false };
        }

        // Check if this exact file already exists (using cached index)
        const cacheKey = `${incompMod.cf_project_id}:${bestFile.id}`;
        let existingMod = existingModsIndex.get(cacheKey);

        if (!existingMod) {
          // Add the new mod to library
          console.log(`[Re-search] Adding compatible version of ${incompMod.name}`);
          existingMod = await this.addMod({
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
            date_created: formattedMod.date_created,
            date_modified: formattedMod.date_modified,
            website_url: formattedMod.website_url,
          });
          // Update index
          existingModsIndex.set(cacheKey, existingMod);
        }

        return { incompMod, success: true, modId: existingMod.id, modName: incompMod.name };
      } catch (error: any) {
        console.error(`[Re-search] Error processing ${incompMod.name}:`, error);
        return { incompMod, success: false };
      }
    };

    // Process with parallel limit
    const CONCURRENCY_LIMIT = 8;
    const results = await this.parallelLimit(incompatible, CONCURRENCY_LIMIT, processIncompMod);

    // Process results and add mods to modpack
    for (const result of results) {
      if (result.success && result.modId) {
        await this.addModToModpack(modpackId, result.modId);
        added.push(result.modName!);
        console.log(`[Re-search] Successfully added ${result.modName}`);
      } else {
        stillIncompatible.push(result.incompMod.name);
      }
    }

    // Update the modpack's incompatible list (only keep those still incompatible)
    const updatedModpack = await this.getModpackById(modpackId);
    if (updatedModpack) {
      updatedModpack.incompatible_mods = incompatible.filter(
        (m) => stillIncompatible.includes(m.name)
      );
      await this.safeWriteJson(this.getModpackPath(modpackId), updatedModpack);
    }

    return {
      found: added.length,
      notFound: stillIncompatible.length,
      added,
      stillIncompatible,
    };
  }

  /**
   * Import MODEX manifest
   */
  async importFromModex(
    manifest: any,
    cfService: any,
    onProgress?: (current: number, total: number, modName: string) => void,
    targetModpackId?: string
  ): Promise<{
    success: boolean;
    modpackId: string;
    code: string;
    isUpdate: boolean;
    changes?: {
      added: number;
      removed: number;
      unchanged: number;
      updated: number;
      downloaded: number;
      enabled: number;
      disabled: number;
      addedMods: string[];
      removedMods: string[];
      updatedMods: string[];
      downloadedMods: string[];
      enabledMods: string[];
      disabledMods: string[];
    };
  }> {
    if (!manifest.modex_version || !manifest.share_code) {
      throw new Error("Invalid MODEX manifest: Missing modex_version or share_code");
    }

    // Store import checksum for conflict detection during long imports
    const importChecksum = manifest.checksum;

    // Check for existing modpack
    let existingModpack: Modpack | undefined;

    if (targetModpackId) {
      existingModpack = await this.getModpackById(targetModpackId);
    } else {
      existingModpack =
        (await this.findModpackByShareCode(manifest.share_code)) || undefined;
    }

    // Check for share_code conflicts (different modpack with same code)
    if (!existingModpack && !targetModpackId) {
      const allModpacks = await this.getAllModpacks();
      const conflictingModpack = allModpacks.find(m =>
        m.share_code === manifest.share_code &&
        m.name !== manifest.modpack.name
      );
      if (conflictingModpack) {
        throw new Error(
          `Share code conflict: Another modpack "${conflictingModpack.name}" already uses ` +
          `the share code "${manifest.share_code}". The incoming modpack "${manifest.modpack.name}" ` +
          `cannot be imported. Please export with a new share code or import to a specific modpack.`
        );
      }
    }

    const isUpdate = !!existingModpack;

    let modpackId: string;
    let oldModIds: string[] = [];
    let oldDisabledModIds: string[] = [];

    if (isUpdate && existingModpack) {
      modpackId = existingModpack.id;
      oldModIds = [...existingModpack.mod_ids];
      oldDisabledModIds = [...(existingModpack.disabled_mod_ids || [])];

      // Update modpack metadata (excluding name/description to preserve local customization)
      await this.updateModpack(modpackId, {
        // name: manifest.modpack.name, // Don't overwrite name
        version: manifest.modpack.version,
        minecraft_version: manifest.modpack.minecraft_version,
        loader: manifest.modpack.loader,
        loader_version: manifest.modpack.loader_version,
        // description: manifest.modpack.description, // Don't overwrite description
        last_sync: new Date().toISOString(),
      });
    } else {
      modpackId = await this.createModpack({
        name: manifest.modpack.name,
        version: manifest.modpack.version,
        minecraft_version: manifest.modpack.minecraft_version,
        loader: manifest.modpack.loader,
        loader_version: manifest.modpack.loader_version,
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

    // ==================== OPTIMIZATION: Pre-cache library data ====================
    // Load all mods and modpacks once instead of in every iteration
    const allMods = await this.getAllMods();
    const allModpacks = await this.getAllModpacks();

    // Build lookup indexes for fast access
    const cfExactIndex = new Map<string, Mod>(); // key: "projectId:fileId"
    const cfProjectIndex = new Map<number, Mod[]>(); // key: projectId -> all versions
    const mrExactIndex = new Map<string, Mod>(); // key: versionId
    const mrProjectIndex = new Map<string, Mod[]>(); // key: projectId -> all versions

    for (const mod of allMods) {
      if (mod.source === "curseforge" && mod.cf_project_id && mod.cf_file_id) {
        cfExactIndex.set(`${mod.cf_project_id}:${mod.cf_file_id}`, mod);
        if (!cfProjectIndex.has(mod.cf_project_id)) {
          cfProjectIndex.set(mod.cf_project_id, []);
        }
        cfProjectIndex.get(mod.cf_project_id)!.push(mod);
      } else if (mod.source === "modrinth" && mod.mr_version_id) {
        mrExactIndex.set(mod.mr_version_id, mod);
        if (mod.mr_project_id) {
          if (!mrProjectIndex.has(mod.mr_project_id)) {
            mrProjectIndex.set(mod.mr_project_id, []);
          }
          mrProjectIndex.get(mod.mr_project_id)!.push(mod);
        }
      }
    }

    // ==================== OPTIMIZATION: Batch prefetch CF data ====================
    // Collect all CurseForge entries for batch fetching
    const cfEntries = (manifest.mods || [])
      .filter((m: any) => m.source === "curseforge" && m.cf_project_id && m.cf_file_id)
      .filter((m: any) => !cfExactIndex.has(`${m.cf_project_id}:${m.cf_file_id}`)) // Only new mods
      .map((m: any) => ({ projectID: m.cf_project_id, fileID: m.cf_file_id }));

    let prefetchedMods = new Map<number, any>();
    let prefetchedFiles = new Map<number, any>();

    if (cfEntries.length > 0 && cfService.getModsAndFilesBatch) {
      console.log(`[Import] Batch prefetching ${cfEntries.length} new mods from CurseForge...`);
      try {
        const batchResult = await cfService.getModsAndFilesBatch(cfEntries);
        prefetchedMods = batchResult.mods;
        prefetchedFiles = batchResult.files;
        console.log(`[Import] Prefetched ${prefetchedMods.size} mods and ${prefetchedFiles.size} files`);
      } catch (err) {
        console.warn(`[Import] Batch prefetch failed, will fetch individually:`, err);
      }
    }

    // ==================== PHASE 1: Collect mod data ====================
    // Collect all new mods data for batch insertion
    const modsToAdd: Array<Omit<Mod, "id" | "created_at">> = [];
    const modsToDelete: string[] = [];

    for (const modEntry of manifest.mods || []) {
      processedCount++;

      // Send progress update
      onProgress?.(
        processedCount,
        totalMods,
        modEntry.name || `Mod ${processedCount}`
      );

      // Check if mod already exists in library by CF/MR ID, not by internal ID
      let existingMod: Mod | null = null;
      let conflictingMod: Mod | null = null;

      if (
        modEntry.source === "curseforge" &&
        modEntry.cf_project_id &&
        modEntry.cf_file_id
      ) {
        console.log(
          `[Import] Checking mod: ${modEntry.name} (Project: ${modEntry.cf_project_id}, File: ${modEntry.cf_file_id})`
        );

        // Exact match using pre-built index (O(1) instead of O(n))
        existingMod = cfExactIndex.get(`${modEntry.cf_project_id}:${modEntry.cf_file_id}`) || null;

        if (existingMod) {
          console.log(`[Import] Found exact match: ${existingMod.name}`);
        }

        // Check for same project but different file (version conflict) using index
        if (!existingMod) {
          const projectMods = cfProjectIndex.get(modEntry.cf_project_id) || [];
          conflictingMod = projectMods.find(m => m.cf_file_id !== modEntry.cf_file_id) || null;

          if (conflictingMod) {
            console.log(
              `[Import] Version conflict detected: ${conflictingMod.name} (existing file: ${conflictingMod.cf_file_id} vs new file: ${modEntry.cf_file_id})`
            );
          }
        }
      } else if (modEntry.source === "modrinth" && modEntry.mr_version_id) {
        // Exact match using pre-built index
        existingMod = mrExactIndex.get(modEntry.mr_version_id) || null;

        // Check for same project but different version
        if (!existingMod && modEntry.mr_project_id) {
          const projectMods = mrProjectIndex.get(modEntry.mr_project_id) || [];
          conflictingMod = projectMods.find(m => m.mr_version_id !== modEntry.mr_version_id) || null;
        }
      }

      if (existingMod) {
        // Exact match - reuse existing mod
        console.log(
          `[Import] Reusing existing mod from library: ${existingMod.name}`
        );
        newModIds.push(existingMod.id);

        // Check if this mod is being added to the pack (was not in old pack)
        if (isUpdate && !oldModIds.includes(existingMod.id)) {
          addedModNames.push(existingMod.name);
          console.log(
            `[Import] Mod added to pack (reused): ${existingMod.name}`
          );
        }
        // Don't add to downloadedModNames - it was already in library
      } else if (conflictingMod) {
        // Version conflict - automatically update to new version for .modex imports
        console.log(
          `[Import] Auto-updating mod: ${conflictingMod.name} (${conflictingMod.version} -> ${modEntry.version})`
        );
        updatedModNames.push(
          `${conflictingMod.name} (${conflictingMod.version} → ${modEntry.version})`
        );

        // Remove old version if it's not used in other modpacks (using cached modpacks)
        const isUsedElsewhere = allModpacks.some(
          (mp) => mp.id !== modpackId && mp.mod_ids.includes(conflictingMod!.id)
        );

        if (!isUsedElsewhere) {
          // Collect for batch deletion
          modsToDelete.push(conflictingMod.id);
          console.log(
            `[Import] Marked old version for removal: ${conflictingMod.name}`
          );
          // Update indexes
          const projectMods = cfProjectIndex.get(conflictingMod.cf_project_id!) || [];
          const idx = projectMods.findIndex(m => m.id === conflictingMod!.id);
          if (idx >= 0) projectMods.splice(idx, 1);
        }

        // Add new version - will be handled by the fetch logic below
        conflictingMod = null; // Clear to trigger fetch
      }

      if (!existingMod && !conflictingMod) {
        // New mod - fetch from CurseForge API for complete metadata
        console.log(
          `[Import] Fetching mod from CurseForge: ${modEntry.name} (${modEntry.cf_project_id}/${modEntry.cf_file_id})`
        );

        let newModData: Omit<Mod, "id" | "created_at"> | null = null;

        if (
          modEntry.source === "curseforge" &&
          modEntry.cf_project_id &&
          modEntry.cf_file_id
        ) {
          try {
            // Try prefetched data first, then fall back to individual fetch
            let cfMod = prefetchedMods.get(modEntry.cf_project_id);
            let cfFile = prefetchedFiles.get(modEntry.cf_file_id);

            if (!cfMod) {
              cfMod = await cfService.getMod(modEntry.cf_project_id);
            }
            if (!cfFile) {
              cfFile = await cfService.getFile(modEntry.cf_project_id, modEntry.cf_file_id);
            }

            if (cfMod && cfFile) {
              // Detect content type from CF mod classId
              const contentType = getContentTypeFromClassId(cfMod.classId);

              // Use modToLibraryFormat to get consistent metadata
              const formattedMod = cfService.modToLibraryFormat(
                cfMod,
                cfFile,
                manifest.modpack.loader,
                manifest.modpack.minecraft_version,
                contentType
              );

              newModData = {
                name: formattedMod.name,
                slug: formattedMod.slug,
                version: formattedMod.version,
                game_version: formattedMod.game_version,
                loader: formattedMod.loader,
                content_type: formattedMod.content_type,
                filename: formattedMod.filename,
                source: "curseforge" as const,
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
              };

              console.log(
                `[Import] Collected ${contentType}: ${formattedMod.name} v${formattedMod.version}`
              );
            } else {
              throw new Error("Mod or file not found on CurseForge");
            }
          } catch (error) {
            console.warn(
              `[Import] Failed to fetch from CF API, using manifest data:`,
              error
            );
            // Fallback to manifest data if API fetch fails
            newModData = {
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
            };
          }
        } else {
          // Modrinth or fallback - use manifest data
          newModData = {
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
          };
        }

        if (newModData) {
          modsToAdd.push(newModData);
          addedModNames.push(newModData.name);
          downloadedModNames.push(newModData.name);
        }
      }
    }

    // ==================== PHASE 2: Batch operations ====================
    // Delete old versions first
    if (modsToDelete.length > 0) {
      console.log(`[Import] Deleting ${modsToDelete.length} old mod versions...`);
      for (const modId of modsToDelete) {
        await this.deleteMod(modId);
      }
    }

    // Batch insert new mods
    if (modsToAdd.length > 0) {
      console.log(`[Import] Batch inserting ${modsToAdd.length} new mods to library...`);
      const insertedMods = await this.addModsBatch(modsToAdd);

      // Collect the IDs of inserted mods
      for (const mod of insertedMods) {
        newModIds.push(mod.id);
        // Update indexes
        if (mod.source === "curseforge" && mod.cf_project_id && mod.cf_file_id) {
          cfExactIndex.set(`${mod.cf_project_id}:${mod.cf_file_id}`, mod);
          if (!cfProjectIndex.has(mod.cf_project_id)) {
            cfProjectIndex.set(mod.cf_project_id, []);
          }
          cfProjectIndex.get(mod.cf_project_id)!.push(mod);
        }
      }
    }

    // Get names of removed mods if updating
    const removedModNames: string[] = [];
    if (isUpdate) {
      const oldMods = await Promise.all(
        oldModIds.map((id) => this.getModById(id))
      );
      const newSet = new Set(newModIds);

      for (let i = 0; i < oldModIds.length; i++) {
        if (!newSet.has(oldModIds[i]) && oldMods[i]) {
          removedModNames.push(oldMods[i]!.name);
        }
      }
    }

    // Update modpack mod list and disabled mods
    const modpack = await this.getModpackById(modpackId);
    if (modpack) {
      modpack.mod_ids = newModIds;

      // Import disabled_mod_ids from manifest
      // Prefer disabled_mods_by_project (stable IDs) over disabled_mods (internal IDs)
      const importedModIdSet = new Set(newModIds);
      let disabledModIds: string[] = [];

      if (manifest.disabled_mods_by_project && Array.isArray(manifest.disabled_mods_by_project)) {
        // New format: use project IDs to find the correct local mod IDs
        const library = await this.loadLibrary();
        for (const disabledEntry of manifest.disabled_mods_by_project) {
          // Find the imported mod by CF/MR project ID
          const matchingMod = library.mods.find(m =>
            importedModIdSet.has(m.id) && (
              (disabledEntry.cf_project_id && m.cf_project_id === disabledEntry.cf_project_id) ||
              (disabledEntry.mr_project_id && m.mr_project_id === disabledEntry.mr_project_id)
            )
          );
          if (matchingMod) {
            disabledModIds.push(matchingMod.id);
          }
        }
        console.log(`[Import] Resolved ${disabledModIds.length} disabled mods from project IDs`);
      } else {
        // Fallback to old format: filter to only include mods that exist in the import
        disabledModIds = (manifest.disabled_mods || []).filter(
          (id: string) => importedModIdSet.has(id)
        );
      }

      modpack.disabled_mod_ids = disabledModIds;

      // Import locked_mod_ids from manifest
      // Prefer locked_mods_by_project (stable IDs) over locked_mods (internal IDs)
      let lockedModIds: string[] = [];

      if (manifest.locked_mods_by_project && Array.isArray(manifest.locked_mods_by_project)) {
        // New format: use project IDs to find the correct local mod IDs
        const library = await this.loadLibrary();
        for (const lockedEntry of manifest.locked_mods_by_project) {
          const matchingMod = library.mods.find(m =>
            importedModIdSet.has(m.id) && (
              (lockedEntry.cf_project_id && m.cf_project_id === lockedEntry.cf_project_id) ||
              (lockedEntry.mr_project_id && m.mr_project_id === lockedEntry.mr_project_id)
            )
          );
          if (matchingMod) {
            lockedModIds.push(matchingMod.id);
          }
        }
        console.log(`[Import] Resolved ${lockedModIds.length} locked mods from project IDs`);
      } else if (manifest.locked_mods && Array.isArray(manifest.locked_mods)) {
        // Fallback to old format: filter to only include mods that exist in the import
        lockedModIds = manifest.locked_mods.filter(
          (id: string) => importedModIdSet.has(id)
        );
      }

      modpack.locked_mod_ids = lockedModIds;

      // Import incompatible_mods from manifest (preserve from export)
      if (manifest.incompatible_mods && Array.isArray(manifest.incompatible_mods)) {
        modpack.incompatible_mods = manifest.incompatible_mods;
        console.log(`[Import] Imported ${manifest.incompatible_mods.length} incompatible mods`);
      }

      modpack.updated_at = new Date().toISOString();
      await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    }

    // Import version history if present in manifest
    // Handle both formats: array (old) and object with versions array (new)
    let versionHistoryArray: any[] | null = null;

    if (manifest.version_history) {
      if (Array.isArray(manifest.version_history)) {
        // Old format: array of versions directly
        versionHistoryArray = manifest.version_history;
      } else if (manifest.version_history.versions && Array.isArray(manifest.version_history.versions)) {
        // New format: { modpack_id, current_version_id, versions: [...] }
        versionHistoryArray = manifest.version_history.versions;
      }
    }

    if (versionHistoryArray && versionHistoryArray.length > 0) {
      console.log(
        `[Import] Importing ${versionHistoryArray.length} version history entries`
      );

      // Get existing history (if updating)
      let existingHistory = await this.getVersionHistory(modpackId);
      if (!existingHistory) {
        // Initialize if not existing
        await this.initializeVersionControl(modpackId, "Imported modpack");
        existingHistory = await this.getVersionHistory(modpackId);
      }

      if (existingHistory) {
        // Create a map of existing version IDs to avoid duplicates
        const existingVersionIds = new Set(
          existingHistory.versions.map((v: ModpackVersion) => v.id)
        );

        // Add only new entries from manifest
        let importedCount = 0;
        for (const entry of versionHistoryArray) {
          // Convert manifest entry to ModpackVersion format
          const version: ModpackVersion = {
            id: entry.version_id || entry.id,
            tag: entry.tag || entry.version_id || "imported",
            message: entry.message || "Imported version",
            created_at:
              entry.timestamp || entry.created_at || new Date().toISOString(),
            changes: entry.changes || [],
            mod_ids: entry.mod_ids || [],
            disabled_mod_ids: entry.disabled_mod_ids || [],
            parent_id: entry.parent_id,
            mod_snapshots: entry.mod_snapshots || [],
            config_snapshot_id: entry.config_snapshot_id,
          };

          if (!existingVersionIds.has(version.id)) {
            existingHistory.versions.push(version);
            importedCount++;
          }
        }

        // Sort by timestamp (oldest first)
        existingHistory.versions.sort(
          (a: ModpackVersion, b: ModpackVersion) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        // Update current version to latest
        if (existingHistory.versions.length > 0) {
          existingHistory.current_version_id = existingHistory.versions[existingHistory.versions.length - 1].id;
        }

        await this.saveVersionHistory(existingHistory);
        console.log(
          `[Import] Imported ${importedCount} new version history entries (${versionHistoryArray.length - importedCount
          } duplicates skipped)`
        );
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
        enabled: number;
        disabled: number;
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
        enabledMods: string[];
        disabledMods: string[];
      }
      | undefined;
    if (isUpdate) {
      const oldSet = new Set(oldModIds);
      const newSet = new Set(newModIds);

      // Calculate enabled/disabled changes
      const oldDisabledSet = new Set(oldDisabledModIds);
      const newDisabledSet = new Set(modpack?.disabled_mod_ids || []);

      const enabledModNames: string[] = [];
      const disabledModNames: string[] = [];

      // Check mods present in both versions for status changes
      for (const modId of newModIds) {
        if (oldSet.has(modId)) {
          const wasDisabled = oldDisabledSet.has(modId);
          const isDisabled = newDisabledSet.has(modId);

          if (wasDisabled && !isDisabled) {
            // Re-enabled
            const mod = await this.getModById(modId);
            if (mod) enabledModNames.push(mod.name);
          } else if (!wasDisabled && isDisabled) {
            // Disabled
            const mod = await this.getModById(modId);
            if (mod) disabledModNames.push(mod.name);
          }
        }
      }

      changes = {
        added: addedModNames.length,
        removed: removedModNames.length,
        unchanged: newModIds.filter((id) => oldSet.has(id)).length,
        updated: updatedModNames.length,
        downloaded: downloadedModNames.length,
        enabled: enabledModNames.length,
        disabled: disabledModNames.length,
        addedMods: addedModNames,
        removedMods: removedModNames,
        updatedMods: updatedModNames,
        downloadedMods: downloadedModNames,
        enabledMods: enabledModNames,
        disabledMods: disabledModNames,
      };

      console.log("[Import] Update summary:", {
        added: addedModNames.length,
        removed: removedModNames.length,
        updated: updatedModNames.length,
        downloaded: downloadedModNames.length,
        enabled: enabledModNames.length,
        disabled: disabledModNames.length,
      });
    }

    return {
      success: true,
      modpackId,
      code: manifest.share_code,
      isUpdate,
      changes,
    };
  }

  /**
   * Import from remote URL - always creates a new modpack (never updates existing)
   */
  async importFromUrl(
    manifest: any,
    remoteUrl: string,
    cfService: any,
    onProgress?: (current: number, total: number, modName: string) => void
  ): Promise<{
    success: boolean;
    modpackId: string;
    modpackName: string;
    modsImported: number;
    alreadyExists?: boolean;
    message?: string;
  }> {
    if (!manifest.modex_version || !manifest.share_code) {
      throw new Error("Invalid MODEX manifest: Missing modex_version or share_code");
    }

    // Check if a modpack with this remote_source URL already exists
    const allModpacks = await this.getAllModpacks();
    const existingWithSameUrl = allModpacks.find(
      (m) => m.remote_source?.url === remoteUrl
    );

    if (existingWithSameUrl) {
      return {
        success: true,
        modpackId: existingWithSameUrl.id,
        modpackName: existingWithSameUrl.name,
        modsImported: 0,
        alreadyExists: true,
        message: "This modpack is already synced with this URL. Use 'Check for Updates' instead.",
      };
    }

    // Check if share_code conflicts with existing local modpack
    const existingWithSameCode = allModpacks.find(
      (m) => m.share_code === manifest.share_code
    );

    // Generate new unique share_code to avoid conflicts
    const crypto = await import("crypto");
    const newShareCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    // Determine name - add suffix if there's a conflict
    let modpackName = manifest.modpack.name;
    if (existingWithSameCode) {
      modpackName = `${manifest.modpack.name} (Remote)`;
    }

    // Create new modpack
    const modpackId = await this.createModpack({
      name: modpackName,
      version: manifest.modpack.version,
      minecraft_version: manifest.modpack.minecraft_version,
      loader: manifest.modpack.loader,
      loader_version: manifest.modpack.loader_version,
      description: manifest.modpack.description,
    });

    // Set new share_code and remote_source
    // Note: skip_initial_check prevents auto-check on first load (we just imported, no need to check)
    await this.updateModpack(modpackId, {
      share_code: newShareCode,
      remote_source: {
        url: remoteUrl,
        auto_check: true,
        last_checked: new Date().toISOString(),
        skip_initial_check: true, // Flag to skip first auto-check
      },
      last_sync: new Date().toISOString(),
    });

    // Import mods (same logic as importFromModex but simplified - no update logic needed)
    const manifestMods = manifest.mods || [];
    console.log(`[ImportFromUrl] Starting import of ${manifestMods.length} mods`);

    // Build disabled mods lookup using disabled_mods_by_project (preferred) or disabled_mods (fallback)
    const disabledByProject = new Map<string, boolean>(); // key: "cf-{projectId}" or "mr-{projectId}"
    const disabledByInternalId = new Set<string>(manifest.disabled_mods || []);

    if (manifest.disabled_mods_by_project && Array.isArray(manifest.disabled_mods_by_project)) {
      for (const entry of manifest.disabled_mods_by_project) {
        if (entry.cf_project_id) {
          disabledByProject.set(`cf-${entry.cf_project_id}`, true);
          console.log(`[ImportFromUrl] Disabled mod by project: cf-${entry.cf_project_id} (${entry.name})`);
        }
        if (entry.mr_project_id) {
          disabledByProject.set(`mr-${entry.mr_project_id}`, true);
        }
      }
      console.log(`[ImportFromUrl] Built disabled lookup from ${manifest.disabled_mods_by_project.length} project entries`);
    }

    let modsImported = 0;

    for (let i = 0; i < manifestMods.length; i++) {
      const modEntry = manifestMods[i];
      const modName = modEntry.name || modEntry.filename || `Mod ${i + 1}`;
      console.log(`[ImportFromUrl] Processing mod ${i + 1}/${manifestMods.length}: ${modName} (cf_project_id: ${modEntry.cf_project_id})`);
      onProgress?.(i + 1, manifestMods.length, modName);

      try {
        // Try to find existing mod in library using correct method
        let existingMod: Mod | undefined;

        if (modEntry.source === "curseforge" || modEntry.cf_project_id) {
          existingMod = await this.findModByCFIds(
            modEntry.project_id || modEntry.cf_project_id,
            modEntry.file_id || modEntry.cf_file_id
          );
        } else if (modEntry.source === "modrinth" || modEntry.mr_project_id) {
          existingMod = await this.findModByMRIds(
            modEntry.mr_project_id,
            modEntry.mr_version_id
          );
          if (existingMod) {
            console.log(`[ImportFromUrl] Found existing mod by MR IDs: ${existingMod.name}`);
          }
        }

        if (!existingMod) {
          console.log(`[ImportFromUrl] Mod not in library, fetching from API...`);
          // Add mod to library using CurseForge API
          if (modEntry.source === "curseforge" && (modEntry.cf_project_id || modEntry.project_id)) {
            try {
              const projectId = modEntry.cf_project_id || modEntry.project_id;
              const fileId = modEntry.cf_file_id || modEntry.file_id;
              console.log(`[ImportFromUrl] Fetching CF mod: projectId=${projectId}, fileId=${fileId}`);

              const cfMod = await cfService.getMod(projectId);
              const cfFile = await cfService.getFile(projectId, fileId);

              if (cfMod && cfFile) {
                // Convert to library format with content_type from manifest
                const modData = cfService.modToLibraryFormat(
                  cfMod,
                  cfFile,
                  manifest.modpack?.loader,
                  manifest.modpack?.minecraft_version,
                  modEntry.content_type
                );

                // Add to library
                const newMod = await this.addMod(modData);
                existingMod = newMod;
                console.log(`[ImportFromUrl] Added ${modData.name} to library with id ${newMod.id}`);
              } else {
                console.error(`[ImportFromUrl] CF API returned null - mod: ${!!cfMod}, file: ${!!cfFile}`);
              }
            } catch (err) {
              console.error(`[ImportFromUrl] Failed to add mod ${modName} from CF:`, err);
            }
          } else {
            console.log(`[ImportFromUrl] Cannot fetch - source: ${modEntry.source}, cf_project_id: ${modEntry.cf_project_id}`);
          }
        } else {
          console.log(`[ImportFromUrl] Using existing mod from library: ${existingMod.name} (id: ${existingMod.id})`);
        }

        if (existingMod) {
          // Check disabled status using project-based lookup (preferred) or internal ID (fallback)
          let isDisabled = false;

          // Check by project ID first (stable across imports)
          if (modEntry.cf_project_id || modEntry.project_id) {
            isDisabled = disabledByProject.has(`cf-${modEntry.cf_project_id || modEntry.project_id}`);
          } else if (modEntry.mr_project_id) {
            isDisabled = disabledByProject.has(`mr-${modEntry.mr_project_id}`);
          }

          // Fallback to internal ID check
          if (!isDisabled) {
            const projectId = modEntry.project_id || modEntry.cf_project_id;
            isDisabled = disabledByInternalId.has(String(projectId)) ||
              disabledByInternalId.has(existingMod.id);
          }

          console.log(`[ImportFromUrl] Adding ${existingMod.name} to modpack (disabled: ${isDisabled})`);
          await this.addModToModpack(modpackId, existingMod.id, isDisabled);
          modsImported++;
        } else {
          console.error(`[ImportFromUrl] FAILED to import mod: ${modName} - no existingMod after all attempts`);
        }
      } catch (err) {
        console.error(`[ImportFromUrl] Failed to import mod ${modName}:`, err);
      }
    }

    console.log(`[ImportFromUrl] Import complete: ${modsImported}/${manifestMods.length} mods imported`);

    // Import version history if present (can be object or array format)
    const versionHistoryData = manifest.version_history;
    if (versionHistoryData) {
      // Handle both formats: direct array or object with versions property
      const versions = Array.isArray(versionHistoryData)
        ? versionHistoryData
        : versionHistoryData.versions;

      if (versions && versions.length > 0) {
        await this.importVersionHistory(modpackId, versions);
      } else {
        // No versions, initialize fresh
        await this.initializeVersionControl(modpackId, "Initial import from remote URL");
      }
    } else {
      // No version history at all, initialize fresh
      await this.initializeVersionControl(modpackId, "Initial import from remote URL");
    }

    // Import locked_mod_ids from manifest
    const modpack = await this.getModpackById(modpackId);
    if (modpack) {
      const importedModIdSet = new Set(modpack.mod_ids);
      let lockedModIds: string[] = [];

      if (manifest.locked_mods_by_project && Array.isArray(manifest.locked_mods_by_project)) {
        // New format: use project IDs to find the correct local mod IDs
        const library = await this.loadLibrary();
        for (const lockedEntry of manifest.locked_mods_by_project) {
          const matchingMod = library.mods.find(m =>
            importedModIdSet.has(m.id) && (
              (lockedEntry.cf_project_id && m.cf_project_id === lockedEntry.cf_project_id) ||
              (lockedEntry.mr_project_id && m.mr_project_id === lockedEntry.mr_project_id)
            )
          );
          if (matchingMod) {
            lockedModIds.push(matchingMod.id);
          }
        }
        console.log(`[ImportFromUrl] Resolved ${lockedModIds.length} locked mods from project IDs`);
      } else if (manifest.locked_mods && Array.isArray(manifest.locked_mods)) {
        // Fallback to old format
        lockedModIds = manifest.locked_mods.filter(
          (id: string) => importedModIdSet.has(id)
        );
      }

      if (lockedModIds.length > 0) {
        modpack.locked_mod_ids = lockedModIds;
      }

      // Import incompatible_mods from manifest (preserve from export)
      if (manifest.incompatible_mods && Array.isArray(manifest.incompatible_mods)) {
        modpack.incompatible_mods = manifest.incompatible_mods;
        console.log(`[ImportFromUrl] Imported ${manifest.incompatible_mods.length} incompatible mods`);
      }

      // Store CF source info if present in manifest (for potential config download)
      if (manifest.modpack?.cf_project_id && manifest.modpack?.cf_file_id) {
        modpack.cf_project_id = manifest.modpack.cf_project_id;
        modpack.cf_file_id = manifest.modpack.cf_file_id;
        console.log(`[ImportFromUrl] Stored CF source: project=${manifest.modpack.cf_project_id}, file=${manifest.modpack.cf_file_id}`);
      }

      await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    }

    // Note: Configs are NOT downloaded from CF modpack during gist import.
    // The gist manifest represents the user's customized state, which may differ
    // from the original CF modpack. Configs should only be included when importing
    // directly from CurseForge (the full modpack zip contains overrides/).

    return {
      success: true,
      modpackId,
      modpackName,
      modsImported,
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
      resolution: "use_existing" | "use_new";
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
      if (conflict.resolution === "use_existing") {
        // Use the existing mod
        newModIds.push(conflict.existingMod.id);
      } else if (conflict.resolution === "use_new") {
        // Add the new version to library - fetch from CurseForge API
        let newMod: Mod;

        if (
          conflict.modEntry.source === "curseforge" &&
          conflict.modEntry.cf_project_id &&
          conflict.modEntry.cf_file_id
        ) {
          try {
            console.log(
              `[Conflict] Fetching new version from CF: ${conflict.modEntry.name} (${conflict.modEntry.cf_project_id}/${conflict.modEntry.cf_file_id})`
            );

            const cfMod = await cfService.getMod(
              conflict.modEntry.cf_project_id
            );
            const cfFile = await cfService.getFile(
              conflict.modEntry.cf_project_id,
              conflict.modEntry.cf_file_id
            );

            if (cfMod && cfFile) {
              // Detect content type from CF mod classId
              const contentType = getContentTypeFromClassId(cfMod.classId);

              const formattedMod = cfService.modToLibraryFormat(
                cfMod,
                cfFile,
                manifest.modpack.loader,
                manifest.modpack.minecraft_version,
                contentType
              );

              newMod = await this.addMod({
                name: formattedMod.name,
                slug: formattedMod.slug,
                version: formattedMod.version,
                game_version: formattedMod.game_version,
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
                date_created: formattedMod.date_created,
                date_modified: formattedMod.date_modified,
                website_url: formattedMod.website_url,
              });
            } else {
              throw new Error("Mod or file not found on CurseForge");
            }
          } catch (error) {
            console.warn(
              `[Conflict] Failed to fetch from CF API, using manifest data:`,
              error
            );
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
        oldModIds.map((id) => this.getModById(id))
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
      await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    }

    // Calculate changes
    let changes:
      | {
        added: number;
        removed: number;
        unchanged: number;
        updated: number;
        downloaded: number;
        enabled: number;
        disabled: number;
        addedMods: string[];
        removedMods: string[];
        updatedMods: string[];
        downloadedMods: string[];
        enabledMods: string[];
        disabledMods: string[];
      }
      | undefined;

    if (isUpdate) {
      const oldSet = new Set(oldModIds);
      changes = {
        added: addedModNames.length,
        removed: removedModNames.length,
        unchanged: newModIds.filter((id) => oldSet.has(id)).length,
        updated: 0,
        downloaded: 0,
        enabled: 0,
        disabled: 0,
        addedMods: addedModNames,
        removedMods: removedModNames,
        updatedMods: [],
        downloadedMods: [],
        enabledMods: [],
        disabledMods: [],
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
      resolution: "use_existing" | "use_new";
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
      throw new Error("No pending conflicts found for this modpack");
    }

    const { partialData, manifest } = storedData;
    const newModIds = [...partialData.newModIds];
    const addedModNames = [...partialData.addedModNames];
    const errors: string[] = [];

    const mcVersion = manifest.minecraft?.version || "1.20.1";
    let loader = "unknown";
    const primaryLoader = manifest.minecraft?.modLoaders?.find(
      (l: any) => l.primary
    );
    if (primaryLoader) {
      const match = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
      if (match) loader = match[1].toLowerCase();
    }

    // Process each conflict based on user resolution
    for (const conflict of conflicts) {
      if (conflict.resolution === "use_existing") {
        // Use the existing mod by ID
        newModIds.push(conflict.existingModId);
      } else if (conflict.resolution === "use_new") {
        try {
          console.log(
            `[CF Conflict] Fetching and adding new version: Project ${conflict.projectID}, File ${conflict.fileID}`
          );

          // Fetch mod data from CurseForge API
          const cfMod = await cfService.getMod(conflict.projectID);
          const cfFile = await cfService.getFile(
            conflict.projectID,
            conflict.fileID
          );

          if (!cfMod || !cfFile) {
            throw new Error("Mod or file not found on CurseForge");
          }

          // Detect content type from CF mod classId
          const contentType = getContentTypeFromClassId(cfMod.classId);

          // Use modToLibraryFormat for consistent metadata
          const formattedMod = cfService.modToLibraryFormat(
            cfMod,
            cfFile,
            loader,
            mcVersion,
            contentType
          );

          const newMod = await this.addMod({
            name: formattedMod.name,
            slug: formattedMod.slug,
            version: formattedMod.version,
            game_version: formattedMod.game_version,
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
            date_created: formattedMod.date_created,
            date_modified: formattedMod.date_modified,
            website_url: formattedMod.website_url,
          });

          newModIds.push(newMod.id);
          addedModNames.push(newMod.name);
        } catch (error: any) {
          console.error(`[CF Conflict] Error adding new version:`, error);
          errors.push(
            `Error adding mod (project ${conflict.projectID}): ${error.message}`
          );
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
