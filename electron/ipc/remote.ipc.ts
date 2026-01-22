/**
 * remote.ipc.ts - Remote Updates IPC Handlers
 *
 * Handles remote manifest export, update checking, and import from URL.
 * Supports Gist URLs and direct HTTPS manifest URLs.
 */

import { ipcMain, BrowserWindow } from "electron";
import type { MetadataManager } from "../services/MetadataManager";
import type { CurseForgeService } from "../services/CurseForgeService";
import type { InstanceService } from "../services/InstanceService";

export interface RemoteIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  instanceService: InstanceService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export function registerRemoteHandlers(deps: RemoteIpcDeps): void {
  const { metadataManager, curseforgeService, instanceService, getWindow, log } = deps;

  // Export remote manifest for sharing
  ipcMain.handle("remote:exportManifest", async (_, modpackId: string, options?: {
    versionHistoryMode?: 'full' | 'current';
  }) => {
    return metadataManager.exportRemoteManifest(modpackId, options);
  });

  // Check for remote update
  ipcMain.handle("remote:checkUpdate", async (_, modpackId: string) => {
    return metadataManager.checkForRemoteUpdate(modpackId);
  });

  // Import modpack from URL (Gist or direct HTTPS)
  ipcMain.handle("remote:importFromUrl", async (_, url: string) => {
    const win = getWindow();
    if (!win) return { success: false, error: "Window not available" };

    // Validate URL
    if (!url || typeof url !== 'string') {
      return { success: false, error: "Invalid URL: must be a non-empty string" };
    }
    
    // Security: Only allow HTTPS URLs to prevent SSRF attacks
    if (!url.startsWith('https://')) {
      return { success: false, error: "Invalid URL: only HTTPS URLs are allowed for security reasons" };
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return { success: false, error: "Invalid URL format" };
    }

    // Check for API key (required for fetching mod metadata)
    if (!curseforgeService.hasApiKey()) {
      return {
        success: false,
        error: "CurseForge API key required. Please add your API key in Settings > General > API Configuration."
      };
    }

    try {
      // Send progress
      win.webContents.send("import:progress", {
        current: 5,
        total: 100,
        modName: "Fetching remote manifest...",
      });

      // Fetch the manifest from URL
      let urlToFetch = url;

      // Sanitize Gist URL: Remove commit hash if present
      const gistRegex =
        /^(https:\/\/gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[0-9a-f]{40}\/(.+)$/;
      const match = urlToFetch.match(gistRegex);
      if (match) {
        urlToFetch = `${match[1]}/${match[2]}`;
      }

      // For Gist URLs, use the GitHub API
      const gistApiRegex =
        /^https:\/\/gist\.githubusercontent\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/;
      const apiMatch = urlToFetch.match(gistApiRegex);

      let manifest: any;

      if (apiMatch) {
        const gistId = apiMatch[2];
        const filename = apiMatch[3];
        const apiUrl = `https://api.github.com/gists/${gistId}`;

        const apiResponse = await fetch(apiUrl, {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });

        if (!apiResponse.ok) {
          throw new Error(`GitHub API request failed: ${apiResponse.statusText}`);
        }

        const gistData = await apiResponse.json();
        const file = gistData.files[filename];
        if (!file) {
          throw new Error(`File "${filename}" not found in gist`);
        }
        try {
          manifest = JSON.parse(file.content);
        } catch (parseError) {
          throw new Error(`Invalid MODEX manifest: File "${filename}" is not valid JSON`);
        }
      } else {
        // Regular URL fetch
        const response = await fetch(urlToFetch, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        manifest = await response.json();
      }

      // Validate manifest
      if (!manifest.modex_version || !manifest.share_code) {
        throw new Error("Invalid MODEX manifest: Missing modex_version or share_code");
      }

      win.webContents.send("import:progress", {
        current: 10,
        total: 100,
        modName: `Importing ${manifest.modpack?.name || "modpack"}...`,
      });

      // Progress callback
      const onProgress = (current: number, total: number, modName: string) => {
        if (win) {
          // Map to 10-95% range
          const percent = 10 + Math.round((current / total) * 85);
          win.webContents.send("import:progress", { current: percent, total: 100, modName });
        }
      };

      // Use dedicated importFromUrl function (always creates new modpack)
      const importResult = await metadataManager.importFromUrl(
        manifest,
        urlToFetch,
        curseforgeService,
        onProgress
      );

      // Auto-create instance for the imported modpack (similar to CF import)
      if (importResult.success && importResult.modpackId && !importResult.alreadyExists) {
        try {
          win.webContents.send("import:progress", {
            current: 96,
            total: 100,
            modName: "Creating game instance...",
          });

          const modpack = await metadataManager.getModpackById(importResult.modpackId);
          if (modpack) {
            // Create instance
            const instance = await instanceService.createInstance({
              name: modpack.name,
              minecraftVersion: modpack.minecraft_version || "1.20.1",
              loader: modpack.loader || "forge",
              loaderVersion: modpack.loader_version,
              modpackId: modpack.id,
              description: modpack.description,
              source: modpack.cf_project_id ? {
                type: "curseforge",
                projectId: modpack.cf_project_id,
                fileId: modpack.cf_file_id,
                name: modpack.name,
                version: modpack.version
              } : undefined
            });

            win.webContents.send("import:progress", {
              current: 97,
              total: 100,
              modName: "Syncing mods to instance...",
            });

            // Get mods and sync to instance (include ALL mods, disabled ones will be renamed)
            const mods = await metadataManager.getModsInModpack(importResult.modpackId);
            const disabledModIds = new Set(modpack.disabled_mod_ids || []);
            const modsToSync = mods.map(m => ({
              id: m.id,
              name: m.name,
              filename: m.filename,
              cf_project_id: m.cf_project_id,
              cf_file_id: m.cf_file_id,
              content_type: m.content_type || "mod"
            }));
            const disabledModsToSync = mods
              .filter(m => disabledModIds.has(m.id))
              .map(m => ({
                id: m.id,
                filename: m.filename,
                content_type: m.content_type || "mod" as "mod" | "resourcepack" | "shader"
              }));

            // Note: Gist imports don't have overrides (configs), only mod references
            await instanceService.syncModpackToInstance(instance.id, {
              mods: modsToSync,
              disabledMods: disabledModsToSync,
            }, {
              onProgress: (stage, current, total, item) => {
                if (win) {
                  win.webContents.send("instance:syncProgress", { stage, current, total, item });
                }
              }
            });

            win.webContents.send("import:progress", {
              current: 99,
              total: 100,
              modName: "Finalizing...",
            });

            log.info(`Gist Import: Auto-created instance ${instance.id} for modpack ${importResult.modpackId}`);
          }
        } catch (autoFlowError) {
          log.error(`Gist Import: Auto-flow failed (non-fatal):`, autoFlowError);
          // Non-fatal: modpack was still imported successfully
        }
      }

      win.webContents.send("import:progress", {
        current: 100,
        total: 100,
        modName: "Import complete!",
      });

      return importResult;
    } catch (error: any) {
      log.error("Remote Import: Error:", error);
      return { success: false, error: error.message };
    }
  });
}
