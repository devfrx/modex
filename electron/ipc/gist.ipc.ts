/**
 * Gist IPC Handlers
 * GitHub Gist operations for modpack manifest sharing
 */

import { ipcMain } from "electron";
import type { GistService } from "../services/GistService.js";
import type { MetadataManager } from "../services/MetadataManager.js";

export interface GistIpcDeps {
  gistService: GistService;
  metadataManager: MetadataManager;
}

export function registerGistHandlers(deps: GistIpcDeps): void {
  const { gistService, metadataManager } = deps;

  // Check if token exists
  ipcMain.handle("gist:hasToken", async () => {
    return gistService.hasToken();
  });

  // Get the stored token
  ipcMain.handle("gist:getToken", async () => {
    return gistService.getToken();
  });

  // Set/update the token
  ipcMain.handle("gist:setToken", async (_, token: string) => {
    return gistService.setToken(token);
  });

  // Get authenticated user info
  ipcMain.handle("gist:getUser", async () => {
    return gistService.getUser();
  });

  // List user's gists
  ipcMain.handle("gist:listGists", async (_, options?: { perPage?: number; page?: number }) => {
    return gistService.listGists(options);
  });

  // Get a specific gist
  ipcMain.handle("gist:getGist", async (_, gistId: string) => {
    return gistService.getGist(gistId);
  });

  // Check if gist exists
  ipcMain.handle("gist:gistExists", async (_, gistId: string) => {
    return gistService.gistExists(gistId);
  });

  // Delete a gist linked to a modpack
  ipcMain.handle("gist:deleteGist", async (_, modpackId: string) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) {
        return { success: false, error: "Modpack not found" };
      }

      if (!modpack.gist_config?.gist_id) {
        return { success: false, error: "No Gist linked to this modpack" };
      }

      const result = await gistService.deleteGist(modpack.gist_config.gist_id);

      if (result.success) {
        // Clear gist_config from modpack
        await metadataManager.updateModpack(modpackId, {
          gist_config: undefined,
        });
      }

      return result;
    } catch (err) {
      console.error("Failed to delete Gist:", err);
      return { success: false, error: String(err) };
    }
  });

  // Create a new gist
  ipcMain.handle("gist:createGist", async (_, options: {
    description: string;
    filename: string;
    content: string;
    isPublic?: boolean;
  }) => {
    return gistService.createGist(options);
  });

  // Update an existing gist
  ipcMain.handle("gist:updateGist", async (_, options: {
    gistId: string;
    filename: string;
    content: string;
    description?: string;
  }) => {
    return gistService.updateGist(options);
  });

  // Push modpack manifest to gist
  ipcMain.handle("gist:pushManifest", async (_, modpackId: string, options?: {
    gistId?: string;
    filename?: string;
    isPublic?: boolean;
    versionHistoryMode?: 'full' | 'current';
  }) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) {
        return { success: false, error: "Modpack not found" };
      }

      // Export the manifest
      const manifest = await metadataManager.exportRemoteManifest(modpackId, {
        versionHistoryMode: options?.versionHistoryMode || 'full',
      });

      // Use existing gist config or provided options
      let gistId = options?.gistId || modpack.gist_config?.gist_id;
      const filename = options?.filename || modpack.gist_config?.filename || 
        `${modpack.name.replace(/[^a-zA-Z0-9-_]/g, "-")}-manifest.json`;
      let isPublic = options?.isPublic ?? modpack.gist_config?.is_public ?? true;

      // If there's a gistId, verify it still exists - if not, clear it to create a new one
      if (gistId) {
        const exists = await gistService.gistExists(gistId);
        if (!exists) {
          console.info(`Gist ${gistId} no longer exists, will create new one`);
          gistId = undefined;
          // Force public for new gist since old config is being cleared
          isPublic = options?.isPublic ?? true;
          // Clear the old gist_config since the gist was deleted
          await metadataManager.updateModpack(modpackId, {
            gist_config: undefined,
          });
        }
      }

      // Push to Gist
      const result = await gistService.pushManifest({
        modpackId,
        modpackName: modpack.name,
        manifest,
        gistId,
        filename,
        isPublic,
      });

      if (result.success && result.gistId) {
        // Update modpack with Gist config (for publisher tracking only)
        // NOTE: We do NOT update remote_source here - that would make the modpack "linked/subscriber"
        // The publisher flow is separate from the subscriber flow
        await metadataManager.updateModpack(modpackId, {
          gist_config: {
            gist_id: result.gistId,
            filename,
            is_public: isPublic,
            last_pushed: new Date().toISOString(),
            raw_url: result.rawUrl,
            html_url: result.htmlUrl,
          },
        });
      }

      return result;
    } catch (error: any) {
      console.error("Push manifest error:", error);
      return { success: false, error: error.message };
    }
  });
}
