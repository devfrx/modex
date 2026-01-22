/**
 * Game Profiles IPC Handlers
 * Multi-game profile management (Minecraft, Hytale)
 */

import { ipcMain } from "electron";
import type { GameService, GameType, GameProfile } from "../services/GameService.js";
import type { CurseForgeService } from "../services/CurseForgeService.js";

export interface GameIpcDeps {
  gameService: GameService;
  curseforgeService: CurseForgeService;
}

export function registerGameHandlers(deps: GameIpcDeps): void {
  const { gameService, curseforgeService } = deps;

  // Get all profiles
  ipcMain.handle("game:getProfiles", async () => {
    return gameService.getProfiles();
  });

  // Get profiles by game type
  ipcMain.handle("game:getProfilesByGameType", async (_, gameType: GameType) => {
    return gameService.getProfilesByGameType(gameType);
  });

  // Get a specific profile
  ipcMain.handle("game:getProfile", async (_, id: string) => {
    return gameService.getProfile(id);
  });

  // Get default profile for game type
  ipcMain.handle("game:getDefaultProfile", async (_, gameType: GameType) => {
    return gameService.getDefaultProfile(gameType);
  });

  // Get game config
  ipcMain.handle("game:getGameConfig", async (_, gameType: GameType) => {
    return gameService.getGameConfig(gameType);
  });

  // Get active game type
  ipcMain.handle("game:getActiveGameType", async () => {
    return gameService.getActiveGameType();
  });

  // Set active game type
  ipcMain.handle("game:setActiveGameType", async (_, gameType: GameType) => {
    await gameService.setActiveGameType(gameType);
    // Also update CurseForge service to use the new game type
    curseforgeService.setActiveGameType(gameType);
  });

  // Create a new profile
  ipcMain.handle("game:createProfile", async (_, options: {
    gameType: GameType;
    name: string;
    description?: string;
    icon?: string;
    launcherPath?: string;
    modsPath?: string;
  }) => {
    return gameService.createProfile(options);
  });

  // Update a profile
  ipcMain.handle("game:updateProfile", async (_, id: string, updates: Partial<GameProfile>) => {
    return gameService.updateProfile(id, updates);
  });

  // Delete a profile
  ipcMain.handle("game:deleteProfile", async (_, id: string) => {
    return gameService.deleteProfile(id);
  });

  // Set default profile
  ipcMain.handle("game:setDefaultProfile", async (_, id: string) => {
    return gameService.setDefaultProfile(id);
  });

  // Detect game installation
  ipcMain.handle("game:detectGame", async (_, gameType: GameType) => {
    return gameService.detectGame(gameType);
  });

  // Detect all games
  ipcMain.handle("game:detectAllGames", async () => {
    return gameService.detectAllGames();
  });

  // Launch game
  ipcMain.handle("game:launchGame", async (_, profileId: string) => {
    return gameService.launchGame(profileId);
  });

  // Open mods folder
  ipcMain.handle("game:openModsFolder", async (_, profileId: string) => {
    return gameService.openModsFolder(profileId);
  });
}
