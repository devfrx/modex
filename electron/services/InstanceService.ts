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
  
  /** Last time the instance was synced with modpack */
  lastSynced?: string;
  
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

/** Running game info */
export interface RunningGameInfo {
  instanceId: string;
  launcherPid?: number;
  gamePid?: number;
  startTime: number;
  /** 
   * Status meanings:
   * - launching: Launcher started, waiting for game process
   * - loading_mods: Game process found, mods loading
   * - running: Game fully loaded and running
   * - stopped: Game has stopped
   */
  status: "launching" | "loading_mods" | "running" | "stopped";
  loadedMods: number;
  totalMods: number;
  currentMod?: string;
  logWatcher?: fs.FSWatcher;
  /** Whether the actual game (Java) is running vs just the launcher */
  gameProcessRunning: boolean;
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
  
  /** Track running games by instance ID */
  private runningGames: Map<string, RunningGameInfo> = new Map();
  
  /** Callback for game status updates */
  private onGameStatusChange?: (instanceId: string, info: RunningGameInfo) => void;
  
  /** Callback for game log lines (for real-time log console) */
  private onGameLogLine?: (instanceId: string, logLine: { time: string; level: string; message: string; raw: string; source?: string }) => void;

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
    
    // Scan for already running games on startup
    await this.scanRunningGames();
  }

  /**
   * Scan for Java processes that match our instances (for app restart detection)
   */
  async scanRunningGames(): Promise<void> {
    if (process.platform !== "win32") return;
    
    try {
      const { execSync } = await import("child_process");
      const result = execSync(
        `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name like '%java%'\\" | Select-Object ProcessId, CommandLine, CreationDate | ConvertTo-Json"`,
        { encoding: "utf-8", timeout: 15000 }
      );
      
      let processes: any[] = [];
      try {
        const parsed = JSON.parse(result);
        processes = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return;
      }
      
      for (const proc of processes) {
        if (!proc || !proc.CommandLine) continue;
        
        const cmdLine = proc.CommandLine as string;
        
        // Find which instance this belongs to
        for (const instance of this.instances) {
          if (cmdLine.includes(instance.path) || cmdLine.includes(instance.path.replace(/\\/g, "/"))) {
            // Found a running game for this instance
            console.log(`[InstanceService] Found running game for instance ${instance.id} (PID: ${proc.ProcessId})`);
            
            const gameInfo: RunningGameInfo = {
              instanceId: instance.id,
              gamePid: proc.ProcessId,
              startTime: proc.CreationDate ? new Date(proc.CreationDate).getTime() : Date.now(),
              status: "running",
              loadedMods: instance.modCount || 0,
              totalMods: instance.modCount || 0,
              gameProcessRunning: true
            };
            
            this.runningGames.set(instance.id, gameInfo);
            this.onGameStatusChange?.(instance.id, gameInfo);
            
            // Start monitoring this process
            this.monitorGameProcess(instance);
            this.watchGameLogs(instance);
            
            break;
          }
        }
      }
      
      if (this.runningGames.size > 0) {
        console.log(`[InstanceService] Detected ${this.runningGames.size} running game(s) from previous session`);
      }
    } catch (error) {
      console.warn("[InstanceService] Failed to scan for running games:", error);
    }
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
      // Stop the game if running
      if (this.runningGames.has(id)) {
        await this.killGame(id);
      }
      
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
        configsSkipped: 0,
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
        
        // Clear mods (includes .jar and .zip mods/datapacks)
        const existingMods = await fs.readdir(modsPath);
        for (const file of existingMods) {
          if (file.endsWith(".jar") || file.endsWith(".jar.disabled") ||
              file.endsWith(".zip") || file.endsWith(".zip.disabled")) {
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
        // Handle both .jar.disabled and .zip.disabled (for datapacks/compat packs)
        if (file.endsWith(".jar.disabled") || file.endsWith(".zip.disabled")) {
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

        // Check mods folder (includes .jar and .zip mods/datapacks)
        for (const file of existingModFiles) {
          const baseFilename = file.replace(".disabled", "");
          const isModFile = file.endsWith(".jar") || file.endsWith(".jar.disabled") || 
                           file.endsWith(".zip") || file.endsWith(".zip.disabled");
          if (isModFile && !currentModFilenames.has(baseFilename)) {
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
          const disabledDestPath = path.join(destFolder, mod.filename + ".disabled");

          // Skip if already exists (either enabled or disabled version)
          if (await fs.pathExists(destPath) || await fs.pathExists(disabledDestPath)) {
            console.log(`[Sync] Skipping ${mod.name} - already exists`);
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
            console.log(`[Sync] Built CF URL for ${mod.name}: ${downloadUrl}`);
          } else {
            console.log(`[Sync] No CF IDs for ${mod.name}: cf_project_id=${mod.cf_project_id}, cf_file_id=${mod.cf_file_id}`);
          }

          if (!downloadUrl) {
            console.log(`[Sync] NO URL for ${mod.name} - skipping`);
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

      // ==================== RENAME NEWLY DOWNLOADED DISABLED MODS ====================
      // After download, rename any files that should be disabled
      if (modpackData.disabledMods && modpackData.disabledMods.length > 0) {
        options.onProgress?.("Renaming disabled mods...", 0, modpackData.disabledMods.length);
        
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

          // If enabled file exists (just downloaded), rename to disabled
          if (await fs.pathExists(enabledPath)) {
            await fs.rename(enabledPath, disabledPath);
            console.log(`[Sync] Disabled newly downloaded mod: ${disabledMod.filename}`);
          }
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
        // Check if directory has any syncable content
        const foldersToCheck = ["config", "kubejs", "resourcepacks", "shaderpacks", "defaultconfigs", "scripts", "global_packs"];
        let hasContent = false;
        for (const folder of foldersToCheck) {
          if (await fs.pathExists(path.join(overridesSource, folder))) {
            hasContent = true;
            break;
          }
        }
        
        if (!hasContent) {
          console.log(`[InstanceService] overridesSource directory is empty (no config folders found)`);
          result.warnings.push("No configuration files found. For modpacks imported from URL, configs are not included in the remote manifest.");
          return result;
        }
        
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
  async launchInstance(
    instanceId: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<InstanceLaunchResult> {
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

      // Ensure mod loader is installed before launching
      if (instance.loader && instance.loader !== "vanilla" && instance.loaderVersion) {
        const loaderInstalled = await this.ensureModLoaderInstalled(
          instance.loader,
          instance.loaderVersion,
          instance.minecraftVersion,
          onProgress
        );
        if (!loaderInstalled.success) {
          console.warn(`[InstanceService] Failed to install mod loader: ${loaderInstalled.error}`);
          // Continue anyway - user might have installed it manually
        }
      }

      // Notify creating profile
      onProgress?.("profile", 0, 1, "Creating launcher profile...");

      // Create/update launcher profile for this instance
      await this.createOrUpdateLauncherProfile(instance);
      
      onProgress?.("profile", 1, 1, "Profile ready");

      console.log(`[InstanceService] Launching: ${launcherPath}`);
      console.log(`[InstanceService] Instance path: ${instance.path}`);
      console.log(`[InstanceService] Profile created for: ${instance.name}`);

      // Update last played
      instance.lastPlayed = new Date().toISOString();
      await this.saveInstanceMeta(instance);

      // Launch without --workDir (profile handles the game directory)
      // Capture the launcher process PID for later termination
      let launcherProcess;
      if (platform === "darwin" && launcherPath.endsWith(".app")) {
        launcherProcess = spawn("open", [launcherPath], { 
          detached: true, 
          stdio: "ignore" 
        });
      } else {
        launcherProcess = spawn(launcherPath, [], { 
          detached: true, 
          stdio: "ignore",
          cwd: path.dirname(launcherPath)
        });
      }
      
      const launcherPid = launcherProcess.pid;
      launcherProcess.unref();

      // Start tracking the game (pass launcher PID)
      await this.startGameTracking(instance, launcherPid);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update a launcher profile in the vanilla Minecraft launcher
   * This creates a profile that points to our instance's game directory
   */
  private async createOrUpdateLauncherProfile(instance: ModexInstance): Promise<void> {
    const platform = process.platform;
    let minecraftDir: string;

    // Find the .minecraft directory
    if (platform === "win32") {
      minecraftDir = path.join(process.env.APPDATA || "", ".minecraft");
    } else if (platform === "darwin") {
      minecraftDir = path.join(os.homedir(), "Library", "Application Support", "minecraft");
    } else {
      minecraftDir = path.join(os.homedir(), ".minecraft");
    }

    const profilesPath = path.join(minecraftDir, "launcher_profiles.json");
    
    // Read existing profiles
    let profiles: any = { profiles: {} };
    if (await fs.pathExists(profilesPath)) {
      try {
        profiles = await fs.readJson(profilesPath);
        if (!profiles.profiles) {
          profiles.profiles = {};
        }
      } catch (error) {
        console.warn("[InstanceService] Could not read launcher_profiles.json, creating new");
        profiles = { profiles: {} };
      }
    }

    // Build version ID for modded minecraft
    // For Fabric: fabric-loader-VERSION-MC_VERSION
    // For Forge: VERSION-forge-FORGE_VERSION
    // For NeoForge: neoforge-VERSION
    let versionId = instance.minecraftVersion;
    if (instance.loader && instance.loader !== "vanilla" && instance.loaderVersion) {
      const loader = instance.loader.toLowerCase();
      if (loader === "fabric") {
        versionId = `fabric-loader-${instance.loaderVersion}-${instance.minecraftVersion}`;
      } else if (loader === "forge") {
        versionId = `${instance.minecraftVersion}-forge-${instance.loaderVersion}`;
      } else if (loader === "neoforge") {
        versionId = `neoforge-${instance.loaderVersion}`;
      } else if (loader === "quilt") {
        versionId = `quilt-loader-${instance.loaderVersion}-${instance.minecraftVersion}`;
      }
    }

    // Create profile ID based on instance ID
    const profileId = `modex-${instance.id}`;

    // Build Java arguments - include GPU-related fixes for hybrid graphics laptops
    const memMax = instance.memory?.max || 4096;
    const memMin = instance.memory?.min || 2048;
    const baseArgs = `-Xmx${memMax}M -Xms${memMin}M`;
    // Add arguments to help with rendering on hybrid GPU systems and texture loading
    const gpuArgs = "-Dsun.java2d.opengl=true -Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=false -Dfml.earlyprogresswindow=false";
    // Include user's custom JVM arguments if set
    const customArgs = instance.javaArgs ? ` ${instance.javaArgs}` : "";
    const javaArgs = `${baseArgs} ${gpuArgs}${customArgs}`;

    // Create or update the profile
    profiles.profiles[profileId] = {
      name: `[ModEx] ${instance.name}`,
      type: "custom",
      created: instance.createdAt || new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      lastVersionId: versionId,
      gameDir: instance.path,
      javaArgs: javaArgs
    };

    // Set as selected profile so it launches directly
    profiles.selectedProfile = profileId;

    // Save profiles
    await fs.writeJson(profilesPath, profiles, { spaces: 2 });
    console.log(`[InstanceService] Created/updated launcher profile: ${profileId}`);
    console.log(`[InstanceService] Version ID: ${versionId}`);
    console.log(`[InstanceService] Game directory: ${instance.path}`);
    console.log(`[InstanceService] Java args: ${javaArgs}`);
  }

  /**
   * Ensure the mod loader is installed in the Minecraft launcher
   * Downloads and installs Fabric, Forge, NeoForge, or Quilt if not already installed
   */
  private async ensureModLoaderInstalled(
    loader: string,
    loaderVersion: string,
    minecraftVersion: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform;
    let minecraftDir: string;

    // Find the .minecraft directory
    if (platform === "win32") {
      minecraftDir = path.join(process.env.APPDATA || "", ".minecraft");
    } else if (platform === "darwin") {
      minecraftDir = path.join(os.homedir(), "Library", "Application Support", "minecraft");
    } else {
      minecraftDir = path.join(os.homedir(), ".minecraft");
    }

    const versionsDir = path.join(minecraftDir, "versions");
    const librariesDir = path.join(minecraftDir, "libraries");

    // Build version ID
    let versionId: string;
    const loaderLower = loader.toLowerCase();
    
    if (loaderLower === "fabric") {
      versionId = `fabric-loader-${loaderVersion}-${minecraftVersion}`;
    } else if (loaderLower === "forge") {
      versionId = `${minecraftVersion}-forge-${loaderVersion}`;
    } else if (loaderLower === "neoforge") {
      versionId = `neoforge-${loaderVersion}`;
    } else if (loaderLower === "quilt") {
      versionId = `quilt-loader-${loaderVersion}-${minecraftVersion}`;
    } else {
      return { success: true }; // Vanilla, nothing to install
    }

    // Check if already installed
    const versionDir = path.join(versionsDir, versionId);
    const versionJsonPath = path.join(versionDir, `${versionId}.json`);
    
    if (await fs.pathExists(versionJsonPath)) {
      console.log(`[InstanceService] Mod loader already installed: ${versionId}`);
      onProgress?.("check", 1, 1, `${loader} ${loaderVersion} already installed`);
      return { success: true };
    }

    console.log(`[InstanceService] Installing mod loader: ${versionId}`);
    onProgress?.("install", 0, 100, `Installing ${loader} ${loaderVersion}...`);

    try {
      if (loaderLower === "fabric") {
        return await this.installFabric(minecraftVersion, loaderVersion, versionDir, versionJsonPath, librariesDir, onProgress);
      } else if (loaderLower === "quilt") {
        return await this.installQuilt(minecraftVersion, loaderVersion, versionDir, versionJsonPath, librariesDir, onProgress);
      } else if (loaderLower === "forge") {
        return await this.installForge(minecraftVersion, loaderVersion, minecraftDir, onProgress);
      } else if (loaderLower === "neoforge") {
        return await this.installNeoForge(minecraftVersion, loaderVersion, minecraftDir, onProgress);
      }

      return { success: false, error: "Unknown loader type" };
    } catch (error: any) {
      console.error(`[InstanceService] Failed to install mod loader:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Install Fabric mod loader
   */
  private async installFabric(
    minecraftVersion: string,
    loaderVersion: string,
    versionDir: string,
    versionJsonPath: string,
    librariesDir: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Fetch version JSON from Fabric Meta API
      const metaUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${loaderVersion}/profile/json`;
      console.log(`[InstanceService] Fetching Fabric profile from: ${metaUrl}`);
      onProgress?.("install", 5, 100, "Fetching Fabric profile...");
      
      const response = await fetch(metaUrl);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch Fabric profile: ${response.statusText}` };
      }

      const versionJson = await response.json();
      onProgress?.("install", 10, 100, "Creating version directory...");

      // Create version directory
      await fs.ensureDir(versionDir);

      // Save version JSON
      await fs.writeJson(versionJsonPath, versionJson, { spaces: 2 });
      console.log(`[InstanceService] Saved Fabric version JSON: ${versionJsonPath}`);
      onProgress?.("install", 15, 100, "Downloading libraries...");

      // Download libraries
      const libraries = (versionJson.libraries || []).filter((lib: any) => lib.url && lib.name);
      const totalLibs = libraries.length;
      let downloadedLibs = 0;
      
      for (const lib of libraries) {
        const libName = lib.name.split(":")[1] || lib.name;
        onProgress?.("install", 15 + Math.floor((downloadedLibs / totalLibs) * 80), 100, `Downloading ${libName}...`);
        await this.downloadLibrary(lib, librariesDir);
        downloadedLibs++;
      }

      onProgress?.("install", 100, 100, `Fabric ${loaderVersion} installed!`);
      console.log(`[InstanceService] Fabric ${loaderVersion} installed successfully for MC ${minecraftVersion}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Install Quilt mod loader
   */
  private async installQuilt(
    minecraftVersion: string,
    loaderVersion: string,
    versionDir: string,
    versionJsonPath: string,
    librariesDir: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Fetch version JSON from Quilt Meta API
      const metaUrl = `https://meta.quiltmc.org/v3/versions/loader/${minecraftVersion}/${loaderVersion}/profile/json`;
      console.log(`[InstanceService] Fetching Quilt profile from: ${metaUrl}`);
      onProgress?.("install", 5, 100, "Fetching Quilt profile...");
      
      const response = await fetch(metaUrl);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch Quilt profile: ${response.statusText}` };
      }

      const versionJson = await response.json();
      onProgress?.("install", 10, 100, "Creating version directory...");

      // Create version directory
      await fs.ensureDir(versionDir);

      // Save version JSON
      await fs.writeJson(versionJsonPath, versionJson, { spaces: 2 });
      console.log(`[InstanceService] Saved Quilt version JSON: ${versionJsonPath}`);
      onProgress?.("install", 15, 100, "Downloading libraries...");

      // Download libraries
      const libraries = (versionJson.libraries || []).filter((lib: any) => lib.url && lib.name);
      const totalLibs = libraries.length;
      let downloadedLibs = 0;
      
      for (const lib of libraries) {
        const libName = lib.name.split(":")[1] || lib.name;
        onProgress?.("install", 15 + Math.floor((downloadedLibs / totalLibs) * 80), 100, `Downloading ${libName}...`);
        await this.downloadLibrary(lib, librariesDir);
        downloadedLibs++;
      }

      onProgress?.("install", 100, 100, `Quilt ${loaderVersion} installed!`);
      console.log(`[InstanceService] Quilt ${loaderVersion} installed successfully for MC ${minecraftVersion}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Install Forge mod loader
   * Downloads the Forge installer and runs it headlessly
   */
  private async installForge(
    minecraftVersion: string,
    loaderVersion: string,
    minecraftDir: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    const { execSync } = await import("child_process");
    
    try {
      // Build installer URL
      // Format: https://maven.minecraftforge.net/net/minecraftforge/forge/MC-FORGE/forge-MC-FORGE-installer.jar
      const forgeVersion = `${minecraftVersion}-${loaderVersion}`;
      const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
      
      console.log(`[InstanceService] Downloading Forge installer from: ${installerUrl}`);
      onProgress?.("install", 5, 100, "Downloading Forge installer...");

      const response = await fetch(installerUrl);
      if (!response.ok) {
        // Try alternative URL format (some versions use different naming)
        const altUrl = `https://files.minecraftforge.net/maven/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
        const altResponse = await fetch(altUrl);
        if (!altResponse.ok) {
          return { 
            success: false, 
            error: `Failed to download Forge installer. Version ${loaderVersion} may not exist for MC ${minecraftVersion}` 
          };
        }
        // Use alternative response
        const buffer = Buffer.from(await altResponse.arrayBuffer());
        await this.runForgeInstaller(buffer, minecraftDir, minecraftVersion, loaderVersion, onProgress);
        return { success: true };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      onProgress?.("install", 30, 100, "Running Forge installer...");
      
      await this.runForgeInstaller(buffer, minecraftDir, minecraftVersion, loaderVersion, onProgress);
      
      onProgress?.("install", 100, 100, `Forge ${loaderVersion} installed!`);
      console.log(`[InstanceService] Forge ${loaderVersion} installed successfully for MC ${minecraftVersion}`);
      return { success: true };
    } catch (error: any) {
      console.error("[InstanceService] Forge installation error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run Forge installer in headless mode
   */
  private async runForgeInstaller(
    installerBuffer: Buffer,
    minecraftDir: string,
    minecraftVersion: string,
    loaderVersion: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<void> {
    const { execSync, spawn } = await import("child_process");
    const tempDir = path.join(app.getPath("temp"), "modex-forge-install");
    const installerPath = path.join(tempDir, `forge-installer-${minecraftVersion}-${loaderVersion}.jar`);

    try {
      // Save installer to temp
      await fs.ensureDir(tempDir);
      await fs.writeFile(installerPath, installerBuffer);
      
      onProgress?.("install", 40, 100, "Running installer (this may take a while)...");
      
      // Find Java executable
      let javaPath = "java";
      const platform = process.platform;
      
      if (platform === "win32") {
        // Try to find Java in Minecraft's runtime
        const mcJavaPath = path.join(
          process.env.LOCALAPPDATA || "",
          "Packages",
          "Microsoft.4297127D64EC6_8wekyb3d8bbwe",
          "LocalCache",
          "Local",
          "runtime"
        );
        
        if (await fs.pathExists(mcJavaPath)) {
          const runtimes = await fs.readdir(mcJavaPath);
          for (const runtime of runtimes) {
            const javawPath = path.join(mcJavaPath, runtime, "windows-x64", runtime, "bin", "java.exe");
            if (await fs.pathExists(javawPath)) {
              javaPath = javawPath;
              break;
            }
          }
        }
        
        // Fallback to Program Files Java
        if (javaPath === "java") {
          const javaHome = process.env.JAVA_HOME;
          if (javaHome && await fs.pathExists(path.join(javaHome, "bin", "java.exe"))) {
            javaPath = path.join(javaHome, "bin", "java.exe");
          }
        }
      }
      
      console.log(`[InstanceService] Using Java: ${javaPath}`);
      console.log(`[InstanceService] Running Forge installer: ${installerPath}`);
      
      // Run installer in headless mode
      // The --installClient flag tells Forge to install without GUI
      return new Promise((resolve, reject) => {
        const proc = spawn(javaPath, [
          "-jar",
          installerPath,
          "--installClient",
          minecraftDir
        ], {
          cwd: tempDir,
          stdio: ["ignore", "pipe", "pipe"]
        });

        let output = "";
        proc.stdout?.on("data", (data) => {
          output += data.toString();
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.includes("Downloading")) {
              onProgress?.("install", 50, 100, line.trim().slice(0, 50));
            } else if (line.includes("Patching")) {
              onProgress?.("install", 70, 100, "Patching files...");
            } else if (line.includes("Injecting")) {
              onProgress?.("install", 80, 100, "Injecting profile...");
            }
          }
        });
        
        proc.stderr?.on("data", (data) => {
          output += data.toString();
        });

        proc.on("close", (code) => {
          // Clean up installer
          fs.remove(installerPath).catch(() => {});
          
          if (code === 0) {
            console.log("[InstanceService] Forge installer completed successfully");
            resolve();
          } else {
            console.error("[InstanceService] Forge installer output:", output);
            reject(new Error(`Forge installer exited with code ${code}`));
          }
        });

        proc.on("error", (err) => {
          fs.remove(installerPath).catch(() => {});
          reject(err);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          proc.kill();
          reject(new Error("Forge installer timed out"));
        }, 300000);
      });
    } catch (error) {
      // Clean up on error
      await fs.remove(installerPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Install NeoForge mod loader
   * Downloads the NeoForge installer and runs it headlessly
   */
  private async installNeoForge(
    minecraftVersion: string,
    loaderVersion: string,
    minecraftDir: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Build installer URL
      // Format: https://maven.neoforged.net/releases/net/neoforged/neoforge/VERSION/neoforge-VERSION-installer.jar
      const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
      
      console.log(`[InstanceService] Downloading NeoForge installer from: ${installerUrl}`);
      onProgress?.("install", 5, 100, "Downloading NeoForge installer...");

      const response = await fetch(installerUrl);
      if (!response.ok) {
        return { 
          success: false, 
          error: `Failed to download NeoForge installer. Version ${loaderVersion} may not exist.` 
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      onProgress?.("install", 30, 100, "Running NeoForge installer...");
      
      await this.runNeoForgeInstaller(buffer, minecraftDir, loaderVersion, onProgress);
      
      onProgress?.("install", 100, 100, `NeoForge ${loaderVersion} installed!`);
      console.log(`[InstanceService] NeoForge ${loaderVersion} installed successfully`);
      return { success: true };
    } catch (error: any) {
      console.error("[InstanceService] NeoForge installation error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run NeoForge installer in headless mode
   */
  private async runNeoForgeInstaller(
    installerBuffer: Buffer,
    minecraftDir: string,
    loaderVersion: string,
    onProgress?: (stage: string, current: number, total: number, detail?: string) => void
  ): Promise<void> {
    const { spawn } = await import("child_process");
    const tempDir = path.join(app.getPath("temp"), "modex-neoforge-install");
    const installerPath = path.join(tempDir, `neoforge-installer-${loaderVersion}.jar`);

    try {
      // Save installer to temp
      await fs.ensureDir(tempDir);
      await fs.writeFile(installerPath, installerBuffer);
      
      onProgress?.("install", 40, 100, "Running installer (this may take a while)...");
      
      // Find Java executable (same logic as Forge)
      let javaPath = "java";
      const platform = process.platform;
      
      if (platform === "win32") {
        const mcJavaPath = path.join(
          process.env.LOCALAPPDATA || "",
          "Packages",
          "Microsoft.4297127D64EC6_8wekyb3d8bbwe",
          "LocalCache",
          "Local",
          "runtime"
        );
        
        if (await fs.pathExists(mcJavaPath)) {
          const runtimes = await fs.readdir(mcJavaPath);
          for (const runtime of runtimes) {
            const javawPath = path.join(mcJavaPath, runtime, "windows-x64", runtime, "bin", "java.exe");
            if (await fs.pathExists(javawPath)) {
              javaPath = javawPath;
              break;
            }
          }
        }
        
        if (javaPath === "java") {
          const javaHome = process.env.JAVA_HOME;
          if (javaHome && await fs.pathExists(path.join(javaHome, "bin", "java.exe"))) {
            javaPath = path.join(javaHome, "bin", "java.exe");
          }
        }
      }
      
      console.log(`[InstanceService] Using Java: ${javaPath}`);
      console.log(`[InstanceService] Running NeoForge installer: ${installerPath}`);
      
      return new Promise((resolve, reject) => {
        const proc = spawn(javaPath, [
          "-jar",
          installerPath,
          "--installClient",
          minecraftDir
        ], {
          cwd: tempDir,
          stdio: ["ignore", "pipe", "pipe"]
        });

        let output = "";
        proc.stdout?.on("data", (data) => {
          output += data.toString();
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.includes("Downloading")) {
              onProgress?.("install", 50, 100, line.trim().slice(0, 50));
            } else if (line.includes("Patching") || line.includes("Processing")) {
              onProgress?.("install", 70, 100, "Processing files...");
            } else if (line.includes("Injecting") || line.includes("Successfully")) {
              onProgress?.("install", 90, 100, "Finalizing...");
            }
          }
        });
        
        proc.stderr?.on("data", (data) => {
          output += data.toString();
        });

        proc.on("close", (code) => {
          fs.remove(installerPath).catch(() => {});
          
          if (code === 0) {
            console.log("[InstanceService] NeoForge installer completed successfully");
            resolve();
          } else {
            console.error("[InstanceService] NeoForge installer output:", output);
            reject(new Error(`NeoForge installer exited with code ${code}`));
          }
        });

        proc.on("error", (err) => {
          fs.remove(installerPath).catch(() => {});
          reject(err);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          proc.kill();
          reject(new Error("NeoForge installer timed out"));
        }, 300000);
      });
    } catch (error) {
      await fs.remove(installerPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Download a library to the libraries directory
   * Maven-style: group.id:artifact:version -> group/id/artifact/version/artifact-version.jar
   */
  private async downloadLibrary(
    lib: { name: string; url: string; sha1?: string },
    librariesDir: string
  ): Promise<void> {
    // Parse Maven coordinates: group:artifact:version
    const parts = lib.name.split(":");
    if (parts.length < 3) return;

    const [group, artifact, version] = parts;
    const groupPath = group.replace(/\./g, "/");
    const jarName = `${artifact}-${version}.jar`;
    const libPath = path.join(librariesDir, groupPath, artifact, version, jarName);

    // Check if already exists
    if (await fs.pathExists(libPath)) {
      return;
    }

    // Build download URL
    const downloadUrl = `${lib.url}${groupPath}/${artifact}/${version}/${jarName}`;
    
    try {
      console.log(`[InstanceService] Downloading library: ${lib.name}`);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        console.warn(`[InstanceService] Failed to download ${lib.name}: ${response.statusText}`);
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(libPath));
      
      // Save library
      await fs.writeFile(libPath, buffer);
      console.log(`[InstanceService] Downloaded: ${jarName}`);
    } catch (error) {
      console.warn(`[InstanceService] Failed to download ${lib.name}:`, error);
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
      
      console.log(`[checkSyncStatus] Checking instance ${instance.id} at ${instance.path}`);
      console.log(`[checkSyncStatus] Disabled mod IDs: ${[...disabledSet].join(', ')}`);
      console.log(`[checkSyncStatus] Expected mods count: ${modpackMods.length}`);
      
      // Get all mod files in instance (both enabled and disabled)
      // Mods can be .jar or .zip (datapacks, compat packs)
      const instanceFiles: Map<string, boolean> = new Map(); // filename -> isEnabled
      
      if (await fs.pathExists(modsPath)) {
        const files = await fs.readdir(modsPath);
        console.log(`[checkSyncStatus] Files in mods folder: ${files.length}`);
        for (const file of files) {
          if (file.endsWith(".jar") || file.endsWith(".zip")) {
            instanceFiles.set(file, true);
          } else if (file.endsWith(".jar.disabled") || file.endsWith(".zip.disabled")) {
            const enabledName = file.replace(".disabled", "");
            instanceFiles.set(enabledName, false);
          }
        }
        console.log(`[checkSyncStatus] Tracked instance files: ${[...instanceFiles.keys()].join(', ')}`);
      } else {
        console.log(`[checkSyncStatus] Mods folder does not exist: ${modsPath}`);
      }

      // Check mods that should be in instance
      const expectedFilenames = new Set<string>();
      for (const mod of modpackMods) {
        // content_type defaults to "mod" if undefined
        const modContentType = mod.content_type || "mod";
        if (!mod.filename || modContentType !== "mod") continue;
        
        const filename = mod.filename;
        expectedFilenames.add(filename);
        const shouldBeDisabled = disabledSet.has(mod.id);
        
        if (!instanceFiles.has(filename)) {
          // Mod is missing entirely
          console.log(`[checkSyncStatus] MISSING: ${filename} (id: ${mod.id}, disabled: ${shouldBeDisabled})`);
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
      
      console.log(`[checkSyncStatus] Missing in instance: ${result.missingInInstance.length}`);

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

      // Config differences are NOT counted for sync purposes
      // Configs are managed directly as physical files, not as virtual modpack references
      // The user edits configs directly on the instance, so there's nothing to "sync"

      // Extra files in instance are NOT counted as requiring sync
      // These are user-added files that should be preserved
      // Only missingInInstance and disabledMismatch require sync action
      result.totalDifferences = 
        result.missingInInstance.length + 
        result.disabledMismatch.length;
      
      result.needsSync = result.totalDifferences > 0;

    } catch (error) {
      console.error("[InstanceService] Error checking sync status:", error);
    }

    return result;
  }

  /**
   * Get list of config files that were modified in instance compared to modpack overrides
   */
  async getModifiedConfigs(instanceId: string, overridesPath?: string): Promise<{
    modifiedConfigs: Array<{
      relativePath: string;
      instancePath: string;
      overridePath?: string;
      status: 'modified' | 'new' | 'deleted';
      lastModified: Date;
      size: number;
    }>;
    instanceConfigPath: string;
    overridesConfigPath?: string;
  }> {
    const result: {
      modifiedConfigs: Array<{
        relativePath: string;
        instancePath: string;
        overridePath?: string;
        status: 'modified' | 'new' | 'deleted';
        lastModified: Date;
        size: number;
      }>;
      instanceConfigPath: string;
      overridesConfigPath?: string;
    } = {
      modifiedConfigs: [],
      instanceConfigPath: '',
      overridesConfigPath: undefined
    };

    const instance = await this.getInstance(instanceId);
    if (!instance) {
      return result;
    }

    result.instanceConfigPath = path.join(instance.path, 'config');

    // Use provided overrides path
    if (overridesPath && await fs.pathExists(overridesPath)) {
      result.overridesConfigPath = path.join(overridesPath, 'config');
    }

    // Valid config file extensions
    const validConfigExtensions = new Set([
      'toml', 'json', 'json5', 'properties', 'cfg', 
      'yaml', 'yml', 'txt', 'snbt', 'conf', 'ini', 'xml'
    ]);

    // Helper to check if file is a valid config
    const isConfigFile = (filePath: string): boolean => {
      const ext = path.extname(filePath).toLowerCase().slice(1);
      return validConfigExtensions.has(ext);
    };

    // Get all config files from instance
    if (await fs.pathExists(result.instanceConfigPath)) {
      const instanceConfigs = await this.getAllFiles(result.instanceConfigPath, result.instanceConfigPath);
      
      for (const relPath of instanceConfigs) {
        // Skip non-config files (images, binaries, etc.)
        if (!isConfigFile(relPath)) {
          continue;
        }
        
        const instanceFilePath = path.join(result.instanceConfigPath, relPath);
        const stat = await fs.stat(instanceFilePath);
        
        let status: 'modified' | 'new' | 'deleted' = 'new';
        let overridePath: string | undefined;
        
        // Check if file exists in overrides
        if (result.overridesConfigPath) {
          const overrideFilePath = path.join(result.overridesConfigPath, relPath);
          if (await fs.pathExists(overrideFilePath)) {
            overridePath = overrideFilePath;
            
            // Compare content
            const instanceContent = await fs.readFile(instanceFilePath);
            const overrideContent = await fs.readFile(overrideFilePath);
            
            if (!instanceContent.equals(overrideContent)) {
              status = 'modified';
            } else {
              // File is same, skip
              continue;
            }
          }
        }
        
        result.modifiedConfigs.push({
          relativePath: relPath,
          instancePath: instanceFilePath,
          overridePath,
          status,
          lastModified: stat.mtime,
          size: stat.size
        });
      }
    }

    // Check for deleted configs (in overrides but not in instance)
    if (result.overridesConfigPath && await fs.pathExists(result.overridesConfigPath)) {
      const overrideConfigs = await this.getAllFiles(result.overridesConfigPath, result.overridesConfigPath);
      
      for (const relPath of overrideConfigs) {
        // Skip non-config files (images, binaries, etc.)
        if (!isConfigFile(relPath)) {
          continue;
        }
        
        const instanceFilePath = path.join(result.instanceConfigPath, relPath);
        
        if (!await fs.pathExists(instanceFilePath)) {
          result.modifiedConfigs.push({
            relativePath: relPath,
            instancePath: instanceFilePath,
            overridePath: path.join(result.overridesConfigPath, relPath),
            status: 'deleted',
            lastModified: new Date(),
            size: 0
          });
        }
      }
    }

    // Sort by status and then by path
    result.modifiedConfigs.sort((a, b) => {
      const statusOrder = { modified: 0, new: 1, deleted: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.relativePath.localeCompare(b.relativePath);
    });

    return result;
  }

  /**
   * Import config files from instance to modpack overrides
   */
  async importConfigsToModpack(
    instanceId: string, 
    overridesPath: string, 
    configPaths: string[] // relative paths to import
  ): Promise<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: [] as string[]
    };

    const instance = await this.getInstance(instanceId);
    if (!instance) {
      result.success = false;
      result.errors.push("Instance not found");
      return result;
    }

    if (!overridesPath) {
      result.success = false;
      result.errors.push("Overrides path not provided");
      return result;
    }

    const instanceConfigPath = path.join(instance.path, 'config');
    
    // Ensure overrides config path exists
    const overridesConfigPath = path.join(overridesPath, 'config');
    await fs.ensureDir(overridesConfigPath);

    for (const relPath of configPaths) {
      try {
        const instanceFilePath = path.join(instanceConfigPath, relPath);
        const overrideFilePath = path.join(overridesConfigPath, relPath);

        if (await fs.pathExists(instanceFilePath)) {
          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(overrideFilePath));
          
          // Copy file from instance to overrides
          await fs.copy(instanceFilePath, overrideFilePath, { overwrite: true });
          result.imported++;
          console.log(`[ConfigSync] Imported config: ${relPath}`);
        } else {
          result.skipped++;
          console.log(`[ConfigSync] Skipped (not found): ${relPath}`);
        }
      } catch (err: any) {
        result.errors.push(`Failed to import ${relPath}: ${err.message}`);
        console.error(`[ConfigSync] Error importing ${relPath}:`, err);
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
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

  // ==================== GAME TRACKING ====================

  /**
   * Set callback for game status changes
   */
  setGameStatusCallback(callback: (instanceId: string, info: RunningGameInfo) => void) {
    this.onGameStatusChange = callback;
  }

  /**
   * Set callback for real-time log lines
   */
  setGameLogCallback(callback: (instanceId: string, logLine: { time: string; level: string; message: string; raw: string }) => void) {
    this.onGameLogLine = callback;
  }

  /**
   * Get running game info for an instance
   */
  getRunningGame(instanceId: string): RunningGameInfo | undefined {
    return this.runningGames.get(instanceId);
  }

  /**
   * Get all running games
   */
  getAllRunningGames(): Map<string, RunningGameInfo> {
    return new Map(this.runningGames);
  }

  /**
   * Start tracking a launched game
   */
  private async startGameTracking(instance: ModexInstance, launcherPid?: number): Promise<void> {
    const gameInfo: RunningGameInfo = {
      instanceId: instance.id,
      launcherPid: launcherPid,
      startTime: Date.now(),
      status: "launching",
      loadedMods: 0,
      totalMods: instance.modCount || 0,
      gameProcessRunning: false // Not running yet, just launcher
    };

    this.runningGames.set(instance.id, gameInfo);
    this.onGameStatusChange?.(instance.id, gameInfo);

    // Start watching for the Java process and logs
    this.watchForGameProcess(instance);
    this.watchGameLogs(instance);
  }

  /**
   * Watch for Java/Minecraft process to start
   */
  private async watchForGameProcess(instance: ModexInstance): Promise<void> {
    const gameInfo = this.runningGames.get(instance.id);
    if (!gameInfo) return;

    // Poll for javaw process with our game directory
    const checkInterval = setInterval(async () => {
      try {
        const { execSync } = await import("child_process");
        const platform = process.platform;
        
        if (platform === "win32") {
          // Windows: use PowerShell to find java processes (WMIC is deprecated)
          try {
            const result = execSync(
              `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name like '%java%'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"`,
              { encoding: "utf-8", timeout: 10000 }
            );
            
            // Parse JSON result
            let processes: any[] = [];
            try {
              const parsed = JSON.parse(result);
              processes = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              // No processes found
              return;
            }
            
            // Look for our instance path in the command line
            for (const proc of processes) {
              if (!proc || !proc.CommandLine) continue;
              
              const cmdLine = proc.CommandLine as string;
              // Check if this Java process is running our instance
              if (cmdLine.includes(instance.path) || cmdLine.includes(instance.path.replace(/\\/g, "/"))) {
                const pid = proc.ProcessId;
                if (pid && !isNaN(pid)) {
                  gameInfo.gamePid = pid;
                  gameInfo.status = "loading_mods";
                  gameInfo.gameProcessRunning = true; // Now the actual game is running
                  this.onGameStatusChange?.(instance.id, gameInfo);
                  console.log(`[InstanceService] Found game process PID: ${pid}`);
                  clearInterval(checkInterval);
                  
                  // Start monitoring process health
                  this.monitorGameProcess(instance);
                  return;
                }
              }
            }
          } catch (e) {
            console.warn("[InstanceService] PowerShell process query failed:", e);
          }
        }
      } catch (error) {
        console.warn("[InstanceService] Error checking for game process:", error);
      }
    }, 2000);

    // Stop checking after 2 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      const info = this.runningGames.get(instance.id);
      if (info && !info.gamePid) {
        console.log("[InstanceService] Timeout waiting for game process");
      }
    }, 120000);
  }

  /**
   * Monitor game process to detect when it exits
   */
  private async monitorGameProcess(instance: ModexInstance): Promise<void> {
    const gameInfo = this.runningGames.get(instance.id);
    if (!gameInfo || !gameInfo.gamePid) return;

    const checkInterval = setInterval(async () => {
      try {
        // Check if process is still running
        process.kill(gameInfo.gamePid!, 0); // Signal 0 just checks if process exists
      } catch (error) {
        // Process no longer exists
        console.log(`[InstanceService] Game process ${gameInfo.gamePid} exited`);
        clearInterval(checkInterval);
        this.stopGameTracking(instance.id);
      }
    }, 5000);
  }

  /**
   * Watch game logs for mod loading progress
   * Uses a combination of fs.watch for instant notifications and fast polling as fallback
   */
  private async watchGameLogs(instance: ModexInstance): Promise<void> {
    const logsPath = path.join(instance.path, "logs");
    const latestLog = path.join(logsPath, "latest.log");

    // Wait for logs directory to exist (check more frequently)
    let attempts = 0;
    while (!(await fs.pathExists(logsPath)) && attempts < 60) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    if (!(await fs.pathExists(logsPath))) {
      console.warn("[InstanceService] Logs directory not found after 30s");
      return;
    }

    const gameInfo = this.runningGames.get(instance.id);
    if (!gameInfo) return;

    // Track file position for incremental reading
    let lastSize = 0;
    let lastInode = 0;
    const launchTime = gameInfo.startTime;
    let isReading = false; // Prevent concurrent reads
    let pendingRead = false; // Track if a read was requested while reading
    let lineBuffer = ""; // Buffer for incomplete lines
    
    // Initialize position based on existing file
    try {
      if (await fs.pathExists(latestLog)) {
        const stats = await fs.stat(latestLog);
        lastInode = (stats as any).ino || 0;
        // If the log file was modified before we launched, skip its content
        if (stats.mtimeMs < launchTime) {
          lastSize = stats.size;
          console.log(`[InstanceService] Skipping existing log content (${lastSize} bytes)`);
        } else {
          // File was modified after launch start, read from beginning
          lastSize = 0;
          console.log("[InstanceService] Log file is fresh, reading from start");
        }
      }
    } catch {}

    /**
     * Read new content from log file using streams for better performance
     */
    const readNewContent = async () => {
      if (isReading) {
        pendingRead = true;
        return;
      }
      
      isReading = true;
      
      try {
        if (!(await fs.pathExists(latestLog))) {
          isReading = false;
          return;
        }
        
        const stats = await fs.stat(latestLog);
        const currentInode = (stats as any).ino || 0;
        
        // Check if file was replaced (new inode) or truncated
        if ((currentInode !== 0 && lastInode !== 0 && currentInode !== lastInode) || stats.size < lastSize) {
          // File was replaced, start from beginning
          lastSize = 0;
          lastInode = currentInode;
          lineBuffer = "";
          console.log("[InstanceService] Log file was replaced, reading from start");
        }
        
        if (stats.size === lastSize) {
          isReading = false;
          if (pendingRead) {
            pendingRead = false;
            setImmediate(readNewContent);
          }
          return;
        }

        // Read only new bytes using a read stream with start position
        const bytesToRead = stats.size - lastSize;
        
        // Use native fs for createReadStream with start position
        const nativeFs = await import("fs");
        const stream = nativeFs.createReadStream(latestLog, {
          start: lastSize,
          end: stats.size - 1,
          encoding: "utf-8",
          highWaterMark: 64 * 1024 // 64KB chunks for better performance
        });
        
        let newContent = "";
        
        await new Promise<void>((resolve, reject) => {
          stream.on("data", (chunk: string) => {
            newContent += chunk;
          });
          stream.on("end", resolve);
          stream.on("error", (err) => {
            // EBUSY or EACCES means file is locked, just ignore
            if ((err as any).code === "EBUSY" || (err as any).code === "EACCES") {
              resolve();
            } else {
              reject(err);
            }
          });
        });
        
        lastSize = stats.size;
        lastInode = currentInode;
        
        if (newContent) {
          // Handle incomplete lines by buffering
          const fullContent = lineBuffer + newContent;
          const lines = fullContent.split("\n");
          
          // If content doesn't end with newline, last element is incomplete
          if (!newContent.endsWith("\n")) {
            lineBuffer = lines.pop() || "";
          } else {
            lineBuffer = "";
          }
          
          // Process complete lines
          const completeContent = lines.join("\n");
          if (completeContent.trim()) {
            this.parseLogContent(instance.id, completeContent);
          }
        }
      } catch (error: any) {
        // Ignore file access errors (file might be locked by game)
        if (error.code !== "EBUSY" && error.code !== "EACCES" && error.code !== "ENOENT") {
          console.warn("[InstanceService] Error reading log:", error.message);
        }
      } finally {
        isReading = false;
        if (pendingRead) {
          pendingRead = false;
          setImmediate(readNewContent);
        }
      }
    };

    // Set up file watcher for instant notifications
    let watcher: import("fs").FSWatcher | null = null;
    try {
      const nativeFs = await import("fs");
      
      // Watch the logs directory for changes
      watcher = nativeFs.watch(logsPath, { persistent: false }, (eventType, filename) => {
        if (filename === "latest.log") {
          readNewContent();
        }
      });
      
      watcher.on("error", (err) => {
        console.warn("[InstanceService] Log watcher error:", err.message);
      });
      
      console.log("[InstanceService] File watcher active for logs");
    } catch (err) {
      console.warn("[InstanceService] Could not set up file watcher, using polling only");
    }

    // Also use fast polling as fallback (fs.watch can be unreliable on some systems)
    // 100ms polling for more responsive log capture
    const logCheckInterval = setInterval(readNewContent, 100);
    
    // Initial read
    readNewContent();

    // Store cleanup references
    const info = this.runningGames.get(instance.id);
    if (info) {
      (info as any).logCheckInterval = logCheckInterval;
      (info as any).logFileWatcher = watcher;
    }
  }

  /**
   * Parse a single log line into structured format
   * Handles various Minecraft log formats:
   * - [HH:MM:SS] [Thread/LEVEL] [Category]: Message (standard)
   * - [HH:MM:SS] [Thread/LEVEL]: Message
   * - [LEVEL] Message (simple)
   * - HH:MM:SS LEVEL Message (no brackets)
   */
  private parseLogLine(rawLine: string): { time: string; level: string; message: string; raw: string; source?: string } {
    // Try different timestamp formats
    let time: string;
    let timestampEnd = 0;
    
    // Format: [HH:MM:SS]
    const bracketTimeMatch = rawLine.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    if (bracketTimeMatch) {
      time = bracketTimeMatch[1];
      timestampEnd = bracketTimeMatch[0].length;
    } else {
      // Format: HH:MM:SS (no brackets)
      const plainTimeMatch = rawLine.match(/^(\d{2}:\d{2}:\d{2})/);
      if (plainTimeMatch) {
        time = plainTimeMatch[1];
        timestampEnd = plainTimeMatch[0].length;
      } else {
        time = new Date().toLocaleTimeString('en-US', { hour12: false }).slice(0, 8);
      }
    }
    
    // Extract level - try multiple patterns
    // Pattern 1: [Thread/LEVEL] or [LEVEL]
    const afterTimestamp = rawLine.slice(timestampEnd);
    const levelBracketMatch = afterTimestamp.match(/\[([^\]]*\/)?(INFO|WARN|WARNING|ERROR|DEBUG|FATAL|TRACE|SEVERE|FINE|FINER|FINEST)\]/i);
    // Pattern 2: Just the word
    const levelWordMatch = afterTimestamp.match(/\b(INFO|WARN|WARNING|ERROR|DEBUG|FATAL|TRACE|SEVERE)\b/i);
    
    let level = "INFO";
    let source: string | undefined;
    
    if (levelBracketMatch) {
      level = levelBracketMatch[2].toUpperCase();
      if (level === "WARNING") level = "WARN";
      if (level === "SEVERE") level = "ERROR";
      // Extract thread/source if present
      if (levelBracketMatch[1]) {
        source = levelBracketMatch[1].slice(0, -1); // Remove trailing /
      }
    } else if (levelWordMatch) {
      level = levelWordMatch[1].toUpperCase();
      if (level === "WARNING") level = "WARN";
      if (level === "SEVERE") level = "ERROR";
    }
    
    // Try to extract source from [Thread/LEVEL] or [Source/LEVEL] format
    if (!source) {
      const sourceMatch = afterTimestamp.match(/\[([^\]\/]+)\/[^\]]+\]/);
      if (sourceMatch) {
        source = sourceMatch[1];
      }
    }
    
    // Extract message - everything after the bracket sections
    let message = rawLine;
    
    // Find the end of all bracket sections
    let lastBracketEnd = 0;
    let depth = 0;
    let inBracket = false;
    
    for (let i = 0; i < rawLine.length; i++) {
      if (rawLine[i] === '[') {
        inBracket = true;
        depth++;
      } else if (rawLine[i] === ']') {
        depth--;
        if (depth === 0) {
          inBracket = false;
          lastBracketEnd = i + 1;
        }
      } else if (!inBracket && depth === 0 && lastBracketEnd > 0) {
        // We've exited all brackets, rest is message
        break;
      }
    }
    
    if (lastBracketEnd > 0 && lastBracketEnd < rawLine.length) {
      message = rawLine.substring(lastBracketEnd).trim();
      // Remove leading colon if present
      if (message.startsWith(':')) {
        message = message.substring(1).trim();
      }
    }
    
    return { time, level, message, raw: rawLine, source };
  }

  /**
   * Parse log content for mod loading progress
   */
  private parseLogContent(instanceId: string, content: string): void {
    const gameInfo = this.runningGames.get(instanceId);
    if (!gameInfo) return;

    const lines = content.split("\n");
    let hasChanges = false;
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Send log line to frontend for real-time console
      if (this.onGameLogLine) {
        const parsed = this.parseLogLine(line);
        this.onGameLogLine(instanceId, parsed);
      }
      
      // ========== FABRIC/QUILT MOD LOADING ==========
      // Fabric/Quilt: "Loading X mods:"
      const fabricLoadingMatch = line.match(/Loading\s+(\d+)\s+mods?:/i);
      if (fabricLoadingMatch) {
        gameInfo.totalMods = parseInt(fabricLoadingMatch[1]);
        gameInfo.loadedMods = 0;
        gameInfo.currentMod = "Initializing mods...";
        if (gameInfo.status === "launching") {
          gameInfo.status = "loading_mods";
        }
        hasChanges = true;
        continue;
      }

      // ========== FORGE MOD LOADING ==========
      // Forge: "Mod List: X mods"
      const forgeModListMatch = line.match(/Mod List:\s*(\d+)\s*mods?/i);
      if (forgeModListMatch) {
        gameInfo.totalMods = parseInt(forgeModListMatch[1]);
        gameInfo.loadedMods = 0;
        gameInfo.currentMod = "Loading mods...";
        if (gameInfo.status === "launching") {
          gameInfo.status = "loading_mods";
        }
        hasChanges = true;
        continue;
      }

      // Forge: "Loading X mods" or "Found X mod candidates"
      const forgeLoadingMatch = line.match(/(?:Loading|Found)\s+(\d+)\s+(?:mods?|mod candidates)/i);
      if (forgeLoadingMatch && !line.includes("mods:")) {
        const count = parseInt(forgeLoadingMatch[1]);
        if (count > gameInfo.totalMods) {
          gameInfo.totalMods = count;
        }
        if (gameInfo.status === "launching") {
          gameInfo.status = "loading_mods";
        }
        hasChanges = true;
        continue;
      }

      // ========== NEOFORGE MOD LOADING ==========
      // NeoForge: "Loading X mods"
      const neoforgeLoadingMatch = line.match(/NeoForge.*Loading\s+(\d+)/i);
      if (neoforgeLoadingMatch) {
        gameInfo.totalMods = parseInt(neoforgeLoadingMatch[1]);
        gameInfo.loadedMods = 0;
        gameInfo.currentMod = "Loading NeoForge mods...";
        if (gameInfo.status === "launching") {
          gameInfo.status = "loading_mods";
        }
        hasChanges = true;
        continue;
      }

      // Only process loading phases if we're in loading_mods status
      if (gameInfo.status !== "loading_mods") continue;

      // ========== LOADING PROGRESS PHASES ==========
      // These represent different phases of loading, use them as percentage markers

      // Mixin application (early phase - 10-20%)
      if (line.match(/\[.*mixin.*\]/i) || line.includes("SpongePowered MIXIN")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.15));
        gameInfo.currentMod = "Applying mixins...";
        hasChanges = true;
        continue;
      }

      // Registry setup (20-40%)
      if (line.includes("Registr") || line.includes("registry")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.3));
        gameInfo.currentMod = "Setting up registries...";
        hasChanges = true;
        continue;
      }

      // Model/Resource loading (40-60%)
      if (line.includes("ModelLoader") || line.includes("Loading model") || line.includes("Baking models")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.5));
        gameInfo.currentMod = "Loading models...";
        hasChanges = true;
        continue;
      }

      // Texture creation (60-80%)
      if (line.includes("Created:") && line.includes("textures")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.7));
        gameInfo.currentMod = "Loading textures...";
        hasChanges = true;
        continue;
      }

      // Sound engine (80-90%)
      if (line.includes("Sound engine started") || line.includes("OpenAL initialized")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.85));
        gameInfo.currentMod = "Starting sound engine...";
        hasChanges = true;
        continue;
      }

      // Resource reload (90-95%)
      if (line.includes("Reloading ResourceManager") || line.includes("resource reload")) {
        gameInfo.loadedMods = Math.max(gameInfo.loadedMods, Math.floor(gameInfo.totalMods * 0.92));
        gameInfo.currentMod = "Reloading resources...";
        hasChanges = true;
        continue;
      }

      // ========== GAME READY INDICATORS ==========
      if (
        line.includes("took") && line.includes("seconds to start") ||
        line.includes("Narrator library") ||
        line.includes("Backend library: LWJGL") ||
        line.match(/\[Render thread\/INFO\].*Minecraft/)
      ) {
        gameInfo.status = "running";
        gameInfo.loadedMods = gameInfo.totalMods;
        gameInfo.currentMod = undefined;
        hasChanges = true;
        continue;
      }
    }

    // Notify of changes only if something changed
    if (hasChanges) {
      this.onGameStatusChange?.(instanceId, gameInfo);
    }
  }

  /**
   * Stop tracking a game
   */
  stopGameTracking(instanceId: string): void {
    const gameInfo = this.runningGames.get(instanceId);
    if (!gameInfo) return;

    // Clean up log watcher (legacy)
    if (gameInfo.logWatcher) {
      gameInfo.logWatcher.close();
    }
    // Clean up polling interval
    if ((gameInfo as any).logCheckInterval) {
      clearInterval((gameInfo as any).logCheckInterval);
    }
    // Clean up fs.watch file watcher
    if ((gameInfo as any).logFileWatcher) {
      try {
        (gameInfo as any).logFileWatcher.close();
      } catch {}
    }

    gameInfo.status = "stopped";
    this.onGameStatusChange?.(instanceId, gameInfo);
    
    // Remove from running games after notifying
    setTimeout(() => {
      this.runningGames.delete(instanceId);
    }, 1000);
  }

  /**
   * Kill a running game (and optionally the launcher)
   */
  async killGame(instanceId: string): Promise<boolean> {
    const gameInfo = this.runningGames.get(instanceId);
    if (!gameInfo) return false;

    try {
      const platform = process.platform;
      const { execSync } = await import("child_process");

      // Kill the Java game process if it exists
      if (gameInfo.gamePid) {
        try {
          if (platform === "win32") {
            execSync(`taskkill /F /PID ${gameInfo.gamePid}`, { encoding: "utf-8" });
          } else {
            process.kill(gameInfo.gamePid, "SIGKILL");
          }
          console.log(`[InstanceService] Killed game process ${gameInfo.gamePid}`);
        } catch (e) {
          console.warn(`[InstanceService] Failed to kill game PID ${gameInfo.gamePid}:`, e);
        }
      }

      // Kill the launcher process if it exists
      if (gameInfo.launcherPid) {
        try {
          if (platform === "win32") {
            // On Windows, also kill child processes of the launcher
            execSync(`taskkill /F /T /PID ${gameInfo.launcherPid}`, { encoding: "utf-8" });
          } else {
            process.kill(gameInfo.launcherPid, "SIGKILL");
          }
          console.log(`[InstanceService] Killed launcher process ${gameInfo.launcherPid}`);
        } catch (e) {
          console.warn(`[InstanceService] Failed to kill launcher PID ${gameInfo.launcherPid}:`, e);
        }
      }

      // Also try to kill any remaining java processes for this instance
      if (platform === "win32") {
        try {
          const result = execSync(
            `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name like '%java%'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"`,
            { encoding: "utf-8", timeout: 10000 }
          );
          
          const instance = this.instances.find(i => i.id === instanceId);
          if (instance) {
            let processes: any[] = [];
            try {
              const parsed = JSON.parse(result);
              processes = Array.isArray(parsed) ? parsed : [parsed];
            } catch {}
            
            for (const proc of processes) {
              if (!proc || !proc.CommandLine) continue;
              if (proc.CommandLine.includes(instance.path) || proc.CommandLine.includes(instance.path.replace(/\\/g, "/"))) {
                try {
                  execSync(`taskkill /F /PID ${proc.ProcessId}`);
                  console.log(`[InstanceService] Killed related java process ${proc.ProcessId}`);
                } catch {}
              }
            }
          }
        } catch {}
        
        // Also try to find and kill Minecraft Launcher processes that might be lingering
        try {
          const launcherResult = execSync(
            `powershell -Command "Get-Process -Name 'MinecraftLauncher','Minecraft Launcher' -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json"`,
            { encoding: "utf-8", timeout: 5000 }
          );
          
          if (launcherResult.trim()) {
            let launcherProcs: any[] = [];
            try {
              const parsed = JSON.parse(launcherResult);
              launcherProcs = Array.isArray(parsed) ? parsed : [parsed];
            } catch {}
            
            for (const proc of launcherProcs) {
              if (proc && proc.Id) {
                try {
                  execSync(`taskkill /F /T /PID ${proc.Id}`);
                  console.log(`[InstanceService] Killed Minecraft Launcher process ${proc.Id}`);
                } catch {}
              }
            }
          }
        } catch {}
      }

      this.stopGameTracking(instanceId);
      return true;
    } catch (error) {
      console.error("[InstanceService] Error killing game:", error);
      return false;
    }
  }
}

export default InstanceService;
