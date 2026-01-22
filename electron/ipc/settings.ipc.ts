/**
 * Settings IPC Handlers
 *
 * Handles all IPC communication for application settings.
 * Extracted from main.ts for better modularity.
 *
 * @module electron/ipc/settings.ipc
 */

import { ipcMain } from "electron";
import type { MetadataManager } from "../services/MetadataManager";
import { createLogger } from "../services/LoggerService";

const log = createLogger("IPC:Settings");

// ==================== TYPES ====================

export interface SettingsIpcDeps {
  metadataManager: MetadataManager;
}

// ==================== HANDLERS ====================

export function registerSettingsHandlers(deps: SettingsIpcDeps): void {
  const { metadataManager } = deps;

  // Get instance sync settings
  ipcMain.handle("settings:getInstanceSync", async () => {
    return metadataManager.getInstanceSyncSettings();
  });

  // Update instance sync settings
  ipcMain.handle("settings:setInstanceSync", async (_, settings: {
    autoSyncBeforeLaunch?: boolean;
    autoImportConfigsAfterGame?: boolean;
    showSyncConfirmation?: boolean;
    defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
  }) => {
    try {
      await metadataManager.setInstanceSyncSettings(settings);
      return { success: true };
    } catch (error) {
      log.error("Failed to save instance sync settings:", error);
      throw error;
    }
  });

  // Get Gist publishing settings
  ipcMain.handle("settings:getGist", async () => {
    return metadataManager.getGistSettings();
  });

  // Update Gist publishing settings
  ipcMain.handle("settings:setGist", async (_, settings: {
    defaultManifestMode?: "full" | "current";
  }) => {
    try {
      await metadataManager.setGistSettings(settings);
      return { success: true };
    } catch (error) {
      log.error("Failed to save gist settings:", error);
      throw error;
    }
  });

  log.info("Settings IPC handlers registered");
}
