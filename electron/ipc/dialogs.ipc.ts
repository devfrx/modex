/**
 * Dialogs IPC Handlers
 *
 * Handles all IPC communication for system dialogs (file selection, etc).
 * Extracted from main.ts for better modularity.
 *
 * @module electron/ipc/dialogs.ipc
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import { createLogger } from "../services/LoggerService";

const log = createLogger("IPC:Dialogs");

// ==================== TYPES ====================

export interface DialogsIpcDeps {
  getWindow: () => BrowserWindow | null;
}

// ==================== HANDLERS ====================

export function registerDialogsHandlers(deps: DialogsIpcDeps): void {
  const { getWindow } = deps;

  // Select a ZIP file
  ipcMain.handle("dialogs:selectZipFile", async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Select an image file
  ipcMain.handle("dialogs:selectImage", async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  log.info("Dialogs IPC handlers registered");
}
