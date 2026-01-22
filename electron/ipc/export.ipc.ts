/**
 * export.ipc.ts - Export IPC Handlers
 *
 * Handles export operations for modpacks in various formats:
 * - CurseForge format (.zip)
 * - MODEX format (.modex)
 * - JSON manifest
 */

import { ipcMain, BrowserWindow, dialog } from "electron";
import path from "path";
import fs from "fs-extra";
import type { MetadataManager } from "../services/MetadataManager";
import type { CurseForgeService } from "../services/CurseForgeService";

export interface ExportIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export function registerExportHandlers(deps: ExportIpcDeps): void {
  const { metadataManager, curseforgeService, getWindow, log } = deps;

  // Export to CurseForge format
  ipcMain.handle("export:curseforge", async (_, modpackId: string) => {
    const win = getWindow();
    if (!win) return null;

    try {
      const { manifest, modpack, modlist } =
        await metadataManager.exportToCurseForge(modpackId, curseforgeService);

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.zip`,
        filters: [{ name: "ZIP Files", extensions: ["zip"] }],
      });

      if (result.canceled || !result.filePath) return null;

      // Create ZIP with manifest.json, modlist.html and overrides
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile(
        "manifest.json",
        Buffer.from(JSON.stringify(manifest, null, 2))
      );
      zip.addFile("modlist.html", Buffer.from(modlist));

      // Add overrides (config files, resourcepacks, shaderpacks, etc.) if they exist
      const overridesPath = metadataManager.getOverridesPath(modpackId);
      if (await fs.pathExists(overridesPath)) {
        const entries = await fs.readdir(overridesPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "snapshots") continue; // Don't include version snapshots

          const srcPath = path.join(overridesPath, entry.name);
          if (entry.isDirectory()) {
            zip.addLocalFolder(srcPath, `overrides/${entry.name}`);
          } else {
            zip.addLocalFile(srcPath, "overrides");
          }
        }
        log.info(`Export CF: Added overrides from ${overridesPath}`);
      }

      zip.writeZip(result.filePath);

      return { success: true, path: result.filePath };
    } catch (error: any) {
      log.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  // Export to MODEX format
  ipcMain.handle("export:modex", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    const win = getWindow();
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.modex`,
        filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest, code } = await metadataManager.exportToModex(modpackId, options);

      // Create ZIP with modex.json and overrides
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile("modex.json", Buffer.from(JSON.stringify(manifest, null, 2)));

      // Add overrides (config files) if they exist
      const overridesPath = metadataManager.getOverridesPath(modpackId);
      if (await fs.pathExists(overridesPath)) {
        const entries = await fs.readdir(overridesPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "snapshots") continue; // Don't include version snapshots

          const srcPath = path.join(overridesPath, entry.name);
          if (entry.isDirectory()) {
            zip.addLocalFolder(srcPath, `overrides/${entry.name}`);
          } else {
            zip.addLocalFile(srcPath, "overrides");
          }
        }
        log.info(`Export MODEX: Added overrides from ${overridesPath}`);
      }

      zip.writeZip(result.filePath);

      return { success: true, code, path: result.filePath };
    } catch (error: any) {
      log.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  // Export manifest only (JSON)
  ipcMain.handle("export:manifest", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    const win = getWindow();
    if (!win) return null;

    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) throw new Error("Modpack not found");

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${modpack.name}.json`,
        filters: [{ name: "JSON Manifest", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) return null;

      const { manifest } = await metadataManager.exportToModex(modpackId, options);

      await fs.writeJson(result.filePath, manifest, { spaces: 2 });

      return { success: true, path: result.filePath };
    } catch (error: any) {
      log.error("Export manifest error:", error);
      throw new Error(error.message);
    }
  });

  // Select export path
  ipcMain.handle(
    "export:selectPath",
    async (_, defaultName: string, extension: string) => {
      const win = getWindow();
      if (!win) return null;
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${defaultName}.${extension}`,
        filters: [
          { name: `${extension.toUpperCase()} Files`, extensions: [extension] },
        ],
      });
      return result.canceled ? null : result.filePath;
    }
  );
}
