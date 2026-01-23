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
import type { InstanceService } from "../services/InstanceService";
import type { Mod } from "../../shared/types";

/**
 * Generate modlist.html for CurseForge export
 */
function generateModlistHtml(mods: Mod[]): string {
  const sortedMods = [...mods].sort((a, b) => a.name.localeCompare(b.name));

  const modLinks = sortedMods
    .map((mod) => {
      // Determine URL path based on content type
      const urlPath =
        mod.content_type === "resourcepack"
          ? "texture-packs"
          : mod.content_type === "shader"
            ? "shaders"
            : "mc-mods";
      const url =
        mod.website_url ||
        `https://www.curseforge.com/minecraft/${urlPath}/${mod.slug || mod.cf_project_id}`;
      const author = mod.author || "Unknown";
      return `<li><a href="${url}">${mod.name} (by ${author})</a></li>`;
    })
    .join("\n");

  return `<ul>
${modLinks}
</ul>`;
}
/**
 * Folder entry for the export tree view
 */
export interface ExportFolderEntry {
  name: string;
  type: "folder" | "file";
  path: string;
  children?: ExportFolderEntry[];
  /** Whether the folder/file exists on disk */
  exists?: boolean;
}

/**
 * Standard Minecraft folders that should always be shown in export dialog
 */
const STANDARD_MINECRAFT_FOLDERS = [
  "config",
  "mods", 
  "resourcepacks",
  "shaderpacks",
  "saves",
  "logs",
  "defaultconfigs",
  "datapacks",
  "scripts",
  "kubejs"
];

/**
 * Standard Minecraft files that should always be shown in export dialog
 */
const STANDARD_MINECRAFT_FILES = [
  "options.txt",
];

/**
 * Options for CurseForge export
 */
export interface CurseForgeExportOptions {
  profileName?: string;
  version?: string;
  selectedFolders?: string[];
  /** Specific file/folder paths to exclude (relative paths like "config/mymod.toml") */
  excludedPaths?: string[];
  includeRamRecommendation?: boolean;
  ramRecommendation?: number;
  /** If true, only include server-side mods (isServerPack=true or unspecified) */
  serverModsOnly?: boolean;
}

export interface ExportIpcDeps {
  metadataManager: MetadataManager;
  curseforgeService: CurseForgeService;
  instanceService: InstanceService;
  getWindow: () => BrowserWindow | null;
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

/**
 * Recursively add a folder to a zip archive, excluding specified paths
 */
async function addFolderWithExclusions(
  zip: any, // AdmZip instance
  folderPath: string,
  zipPath: string,
  relativeFolderPath: string,
  excludedPaths: Set<string>,
  log: { info: (...args: any[]) => void; error: (...args: any[]) => void }
): Promise<void> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(folderPath, entry.name);
    const relativeEntryPath = `${relativeFolderPath}/${entry.name}`.replace(/\\/g, '/');
    
    // Check if this path is excluded
    if (excludedPaths.has(relativeEntryPath)) {
      log.info(`Export CF: Skipping excluded: ${relativeEntryPath}`);
      continue;
    }
    
    if (entry.isDirectory()) {
      // Recursively add subdirectory
      await addFolderWithExclusions(zip, srcPath, `${zipPath}/${entry.name}`, relativeEntryPath, excludedPaths, log);
    } else {
      // Add individual file
      zip.addLocalFile(srcPath, zipPath);
    }
  }
}

/**
 * Recursively scan a directory and build a folder tree
 * Also includes standard Minecraft folders even if they don't exist (marked as exists: false)
 */
async function scanFolderTree(
  dirPath: string,
  basePath: string,
  includeStandardFolders: boolean = false
): Promise<ExportFolderEntry[]> {
  const entries: ExportFolderEntry[] = [];
  const seenNames = new Set<string>();

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      // Skip snapshots folder (internal use)
      if (item.name === "snapshots") continue;

      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, "/");

      seenNames.add(item.name.toLowerCase());

      const entry: ExportFolderEntry = {
        name: item.name,
        type: item.isDirectory() ? "folder" : "file",
        path: relativePath,
        exists: true,
      };

      if (item.isDirectory()) {
        // For folders, recursively scan but only one level deep to keep UI manageable
        const children = await fs.readdir(fullPath, { withFileTypes: true });
        entry.children = children
          .filter(child => child.name !== "snapshots")
          .map(child => ({
            name: child.name,
            type: child.isDirectory() ? "folder" : "file",
            path: `${relativePath}/${child.name}`,
            exists: true,
          }));
      }

      entries.push(entry);
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }

  // Add standard Minecraft folders that don't exist yet (if we're at root level)
  if (includeStandardFolders) {
    for (const folderName of STANDARD_MINECRAFT_FOLDERS) {
      if (!seenNames.has(folderName.toLowerCase())) {
        entries.push({
          name: folderName,
          type: "folder",
          path: folderName,
          exists: false,
          children: [],
        });
      }
    }
    
    // Add standard files
    for (const fileName of STANDARD_MINECRAFT_FILES) {
      if (!seenNames.has(fileName.toLowerCase())) {
        entries.push({
          name: fileName,
          type: "file",
          path: fileName,
          exists: false,
        });
      }
    }
  }

  // Sort entries: existing first, then non-existing; folders before files; alphabetical
  entries.sort((a, b) => {
    // Existing items first
    if (a.exists !== b.exists) return a.exists ? -1 : 1;
    // Folders before files
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    // Alphabetical
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export function registerExportHandlers(deps: ExportIpcDeps): void {
  const { metadataManager, curseforgeService, instanceService, getWindow, log } = deps;

  // Get folder tree for export selection UI (from instance folder, not overrides)
  ipcMain.handle("export:getOverridesTree", async (_, modpackId: string): Promise<ExportFolderEntry[]> => {
    try {
      // First, try to get the instance linked to this modpack
      const instance = await instanceService.getInstanceByModpack(modpackId);
      
      if (instance?.path && await fs.pathExists(instance.path)) {
        // Scan the instance folder (this is where the actual game files are)
        log.info(`Export: Scanning instance folder for modpack ${modpackId}: ${instance.path}`);
        return await scanFolderTree(instance.path, instance.path, true);
      }
      
      // Fallback: try overrides path
      const overridesPath = metadataManager.getOverridesPath(modpackId);
      if (await fs.pathExists(overridesPath)) {
        log.info(`Export: No instance found, falling back to overrides: ${overridesPath}`);
        return await scanFolderTree(overridesPath, overridesPath, true);
      }

      // Neither exists - return standard folders as non-existing
      log.info(`Export: No instance or overrides found for modpack ${modpackId}, returning standard folders`);
      const entries: ExportFolderEntry[] = [];
      for (const folderName of STANDARD_MINECRAFT_FOLDERS) {
        entries.push({
          name: folderName,
          type: "folder",
          path: folderName,
          exists: false,
          children: [],
        });
      }
      for (const fileName of STANDARD_MINECRAFT_FILES) {
        entries.push({
          name: fileName,
          type: "file",
          path: fileName,
          exists: false,
        });
      }
      return entries;
    } catch (error: any) {
      log.error("Failed to get folder tree:", error);
      return [];
    }
  });

  // Export to CurseForge format
  ipcMain.handle("export:curseforge", async (_, modpackId: string, options?: CurseForgeExportOptions) => {
    const win = getWindow();
    if (!win) return null;

    try {
      let { manifest, modpack, modlist, mods } =
        await metadataManager.exportToCurseForge(modpackId, curseforgeService);

      // Filter mods if serverModsOnly is enabled
      // Server packs include: isServerPack=true OR isServerPack=null/undefined (unknown)
      // Client-only mods (isServerPack=false explicitly) are excluded
      if (options?.serverModsOnly) {
        const serverModIds = new Set(
          mods
            .filter((m: any) => m.isServerPack !== false) // Include true or null/undefined
            .map((m: any) => m.cf_project_id)
        );
        
        manifest.files = manifest.files.filter((f: any) => serverModIds.has(f.projectID));
        log.info(`Export CF: Filtered to server mods only, ${manifest.files.length} mods included`);
        
        // Regenerate modlist with only server mods
        const serverMods = mods.filter((m: any) => serverModIds.has(m.cf_project_id));
        modlist = generateModlistHtml(serverMods);
      }

      // Apply custom options if provided
      if (options?.profileName) {
        manifest.name = options.profileName;
      }
      if (options?.version) {
        manifest.version = options.version;
      }
      
      // Add recommendedRam to minecraft section if requested
      if (options?.includeRamRecommendation && options.ramRecommendation) {
        manifest.minecraft.recommendedRam = options.ramRecommendation;
        log.info(`Export CF: Added recommendedRam: ${options.ramRecommendation}MB`);
      }

      // Determine filename from options or modpack name
      const exportName = options?.profileName || modpack.name;

      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${exportName}.zip`,
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

      // Add overrides based on selection (or all if no selection provided)
      // First try instance folder, then fall back to overrides folder
      const instance = await instanceService.getInstanceByModpack(modpackId);
      const sourcePath = instance?.path && await fs.pathExists(instance.path) 
        ? instance.path 
        : metadataManager.getOverridesPath(modpackId);
      
      // Build set of excluded paths for quick lookup
      const excludedPathsSet = new Set(options?.excludedPaths?.map(p => p.replace(/\\/g, '/')) || []);
      
      if (await fs.pathExists(sourcePath)) {
        const entries = await fs.readdir(sourcePath, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip system/launcher folders that shouldn't be exported
          if (entry.name === "snapshots" || 
              entry.name === ".fabric" ||
              entry.name === "crash-reports" ||
              entry.name === "logs" ||
              entry.name === "screenshots" ||
              entry.name === "instance.json") continue;

          // Check if this folder/file should be included based on selectedFolders
          const shouldIncludeFolder = !options?.selectedFolders || 
            options.selectedFolders.length === 0 ||
            options.selectedFolders.includes(entry.name);

          if (!shouldIncludeFolder) continue;

          const srcPath = path.join(sourcePath, entry.name);
          
          // Check if this entire folder/file is excluded
          if (excludedPathsSet.has(entry.name)) {
            log.info(`Export CF: Skipping excluded path: ${entry.name}`);
            continue;
          }
          
          if (entry.isDirectory()) {
            // Use custom function to add folder with exclusions
            await addFolderWithExclusions(zip, srcPath, `overrides/${entry.name}`, entry.name, excludedPathsSet, log);
          } else {
            zip.addLocalFile(srcPath, "overrides");
          }
        }
        log.info(`Export CF: Added overrides from ${sourcePath}`, { 
          selectedFolders: options?.selectedFolders || "all",
          excludedPaths: options?.excludedPaths?.length || 0
        });
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
