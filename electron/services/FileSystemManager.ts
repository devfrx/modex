import { app } from "electron";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import { JarScanner, ModMetadata } from "./JarScanner.js";

export interface Mod {
  id: string; // Hash del file (SHA256)
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string; // Path assoluto nella library
  hash: string;
  created_at: string;
  size: number; // Dimensione file in bytes
}

export interface Modpack {
  id: string; // Nome cartella sanitizzato
  name: string;
  version: string;
  description?: string;
  image_path?: string;
  created_at: string;
  mod_count?: number;
}

interface ModpackManifest {
  name: string;
  version: string;
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

  getModpacksPath(): string {
    return this.modpacksDir;
  }

  getModpackPath(modpackId: string): string {
    return path.join(this.modpacksDir, modpackId);
  }

  // ==================== MODS (LIBRARY) ====================

  /**
   * Ottiene tutte le mod dalla libreria
   */
  async getAllMods(): Promise<Mod[]> {
    await this.ensureDirectories();
    const mods: Mod[] = [];

    if (!await fs.pathExists(this.libraryDir)) {
      return mods;
    }

    const files = await fs.readdir(this.libraryDir);

    for (const file of files) {
      if (!file.endsWith(".jar")) continue;

      const filePath = path.join(this.libraryDir, file);
      const mod = await this.getModFromFile(filePath);
      if (mod) {
        mods.push(mod);
      }
    }

    return mods.sort((a, b) => a.name.localeCompare(b.name));
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

    // Elimina il file
    try {
      await fs.remove(mod.path);
      return true;
    } catch (error) {
      console.error(`Failed to delete mod ${mod.path}:`, error);
      return false;
    }
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
   * Aggiorna i metadati di una mod (rinomina file se necessario)
   */
  async updateMod(modId: string, updates: Partial<Mod>): Promise<boolean> {
    const mod = await this.getModById(modId);
    if (!mod) return false;

    // Se si cambia il filename, rinomina il file
    if (updates.filename && updates.filename !== mod.filename) {
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

      await fs.rename(mod.path, newPath);
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
  async createModpack(data: { name: string; version?: string; description?: string }): Promise<string> {
    await this.ensureDirectories();

    let folderId = this.sanitizeFolderName(data.name);
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
   * Ottiene le mod di un modpack
   */
  async getModsInModpack(modpackId: string): Promise<Mod[]> {
    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    
    if (!await fs.pathExists(modsDir)) return [];

    const mods: Mod[] = [];
    const files = await fs.readdir(modsDir);

    for (const file of files) {
      if (!file.endsWith(".jar")) continue;

      const filePath = path.join(modsDir, file);
      const mod = await this.getModFromFile(filePath);
      if (mod) {
        mods.push(mod);
      }
    }

    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Aggiunge una mod a un modpack (copia il file)
   */
  async addModToModpack(modpackId: string, modId: string): Promise<boolean> {
    const mod = await this.getModById(modId);
    if (!mod) return false;

    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    await fs.ensureDir(modsDir);

    const destPath = path.join(modsDir, mod.filename);

    // Se esiste già, non copiare
    if (await fs.pathExists(destPath)) {
      return true;
    }

    try {
      await fs.copy(mod.path, destPath);
      return true;
    } catch (error) {
      console.error(`Failed to add mod to modpack:`, error);
      return false;
    }
  }

  /**
   * Rimuove una mod da un modpack (elimina il file dal modpack)
   */
  async removeModFromModpack(modpackId: string, modId: string): Promise<boolean> {
    const modsDir = path.join(this.getModpackPath(modpackId), "mods");
    
    if (!await fs.pathExists(modsDir)) return false;

    // Trova il file per hash
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

  /**
   * Apre la cartella nel file explorer
   */
  getBasePath(): string {
    return this.baseDir;
  }
}

export default FileSystemManager;
