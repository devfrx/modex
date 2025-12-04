import { app, BrowserWindow, ipcMain, dialog, protocol, net } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ModDatabase, { Mod, Modpack } from "./database/ModDatabase.js";
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
let db: ModDatabase;

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
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Initialize database and IPC handlers
async function initializeBackend() {
  db = new ModDatabase();
  // Note: db.init() is called in constructor but is async,
  // operations will wait for ensureDb() internally

  // Register atom:// protocol to serve local files
  protocol.handle("atom", (request) => {
    const filePath = request.url.replace("atom:///", "");
    return net.fetch("file:///" + filePath);
  });

  // ========== MOD IPC HANDLERS ==========

  ipcMain.handle("mods:getAll", async () => {
    return db.getAllMods();
  });

  ipcMain.handle("mods:getById", async (_, id: string) => {
    return db.getModById(id);
  });

  ipcMain.handle("mods:add", async (_, mod: Omit<Mod, "id" | "created_at">) => {
    return db.addMod(mod);
  });

  ipcMain.handle("mods:update", async (_, id: string, mod: Partial<Mod>) => {
    db.updateMod(id, mod);
    return true;
  });

  ipcMain.handle("mods:delete", async (_, id: string) => {
    db.deleteMod(id);
    return true;
  });

  // ========== MODPACK IPC HANDLERS ==========

  ipcMain.handle("modpacks:getAll", async () => {
    return db.getAllModpacks();
  });

  ipcMain.handle("modpacks:getById", async (_, id: string) => {
    return db.getModpackById(id);
  });

  ipcMain.handle(
    "modpacks:add",
    async (_, modpack: Omit<Modpack, "id" | "created_at">) => {
      return db.addModpack(modpack);
    }
  );

  ipcMain.handle(
    "modpacks:update",
    async (_, id: string, modpack: Partial<Modpack>) => {
      db.updateModpack(id, modpack);
      return true;
    }
  );

  ipcMain.handle("modpacks:delete", async (_, id: string) => {
    db.deleteModpack(id);
    return true;
  });

  ipcMain.handle("modpacks:getMods", async (_, modpackId: string) => {
    return db.getModsInModpack(modpackId);
  });

  ipcMain.handle(
    "modpacks:addMod",
    async (_, modpackId: string, modId: string) => {
      db.addModToModpack(modpackId, modId);
      return true;
    }
  );

  ipcMain.handle(
    "modpacks:removeMod",
    async (_, modpackId: string, modId: string) => {
      db.removeModFromModpack(modpackId, modId);
      return true;
    }
  );

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

    // Copy image to userData folder
    const sourcePath = result.filePaths[0];
    const userDataPath = app.getPath("userData");
    const imagesDir = path.join(userDataPath, "modpack-images");
    await fs.ensureDir(imagesDir);

    const filename = `${crypto.randomUUID()}${path.extname(sourcePath)}`;
    const destPath = path.join(imagesDir, filename);
    await fs.copy(sourcePath, destPath);

    return destPath;
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
    const { shell } = await import("electron");
    shell.showItemInFolder(folderPath);
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

  ipcMain.handle(
    "scanner:importMods",
    async (_, metadata: Omit<Mod, "id" | "created_at">[]) => {
      try {
        const ids = await Promise.all(metadata.map((mod) => db.addMod(mod)));
        return ids;
      } catch (error: any) {
        console.error("Import error:", error);
        throw new Error(error.message);
      }
    }
  );

  ipcMain.handle("scanner:importModpack", async (_, zipPath: string) => {
    try {
      const tempDir = path.join(
        app.getPath("temp"),
        "modex-import-" + Date.now()
      );
      await fs.ensureDir(tempDir);

      // 1. Extract ZIP
      await JarScanner.extractZip(zipPath, tempDir);

      // 2. Scan for JARs
      const metadata = await JarScanner.scanDirectory(tempDir);

      // 3. Clean up temp dir
      await fs.remove(tempDir);

      return metadata;
    } catch (error: any) {
      console.error("Modpack import error:", error);
      throw new Error(error.message);
    }
  });

  ipcMain.handle(
    "scanner:exportModpack",
    async (_, modpackId: string, exportPath: string) => {
      try {
        const modpack = await db.getModpackById(modpackId);
        if (!modpack) throw new Error("Modpack not found");

        const mods = await db.getModsInModpack(modpackId);

        // Create manifest.json
        const manifest = {
          minecraft: {
            version: mods[0]?.game_version || "1.20.1",
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

        // Create ZIP with manifest and overrides/mods/
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

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    db?.close();
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  initializeBackend();
  createWindow();
});
