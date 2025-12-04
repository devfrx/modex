import { app } from "electron";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import { JarScanner, ModMetadata } from "./JarScanner.js";
import { CurseForgeService } from "./CurseForgeService";

export interface Mod {
  id: string; // CF project-file ID or hash for local mods
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path?: string; // Path assoluto nella library (optional for CF mods)
  hash?: string;
  created_at: string;
  size: number; // Dimensione file in bytes
  
  // CurseForge specific fields
  cf_project_id?: number;
  cf_file_id?: number;
  thumbnail_url?: string;
  download_count?: number;
  release_type?: 'release' | 'beta' | 'alpha';
  date_released?: string;
  source?: 'curseforge' | 'modrinth' | 'local';
}

export interface Modpack {
  id: string; // Nome cartella sanitizzato
  name: string;
  version: string;
  minecraft_version?: string; // e.g. "1.20.1", "1.21.1"
  loader?: string; // 'forge' | 'fabric' | 'quilt' | 'neoforge'
  description?: string;
  image_path?: string;
  created_at: string;
  mod_count?: number;
}

interface ModpackManifest {
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  created_at: string;
}

/**
 * File System Manager - gestisce mods e modpacks come file/cartelle
 * 
 * Struttura:
 * userData/modex/
 *   library/           <- Libreria mod (file .jar)
 *   modpacks/          <- Cartelle modpack
 *     MyModpack/
 *       modpack.json   <- Metadati
 *       cover.png      <- Immagine (opzionale)
 *       mods/          <- Mod del modpack (copie o hardlink)
 */
export class FileSystemManager {
  private baseDir: string;
  private libraryDir: string;
  private modpacksDir: string;
  private curseforgeService: CurseForgeService | null = null;

  constructor() {
    this.baseDir = path.join(app.getPath("userData"), "modex");
    this.libraryDir = path.join(this.baseDir, "library");
    this.modpacksDir = path.join(this.baseDir, "modpacks");
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    await fs.ensureDir(this.baseDir);
    await fs.ensureDir(this.libraryDir);
    await fs.ensureDir(this.modpacksDir);
  }

  // ==================== PATHS ====================

  getLibraryPath(): string {
    return this.libraryDir;
  }

  setCurseForgeService(service: CurseForgeService): void {
    this.curseforgeService = service;
  }

  getModpacksPath(): string {
    return this.modpacksDir;
  }

  getModpackPath(modpackId: string): string {
    return path.join(this.modpacksDir, modpackId);
  }

  // ==================== MODS (LIBRARY) ====================

  private modsDbPath: string = "";

  private async initModsDb() {
    this.modsDbPath = path.join(this.baseDir, "mods.json");
    if (!await fs.pathExists(this.modsDbPath)) {
      await fs.writeJson(this.modsDbPath, { mods: [] }, { spaces: 2 });
    }
  }

  private async loadModsDb(): Promise<{ mods: Mod[] }> {
    await this.initModsDb();
    try {
      return await fs.readJson(this.modsDbPath);
    } catch {
      return { mods: [] };
    }
  }

  private async saveModsDb(data: { mods: Mod[] }): Promise<void> {
    await this.initModsDb();
    await fs.writeJson(this.modsDbPath, data, { spaces: 2 });
  }

  /**
   * Ottiene tutte le mod dalla libreria (database + filesystem per retrocompatibilità)
   */
  async getAllMods(): Promise<Mod[]> {
    await this.ensureDirectories();
    
    // Load from database
    const db = await this.loadModsDb();
    const dbMods = db.mods || [];
    const dbModIds = new Set(dbMods.map(m => m.id));
    // Also track filenames to avoid duplicates from filesystem scan
    const dbModFilenames = new Set(dbMods.map(m => m.filename.toLowerCase()));

    // Also scan library folder for local mods not in DB (retrocompatibility)
    if (await fs.pathExists(this.libraryDir)) {
      const files = await fs.readdir(this.libraryDir);
      for (const file of files) {
        if (!file.endsWith(".jar")) continue;
        // Skip if we already have this file in DB (by filename)
        if (dbModFilenames.has(file.toLowerCase())) continue;
        
        const filePath = path.join(this.libraryDir, file);
        const mod = await this.getModFromFile(filePath);
        if (mod && !dbModIds.has(mod.id)) {
          dbMods.push({ ...mod, source: 'local' as const });
        }
      }
    }

    return dbMods.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Aggiunge una mod al database (per mod da CurseForge)
   */
  async addMod(mod: Mod): Promise<void> {
    const db = await this.loadModsDb();
    
    // Check if already exists
    const existingIndex = db.mods.findIndex(m => m.id === mod.id);
    if (existingIndex >= 0) {
      // Update existing
      db.mods[existingIndex] = mod;
    } else {
      db.mods.push(mod);
    }
    
    await this.saveModsDb(db);
  }

  /**
   * Estrae i metadati di una mod da un file JAR
   */
  private async getModFromFile(filePath: string): Promise<Mod | null> {
    try {
      const stat = await fs.stat(filePath);
      const metadata = await JarScanner.scanJarFile(filePath);

      if (!metadata) return null;

      return {
        id: metadata.hash,
        filename: metadata.filename,
        name: metadata.name,
        version: metadata.version,
        game_version: metadata.game_version,
        loader: metadata.loader,
        description: metadata.description,
        author: metadata.author,
        path: filePath,
        hash: metadata.hash,
        created_at: stat.birthtime.toISOString(),
        size: stat.size,
      };
    } catch (error) {
      console.error(`Failed to read mod ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Ottiene una mod per ID (hash)
   */
  async getModById(id: string): Promise<Mod | undefined> {
    const mods = await this.getAllMods();
    return mods.find((m) => m.id === id);
  }

  /**
   * Importa mod nella libreria (copia i file)
   */
  async importMods(sourcePaths: string[]): Promise<Mod[]> {
    await this.ensureDirectories();
    const importedMods: Mod[] = [];

    for (const sourcePath of sourcePaths) {
      if (!await fs.pathExists(sourcePath)) continue;
      if (!sourcePath.endsWith(".jar")) continue;

      const filename = path.basename(sourcePath);
      const destPath = path.join(this.libraryDir, filename);

      // Se esiste già, genera nome unico
      let finalPath = destPath;
      if (await fs.pathExists(destPath)) {
        // Confronta hash per vedere se è la stessa mod
        const sourceHash = this.calculateHash(sourcePath);
        const destHash = this.calculateHash(destPath);
        
        if (sourceHash === destHash) {
          // Stessa mod, non importare
          const mod = await this.getModFromFile(destPath);
          if (mod) importedMods.push(mod);
          continue;
        }

        // Mod diversa, genera nome unico
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let counter = 1;
        while (await fs.pathExists(finalPath)) {
          finalPath = path.join(this.libraryDir, `${base}_${counter}${ext}`);
          counter++;
        }
      }

      await fs.copy(sourcePath, finalPath);
      const mod = await this.getModFromFile(finalPath);
      if (mod) {
        importedMods.push(mod);
      }
    }

    return importedMods;
  }

  /**
   * Elimina una mod dalla libreria (e da tutti i modpack)
   */
  async deleteMod(modId: string): Promise<boolean> {
    const mod = await this.getModById(modId);
    if (!mod) return false;

    // Rimuovi da tutti i modpack
    const modpacks = await this.getAllModpacks();
    for (const modpack of modpacks) {
      await this.removeModFromModpack(modpack.id, modId);
    }

    // Remove from database
    const db = await this.loadModsDb();
    db.mods = db.mods.filter(m => m.id !== modId);
    await this.saveModsDb(db);

    // Elimina il file locale se esiste
    if (mod.path && await fs.pathExists(mod.path)) {
      try {
        await fs.remove(mod.path);
      } catch (error) {
        console.error(`Failed to delete mod file ${mod.path}:`, error);
      }
    }
    
    return true;
  }

  /**
   * Elimina più mod
   */
  async deleteMods(modIds: string[]): Promise<number> {
    let deleted = 0;
    for (const id of modIds) {
      if (await this.deleteMod(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Aggiorna i metadati di una mod
   */
  async updateMod(modId: string, updates: Partial<Mod>): Promise<boolean> {
    const db = await this.loadModsDb();
    const modIndex = db.mods.findIndex(m => m.id === modId);
    
    if (modIndex >= 0) {
      // Update in database
      db.mods[modIndex] = { ...db.mods[modIndex], ...updates };
      await this.saveModsDb(db);
      return true;
    }

    // Fallback: mod might be local-only (not in DB yet)
    const mod = await this.getModById(modId);
    if (!mod) return false;

    // Se si cambia il filename e il file esiste, rinomina il file
    if (updates.filename && updates.filename !== mod.filename && mod.path) {
      const newPath = path.join(this.libraryDir, updates.filename);
      
      // Aggiorna anche nei modpack
      const modpacks = await this.getAllModpacks();
      for (const modpack of modpacks) {
        const modpackModPath = path.join(this.getModpackPath(modpack.id), "mods", mod.filename);
        if (await fs.pathExists(modpackModPath)) {
          const newModpackModPath = path.join(this.getModpackPath(modpack.id), "mods", updates.filename);
          await fs.rename(modpackModPath, newModpackModPath);
        }
      }

      if (await fs.pathExists(mod.path)) {
        await fs.rename(mod.path, newPath);
      }
    }

    return true;
  }

  // ==================== MODPACKS ====================

  /**
   * Sanitizza il nome per usarlo come nome cartella
   */
  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, "") // Rimuovi caratteri non validi
      .replace(/\s+/g, "_") // Spazi -> underscore
      .substring(0, 50); // Limita lunghezza
  }

  /**
   * Ottiene tutti i modpack
   */
  async getAllModpacks(): Promise<Modpack[]> {
    await this.ensureDirectories();
    const modpacks: Modpack[] = [];

    if (!await fs.pathExists(this.modpacksDir)) {
      return modpacks;
    }

    const folders = await fs.readdir(this.modpacksDir);

    for (const folder of folders) {
      const folderPath = path.join(this.modpacksDir, folder);
      const stat = await fs.stat(folderPath);

      if (!stat.isDirectory()) continue;

      const modpack = await this.getModpackFromFolder(folderPath);
      if (modpack) {
        modpacks.push(modpack);
      }
    }

    return modpacks.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Legge i metadati di un modpack dalla sua cartella
   */
  private async getModpackFromFolder(folderPath: string): Promise<Modpack | null> {
    const manifestPath = path.join(folderPath, "modpack.json");
    const folderId = path.basename(folderPath);

    try {
      let manifest: ModpackManifest;

      if (await fs.pathExists(manifestPath)) {
        manifest = await fs.readJson(manifestPath);
      } else {
        // Crea manifest di default
        const stat = await fs.stat(folderPath);
        manifest = {
          name: folderId,
          version: "1.0.0",
          created_at: stat.birthtime.toISOString(),
        };
        await fs.writeJson(manifestPath, manifest, { spaces: 2 });
      }

      // Conta le mod
      const modsDir = path.join(folderPath, "mods");
      let modCount = 0;
      if (await fs.pathExists(modsDir)) {
        const files = await fs.readdir(modsDir);
        modCount = files.filter((f) => f.endsWith(".jar")).length;
      }

      // Cerca immagine cover
      let imagePath: string | undefined;
      const coverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
      for (const ext of coverExtensions) {
        const coverPath = path.join(folderPath, `cover.${ext}`);
        if (await fs.pathExists(coverPath)) {
          imagePath = coverPath;
          break;
        }
      }

      return {
        id: folderId,
        name: manifest.name,
        version: manifest.version,
        minecraft_version: manifest.minecraft_version,
        loader: manifest.loader,
        description: manifest.description,
        image_path: imagePath,
        created_at: manifest.created_at,
        mod_count: modCount,
      };
    } catch (error) {
      console.error(`Failed to read modpack ${folderPath}:`, error);
      return null;
    }
  }

  /**
   * Ottiene un modpack per ID
   */
  async getModpackById(id: string): Promise<Modpack | undefined> {
    const folderPath = this.getModpackPath(id);
    if (!await fs.pathExists(folderPath)) return undefined;
    return (await this.getModpackFromFolder(folderPath)) || undefined;
  }

  /**
   * Crea un nuovo modpack
   */
  async createModpack(data: { 
    name: string; 
    version?: string; 
    minecraft_version?: string;
    loader?: string;
    description?: string 
  }): Promise<string> {
    await this.ensureDirectories();

    // Validate name
    const trimmedName = (data.name || "").trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error("Modpack name must be at least 2 characters");
    }

    let folderId = this.sanitizeFolderName(trimmedName);
    
    // If sanitized name is empty, use a default
    if (!folderId) {
      folderId = `modpack_${Date.now()}`;
    }
    
    let folderPath = this.getModpackPath(folderId);

    // Assicurati che il nome sia unico
    let counter = 1;
    while (await fs.pathExists(folderPath)) {
      folderId = `${this.sanitizeFolderName(data.name)}_${counter}`;
      folderPath = this.getModpackPath(folderId);
      counter++;
    }

    // Crea struttura cartelle
    await fs.ensureDir(folderPath);
    await fs.ensureDir(path.join(folderPath, "mods"));

    // Crea manifest
    const manifest: ModpackManifest = {
      name: data.name,
      version: data.version || "1.0.0",
      minecraft_version: data.minecraft_version,
      loader: data.loader,
      description: data.description,
      created_at: new Date().toISOString(),
    };
    await fs.writeJson(path.join(folderPath, "modpack.json"), manifest, { spaces: 2 });

    return folderId;
  }

  /**
   * Aggiorna i metadati di un modpack
   */
  async updateModpack(modpackId: string, updates: Partial<Modpack>): Promise<boolean> {
    const folderPath = this.getModpackPath(modpackId);
    const manifestPath = path.join(folderPath, "modpack.json");

    if (!await fs.pathExists(manifestPath)) return false;

    try {
      const manifest = await fs.readJson(manifestPath);

      if (updates.name !== undefined) manifest.name = updates.name;
      if (updates.version !== undefined) manifest.version = updates.version;
      if (updates.minecraft_version !== undefined) manifest.minecraft_version = updates.minecraft_version;
      if (updates.loader !== undefined) manifest.loader = updates.loader;
      if (updates.description !== undefined) manifest.description = updates.description;

      await fs.writeJson(manifestPath, manifest, { spaces: 2 });

      // Se cambia il nome, rinomina la cartella
      if (updates.name && updates.name !== modpackId) {
        const newFolderId = this.sanitizeFolderName(updates.name);
        const newFolderPath = this.getModpackPath(newFolderId);
        
        if (!await fs.pathExists(newFolderPath)) {
          await fs.rename(folderPath, newFolderPath);
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to update modpack ${modpackId}:`, error);
      return false;
    }
  }

  /**
   * Elimina un modpack (cartella e contenuti)
   */
  async deleteModpack(modpackId: string): Promise<boolean> {
    const folderPath = this.getModpackPath(modpackId);

    if (!await fs.pathExists(folderPath)) return false;

    try {
      await fs.remove(folderPath);
      return true;
    } catch (error) {
      console.error(`Failed to delete modpack ${modpackId}:`, error);
      return false;
    }
  }

  /**
   * Imposta l'immagine di copertina di un modpack
   */
  async setModpackImage(modpackId: string, imagePath: string): Promise<string | null> {
    const folderPath = this.getModpackPath(modpackId);
    if (!await fs.pathExists(folderPath)) return null;

    try {
      // Rimuovi vecchie cover
      const coverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
      for (const ext of coverExtensions) {
        const oldCover = path.join(folderPath, `cover.${ext}`);
        if (await fs.pathExists(oldCover)) {
          await fs.remove(oldCover);
        }
      }

      // Copia nuova immagine
      const ext = path.extname(imagePath);
      const destPath = path.join(folderPath, `cover${ext}`);
      await fs.copy(imagePath, destPath);

      return destPath;
    } catch (error) {
      console.error(`Failed to set modpack image:`, error);
      return null;
    }
  }

  // ==================== MODPACK-MOD RELATIONS ====================

  /**
   * Gets the path to the modpack's mod manifest
   */
  private getModpackModsManifestPath(modpackId: string): string {
    return path.join(this.getModpackPath(modpackId), "mods-manifest.json");
  }

  /**
   * Loads the modpack's mod manifest (maps library mod IDs to filenames)
   */
  private async loadModpackModsManifest(modpackId: string): Promise<Record<string, string>> {
    const manifestPath = this.getModpackModsManifestPath(modpackId);
    if (await fs.pathExists(manifestPath)) {
      try {
        return await fs.readJson(manifestPath);
      } catch {
        return {};
      }
    }
    return {};
  }

  /**
   * Saves the modpack's mod manifest
   */
  private async saveModpackModsManifest(modpackId: string, manifest: Record<string, string>): Promise<void> {
    const manifestPath = this.getModpackModsManifestPath(modpackId);
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }

  /**
   * Ottiene le mod di un modpack
   * Usa il manifest per mantenere gli ID originali della libreria
   */
  async getModsInModpack(modpackId: string): Promise<Mod[]> {
    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    
    if (!await fs.pathExists(modsDir)) return [];

    // Load manifest that maps library IDs to filenames
    const manifest = await this.loadModpackModsManifest(modpackId);
    const filenameToLibraryId = new Map<string, string>();
    Object.entries(manifest).forEach(([libId, filename]) => {
      filenameToLibraryId.set(filename, libId);
    });

    // Get all library mods for lookup
    const allLibraryMods = await this.getAllMods();
    const libraryModsById = new Map(allLibraryMods.map(m => [m.id, m]));

    const mods: Mod[] = [];
    const files = await fs.readdir(modsDir);

    for (const file of files) {
      if (!file.endsWith(".jar")) continue;

      const filePath = path.join(modsDir, file);
      
      // Check if we have this file mapped to a library mod
      const libraryModId = filenameToLibraryId.get(file);
      if (libraryModId) {
        const libraryMod = libraryModsById.get(libraryModId);
        if (libraryMod) {
          // Return the library mod with updated path
          mods.push({ ...libraryMod, path: filePath });
          continue;
        }
      }

      // Fallback: scan the jar file
      const mod = await this.getModFromFile(filePath);
      if (mod) {
        mods.push(mod);
      }
    }

    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Aggiunge una mod a un modpack (copia il file)
   * Valida compatibilità loader e versione MC
   */
  async addModToModpack(modpackId: string, modId: string): Promise<{ success: boolean; error?: string }> {
    const mod = await this.getModById(modId);
    if (!mod) return { success: false, error: "Mod not found" };

    const modpack = await this.getModpackById(modpackId);
    if (!modpack) return { success: false, error: "Modpack not found" };

    // Valida compatibilità loader
    if (modpack.loader && mod.loader && mod.loader !== 'unknown') {
      const modpackLoader = modpack.loader.toLowerCase();
      const modLoader = mod.loader.toLowerCase();
      
      // Controlla se i loader sono compatibili
      if (modLoader !== modpackLoader) {
        // NeoForge può essere compatibile con Forge in alcuni casi, ma meglio avvisare
        const isNeoForgeForgeCompat = 
          (modpackLoader === 'neoforge' && modLoader === 'forge') ||
          (modpackLoader === 'forge' && modLoader === 'neoforge');
        
        if (!isNeoForgeForgeCompat) {
          return { 
            success: false, 
            error: `Incompatible loader: mod is for ${mod.loader}, but modpack uses ${modpack.loader}` 
          };
        }
      }
    }

    // Valida compatibilità versione MC (se disponibile)
    if (modpack.minecraft_version && mod.game_version && mod.game_version !== 'unknown') {
      const modpackMcVersion = modpack.minecraft_version;
      const modMcVersion = mod.game_version;
      
      // Controlla se le versioni sono compatibili (match esatto o prefisso)
      const isVersionCompatible = 
        modMcVersion === modpackMcVersion ||
        modMcVersion.startsWith(modpackMcVersion) ||
        modpackMcVersion.startsWith(modMcVersion) ||
        // Gestisci versioni come ">=1.19" o range
        modMcVersion.includes(modpackMcVersion);
      
      if (!isVersionCompatible) {
        return { 
          success: false, 
          error: `Incompatible Minecraft version: mod is for ${mod.game_version}, but modpack is for ${modpack.minecraft_version}` 
        };
      }
    }

    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    await fs.ensureDir(modsDir);

    const destPath = path.join(modsDir, mod.filename);

    // Load manifest
    const manifest = await this.loadModpackModsManifest(modpackId);

    // Se esiste già, assicurati che il manifest sia aggiornato
    if (await fs.pathExists(destPath)) {
      // Update manifest to ensure proper metadata tracking
      if (!manifest[modId]) {
        manifest[modId] = mod.filename;
        await this.saveModpackModsManifest(modpackId, manifest);
        console.log(`[FSManager] Updated manifest for existing file: ${mod.filename}`);
      }
      return { success: true };
    }

    // If mod has no local file (CF mod), download it first
    if (!mod.path || mod.path === "") {
      if (mod.cf_project_id && mod.cf_file_id && this.curseforgeService) {
        console.log(`[FSManager] Downloading mod from CurseForge: ${mod.name}`);
        try {
          const result = await this.curseforgeService.downloadFile(
            mod.cf_project_id,
            mod.cf_file_id,
            modsDir
          );
          
          if (result.success) {
            console.log(`[FSManager] Downloaded mod to: ${result.filePath}`);
            // Save to manifest with library mod ID (already loaded above)
            manifest[modId] = mod.filename;
            await this.saveModpackModsManifest(modpackId, manifest);
            return { success: true };
          } else {
            return { success: false, error: result.error || "Download failed" };
          }
        } catch (err) {
          console.error(`[FSManager] Failed to download mod:`, err);
          return { success: false, error: `Download failed: ${(err as Error).message}` };
        }
      } else {
        return { 
          success: false, 
          error: "Mod has no local file and CurseForge download info is missing" 
        };
      }
    }

    try {
      await fs.copy(mod.path, destPath);
      // Save to manifest with library mod ID (already loaded above)
      manifest[modId] = mod.filename;
      await this.saveModpackModsManifest(modpackId, manifest);
      return { success: true };
    } catch (error) {
      console.error(`Failed to add mod to modpack:`, error);
      return { success: false, error: "Failed to copy mod file" };
    }
  }

  /**
   * Rimuove una mod da un modpack (elimina il file dal modpack)
   */
  async removeModFromModpack(modpackId: string, modId: string): Promise<boolean> {
    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    
    if (!await fs.pathExists(modsDir)) return false;

    // First check manifest for library mod ID
    const manifest = await this.loadModpackModsManifest(modpackId);
    const filename = manifest[modId];
    
    if (filename) {
      const filePath = path.join(modsDir, filename);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        delete manifest[modId];
        await this.saveModpackModsManifest(modpackId, manifest);
        return true;
      }
    }

    // Fallback: find file by hash (for older modpacks)
    const files = await fs.readdir(modsDir);
    for (const file of files) {
      if (!file.endsWith(".jar")) continue;
      
      const filePath = path.join(modsDir, file);
      const hash = this.calculateHash(filePath);
      
      if (hash === modId) {
        await fs.remove(filePath);
        return true;
      }
    }

    return false;
  }

  // ==================== UTILITY ====================

  private calculateHash(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Clona un modpack
   */
  async cloneModpack(modpackId: string, newName: string): Promise<string | null> {
    const sourceFolder = this.getModpackPath(modpackId);
    if (!await fs.pathExists(sourceFolder)) return null;

    const newId = await this.createModpack({ name: newName });
    const destFolder = this.getModpackPath(newId);

    // Copia mods
    const sourceModsDir = path.join(sourceFolder, "mods");
    const destModsDir = path.join(destFolder, "mods");
    
    if (await fs.pathExists(sourceModsDir)) {
      await fs.copy(sourceModsDir, destModsDir);
    }

    // Copia mods-manifest.json se esiste
    const sourceManifest = this.getModpackModsManifestPath(modpackId);
    if (await fs.pathExists(sourceManifest)) {
      await fs.copy(sourceManifest, this.getModpackModsManifestPath(newId));
    }

    // Copia cover se esiste
    const coverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
    for (const ext of coverExtensions) {
      const coverPath = path.join(sourceFolder, `cover.${ext}`);
      if (await fs.pathExists(coverPath)) {
        await fs.copy(coverPath, path.join(destFolder, `cover.${ext}`));
        break;
      }
    }

    return newId;
  }

  // ==================== MODEX SHARE ====================

  /**
   * Genera un codice univoco breve per il modpack (random, unico globalmente)
   */
  generateShareCode(): string {
    // Usa randomUUID per garantire unicità globale
    const uuid = crypto.randomUUID();
    const hash = crypto.createHash("sha256")
      .update(uuid)
      .digest("hex")
      .substring(0, 8)
      .toUpperCase();
    return `MDX-${hash}`;
  }

  /**
   * Ottiene o genera il codice share per un modpack (lo salva se non esiste)
   */
  async getOrCreateShareCode(modpackId: string): Promise<string> {
    const manifestPath = path.join(this.getModpackPath(modpackId), "modpack.json");
    
    if (await fs.pathExists(manifestPath)) {
      const manifest = await fs.readJson(manifestPath);
      if (manifest.share_code) {
        return manifest.share_code;
      }
      
      // Genera e salva il codice (random, unico)
      const code = this.generateShareCode();
      manifest.share_code = code;
      await fs.writeJson(manifestPath, manifest, { spaces: 2 });
      return code;
    }
    
    return this.generateShareCode();
  }

  /**
   * Crea il manifest per MODEX Share
   */
  async createShareManifest(modpackId: string): Promise<{
    code: string;
    manifest: any;
    checksum: string;
  }> {
    const modpack = await this.getModpackById(modpackId);
    if (!modpack) throw new Error("Modpack not found");

    const mods = await this.getModsInModpack(modpackId);
    
    // Calcola checksum di tutti i mod
    const modHashes = mods.map(m => m.hash).sort().join("");
    const checksum = crypto.createHash("sha256")
      .update(modHashes)
      .digest("hex")
      .substring(0, 16);

    // Usa sempre lo stesso codice per questo modpack
    const code = await this.getOrCreateShareCode(modpackId);

    const manifest = {
      modex_version: "1.0",
      share_code: code,
      checksum: checksum,
      exported_at: new Date().toISOString(),
      modpack: {
        name: modpack.name,
        version: modpack.version,
        description: modpack.description || "",
      },
      mods: mods.map(m => ({
        filename: m.filename,
        name: m.name,
        version: m.version,
        hash: m.hash,
        size: m.size,
        loader: m.loader,
        game_version: m.game_version,
        cf_project_id: (m as any).cf_project_id,
        cf_file_id: (m as any).cf_file_id,
      })),
      stats: {
        mod_count: mods.length,
        total_size: mods.reduce((acc, m) => acc + m.size, 0),
      }
    };

    return { code, manifest, checksum };
  }

  /**
   * Esporta modpack come .modex (formato proprietario)
   */
  async exportAsModex(modpackId: string, exportPath: string): Promise<{
    success: boolean;
    code: string;
    path: string;
  }> {
    const AdmZip = (await import("adm-zip")).default;
    
    const { code, manifest, checksum } = await this.createShareManifest(modpackId);
    const mods = await this.getModsInModpack(modpackId);

    const zip = new AdmZip();

    // Aggiungi manifest
    zip.addFile("modex.json", Buffer.from(JSON.stringify(manifest, null, 2)));

    // Note: We don't bundle JAR files anymore - mods will be downloaded from CurseForge on import

    // Aggiungi cover se esiste
    const modpackPath = this.getModpackPath(modpackId);
    const coverExtensions = ["png", "jpg", "jpeg", "gif", "webp"];
    for (const ext of coverExtensions) {
      const coverPath = path.join(modpackPath, `cover.${ext}`);
      if (await fs.pathExists(coverPath)) {
        const coverBuffer = await fs.readFile(coverPath);
        zip.addFile(`cover.${ext}`, coverBuffer);
        break;
      }
    }

    zip.writeZip(exportPath);

    return { success: true, code, path: exportPath };
  }

  /**
   * Importa un file .modex
   */
  async importModex(modexPath: string): Promise<{
    success: boolean;
    modpackId: string;
    code: string;
    isUpdate: boolean;
    changes?: { added: number; removed: number; unchanged: number };
  }> {
    const AdmZip = (await import("adm-zip")).default;
    
    const zip = new AdmZip(modexPath);
    const manifestEntry = zip.getEntry("modex.json");
    
    if (!manifestEntry) {
      throw new Error("Invalid .modex file: missing manifest");
    }

    const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    
    if (!manifest.modex_version || !manifest.share_code) {
      throw new Error("Invalid .modex manifest");
    }

    // Controlla se esiste già un modpack con lo stesso codice
    const existingModpack = await this.findModpackByShareCode(manifest.share_code);
    const isUpdate = !!existingModpack;

    let modpackId: string;
    let oldModsInModpack: Mod[] = [];

    if (isUpdate && existingModpack) {
      // Update esistente
      modpackId = existingModpack.id;
      oldModsInModpack = await this.getModsInModpack(modpackId);
      console.log(`[MODEX Import] Updating existing modpack: ${existingModpack.name}`);
      console.log(`[MODEX Import] Current mods: ${oldModsInModpack.length}`);
      console.log(`[MODEX Import] New manifest has: ${manifest.mods.length} mods`);
    } else {
      // Nuovo modpack
      modpackId = await this.createModpack({
        name: manifest.modpack.name,
        version: manifest.modpack.version,
        description: manifest.modpack.description,
      });
      console.log(`[MODEX Import] Creating new modpack: ${manifest.modpack.name}`);
    }

    // Download mods from CurseForge (same logic as CF import)
    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    await fs.ensureDir(modsDir);

    const mcVersion = manifest.modpack.version;
    const loader = manifest.mods[0]?.loader || "forge"; // Use first mod's loader as default

    // Build cache of existing mods by CF project-file ID
    const existingMods = await this.getAllMods();
    const existingModsMap = new Map<string, Mod>();
    for (const mod of existingMods) {
      const cfData = mod as any;
      if (cfData.cf_project_id && cfData.cf_file_id) {
        existingModsMap.set(`${cfData.cf_project_id}-${cfData.cf_file_id}`, mod);
      }
      // Also map by hash for non-CF mods
      if (mod.hash) {
        existingModsMap.set(`hash-${mod.hash}`, mod);
      }
    }

    let modsImported = 0;
    let modsSkipped = 0;
    const errors: string[] = [];
    const downloadedModIds = new Set<string>(); // Track which mods were successfully added

    for (let i = 0; i < manifest.mods.length; i++) {
      const modEntry = manifest.mods[i];
      const projectID = modEntry.cf_project_id;
      const fileID = modEntry.cf_file_id;

      console.log(`[MODEX Import] Processing mod ${i + 1}/${manifest.mods.length}: ${modEntry.name}`);

      // Skip mods without CF IDs (local mods) - would need fallback to bundled JAR
      if (!projectID || !fileID) {
        console.log(`[MODEX Import] Skipping ${modEntry.name} - no CurseForge IDs`);
        modsSkipped++;
        continue;
      }

      // Check if already in library
      const existingKey = `${projectID}-${fileID}`;
      const existingMod = existingModsMap.get(existingKey);

      if (existingMod && await fs.pathExists(existingMod.path)) {
        console.log(`[MODEX Import] Found in library: ${modEntry.name}`);
        const destPath = path.join(modsDir, existingMod.filename);
        if (!await fs.pathExists(destPath)) {
          await fs.copy(existingMod.path, destPath);
        }
        await this.addModToModpack(modpackId, existingMod.id);
        downloadedModIds.add(existingMod.id);
        modsImported++;
        continue;
      }

      // Download from CurseForge
      try {
        const cfMod = await this.curseforgeService!.getMod(projectID);
        const cfFile = await this.curseforgeService!.getModFile(projectID, fileID);

        // Verify exact version match
        const fileGameVersions = cfFile.gameVersions.filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v));
        if (!fileGameVersions.includes(mcVersion)) {
          console.log(`[MODEX Import] Version mismatch for ${modEntry.name}: expected ${mcVersion}, got ${fileGameVersions.join(", ")}`);
          
          // Try to find correct version
          const correctFile = await this.curseforgeService!.findFileForVersion(projectID, mcVersion, loader);
          if (correctFile) {
            console.log(`[MODEX Import] Found correct version: ${correctFile.fileName}`);
            const correctCfFile = await this.curseforgeService!.getModFile(projectID, correctFile.id);
            
            // Check if we already have this version
            const correctKey = `${projectID}-${correctFile.id}`;
            const existingCorrectMod = existingModsMap.get(correctKey);
            
            if (existingCorrectMod && await fs.pathExists(existingCorrectMod.path)) {
              console.log(`[MODEX Import] Found correct version in library`);
              const destPath = path.join(modsDir, existingCorrectMod.filename);
              if (!await fs.pathExists(destPath)) {
                await fs.copy(existingCorrectMod.path, destPath);
              }
              await this.addModToModpack(modpackId, existingCorrectMod.id);
              downloadedModIds.add(existingCorrectMod.id);
              modsImported++;
              continue;
            }
            
            // Download the correct version
            const tempDir = path.join(app.getPath("temp"), "modex-import");
            await fs.ensureDir(tempDir);

            const downloadResult = await this.curseforgeService!.downloadFile(projectID, correctFile.id, tempDir);

            if (downloadResult.success) {
              const modData = this.curseforgeService!.modToLibraryFormat(cfMod, correctCfFile, loader, mcVersion);
              const modId = `cf-${projectID}-${correctFile.id}`;
              const modPath = path.join(this.libraryDir, modData.filename);

              await fs.move(downloadResult.filePath, modPath, { overwrite: true });

              const newMod: Mod = {
                id: modId,
                filename: modData.filename,
                name: modData.name,
                version: modData.version,
                game_version: modData.game_version,
                loader: modData.loader,
                description: modData.description,
                author: modData.author,
                path: modPath,
                created_at: new Date().toISOString(),
                size: modData.file_size,
                hash: "", // Will be calculated if needed
                cf_project_id: projectID,
                cf_file_id: correctFile.id,
                thumbnail_url: modData.thumbnail_url || undefined,
                download_count: modData.download_count,
                release_type: modData.release_type,
                date_released: modData.date_released,
                source: "curseforge",
              } as any;

              // Calculate hash
              const fileBuffer = await fs.readFile(modPath);
              newMod.hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

              await this.addMod(newMod);
              existingModsMap.set(`${projectID}-${correctFile.id}`, newMod);
              
              const destPath = path.join(modsDir, newMod.filename);
              if (!await fs.pathExists(destPath)) {
                await fs.copy(modPath, destPath);
              }
              
              await this.addModToModpack(modpackId, newMod.id);
              downloadedModIds.add(newMod.id);
              modsImported++;
              continue;
            }
          }
          
          errors.push(`${modEntry.name}: version mismatch`);
          modsSkipped++;
          continue;
        }

        // Download the exact file
        const tempDir = path.join(app.getPath("temp"), "modex-import");
        await fs.ensureDir(tempDir);

        const downloadResult = await this.curseforgeService!.downloadFile(projectID, fileID, tempDir);

        if (downloadResult.success) {
          const modData = this.curseforgeService!.modToLibraryFormat(cfMod, cfFile, loader, mcVersion);
          const modId = `cf-${projectID}-${fileID}`;
          const modPath = path.join(this.libraryDir, modData.filename);

          await fs.move(downloadResult.filePath, modPath, { overwrite: true });

          const newMod: Mod = {
            id: modId,
            filename: modData.filename,
            name: modData.name,
            version: modData.version,
            game_version: modData.game_version,
            loader: modData.loader,
            description: modData.description,
            author: modData.author,
            path: modPath,
            created_at: new Date().toISOString(),
            size: modData.file_size,
            hash: "", // Will be calculated
            cf_project_id: projectID,
            cf_file_id: fileID,
            thumbnail_url: modData.thumbnail_url || undefined,
            download_count: modData.download_count,
            release_type: modData.release_type,
            date_released: modData.date_released,
            source: "curseforge",
          } as any;

          // Calculate hash
          const fileBuffer = await fs.readFile(modPath);
          newMod.hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

          await this.addMod(newMod);
          existingModsMap.set(`${projectID}-${fileID}`, newMod);
          
          const destPath = path.join(modsDir, newMod.filename);
          if (!await fs.pathExists(destPath)) {
            await fs.copy(modPath, destPath);
          }
          
          await this.addModToModpack(modpackId, newMod.id);
          downloadedModIds.add(newMod.id);
          modsImported++;
        } else {
          errors.push(`${modEntry.name}: download failed`);
          modsSkipped++;
        }
      } catch (error: any) {
        console.error(`[MODEX Import] Error downloading ${modEntry.name}:`, error);
        errors.push(`${modEntry.name}: ${error.message}`);
        modsSkipped++;
      }
    }

    console.log(`[MODEX Import] Complete: ${modsImported} imported, ${modsSkipped} skipped, ${errors.length} errors`);

    // Calculate detailed changes if this was an update
    let detailedChanges: {
      added: Array<{ name: string; version: string }>;
      removed: Array<{ name: string; version: string }>;
      unchanged: Array<{ name: string; version: string }>;
    } | undefined;

    if (isUpdate) {
      const oldModIds = new Set(oldModsInModpack.map(m => m.id));
      const added: Array<{ name: string; version: string }> = [];
      const removed: Array<{ name: string; version: string }> = [];
      const unchanged: Array<{ name: string; version: string }> = [];

      // Refresh mod list to get all newly added mods
      const currentMods = await this.getModsInModpack(modpackId);
      const currentModsMap = new Map(currentMods.map(m => [m.id, m]));

      // Find added and unchanged mods
      for (const modId of downloadedModIds) {
        const mod = currentModsMap.get(modId);
        if (!mod) continue;

        if (oldModIds.has(modId)) {
          unchanged.push({ name: mod.name, version: mod.version });
        } else {
          added.push({ name: mod.name, version: mod.version });
        }
      }

      // Find removed mods and delete their files
      const modsDir = path.join(this.getModpackPath(modpackId), "mods");
      for (const oldMod of oldModsInModpack) {
        if (!downloadedModIds.has(oldMod.id)) {
          removed.push({ name: oldMod.name, version: oldMod.version });
          
          // Remove from modpack directory
          const modPath = path.join(modsDir, oldMod.filename);
          if (await fs.pathExists(modPath)) {
            await fs.remove(modPath);
            console.log(`[MODEX Import] Removed: ${oldMod.name} ${oldMod.version}`);
          }
        }
      }

      detailedChanges = { added, removed, unchanged };

      console.log(`[MODEX Import] Changes:`);
      console.log(`  Added: ${added.length}`);
      added.forEach(m => console.log(`    + ${m.name} ${m.version}`));
      console.log(`  Removed: ${removed.length}`);
      removed.forEach(m => console.log(`    - ${m.name} ${m.version}`));
      console.log(`  Unchanged: ${unchanged.length}`);
    }

    // Estrai cover se presente
    const coverEntry = zip.getEntries().find(e => e.entryName.startsWith("cover."));
    if (coverEntry) {
      const coverDest = path.join(this.getModpackPath(modpackId), coverEntry.entryName);
      await fs.writeFile(coverDest, coverEntry.getData());
    }

    // Salva il codice share nel manifest del modpack
    const manifestPath = path.join(this.getModpackPath(modpackId), "modpack.json");
    const modpackManifest = await fs.readJson(manifestPath);
    modpackManifest.share_code = manifest.share_code;
    modpackManifest.last_sync = new Date().toISOString();
    await fs.writeJson(manifestPath, modpackManifest, { spaces: 2 });

    return {
      success: true,
      modpackId,
      code: manifest.share_code,
      isUpdate,
      changes: detailedChanges,
    };
  }

  /**
   * Import a CurseForge modpack ZIP (containing manifest.json)
   * Downloads all mods from CurseForge API
   */
  async importCurseForgeZip(
    zipPath: string,
    onProgress?: (progress: { current: number; total: number; modName: string }) => void
  ): Promise<{
    success: boolean;
    modpackId?: string;
    modsImported: number;
    modsSkipped: number;
    errors: string[];
  }> {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(zipPath);
    
    // Find and parse manifest.json
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) {
      return {
        success: false,
        modsImported: 0,
        modsSkipped: 0,
        errors: ["Invalid CurseForge modpack: manifest.json not found"],
      };
    }

    let manifest: {
      minecraft: {
        version: string;
        modLoaders: { id: string; primary: boolean }[];
      };
      manifestType: string;
      name: string;
      version: string;
      author: string;
      files: { projectID: number; fileID: number; required: boolean }[];
      overrides?: string;
    };

    try {
      manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    } catch (e) {
      return {
        success: false,
        modsImported: 0,
        modsSkipped: 0,
        errors: ["Failed to parse manifest.json"],
      };
    }

    // Extract loader from modLoaders
    let loader = "unknown";
    const primaryLoader = manifest.minecraft.modLoaders?.find((l) => l.primary);
    if (primaryLoader) {
      // Format is like "forge-47.2.0" or "fabric-0.15.3"
      const loaderMatch = primaryLoader.id.match(/^(forge|fabric|quilt|neoforge)/i);
      if (loaderMatch) {
        loader = loaderMatch[1].toLowerCase();
      }
    }

    const mcVersion = manifest.minecraft.version;

    // Create the modpack
    const modpackId = await this.createModpack({
      name: manifest.name,
      version: manifest.version || "1.0.0",
      minecraft_version: mcVersion,
      loader,
      description: `Imported from CurseForge. Author: ${manifest.author || "Unknown"}`,
    });

    const errors: string[] = [];
    let modsImported = 0;
    let modsSkipped = 0;
    const total = manifest.files.length;

    // Check if CurseForge service is available
    if (!this.curseforgeService) {
      return {
        success: false,
        modpackId,
        modsImported: 0,
        modsSkipped: total,
        errors: ["CurseForge API not configured. Please set API key in settings."],
      };
    }

    // Cache existing mods to avoid repeated full library scans
    const existingMods = await this.getAllMods();
    const existingModsMap = new Map<string, Mod>();
    for (const mod of existingMods) {
      if (mod.cf_project_id && mod.cf_file_id) {
        existingModsMap.set(`${mod.cf_project_id}-${mod.cf_file_id}`, mod);
      }
    }

    // Download each mod
    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const { projectID, fileID } = file;

      try {
        // Report progress
        if (onProgress) {
          onProgress({ current: i + 1, total, modName: `Mod ${projectID}` });
        }

        // Get mod info from CF
        const cfMod = await this.curseforgeService.getMod(projectID);
        if (!cfMod) {
          errors.push(`Mod ${projectID} not found on CurseForge`);
          modsSkipped++;
          continue;
        }

        // Update progress with actual mod name
        if (onProgress) {
          onProgress({ current: i + 1, total, modName: cfMod.name });
        }

        // Get file info
        const cfFile = await this.curseforgeService.getFile(projectID, fileID);
        if (!cfFile) {
          errors.push(`File ${fileID} not found for mod ${cfMod.name}`);
          modsSkipped++;
          continue;
        }

        // Log full file info for debugging
        console.log(`[CF Import] ${cfMod.name}: fileName=${cfFile.fileName}, gameVersions=${JSON.stringify(cfFile.gameVersions)}`);

        // Verify game version compatibility - EXACT MATCH ONLY
        // The file must specifically support the modpack's MC version
        const fileGameVersions = cfFile.gameVersions.filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v));
        const isVersionCompatible = fileGameVersions.includes(mcVersion);
        
        console.log(`[CF Import] ${cfMod.name}: filtered MC versions=[${fileGameVersions.join(',')}], modpack=${mcVersion}, compatible=${isVersionCompatible}`);

        // If file doesn't support exact version, try to find correct file
        if (!isVersionCompatible) {
          console.log(`[CF Import] ${cfMod.name}: File ${fileID} doesn't support ${mcVersion}, searching for correct file...`);
          const correctFile = await this.curseforgeService!.findFileForVersion(projectID, mcVersion, loader);
          
          if (correctFile) {
            console.log(`[CF Import] ${cfMod.name}: Found correct file ${correctFile.fileName} (ID: ${correctFile.id})`);
            // Use the correct version file instead
            const correctCfFile = await this.curseforgeService!.getFile(projectID, correctFile.id);
            if (correctCfFile) {
              // Check if this correct version already exists
              const existingCorrectMod = existingModsMap.get(`${projectID}-${correctFile.id}`);
              if (existingCorrectMod) {
                // Already have the correct version, add to modpack
                await this.addModToModpack(modpackId, existingCorrectMod.id);
                modsImported++;
                continue;
              }
              
              // Download the correct version instead
              const tempDir = path.join(app.getPath("temp"), "modex-cf-import");
              await fs.ensureDir(tempDir);

              const downloadResult = await this.curseforgeService!.downloadFile(
                projectID,
                correctFile.id,
                tempDir
              );

              if (downloadResult.success) {
                const modData = this.curseforgeService!.modToLibraryFormat(cfMod, correctCfFile, loader, mcVersion);
                const modId = `cf-${projectID}-${correctFile.id}`;
                const modPath = path.join(this.libraryDir, modData.filename);

                await fs.move(downloadResult.filePath, modPath, { overwrite: true });

                const newMod: Mod = {
                  id: modId,
                  filename: modData.filename,
                  name: modData.name,
                  version: modData.version,
                  game_version: modData.game_version,
                  loader: modData.loader,
                  description: modData.description,
                  author: modData.author,
                  path: modPath,
                  created_at: new Date().toISOString(),
                  size: modData.file_size,
                  cf_project_id: projectID,
                  cf_file_id: correctFile.id,
                  thumbnail_url: modData.thumbnail_url || undefined,
                  download_count: modData.download_count,
                  release_type: modData.release_type,
                  date_released: modData.date_released,
                  source: "curseforge",
                };

                await this.addMod(newMod);
                existingModsMap.set(`${projectID}-${correctFile.id}`, newMod);
                await this.addModToModpack(modpackId, newMod.id);
                modsImported++;
                continue;
              }
            }
          }
          
          // Could not find compatible version - DO NOT download the incompatible one
          console.log(`[CF Import] ${cfMod.name}: SKIPPED - no file found for ${mcVersion}`);
          errors.push(`${cfMod.name}: no file available for MC ${mcVersion}`);
          modsSkipped++;
          continue;
        }

        // File is compatible with exact version, proceed with download
        console.log(`[CF Import] ${cfMod.name}: File supports ${mcVersion}, downloading...`);
        
        // Check if mod already exists in library by cf_project_id and cf_file_id (use cached map)
        let existingMod = existingModsMap.get(`${projectID}-${fileID}`);

        if (!existingMod) {
          // Download to temp, then import to library
          const tempDir = path.join(app.getPath("temp"), "modex-cf-import");
          await fs.ensureDir(tempDir);

          const downloadResult = await this.curseforgeService.downloadFile(
            projectID,
            fileID,
            tempDir
          );

          if (!downloadResult.success) {
            errors.push(`Failed to download ${cfMod.name}: ${downloadResult.error}`);
            modsSkipped++;
            continue;
          }

          // Convert to library format
          const modData = this.curseforgeService.modToLibraryFormat(cfMod, cfFile, loader, mcVersion);

          // Create mod entry
          const modId = `cf-${projectID}-${fileID}`;
          const modPath = path.join(this.libraryDir, modData.filename);

          // Move file to library
          await fs.move(downloadResult.filePath, modPath, { overwrite: true });

          const newMod: Mod = {
            id: modId,
            filename: modData.filename,
            name: modData.name,
            version: modData.version,
            game_version: modData.game_version,
            loader: modData.loader,
            description: modData.description,
            author: modData.author,
            path: modPath,
            created_at: new Date().toISOString(),
            size: modData.file_size,
            cf_project_id: projectID,
            cf_file_id: fileID,
            thumbnail_url: modData.thumbnail_url || undefined,
            download_count: modData.download_count,
            release_type: modData.release_type,
            date_released: modData.date_released,
            source: "curseforge",
          };

          // Add to database
          await this.addMod(newMod);
          
          // Also add to cache for future lookups in this import
          existingModsMap.set(`${projectID}-${fileID}`, newMod);

          existingMod = newMod;
        }

        // Add to modpack
        await this.addModToModpack(modpackId, existingMod!.id);
        modsImported++;
      } catch (err) {
        errors.push(`Error processing mod ${projectID}: ${(err as Error).message}`);
        modsSkipped++;
      }
    }

    // Extract overrides if present
    const overridesFolder = manifest.overrides || "overrides";
    const modpackPath = this.getModpackPath(modpackId);
    
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith(`${overridesFolder}/`) && !entry.isDirectory) {
        // Remove the overrides prefix
        const relativePath = entry.entryName.substring(overridesFolder.length + 1);
        if (relativePath) {
          const destPath = path.join(modpackPath, "overrides", relativePath);
          await fs.ensureDir(path.dirname(destPath));
          await fs.writeFile(destPath, entry.getData());
        }
      }
    }

    return {
      success: modsImported > 0,
      modpackId,
      modsImported,
      modsSkipped,
      errors,
    };
  }

  /**
   * Trova modpack per share code
   */
  async findModpackByShareCode(code: string): Promise<Modpack | null> {
    const modpacks = await this.getAllModpacks();
    
    for (const modpack of modpacks) {
      const manifestPath = path.join(this.getModpackPath(modpack.id), "modpack.json");
      if (await fs.pathExists(manifestPath)) {
        const manifest = await fs.readJson(manifestPath);
        if (manifest.share_code === code) {
          return modpack;
        }
      }
    }
    
    return null;
  }

  /**
   * Verifica se un modpack ha updates disponibili
   */
  async verifyModexChecksum(modexPath: string, modpackId: string): Promise<{
    match: boolean;
    localChecksum: string;
    remoteChecksum: string;
  }> {
    const AdmZip = (await import("adm-zip")).default;
    
    const zip = new AdmZip(modexPath);
    const manifestEntry = zip.getEntry("modex.json");
    
    if (!manifestEntry) {
      throw new Error("Invalid .modex file");
    }

    const remoteManifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    const { checksum: localChecksum } = await this.createShareManifest(modpackId);

    return {
      match: localChecksum === remoteManifest.checksum,
      localChecksum,
      remoteChecksum: remoteManifest.checksum,
    };
  }

  /**
   * Apre la cartella nel file explorer
   */
  getBasePath(): string {
    return this.baseDir;
  }
}

export default FileSystemManager;
