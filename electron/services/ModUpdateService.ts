import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as path from "path";

// ==================== TYPES ====================

export interface ModUpdateInfo {
  modId: string;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  updateUrl: string | null;
  downloadUrl: string | null;
  source: "curseforge" | "modrinth" | "unknown";
  projectId: string | null;
  projectName: string | null;
  changelog: string | null;
  releaseDate: string | null;
  debugInfo?: string; // Per debug
}

export interface ModSourceInfo {
  source: "curseforge" | "modrinth" | "unknown";
  projectId: string | null;
  fileId: string | null;
}

interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  downloadUrl: string | null;
  gameVersions: string[];
  releaseType: number; // 1=release, 2=beta, 3=alpha
  fileFingerprint: number;
}

interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  latestFiles: CurseForgeFile[];
  latestFilesIndexes: { gameVersion: string; fileId: number; modLoader: number }[];
}

interface CurseForgeFingerprintMatch {
  id: number;
  file: CurseForgeFile;
  latestFiles: CurseForgeFile[];
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  name: string;
  date_published: string;
  files: { url: string; filename: string; primary: boolean; hashes: { sha512: string } }[];
  game_versions: string[];
  loaders: string[];
  changelog: string;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  versions: string[];
}

// ==================== SERVICE ====================

// Debug mode
const DEBUG = true;
function debugLog(...args: any[]) {
  if (DEBUG) console.log("[ModUpdateService]", ...args);
}

// CurseForge ModLoader enum mapping
// From: https://docs.curseforge.com/#tocS_ModLoaderType
const CURSEFORGE_MODLOADER_MAP: Record<number, string> = {
  0: 'any',
  1: 'forge',
  2: 'cauldron',
  3: 'liteloader',
  4: 'fabric',
  5: 'quilt',
  6: 'neoforge',
};

export class ModUpdateService {
  // CurseForge API - Richiede API Key (gratuita)
  // Registrati su https://console.curseforge.com/ per ottenere una API key
  private curseforgeApiKey: string = "";
  private curseforgeApiUrl = "https://api.curseforge.com/v1";

  // Modrinth API - Non richiede API Key
  private modrinthApiUrl = "https://api.modrinth.com/v2";

  // Minecraft Game ID per CurseForge
  private readonly MINECRAFT_GAME_ID = 432;

  // Cache per evitare troppe richieste
  private updateCache: Map<string, { data: ModUpdateInfo; timestamp: number }> = new Map();
  private cacheDuration = 5 * 60 * 1000; // 5 minuti

  constructor(private configPath: string) {
    this.loadConfig();
  }

  private async loadConfig() {
    const configFile = path.join(this.configPath, "update-config.json");
    if (await fs.pathExists(configFile)) {
      const config = await fs.readJson(configFile);
      this.curseforgeApiKey = config.curseforgeApiKey || "";
    }
  }

  async saveApiKey(source: "curseforge" | "modrinth", apiKey: string): Promise<void> {
    const configFile = path.join(this.configPath, "update-config.json");
    let config: any = {};

    if (await fs.pathExists(configFile)) {
      config = await fs.readJson(configFile);
    }

    if (source === "curseforge") {
      config.curseforgeApiKey = apiKey;
      this.curseforgeApiKey = apiKey;
    }

    await fs.writeJson(configFile, config, { spaces: 2 });
  }

  async getApiKey(source: "curseforge" | "modrinth"): Promise<string> {
    if (source === "curseforge") {
      return this.curseforgeApiKey;
    }
    return ""; // Modrinth non richiede API key
  }

  /**
   * Rileva la fonte della mod analizzando il file JAR
   */
  async detectModSource(modPath: string): Promise<ModSourceInfo> {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(modPath);

      // Cerca fabric.mod.json o mods.toml per info
      const fabricMod = zip.getEntry("fabric.mod.json");
      const forgeMod = zip.getEntry("META-INF/mods.toml");

      let modInfo: any = null;

      if (fabricMod) {
        modInfo = JSON.parse(fabricMod.getData().toString("utf8"));
      } else if (forgeMod) {
        // Parse TOML basico
        const tomlContent = forgeMod.getData().toString("utf8");
        modInfo = this.parseBasicToml(tomlContent);
      }

      if (modInfo) {
        // Cerca riferimenti a CurseForge o Modrinth nei metadati
        const contact = modInfo.contact || modInfo.custom || {};

        // CurseForge
        if (contact.curseforge || contact.homepage?.includes("curseforge")) {
          const cfUrl = contact.curseforge || contact.homepage;
          const projectId = this.extractCurseForgeId(cfUrl);
          return { source: "curseforge", projectId, fileId: null };
        }

        // Modrinth
        if (contact.modrinth || contact.homepage?.includes("modrinth")) {
          const mrUrl = contact.modrinth || contact.homepage;
          const projectId = this.extractModrinthId(mrUrl);
          return { source: "modrinth", projectId, fileId: null };
        }
      }

      return { source: "unknown", projectId: null, fileId: null };
    } catch (err) {
      console.error("Failed to detect mod source:", err);
      return { source: "unknown", projectId: null, fileId: null };
    }
  }

  /**
   * Ottiene i metadati corretti di una mod da CurseForge
   * Ritorna loader e game_version estratti dalle API
   */
  async getModMetadataFromApi(filePath: string): Promise<{
    loader: string;
    game_version: string;
    name?: string;
    source: string;
    projectId?: string;
  } | null> {
    if (!this.curseforgeApiKey) {
      return null;
    }

    const filename = path.basename(filePath, '.jar');

    try {
      const result = await this.findModByHash(filePath);

      if (result?.currentFile && result.sourceInfo.projectId) {
        const file = result.currentFile;
        const projectId = result.sourceInfo.projectId;

        // Usa l'endpoint GET /v1/mods/{modId} per ottenere info complete
        const modInfo = await this.getModById(parseInt(projectId));

        if (modInfo) {
          return this.extractMetadataFromModInfo(modInfo, file, projectId, filename);
        }
      }

      // Fallback: cerca per nome se fingerprint non ha trovato nulla
      debugLog(`Fingerprint not found for ${filename}, trying search...`);
      const searchResult = await this.searchModByName(filename);

      if (searchResult) {
        debugLog(`Found mod by search: ${searchResult.name} (${searchResult.id})`);
        return this.extractMetadataFromModInfo(
          searchResult,
          undefined,
          searchResult.id.toString(),
          filename
        );
      }

    } catch (err) {
      console.error("Failed to get mod metadata from API:", err);
    }

    return null;
  }

  /**
   * Estrae loader e game_version da modInfo
   */
  private extractMetadataFromModInfo(
    modInfo: any,
    currentFile: CurseForgeFile | undefined,
    projectId: string,
    filename: string
  ): { loader: string; game_version: string; name?: string; source: string; projectId?: string } {
    let loader = 'unknown';
    let game_version = 'unknown';

    // Se abbiamo il file corrente, cerca in latestFilesIndexes
    if (currentFile) {
      const fileIndex = modInfo.latestFilesIndexes?.find(
        (idx: any) => idx.fileId === currentFile.id
      );

      if (fileIndex) {
        if (fileIndex.modLoader !== undefined) {
          loader = CURSEFORGE_MODLOADER_MAP[fileIndex.modLoader] || 'unknown';
        }
        if (fileIndex.gameVersion) {
          game_version = fileIndex.gameVersion;
        }
      }

      // Fallback: estrai dalle gameVersions del file
      if (loader === 'unknown' || game_version === 'unknown') {
        const gameVersions = currentFile.gameVersions || [];
        for (const gv of gameVersions) {
          const lower = gv.toLowerCase();
          if (loader === 'unknown' && ['forge', 'fabric', 'quilt', 'neoforge'].includes(lower)) {
            loader = lower;
          }
          if (game_version === 'unknown' && /^1\.\d+(\.\d+)?$/.test(gv)) {
            game_version = gv;
          }
        }
      }
    } else {
      // Usa latestFilesIndexes per determinare loader/versione più comune
      const indexes = modInfo.latestFilesIndexes || [];
      if (indexes.length > 0) {
        // Prendi il primo index (più recente)
        const firstIndex = indexes[0];
        if (firstIndex.modLoader !== undefined) {
          loader = CURSEFORGE_MODLOADER_MAP[firstIndex.modLoader] || 'unknown';
        }
        if (firstIndex.gameVersion) {
          game_version = firstIndex.gameVersion;
        }
      }
    }

    const name = modInfo.name;

    debugLog(`API Metadata for ${filename}: loader=${loader}, game_version=${game_version}, name=${name}`);

    return {
      loader,
      game_version,
      name,
      source: 'curseforge',
      projectId,
    };
  }

  /**
   * Ottiene info su una mod da CurseForge usando GET /v1/mods/{modId}
   */
  async getModById(modId: number): Promise<any | null> {
    if (!this.curseforgeApiKey) return null;

    try {
      const response = await fetch(`${this.curseforgeApiUrl}/mods/${modId}`, {
        method: "GET",
        headers: {
          "x-api-key": this.curseforgeApiKey,
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || null;
      }
    } catch (err) {
      console.error("Failed to get mod by ID:", err);
    }

    return null;
  }

  /**
   * Cerca una mod su CurseForge per nome (fallback quando fingerprint non trova nulla)
   */
  async searchModByName(
    modName: string,
    gameVersion?: string,
    modLoader?: number
  ): Promise<any | null> {
    if (!this.curseforgeApiKey) return null;

    try {
      const params = new URLSearchParams({
        gameId: this.MINECRAFT_GAME_ID.toString(),
        searchFilter: modName,
        pageSize: '5',
        sortField: '2', // Popularity
        sortOrder: 'desc',
      });

      if (gameVersion) {
        params.append('gameVersion', gameVersion);
      }

      if (modLoader !== undefined) {
        params.append('modLoaderType', modLoader.toString());
      }

      const url = `${this.curseforgeApiUrl}/mods/search?${params}`;
      debugLog(`Searching mods: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-api-key": this.curseforgeApiKey,
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.length > 0) {
          // Trova il match migliore per nome
          const exactMatch = data.data.find(
            (m: any) => m.name.toLowerCase() === modName.toLowerCase() ||
              m.slug.toLowerCase() === modName.toLowerCase().replace(/\s+/g, '-')
          );
          return exactMatch || data.data[0];
        }
      }
    } catch (err) {
      console.error("Failed to search mod by name:", err);
    }

    return null;
  }

  /**
   * Cerca una mod su CurseForge per hash (metodo più affidabile)
   */
  async findModByHash(filePath: string): Promise<{ sourceInfo: ModSourceInfo; currentFile?: CurseForgeFile; latestFiles?: CurseForgeFile[] } | null> {
    if (!this.curseforgeApiKey) {
      debugLog("No CurseForge API key set");
      return null;
    }

    try {
      // CurseForge usa fingerprint (murmur2 hash)
      const fileBuffer = await fs.readFile(filePath);
      const fingerprint = this.computeMurmur2(fileBuffer);

      debugLog(`Computed fingerprint for ${path.basename(filePath)}: ${fingerprint}`);

      // Usa l'endpoint corretto con gameId nel path
      const url = `${this.curseforgeApiUrl}/fingerprints/${this.MINECRAFT_GAME_ID}`;
      debugLog(`Calling: POST ${url}`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.curseforgeApiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ fingerprints: [fingerprint] }),
      });

      debugLog(`Response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        debugLog(`Fingerprint response:`, JSON.stringify(data, null, 2).substring(0, 500));

        if (data.data?.exactMatches?.length > 0) {
          const match: CurseForgeFingerprintMatch = data.data.exactMatches[0];
          debugLog(`Found exact match: mod ${match.id}, file ${match.file.id}`);
          return {
            sourceInfo: {
              source: "curseforge",
              projectId: match.id.toString(),
              fileId: match.file.id.toString(),
            },
            currentFile: match.file,
            latestFiles: match.latestFiles,
          };
        } else {
          debugLog("No exact fingerprint matches found");
        }
      } else {
        const errorText = await response.text();
        debugLog(`Fingerprint API error: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      console.error("CurseForge fingerprint lookup failed:", err);
    }

    return null;
  }

  /**
   * Controlla aggiornamenti per una mod
   */
  async checkForUpdate(
    modId: string,
    modPath: string,
    currentVersion: string,
    gameVersion: string,
    loader: string
  ): Promise<ModUpdateInfo> {
    debugLog(`\n=== Checking update for: ${modId} ===`);
    debugLog(`  Path: ${modPath}`);
    debugLog(`  Current Version: ${currentVersion}`);
    debugLog(`  Game Version: ${gameVersion}`);
    debugLog(`  Loader: ${loader}`);

    // Check cache
    const cached = this.updateCache.get(modId);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      debugLog("Returning cached result");
      return cached.data;
    }

    const result: ModUpdateInfo = {
      modId,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      updateUrl: null,
      downloadUrl: null,
      source: "unknown",
      projectId: null,
      projectName: null,
      changelog: null,
      releaseDate: null,
      debugInfo: "",
    };

    try {
      // Prima prova a trovare tramite fingerprint CurseForge (più affidabile)
      const hashResult = await this.findModByHash(modPath);

      if (hashResult && hashResult.sourceInfo.source === "curseforge") {
        debugLog("Found mod via CurseForge fingerprint");
        result.source = "curseforge";
        result.projectId = hashResult.sourceInfo.projectId;

        // Abbiamo già i file dal risultato fingerprint!
        if (hashResult.currentFile && hashResult.latestFiles) {
          const cfUpdate = await this.checkCurseForgeUpdateFromFiles(
            hashResult.sourceInfo.projectId!,
            hashResult.currentFile,
            hashResult.latestFiles,
            gameVersion,
            loader
          );
          Object.assign(result, cfUpdate);
        }
      } else {
        // Prova dai metadati del jar
        debugLog("Fingerprint not found, trying metadata detection...");
        const sourceInfo = await this.detectModSource(modPath);
        result.source = sourceInfo.source;
        result.projectId = sourceInfo.projectId;
        result.debugInfo = `Source detected from metadata: ${sourceInfo.source}`;

        if (sourceInfo.source === "curseforge" && sourceInfo.projectId) {
          debugLog(`Checking CurseForge by project ID: ${sourceInfo.projectId}`);
          const cfUpdate = await this.checkCurseForgeUpdate(
            sourceInfo.projectId,
            currentVersion,
            gameVersion,
            loader
          );
          Object.assign(result, cfUpdate);
        } else if (sourceInfo.source === "modrinth" && sourceInfo.projectId) {
          debugLog(`Checking Modrinth by project ID: ${sourceInfo.projectId}`);
          const mrUpdate = await this.checkModrinthUpdate(
            sourceInfo.projectId,
            currentVersion,
            gameVersion,
            loader
          );
          Object.assign(result, mrUpdate);
        } else {
          // Prova ricerca per nome su Modrinth (non richiede API key)
          debugLog("Trying Modrinth search by file name...");
          const mrUpdate = await this.searchModrinth(modPath, gameVersion, loader);
          if (mrUpdate) {
            Object.assign(result, mrUpdate);
          } else {
            result.debugInfo = "Mod not found on CurseForge or Modrinth";
          }
        }
      }
    } catch (err) {
      console.error(`Failed to check update for ${modId}:`, err);
      result.debugInfo = `Error: ${(err as Error).message}`;
    }

    debugLog(`Result: hasUpdate=${result.hasUpdate}, latestVersion=${result.latestVersion}`);

    // Cache result
    this.updateCache.set(modId, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Controlla aggiornamenti per una mod CurseForge usando cf_project_id e cf_file_id
   * (per mod senza file locale)
   */
  async checkCurseForgeModUpdate(
    modId: string,
    cfProjectId: number,
    cfFileId: number,
    currentVersion: string,
    gameVersion: string,
    loader: string,
    contentType?: "mod" | "resourcepack" | "shader"
  ): Promise<ModUpdateInfo> {
    debugLog(`\n=== Checking CF update for: ${modId} (project: ${cfProjectId}, file: ${cfFileId}) ===`);

    // Check cache
    const cached = this.updateCache.get(modId);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      debugLog("Returning cached result");
      return cached.data;
    }

    // Determine if loader is relevant (only for mods)
    const isModContent = !contentType || contentType === "mod";

    const result: ModUpdateInfo = {
      modId,
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      updateUrl: null,
      downloadUrl: null,
      source: "curseforge",
      projectId: cfProjectId.toString(),
      projectName: null,
      changelog: null,
      releaseDate: null,
      debugInfo: "",
    };

    if (!this.curseforgeApiKey) {
      result.debugInfo = "CurseForge API key not set";
      return result;
    }

    try {
      // Get mod info and files
      const modResponse = await fetch(`${this.curseforgeApiUrl}/mods/${cfProjectId}`, {
        headers: {
          "x-api-key": this.curseforgeApiKey,
          Accept: "application/json",
        },
      });

      if (!modResponse.ok) {
        result.debugInfo = `CurseForge API error: ${modResponse.status}`;
        return result;
      }

      const modData = await modResponse.json();
      const mod: CurseForgeMod = modData.data;
      result.projectName = mod.name;

      // Determine URL path based on content type
      const urlPath = contentType === "resourcepack" ? "texture-packs" :
        contentType === "shader" ? "shaders" : "mc-mods";
      result.updateUrl = `https://www.curseforge.com/minecraft/${urlPath}/${mod.slug}`;

      // Get all files for this mod
      const filesResponse = await fetch(
        `${this.curseforgeApiUrl}/mods/${cfProjectId}/files?pageSize=50`,
        {
          headers: {
            "x-api-key": this.curseforgeApiKey,
            Accept: "application/json",
          },
        }
      );

      if (!filesResponse.ok) {
        result.debugInfo = `Failed to get mod files: ${filesResponse.status}`;
        return result;
      }

      const filesData = await filesResponse.json();
      const files: CurseForgeFile[] = filesData.data || [];

      // Find current file
      const currentFile = files.find(f => f.id === cfFileId);

      // Find best matching file for current game version and loader
      const loaderLower = loader.toLowerCase();
      const matchingFiles = files.filter(f => {
        const hasGameVersion = f.gameVersions.some(gv =>
          gv === gameVersion || gv.startsWith(gameVersion) || gameVersion.startsWith(gv)
        );
        // Only check loader for mods, not for resourcepacks/shaders
        const hasLoader = isModContent ? f.gameVersions.some(gv =>
          gv.toLowerCase() === loaderLower
        ) : true;
        return hasGameVersion && hasLoader && f.releaseType === 1; // release only
      });

      // Sort by date, newest first
      matchingFiles.sort((a, b) =>
        new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
      );

      if (matchingFiles.length > 0) {
        const latestFile = matchingFiles[0];

        // Compare file IDs - newer file should have higher ID
        if (latestFile.id > cfFileId) {
          result.hasUpdate = true;
          result.latestVersion = latestFile.displayName || latestFile.fileName;
          result.downloadUrl = latestFile.downloadUrl;
          result.releaseDate = latestFile.fileDate;
          result.debugInfo = `Update available: file ${cfFileId} -> ${latestFile.id}`;
        } else {
          result.debugInfo = `Already on latest version (file ${cfFileId})`;
        }
      } else {
        // No matching files, try to find any release for this loader (or any release for non-mod content)
        const loaderFiles = isModContent ? files.filter(f =>
          f.gameVersions.some(gv => gv.toLowerCase() === loaderLower) && f.releaseType === 1
        ) : files.filter(f => f.releaseType === 1); // For non-mods, just get all releases

        if (loaderFiles.length > 0) {
          loaderFiles.sort((a, b) =>
            new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
          );
          const latestFile = loaderFiles[0];

          if (latestFile.id > cfFileId) {
            result.hasUpdate = true;
            result.latestVersion = latestFile.displayName || latestFile.fileName;
            result.downloadUrl = latestFile.downloadUrl;
            result.releaseDate = latestFile.fileDate;
            result.debugInfo = `Update available (different MC version): file ${cfFileId} -> ${latestFile.id}`;
          }
        } else {
          result.debugInfo = isModContent ? `No compatible files found for ${loader}` : `No compatible files found`;
        }
      }
    } catch (err) {
      console.error(`Failed to check CF update for ${modId}:`, err);
      result.debugInfo = `Error: ${(err as Error).message}`;
    }

    debugLog(`Result: hasUpdate=${result.hasUpdate}, latestVersion=${result.latestVersion}`);

    // Cache result
    this.updateCache.set(modId, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Controlla aggiornamenti CurseForge dai dati fingerprint
   */
  private async checkCurseForgeUpdateFromFiles(
    projectId: string,
    currentFile: CurseForgeFile,
    latestFiles: CurseForgeFile[],
    gameVersion: string,
    loader: string
  ): Promise<Partial<ModUpdateInfo>> {
    debugLog(`Checking CF update from ${latestFiles.length} available files`);
    debugLog(`Input gameVersion: ${gameVersion}, loader: ${loader}`);
    debugLog(`Current file gameVersions: ${currentFile.gameVersions?.join(', ') || 'none'}`);

    const loaderName = loader.toLowerCase();
    let compatibleFiles: CurseForgeFile[] = [];

    // Se abbiamo una versione MC specifica (da modpack), filtra per quella
    const hasSpecificVersion = gameVersion && gameVersion !== 'unknown';

    if (hasSpecificVersion) {
      debugLog(`Filtering for specific MC version: ${gameVersion}`);

      // Filtra file per la versione specifica
      compatibleFiles = latestFiles.filter(f => {
        const hasGameVersion = f.gameVersions.some(gv =>
          gv === gameVersion ||
          gv.startsWith(gameVersion) ||
          gameVersion.startsWith(gv)
        );

        const hasLoader = loaderName !== 'unknown' && f.gameVersions.some(gv =>
          gv.toLowerCase() === loaderName ||
          gv.toLowerCase().includes(loaderName)
        );

        return hasGameVersion && (hasLoader || loaderName === 'unknown');
      });

      debugLog(`Compatible files for ${gameVersion}/${loader}: ${compatibleFiles.length}`);

      // Se nessun file per questa versione, prova solo game version
      if (compatibleFiles.length === 0) {
        compatibleFiles = latestFiles.filter(f =>
          f.gameVersions.some(gv =>
            gv === gameVersion ||
            gv.startsWith(gameVersion) ||
            gameVersion.startsWith(gv)
          )
        );
        debugLog(`Files for game version only: ${compatibleFiles.length}`);
      }
    } else {
      // LIBRERIA: prendi il latest assoluto (il più recente globalmente)
      debugLog(`No specific version - taking absolute latest for library`);

      // Filtra solo per loader se specificato
      if (loaderName !== 'unknown') {
        compatibleFiles = latestFiles.filter(f =>
          f.gameVersions.some(gv =>
            gv.toLowerCase() === loaderName ||
            gv.toLowerCase().includes(loaderName)
          )
        );
        debugLog(`Files matching loader ${loaderName}: ${compatibleFiles.length}`);
      }

      // Se ancora nessun file, usa tutti
      if (compatibleFiles.length === 0) {
        compatibleFiles = latestFiles;
      }
    }

    // Se ancora nessun file, usa tutti come fallback
    if (compatibleFiles.length === 0) {
      debugLog(`No filtered files found, using all ${latestFiles.length} latest files`);
      compatibleFiles = latestFiles;
    }

    return this.compareAndReturnUpdate(projectId, currentFile, compatibleFiles);
  }

  private async compareAndReturnUpdate(
    projectId: string,
    currentFile: CurseForgeFile,
    availableFiles: CurseForgeFile[]
  ): Promise<Partial<ModUpdateInfo>> {
    // Ordina per data (più recente prima)
    const sorted = availableFiles.sort(
      (a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
    );

    const latest = sorted[0];

    debugLog(`Current file: ${currentFile.fileName} (ID: ${currentFile.id}, date: ${currentFile.fileDate})`);
    debugLog(`Latest file: ${latest.fileName} (ID: ${latest.id}, date: ${latest.fileDate})`);

    // Confronta per ID file (più affidabile) o per data
    const hasUpdate = latest.id !== currentFile.id &&
      new Date(latest.fileDate).getTime() > new Date(currentFile.fileDate).getTime();

    // Ottieni info progetto
    let projectName = null;
    try {
      const projectResponse = await fetch(`${this.curseforgeApiUrl}/mods/${projectId}`, {
        headers: { "x-api-key": this.curseforgeApiKey },
      });
      if (projectResponse.ok) {
        const projectData = await projectResponse.json();
        projectName = projectData.data?.name;
      }
    } catch (e) {
      debugLog("Failed to fetch project name");
    }

    const latestVersion = this.extractVersion(latest.fileName) || latest.displayName;

    return {
      latestVersion,
      hasUpdate,
      updateUrl: `https://www.curseforge.com/minecraft/mc-mods/${projectId}`,
      downloadUrl: latest.downloadUrl,
      projectName,
      releaseDate: latest.fileDate,
      source: "curseforge",
      debugInfo: hasUpdate
        ? `Update available: ${currentFile.fileName} -> ${latest.fileName}`
        : `Already latest: ${currentFile.fileName}`,
    };
  }

  /**
   * Cerca mod su Modrinth usando SHA-512 hash del file
   */
  private async searchModrinth(
    modPath: string,
    gameVersion: string,
    loader: string
  ): Promise<Partial<ModUpdateInfo> | null> {
    try {
      // Calcola SHA-512 del file
      const fileBuffer = await fs.readFile(modPath);
      const sha512 = crypto.createHash("sha512").update(fileBuffer).digest("hex");

      debugLog(`Searching Modrinth by SHA-512: ${sha512.substring(0, 16)}...`);

      // Cerca per hash
      const response = await fetch(`${this.modrinthApiUrl}/version_file/${sha512}?algorithm=sha512`);

      if (response.ok) {
        const version: ModrinthVersion = await response.json();
        debugLog(`Found on Modrinth: project for version ${version.version_number}`);

        // Ottieni project ID dalla versione
        const versionResponse = await fetch(`${this.modrinthApiUrl}/version/${version.id}`);
        if (!versionResponse.ok) return null;

        const versionData = await versionResponse.json();
        const projectId = versionData.project_id;

        // Ora controlla aggiornamenti
        return this.checkModrinthUpdate(projectId, version.version_number, gameVersion, loader);
      } else {
        debugLog("Hash not found on Modrinth");
      }
    } catch (err) {
      debugLog(`Modrinth search error: ${(err as Error).message}`);
    }

    return null;
  }

  /**
   * Controlla aggiornamenti su CurseForge
   */
  private async checkCurseForgeUpdate(
    projectId: string,
    currentVersion: string,
    gameVersion: string,
    loader: string
  ): Promise<Partial<ModUpdateInfo>> {
    if (!this.curseforgeApiKey) {
      return { hasUpdate: false };
    }

    try {
      // Mappa loader a modLoaderType di CurseForge
      const loaderMap: Record<string, number> = {
        forge: 1,
        fabric: 4,
        quilt: 5,
        neoforge: 6,
      };
      const modLoaderType = loaderMap[loader.toLowerCase()] || 0;

      const response = await fetch(
        `${this.curseforgeApiUrl}/mods/${projectId}/files?gameVersion=${gameVersion}&modLoaderType=${modLoaderType}`,
        {
          headers: { "x-api-key": this.curseforgeApiKey },
        }
      );

      if (!response.ok) return { hasUpdate: false };

      const data = await response.json();
      const files: CurseForgeFile[] = data.data || [];

      // Filtra solo release (releaseType === 1)
      const releases = files
        .filter((f) => f.releaseType === 1)
        .sort((a, b) => new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime());

      if (releases.length === 0) return { hasUpdate: false };

      const latest = releases[0];
      const latestVersion = this.extractVersion(latest.fileName) || latest.displayName;

      // Confronta versioni
      const hasUpdate = this.isNewerVersion(currentVersion, latestVersion);

      // Ottieni info progetto
      const projectResponse = await fetch(`${this.curseforgeApiUrl}/mods/${projectId}`, {
        headers: { "x-api-key": this.curseforgeApiKey },
      });

      let projectName = null;
      if (projectResponse.ok) {
        const projectData = await projectResponse.json();
        projectName = projectData.data?.name;
      }

      return {
        latestVersion,
        hasUpdate,
        updateUrl: `https://www.curseforge.com/minecraft/mc-mods/${projectId}`,
        downloadUrl: latest.downloadUrl,
        projectName,
        releaseDate: latest.fileDate,
        source: "curseforge",
      };
    } catch (err) {
      console.error("CurseForge API error:", err);
      return { hasUpdate: false };
    }
  }

  /**
   * Controlla aggiornamenti su Modrinth
   */
  private async checkModrinthUpdate(
    projectId: string,
    currentVersion: string,
    gameVersion: string,
    loader: string
  ): Promise<Partial<ModUpdateInfo>> {
    try {
      // Cerca versioni compatibili
      const response = await fetch(
        `${this.modrinthApiUrl}/project/${projectId}/version?game_versions=["${gameVersion}"]&loaders=["${loader.toLowerCase()}"]`
      );

      if (!response.ok) return { hasUpdate: false };

      const versions: ModrinthVersion[] = await response.json();

      if (versions.length === 0) return { hasUpdate: false };

      // Ordina per data
      const sorted = versions.sort(
        (a, b) => new Date(b.date_published).getTime() - new Date(a.date_published).getTime()
      );

      const latest = sorted[0];
      const latestVersion = latest.version_number;

      const hasUpdate = this.isNewerVersion(currentVersion, latestVersion);

      // Ottieni info progetto
      const projectResponse = await fetch(`${this.modrinthApiUrl}/project/${projectId}`);
      let projectName = null;
      if (projectResponse.ok) {
        const project: ModrinthProject = await projectResponse.json();
        projectName = project.title;
      }

      const primaryFile = latest.files.find((f) => f.primary) || latest.files[0];

      return {
        latestVersion,
        hasUpdate,
        updateUrl: `https://modrinth.com/mod/${projectId}`,
        downloadUrl: primaryFile?.url,
        projectName,
        changelog: latest.changelog,
        releaseDate: latest.date_published,
        source: "modrinth",
      };
    } catch (err) {
      console.error("Modrinth API error:", err);
      return { hasUpdate: false };
    }
  }

  /**
   * Scarica e aggiorna una mod
   */
  async downloadUpdate(
    downloadUrl: string,
    targetDir: string,
    oldFilePath: string
  ): Promise<{ success: boolean; newPath: string | null; error?: string }> {
    try {
      if (!downloadUrl) {
        return { success: false, newPath: null, error: "No download URL available" };
      }

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return { success: false, newPath: null, error: `Download failed: ${response.status}` };
      }

      // Estrai filename dall'URL o header
      let filename = downloadUrl.split("/").pop() || "mod.jar";
      const contentDisposition = response.headers.get("content-disposition");
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      const newPath = path.join(targetDir, filename);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Rimuovi vecchio file
      if (await fs.pathExists(oldFilePath)) {
        await fs.remove(oldFilePath);
      }

      // Salva nuovo file
      await fs.writeFile(newPath, buffer);

      return { success: true, newPath };
    } catch (err) {
      return { success: false, newPath: null, error: (err as Error).message };
    }
  }

  /**
   * Controlla aggiornamenti per tutte le mod di un modpack
   * Optimized with higher concurrency and reduced delays
   */
  async checkModpackUpdates(
    mods: Array<{ id: string; path: string; version: string; game_version: string; loader: string }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<ModUpdateInfo[]> {
    const results: ModUpdateInfo[] = [];
    const total = mods.length;
    let processed = 0;

    // Increased concurrency for faster checking
    const batchSize = 10;
    for (let i = 0; i < mods.length; i += batchSize) {
      const batch = mods.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (mod) => {
          const result = await this.checkForUpdate(mod.id, mod.path, mod.version, mod.game_version, mod.loader);
          processed++;
          onProgress?.(processed, total);
          return result;
        })
      );
      results.push(...batchResults);

      // Reduced delay between batches (200ms instead of 500ms)
      if (i + batchSize < mods.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return results;
  }

  // ==================== UTILITY ====================

  private extractVersion(filename: string): string | null {
    // Pattern comuni per versioni: mod-1.2.3.jar, mod_v1.2.3.jar, mod-1.20.1-1.2.3.jar
    const patterns = [
      /[-_](\d+\.\d+(?:\.\d+)?(?:[-+].+)?)\.(jar|zip)$/i,
      /[-_]v?(\d+\.\d+(?:\.\d+)?)[-_]/i,
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private isNewerVersion(current: string, latest: string): boolean {
    // Normalizza versioni
    const normalize = (v: string) => v.replace(/^v/i, "").split(/[-+]/)[0];
    const currentParts = normalize(current).split(".").map(Number);
    const latestParts = normalize(latest).split(".").map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const c = currentParts[i] || 0;
      const l = latestParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  private extractCurseForgeId(url: string): string | null {
    // https://www.curseforge.com/minecraft/mc-mods/jei/files
    const match = url.match(/curseforge\.com\/minecraft\/mc-mods\/([^\/]+)/);
    return match ? match[1] : null;
  }

  private extractModrinthId(url: string): string | null {
    // https://modrinth.com/mod/sodium
    const match = url.match(/modrinth\.com\/mod\/([^\/]+)/);
    return match ? match[1] : null;
  }

  private parseBasicToml(content: string): any {
    // Parser TOML molto basico per estrarre info
    const result: any = { contact: {} };

    const lines = content.split("\n");
    for (const line of lines) {
      if (line.includes("=")) {
        const [key, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

        if (key.trim() === "homepage" || key.trim() === "issueTracker") {
          result.contact[key.trim()] = value;
        }
      }
    }

    return result;
  }

  /**
   * Compute Murmur2 hash (usato da CurseForge per fingerprinting)
   * Implementazione semplificata - in produzione usare libreria dedicata
   */
  private computeMurmur2(data: Buffer): number {
    // Rimuovi whitespace come fa CurseForge
    const filtered = data.filter((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32);

    const seed = 1;
    const m = 0x5bd1e995;
    const r = 24;
    let h = seed ^ filtered.length;
    let i = 0;

    while (i + 4 <= filtered.length) {
      let k =
        (filtered[i] & 0xff) |
        ((filtered[i + 1] & 0xff) << 8) |
        ((filtered[i + 2] & 0xff) << 16) |
        ((filtered[i + 3] & 0xff) << 24);

      k = Math.imul(k, m) >>> 0;
      k ^= k >>> r;
      k = Math.imul(k, m) >>> 0;

      h = Math.imul(h, m) >>> 0;
      h ^= k;

      i += 4;
    }

    switch (filtered.length - i) {
      case 3:
        h ^= (filtered[i + 2] & 0xff) << 16;
      case 2:
        h ^= (filtered[i + 1] & 0xff) << 8;
      case 1:
        h ^= filtered[i] & 0xff;
        h = Math.imul(h, m) >>> 0;
    }

    h ^= h >>> 13;
    h = Math.imul(h, m) >>> 0;
    h ^= h >>> 15;

    return h >>> 0;
  }
}

export default ModUpdateService;
