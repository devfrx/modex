/**
 * preview.ipc.ts - Modpack Preview/Analysis IPC Handlers
 *
 * Handles modpack preview operations for various formats.
 */

import { ipcMain, BrowserWindow, dialog } from "electron";
import type { ModpackAnalyzerService } from "../services/ModpackAnalyzerService";

export interface PreviewIpcDeps {
  modpackAnalyzerService: ModpackAnalyzerService;
  getWindow: () => BrowserWindow | null;
}

export function registerPreviewHandlers(deps: PreviewIpcDeps): void {
  const { modpackAnalyzerService, getWindow } = deps;

  // Preview modpack from ZIP file
  ipcMain.handle("preview:fromZip", async (_, zipPath: string) => {
    return modpackAnalyzerService.previewFromZip(zipPath);
  });

  // Preview modpack from CurseForge data
  ipcMain.handle("preview:fromCurseForge", async (_, modpackData: any, fileData: any) => {
    return modpackAnalyzerService.previewFromCurseForge(modpackData, fileData);
  });

  // RAM/Performance analysis removed - was based on unreliable static data
  ipcMain.handle("preview:analyzeModpack", async () => {
    return null;
  });

  // Select and preview ZIP file
  ipcMain.handle("preview:selectZip", async () => {
    const win = getWindow();
    if (!win) return null;
    
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Modpack Files", extensions: ["zip", "mrpack", "modex"] }
      ],
      title: "Select Modpack to Preview"
    });

    if (result.canceled || !result.filePaths[0]) return null;

    // Return both path and preview
    const zipPath = result.filePaths[0];
    const preview = await modpackAnalyzerService.previewFromZip(zipPath);

    return { path: zipPath, preview };
  });
}
