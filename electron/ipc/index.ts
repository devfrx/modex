/**
 * IPC Handlers Index
 *
 * Barrel file that exports all IPC handler registration functions.
 * This centralizes the IPC handler setup and makes main.ts cleaner.
 *
 * @module electron/ipc
 */

import { BrowserWindow } from "electron";
import type { MetadataManager } from "../services/MetadataManager";
import type { ImageCacheService } from "../services/ImageCacheService";
import type { GistService } from "../services/GistService";
import type { MinecraftService } from "../services/MinecraftService";
import type { GameService } from "../services/GameService";
import type { CurseForgeService } from "../services/CurseForgeService";
import type { HytaleService } from "../services/HytaleService";
import type { DownloadService } from "../services/DownloadService";
import type { ModAnalyzerService } from "../services/ModAnalyzerService";
import type { ConfigService } from "../services/ConfigService";
import type { InstanceService } from "../services/InstanceService";
import type { ModpackAnalyzerService } from "../services/ModpackAnalyzerService";

// Import all handler registrations
import { registerModsHandlers, ModsIpcDeps } from "./mods.ipc";
import { registerCacheHandlers, CacheIpcDeps } from "./cache.ipc";
import { registerDialogsHandlers, DialogsIpcDeps } from "./dialogs.ipc";
import { registerSettingsHandlers, SettingsIpcDeps } from "./settings.ipc";
import { registerGistHandlers, GistIpcDeps } from "./gist.ipc";
import { registerMinecraftHandlers, MinecraftIpcDeps } from "./minecraft.ipc";
import { registerGameHandlers, GameIpcDeps } from "./game.ipc";
import { registerHytaleHandlers, HytaleIpcDeps } from "./hytale.ipc";
import { registerCurseForgeHandlers, CurseForgeIpcDeps } from "./curseforge.ipc";
import { registerAnalyzerHandlers, AnalyzerIpcDeps } from "./analyzer.ipc";
import { registerLoggingHandlers, LoggingIpcDeps } from "./logging.ipc";
import { registerSystemHandlers, SystemIpcDeps } from "./system.ipc";
import { registerConfigHandlers, ConfigIpcDeps } from "./config.ipc";
import { registerVersionsHandlers, VersionsIpcDeps } from "./versions.ipc";
import { registerRemoteHandlers, RemoteIpcDeps } from "./remote.ipc";
import { registerExportHandlers, ExportIpcDeps } from "./export.ipc";
import { registerPreviewHandlers, PreviewIpcDeps } from "./preview.ipc";
import { registerImportHandlers, ImportIpcDeps } from "./import.ipc";
import { registerUpdatesHandlers, UpdatesIpcDeps } from "./updates.ipc";
import { registerInstanceHandlers, InstanceIpcDeps } from "./instance.ipc";
import { registerModpacksHandlers, ModpacksIpcDeps } from "./modpacks.ipc";

// ==================== COMBINED DEPENDENCIES ====================

export interface AllIpcDeps extends
  ModsIpcDeps,
  CacheIpcDeps,
  SettingsIpcDeps,
  GistIpcDeps,
  MinecraftIpcDeps,
  GameIpcDeps,
  CurseForgeIpcDeps,
  AnalyzerIpcDeps,
  ConfigIpcDeps,
  Omit<VersionsIpcDeps, 'getWindow' | 'log'>,
  Omit<RemoteIpcDeps, 'getWindow' | 'log'>,
  Omit<ExportIpcDeps, 'getWindow' | 'log'>,
  Omit<PreviewIpcDeps, 'getWindow'>,
  Omit<ImportIpcDeps, 'getWindow' | 'log' | 'getDownloadService'>,
  Omit<UpdatesIpcDeps, 'getWindow' | 'log' | 'getDownloadService' | 'VITE_DEV_SERVER_URL'>,
  Omit<InstanceIpcDeps, 'getWindow' | 'log'>,
  Omit<ModpacksIpcDeps, 'getWindow' | 'log' | 'getDownloadService'> {
  // Hytale deps
  hytaleService: HytaleService;
  getDownloadService: () => DownloadService;
  // Common dependencies
  getWindow: () => BrowserWindow | null;
  getMainWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
  // Environment variable for dev mode detection
  VITE_DEV_SERVER_URL?: string;
}

// ==================== REGISTRATION ====================

/**
 * Register all IPC handlers
 *
 * This function should be called during app initialization
 * after all services have been created.
 */
export function registerAllHandlers(deps: AllIpcDeps): void {
  // Helper to safely register handlers with error logging
  const safeRegister = (name: string, registerFn: () => void): void => {
    try {
      registerFn();
      console.log(`[IPC] ✓ ${name} handlers registered`);
    } catch (error) {
      console.error(`[IPC] ✗ Failed to register ${name} handlers:`, error);
    }
  };

  // Register handlers in order (simple ones first)
  safeRegister("Mods", () => registerModsHandlers({
    metadataManager: deps.metadataManager,
    imageCacheService: deps.imageCacheService,
  }));

  safeRegister("Cache", () => registerCacheHandlers({
    imageCacheService: deps.imageCacheService,
  }));

  safeRegister("Dialogs", () => registerDialogsHandlers({
    getWindow: deps.getWindow,
  }));

  safeRegister("Settings", () => registerSettingsHandlers({
    metadataManager: deps.metadataManager,
  }));

  safeRegister("Gist", () => registerGistHandlers({
    gistService: deps.gistService,
    metadataManager: deps.metadataManager,
  }));

  safeRegister("Minecraft", () => registerMinecraftHandlers({
    minecraftService: deps.minecraftService,
    metadataManager: deps.metadataManager,
    getMainWindow: deps.getMainWindow,
  }));

  safeRegister("Game", () => registerGameHandlers({
    gameService: deps.gameService,
    curseforgeService: deps.curseforgeService,
  }));

  safeRegister("Hytale", () => registerHytaleHandlers({
    hytaleService: deps.hytaleService,
    curseforgeService: deps.curseforgeService,
    getDownloadService: deps.getDownloadService,
  }));

  safeRegister("CurseForge", () => registerCurseForgeHandlers({
    curseforgeService: deps.curseforgeService,
    metadataManager: deps.metadataManager,
  }));

  safeRegister("Analyzer", () => registerAnalyzerHandlers({
    modAnalyzerService: deps.modAnalyzerService,
    curseforgeService: deps.curseforgeService,
    metadataManager: deps.metadataManager,
  }));

  safeRegister("Logging", () => registerLoggingHandlers({}));

  safeRegister("System", () => registerSystemHandlers({}));

  safeRegister("Config", () => registerConfigHandlers({
    configService: deps.configService,
    instanceService: deps.instanceService,
    getWindow: deps.getWindow,
  }));

  safeRegister("Versions", () => registerVersionsHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    instanceService: deps.instanceService,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  safeRegister("Remote", () => registerRemoteHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    instanceService: deps.instanceService,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  safeRegister("Export", () => registerExportHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    instanceService: deps.instanceService,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  safeRegister("Preview", () => registerPreviewHandlers({
    modpackAnalyzerService: deps.modpackAnalyzerService,
    getWindow: deps.getWindow,
  }));

  safeRegister("Import", () => registerImportHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    instanceService: deps.instanceService,
    getDownloadService: deps.getDownloadService,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  safeRegister("Updates", () => registerUpdatesHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    instanceService: deps.instanceService,
    getDownloadService: deps.getDownloadService,
    getWindow: deps.getWindow,
    log: deps.log,
    VITE_DEV_SERVER_URL: deps.VITE_DEV_SERVER_URL,
  }));

  safeRegister("Instance", () => registerInstanceHandlers({
    instanceService: deps.instanceService,
    metadataManager: deps.metadataManager,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  safeRegister("Modpacks", () => registerModpacksHandlers({
    metadataManager: deps.metadataManager,
    curseforgeService: deps.curseforgeService,
    gistService: deps.gistService,
    instanceService: deps.instanceService,
    getDownloadService: deps.getDownloadService,
    getWindow: deps.getWindow,
    log: deps.log,
  }));

  console.log("[IPC] All handler registration complete");
}

// Re-export individual handlers for selective registration if needed
export {
  registerModsHandlers,
  registerCacheHandlers,
  registerDialogsHandlers,
  registerSettingsHandlers,
  registerGistHandlers,
  registerMinecraftHandlers,
  registerGameHandlers,
  registerHytaleHandlers,
  registerCurseForgeHandlers,
  registerAnalyzerHandlers,
  registerLoggingHandlers,
  registerSystemHandlers,
  registerConfigHandlers,
  registerVersionsHandlers,
  registerRemoteHandlers,
  registerExportHandlers,
  registerPreviewHandlers,
  registerImportHandlers,
  registerUpdatesHandlers,
  registerInstanceHandlers,
  registerModpacksHandlers,
};

// Re-export dependency types
export type {
  ModsIpcDeps,
  CacheIpcDeps,
  DialogsIpcDeps,
  SettingsIpcDeps,
  GistIpcDeps,
  MinecraftIpcDeps,
  GameIpcDeps,
  HytaleIpcDeps,
  CurseForgeIpcDeps,
  AnalyzerIpcDeps,
  LoggingIpcDeps,
  SystemIpcDeps,
  ConfigIpcDeps,
  VersionsIpcDeps,
  RemoteIpcDeps,
  ExportIpcDeps,
  PreviewIpcDeps,
  ImportIpcDeps,
  UpdatesIpcDeps,
  InstanceIpcDeps,
  ModpacksIpcDeps,
};
