/**
 * GameService - Multi-Game Support
 * 
 * Provides unified game detection, configuration, and launch capabilities
 * for Minecraft and Hytale (and future games).
 */

import { app, shell } from "electron";
import path from "path";
import fs from "fs-extra";
import { spawn, ChildProcess } from "child_process";
import os from "os";

// ==================== GAME TYPES ====================

/** Supported game types */
export type GameType = "minecraft" | "hytale";

/** Game profile configuration */
export interface GameProfile {
  /** Unique profile ID */
  id: string;
  
  /** Game type */
  gameType: GameType;
  
  /** Display name */
  name: string;
  
  /** Profile description */
  description?: string;
  
  /** Profile icon (emoji or path) */
  icon?: string;
  
  /** Whether this is the default profile for this game type */
  isDefault?: boolean;
  
  /** Game installation path */
  gamePath?: string;
  
  /** Launcher executable path */
  launcherPath?: string;
  
  /** Mods directory */
  modsPath: string;
  
  /** Creation timestamp */
  createdAt: string;
  
  /** Last used timestamp */
  lastUsed?: string;
}

/** Game-specific configuration */
export interface GameConfig {
  /** CurseForge Game ID */
  cfGameId: number;
  
  /** CurseForge Mods Class ID */
  cfModsClassId: number;
  
  /** Whether the game uses separate instances (like Minecraft) */
  usesInstances: boolean;
  
  /** Whether the game has mod loaders */
  hasModLoaders: boolean;
  
  /** Available mod loaders (empty for games without mod loaders) */
  modLoaders: string[];
  
  /** Whether the game supports resource packs */
  supportsResourcePacks: boolean;
  
  /** Whether the game supports shaders */
  supportsShaders: boolean;
  
  /** Default launcher path (for detection) */
  defaultLauncherPaths: string[];
  
  /** Default game data path */
  defaultGameDataPath: string;
  
  /** Default mods folder relative to game data */
  defaultModsFolder: string;
  
  /** Display name */
  displayName: string;
  
  /** Game icon (emoji) */
  icon: string;
}

/** Running game info */
export interface RunningGameInfo {
  profileId: string;
  gameType: GameType;
  launcherPid?: number;
  gamePid?: number;
  startTime: number;
  status: "launching" | "running" | "stopped";
}

// ==================== GAME CONFIGURATIONS ====================

export const GAME_CONFIGS: Record<GameType, GameConfig> = {
  minecraft: {
    cfGameId: 432,
    cfModsClassId: 6,
    usesInstances: true,
    hasModLoaders: true,
    modLoaders: ["forge", "fabric", "neoforge", "quilt"],
    supportsResourcePacks: true,
    supportsShaders: true,
    defaultLauncherPaths: [
      "C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe",
      "C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe",
    ],
    defaultGameDataPath: path.join(os.homedir(), "AppData", "Roaming", ".minecraft"),
    defaultModsFolder: "mods",
    displayName: "Minecraft",
    icon: "⛏️",
  },
  hytale: {
    cfGameId: 70216, // Correct Hytale game ID
    cfModsClassId: 6, // Hytale mods class ID - may need adjustment
    usesInstances: false,
    hasModLoaders: false,
    modLoaders: [],
    supportsResourcePacks: false, // Not yet available
    supportsShaders: false, // Not yet available
    defaultLauncherPaths: [
      "C:\\Program Files\\Hypixel Studios\\Hytale Launcher\\hytale-launcher.exe",
    ],
    defaultGameDataPath: path.join(os.homedir(), "AppData", "Roaming", "Hytale"),
    defaultModsFolder: "UserData\\Mods",
    displayName: "Hytale",
    icon: "🎮",
  },
};

// ==================== SERVICE CLASS ====================

export class GameService {
  private profiles: GameProfile[] = [];
  private profilesPath: string;
  private configPath: string;
  private activeGameType: GameType = "minecraft";
  private runningGames: Map<string, RunningGameInfo> = new Map();
  
  /** Callback for game status updates */
  private onGameStatusChange?: (profileId: string, info: RunningGameInfo) => void;

  constructor(basePath: string) {
    this.profilesPath = path.join(basePath, "game-profiles.json");
    this.configPath = path.join(basePath, "game-config.json");
  }

  async initialize(): Promise<void> {
    await this.loadProfiles();
    await this.loadConfig();
    
    // Create default profiles if none exist
    if (this.profiles.length === 0) {
      await this.createDefaultProfiles();
    }
  }

  // ==================== CONFIG MANAGEMENT ====================

  private async loadConfig(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const config = await fs.readJson(this.configPath);
        this.activeGameType = config.activeGameType || "minecraft";
      }
    } catch (error) {
      console.error("[GameService] Error loading config:", error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await fs.writeJson(this.configPath, {
        activeGameType: this.activeGameType,
      }, { spaces: 2 });
    } catch (error) {
      console.error("[GameService] Error saving config:", error);
    }
  }

  // ==================== PROFILE MANAGEMENT ====================

  private async loadProfiles(): Promise<void> {
    try {
      if (await fs.pathExists(this.profilesPath)) {
        this.profiles = await fs.readJson(this.profilesPath);
      }
    } catch (error) {
      console.error("[GameService] Error loading profiles:", error);
      this.profiles = [];
    }
  }

  private async saveProfiles(): Promise<void> {
    try {
      await fs.writeJson(this.profilesPath, this.profiles, { spaces: 2 });
    } catch (error) {
      console.error("[GameService] Error saving profiles:", error);
    }
  }

  private async createDefaultProfiles(): Promise<void> {
    // Create default Minecraft profile
    const minecraftProfile: GameProfile = {
      id: "minecraft-default",
      gameType: "minecraft",
      name: "Minecraft",
      description: "Default Minecraft profile",
      icon: "⛏️",
      isDefault: true,
      modsPath: path.join(GAME_CONFIGS.minecraft.defaultGameDataPath, GAME_CONFIGS.minecraft.defaultModsFolder),
      createdAt: new Date().toISOString(),
    };

    // Create default Hytale profile
    const hytaleProfile: GameProfile = {
      id: "hytale-default",
      gameType: "hytale",
      name: "Hytale",
      description: "Default Hytale profile",
      icon: "🎮",
      isDefault: true,
      launcherPath: GAME_CONFIGS.hytale.defaultLauncherPaths[0],
      modsPath: path.join(GAME_CONFIGS.hytale.defaultGameDataPath, GAME_CONFIGS.hytale.defaultModsFolder),
      createdAt: new Date().toISOString(),
    };

    this.profiles = [minecraftProfile, hytaleProfile];
    await this.saveProfiles();
    
    console.log("[GameService] Created default profiles");
  }

  // ==================== PUBLIC API ====================

  /** Get all profiles */
  getProfiles(): GameProfile[] {
    return [...this.profiles];
  }

  /** Get profiles for a specific game type */
  getProfilesByGameType(gameType: GameType): GameProfile[] {
    return this.profiles.filter(p => p.gameType === gameType);
  }

  /** Get a specific profile */
  getProfile(id: string): GameProfile | null {
    return this.profiles.find(p => p.id === id) || null;
  }

  /** Get the default profile for a game type */
  getDefaultProfile(gameType: GameType): GameProfile | null {
    return this.profiles.find(p => p.gameType === gameType && p.isDefault) || 
           this.profiles.find(p => p.gameType === gameType) || null;
  }

  /** Get game configuration for a game type */
  getGameConfig(gameType: GameType): GameConfig {
    return GAME_CONFIGS[gameType];
  }

  /** Get the currently active game type */
  getActiveGameType(): GameType {
    return this.activeGameType;
  }

  /** Set the active game type */
  async setActiveGameType(gameType: GameType): Promise<void> {
    this.activeGameType = gameType;
    await this.saveConfig();
  }

  /** Create a new profile */
  async createProfile(options: {
    gameType: GameType;
    name: string;
    description?: string;
    icon?: string;
    launcherPath?: string;
    modsPath?: string;
  }): Promise<GameProfile> {
    const gameConfig = GAME_CONFIGS[options.gameType];
    
    const profile: GameProfile = {
      id: `${options.gameType}-${Date.now()}`,
      gameType: options.gameType,
      name: options.name,
      description: options.description,
      icon: options.icon || gameConfig.icon,
      isDefault: this.getProfilesByGameType(options.gameType).length === 0,
      launcherPath: options.launcherPath,
      modsPath: options.modsPath || path.join(gameConfig.defaultGameDataPath, gameConfig.defaultModsFolder),
      createdAt: new Date().toISOString(),
    };

    this.profiles.push(profile);
    await this.saveProfiles();
    
    return profile;
  }

  /** Update a profile */
  async updateProfile(id: string, updates: Partial<Omit<GameProfile, "id" | "gameType" | "createdAt">>): Promise<GameProfile | null> {
    const index = this.profiles.findIndex(p => p.id === id);
    if (index === -1) return null;

    this.profiles[index] = {
      ...this.profiles[index],
      ...updates,
    };

    await this.saveProfiles();
    return this.profiles[index];
  }

  /** Delete a profile */
  async deleteProfile(id: string): Promise<boolean> {
    const index = this.profiles.findIndex(p => p.id === id);
    if (index === -1) return false;

    // Don't delete if it's the last profile for this game type
    const profile = this.profiles[index];
    const sameTypeProfiles = this.getProfilesByGameType(profile.gameType);
    if (sameTypeProfiles.length <= 1) {
      console.warn("[GameService] Cannot delete last profile for game type:", profile.gameType);
      return false;
    }

    this.profiles.splice(index, 1);

    // If we deleted the default, make another one default
    if (profile.isDefault) {
      const remaining = this.profiles.find(p => p.gameType === profile.gameType);
      if (remaining) {
        remaining.isDefault = true;
      }
    }

    await this.saveProfiles();
    return true;
  }

  /** Set a profile as default */
  async setDefaultProfile(id: string): Promise<boolean> {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return false;

    // Remove default from other profiles of same type
    this.profiles.forEach(p => {
      if (p.gameType === profile.gameType) {
        p.isDefault = p.id === id;
      }
    });

    await this.saveProfiles();
    return true;
  }

  // ==================== GAME DETECTION ====================

  /** Detect if a game is installed */
  async detectGame(gameType: GameType): Promise<{ installed: boolean; launcherPath?: string; modsPath?: string }> {
    const config = GAME_CONFIGS[gameType];
    
    // Check for launcher
    for (const launcherPath of config.defaultLauncherPaths) {
      if (await fs.pathExists(launcherPath)) {
        const modsPath = path.join(config.defaultGameDataPath, config.defaultModsFolder);
        return {
          installed: true,
          launcherPath,
          modsPath: await fs.pathExists(modsPath) ? modsPath : undefined,
        };
      }
    }

    // Check if game data folder exists (game might be installed elsewhere)
    const modsPath = path.join(config.defaultGameDataPath, config.defaultModsFolder);
    if (await fs.pathExists(config.defaultGameDataPath)) {
      return {
        installed: true,
        modsPath: await fs.pathExists(modsPath) ? modsPath : undefined,
      };
    }

    return { installed: false };
  }

  /** Detect all installed games */
  async detectAllGames(): Promise<Record<GameType, { installed: boolean; launcherPath?: string; modsPath?: string }>> {
    const results: Record<GameType, { installed: boolean; launcherPath?: string; modsPath?: string }> = {
      minecraft: await this.detectGame("minecraft"),
      hytale: await this.detectGame("hytale"),
    };
    return results;
  }

  // ==================== GAME LAUNCHING ====================

  /** Launch a game with a specific profile */
  async launchGame(profileId: string): Promise<{ success: boolean; error?: string }> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const launcherPath = profile.launcherPath || GAME_CONFIGS[profile.gameType].defaultLauncherPaths[0];
    
    if (!launcherPath || !(await fs.pathExists(launcherPath))) {
      return { success: false, error: "Launcher not found. Please configure the launcher path." };
    }

    try {
      console.log(`[GameService] Launching ${profile.gameType} from:`, launcherPath);
      
      // For Hytale, just launch the launcher directly - no special args needed
      const child = spawn(launcherPath, [], {
        detached: true,
        stdio: "ignore",
        cwd: path.dirname(launcherPath),
      });

      child.unref();

      const gameInfo: RunningGameInfo = {
        profileId,
        gameType: profile.gameType,
        launcherPid: child.pid,
        startTime: Date.now(),
        status: "launching",
      };

      this.runningGames.set(profileId, gameInfo);
      this.onGameStatusChange?.(profileId, gameInfo);

      // Update last used
      await this.updateProfile(profileId, { lastUsed: new Date().toISOString() });

      return { success: true };
    } catch (error: any) {
      console.error("[GameService] Launch error:", error);
      return { success: false, error: error.message };
    }
  }

  /** Get running game info */
  getRunningGame(profileId: string): RunningGameInfo | null {
    return this.runningGames.get(profileId) || null;
  }

  /** Get all running games */
  getAllRunningGames(): Map<string, RunningGameInfo> {
    return new Map(this.runningGames);
  }

  /** Set callback for game status changes */
  setOnGameStatusChange(callback: (profileId: string, info: RunningGameInfo) => void): void {
    this.onGameStatusChange = callback;
  }

  // ==================== MOD PATH MANAGEMENT ====================

  /** Get mods path for a profile */
  getModsPath(profileId: string): string | null {
    const profile = this.getProfile(profileId);
    return profile?.modsPath || null;
  }

  /** Ensure mods directory exists for a profile */
  async ensureModsDirectory(profileId: string): Promise<boolean> {
    const modsPath = this.getModsPath(profileId);
    if (!modsPath) return false;

    try {
      await fs.ensureDir(modsPath);
      return true;
    } catch (error) {
      console.error("[GameService] Error creating mods directory:", error);
      return false;
    }
  }

  /** List mods in a profile's mods directory */
  async listMods(profileId: string): Promise<string[]> {
    const modsPath = this.getModsPath(profileId);
    if (!modsPath || !(await fs.pathExists(modsPath))) return [];

    try {
      const files = await fs.readdir(modsPath);
      // Filter to only mod files (common extensions)
      return files.filter(f => 
        f.endsWith(".jar") || 
        f.endsWith(".zip") || 
        f.endsWith(".hmod") // Hytale mod extension if applicable
      );
    } catch (error) {
      console.error("[GameService] Error listing mods:", error);
      return [];
    }
  }

  /** Open mods folder in file explorer */
  async openModsFolder(profileId: string): Promise<boolean> {
    const modsPath = this.getModsPath(profileId);
    if (!modsPath) return false;

    try {
      await fs.ensureDir(modsPath);
      shell.openPath(modsPath);
      return true;
    } catch (error) {
      console.error("[GameService] Error opening mods folder:", error);
      return false;
    }
  }
}

export default GameService;
