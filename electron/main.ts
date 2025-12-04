import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import FileSystemManager, { Mod, Modpack } from "./services/FileSystemManager.js";
import { JarScanner } from "./services/JarScanner.js";
import ModUpdateService from "./services/ModUpdateService.js";
import { CurseForgeService } from "./services/CurseForgeService.js";
import fs from "fs-extra";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let fsManager: FileSystemManager;
let updateService: ModUpdateService;
let curseforgeService: CurseForgeService;

// Register custom protocol for local file access
protocol.registerSchemesAsPrivileged([
  {
    scheme: "atom",
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
  },
]);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Initialize file system manager and IPC handlers
async function initializeBackend() {
  fsManager = new FileSystemManager();

  // Register atom:// protocol to serve local files with security validation
  protocol.handle("atom", (request) => {
    const filePath = decodeURIComponent(request.url.replace("atom:///", ""));
    
    // Security: validate path to prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes("..") || !path.isAbsolute(normalizedPath)) {
      console.error("Blocked potentially unsafe path:", filePath);
      return new Response("Forbidden", { status: 403 });
    }
    
    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return new Response("Not Found", { status: 404 });
    }
    
    return net.fetch("file:///" + normalizedPath);
  });

  // ========== MOD IPC HANDLERS ==========

  ipcMain.handle("mods:getAll", async () => {
    return fsManager.getAllMods();
  });

  ipcMain.handle("mods:getById", async (_, id: string) => {
    return fsManager.getModById(id);
  });

  ipcMain.handle("mods:import", async (_, sourcePaths: string[]) => {
    return fsManager.importMods(sourcePaths);
  });

  ipcMain.handle("mods:update", async (_, id: string, updates: Partial<Mod>) => {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid mod ID");
    }
    return fsManager.updateMod(id, updates);
  });

  ipcMain.handle("mods:delete", async (_, id: string) => {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid mod ID");
    }
    return fsManager.deleteMod(id);
  });

  ipcMain.handle("mods:bulkDelete", async (_, ids: string[]) => {
    if (!Array.isArray(ids)) {
      throw new Error("Invalid mod IDs");
    }
    return fsManager.deleteMods(ids);
  });

  // ========== MODPACK IPC HANDLERS ==========

  ipcMain.handle("modpacks:getAll", async () => {
    return fsManager.getAllModpacks();
  });

  ipcMain.handle("modpacks:getById", async (_, id: string) => {
    return fsManager.getModpackById(id);
  });

  ipcMain.handle(
    "modpacks:create",
    async (_, data: { name: string; version?: string; minecraft_version?: string; loader?: string; description?: string }) => {
      return fsManager.createModpack(data);
    }
  );

  // Backward compatibility: modpacks:add calls modpacks:create
  ipcMain.handle(
    "modpacks:add",
    async (_, data: { name: string; version?: string; minecraft_version?: string; loader?: string; description?: string }) => {
      return fsManager.createModpack(data);
    }
  );

  ipcMain.handle(
    "modpacks:update",
    async (_, id: string, updates: Partial<Modpack>) => {
      if (!id || typeof id !== "string") {
        throw new Error("Invalid modpack ID");
      }
      return fsManager.updateModpack(id, updates);
    }
  );

  ipcMain.handle("modpacks:delete", async (_, id: string) => {
    if (!id || typeof id !== "string") {
      throw new Error("Invalid modpack ID");
    }
    return fsManager.deleteModpack(id);
  });

  ipcMain.handle("modpacks:getMods", async (_, modpackId: string) => {
    return fsManager.getModsInModpack(modpackId);
  });

  ipcMain.handle(
    "modpacks:addMod",
    async (_, modpackId: string, modId: string) => {
      const result = await fsManager.addModToModpack(modpackId, modId);
      if (!result.success && result.error) {
        throw new Error(result.error);
      }
      return result.success;
    }
  );

  ipcMain.handle(
    "modpacks:removeMod",
    async (_, modpackId: string, modId: string) => {
      return fsManager.removeModFromModpack(modpackId, modId);
    }
  );

  ipcMain.handle("modpacks:clone", async (_, modpackId: string, newName: string) => {
    return fsManager.cloneModpack(modpackId, newName);
  });

  // Image selection for modpacks
  ipcMain.handle("modpacks:selectImage", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("modpacks:setImage", async (_, modpackId: string, imagePath: string) => {
    return fsManager.setModpackImage(modpackId, imagePath);
  });

  // ========== FILE/SCANNER IPC HANDLERS ==========

  ipcMain.handle("scanner:selectFolder", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("scanner:selectFiles", async () => {
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "JAR Files", extensions: ["jar"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("scanner:selectZipFile", async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Select game mods folder
  ipcMain.handle("scanner:selectGameFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Minecraft Mods Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Export mods to game folder
  ipcMain.handle("scanner:exportToGameFolder", async (_, modIds: string[], targetFolder: string) => {
    try {
      let exported = 0;
      for (const modId of modIds) {
        const mod = await fsManager.getModById(modId);
        if (mod && mod.path) {
          const targetPath = path.join(targetFolder, mod.filename);
          await fs.copy(mod.path, targetPath);
          exported++;
        }
      }
      return { success: true, count: exported };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  // Export modpack to game folder
  ipcMain.handle("scanner:exportModpackToGameFolder", async (_, modpackId: string, targetFolder: string) => {
    try {
      const mods = await fsManager.getModsInModpack(modpackId);
      let exported = 0;
      for (const mod of mods) {
        if (mod.path) {
          const targetPath = path.join(targetFolder, mod.filename);
          await fs.copy(mod.path, targetPath);
          exported++;
        }
      }
      return { success: true, count: exported };
    } catch (error: any) {
      console.error("Export error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("scanner:openInExplorer", async (_, folderPath: string) => {
    shell.showItemInFolder(folderPath);
  });

  ipcMain.handle("scanner:openLibrary", async () => {
    shell.openPath(fsManager.getLibraryPath());
  });

  ipcMain.handle("scanner:openModpackFolder", async (_, modpackId: string) => {
    shell.openPath(fsManager.getModpackPath(modpackId));
  });

  ipcMain.handle("scanner:getBasePath", async () => {
    return fsManager.getBasePath();
  });

  ipcMain.handle("scanner:getLibraryPath", async () => {
    return fsManager.getLibraryPath();
  });

  ipcMain.handle("scanner:scanFolder", async (_, folderPath: string) => {
    try {
      const metadata = await JarScanner.scanDirectory(folderPath);
      return metadata;
    } catch (error: any) {
      console.error("Scan error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle("scanner:scanFiles", async (_, filePaths: string[]) => {
    try {
      const metadata = await Promise.all(
        filePaths.map((fp) => JarScanner.scanJarFile(fp))
      );
      return metadata.filter((m) => m !== null);
    } catch (error: any) {
      console.error("Scan error:", error);
      throw new Error(error.message);
    }
  });

  // Import mods from paths (copies to library)
  ipcMain.handle("scanner:importMods", async (_, filePaths: string[]) => {
    try {
      const mods = await fsManager.importMods(filePaths);
      return mods;
    } catch (error: any) {
      console.error("Import error:", error);
      throw new Error(error.message);
    }
  });

  // Import modpack from ZIP
  ipcMain.handle("scanner:importModpack", async (_, zipPath: string, modpackName: string) => {
    const tempDir = path.join(
      app.getPath("temp"),
      "modex-import-" + Date.now()
    );
    
    try {
      await fs.ensureDir(tempDir);

      // 1. Extract ZIP
      console.log("Extracting ZIP to:", tempDir);
      await JarScanner.extractZip(zipPath, tempDir);

      // Log extracted contents for debugging
      const listDir = async (dir: string, indent: string = "") => {
        const items = await fs.readdir(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = await fs.stat(fullPath);
          console.log(`${indent}${stat.isDirectory() ? "[DIR]" : "[FILE]"} ${item}`);
          if (stat.isDirectory() && indent.length < 6) {
            await listDir(fullPath, indent + "  ");
          }
        }
      };
      console.log("Extracted contents:");
      await listDir(tempDir);

      // 2. Check for CurseForge manifest.json for better name/version
      let finalName = modpackName;
      let version = "1.0.0";
      let description = "";
      
      const manifestPath = path.join(tempDir, "manifest.json");
      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJson(manifestPath);
          console.log("Found CurseForge manifest:", manifest.name);
          if (manifest.name) finalName = manifest.name;
          if (manifest.version) version = manifest.version;
          if (manifest.author) description = `By ${manifest.author}`;
        } catch (e) {
          console.warn("Failed to parse manifest.json:", e);
        }
      }

      // 3. Check for ModEx modpack.json
      const modexManifestPath = path.join(tempDir, "modpack.json");
      if (await fs.pathExists(modexManifestPath)) {
        try {
          const manifest = await fs.readJson(modexManifestPath);
          console.log("Found ModEx manifest:", manifest.name);
          if (manifest.name) finalName = manifest.name;
          if (manifest.version) version = manifest.version;
          if (manifest.description) description = manifest.description;
        } catch (e) {
          console.warn("Failed to parse modpack.json:", e);
        }
      }

      // 4. Find JAR files recursively in all directories
      const jarFiles: string[] = [];
      
      const findJarsRecursive = async (dir: string) => {
        try {
          const items = await fs.readdir(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            try {
              const stat = await fs.stat(fullPath);
              if (stat.isDirectory()) {
                await findJarsRecursive(fullPath);
              } else if (item.toLowerCase().endsWith(".jar")) {
                console.log("Found JAR:", fullPath);
                jarFiles.push(fullPath);
              }
            } catch (e) {
              // Skip files we can't access
            }
          }
        } catch (e) {
          console.warn("Cannot read directory:", dir);
        }
      };

      await findJarsRecursive(tempDir);
      console.log(`Total JARs found: ${jarFiles.length}`);

      if (jarFiles.length === 0) {
        throw new Error("No mod files (.jar) found in the modpack. Make sure your ZIP contains .jar files in a 'mods' or 'overrides/mods' folder.");
      }

      // 5. Create modpack with extracted metadata
      const modpackId = await fsManager.createModpack({ 
        name: finalName, 
        version,
        description 
      });

      // 6. Import mods to library and add to modpack
      const importedMods = await fsManager.importMods(jarFiles);
      for (const mod of importedMods) {
        await fsManager.addModToModpack(modpackId, mod.id);
      }

      // 7. Copy cover image if exists
      const coverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
      for (const ext of coverExtensions) {
        const coverPath = path.join(tempDir, `cover.${ext}`);
        if (await fs.pathExists(coverPath)) {
          await fsManager.setModpackImage(modpackId, coverPath);
          break;
        }
      }

      return { modpackId, modCount: importedMods.length };
    } catch (error: any) {
      console.error("Modpack import error:", error);
      throw new Error(error.message);
    } finally {
      // Cleanup
      try {
        await fs.remove(tempDir);
      } catch (cleanupError) {
        console.error("Failed to cleanup temp directory:", cleanupError);
      }
    }
  });

  // Export modpack as ZIP
  ipcMain.handle(
    "scanner:exportModpack",
    async (_, modpackId: string, exportPath: string) => {
      try {
        if (!modpackId || typeof modpackId !== "string") {
          throw new Error("Invalid modpack ID");
        }
        if (!exportPath || typeof exportPath !== "string") {
          throw new Error("Invalid export path");
        }

        const modpack = await fsManager.getModpackById(modpackId);
        if (!modpack) throw new Error("Modpack not found");

        const mods = await fsManager.getModsInModpack(modpackId);

        if (mods.length === 0) {
          throw new Error("Cannot export empty modpack - add mods first");
        }

        // Get the most common game version from mods
        const versionCounts = new Map<string, number>();
        for (const mod of mods) {
          if (mod.game_version) {
            versionCounts.set(mod.game_version, (versionCounts.get(mod.game_version) || 0) + 1);
          }
        }
        let mostCommonVersion = "1.20.1";
        let maxCount = 0;
        Array.from(versionCounts.entries()).forEach(([version, count]) => {
          if (count > maxCount) {
            maxCount = count;
            mostCommonVersion = version;
          }
        });

        // Create CurseForge-compatible manifest.json
        const manifest = {
          minecraft: {
            version: mostCommonVersion,
            modLoaders: [
              {
                id: `${mods[0]?.loader || "forge"}-0.0.0`,
                primary: true,
              },
            ],
          },
          manifestType: "minecraftModpack",
          manifestVersion: 1,
          name: modpack.name,
          version: modpack.version,
          author: "ModEx User",
          files: [],
          overrides: "overrides",
        };

        // Create ModEx modpack.json for reimport
        const modexManifest = {
          name: modpack.name,
          version: modpack.version,
          description: modpack.description || "",
          created_at: modpack.created_at,
          exported_at: new Date().toISOString(),
          mod_count: mods.length,
        };

        // Create ZIP
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip();

        // Add CurseForge manifest
        zip.addFile(
          "manifest.json",
          Buffer.from(JSON.stringify(manifest, null, 2))
        );

        // Add ModEx manifest
        zip.addFile(
          "modpack.json",
          Buffer.from(JSON.stringify(modexManifest, null, 2))
        );

        // Add cover image if exists
        if (modpack.image_path && await fs.pathExists(modpack.image_path)) {
          const ext = path.extname(modpack.image_path);
          const coverBuffer = await fs.readFile(modpack.image_path);
          zip.addFile(`cover${ext}`, coverBuffer);
        }

        // Add mods to overrides/mods/
        for (const mod of mods) {
          if (mod.path && await fs.pathExists(mod.path)) {
            const modBuffer = await fs.readFile(mod.path);
            zip.addFile(`overrides/mods/${mod.filename}`, modBuffer);
          }
        }

        // Write ZIP
        zip.writeZip(exportPath);

        return { success: true, path: exportPath };
      } catch (error: any) {
        console.error("Export error:", error);
        throw new Error(error.message);
      }
    }
  );

  ipcMain.handle("scanner:selectExportPath", async (_, defaultName: string) => {
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName + ".zip",
      filters: [{ name: "ZIP Files", extensions: ["zip"] }],
    });
    return result.canceled ? null : result.filePath;
  });

  // ==================== MODEX SHARE ====================

  // Export as .modex
  ipcMain.handle("share:exportModex", async (_, modpackId: string) => {
    if (!win) return null;
    
    const modpack = await fsManager.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${modpack.name}.modex`,
      filters: [{ name: "MODEX Package", extensions: ["modex"] }],
    });

    if (result.canceled || !result.filePath) return null;

    return fsManager.exportAsModex(modpackId, result.filePath);
  });

  // Import .modex
  ipcMain.handle("share:importModex", async () => {
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "MODEX Package", extensions: ["modex"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    return fsManager.importModex(result.filePaths[0]);
  });

  // Import CurseForge modpack ZIP
  ipcMain.handle("share:importCurseForgeZip", async () => {
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "CurseForge Modpack", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    return fsManager.importCurseForgeZip(result.filePaths[0], (progress) => {
      // Send progress to renderer
      if (win) {
        win.webContents.send("cf-import-progress", progress);
      }
    });
  });

  // Get share info for a modpack
  ipcMain.handle("share:getInfo", async (_, modpackId: string) => {
    const manifestPath = path.join(fsManager.getModpackPath(modpackId), "modpack.json");
    if (await fs.pathExists(manifestPath)) {
      const manifest = await fs.readJson(manifestPath);
      return {
        shareCode: manifest.share_code || null,
        lastSync: manifest.last_sync || null,
      };
    }
    return { shareCode: null, lastSync: null };
  });

  // Generate share code preview
  ipcMain.handle("share:generateCode", async (_, modpackId: string) => {
    const { code, checksum } = await fsManager.createShareManifest(modpackId);
    return { code, checksum };
  });

  // ==================== MOD UPDATES ====================

  // Initialize update service
  updateService = new ModUpdateService(fsManager.getBasePath());
  curseforgeService = new CurseForgeService(fsManager.getBasePath());
  
  // Connect CurseForge service to FileSystemManager for downloads
  fsManager.setCurseForgeService(curseforgeService);

  // Set API key
  ipcMain.handle("updates:setApiKey", async (_, source: "curseforge" | "modrinth", apiKey: string) => {
    await updateService.saveApiKey(source, apiKey);
    // Also update CurseForge service
    if (source === "curseforge") {
      await curseforgeService.setApiKey(apiKey);
    }
    return { success: true };
  });

  // Get API key
  ipcMain.handle("updates:getApiKey", async (_, source: "curseforge" | "modrinth") => {
    return updateService.getApiKey(source);
  });

  // Check update for single mod
  ipcMain.handle("updates:checkMod", async (_, modId: string) => {
    const mod = await fsManager.getModById(modId);
    if (!mod) throw new Error("Mod not found");
    
    // For CurseForge mods without local file, check via CF API
    if (!mod.path && mod.cf_project_id && mod.cf_file_id) {
      return updateService.checkCurseForgeModUpdate(
        mod.id,
        mod.cf_project_id,
        mod.cf_file_id,
        mod.version,
        mod.game_version,
        mod.loader
      );
    }
    
    if (!mod.path) throw new Error("Mod has no local file and no CurseForge info");
    
    return updateService.checkForUpdate(
      mod.id,
      mod.path,
      mod.version,
      mod.game_version,
      mod.loader
    );
  });

  // Check updates for all mods in library
  // Each mod checks for updates compatible with ITS OWN game_version
  ipcMain.handle("updates:checkAll", async () => {
    const mods = await fsManager.getAllMods();
    
    // Separate local mods and CF mods
    const localMods = mods.filter(m => m.path);
    const cfMods = mods.filter(m => !m.path && m.cf_project_id && m.cf_file_id);
    
    // Check local mods via fingerprint - use each mod's own game_version
    const localResults = await updateService.checkModpackUpdates(
      localMods.map(m => ({
        id: m.id,
        path: m.path!,
        version: m.version,
        game_version: m.game_version, // Use mod's own version
        loader: m.loader,
      }))
    );
    
    // Check CF mods via API - use each mod's own game_version
    const cfResults = await Promise.all(
      cfMods.map(m => updateService.checkCurseForgeModUpdate(
        m.id,
        m.cf_project_id!,
        m.cf_file_id!,
        m.version,
        m.game_version, // Use mod's own version
        m.loader
      ))
    );
    
    return [...localResults, ...cfResults];
  });

  // Check updates for mods in a modpack (uses modpack's MC version and loader)
  ipcMain.handle("updates:checkModpack", async (_, modpackId: string) => {
    const modpack = await fsManager.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");
    
    const mods = await fsManager.getModsInModpack(modpackId);
    
    // Use modpack's minecraft_version and loader - REQUIRED for modpack updates
    const mcVersion = modpack.minecraft_version;
    const loader = modpack.loader;
    
    if (!mcVersion || !loader) {
      throw new Error("Modpack must have minecraft_version and loader set to check for updates");
    }
    
    // Separate local mods and CF mods in the modpack
    const localMods = mods.filter(m => m.path);
    const cfMods = mods.filter(m => m.cf_project_id && m.cf_file_id);
    
    // Check local mods - override with modpack's version/loader
    const localResults = await updateService.checkModpackUpdates(
      localMods.map(m => ({
        id: m.id,
        path: m.path!,
        version: m.version,
        game_version: mcVersion,
        loader: loader,
      }))
    );
    
    // Check CF mods - override with modpack's version/loader
    const cfResults = await Promise.all(
      cfMods.map(m => updateService.checkCurseForgeModUpdate(
        m.id,
        m.cf_project_id!,
        m.cf_file_id!,
        m.version,
        mcVersion,
        loader
      ))
    );
    
    return [...localResults, ...cfResults];
  });

  // Download and apply update
  ipcMain.handle("updates:applyUpdate", async (_, modId: string, downloadUrl: string) => {
    const mod = await fsManager.getModById(modId);
    if (!mod) throw new Error("Mod not found");
    if (!mod.path) throw new Error("Mod has no local file");

    const modDir = path.dirname(mod.path);
    const result = await updateService.downloadUpdate(downloadUrl, modDir, mod.path);

    if (result.success && result.newPath) {
      // Re-scan the new mod file to update metadata (use static method)
      const newModInfo = await JarScanner.scanJarFile(result.newPath);
      
      if (newModInfo) {
        // Update mod in database
        await fsManager.updateMod(modId, {
          filename: path.basename(result.newPath),
          name: newModInfo.name,
          version: newModInfo.version,
          path: result.newPath,
        });
      }
    }

    return result;
  });

  // Update mod in modpack (for propagating updates)
  ipcMain.handle("updates:applyModpackUpdate", async (_, modpackId: string, modId: string, downloadUrl: string) => {
    const modpackPath = fsManager.getModpackPath(modpackId);
    const modsDir = path.join(modpackPath, "mods");
    
    // Find the mod file in the modpack
    const mods = await fsManager.getModsInModpack(modpackId);
    const mod = mods.find(m => m.id === modId);
    
    if (!mod) throw new Error("Mod not found in modpack");

    // The mod path in modpack is inside the modpack's mods folder
    const modPath = path.join(modsDir, mod.filename);
    
    const result = await updateService.downloadUpdate(downloadUrl, modsDir, modPath);
    
    return result;
  });

  // Refresh mod metadata from CurseForge API
  ipcMain.handle("mods:refreshMetadata", async (_, modId: string) => {
    const mod = await fsManager.getModById(modId);
    if (!mod) throw new Error("Mod not found");
    if (!mod.path) throw new Error("Mod has no local file");

    const apiMetadata = await updateService.getModMetadataFromApi(mod.path);
    
    if (apiMetadata) {
      const updates: Partial<typeof mod> = {};
      
      if (apiMetadata.loader && apiMetadata.loader !== 'unknown') {
        updates.loader = apiMetadata.loader;
      }
      if (apiMetadata.game_version && apiMetadata.game_version !== 'unknown') {
        updates.game_version = apiMetadata.game_version;
      }
      if (apiMetadata.name && mod.name === mod.filename) {
        updates.name = apiMetadata.name;
      }
      
      if (Object.keys(updates).length > 0) {
        await fsManager.updateMod(modId, updates);
        return { success: true, updates };
      }
    }
    
    return { success: false, error: "Could not get metadata from API" };
  });

  // Refresh all mods metadata
  ipcMain.handle("mods:refreshAllMetadata", async () => {
    const mods = await fsManager.getAllMods();
    let updated = 0;
    let failed = 0;

    for (const mod of mods) {
      // Skip mods that already have proper metadata or no local file
      if (!mod.path || (mod.loader !== 'unknown' && mod.game_version !== 'unknown')) {
        continue;
      }

      try {
        const apiMetadata = await updateService.getModMetadataFromApi(mod.path);
        
        if (apiMetadata) {
          const updates: Partial<typeof mod> = {};
          
          if (apiMetadata.loader && apiMetadata.loader !== 'unknown' && mod.loader === 'unknown') {
            updates.loader = apiMetadata.loader;
          }
          if (apiMetadata.game_version && apiMetadata.game_version !== 'unknown' && mod.game_version === 'unknown') {
            updates.game_version = apiMetadata.game_version;
          }
          if (apiMetadata.name && mod.name === mod.filename) {
            updates.name = apiMetadata.name;
          }
          
          if (Object.keys(updates).length > 0) {
            await fsManager.updateMod(mod.id, updates);
            updated++;
          }
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return { updated, failed, total: mods.length };
  });

  // ==================== CURSEFORGE API ====================

  // Check if API key is set
  ipcMain.handle("curseforge:hasApiKey", async () => {
    return curseforgeService.hasApiKey();
  });

  // Search mods
  ipcMain.handle("curseforge:search", async (_, options: {
    query?: string;
    gameVersion?: string;
    modLoader?: string;
    categoryId?: number;
    pageSize?: number;
    index?: number;
  }) => {
    return curseforgeService.searchMods(options);
  });

  // Get single mod
  ipcMain.handle("curseforge:getMod", async (_, modId: number) => {
    return curseforgeService.getMod(modId);
  });

  // Get mod files
  ipcMain.handle("curseforge:getModFiles", async (_, modId: number, options?: {
    gameVersion?: string;
    modLoader?: string;
  }) => {
    return curseforgeService.getModFiles(modId, options);
  });

  // Get categories
  ipcMain.handle("curseforge:getCategories", async () => {
    return curseforgeService.getCategories();
  });

  // Get popular mods
  ipcMain.handle("curseforge:getPopular", async (_, gameVersion?: string, modLoader?: string) => {
    return curseforgeService.getPopularMods(gameVersion, modLoader);
  });

  // Download mod file
  ipcMain.handle("curseforge:downloadMod", async (_, modId: number, fileId: number, destPath: string) => {
    return curseforgeService.downloadFile(modId, fileId, destPath, (percent) => {
      win?.webContents.send("download-progress", { modId, fileId, percent });
    });
  });

  // Add mod from CurseForge to library
  ipcMain.handle("mods:addFromCurseForge", async (_, projectId: number, fileId: number, preferredLoader?: string) => {
    try {
      // Get mod and file info from CurseForge
      const cfMod = await curseforgeService.getMod(projectId);
      if (!cfMod) throw new Error("Mod not found on CurseForge");

      const cfFile = await curseforgeService.getFile(projectId, fileId);
      if (!cfFile) throw new Error("File not found on CurseForge");

      // Convert to our library format, passing the preferred loader
      const modData = curseforgeService.modToLibraryFormat(cfMod, cfFile, preferredLoader);

      // Create mod entry in database (without downloading the file)
      const mod: Mod = {
        id: `cf-${projectId}-${fileId}`, // Unique ID based on CF IDs
        filename: modData.filename,
        name: modData.name,
        version: modData.version,
        game_version: modData.game_version,
        loader: modData.loader,
        description: modData.description,
        author: modData.author,
        path: "", // No local path yet
        hash: "",
        created_at: new Date().toISOString(),
        size: modData.file_size,
        cf_project_id: projectId,
        cf_file_id: fileId,
        thumbnail_url: modData.thumbnail_url || undefined,
        download_count: modData.download_count,
        release_type: modData.release_type,
        date_released: modData.date_released,
        source: "curseforge",
      };

      // Add to database
      await fsManager.addMod(mod);

      return mod;
    } catch (err) {
      console.error("Failed to add mod from CurseForge:", err);
      return null;
    }
  });
}

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  initializeBackend();
  createWindow();
});
