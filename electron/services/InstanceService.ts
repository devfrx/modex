/**
 * InstanceService - Isolated Minecraft Instance Management
 * 
 * Creates and manages isolated game directories for modpacks.
 * Each instance has its own mods/, config/, resourcepacks/, etc.
 * Supports launching with --gameDir for complete isolation.
 */

import { app, shell } from "electron";
import path from "path";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import os from "os";
import AdmZip from "adm-zip";

// ==================== TYPES ====================

export interface ModexInstance {
  /** Unique instance ID */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Instance description */
  description?: string;
  
  /** Minecraft version (e.g., "1.20.1") */
  minecraftVersion: string;
  
  /** Mod loader (forge, fabric, neoforge, quilt) */
  loader: string;
  
  /** Loader version (e.g., "47.2.0" for Forge) */
  loaderVersion?: string;
  
  /** Path to instance directory */
  path: string;
  
  /** Associated modpack ID (if created from modpack) */
  modpackId?: string;
  
  /** Instance icon (emoji or path) */
  icon?: string;
  
  /** Total mods count */
  modCount?: number;
  
  /** Instance creation date */
  createdAt: string;
  
  /** Last played date */
  lastPlayed?: string;
  
  /** Total play time in minutes */
  playTime?: number;
  
  /** Instance state */
  state: "ready" | "installing" | "error";
  
  /** Memory allocation in MB */
  memory?: {
    min: number;
    max: number;
  };
  
  /** Java arguments */
  javaArgs?: string;
  
  /** CurseForge source info */
  source?: {
    type: "curseforge" | "modrinth" | "local";
    projectId?: number;
    fileId?: number;
    name?: string;
    version?: string;
  };
}

export interface InstanceSyncResult {
  success: boolean;
  modsDownloaded: number;
  modsSkipped: number;
  configsCopied: number;
  configsSkipped: number;
  errors: string[];
  warnings: string[];
}

/** Config sync mode options */
export type ConfigSyncMode = "overwrite" | "new_only" | "skip";

export interface InstanceLaunchResult {
  success: boolean;
  error?: string;
  process?: ChildProcess;
}

interface LauncherConfig {
  vanillaPath?: string;
  javaPath?: string;
  defaultMemory: {
    min: number;
    max: number;
  };
}

// ==================== SERVICE ====================

export class InstanceService {
  private instances: ModexInstance[] = [];
  private instancesPath: string;
  private configPath: string;
  private launcherConfig: LauncherConfig;

  constructor(basePath: string) {
    // Store instances in userData/modex/instances
    this.instancesPath = path.join(basePath, "instances");
    this.configPath = path.join(basePath, "instances-config.json");
    this.launcherConfig = {
      defaultMemory: { min: 2048, max: 4096 }
    };
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.instancesPath);
    await this.loadConfig();
    await this.loadInstances();
  }

  // ==================== CONFIG ====================

  private async loadConfig(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const config = await fs.readJson(this.configPath);
        this.launcherConfig = { ...this.launcherConfig, ...config };
      }
    } catch (error) {
      console.error("[InstanceService] Error loading config:", error);
    }
  }

  async setLauncherConfig(config: Partial<LauncherConfig>): Promise<void> {
    this.launcherConfig = { ...this.launcherConfig, ...config };
    await fs.writeJson(this.configPath, this.launcherConfig, { spaces: 2 });
  }

  getLauncherConfig(): LauncherConfig {
    return { ...this.launcherConfig };
  }

  // ==================== INSTANCE MANAGEMENT ====================

  private async loadInstances(): Promise<void> {
    try {
      const dirs = await fs.readdir(this.instancesPath);
      this.instances = [];

      for (const dir of dirs) {
        const instancePath = path.join(this.instancesPath, dir);
        const metaPath = path.join(instancePath, "instance.json");
        
        if (await fs.pathExists(metaPath)) {
          try {
            const meta = await fs.readJson(metaPath);
            this.instances.push({
              ...meta,
              path: instancePath
            });
          } catch (error) {
            console.error(`[InstanceService] Error loading instance ${dir}:`, error);
          }
        }
      }

      // Sort by last played
      this.instances.sort((a, b) => {
        const dateA = a.lastPlayed || a.createdAt;
        const dateB = b.lastPlayed || b.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    } catch (error) {
      console.error("[InstanceService] Error loading instances:", error);
    }
  }

  async getInstances(): Promise<ModexInstance[]> {
    return [...this.instances];
  }

  async getInstance(id: string): Promise<ModexInstance | null> {
    return this.instances.find(i => i.id === id) || null;
  }

  async getInstanceByModpack(modpackId: string): Promise<ModexInstance | null> {
    return this.instances.find(i => i.modpackId === modpackId) || null;
  }

  /**
   * Create a new isolated instance
   */
  async createInstance(options: {
    name: string;
    minecraftVersion: string;
    loader: string;
    loaderVersion?: string;
    modpackId?: string;
    description?: string;
    icon?: string;
    memory?: { min: number; max: number };
    source?: ModexInstance["source"];
  }): Promise<ModexInstance> {
    // Generate unique ID
    const id = `${this.sanitizeName(options.name)}-${Date.now()}`;
    const instancePath = path.join(this.instancesPath, id);

    // Create directory structure
    await fs.ensureDir(instancePath);
    await fs.ensureDir(path.join(instancePath, "mods"));
    await fs.ensureDir(path.join(instancePath, "config"));
    await fs.ensureDir(path.join(instancePath, "resourcepacks"));
    await fs.ensureDir(path.join(instancePath, "shaderpacks"));
    await fs.ensureDir(path.join(instancePath, "saves"));
    await fs.ensureDir(path.join(instancePath, "logs"));
    await fs.ensureDir(path.join(instancePath, "screenshots"));

    const instance: ModexInstance = {
      id,
      name: options.name,
      description: options.description,
      minecraftVersion: options.minecraftVersion,
      loader: options.loader,
      loaderVersion: options.loaderVersion,
      path: instancePath,
      modpackId: options.modpackId,
      icon: options.icon || this.getLoaderIcon(options.loader),
      modCount: 0,
      createdAt: new Date().toISOString(),
      state: "ready",
      memory: options.memory || this.launcherConfig.defaultMemory,
      source: options.source
    };

    // Save instance metadata
    await this.saveInstanceMeta(instance);

    this.instances.unshift(instance);
    return instance;
  }

  /**
   * Delete an instance and all its files
   */
  async deleteInstance(id: string): Promise<boolean> {
    const instance = this.instances.find(i => i.id === id);
    if (!instance) return false;

    try {
      // Remove directory
      await fs.remove(instance.path);
      
      // Remove from list
      this.instances = this.instances.filter(i => i.id !== id);
      return true;
    } catch (error) {
      console.error(`[InstanceService] Error deleting instance ${id}:`, error);
      return false;
    }
  }

  /**
   * Update instance metadata
   */
  async updateInstance(id: string, updates: Partial<ModexInstance>): Promise<ModexInstance | null> {
    const instance = this.instances.find(i => i.id === id);
    if (!instance) return null;

    // Apply updates (except path and id)
    const { id: _, path: __, ...safeUpdates } = updates;
    Object.assign(instance, safeUpdates);

    await this.saveInstanceMeta(instance);
    return instance;
  }

  private async saveInstanceMeta(instance: ModexInstance): Promise<void> {
    const metaPath = path.join(instance.path, "instance.json");
    const { path: _, ...metaWithoutPath } = instance;
    await fs.writeJson(metaPath, metaWithoutPath, { spaces: 2 });
  }

  // ==================== SYNC / INSTALL ====================

  /**
   * Sync configs FROM instance TO modpack overrides folder
   * This ensures version control captures instance modifications
   */
  async syncConfigsToModpack(
    instanceId: string,
    overridesPath: string
  ): Promise<{ filesSynced: number; warnings: string[] }> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) {
      return { filesSynced: 0, warnings: ["Instance not found"] };
    }

    const result = { filesSynced: 0, warnings: [] as string[] };
    const foldersToSync = ["config", "kubejs", "defaultconfigs", "scripts"];

    try {
      await fs.ensureDir(overridesPath);

      for (const folder of foldersToSync) {
        const instanceFolder = path.join(instance.path, folder);
        const overridesFolder = path.join(overridesPath, folder);

        if (await fs.pathExists(instanceFolder)) {
          // Copy from instance to overrides (overwrite)
          await fs.copy(instanceFolder, overridesFolder, { overwrite: true });
          result.filesSynced += await this.countFiles(instanceFolder);
        }
      }
    } catch (error: any) {
      result.warnings.push(`Error syncing configs: ${error.message}`);
    }

    return result;
  }

  /**
   * Sync a modpack to an instance - downloads mods and extracts overrides
   * Also handles disabled mods (renames to .jar.disabled) and removed mods (deletes from instance)
   */
  async syncModpackToInstance(
    instanceId: string,
    modpackData: {
      mods: Array<{
        id: string;
        name: string;
        filename: string;
        downloadUrl?: string;
        cf_project_id?: number;
        cf_file_id?: number;
        content_type?: "mod" | "resourcepack" | "shader";
      }>;
      /** Mods that should be disabled (renamed to .jar.disabled) */
      disabledMods?: Array<{
        id: string;
        filename: string;
        content_type?: "mod" | "resourcepack" | "shader";
      }>;
      overridesZipPath?: string;  // Path to extracted overrides or zip
      manifestData?: any;          // CurseForge manifest.json content
    },
    options: {
      clearExisting?: boolean;
      configSyncMode?: ConfigSyncMode;  // How to handle existing configs
      onProgress?: (stage: string, current: number, total: number, item?: string) => void;
    } = {}
  ): Promise<InstanceSyncResult> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) {
      return {
        success: false,
        modsDownloaded: 0,
        modsSkipped: 0,
        configsCopied: 0,
        errors: ["Instance not found"],
        warnings: []
      };
    }

    const result: InstanceSyncResult = {
      success: true,
      modsDownloaded: 0,
      modsSkipped: 0,
      configsCopied: 0,
      configsSkipped: 0,
      errors: [],
      warnings: []
    };

    try {
      // Update state
      instance.state = "installing";
      await this.saveInstanceMeta(instance);

      // Prepare destination folders
      const modsPath = path.join(instance.path, "mods");
      const resourcepacksPath = path.join(instance.path, "resourcepacks");
      const shaderpacksPath = path.join(instance.path, "shaderpacks");
      
      await fs.ensureDir(modsPath);
      await fs.ensureDir(resourcepacksPath);
      await fs.ensureDir(shaderpacksPath);

      // Clear existing mods if requested
      if (options.clearExisting) {
        options.onProgress?.("Clearing existing content...", 0, 1);
        
        // Clear mods
        const existingMods = await fs.readdir(modsPath);
        for (const file of existingMods) {
          if (file.endsWith(".jar") || file.endsWith(".jar.disabled")) {
            await fs.remove(path.join(modsPath, file));
          }
        }
        
        // Clear resourcepacks (but not user-added ones - only .zip)
        const existingResourcepacks = await fs.readdir(resourcepacksPath);
        for (const file of existingResourcepacks) {
          if (file.endsWith(".zip")) {
            await fs.remove(path.join(resourcepacksPath, file));
          }
        }
        
        // Clear shaderpacks
        const existingShaderpacks = await fs.readdir(shaderpacksPath);
        for (const file of existingShaderpacks) {
          if (file.endsWith(".zip")) {
            await fs.remove(path.join(shaderpacksPath, file));
          }
        }
      }

      // ==================== HANDLE DISABLED MODS ====================
      // Rename .jar → .jar.disabled for disabled mods, and vice versa for enabled mods
      if (modpackData.disabledMods && modpackData.disabledMods.length > 0) {
        options.onProgress?.("Managing disabled mods...", 0, modpackData.disabledMods.length);
        
        for (const disabledMod of modpackData.disabledMods) {
          let targetFolder: string;
          switch (disabledMod.content_type) {
            case "resourcepack":
              targetFolder = resourcepacksPath;
              break;
            case "shader":
              targetFolder = shaderpacksPath;
              break;
            default:
              targetFolder = modsPath;
          }

          const enabledPath = path.join(targetFolder, disabledMod.filename);
          const disabledPath = path.join(targetFolder, disabledMod.filename + ".disabled");

          // If enabled file exists, rename to disabled
          if (await fs.pathExists(enabledPath)) {
            await fs.rename(enabledPath, disabledPath);
            console.log(`[Sync] Disabled mod: ${disabledMod.filename}`);
          }
        }
      }

      // Re-enable mods that are no longer in the disabled list
      // (check if there's a .disabled version that should be enabled)
      const allModFilenames = new Set(modpackData.mods.map(m => m.filename));
      const disabledFilenames = new Set((modpackData.disabledMods || []).map(m => m.filename));

      const existingModFiles = await fs.readdir(modsPath);
      for (const file of existingModFiles) {
        if (file.endsWith(".jar.disabled")) {
          const originalFilename = file.replace(".disabled", "");
          // If this mod is in the enabled list (not in disabled list)
          if (allModFilenames.has(originalFilename) && !disabledFilenames.has(originalFilename)) {
            const disabledPath = path.join(modsPath, file);
            const enabledPath = path.join(modsPath, originalFilename);
            await fs.rename(disabledPath, enabledPath);
            console.log(`[Sync] Re-enabled mod: ${originalFilename}`);
          }
        }
      }

      // ==================== HANDLE REMOVED MODS ====================
      // Remove mods from instance that are no longer in the modpack
      if (!options.clearExisting) {
        options.onProgress?.("Removing outdated mods...", 0, 1);
        
        const currentModFilenames = new Set([
          ...modpackData.mods.map(m => m.filename),
          ...(modpackData.disabledMods || []).map(m => m.filename)
        ]);

        // Check mods folder
        for (const file of existingModFiles) {
          const baseFilename = file.replace(".disabled", "");
          if ((file.endsWith(".jar") || file.endsWith(".jar.disabled")) && !currentModFilenames.has(baseFilename)) {
            await fs.remove(path.join(modsPath, file));
            console.log(`[Sync] Removed mod no longer in pack: ${file}`);
            result.warnings.push(`Removed outdated mod: ${baseFilename}`);
          }
        }

        // Check resourcepacks folder
        const existingRPs = await fs.readdir(resourcepacksPath);
        const rpFilenames = new Set(
          modpackData.mods.filter(m => m.content_type === "resourcepack").map(m => m.filename)
        );
        // Also include resourcepacks from overrides (not tracked as mods)
        if (modpackData.overridesZipPath) {
          const overridesRPPath = path.join(modpackData.overridesZipPath, "resourcepacks");
          if (await fs.pathExists(overridesRPPath)) {
            const overrideRPs = await fs.readdir(overridesRPPath);
            for (const file of overrideRPs) {
              if (file.endsWith(".zip")) {
                rpFilenames.add(file);
              }
            }
          }
        }
        for (const file of existingRPs) {
          if (file.endsWith(".zip") && !rpFilenames.has(file)) {
            // This is a user-added resourcepack, keep it
            console.log(`[Sync] User resourcepack (kept): ${file}`);
          }
        }

        // Check shaderpacks folder
        const existingShaders = await fs.readdir(shaderpacksPath);
        const shaderFilenames = new Set(
          modpackData.mods.filter(m => m.content_type === "shader").map(m => m.filename)
        );
        // Also include shaders from overrides (not tracked as mods)
        if (modpackData.overridesZipPath) {
          const overridesShaderPath = path.join(modpackData.overridesZipPath, "shaderpacks");
          if (await fs.pathExists(overridesShaderPath)) {
            const overrideShaders = await fs.readdir(overridesShaderPath);
            for (const file of overrideShaders) {
              if (file.endsWith(".zip")) {
                shaderFilenames.add(file);
              }
            }
          }
        }
        for (const file of existingShaders) {
          if (file.endsWith(".zip") && !shaderFilenames.has(file)) {
            // This is a user-added shader, keep it
            console.log(`[Sync] User shader (kept): ${file}`);
          }
        }
      }

      // Download mods/resources to appropriate folders - PARALLELIZED
      const totalMods = modpackData.mods.length;
      const PARALLEL_DOWNLOADS = 20; // Number of concurrent downloads
      let completed = 0;
      
      // Prepare download tasks
      const downloadTasks = modpackData.mods.map(mod => async () => {
        try {
          // Determine destination folder based on content_type
          let destFolder: string;
          switch (mod.content_type) {
            case "resourcepack":
              destFolder = resourcepacksPath;
              break;
            case "shader":
              destFolder = shaderpacksPath;
              break;
            default:
              destFolder = modsPath;
          }
          
          const destPath = path.join(destFolder, mod.filename);

          // Skip if already exists
          if (await fs.pathExists(destPath)) {
            completed++;
            options.onProgress?.("Downloading content", completed, totalMods, mod.name);
            return { status: "skipped" as const, mod };
          }

          // Build download URL
          let downloadUrl = mod.downloadUrl;
          if (!downloadUrl && mod.cf_project_id && mod.cf_file_id) {
            // CurseForge CDN URL
            const fileIdStr = mod.cf_file_id.toString();
            const part1 = fileIdStr.substring(0, 4);
            const part2 = fileIdStr.substring(4);
            downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(mod.filename)}`;
          }

          if (!downloadUrl) {
            completed++;
            options.onProgress?.("Downloading content", completed, totalMods, mod.name);
            return { status: "no_url" as const, mod };
          }

          // Download
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          await fs.writeFile(destPath, buffer);
          
          completed++;
          options.onProgress?.("Downloading content", completed, totalMods, mod.name);
          return { status: "downloaded" as const, mod };
        } catch (error: any) {
          completed++;
          options.onProgress?.("Downloading content", completed, totalMods, mod.name);
          return { status: "error" as const, mod, error: error.message };
        }
      });

      // Execute downloads in parallel batches
      const downloadResults: Array<{ status: string; mod: any; error?: string }> = [];
      for (let i = 0; i < downloadTasks.length; i += PARALLEL_DOWNLOADS) {
        const batch = downloadTasks.slice(i, i + PARALLEL_DOWNLOADS);
        const batchResults = await Promise.all(batch.map(task => task()));
        downloadResults.push(...batchResults);
      }

      // Process results
      for (const downloadResult of downloadResults) {
        switch (downloadResult.status) {
          case "downloaded":
            result.modsDownloaded++;
            break;
          case "skipped":
            result.modsSkipped++;
            break;
          case "no_url":
            result.warnings.push(`No download URL for ${downloadResult.mod.name}`);
            result.modsSkipped++;
            break;
          case "error":
            result.warnings.push(`Failed to download ${downloadResult.mod.name}: ${downloadResult.error}`);
            result.modsSkipped++;
            break;
        }
      }

      // Extract overrides (config files, scripts, etc.)
      // Respect configSyncMode: "overwrite" | "new_only" | "skip"
      const configMode = options.configSyncMode || "overwrite";
      
      if (modpackData.overridesZipPath && configMode !== "skip") {
        options.onProgress?.("Extracting configurations...", 0, 1);
        const overridesResult = await this.extractOverrides(
          instance.path,
          modpackData.overridesZipPath,
          configMode,
          options.onProgress
        );
        result.configsCopied = overridesResult.filesCopied;
        result.configsSkipped = overridesResult.filesSkipped;
        result.warnings.push(...overridesResult.warnings);
      } else if (configMode === "skip" && modpackData.overridesZipPath) {
        result.warnings.push("Config sync skipped by user preference");
      }

      // Update instance metadata
      instance.modCount = result.modsDownloaded + result.modsSkipped;
      instance.state = "ready";
      await this.saveInstanceMeta(instance);

      return result;
    } catch (error: any) {
      instance.state = "error";
      await this.saveInstanceMeta(instance);
      
      return {
        ...result,
        success: false,
        errors: [...result.errors, error.message]
      };
    }
  }

  /**
   * Extract overrides from modpack zip to instance
   * Handles: config/, kubejs/, resourcepacks/, shaderpacks/, defaultconfigs/, etc.
   * @param configMode "overwrite" - replace all, "new_only" - only copy missing files
   */
  private async extractOverrides(
    instancePath: string,
    overridesSource: string,
    configMode: ConfigSyncMode,
    onProgress?: (stage: string, current: number, total: number, item?: string) => void
  ): Promise<{ filesCopied: number; filesSkipped: number; warnings: string[] }> {
    const result = { filesCopied: 0, filesSkipped: 0, warnings: [] as string[] };

    console.log(`[InstanceService] extractOverrides called:`);
    console.log(`  - instancePath: ${instancePath}`);
    console.log(`  - overridesSource: ${overridesSource}`);
    console.log(`  - configMode: ${configMode}`);

    try {
      // Check if source exists
      if (!await fs.pathExists(overridesSource)) {
        console.log(`[InstanceService] overridesSource does not exist!`);
        result.warnings.push(`Overrides source not found: ${overridesSource}`);
        return result;
      }

      // Check if it's a zip file or directory
      const stat = await fs.stat(overridesSource);
      
      if (stat.isDirectory()) {
        // Direct directory copy
        const copyResult = await this.copyOverridesDir(overridesSource, instancePath, configMode);
        result.filesCopied = copyResult.copied;
        result.filesSkipped = copyResult.skipped;
      } else if (overridesSource.endsWith(".zip")) {
        // Extract from zip
        const zip = new AdmZip(overridesSource);
        const entries = zip.getEntries();
        
        // Find overrides folder in zip
        const overridesPrefix = entries.find(e => 
          e.entryName.startsWith("overrides/") || 
          e.entryName.includes("/overrides/")
        )?.entryName.split("overrides/")[0] + "overrides/";

        if (!overridesPrefix || overridesPrefix === "undefined/overrides/") {
          // No overrides folder, try to find config directly
          const configPrefix = entries.find(e =>
            e.entryName.includes("/config/") || e.entryName.startsWith("config/")
          )?.entryName.split("config/")[0] || "";
          
          if (configPrefix || entries.some(e => e.entryName.startsWith("config/"))) {
            // Extract relevant folders
            const foldersToExtract = ["config", "kubejs", "resourcepacks", "shaderpacks", "defaultconfigs", "scripts"];
            
            for (const entry of entries) {
              for (const folder of foldersToExtract) {
                const folderPath = configPrefix + folder + "/";
                if (entry.entryName.startsWith(folderPath) && !entry.isDirectory) {
                  const relativePath = entry.entryName.substring(configPrefix.length);
                  const destPath = path.join(instancePath, relativePath);
                  
                  // Check if file exists for new_only mode
                  if (configMode === "new_only" && await fs.pathExists(destPath)) {
                    result.filesSkipped++;
                    continue;
                  }
                  
                  await fs.ensureDir(path.dirname(destPath));
                  await fs.writeFile(destPath, entry.getData());
                  result.filesCopied++;
                }
              }
            }
          }
        } else {
          // Extract overrides folder content
          for (const entry of entries) {
            if (entry.entryName.startsWith(overridesPrefix) && !entry.isDirectory) {
              const relativePath = entry.entryName.substring(overridesPrefix.length);
              if (relativePath) {
                const destPath = path.join(instancePath, relativePath);
                
                // Check if file exists for new_only mode
                if (configMode === "new_only" && await fs.pathExists(destPath)) {
                  result.filesSkipped++;
                  continue;
                }
                
                onProgress?.("Extracting", result.filesCopied, entries.length, relativePath);
                
                await fs.ensureDir(path.dirname(destPath));
                await fs.writeFile(destPath, entry.getData());
                result.filesCopied++;
              }
            }
          }
        }
      }
    } catch (error: any) {
      result.warnings.push(`Error extracting overrides: ${error.message}`);
    }

    return result;
  }

  private async copyOverridesDir(sourceDir: string, destDir: string, configMode: ConfigSyncMode): Promise<{ copied: number; skipped: number }> {
    let copied = 0;
    let skipped = 0;
    
    console.log(`[InstanceService] copyOverridesDir: ${sourceDir} -> ${destDir}`);
    
    const foldersToSync = ["config", "kubejs", "resourcepacks", "shaderpacks", "defaultconfigs", "scripts", "global_packs"];
    
    for (const folder of foldersToSync) {
      const sourcePath = path.join(sourceDir, folder);
      const destPath = path.join(destDir, folder);
      
      const exists = await fs.pathExists(sourcePath);
      console.log(`[InstanceService]   ${folder}: ${exists ? 'EXISTS' : 'not found'} at ${sourcePath}`);
      
      if (exists) {
        if (configMode === "new_only") {
          // Copy file by file, skip existing
          const result = await this.copyDirNewOnly(sourcePath, destPath);
          copied += result.copied;
          skipped += result.skipped;
        } else {
          // Overwrite mode
          await fs.copy(sourcePath, destPath, { overwrite: true });
          copied += await this.countFiles(sourcePath);
        }
      }
    }
    
    return { copied, skipped };
  }

  /**
   * Copy directory recursively, only copying files that don't exist
   */
  private async copyDirNewOnly(sourceDir: string, destDir: string): Promise<{ copied: number; skipped: number }> {
    let copied = 0;
    let skipped = 0;
    
    await fs.ensureDir(destDir);
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(sourceDir, entry.name);
      const dstPath = path.join(destDir, entry.name);
      
      if (entry.isDirectory()) {
        const subResult = await this.copyDirNewOnly(srcPath, dstPath);
        copied += subResult.copied;
        skipped += subResult.skipped;
      } else {
        if (await fs.pathExists(dstPath)) {
          skipped++;
        } else {
          await fs.copy(srcPath, dstPath);
          copied++;
        }
      }
    }
    
    return { copied, skipped };
  }

  private async countFiles(dir: string): Promise<number> {
    let count = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await this.countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
    
    return count;
  }

  // ==================== LAUNCH ====================

  /**
   * Launch Minecraft with this instance's game directory
   */
  async launchInstance(instanceId: string): Promise<InstanceLaunchResult> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) {
      return { success: false, error: "Instance not found" };
    }

    const platform = process.platform;
    
    try {
      // Find vanilla launcher
      let launcherPath: string | null = this.launcherConfig.vanillaPath || null;
      
      if (!launcherPath || !await fs.pathExists(launcherPath)) {
        // Auto-detect launcher
        launcherPath = await this.findVanillaLauncher();
      }

      if (!launcherPath) {
        // Fallback: open instance folder
        await shell.openPath(instance.path);
        return {
          success: false,
          error: "Minecraft Launcher not found. Please configure the launcher path in settings. Opened instance folder instead."
        };
      }

      // Build launch arguments
      // The vanilla launcher supports --workDir to specify the game directory
      const args: string[] = [];
      
      // Use --workDir for the vanilla launcher to point to our instance
      args.push("--workDir", instance.path);

      console.log(`[InstanceService] Launching: ${launcherPath} ${args.join(" ")}`);
      console.log(`[InstanceService] Instance path: ${instance.path}`);

      // Update last played
      instance.lastPlayed = new Date().toISOString();
      await this.saveInstanceMeta(instance);

      // Launch
      if (platform === "darwin" && launcherPath.endsWith(".app")) {
        spawn("open", [launcherPath, "--args", ...args], { 
          detached: true, 
          stdio: "ignore" 
        }).unref();
      } else {
        spawn(launcherPath, args, { 
          detached: true, 
          stdio: "ignore",
          cwd: path.dirname(launcherPath)
        }).unref();
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async findVanillaLauncher(): Promise<string | null> {
    const platform = process.platform;
    const possiblePaths: string[] = [];

    if (platform === "win32") {
      possiblePaths.push(
        // Xbox Game Pass location
        "C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
        // Microsoft Store
        path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "Minecraft.exe"),
        // New launcher
        path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Minecraft Launcher", "MinecraftLauncher.exe"),
        // Old launcher location
        path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Minecraft Launcher", "MinecraftLauncher.exe"),
        // User install
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Minecraft Launcher", "MinecraftLauncher.exe"),
        // Other drives
        "D:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
        "E:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
      );
    } else if (platform === "darwin") {
      possiblePaths.push(
        "/Applications/Minecraft.app",
        path.join(os.homedir(), "Applications", "Minecraft.app")
      );
    } else {
      possiblePaths.push(
        "/usr/bin/minecraft-launcher",
        path.join(os.homedir(), ".minecraft", "launcher", "minecraft-launcher")
      );
    }

    for (const p of possiblePaths) {
      if (await fs.pathExists(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Open instance folder in file explorer
   */
  async openInstanceFolder(instanceId: string, subfolder?: string): Promise<boolean> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) return false;

    try {
      const targetPath = subfolder 
        ? path.join(instance.path, subfolder)
        : instance.path;
      
      await fs.ensureDir(targetPath);
      await shell.openPath(targetPath);
      return true;
    } catch (error) {
      console.error("[InstanceService] Error opening folder:", error);
      return false;
    }
  }

  // ==================== UTILITIES ====================

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  }

  private getLoaderIcon(loader: string): string {
    const icons: Record<string, string> = {
      forge: "🔶",
      fabric: "🧵",
      quilt: "🪡",
      neoforge: "⚡",
      vanilla: "🎮"
    };
    return icons[loader.toLowerCase()] || "📦";
  }

  /**
   * Get instance statistics
   */
  async getInstanceStats(instanceId: string): Promise<{
    modCount: number;
    configCount: number;
    totalSize: string;
    folders: Array<{ name: string; count: number }>;
  } | null> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) return null;

    const stats = {
      modCount: 0,
      configCount: 0,
      totalSize: "0 MB",
      folders: [] as Array<{ name: string; count: number }>
    };

    try {
      // Count mods
      const modsPath = path.join(instance.path, "mods");
      if (await fs.pathExists(modsPath)) {
        const modFiles = (await fs.readdir(modsPath)).filter(f => f.endsWith(".jar"));
        stats.modCount = modFiles.length;
        stats.folders.push({ name: "mods", count: modFiles.length });
      }

      // Count configs
      const configPath = path.join(instance.path, "config");
      if (await fs.pathExists(configPath)) {
        stats.configCount = await this.countFiles(configPath);
        stats.folders.push({ name: "config", count: stats.configCount });
      }

      // Other folders
      const otherFolders = ["resourcepacks", "shaderpacks", "saves", "screenshots"];
      for (const folder of otherFolders) {
        const folderPath = path.join(instance.path, folder);
        if (await fs.pathExists(folderPath)) {
          const count = (await fs.readdir(folderPath)).length;
          if (count > 0) {
            stats.folders.push({ name: folder, count });
          }
        }
      }

      // Calculate total size
      const totalBytes = await this.getDirSize(instance.path);
      stats.totalSize = this.formatBytes(totalBytes);

    } catch (error) {
      console.error("[InstanceService] Error getting stats:", error);
    }

    return stats;
  }

  /**
   * Check sync status between instance and modpack
   * Returns differences that need syncing
   */
  async checkSyncStatus(
    instanceId: string,
    modpackMods: Array<{
      id: string;
      filename: string;
      content_type?: string;
    }>,
    disabledModIds: string[],
    overridesPath?: string
  ): Promise<{
    needsSync: boolean;
    missingInInstance: Array<{ filename: string; type: string }>;
    extraInInstance: Array<{ filename: string; type: string }>;
    disabledMismatch: Array<{ filename: string; issue: string }>;
    configDifferences: number;
    totalDifferences: number;
  }> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) {
      return {
        needsSync: false,
        missingInInstance: [],
        extraInInstance: [],
        disabledMismatch: [],
        configDifferences: 0,
        totalDifferences: 0
      };
    }

    const result = {
      needsSync: false,
      missingInInstance: [] as Array<{ filename: string; type: string }>,
      extraInInstance: [] as Array<{ filename: string; type: string }>,
      disabledMismatch: [] as Array<{ filename: string; issue: string }>,
      configDifferences: 0,
      totalDifferences: 0
    };

    try {
      const modsPath = path.join(instance.path, "mods");
      const disabledSet = new Set(disabledModIds);
      
      // Get all jar files in instance (both enabled and disabled)
      const instanceFiles: Map<string, boolean> = new Map(); // filename -> isEnabled
      
      if (await fs.pathExists(modsPath)) {
        const files = await fs.readdir(modsPath);
        for (const file of files) {
          if (file.endsWith(".jar")) {
            instanceFiles.set(file, true);
          } else if (file.endsWith(".jar.disabled")) {
            const enabledName = file.replace(".jar.disabled", ".jar");
            instanceFiles.set(enabledName, false);
          }
        }
      }

      // Check mods that should be in instance
      const expectedFilenames = new Set<string>();
      for (const mod of modpackMods) {
        if (!mod.filename || mod.content_type !== "mod") continue;
        
        const filename = mod.filename;
        expectedFilenames.add(filename);
        const shouldBeDisabled = disabledSet.has(mod.id);
        
        if (!instanceFiles.has(filename)) {
          // Mod is missing entirely
          result.missingInInstance.push({ filename, type: "mod" });
        } else {
          const isEnabled = instanceFiles.get(filename)!;
          if (shouldBeDisabled && isEnabled) {
            result.disabledMismatch.push({ filename, issue: "should be disabled" });
          } else if (!shouldBeDisabled && !isEnabled) {
            result.disabledMismatch.push({ filename, issue: "should be enabled" });
          }
        }
      }

      // Check for extra mods in instance
      for (const [filename] of instanceFiles) {
        if (!expectedFilenames.has(filename)) {
          result.extraInInstance.push({ filename, type: "mod" });
        }
      }

      // Check resourcepacks and shaderpacks
      for (const contentType of ["resourcepack", "shader"] as const) {
        const folderName = contentType === "resourcepack" ? "resourcepacks" : "shaderpacks";
        const folderPath = path.join(instance.path, folderName);
        
        // Get packs from mods database
        const packMods = modpackMods.filter(m => m.content_type === contentType);
        const expectedPacks = new Set(packMods.map(m => m.filename).filter(Boolean));
        
        // Also include packs from overrides folder (these are not tracked as mods)
        if (overridesPath) {
          const overridesFolderPath = path.join(overridesPath, folderName);
          if (await fs.pathExists(overridesFolderPath)) {
            const overrideFiles = await fs.readdir(overridesFolderPath);
            for (const file of overrideFiles) {
              if (file.endsWith(".zip")) {
                expectedPacks.add(file);
              }
            }
          }
        }
        
        if (await fs.pathExists(folderPath)) {
          const files = await fs.readdir(folderPath);
          const zipFiles = files.filter(f => f.endsWith(".zip"));
          
          // Check missing from mods database only (overrides are copied during sync)
          for (const mod of packMods) {
            if (mod.filename && !zipFiles.includes(mod.filename)) {
              result.missingInInstance.push({ filename: mod.filename, type: contentType });
            }
          }
          
          // Check extra (files not in mods OR overrides)
          for (const file of zipFiles) {
            if (!expectedPacks.has(file)) {
              result.extraInInstance.push({ filename: file, type: contentType });
            }
          }
        } else if (packMods.length > 0) {
          // Folder doesn't exist but we have packs
          for (const mod of packMods) {
            if (mod.filename) {
              result.missingInInstance.push({ filename: mod.filename, type: contentType });
            }
          }
        }
      }

      // Check config differences if overrides path provided
      if (overridesPath && await fs.pathExists(overridesPath)) {
        const configOverridesPath = path.join(overridesPath, "config");
        const instanceConfigPath = path.join(instance.path, "config");
        
        if (await fs.pathExists(configOverridesPath) && await fs.pathExists(instanceConfigPath)) {
          result.configDifferences = await this.countConfigDifferences(configOverridesPath, instanceConfigPath);
        }
      }

      result.totalDifferences = 
        result.missingInInstance.length + 
        result.extraInInstance.length + 
        result.disabledMismatch.length +
        result.configDifferences;
      
      result.needsSync = result.totalDifferences > 0;

    } catch (error) {
      console.error("[InstanceService] Error checking sync status:", error);
    }

    return result;
  }

  /**
   * Count config file differences between overrides and instance
   */
  private async countConfigDifferences(overridesConfigPath: string, instanceConfigPath: string): Promise<number> {
    let differences = 0;
    
    try {
      const overrideFiles = await this.getAllFiles(overridesConfigPath, overridesConfigPath);
      
      for (const relPath of overrideFiles) {
        const overridePath = path.join(overridesConfigPath, relPath);
        const instancePath = path.join(instanceConfigPath, relPath);
        
        if (!await fs.pathExists(instancePath)) {
          // Config file missing in instance
          differences++;
        } else {
          // Check if content differs
          const overrideContent = await fs.readFile(overridePath);
          const instanceContent = await fs.readFile(instancePath);
          
          if (!overrideContent.equals(instanceContent)) {
            differences++;
          }
        }
      }
    } catch (error) {
      console.error("[InstanceService] Error counting config differences:", error);
    }
    
    return differences;
  }

  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dir: string, baseDir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath, baseDir);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Ignore errors
    }
    
    return files;
  }

  private async getDirSize(dir: string): Promise<number> {
    let size = 0;
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          size += await this.getDirSize(entryPath);
        } else {
          const stat = await fs.stat(entryPath);
          size += stat.size;
        }
      }
    } catch {
      // Ignore errors
    }
    
    return size;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Export instance as zip
   */
  async exportInstance(instanceId: string, destPath: string): Promise<boolean> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) return false;

    try {
      const zip = new AdmZip();
      
      // Add mods
      const modsPath = path.join(instance.path, "mods");
      if (await fs.pathExists(modsPath)) {
        zip.addLocalFolder(modsPath, "mods");
      }

      // Add config
      const configPath = path.join(instance.path, "config");
      if (await fs.pathExists(configPath)) {
        zip.addLocalFolder(configPath, "config");
      }

      // Add other folders
      const folders = ["resourcepacks", "shaderpacks", "kubejs", "scripts", "defaultconfigs"];
      for (const folder of folders) {
        const folderPath = path.join(instance.path, folder);
        if (await fs.pathExists(folderPath)) {
          zip.addLocalFolder(folderPath, folder);
        }
      }

      // Add instance metadata
      zip.addFile("instance.json", Buffer.from(JSON.stringify({
        name: instance.name,
        minecraftVersion: instance.minecraftVersion,
        loader: instance.loader,
        loaderVersion: instance.loaderVersion,
        modCount: instance.modCount
      }, null, 2)));

      zip.writeZip(destPath);
      return true;
    } catch (error) {
      console.error("[InstanceService] Error exporting:", error);
      return false;
    }
  }

  /**
   * Duplicate an instance
   */
  async duplicateInstance(instanceId: string, newName: string): Promise<ModexInstance | null> {
    const instance = this.instances.find(i => i.id === instanceId);
    if (!instance) return null;

    try {
      // Create new instance
      const newInstance = await this.createInstance({
        name: newName,
        minecraftVersion: instance.minecraftVersion,
        loader: instance.loader,
        loaderVersion: instance.loaderVersion,
        description: instance.description,
        memory: instance.memory
      });

      // Copy all contents
      await fs.copy(instance.path, newInstance.path, {
        overwrite: true,
        filter: (src) => !src.endsWith("instance.json") // Don't copy old metadata
      });

      // Update mod count
      const modsPath = path.join(newInstance.path, "mods");
      if (await fs.pathExists(modsPath)) {
        const modFiles = (await fs.readdir(modsPath)).filter(f => f.endsWith(".jar"));
        newInstance.modCount = modFiles.length;
      }

      await this.saveInstanceMeta(newInstance);
      return newInstance;
    } catch (error) {
      console.error("[InstanceService] Error duplicating:", error);
      return null;
    }
  }
}

export default InstanceService;
