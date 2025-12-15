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

export interface ModpackProfile {
  id: string;
  name: string;
  enabled_mod_ids: string[];
  created_at: string;
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
  disabled_mod_ids?: string[];
  remote_source?: {
    url: string;
    auto_check: boolean;
    last_checked?: string;
  };
  profiles?: ModpackProfile[];
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
  type: "add" | "remove" | "update" | "enable" | "disable";
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
  private pendingCFConflicts: Map<string, { partialData: any; manifest: any }> =
    new Map();

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

  private async safeWriteJson(filePath: string, data: any): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeJson(tempPath, data, { spaces: 2 });
    try {
      await fs.move(tempPath, filePath, { overwrite: true });
    } catch (error) {
      // If move fails, try to clean up temp file
      await fs.remove(tempPath).catch(() => {});
      throw error;
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.safeWriteJson(this.configPath, config);
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
    return library.mods.find((m) => m.id === id);
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
      await this.safeWriteJson(this.getModpackPath(newId), newModpack);
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
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
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

  // ==================== PROFILES ====================

  async createProfile(
    modpackId: string,
    name: string
  ): Promise<ModpackProfile | null> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return null;

    if (!modpack.profiles) {
      modpack.profiles = [];
    }

    // Capture currently enabled mods
    const disabledIds = new Set(modpack.disabled_mod_ids || []);
    const enabledModIds = modpack.mod_ids.filter((id) => !disabledIds.has(id));

    const profile: ModpackProfile = {
      id: crypto.randomUUID(),
      name,
      enabled_mod_ids: enabledModIds,
      created_at: new Date().toISOString(),
    };

    modpack.profiles.push(profile);
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return profile;
  }

  async deleteProfile(modpackId: string, profileId: string): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack || !modpack.profiles) return false;

    const initialLength = modpack.profiles.length;
    modpack.profiles = modpack.profiles.filter((p) => p.id !== profileId);

    if (modpack.profiles.length === initialLength) return false;

    modpack.updated_at = new Date().toISOString();
    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    return true;
  }

  async applyProfile(modpackId: string, profileId: string): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack || !modpack.profiles) return false;

    const profile = modpack.profiles.find((p) => p.id === profileId);
    if (!profile) return false;

    // Apply profile:
    // Disabled = All mods NOT in profile.
    // Note: If a mod is in the profile but NO LONGER in the pack (mod_ids),
    // it won't affect anything because we iterate over modpack.mod_ids.
    const profileEnabled = new Set(profile.enabled_mod_ids);
    const disabledIds = modpack.mod_ids.filter((id) => !profileEnabled.has(id));

    modpack.disabled_mod_ids = disabledIds;
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    // Record in version control
    try {
      await this.createVersion(modpackId, `Applied profile: ${profile.name}`);
    } catch (err) {
      console.error("Failed to create version for profile apply:", err);
      // Continue even if version control fails
    }

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
            cf_project_id: mod.cf_project_id,
            cf_file_id: mod.cf_file_id,
          };
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const versionId = `v1`;
    const version: ModpackVersion = {
      id: versionId,
      tag: modpack.version || "1.0.0",
      message,
      created_at: new Date().toISOString(),
      changes: [],
      mod_ids: [...modpack.mod_ids],
      disabled_mod_ids: [...(modpack.disabled_mod_ids || [])],
      mod_snapshots: modSnapshots,
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
      library
    );
    const disabledChanges = this.calculateDisabledChanges(
      currentVersion.disabled_mod_ids || [],
      modpack.disabled_mod_ids || [],
      library
    );
    const changes = [...modChanges, ...disabledChanges];

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
      disabled_mod_ids: [...(modpack.disabled_mod_ids || [])],
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
    const modMap = new Map(library.mods.map((m) => [m.id, m]));

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
  async rollbackToVersion(
    modpackId: string,
    versionId: string
  ): Promise<boolean> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return false;

    const history = await this.getVersionHistory(modpackId);
    if (!history) return false;

    const targetVersion = history.versions.find((v) => v.id === versionId);
    if (!targetVersion) return false;

    // Update modpack with the version's mod_ids and disabled_mod_ids
    modpack.mod_ids = [...targetVersion.mod_ids];
    modpack.disabled_mod_ids = [...(targetVersion.disabled_mod_ids || [])];
    modpack.version = targetVersion.tag;
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    // Create a rollback commit
    const rollbackVersion = await this.createVersion(
      modpackId,
      `Rollback to ${targetVersion.tag}`,
      `${targetVersion.tag}-rollback`
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
    modIds: string[]
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

    // Update modpack with the provided mod_ids (filtered to only existing mods)
    modpack.mod_ids = [...modIds];
    modpack.disabled_mod_ids = restoredDisabledIds;
    modpack.version = targetVersion.tag;
    modpack.updated_at = new Date().toISOString();

    await this.safeWriteJson(this.getModpackPath(modpackId), modpack);

    // Create a rollback commit with info about partial restoration
    const wasPartial = modIds.length < targetVersion.mod_ids.length;
    const message = wasPartial
      ? `Partial rollback to ${targetVersion.tag} (${modIds.length}/${targetVersion.mod_ids.length} mods)`
      : `Rollback to ${targetVersion.tag}`;

    const rollbackVersion = await this.createVersion(
      modpackId,
      message,
      `${targetVersion.tag}-rollback`
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
      library
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

    // Fetch valid modloaders from CurseForge
    let loaderId = `${modpack.loader || "forge"}-unknown`;
    const mcVersion = modpack.minecraft_version || "1.20.1";
    const targetLoaderType = (modpack.loader || "forge").toLowerCase();

    try {
      if (cfService && typeof cfService.getModLoaders === "function") {
        const loaders = await cfService.getModLoaders(mcVersion);

        // Find best matching loader
        // 1. Match type (forge/fabric/etc)
        // 2. Match exact version if possible (not stored currently, so tricky)
        // 3. Prefer recommended
        // 4. Default to latest

        // Filter by type
        const typeLoaders = loaders.filter((l: any) => {
          // Map CF loader names to our internal names
          const name = l.name.toLowerCase();
          return name.includes(targetLoaderType);
        });

        if (typeLoaders.length > 0) {
          // Find recommended
          const recommended = typeLoaders.find((l: any) => l.recommended);
          if (recommended) {
            loaderId = recommended.name;
          } else {
            // Fallback to latest (first in list usually, or sort by date)
            typeLoaders.sort(
              (a: any, b: any) =>
                new Date(b.dateModified).getTime() -
                new Date(a.dateModified).getTime()
            );
            loaderId = typeLoaders[0].name;
          }
          console.log(
            `[Export] Selected modloader: ${loaderId} for ${targetLoaderType} ${mcVersion}`
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

    // Fallback if still unknown/generic
    if (loaderId.endsWith("-unknown")) {
      // Try to construct a somewhat valid looking one if we fail completely,
      // but strictly speaking this will likely fail import on CF side.
      // Better to maybe use a known recent version if possible?
      // For now, valid format is name-version, e.g. "forge-47.2.0"
      loaderId = `${targetLoaderType}-0.0.0`;
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
          `https://www.curseforge.com/minecraft/${urlPath}/${
            mod.slug || mod.cf_project_id
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
   */
  async exportToModex(modpackId: string): Promise<{
    manifest: any;
    code: string;
    checksum: string;
  }> {
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

    // Generate checksum from mod IDs (only enabled mods)
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
        content_type: m.content_type,
        cf_project_id: m.cf_project_id,
        cf_file_id: m.cf_file_id,
        mr_project_id: m.mr_project_id,
        mr_version_id: m.mr_version_id,
        description: m.description,
        author: m.author,
        thumbnail_url: m.thumbnail_url,
      })),
      // Include disabled mods info for reference
      disabled_mods: modpack.disabled_mod_ids || [],
      stats: {
        mod_count: mods.length,
        disabled_count: disabledIds.size,
      },
      // Include version history if available
      version_history: versionHistory || undefined,
    };

    return { manifest, code, checksum };
  }

  /**
   * Export modpack manifest for remote hosting (JSON string)
   */
  async exportRemoteManifest(modpackId: string): Promise<string> {
    const { manifest } = await this.exportToModex(modpackId);
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

        const apiResponse = await fetch(apiUrl, {
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

        const response = await fetch(urlObj.toString(), {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        });
        if (!response.ok)
          throw new Error(
            `Failed to fetch remote manifest: ${response.statusText}`
          );

        remoteManifest = await response.json();
      }

      // Basic validation
      if (!remoteManifest.modpack || !remoteManifest.mods) {
        throw new Error("Invalid remote manifest format");
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
            // Only report update if version string is different or file ID is different
            // This prevents "phantom" updates if IDs match but something else differs
            updatedMods.push(
              `${oldMod.name} (${oldMod.version} → ${rMod.version})`
            );
          } else {
            // New project -> Add
            addedMods.push({ name: rMod.name, version: rMod.version });
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

          if (isLocalDisabled && !isRemoteDisabled) {
            enabledMods.push(rMod.name);
          } else if (!isLocalDisabled && isRemoteDisabled) {
            disabledMods.push(rMod.name);
          }
        }
      }

      const hasUpdate =
        addedMods.length > 0 ||
        removedMods.length > 0 ||
        updatedMods.length > 0 ||
        enabledMods.length > 0 ||
        disabledMods.length > 0;

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
    // Track which mods are marked as not required (disabled) in manifest
    const disabledModIds: string[] = [];
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
      // Check if mod is marked as not required (disabled) in manifest
      // Default to true if not specified (backwards compatibility)
      const isRequired = file.required !== false;
      processedCount++;

      try {
        console.log(
          `[CF Import] Processing mod: Project ${projectID}, File ${fileID}, required: ${isRequired}`
        );

        // Get mod info from CF API
        const cfMod = await cfService.getMod(projectID);
        if (!cfMod) {
          onProgress?.(
            processedCount,
            totalFiles,
            `Mod ${projectID} not found`
          );
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
        const existingMod =
          allMods.find(
            (m) =>
              m.source === "curseforge" &&
              m.cf_project_id === projectID &&
              m.cf_file_id === fileID
          ) || null;

        if (existingMod) {
          console.log(`[CF Import] Found exact match: ${existingMod.name}`);
          newModIds.push(existingMod.id);
          // Count reused mods as successfully imported (they're added to the modpack)
          addedModNames.push(existingMod.name);
          // Track if this mod should be disabled
          if (!isRequired) {
            disabledModIds.push(existingMod.id);
          }
          continue;
        }

        // Check for version conflict
        const conflictingMod =
          allMods.find(
            (m) =>
              m.source === "curseforge" &&
              m.cf_project_id === projectID &&
              m.cf_file_id !== fileID
          ) || null;

        if (conflictingMod) {
          console.log(
            `[CF Import] Version conflict detected: ${conflictingMod.name} (existing file: ${conflictingMod.cf_file_id} vs new file: ${fileID})`
          );
          conflicts.push({
            projectID,
            fileID,
            modName: cfMod.name,
            existingMod: conflictingMod,
            cfMod,
            cfFile,
          });
          continue;
        }

        // Detect content type from CF mod classId
        const contentType = getContentTypeFromClassId(cfMod.classId);

        // New mod - use modToLibraryFormat for consistent metadata
        console.log(`[CF Import] Adding new ${contentType}: ${cfMod.name}`);
        const formattedMod = cfService.modToLibraryFormat(
          cfMod,
          cfFile,
          loader,
          mcVersion,
          contentType
        );

        // Check for loader mismatch - warn if mod doesn't support modpack's loader
        // Only skip if:
        // 1. Modpack has a known loader (not "unknown")
        // 2. Mod has a known loader (not "unknown")
        // 3. They don't match
        // Note: Skip loader check for resourcepacks/shaders as they don't require loaders
        const modpackLoaderKnown = loader !== "unknown";
        const modLoaderKnown = formattedMod.loader !== "unknown";
        const isModContent = contentType === "mods";

        if (
          isModContent &&
          modpackLoaderKnown &&
          modLoaderKnown &&
          formattedMod.loader !== loader
        ) {
          console.warn(
            `[CF Import] Loader mismatch for ${cfMod.name}: modpack uses ${loader}, mod supports ${formattedMod.loader}`
          );
          errors.push(
            `${cfMod.name}: incompatible loader (requires ${formattedMod.loader}, modpack uses ${loader})`
          );
          // Skip this mod instead of adding with wrong loader
          continue;
        }

        const mod = await this.addMod({
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

        newModIds.push(mod.id);
        addedModNames.push(mod.name);
        // Track if this mod should be disabled
        if (!isRequired) {
          disabledModIds.push(mod.id);
        }
      } catch (error: any) {
        console.error(`[CF Import] Error processing ${projectID}:`, error);
        errors.push(`Error processing ${projectID}: ${error.message}`);
      }
    }

    // If there are conflicts, throw an error with conflict data
    if (conflicts.length > 0) {
      console.log(
        `[CF Import] ${conflicts.length} version conflicts detected, throwing error`
      );
      const error: any = new Error("Version conflicts detected");
      error.code = "VERSION_CONFLICTS";
      error.conflicts = conflicts;
      error.partialData = {
        modpackId,
        newModIds,
        addedModNames,
      };
      error.manifest = manifest;
      throw error;
    }

    // Add all mods to modpack
    for (const modId of newModIds) {
      await this.addModToModpack(modpackId, modId);
    }

    // Set disabled mods if any were marked as not required in manifest
    if (disabledModIds.length > 0) {
      const modpack = await this.getModpackById(modpackId);
      if (modpack) {
        modpack.disabled_mod_ids = disabledModIds;
        await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
        console.log(
          `[CF Import] Set ${disabledModIds.length} mods as disabled`
        );
      }
    }

    return {
      modpackId,
      modsImported: addedModNames.length,
      modsSkipped: errors.length,
      errors,
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
      throw new Error("Invalid MODEX manifest");
    }

    // Check for existing modpack
    let existingModpack: Modpack | undefined;

    if (targetModpackId) {
      existingModpack = await this.getModpackById(targetModpackId);
    } else {
      existingModpack =
        (await this.findModpackByShareCode(manifest.share_code)) || undefined;
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
        // description: manifest.modpack.description, // Don't overwrite description
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
        const allMods = await this.getAllMods();

        console.log(
          `[Import] Checking mod: ${modEntry.name} (Project: ${modEntry.cf_project_id}, File: ${modEntry.cf_file_id})`
        );

        // Exact match (same project ID and file ID)
        existingMod =
          allMods.find(
            (m) =>
              m.source === "curseforge" &&
              m.cf_project_id === modEntry.cf_project_id &&
              m.cf_file_id === modEntry.cf_file_id
          ) || null;

        if (existingMod) {
          console.log(`[Import] Found exact match: ${existingMod.name}`);
        }

        // Check for same project but different file (version conflict)
        if (!existingMod) {
          conflictingMod =
            allMods.find(
              (m) =>
                m.source === "curseforge" &&
                m.cf_project_id === modEntry.cf_project_id &&
                m.cf_file_id !== modEntry.cf_file_id
            ) || null;

          if (conflictingMod) {
            console.log(
              `[Import] Version conflict detected: ${conflictingMod.name} (existing file: ${conflictingMod.cf_file_id} vs new file: ${modEntry.cf_file_id})`
            );
          }
        }
      } else if (modEntry.source === "modrinth" && modEntry.mr_version_id) {
        const allMods = await this.getAllMods();
        existingMod =
          allMods.find(
            (m) =>
              m.source === "modrinth" &&
              m.mr_version_id === modEntry.mr_version_id
          ) || null;

        // Check for same project but different version
        if (!existingMod) {
          conflictingMod =
            allMods.find(
              (m) =>
                m.source === "modrinth" &&
                m.mr_project_id === modEntry.mr_project_id &&
                m.mr_version_id !== modEntry.mr_version_id
            ) || null;
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

        // Remove old version if it's not used in other modpacks
        const allModpacks = await this.getAllModpacks();
        const isUsedElsewhere = allModpacks.some(
          (mp) => mp.id !== modpackId && mp.mod_ids.includes(conflictingMod!.id)
        );

        if (!isUsedElsewhere) {
          await this.deleteMod(conflictingMod.id);
          console.log(
            `[Import] Removed old version from library: ${conflictingMod.name}`
          );
        }

        // Add new version - will be handled by the fetch logic below
        conflictingMod = null; // Clear to trigger fetch
      }

      if (!existingMod && !conflictingMod) {
        // New mod - fetch from CurseForge API for complete metadata
        console.log(
          `[Import] Fetching mod from CurseForge: ${modEntry.name} (${modEntry.cf_project_id}/${modEntry.cf_file_id})`
        );

        let newMod: Mod;

        if (
          modEntry.source === "curseforge" &&
          modEntry.cf_project_id &&
          modEntry.cf_file_id
        ) {
          try {
            // Fetch complete data from CurseForge API
            const cfMod = await cfService.getMod(modEntry.cf_project_id);
            const cfFile = await cfService.getFile(
              modEntry.cf_project_id,
              modEntry.cf_file_id
            );

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
              console.log(
                `[Import] Added ${contentType}: ${newMod.name} v${newMod.version}`
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

      // Import disabled_mod_ids from manifest (filter to only include mods that exist in the import)
      const importedModIdSet = new Set(newModIds);
      const disabledFromManifest = (manifest.disabled_mods || []).filter(
        (id: string) => importedModIdSet.has(id)
      );
      modpack.disabled_mod_ids = disabledFromManifest;

      modpack.updated_at = new Date().toISOString();
      await this.safeWriteJson(this.getModpackPath(modpackId), modpack);
    }

    // Import version history if present in manifest
    if (
      manifest.version_history &&
      Array.isArray(manifest.version_history) &&
      manifest.version_history.length > 0
    ) {
      console.log(
        `[Import] Importing ${manifest.version_history.length} version history entries`
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
        for (const entry of manifest.version_history) {
          // Convert manifest entry to ModpackVersion format
          const version: ModpackVersion = {
            id: entry.version_id || entry.id,
            tag: entry.tag || entry.version_id || "imported",
            message: entry.message || "Imported version",
            created_at:
              entry.timestamp || entry.created_at || new Date().toISOString(),
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
        existingHistory.versions.sort(
          (a: ModpackVersion, b: ModpackVersion) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        await this.saveVersionHistory(existingHistory);
        console.log(
          `[Import] Imported ${importedCount} new version history entries (${
            manifest.version_history.length - importedCount
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
