import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import FileSystemManager, { Mod, Modpack } from "./services/FileSystemManager.js";
import { JarScanner } from "./services/JarScanner.js";
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
    async (_, data: { name: string; version?: string; description?: string }) => {
      return fsManager.createModpack(data);
    }
  );

  // Backward compatibility: modpacks:add calls modpacks:create
  ipcMain.handle(
    "modpacks:add",
    async (_, data: { name: string; version?: string; description?: string }) => {
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
      return fsManager.addModToModpack(modpackId, modId);
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
      await JarScanner.extractZip(zipPath, tempDir);

      // 2. Find JAR files
      const jarFiles: string[] = [];
      const findJars = async (dir: string) => {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await findJars(fullPath);
          } else if (file.endsWith(".jar")) {
            jarFiles.push(fullPath);
          }
        }
      };
      await findJars(tempDir);

      // 3. Create modpack
      const modpackId = await fsManager.createModpack({ name: modpackName });

      // 4. Import mods to library and add to modpack
      const importedMods = await fsManager.importMods(jarFiles);
      for (const mod of importedMods) {
        await fsManager.addModToModpack(modpackId, mod.id);
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

        // Create manifest.json
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

        // Create ZIP
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip();

        // Add manifest
        zip.addFile(
          "manifest.json",
          Buffer.from(JSON.stringify(manifest, null, 2))
        );

        // Add mods to overrides/mods/
        for (const mod of mods) {
          if (await fs.pathExists(mod.path)) {
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
