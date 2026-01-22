/**
 * Electron Main Process - Metadata-Only Architecture
 *
 * Uses MetadataManager for pure JSON storage.
 * No file downloads, no JAR scanning.
 */

import {
  app,
  BrowserWindow,
  protocol,
  net,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs-extra";
import MetadataManager from "./services/MetadataManager.js";
import { CurseForgeService } from "./services/CurseForgeService.js";
import { ModAnalyzerService } from "./services/ModAnalyzerService.js";
import { getDownloadService } from "./services/DownloadService.js";
import { MinecraftService } from "./services/MinecraftService.js";
import { ImageCacheService } from "./services/ImageCacheService.js";
import { ModpackAnalyzerService } from "./services/ModpackAnalyzerService.js";
import { InstanceService } from "./services/InstanceService.js";
import { ConfigService } from "./services/ConfigService.js";
import { GistService } from "./services/GistService.js";
import { GameService } from "./services/GameService.js";
import { HytaleService } from "./services/HytaleService.js";
import { Logger, createLogger } from "./services/LoggerService.js";
import { registerAllHandlers } from "./ipc/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;
let metadataManager: MetadataManager;
let curseforgeService: CurseForgeService;
let modAnalyzerService: ModAnalyzerService;
let minecraftService: MinecraftService;
let imageCacheService: ImageCacheService;
let modpackAnalyzerService: ModpackAnalyzerService;
let instanceService: InstanceService;
let configService: ConfigService;
let gistService: GistService;
let gameService: GameService;
let hytaleService: HytaleService;

// Register custom protocol for local file access (thumbnails cache)
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

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Create main logger
const log = createLogger("Main");

async function initializeBackend() {
  // Initialize logging system first
  await Logger.initialize();
  log.info("Starting backend initialization");

  metadataManager = new MetadataManager();
  curseforgeService = new CurseForgeService(metadataManager.getBasePath());
  modAnalyzerService = new ModAnalyzerService(curseforgeService);
  minecraftService = new MinecraftService(metadataManager.getBasePath());
  imageCacheService = new ImageCacheService(metadataManager.getBasePath());
  modpackAnalyzerService = new ModpackAnalyzerService();
  instanceService = new InstanceService(metadataManager.getBasePath());
  configService = new ConfigService(metadataManager.getBasePath());
  gistService = new GistService(metadataManager.getBasePath());
  gameService = new GameService(metadataManager.getBasePath());
  hytaleService = new HytaleService(metadataManager.getBasePath());

  // Connect instanceService to metadataManager for version control integration
  metadataManager.setInstanceService(instanceService);

  // Initialize services
  await imageCacheService.initialize();
  await minecraftService.detectInstallations();
  await instanceService.initialize();
  await gameService.initialize();
  await hytaleService.initialize();

  // Register atom:// protocol for cached images
  protocol.handle("atom", (request) => {
    const filePath = decodeURIComponent(request.url.replace("atom:///", ""));
    const normalizedPath = path.normalize(filePath);

    if (normalizedPath.includes("..") || !path.isAbsolute(normalizedPath)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!fs.existsSync(normalizedPath)) {
      return new Response("Not Found", { status: 404 });
    }

    return net.fetch("file:///" + normalizedPath);
  });

  // ========== REGISTER MODULAR IPC HANDLERS ==========
  // These handlers have been extracted to separate files for better maintainability
  registerAllHandlers({
    metadataManager,
    imageCacheService,
    gistService,
    minecraftService,
    gameService,
    curseforgeService,
    hytaleService,
    modAnalyzerService,
    modpackAnalyzerService,
    configService,
    instanceService,
    getDownloadService,
    getWindow: () => win,
    getMainWindow: () => win,
    log,
    VITE_DEV_SERVER_URL,
  });

  // NOTE: curseforge:* handlers are now in ipc/curseforge.ipc.ts

  // NOTE: modpacks:* handlers (38 handlers) are now in ipc/modpacks.ipc.ts

  // NOTE: versions:* handlers (7 handlers) are now in ipc/versions.ipc.ts

  // NOTE: remote:* handlers (3 handlers) are now in ipc/remote.ipc.ts

  // NOTE: export:* handlers (4 handlers) are now in ipc/export.ipc.ts

  // NOTE: import:* handlers (6 handlers) are now in ipc/import.ipc.ts

  // NOTE: updates:* handlers (9 handlers) and autoUpdater setup are now in ipc/updates.ipc.ts

  // NOTE: analyzer:* handlers are now in ipc/analyzer.ipc.ts

  // NOTE: gist:* handlers are now in ipc/gist.ipc.ts

  // NOTE: dialogs:selectZipFile and dialogs:selectImage are now in ipc/dialogs.ipc.ts

  // NOTE: minecraft:* handlers are now in ipc/minecraft.ipc.ts

  // NOTE: instance:* handlers (25 handlers) are now in ipc/instance.ipc.ts

  // NOTE: preview:* handlers (4 handlers) are now in ipc/preview.ipc.ts

  // NOTE: mods:getPaginated is now in ipc/mods.ipc.ts

  // NOTE: config:* handlers (22 handlers) are now in ipc/config.ipc.ts

  // NOTE: game:* handlers are now in ipc/game.ipc.ts

  // NOTE: hytale:* handlers are now in ipc/hytale.ipc.ts

  // NOTE: system:* handlers are now in ipc/system.ipc.ts

  // NOTE: logging:* handlers are now in ipc/logging.ipc.ts

  log.info("Backend initialization complete");
}

// Quit when all windows are closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

// Graceful shutdown
app.on("before-quit", async () => {
  log.info("Application shutting down");
  await Logger.shutdown();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  await initializeBackend();
  createWindow();
});
