/**
 * MinecraftService - Minecraft Installation Detection and Management
 * 
 * Features:
 * - Auto-detect Minecraft installations (vanilla, Prism, MultiMC, CurseForge, etc.)
 * - Sync mods to .minecraft/mods folder
 * - Launch game with selected modpack
 * - Manage multiple instances
 */

import { app, shell } from "electron";
import path from "path";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import os from "os";

// ==================== TYPES ====================

export interface MinecraftInstallation {
  id: string;
  name: string;
  type: "vanilla" | "prism" | "multimc" | "curseforge" | "atlauncher" | "gdlauncher" | "modrinth" | "custom";
  path: string;
  modsPath: string;
  version?: string;
  loader?: string;
  lastUsed?: string;
  isDefault?: boolean;
  icon?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
  syncedMods: string[];
}

export interface LaunchResult {
  success: boolean;
  error?: string;
  process?: ChildProcess;
}

// ==================== SERVICE ====================

interface LauncherPaths {
  vanilla?: string;
  prism?: string;
  multimc?: string;
  curseforge?: string;
  modrinth?: string;
  atlauncher?: string;
  gdlauncher?: string;
}

export class MinecraftService {
  private installations: MinecraftInstallation[] = [];
  private configPath: string;
  private launcherPaths: LauncherPaths = {};
  private launcherPathsFile: string;

  constructor(basePath: string) {
    this.configPath = path.join(basePath, "minecraft-instances.json");
    this.launcherPathsFile = path.join(basePath, "launcher-paths.json");
    this.loadLauncherPaths();
  }

  private async loadLauncherPaths() {
    try {
      if (await fs.pathExists(this.launcherPathsFile)) {
        this.launcherPaths = await fs.readJson(this.launcherPathsFile);
      }
    } catch (error) {
      console.error("Failed to load launcher paths:", error);
    }
  }

  async setLauncherPath(type: keyof LauncherPaths, launcherPath: string): Promise<boolean> {
    try {
      if (await fs.pathExists(launcherPath)) {
        this.launcherPaths[type] = launcherPath;
        await fs.writeJson(this.launcherPathsFile, this.launcherPaths, { spaces: 2 });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to save launcher path:", error);
      return false;
    }
  }

  getLauncherPaths(): LauncherPaths {
    return { ...this.launcherPaths };
  }

  // ==================== DETECTION ====================

  /**
   * Auto-detect all Minecraft installations on the system
   */
  async detectInstallations(): Promise<MinecraftInstallation[]> {
    const detected: MinecraftInstallation[] = [];
    const platform = process.platform;

    // Get common paths based on platform
    const homedir = os.homedir();
    const appData = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");

    // Define search locations
    const locations: Array<{
      name: string;
      type: MinecraftInstallation["type"];
      paths: string[];
      modsSubpath: string;
      launcherPath?: string;
    }> = [];

    if (platform === "win32") {
      locations.push(
        // Vanilla Minecraft
        {
          name: "Minecraft (Vanilla)",
          type: "vanilla",
          paths: [path.join(appData, ".minecraft")],
          modsSubpath: "mods",
          launcherPath: path.join(localAppData, "Packages", "Microsoft.4297127D64EC6_8wekyb3d8bbwe", "LocalCache", "Local", "runtime")
        },
        // Prism Launcher
        {
          name: "Prism Launcher",
          type: "prism",
          paths: [
            path.join(appData, "PrismLauncher"),
            path.join(localAppData, "PrismLauncher"),
          ],
          modsSubpath: "instances"
        },
        // MultiMC
        {
          name: "MultiMC",
          type: "multimc",
          paths: [
            path.join(localAppData, "Programs", "MultiMC"),
            path.join(appData, "MultiMC"),
            "C:\\MultiMC",
          ],
          modsSubpath: "instances"
        },
        // CurseForge / Overwolf
        {
          name: "CurseForge",
          type: "curseforge",
          paths: [
            path.join(homedir, "curseforge", "minecraft"),
            path.join(appData, "curseforge", "minecraft"),
          ],
          modsSubpath: "Instances"
        },
        // ATLauncher
        {
          name: "ATLauncher",
          type: "atlauncher",
          paths: [
            path.join(appData, "ATLauncher"),
            path.join(localAppData, "ATLauncher"),
          ],
          modsSubpath: "instances"
        },
        // GDLauncher
        {
          name: "GDLauncher",
          type: "gdlauncher",
          paths: [
            path.join(appData, "gdlauncher_next"),
            path.join(localAppData, "gdlauncher_next"),
          ],
          modsSubpath: "instances"
        },
        // Modrinth App
        {
          name: "Modrinth App",
          type: "modrinth",
          paths: [
            path.join(appData, "ModrinthApp"),
            path.join(localAppData, "ModrinthApp"),
          ],
          modsSubpath: "profiles"
        }
      );
    } else if (platform === "darwin") {
      // macOS paths
      const appSupport = path.join(homedir, "Library", "Application Support");
      locations.push(
        {
          name: "Minecraft (Vanilla)",
          type: "vanilla",
          paths: [path.join(appSupport, "minecraft")],
          modsSubpath: "mods"
        },
        {
          name: "Prism Launcher",
          type: "prism",
          paths: [path.join(appSupport, "PrismLauncher")],
          modsSubpath: "instances"
        },
        {
          name: "MultiMC",
          type: "multimc",
          paths: [path.join(appSupport, "MultiMC")],
          modsSubpath: "instances"
        },
        {
          name: "CurseForge",
          type: "curseforge",
          paths: [path.join(homedir, "curseforge", "minecraft")],
          modsSubpath: "Instances"
        }
      );
    } else {
      // Linux paths
      locations.push(
        {
          name: "Minecraft (Vanilla)",
          type: "vanilla",
          paths: [path.join(homedir, ".minecraft")],
          modsSubpath: "mods"
        },
        {
          name: "Prism Launcher",
          type: "prism",
          paths: [
            path.join(homedir, ".local", "share", "PrismLauncher"),
            path.join(homedir, ".var", "app", "org.prismlauncher.PrismLauncher", "data", "PrismLauncher")
          ],
          modsSubpath: "instances"
        },
        {
          name: "MultiMC",
          type: "multimc",
          paths: [path.join(homedir, ".local", "share", "multimc")],
          modsSubpath: "instances"
        },
        {
          name: "GDLauncher",
          type: "gdlauncher",
          paths: [path.join(homedir, ".config", "gdlauncher_next")],
          modsSubpath: "instances"
        }
      );
    }

    // Check each location
    for (const loc of locations) {
      for (const searchPath of loc.paths) {
        if (await fs.pathExists(searchPath)) {
          const modsPath = loc.type === "vanilla" 
            ? path.join(searchPath, loc.modsSubpath)
            : searchPath; // For launchers, we'll handle instances differently

          if (loc.type === "vanilla") {
            detected.push({
              id: `vanilla-${Date.now()}`,
              name: loc.name,
              type: loc.type,
              path: searchPath,
              modsPath: modsPath,
              icon: "🎮"
            });
          } else {
            // For multi-instance launchers, detect individual instances
            const instances = await this.detectLauncherInstances(searchPath, loc.type, loc.modsSubpath);
            detected.push(...instances);
          }
          break; // Found one valid path, move to next launcher
        }
      }
    }

    // Load saved installations and merge
    const saved = await this.loadSavedInstallations();
    
    // Add any custom installations that weren't detected
    for (const savedInst of saved) {
      if (savedInst.type === "custom" || !detected.find(d => d.path === savedInst.path)) {
        detected.push(savedInst);
      }
    }

    this.installations = detected;
    return detected;
  }

  /**
   * Detect instances within a multi-instance launcher
   */
  private async detectLauncherInstances(
    launcherPath: string,
    type: MinecraftInstallation["type"],
    instancesSubpath: string
  ): Promise<MinecraftInstallation[]> {
    const instances: MinecraftInstallation[] = [];
    const instancesPath = path.join(launcherPath, instancesSubpath);

    if (!await fs.pathExists(instancesPath)) {
      return instances;
    }

    try {
      const dirs = await fs.readdir(instancesPath);
      
      for (const dir of dirs) {
        const instancePath = path.join(instancesPath, dir);
        const stat = await fs.stat(instancePath);
        
        if (!stat.isDirectory()) continue;

        // Check for mods folder
        let modsPath = path.join(instancePath, "mods");
        
        // Prism/MultiMC have a different structure
        if (type === "prism" || type === "multimc") {
          const dotMinecraft = path.join(instancePath, ".minecraft", "mods");
          const minecraft = path.join(instancePath, "minecraft", "mods");
          if (await fs.pathExists(dotMinecraft)) {
            modsPath = dotMinecraft;
          } else if (await fs.pathExists(minecraft)) {
            modsPath = minecraft;
          }
        }

        // Try to read instance config for more info
        let instanceName = dir;
        let loader: string | undefined;
        let version: string | undefined;

        // Try to read instance config
        const configFiles = [
          path.join(instancePath, "instance.cfg"),
          path.join(instancePath, "instance.json"),
          path.join(instancePath, "mmc-pack.json"),
          path.join(instancePath, "minecraftinstance.json"),
        ];

        for (const configFile of configFiles) {
          if (await fs.pathExists(configFile)) {
            try {
              const content = await fs.readFile(configFile, "utf-8");
              if (configFile.endsWith(".json")) {
                const config = JSON.parse(content);
                instanceName = config.name || config.instanceName || dir;
                version = config.gameVersion || config.baseVersion || config.mcVersion;
                loader = config.modLoader || config.loader;
              } else {
                // Parse cfg file
                const lines = content.split("\n");
                for (const line of lines) {
                  if (line.startsWith("name=")) instanceName = line.split("=")[1].trim();
                  if (line.startsWith("IntendedVersion=")) version = line.split("=")[1].trim();
                }
              }
            } catch {
              // Ignore parse errors
            }
            break;
          }
        }

        instances.push({
          id: `${type}-${dir}-${Date.now()}`,
          name: `${instanceName} (${this.getLauncherDisplayName(type)})`,
          type,
          path: instancePath,
          modsPath,
          version,
          loader,
          icon: this.getLauncherIcon(type)
        });
      }
    } catch (error) {
      console.error(`Error scanning ${type} instances:`, error);
    }

    return instances;
  }

  private getLauncherDisplayName(type: MinecraftInstallation["type"]): string {
    const names: Record<string, string> = {
      vanilla: "Vanilla",
      prism: "Prism",
      multimc: "MultiMC",
      curseforge: "CurseForge",
      atlauncher: "ATLauncher",
      gdlauncher: "GDLauncher",
      modrinth: "Modrinth",
      custom: "Custom"
    };
    return names[type] || type;
  }

  private getLauncherIcon(type: MinecraftInstallation["type"]): string {
    const icons: Record<string, string> = {
      vanilla: "🎮",
      prism: "🔷",
      multimc: "📦",
      curseforge: "🔥",
      atlauncher: "🚀",
      gdlauncher: "⚡",
      modrinth: "🟢",
      custom: "📁"
    };
    return icons[type] || "📁";
  }

  // ==================== PERSISTENCE ====================

  private async loadSavedInstallations(): Promise<MinecraftInstallation[]> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const data = await fs.readJson(this.configPath);
        return data.installations || [];
      }
    } catch (error) {
      console.error("Error loading saved installations:", error);
    }
    return [];
  }

  async saveInstallations(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeJson(this.configPath, { installations: this.installations }, { spaces: 2 });
    } catch (error) {
      console.error("Error saving installations:", error);
    }
  }

  async addCustomInstallation(
    name: string,
    mcPath: string,
    modsPath?: string
  ): Promise<MinecraftInstallation> {
    const installation: MinecraftInstallation = {
      id: `custom-${Date.now()}`,
      name,
      type: "custom",
      path: mcPath,
      modsPath: modsPath || path.join(mcPath, "mods"),
      icon: "📁"
    };
    
    this.installations.push(installation);
    await this.saveInstallations();
    return installation;
  }

  async removeInstallation(id: string): Promise<boolean> {
    const index = this.installations.findIndex(i => i.id === id);
    if (index === -1) return false;
    
    this.installations.splice(index, 1);
    await this.saveInstallations();
    return true;
  }

  async setDefaultInstallation(id: string): Promise<boolean> {
    const installation = this.installations.find(i => i.id === id);
    if (!installation) return false;

    // Clear other defaults
    this.installations.forEach(i => i.isDefault = false);
    installation.isDefault = true;
    
    await this.saveInstallations();
    return true;
  }

  getInstallations(): MinecraftInstallation[] {
    return this.installations;
  }

  getDefaultInstallation(): MinecraftInstallation | undefined {
    return this.installations.find(i => i.isDefault) || this.installations[0];
  }

  // ==================== SYNC ====================

  /**
   * Sync modpack mods to a Minecraft installation's mods folder
   */
  async syncModpack(
    installationId: string,
    mods: Array<{ id: string; name: string; filename: string; downloadUrl?: string }>,
    options: {
      clearExisting?: boolean;
      createBackup?: boolean;
      onProgress?: (current: number, total: number, modName: string) => void;
    } = {}
  ): Promise<SyncResult> {
    const installation = this.installations.find(i => i.id === installationId);
    if (!installation) {
      return { success: false, synced: 0, skipped: 0, errors: ["Installation not found"], syncedMods: [] };
    }

    const modsPath = installation.modsPath;
    const errors: string[] = [];
    const syncedMods: string[] = [];
    let synced = 0;
    let skipped = 0;

    try {
      // Ensure mods folder exists
      await fs.ensureDir(modsPath);

      // Create backup if requested
      if (options.createBackup) {
        const backupPath = path.join(path.dirname(modsPath), `mods_backup_${Date.now()}`);
        if (await fs.pathExists(modsPath)) {
          await fs.copy(modsPath, backupPath);
        }
      }

      // Clear existing mods if requested
      if (options.clearExisting) {
        const existingFiles = await fs.readdir(modsPath);
        for (const file of existingFiles) {
          if (file.endsWith(".jar") || file.endsWith(".jar.disabled")) {
            await fs.remove(path.join(modsPath, file));
          }
        }
      }

      // Download and copy mods to the mods folder
      const total = mods.length;
      for (let i = 0; i < mods.length; i++) {
        const mod = mods[i];
        
        if (options.onProgress) {
          options.onProgress(i + 1, total, mod.name);
        }

        try {
          const destPath = path.join(modsPath, mod.filename);
          
          // Skip if already exists
          if (await fs.pathExists(destPath)) {
            synced++;
            syncedMods.push(mod.name);
            continue;
          }

          // Download the mod if we have a URL
          if (mod.downloadUrl) {
            const response = await fetch(mod.downloadUrl);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(destPath, buffer);
            synced++;
            syncedMods.push(mod.name);
          } else {
            // No download URL available
            skipped++;
            errors.push(`No download URL for ${mod.name}`);
          }
        } catch (error: any) {
          skipped++;
          errors.push(`Failed to download ${mod.name}: ${error.message}`);
        }
      }

      // Update last used
      installation.lastUsed = new Date().toISOString();
      await this.saveInstallations();

      return { success: true, synced, skipped, errors, syncedMods };
    } catch (error: any) {
      return { 
        success: false, 
        synced, 
        skipped, 
        errors: [...errors, error.message],
        syncedMods 
      };
    }
  }

  // ==================== LAUNCH ====================

  /**
   * Open the mods folder in file explorer
   */
  async openModsFolder(installationId: string): Promise<boolean> {
    const installation = this.installations.find(i => i.id === installationId);
    if (!installation) return false;

    try {
      await fs.ensureDir(installation.modsPath);
      await shell.openPath(installation.modsPath);
      return true;
    } catch (error) {
      console.error("Error opening mods folder:", error);
      return false;
    }
  }

  /**
   * Open the Minecraft launcher
   */
  async launchMinecraft(installationId?: string): Promise<LaunchResult> {
    const installation = installationId 
      ? this.installations.find(i => i.id === installationId)
      : this.getDefaultInstallation();

    if (!installation) {
      return { success: false, error: "No installation found" };
    }

    const platform = process.platform;
    let launcherPath: string | null = null;
    let args: string[] = [];

    try {
      // First check for custom launcher path
      const customPath = this.launcherPaths[installation.type as keyof LauncherPaths];
      if (customPath && await fs.pathExists(customPath)) {
        launcherPath = customPath;
      } else {
        // Fall back to default detection
        switch (installation.type) {
          case "vanilla":
            if (platform === "win32") {
              // Check multiple possible locations for vanilla launcher
            const possiblePaths = [
              // Xbox Game Pass / Custom location
              "C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
              // Microsoft Store version
              path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "Minecraft.exe"),
              // New launcher location
              path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Minecraft Launcher", "MinecraftLauncher.exe"),
              // Old launcher location
              path.join(process.env.PROGRAMFILES || "C:\\Program Files (x86)", "Minecraft Launcher", "MinecraftLauncher.exe"),
              // User-installed location
              path.join(process.env.LOCALAPPDATA || "", "Programs", "Minecraft Launcher", "MinecraftLauncher.exe"),
              // Xbox Games folder variations
              "D:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
              "E:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
            ];
            
            for (const p of possiblePaths) {
              if (await fs.pathExists(p)) {
                launcherPath = p;
                break;
              }
            }
          } else if (platform === "darwin") {
            launcherPath = "/Applications/Minecraft.app";
          } else {
            launcherPath = "/usr/bin/minecraft-launcher";
          }
          break;

        case "prism":
          if (platform === "win32") {
            const possiblePaths = [
              path.join(process.env.LOCALAPPDATA || "", "Programs", "PrismLauncher", "prismlauncher.exe"),
              path.join(process.env.PROGRAMFILES || "", "PrismLauncher", "prismlauncher.exe"),
              "C:\\PrismLauncher\\prismlauncher.exe",
            ];
            for (const p of possiblePaths) {
              if (await fs.pathExists(p)) {
                launcherPath = p;
                break;
              }
            }
          } else if (platform === "darwin") {
            launcherPath = "/Applications/Prism Launcher.app";
          } else {
            launcherPath = "prismlauncher";
          }
          // Launch specific instance if we have the path
          if (installation.path && launcherPath) {
            const instanceName = path.basename(installation.path);
            args = ["--launch", instanceName];
          }
          break;

        case "multimc":
          if (platform === "win32") {
            // Try to find MultiMC.exe relative to the instance path
            const mmcPath = path.join(installation.path, "..", "..", "MultiMC.exe");
            if (await fs.pathExists(mmcPath)) {
              launcherPath = mmcPath;
            }
          }
          break;

        case "curseforge":
          if (platform === "win32") {
            const possiblePaths = [
              // CurseForge App standalone (new)
              path.join(process.env.LOCALAPPDATA || "", "Programs", "CurseForge", "CurseForge.exe"),
              path.join(process.env.PROGRAMFILES || "", "CurseForge", "CurseForge.exe"),
              // Overwolf-based (legacy)
              path.join(process.env.PROGRAMFILES || "", "Overwolf", "OverwolfLauncher.exe"),
              path.join(process.env["PROGRAMFILES(X86)"] || "", "Overwolf", "OverwolfLauncher.exe"),
              path.join(process.env.LOCALAPPDATA || "", "Overwolf", "OverwolfLauncher.exe"),
            ];
            for (const p of possiblePaths) {
              if (await fs.pathExists(p)) {
                launcherPath = p;
                // Different args for different launchers
                if (p.includes("Overwolf")) {
                  args = ["-launchapp", "curse://launch"];
                }
                break;
              }
            }
          }
          break;

        case "modrinth":
          if (platform === "win32") {
            const possiblePaths = [
              path.join(process.env.LOCALAPPDATA || "", "Programs", "Modrinth App", "Modrinth App.exe"),
              path.join(process.env.LOCALAPPDATA || "", "ModrinthApp", "Modrinth App.exe"),
            ];
            for (const p of possiblePaths) {
              if (await fs.pathExists(p)) {
                launcherPath = p;
                break;
              }
            }
          } else if (platform === "darwin") {
            launcherPath = "/Applications/Modrinth App.app";
          }
          break;

        default:
          // For custom/unknown installations, try to open the folder
          break;
        }
      } // End of else block for custom path check

      if (launcherPath && await fs.pathExists(launcherPath)) {
        console.log(`[MinecraftService] Launching: ${launcherPath} ${args.join(" ")}`);
        if (platform === "darwin" && launcherPath.endsWith(".app")) {
          spawn("open", [launcherPath, ...args], { detached: true, stdio: "ignore" });
        } else {
          spawn(launcherPath, args, { detached: true, stdio: "ignore" });
        }
        return { success: true };
      } else {
        // Fallback: open the installation folder and return informative error
        await shell.openPath(installation.path);
        return { 
          success: false, 
          error: `Launcher not found for ${installation.type}. Opened installation folder instead.`
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export default MinecraftService;
