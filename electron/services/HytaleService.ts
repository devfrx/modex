/**
 * HytaleService - Hytale-specific Mod Management
 * 
 * Hytale mod structure:
 * - Global mods: %APPDATA%/Hytale/UserData/Mods/{ModName}/ or {ModName}.jar
 * - Per-save mods: %APPDATA%/Hytale/UserData/Saves/{SaveName}/mods/{ModName}/
 * - Save config: %APPDATA%/Hytale/UserData/Saves/{SaveName}/config.json
 *   - config.json has a "Mods" section: { "ModId": { "Enabled": true/false } }
 * 
 * Hytale supports both JAR files AND folders as mods.
 * Downloaded mods from CurseForge are typically .jar files that are copied directly.
 */

import { app, shell } from "electron";
import path from "path";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import os from "os";
import AdmZip from "adm-zip";

// ==================== TYPES ====================

/** Hytale mod configuration */
export interface HytaleMod {
  /** Unique ID for ModEx (matches library mod ID format: "cf-file-{fileId}" or "hytale-{name}") */
  id: string;
  
  /** Hytale's internal mod ID (e.g., "JarHax:EyeSpy") - used in config.json */
  hytaleModId?: string;
  
  /** Display name */
  name: string;
  
  /** File/folder name in mods folder */
  folderName: string;
  
  /** Mod version */
  version: string;
  
  /** CurseForge project ID */
  cfProjectId?: number;
  
  /** CurseForge file ID */
  cfFileId?: number;
  
  /** Logo URL from CurseForge */
  logoUrl?: string;
  
  /** Whether the mod exists in global mods folder */
  isInstalled: boolean;
  
  /** Whether the mod is disabled */
  isDisabled: boolean;
  
  /** File/folder size in bytes */
  folderSize?: number;
  
  /** Installation timestamp */
  installedAt?: string;
  
  /** Mod author (from mod.json if available) */
  author?: string;
  
  /** Mod description (from mod.json if available) */
  description?: string;
}

/** Single mod entry in a Hytale modpack */
export interface HytaleModpackEntry {
  /** ModEx ID (cf-file-xxx or hytale-xxx) */
  modId: string;
  
  /** Hytale's internal mod ID (e.g., "JarHax:EyeSpy") for config.json */
  hytaleModId?: string;
  
  /** Display name for UI */
  name: string;
  
  /** Whether this mod should be enabled when modpack is activated */
  enabled: boolean;
  
  /** File name in mods folder (for fallback matching) */
  fileName: string;
  
  /** Version at time of saving */
  version?: string;
}

/** Hytale virtual modpack - a saved configuration of mods */
export interface HytaleModpack {
  /** Unique ID */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Description */
  description?: string;
  
  /** Cover image URL or path */
  imageUrl?: string;
  
  /** 
   * List of mod entries with full metadata.
   */
  mods: HytaleModpackEntry[];
  
  /** 
   * @deprecated Legacy field - map of filenames to enabled state.
   */
  modStates?: Record<string, boolean>;
  
  /** 
   * @deprecated Legacy field - list of enabled mod IDs
   */
  modIds?: string[];
  
  /** 
   * @deprecated Legacy field - list of disabled mod IDs  
   */
  disabledModIds?: string[];
  
  /** Creation timestamp */
  createdAt: string;
  
  /** Last updated timestamp */
  updatedAt: string;
  
  /** Last activated timestamp */
  lastActivated?: string;
  
  /** Whether this is the currently active modpack */
  isActive: boolean;
}

/** Sync result for Hytale mods */
export interface HytaleSyncResult {
  success: boolean;
  installed: number;
  removed: number;
  disabled: number;
  enabled: number;
  errors: string[];
}

// ==================== CONSTANTS ====================

const DEFAULT_HYTALE_PATHS = {
  launcher: "C:\\Program Files\\Hypixel Studios\\Hytale Launcher\\hytale-launcher.exe",
  gameData: path.join(os.homedir(), "AppData", "Roaming", "Hytale"),
  modsFolder: path.join(os.homedir(), "AppData", "Roaming", "Hytale", "UserData", "Mods"),
};

// ==================== SERVICE CLASS ====================

export class HytaleService {
  private modsPath: string;
  private launcherPath: string;
  private modpacks: HytaleModpack[] = [];
  private modpacksPath: string;
  private configPath: string;
  private modMetadataCachePath: string;
  
  /** Cache of installed mods */
  private installedMods: Map<string, HytaleMod> = new Map();
  
  /** Cache of mod metadata (logoUrl, cfProjectId, etc.) keyed by filename */
  private modMetadataCache: Map<string, { cfProjectId?: number; cfFileId?: number; logoUrl?: string }> = new Map();

  constructor(basePath: string) {
    this.modsPath = DEFAULT_HYTALE_PATHS.modsFolder;
    this.launcherPath = DEFAULT_HYTALE_PATHS.launcher;
    this.modpacksPath = path.join(basePath, "hytale-modpacks.json");
    this.configPath = path.join(basePath, "hytale-config.json");
    this.modMetadataCachePath = path.join(basePath, "hytale-mod-metadata.json");
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    await this.loadModMetadataCache();
    await this.loadModpacks();
    await this.scanInstalledMods();
  }
  
  /** Load mod metadata cache from disk */
  private async loadModMetadataCache(): Promise<void> {
    try {
      if (await fs.pathExists(this.modMetadataCachePath)) {
        const data = await fs.readJson(this.modMetadataCachePath);
        this.modMetadataCache = new Map(Object.entries(data));
        console.log(`[HytaleService] Loaded ${this.modMetadataCache.size} mod metadata entries`);
      }
    } catch (error) {
      console.error("[HytaleService] Error loading mod metadata cache:", error);
    }
  }
  
  /** Save mod metadata cache to disk */
  private async saveModMetadataCache(): Promise<void> {
    try {
      const data = Object.fromEntries(this.modMetadataCache);
      await fs.writeJson(this.modMetadataCachePath, data, { spaces: 2 });
    } catch (error) {
      console.error("[HytaleService] Error saving mod metadata cache:", error);
    }
  }
  
  /** Update mod metadata cache for a specific mod file */
  private async updateModMetadataCache(filename: string, metadata: { cfProjectId?: number; cfFileId?: number; logoUrl?: string }): Promise<void> {
    this.modMetadataCache.set(filename, metadata);
    await this.saveModMetadataCache();
  }

  // ==================== CONFIG ====================

  private async loadConfig(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const config = await fs.readJson(this.configPath);
        this.modsPath = config.modsPath || DEFAULT_HYTALE_PATHS.modsFolder;
        this.launcherPath = config.launcherPath || DEFAULT_HYTALE_PATHS.launcher;
      }
    } catch (error) {
      console.error("[HytaleService] Error loading config:", error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await fs.writeJson(this.configPath, {
        modsPath: this.modsPath,
        launcherPath: this.launcherPath,
      }, { spaces: 2 });
    } catch (error) {
      console.error("[HytaleService] Error saving config:", error);
    }
  }

  async setConfig(config: { modsPath?: string; launcherPath?: string }): Promise<void> {
    if (config.modsPath) this.modsPath = config.modsPath;
    if (config.launcherPath) this.launcherPath = config.launcherPath;
    await this.saveConfig();
  }

  getConfig(): { modsPath: string; launcherPath: string } {
    return {
      modsPath: this.modsPath,
      launcherPath: this.launcherPath,
    };
  }

  // ==================== MOD SCANNING ====================

  /** Scan the mods folder and update installed mods cache */
  async scanInstalledMods(): Promise<HytaleMod[]> {
    this.installedMods.clear();

    if (!(await fs.pathExists(this.modsPath))) {
      console.log("[HytaleService] Mods folder does not exist:", this.modsPath);
      return [];
    }

    try {
      const entries = await fs.readdir(this.modsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip hidden files/folders
        if (entry.name.startsWith(".")) continue;
        
        const entryPath = path.join(this.modsPath, entry.name);
        const stat = await fs.stat(entryPath);
        
        if (entry.isDirectory()) {
          // Folder-based mod
          const modInfo = await this.readModInfo(entryPath);
          
          const mod: HytaleMod = {
            id: modInfo.id || `hytale-${entry.name}`,
            hytaleModId: modInfo.hytaleModId, // Include hytaleModId for folder mods too
            name: modInfo.name || this.formatModName(entry.name),
            folderName: entry.name,
            version: modInfo.version || "unknown",
            isInstalled: true,
            isDisabled: false,
            folderSize: await this.getFolderSize(entryPath),
            installedAt: stat.mtime.toISOString(),
            author: modInfo.author,
            description: modInfo.description,
            cfProjectId: modInfo.cfProjectId,
            cfFileId: modInfo.cfFileId,
            logoUrl: modInfo.logoUrl,
          };
          
          console.log(`[HytaleService] Found folder mod: ${mod.name} (hytaleModId: ${mod.hytaleModId}, cfProjectId: ${mod.cfProjectId})`);
          this.installedMods.set(mod.id, mod);
        } else if (
          entry.name.endsWith(".jar") || 
          entry.name.endsWith(".zip") ||
          entry.name.endsWith(".jar.disabled") ||
          entry.name.endsWith(".zip.disabled")
        ) {
          // File-based mod (JAR or ZIP), possibly disabled
          const isDisabled = entry.name.endsWith(".disabled");
          const cleanName = entry.name.replace(/\.disabled$/, "");
          const modInfo = this.parseModFilename(cleanName);
          
          // Try to read mod info from inside JAR if possible
          const jarModInfo = await this.readModInfoFromJar(entryPath);
          
          // Prefer filename-parsed ID if it has a CurseForge file ID (more useful for ModEx)
          // Otherwise fall back to JAR's internal ID or hytale-based ID
          let modId: string;
          if (modInfo.cfFileId) {
            // Filename contains CurseForge file ID - use that for easy library matching
            modId = modInfo.id;
          } else if (jarModInfo.id && jarModInfo.id !== jarModInfo.hytaleModId) {
            // JAR has a proper slug ID that's different from hytaleModId
            modId = jarModInfo.id;
          } else {
            // Fall back to filename-parsed ID or hytale-based ID
            modId = modInfo.id || `hytale-${entry.name}`;
          }
          
          // Get cached metadata (cfProjectId, logoUrl) for this file
          const cachedMeta = this.modMetadataCache.get(entry.name.replace(/\.disabled$/, ""));
          
          const mod: HytaleMod = {
            id: modId,
            hytaleModId: jarModInfo.hytaleModId, // Real Hytale mod ID for config.json
            name: jarModInfo.name || modInfo.name,
            folderName: entry.name, // Actually filename for JAR mods
            version: jarModInfo.version || modInfo.version,
            isInstalled: true,
            isDisabled,
            folderSize: stat.size,
            installedAt: stat.mtime.toISOString(),
            author: jarModInfo.author,
            description: jarModInfo.description,
            cfProjectId: cachedMeta?.cfProjectId || jarModInfo.cfProjectId || modInfo.cfProjectId,
            cfFileId: cachedMeta?.cfFileId || jarModInfo.cfFileId || modInfo.cfFileId,
            logoUrl: cachedMeta?.logoUrl,
          };
          
          console.log(`[HytaleService] Found mod: ${mod.name} (id: ${mod.id}, hytaleModId: ${mod.hytaleModId}, cfProjectId: ${mod.cfProjectId})`);
          this.installedMods.set(mod.id, mod);
        }
      }

      console.log(`[HytaleService] Scanned ${this.installedMods.size} mods`);
      return Array.from(this.installedMods.values());
    } catch (error) {
      console.error("[HytaleService] Error scanning mods:", error);
      return [];
    }
  }

  /** Parse mod info from JAR filename like "EyeSpy-2026.1.13-65469.jar" */
  private parseModFilename(filename: string): {
    id: string;
    name: string;
    version: string;
    cfFileId?: number;
    cfProjectId?: number;
  } {
    // Remove extension
    const baseName = filename.replace(/\.(jar|zip)$/i, "");
    
    // Try to parse: ModName-Version-FileId or ModName-Version
    // Example: EyeSpy-2026.1.13-65469
    const parts = baseName.split("-");
    
    if (parts.length >= 3) {
      // Check if last part is a number (fileId)
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        const cfFileId = parseInt(lastPart, 10);
        const version = parts[parts.length - 2];
        const name = parts.slice(0, -2).join("-");
        return {
          id: `cf-file-${cfFileId}`,
          name: this.formatModName(name),
          version,
          cfFileId,
        };
      }
    }
    
    if (parts.length >= 2) {
      // ModName-Version format
      const version = parts[parts.length - 1];
      const name = parts.slice(0, -1).join("-");
      return {
        id: `hytale-${baseName}`,
        name: this.formatModName(name),
        version,
      };
    }
    
    // Just the mod name
    return {
      id: `hytale-${baseName}`,
      name: this.formatModName(baseName),
      version: "unknown",
    };
  }

  /** Read mod info from inside a JAR file */
  private async readModInfoFromJar(jarPath: string): Promise<{
    id?: string;
    hytaleModId?: string;
    name?: string;
    version?: string;
    author?: string;
    description?: string;
    cfProjectId?: number;
    cfFileId?: number;
  }> {
    try {
      const zip = new AdmZip(jarPath);
      const possibleFiles = ["manifest.json", "mod.json", "hytale.mod.json", "pack.json", "modex.json"];
      
      for (const filename of possibleFiles) {
        const entry = zip.getEntry(filename);
        if (entry) {
          const content = entry.getData().toString("utf8");
          try {
            const data = JSON.parse(content);
            
            // Hytale manifest.json format uses Group and Name
            // e.g., { "Group": "JarHax", "Name": "EyeSpy" } -> "JarHax:EyeSpy"
            let hytaleModId: string | undefined;
            if (data.Group && data.Name) {
              hytaleModId = `${data.Group}:${data.Name}`;
            } else {
              hytaleModId = data.id || data.modId;
            }
            
            // Get author from Authors array or author field
            let author: string | undefined;
            if (data.Authors && Array.isArray(data.Authors) && data.Authors.length > 0) {
              author = data.Authors.map((a: any) => a.Name || a.name || a).join(", ");
            } else {
              author = data.author || data.authors?.[0]?.name || data.authors?.[0];
            }
            
            return {
              id: data.slug, // Only use slug as ID, not hytaleModId
              hytaleModId: hytaleModId,
              name: data.Name || data.name || data.displayName || data.title,
              version: data.Version || data.version,
              author: author,
              description: data.Description || data.description,
              cfProjectId: data.cfProjectId || data.curseforge?.projectId,
              cfFileId: data.cfFileId || data.curseforge?.fileId,
            };
          } catch {}
        }
      }
    } catch (err) {
      // JAR reading failed, that's okay
      console.error("[HytaleService] Error reading JAR:", err);
    }
    
    return {};
  }

  /** Read mod info from mod folder (checks for mod.json, manifest.json, etc.) */
  private async readModInfo(folderPath: string): Promise<{
    id?: string;
    hytaleModId?: string;
    name?: string;
    version?: string;
    author?: string;
    description?: string;
    cfProjectId?: number;
    cfFileId?: number;
    logoUrl?: string;
  }> {
    const possibleFiles = ["mod.json", "manifest.json", "pack.json", "info.json", "modex.json"];
    
    for (const filename of possibleFiles) {
      const filePath = path.join(folderPath, filename);
      if (await fs.pathExists(filePath)) {
        try {
          const data = await fs.readJson(filePath);
          
          // Parse hytaleModId from Hytale manifest format (Group:Name)
          let hytaleModId: string | undefined;
          if (data.Group && data.Name) {
            hytaleModId = `${data.Group}:${data.Name}`;
          } else {
            hytaleModId = data.id || data.modId;
          }
          
          // Get author from Authors array or author field
          let author: string | undefined;
          if (data.Authors && Array.isArray(data.Authors) && data.Authors.length > 0) {
            author = data.Authors.map((a: any) => a.Name || a.name || a).join(", ");
          } else {
            author = data.author || data.authors?.[0]?.name || data.authors?.[0];
          }
          
          return {
            id: data.slug, // Only use slug as ID, not hytaleModId
            hytaleModId: hytaleModId,
            name: data.Name || data.name || data.displayName || data.title,
            version: data.Version || data.version,
            author: author,
            description: data.Description || data.description,
            cfProjectId: data.cfProjectId || data.curseforge?.projectId,
            cfFileId: data.cfFileId || data.curseforge?.fileId,
            logoUrl: data.logoUrl,
          };
        } catch {}
      }
    }
    
    return {};
  }

  /** Calculate folder size recursively */
  private async getFolderSize(folderPath: string): Promise<number> {
    try {
      let size = 0;
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          size += await this.getFolderSize(entryPath);
        } else {
          const stat = await fs.stat(entryPath);
          size += stat.size;
        }
      }
      
      return size;
    } catch {
      return 0;
    }
  }

  /** Format mod folder name to display name */
  private formatModName(folderName: string): string {
    // Replace underscores and hyphens with spaces
    let name = folderName.replace(/[-_]/g, " ");
    // Capitalize first letter of each word
    name = name.replace(/\b\w/g, c => c.toUpperCase());
    return name;
  }

  /** Get all installed mods */
  getInstalledMods(): HytaleMod[] {
    return Array.from(this.installedMods.values());
  }

  /** Get a specific installed mod */
  getInstalledMod(id: string): HytaleMod | null {
    return this.installedMods.get(id) || null;
  }

  // ==================== MOD INSTALLATION ====================

  /** 
   * Install a mod from a downloaded file.
   * Hytale supports both JAR files (copied directly) and folders.
   * ZIP files are extracted, JAR files are copied as-is.
   */
  async installMod(
    sourceFilePath: string,
    metadata: {
      id: string;
      name: string;
      version: string;
      cfProjectId?: number;
      cfFileId?: number;
      logoUrl?: string;
    }
  ): Promise<{ success: boolean; error?: string; folderName?: string }> {
    try {
      await fs.ensureDir(this.modsPath);
      
      const filename = path.basename(sourceFilePath);
      const ext = path.extname(filename).toLowerCase();
      
      // JAR files: Copy directly to mods folder (Hytale supports JAR mods)
      if (ext === ".jar") {
        const destPath = path.join(this.modsPath, filename);
        
        // Check if already exists
        if (await fs.pathExists(destPath)) {
          console.log("[HytaleService] Mod JAR already installed:", filename);
          return { success: true, folderName: filename };
        }
        
        // Copy JAR file directly
        await fs.copy(sourceFilePath, destPath);
        console.log(`[HytaleService] Copied JAR mod to: ${destPath}`);
        
        // Save metadata to cache for future scans
        if (metadata.cfProjectId || metadata.logoUrl) {
          await this.updateModMetadataCache(filename, {
            cfProjectId: metadata.cfProjectId,
            cfFileId: metadata.cfFileId,
            logoUrl: metadata.logoUrl,
          });
        }
        
        // Read hytaleModId from JAR
        const jarModInfo = await this.readModInfoFromJar(destPath);
        
        // Update cache with hytaleModId
        const stat = await fs.stat(destPath);
        const mod: HytaleMod = {
          id: metadata.id,
          hytaleModId: jarModInfo.hytaleModId, // Set hytaleModId from JAR manifest
          name: jarModInfo.name || metadata.name,
          folderName: filename,
          version: jarModInfo.version || metadata.version,
          cfProjectId: jarModInfo.cfProjectId || metadata.cfProjectId,
          cfFileId: jarModInfo.cfFileId || metadata.cfFileId,
          logoUrl: metadata.logoUrl, // Save logo URL from CurseForge
          isInstalled: true,
          isDisabled: false,
          folderSize: stat.size,
          installedAt: new Date().toISOString(),
          author: jarModInfo.author,
          description: jarModInfo.description,
        };
        this.installedMods.set(mod.id, mod);
        
        console.log(`[HytaleService] Installed JAR mod: ${filename} (hytaleModId: ${mod.hytaleModId})`);
        return { success: true, folderName: filename };
      }
      
      // ZIP files: Extract to folder
      if (ext === ".zip") {
        const modFolderName = metadata.name.replace(/[<>:"/\\|?*]/g, "_");
        const destFolder = path.join(this.modsPath, modFolderName);
        
        // Check if already exists
        if (await fs.pathExists(destFolder)) {
          console.log("[HytaleService] Mod already installed:", modFolderName);
          return { success: true, folderName: modFolderName };
        }

        // Extract the ZIP
        await this.extractModZip(sourceFilePath, destFolder);
        console.log(`[HytaleService] Extracted mod to: ${destFolder}`);
        
        // Save mod metadata for future reference
        await this.saveModMetadata(destFolder, metadata);
        
        // Read mod info from folder (includes hytaleModId)
        const folderModInfo = await this.readModInfo(destFolder);
        
        // Update cache
        const stat = await fs.stat(destFolder);
        const mod: HytaleMod = {
          id: metadata.id,
          hytaleModId: folderModInfo.hytaleModId,
          name: folderModInfo.name || metadata.name,
          folderName: modFolderName,
          version: folderModInfo.version || metadata.version,
          cfProjectId: metadata.cfProjectId,
          cfFileId: metadata.cfFileId,
          logoUrl: metadata.logoUrl, // Save logo URL from CurseForge
          isInstalled: true,
          isDisabled: false,
          folderSize: await this.getFolderSize(destFolder),
          installedAt: new Date().toISOString(),
          author: folderModInfo.author,
          description: folderModInfo.description,
        };
        this.installedMods.set(mod.id, mod);

        console.log(`[HytaleService] Installed folder mod: ${modFolderName} (hytaleModId: ${mod.hytaleModId})`);
        return { success: true, folderName: modFolderName };
      }
      
      // Other formats: Copy as folder
      const modFolderName = metadata.name.replace(/[<>:"/\\|?*]/g, "_");
      const destFolder = path.join(this.modsPath, modFolderName);
      
      if (await fs.pathExists(destFolder)) {
        console.log("[HytaleService] Mod already installed:", modFolderName);
        return { success: true, folderName: modFolderName };
      }

      const sourceStat = await fs.stat(sourceFilePath);
      if (sourceStat.isDirectory()) {
        await fs.copy(sourceFilePath, destFolder);
      } else {
        // Single file - create folder and place file inside
        await fs.ensureDir(destFolder);
        await fs.copy(sourceFilePath, path.join(destFolder, filename));
      }
      
      // Save mod metadata for future reference
      await this.saveModMetadata(destFolder, metadata);
      
      // Read mod info from folder
      const folderModInfo = await this.readModInfo(destFolder);
      
      // Update cache
      const stat = await fs.stat(destFolder);
      const mod: HytaleMod = {
        id: metadata.id,
        hytaleModId: folderModInfo.hytaleModId,
        name: folderModInfo.name || metadata.name,
        folderName: modFolderName,
        version: folderModInfo.version || metadata.version,
        cfProjectId: metadata.cfProjectId,
        cfFileId: metadata.cfFileId,
        logoUrl: metadata.logoUrl, // Save logo URL from CurseForge
        isInstalled: true,
        isDisabled: false,
        folderSize: await this.getFolderSize(destFolder),
        installedAt: new Date().toISOString(),
        author: folderModInfo.author,
        description: folderModInfo.description,
      };
      this.installedMods.set(mod.id, mod);

      console.log(`[HytaleService] Installed mod: ${modFolderName}`);
      return { success: true, folderName: modFolderName };
    } catch (error: any) {
      console.error("[HytaleService] Error installing mod:", error);
      return { success: false, error: error.message };
    }
  }

  /** Extract a mod ZIP to destination folder */
  private async extractModZip(zipPath: string, destFolder: string): Promise<void> {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    
    // Check if ZIP has a single root folder
    const rootFolders = new Set<string>();
    for (const entry of entries) {
      const parts = entry.entryName.split("/");
      if (parts.length > 1 && parts[0]) {
        rootFolders.add(parts[0]);
      }
    }

    await fs.ensureDir(destFolder);

    if (rootFolders.size === 1) {
      // Single root folder - extract contents directly
      const rootFolder = Array.from(rootFolders)[0];
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        
        const relativePath = entry.entryName.replace(`${rootFolder}/`, "");
        if (!relativePath) continue;
        
        const destPath = path.join(destFolder, relativePath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, entry.getData());
      }
    } else {
      // Multiple items at root - extract as-is
      zip.extractAllTo(destFolder, true);
    }
  }

  /** Save mod metadata to modex.json in mod folder */
  private async saveModMetadata(modFolder: string, metadata: {
    id: string;
    name: string;
    version: string;
    cfProjectId?: number;
    cfFileId?: number;
    logoUrl?: string;
  }): Promise<void> {
    const metadataPath = path.join(modFolder, "modex.json");
    await fs.writeJson(metadataPath, {
      id: metadata.id,
      name: metadata.name,
      version: metadata.version,
      cfProjectId: metadata.cfProjectId,
      cfFileId: metadata.cfFileId,
      logoUrl: metadata.logoUrl,
      installedAt: new Date().toISOString(),
      installedBy: "ModEx",
    }, { spaces: 2 });
  }

  /** Remove a mod (delete the mod folder) */
  async removeMod(id: string): Promise<boolean> {
    const mod = this.installedMods.get(id);
    if (!mod) return false;

    try {
      const folderPath = path.join(this.modsPath, mod.folderName);
      if (await fs.pathExists(folderPath)) {
        // Move to backup instead of deleting
        const backupPath = path.join(this.modsPath, ".backup", mod.folderName);
        await fs.ensureDir(path.join(this.modsPath, ".backup"));
        await fs.move(folderPath, backupPath, { overwrite: true });
      }
      this.installedMods.delete(id);
      console.log(`[HytaleService] Removed mod: ${mod.folderName}`);
      return true;
    } catch (error) {
      console.error("[HytaleService] Error removing mod:", error);
      return false;
    }
  }

  /** 
   * Enable/disable a mod by renaming folder with .disabled suffix
   * Note: This only affects the global mod folder. Per-save mods are controlled via config.json
   */
  async toggleMod(id: string): Promise<{ enabled: boolean } | null> {
    const mod = this.installedMods.get(id);
    if (!mod) return null;

    try {
      const currentPath = path.join(this.modsPath, mod.folderName);
      let newFolderName: string;
      let newEnabled: boolean;

      if (mod.isDisabled) {
        // Enable: remove .disabled suffix
        newFolderName = mod.folderName.replace(/\.disabled$/, "");
        newEnabled = true;
      } else {
        // Disable: add .disabled suffix
        newFolderName = mod.folderName + ".disabled";
        newEnabled = false;
      }

      const newPath = path.join(this.modsPath, newFolderName);
      await fs.rename(currentPath, newPath);

      // Update cache
      mod.folderName = newFolderName;
      mod.isDisabled = !newEnabled;

      console.log(`[HytaleService] Mod ${newEnabled ? "enabled" : "disabled"}: ${mod.name}`);
      return { enabled: newEnabled };
    } catch (error) {
      console.error("[HytaleService] Error toggling mod:", error);
      return null;
    }
  }

  /** Enable a specific mod */
  async enableMod(id: string): Promise<boolean> {
    const mod = this.installedMods.get(id);
    if (!mod) return false;
    if (!mod.isDisabled) return true; // Already enabled

    const result = await this.toggleMod(id);
    return result?.enabled === true;
  }

  /** Disable a specific mod */
  async disableMod(id: string): Promise<boolean> {
    const mod = this.installedMods.get(id);
    if (!mod) return false;
    if (mod.isDisabled) return true; // Already disabled

    const result = await this.toggleMod(id);
    return result?.enabled === false;
  }

  // ==================== MODPACK MANAGEMENT ====================

  private async loadModpacks(): Promise<void> {
    try {
      if (await fs.pathExists(this.modpacksPath)) {
        this.modpacks = await fs.readJson(this.modpacksPath);
      }
    } catch (error) {
      console.error("[HytaleService] Error loading modpacks:", error);
      this.modpacks = [];
    }
  }

  private async saveModpacks(): Promise<void> {
    try {
      await fs.writeJson(this.modpacksPath, this.modpacks, { spaces: 2 });
    } catch (error) {
      console.error("[HytaleService] Error saving modpacks:", error);
    }
  }

  /** Get all modpacks */
  getModpacks(): HytaleModpack[] {
    return [...this.modpacks];
  }

  /** Get a specific modpack */
  getModpack(id: string): HytaleModpack | null {
    return this.modpacks.find(p => p.id === id) || null;
  }

  /** Get the currently active modpack */
  getActiveModpack(): HytaleModpack | null {
    return this.modpacks.find(p => p.isActive) || null;
  }

  /** 
   * Get base filename for a mod (without .disabled suffix)
   */
  private getBaseFileName(fileName: string): string {
    return fileName.replace(/\.disabled$/, "");
  }

  /** Create a new modpack from current mods state */
  async createModpack(options: {
    name: string;
    description?: string;
    imageUrl?: string;
    modIds?: string[]; // Optional: only include these mods (if empty, include all)
  }): Promise<HytaleModpack> {
    await this.scanInstalledMods();
    const installedMods = this.getInstalledMods();
    
    // Build mods array with full metadata
    const mods: HytaleModpackEntry[] = [];
    for (const mod of installedMods) {
      // If modIds specified, only include those mods
      if (options.modIds && options.modIds.length > 0) {
        if (!options.modIds.includes(mod.id)) continue;
      }
      
      mods.push({
        modId: mod.id,
        hytaleModId: mod.hytaleModId,
        name: mod.name,
        enabled: !mod.isDisabled,
        fileName: this.getBaseFileName(mod.folderName),
        version: mod.version,
      });
    }

    const now = new Date().toISOString();
    const modpack: HytaleModpack = {
      id: `hytale-pack-${Date.now()}`,
      name: options.name,
      description: options.description,
      imageUrl: options.imageUrl,
      mods,
      createdAt: now,
      updatedAt: now,
      isActive: false,
    };

    this.modpacks.push(modpack);
    await this.saveModpacks();

    const enabledCount = mods.filter(m => m.enabled).length;
    const disabledCount = mods.filter(m => !m.enabled).length;
    console.log(`[HytaleService] Created modpack: ${modpack.name} (${enabledCount} enabled, ${disabledCount} disabled)`);
    return modpack;
  }

  /** Update a modpack */
  async updateModpack(id: string, updates: Partial<Omit<HytaleModpack, "id" | "createdAt">>): Promise<HytaleModpack | null> {
    const index = this.modpacks.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.modpacks[index] = {
      ...this.modpacks[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveModpacks();
    return this.modpacks[index];
  }

  /** Delete a modpack */
  async deleteModpack(id: string): Promise<boolean> {
    const index = this.modpacks.findIndex(p => p.id === id);
    if (index === -1) return false;

    this.modpacks.splice(index, 1);
    await this.saveModpacks();
    return true;
  }

  /** Save current mods state to an existing modpack */
  async saveToModpack(modpackId: string): Promise<boolean> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack) return false;

    await this.scanInstalledMods();
    const installedMods = this.getInstalledMods();

    // Build new mods array with full metadata
    const mods: HytaleModpackEntry[] = [];
    for (const mod of installedMods) {
      mods.push({
        modId: mod.id,
        hytaleModId: mod.hytaleModId,
        name: mod.name,
        enabled: !mod.isDisabled,
        fileName: this.getBaseFileName(mod.folderName),
        version: mod.version,
      });
    }
    
    modpack.mods = mods;
    modpack.updatedAt = new Date().toISOString();
    // Clear legacy fields if they exist
    delete modpack.modStates;
    delete modpack.modIds;
    delete modpack.disabledModIds;

    await this.saveModpacks();
    
    const enabledCount = mods.filter(m => m.enabled).length;
    const disabledCount = mods.filter(m => !m.enabled).length;
    console.log(`[HytaleService] Saved to modpack: ${modpack.name} (${enabledCount} enabled, ${disabledCount} disabled)`);
    return true;
  }

  /**
   * Activate a modpack - enable/disable mods based on saved configuration.
   * Only affects mods that exist in both the folder AND the modpack.
   * Does NOT remove mods, only toggles their state.
   * Returns detailed sync result including missing mods.
   */
  async activateModpack(modpackId: string): Promise<HytaleSyncResult & { 
    missingMods: string[]; 
    newMods: string[];
  }> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack) {
      return { 
        success: false, installed: 0, removed: 0, disabled: 0, enabled: 0, 
        errors: ["Modpack not found"], missingMods: [], newMods: [] 
      };
    }

    const result = {
      success: true,
      installed: 0,
      removed: 0,
      disabled: 0,
      enabled: 0,
      errors: [] as string[],
      missingMods: [] as string[],
      newMods: [] as string[],
    };

    try {
      await fs.ensureDir(this.modsPath);
      await this.scanInstalledMods();
      
      const currentMods = this.getInstalledMods();
      const currentModIds = new Set(currentMods.map(m => m.id));
      const currentFileNames = new Map(currentMods.map(m => [this.getBaseFileName(m.folderName), m]));
      
      // NEW FORMAT: Use mods array
      if (modpack.mods && modpack.mods.length > 0) {
        const modpackModIds = new Set(modpack.mods.map(m => m.modId));
        
        // Find missing mods (in modpack but not installed)
        for (const entry of modpack.mods) {
          // Try to find by modId first, then by fileName
          const mod = this.installedMods.get(entry.modId) || currentFileNames.get(entry.fileName);
          
          if (!mod) {
            result.missingMods.push(entry.name);
            continue;
          }
          
          // Apply the saved state
          if (entry.enabled && mod.isDisabled) {
            await this.toggleMod(mod.id);
            result.enabled++;
          } else if (!entry.enabled && !mod.isDisabled) {
            await this.toggleMod(mod.id);
            result.disabled++;
          }
        }
        
        // Find new mods (installed but not in modpack)
        for (const mod of currentMods) {
          const inModpack = modpack.mods.some(e => 
            e.modId === mod.id || e.fileName === this.getBaseFileName(mod.folderName)
          );
          if (!inModpack) {
            result.newMods.push(mod.name);
          }
        }
      }
      // LEGACY FORMAT: Use modStates map (backward compatibility)
      else if (modpack.modStates && Object.keys(modpack.modStates).length > 0) {
        for (const mod of currentMods) {
          const baseFileName = this.getBaseFileName(mod.folderName);
          
          if (baseFileName in modpack.modStates) {
            const shouldBeEnabled = modpack.modStates[baseFileName];
            
            if (shouldBeEnabled && mod.isDisabled) {
              await this.toggleMod(mod.id);
              result.enabled++;
            } else if (!shouldBeEnabled && !mod.isDisabled) {
              await this.toggleMod(mod.id);
              result.disabled++;
            }
          } else {
            result.newMods.push(mod.name);
          }
        }
        
        // Check for missing
        for (const fileName of Object.keys(modpack.modStates)) {
          if (!currentFileNames.has(fileName)) {
            result.missingMods.push(fileName);
          }
        }
      }
      // OLDEST LEGACY FORMAT: Use modIds arrays
      else if (modpack.modIds && modpack.modIds.length > 0) {
        for (const mod of currentMods) {
          const shouldBeEnabled = modpack.modIds.includes(mod.id);
          const shouldBeDisabled = modpack.disabledModIds?.includes(mod.id);

          if (shouldBeEnabled && mod.isDisabled) {
            await this.toggleMod(mod.id);
            result.enabled++;
          } else if (shouldBeDisabled && !mod.isDisabled) {
            await this.toggleMod(mod.id);
            result.disabled++;
          }
        }
      }

      // Mark this modpack as active
      for (const pack of this.modpacks) {
        pack.isActive = pack.id === modpackId;
      }
      modpack.lastActivated = new Date().toISOString();
      await this.saveModpacks();

      console.log(`[HytaleService] Activated modpack: ${modpack.name} (enabled: ${result.enabled}, disabled: ${result.disabled})`);
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Compare current installed mods state with a modpack.
   * Returns detailed diff information for UI display.
   */
  async compareWithModpack(modpackId: string): Promise<{
    matching: Array<{ name: string; enabled: boolean }>;
    different: Array<{ name: string; currentEnabled: boolean; modpackEnabled: boolean }>;
    missingFromFolder: Array<{ name: string; enabled: boolean }>;
    newInFolder: Array<{ name: string; enabled: boolean }>;
  }> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack) {
      return { matching: [], different: [], missingFromFolder: [], newInFolder: [] };
    }

    await this.scanInstalledMods();
    const currentMods = this.getInstalledMods();
    const currentByFileName = new Map(currentMods.map(m => [this.getBaseFileName(m.folderName), m]));
    const currentById = new Map(currentMods.map(m => [m.id, m]));

    const matching: Array<{ name: string; enabled: boolean }> = [];
    const different: Array<{ name: string; currentEnabled: boolean; modpackEnabled: boolean }> = [];
    const missingFromFolder: Array<{ name: string; enabled: boolean }> = [];
    const newInFolder: Array<{ name: string; enabled: boolean }> = [];

    // Check modpack mods against current folder
    if (modpack.mods && modpack.mods.length > 0) {
      const modpackModIds = new Set<string>();
      const modpackFileNames = new Set<string>();
      
      for (const entry of modpack.mods) {
        modpackModIds.add(entry.modId);
        modpackFileNames.add(entry.fileName);
        
        // Find mod by ID or fileName
        const mod = currentById.get(entry.modId) || currentByFileName.get(entry.fileName);
        
        if (!mod) {
          missingFromFolder.push({ name: entry.name, enabled: entry.enabled });
          continue;
        }
        
        const currentEnabled = !mod.isDisabled;
        if (currentEnabled === entry.enabled) {
          matching.push({ name: entry.name, enabled: entry.enabled });
        } else {
          different.push({ 
            name: entry.name, 
            currentEnabled, 
            modpackEnabled: entry.enabled 
          });
        }
      }
      
      // Find new mods in folder not in modpack
      for (const mod of currentMods) {
        const baseFileName = this.getBaseFileName(mod.folderName);
        if (!modpackModIds.has(mod.id) && !modpackFileNames.has(baseFileName)) {
          newInFolder.push({ name: mod.name, enabled: !mod.isDisabled });
        }
      }
    }
    // Legacy format fallback
    else if (modpack.modStates && Object.keys(modpack.modStates).length > 0) {
      const modpackFileNames = new Set(Object.keys(modpack.modStates));
      
      for (const [fileName, enabled] of Object.entries(modpack.modStates)) {
        const mod = currentByFileName.get(fileName);
        
        if (!mod) {
          missingFromFolder.push({ name: fileName, enabled });
          continue;
        }
        
        const currentEnabled = !mod.isDisabled;
        if (currentEnabled === enabled) {
          matching.push({ name: mod.name, enabled });
        } else {
          different.push({ 
            name: mod.name, 
            currentEnabled, 
            modpackEnabled: enabled 
          });
        }
      }
      
      for (const mod of currentMods) {
        const baseFileName = this.getBaseFileName(mod.folderName);
        if (!modpackFileNames.has(baseFileName)) {
          newInFolder.push({ name: mod.name, enabled: !mod.isDisabled });
        }
      }
    }

    return { matching, different, missingFromFolder, newInFolder };
  }

  /**
   * Duplicate a modpack with a new name.
   */
  async duplicateModpack(modpackId: string, newName: string): Promise<HytaleModpack | null> {
    const source = this.modpacks.find(p => p.id === modpackId);
    if (!source) return null;

    const now = new Date().toISOString();
    const duplicate: HytaleModpack = {
      id: `hytale-pack-${Date.now()}`,
      name: newName,
      description: source.description,
      imageUrl: source.imageUrl,
      mods: source.mods ? [...source.mods.map(m => ({ ...m }))] : [],
      modStates: source.modStates ? { ...source.modStates } : undefined,
      modIds: source.modIds ? [...source.modIds] : undefined,
      disabledModIds: source.disabledModIds ? [...source.disabledModIds] : undefined,
      createdAt: now,
      updatedAt: now,
      isActive: false,
    };

    this.modpacks.push(duplicate);
    await this.saveModpacks();
    
    console.log(`[HytaleService] Duplicated modpack: ${source.name} -> ${newName}`);
    return duplicate;
  }

  /**
   * Toggle a mod's enabled state within a modpack (without applying to folder).
   */
  async toggleModInModpack(modpackId: string, modId: string): Promise<boolean> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack || !modpack.mods) return false;

    const entry = modpack.mods.find(m => m.modId === modId);
    if (!entry) return false;

    entry.enabled = !entry.enabled;
    modpack.updatedAt = new Date().toISOString();
    await this.saveModpacks();
    
    return true;
  }

  /**
   * Add a mod to a modpack.
   */
  async addModToModpack(modpackId: string, modId: string): Promise<boolean> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack) return false;

    // Ensure mods array exists
    if (!modpack.mods) modpack.mods = [];

    // Check if already exists
    if (modpack.mods.some(m => m.modId === modId)) return false;

    // Get mod info
    const mod = this.installedMods.get(modId);
    if (!mod) return false;

    modpack.mods.push({
      modId: mod.id,
      hytaleModId: mod.hytaleModId,
      name: mod.name,
      enabled: true, // Default to enabled when adding
      fileName: this.getBaseFileName(mod.folderName),
      version: mod.version,
    });

    modpack.updatedAt = new Date().toISOString();
    await this.saveModpacks();
    
    return true;
  }

  /**
   * Remove a mod from a modpack.
   */
  async removeModFromModpack(modpackId: string, modId: string): Promise<boolean> {
    const modpack = this.modpacks.find(p => p.id === modpackId);
    if (!modpack || !modpack.mods) return false;

    const index = modpack.mods.findIndex(m => m.modId === modId);
    if (index === -1) return false;

    modpack.mods.splice(index, 1);
    modpack.updatedAt = new Date().toISOString();
    await this.saveModpacks();
    
    return true;
  }

  // ==================== GAME LAUNCHING ====================

  /** Check if Hytale is installed */
  async isInstalled(): Promise<boolean> {
    return await fs.pathExists(this.launcherPath);
  }

  /** Launch Hytale */
  async launch(): Promise<{ success: boolean; error?: string; pid?: number }> {
    if (!(await this.isInstalled())) {
      return { success: false, error: "Hytale Launcher not found" };
    }

    try {
      const child = spawn(this.launcherPath, [], {
        detached: true,
        stdio: "ignore",
        cwd: path.dirname(this.launcherPath),
      });

      child.unref();

      console.log(`[HytaleService] Launched Hytale (PID: ${child.pid})`);
      return { success: true, pid: child.pid };
    } catch (error: any) {
      console.error("[HytaleService] Launch error:", error);
      return { success: false, error: error.message };
    }
  }

  /** Open mods folder in explorer */
  async openModsFolder(): Promise<boolean> {
    try {
      await fs.ensureDir(this.modsPath);
      shell.openPath(this.modsPath);
      return true;
    } catch (error) {
      console.error("[HytaleService] Error opening mods folder:", error);
      return false;
    }
  }

  /** Open a specific mod folder in explorer */
  async openModFolder(modId: string): Promise<boolean> {
    try {
      const mod = this.installedMods.get(modId);
      if (!mod) {
        console.error("[HytaleService] Mod not found:", modId);
        return false;
      }
      const modPath = path.join(this.modsPath, mod.folderName);
      if (await fs.pathExists(modPath)) {
        const stat = await fs.stat(modPath);
        if (stat.isFile()) {
          // If it's a file (like a JAR), open the containing folder and select the file
          shell.showItemInFolder(modPath);
        } else {
          // If it's a directory, open it directly
          shell.openPath(modPath);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("[HytaleService] Error opening mod folder:", error);
      return false;
    }
  }

  /** Open a save folder in explorer */
  async openSaveFolder(saveId: string): Promise<boolean> {
    try {
      const savePath = path.join(this.savesPath(), saveId);
      if (await fs.pathExists(savePath)) {
        shell.openPath(savePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[HytaleService] Error opening save folder:", error);
      return false;
    }
  }

  /** Get stats about installed mods */
  async getStats(): Promise<{
    totalMods: number;
    enabledMods: number;
    disabledMods: number;
    totalSize: number;
    modpackCount: number;
  }> {
    await this.scanInstalledMods();
    const mods = this.getInstalledMods();

    return {
      totalMods: mods.length,
      enabledMods: mods.filter(m => !m.isDisabled).length,
      disabledMods: mods.filter(m => m.isDisabled).length,
      totalSize: mods.reduce((sum, m) => sum + (m.folderSize || 0), 0),
      modpackCount: this.modpacks.length,
    };
  }

  // ==================== SAVES/WORLDS MANAGEMENT ====================

  /** 
   * Hytale saves structure:
   * - UserData/Saves/{SaveName}/
   *   - config.json: Contains "Mods" section with { "ModId": { "Enabled": true/false } }
   *   - mods/: Per-save mod data folders (not the actual mods, just their state/data)
   *   - universe/: World data
   * 
   * IMPORTANT: The mods/ folder in a save contains mod STATE DATA (like barter_shop_state.json),
   * not the actual mod files. The actual mods are in UserData/Mods/ globally.
   * Enable/disable is controlled via config.json "Mods" section.
   */
  
  /** Get the saves folder path */
  private savesPath(): string {
    return path.join(path.dirname(this.modsPath), "Saves");
  }

  /** Get all Hytale saves (worlds) */
  async getWorlds(): Promise<{
    id: string;
    name: string;
    path: string;
    lastPlayed?: string;
    enabledMods: string[];
    disabledMods: string[];
    modDataFolders: string[];
    modsPath: string;
  }[]> {
    try {
      // Ensure mods are scanned first to enable proper hytaleModId -> ModEx ID mapping
      if (this.installedMods.size === 0) {
        await this.scanInstalledMods();
      }
      
      const savesBasePath = this.savesPath();
      
      if (!(await fs.pathExists(savesBasePath))) {
        console.log("[HytaleService] Saves folder does not exist:", savesBasePath);
        return [];
      }

      const entries = await fs.readdir(savesBasePath, { withFileTypes: true });
      const worlds: {
        id: string;
        name: string;
        path: string;
        lastPlayed?: string;
        enabledMods: string[];
        disabledMods: string[];
        modDataFolders: string[];
        modsPath: string;
      }[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        
        const savePath = path.join(savesBasePath, entry.name);
        const saveModsPath = path.join(savePath, "mods");
        const configPath = path.join(savePath, "config.json");
        
        // Try to get last modified time as last played
        let lastPlayed: string | undefined;
        try {
          const stat = await fs.stat(savePath);
          lastPlayed = stat.mtime.toISOString();
        } catch {}

        // Read mod configuration from config.json
        // Map hytaleModId from config.json to ModEx mod IDs
        let enabledMods: string[] = [];
        let disabledMods: string[] = [];
        try {
          if (await fs.pathExists(configPath)) {
            const config = await fs.readJson(configPath);
            if (config.Mods) {
              for (const [hytaleModId, modConfig] of Object.entries(config.Mods)) {
                const isEnabled = (modConfig as any).Enabled !== false;
                
                // Find the ModEx mod that has this hytaleModId
                let modexModId: string | undefined;
                for (const [id, mod] of this.installedMods.entries()) {
                  if (mod.hytaleModId === hytaleModId) {
                    modexModId = id;
                    break;
                  }
                }
                
                // Use ModEx ID if found, otherwise keep the hytaleModId
                const modIdToUse = modexModId || hytaleModId;
                
                if (isEnabled) {
                  enabledMods.push(modIdToUse);
                } else {
                  disabledMods.push(modIdToUse);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[HytaleService] Error reading config for ${entry.name}:`, err);
        }

        // Get mod data folders in save's mods directory
        let modDataFolders: string[] = [];
        try {
          if (await fs.pathExists(saveModsPath)) {
            const modFolders = await fs.readdir(saveModsPath, { withFileTypes: true });
            modDataFolders = modFolders
              .filter(f => f.isDirectory())
              .map(f => f.name);
          }
        } catch {}

        worlds.push({
          id: entry.name,
          name: entry.name,
          path: savePath,
          modsPath: saveModsPath,
          lastPlayed,
          enabledMods,
          disabledMods,
          modDataFolders,
        });
      }

      console.log(`[HytaleService] Found ${worlds.length} saves:`, worlds.map(w => w.name));
      return worlds;
    } catch (error) {
      console.error("[HytaleService] Error getting worlds:", error);
      return [];
    }
  }

  /** Get mods data folders in a specific save */
  async getSaveModsDetails(saveId: string): Promise<{ modName: string; modPath: string; hasData: boolean }[]> {
    try {
      const savePath = path.join(this.savesPath(), saveId);
      const modsPath = path.join(savePath, "mods");
      
      if (!(await fs.pathExists(modsPath))) {
        return [];
      }

      const entries = await fs.readdir(modsPath, { withFileTypes: true });
      const mods: { modName: string; modPath: string; hasData: boolean }[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const modPath = path.join(modsPath, entry.name);
        
        // Check if folder has any data files
        let hasData = false;
        try {
          const files = await fs.readdir(modPath);
          hasData = files.length > 0;
        } catch {}
        
        mods.push({
          modName: entry.name,
          modPath,
          hasData,
        });
      }

      return mods;
    } catch (error) {
      console.error("[HytaleService] Error getting save mods:", error);
      return [];
    }
  }

  /** 
   * Toggle a mod for a specific save by updating config.json
   * This enables/disables the mod in the save's configuration.
   * Uses hytaleModId (e.g., "JarHax:EyeSpy") for config.json, not the internal ModEx ID.
   */
  async toggleSaveMod(saveId: string, modId: string, enabled: boolean): Promise<boolean> {
    try {
      const savePath = path.join(this.savesPath(), saveId);
      const configPath = path.join(savePath, "config.json");

      if (!(await fs.pathExists(configPath))) {
        console.error(`[HytaleService] Config not found for save: ${saveId}`);
        return false;
      }

      // Find the mod to get the hytaleModId
      const mod = this.installedMods.get(modId);
      
      if (!mod) {
        // Try to find by hytaleModId match (modId could be passed as hytaleModId directly)
        let foundMod: HytaleMod | undefined;
        for (const [, installedMod] of this.installedMods.entries()) {
          if (installedMod.hytaleModId === modId) {
            foundMod = installedMod;
            break;
          }
        }
        
        if (!foundMod) {
          console.warn(`[HytaleService] Mod not found in cache: ${modId}. Using modId as config key.`);
        }
      }
      
      // Use hytaleModId if available, otherwise fall back to modId
      const configModId = mod?.hytaleModId || modId;
      
      if (!mod?.hytaleModId && mod) {
        console.warn(`[HytaleService] Mod ${modId} has no hytaleModId. Using modId as fallback. This may not work correctly in Hytale.`);
      }
      
      console.log(`[HytaleService] Toggling mod - modId: ${modId}, hytaleModId: ${configModId}`);

      // Read current config
      const config = await fs.readJson(configPath);
      
      // Initialize Mods section if not exists
      if (!config.Mods) {
        config.Mods = {};
      }

      // Update mod state using the correct Hytale mod ID
      if (enabled) {
        // Enable mod - set Enabled to true
        if (config.Mods[configModId]) {
          config.Mods[configModId].Enabled = true;
        } else {
          config.Mods[configModId] = { Enabled: true };
        }
      } else {
        // Disable mod
        if (config.Mods[configModId]) {
          config.Mods[configModId].Enabled = false;
        } else {
          config.Mods[configModId] = { Enabled: false };
        }
      }

      // Write config back
      await fs.writeJson(configPath, config, { spaces: 2 });
      console.log(`[HytaleService] ${enabled ? "Enabled" : "Disabled"} mod ${configModId} for save ${saveId}`);
      return true;
    } catch (error) {
      console.error("[HytaleService] Error toggling save mod:", error);
      return false;
    }
  }

  /** Get mod configuration for a specific world from config.json */
  async getWorldModConfig(worldId: string): Promise<{ modId: string; enabled: boolean }[]> {
    try {
      // Ensure mods are scanned first for proper ID mapping
      if (this.installedMods.size === 0) {
        await this.scanInstalledMods();
      }
      
      const savePath = path.join(this.savesPath(), worldId);
      const configPath = path.join(savePath, "config.json");
      
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        if (config.Mods) {
          return Object.entries(config.Mods).map(([hytaleModId, modConfig]) => {
            // Map hytaleModId to ModEx ID if available
            let modexId: string | undefined;
            for (const [id, mod] of this.installedMods.entries()) {
              if (mod.hytaleModId === hytaleModId) {
                modexId = id;
                break;
              }
            }
            return {
              modId: modexId || hytaleModId,
              enabled: (modConfig as any).Enabled !== false,
            };
          });
        }
      }
      
      return [];
    } catch (error) {
      console.error("[HytaleService] Error getting world mod config:", error);
      return [];
    }
  }

  /** 
   * Update mod configuration for a world in config.json
   * Accepts ModEx IDs and converts them to hytaleModId for storage
   */
  async saveWorldModConfig(worldId: string, modConfigs: { modId: string; enabled: boolean }[]): Promise<boolean> {
    try {
      const savePath = path.join(this.savesPath(), worldId);
      const configPath = path.join(savePath, "config.json");

      if (!(await fs.pathExists(configPath))) {
        console.error(`[HytaleService] Config not found for world: ${worldId}`);
        return false;
      }

      const config = await fs.readJson(configPath);
      
      // Initialize Mods section if not exists
      if (!config.Mods) {
        config.Mods = {};
      }

      // Update all mod configurations - convert ModEx ID to hytaleModId
      for (const { modId, enabled } of modConfigs) {
        // Find the mod to get hytaleModId
        const mod = this.installedMods.get(modId);
        const configModId = mod?.hytaleModId || modId;
        
        if (!config.Mods[configModId]) {
          config.Mods[configModId] = {};
        }
        config.Mods[configModId].Enabled = enabled;
      }

      await fs.writeJson(configPath, config, { spaces: 2 });
      console.log(`[HytaleService] Saved mod config for world ${worldId}: ${modConfigs.length} mods`);
      return true;
    } catch (error) {
      console.error("[HytaleService] Error saving world mod config:", error);
      return false;
    }
  }

  /** Apply world-specific mod configuration before launching */
  async applyWorldModConfig(worldId: string): Promise<HytaleSyncResult> {
    const result: HytaleSyncResult = {
      success: true,
      installed: 0,
      removed: 0,
      disabled: 0,
      enabled: 0,
      errors: [],
    };

    try {
      const modConfigs = await this.getWorldModConfig(worldId);
      const mods = this.getInstalledMods();

      for (const mod of mods) {
        // Check if mod has a config entry
        const modConfig = modConfigs.find(mc => mc.modId === mod.id);
        const shouldBeEnabled = !modConfig || modConfig.enabled; // Default to enabled
        
        if (shouldBeEnabled && mod.isDisabled) {
          await this.enableMod(mod.id);
          result.enabled++;
        } else if (!shouldBeEnabled && !mod.isDisabled) {
          await this.disableMod(mod.id);
          result.disabled++;
        }
      }

      console.log(`[HytaleService] Applied world ${worldId} config: ${result.enabled} enabled, ${result.disabled} disabled`);
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }
}

export default HytaleService;
