/**
 * ConfigService - Manages mod configuration files for instances
 * 
 * Features:
 * - Browse config files in instances
 * - Read/write config files (TOML, JSON, properties, etc.)
 * - Export/import config sets
 * - Compare configs between instances
 * - Track config changes
 */

import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";

// ==================== TYPES ====================

export interface ConfigFile {
  /** Relative path from instance root */
  path: string;
  /** File name */
  name: string;
  /** File extension */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: string;
  /** Config type based on extension */
  type: ConfigType;
  /** Parent folder */
  folder: string;
  /** Associated mod (if detectable from folder/filename) */
  modId?: string;
}

export type ConfigType = 
  | "toml"       // Most common for Forge mods
  | "json"       // JSON configs
  | "json5"      // JSON5 configs
  | "properties" // Properties files
  | "cfg"        // Old CFG format
  | "yaml"       // YAML configs
  | "txt"        // Plain text
  | "snbt"       // Stringified NBT (KubeJS, etc.)
  | "unknown";

export interface ConfigFolder {
  /** Folder path relative to instance */
  path: string;
  /** Folder name */
  name: string;
  /** Number of config files */
  fileCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Subfolders */
  subfolders: ConfigFolder[];
  /** Files in this folder */
  files: ConfigFile[];
}

export interface ConfigContent {
  /** The raw content of the file */
  content: string;
  /** Parsed content (if parseable) */
  parsed?: any;
  /** File encoding */
  encoding: string;
  /** Parse errors if any */
  parseError?: string;
}

export interface ConfigExport {
  /** Export timestamp */
  exportedAt: string;
  /** Source instance ID */
  sourceInstanceId: string;
  /** Source instance name */
  sourceInstanceName: string;
  /** Modpack ID if linked */
  modpackId?: string;
  /** Included config folders */
  folders: string[];
  /** Total files */
  fileCount: number;
}

export interface ConfigChange {
  /** Config file path */
  path: string;
  /** Type of change */
  type: "added" | "modified" | "removed";
  /** Old content (for modified/removed) */
  oldContent?: string;
  /** New content (for added/modified) */
  newContent?: string;
  /** Timestamp */
  timestamp: string;
}

// ==================== STRUCTURED CONFIG TYPES ====================

/** A parsed config entry (key-value pair) */
export interface ConfigEntry {
  /** Unique key path (e.g., "general.enableFeature" or "[section].key") */
  keyPath: string;
  /** Display key name */
  key: string;
  /** Current value */
  value: any;
  /** Original value (for tracking changes) */
  originalValue: any;
  /** Value type */
  type: "string" | "number" | "boolean" | "array" | "object" | "null";
  /** Comment above or inline */
  comment?: string;
  /** Section/category this belongs to */
  section?: string;
  /** Nesting depth */
  depth: number;
  /** Has been modified */
  modified: boolean;
  /** Line number in original file */
  line?: number;
}

/** A section in the config file */
export interface ConfigSection {
  /** Section name/path */
  name: string;
  /** Display name */
  displayName: string;
  /** Section comment */
  comment?: string;
  /** Entries in this section */
  entries: ConfigEntry[];
  /** Subsections */
  subsections: ConfigSection[];
  /** Is expanded in UI */
  expanded: boolean;
}

/** Parsed config file structure */
export interface ParsedConfig {
  /** File path */
  path: string;
  /** File type */
  type: ConfigType;
  /** Root sections */
  sections: ConfigSection[];
  /** Flat list of all entries */
  allEntries: ConfigEntry[];
  /** Parse errors if any */
  errors: string[];
  /** Raw content for fallback */
  rawContent: string;
  /** File encoding */
  encoding: string;
}

/** Config modification record for version control */
export interface ConfigModification {
  /** Unique ID */
  id: string;
  /** File path */
  filePath: string;
  /** Key path that was modified */
  keyPath: string;
  /** Line number in file */
  line?: number;
  /** Old value */
  oldValue: any;
  /** New value */
  newValue: any;
  /** Timestamp */
  timestamp: string;
  /** Optional description */
  description?: string;
}

/** Config change set for version control */
export interface ConfigChangeSet {
  /** Change set ID */
  id: string;
  /** Instance ID */
  instanceId: string;
  /** Modpack ID */
  modpackId: string;
  /** List of modifications */
  modifications: ConfigModification[];
  /** When created */
  createdAt: string;
  /** Description */
  description?: string;
  /** Applied to version control */
  committed: boolean;
}

// ==================== SERVICE ====================

export class ConfigService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Validate that a relative path stays within the base directory (path traversal protection)
   * @param basePath The base directory path
   * @param relativePath The relative path to validate
   * @returns The resolved full path if valid
   * @throws Error if the path escapes the base directory
   */
  private validatePath(basePath: string, relativePath: string): string {
    // Resolve the full path
    const fullPath = path.resolve(basePath, relativePath);
    const resolvedBase = path.resolve(basePath);
    
    // Check that the resolved path starts with the base path
    // Using path.sep to ensure proper directory boundary matching
    if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
      throw new Error(`Invalid path: path traversal attempt detected`);
    }
    
    return fullPath;
  }

  // ==================== BROWSE ====================

  /**
   * Get all config folders for an instance
   */
  async getConfigFolders(instancePath: string): Promise<ConfigFolder[]> {
    const folders: ConfigFolder[] = [];
    
    // Main config locations (comprehensive list for Minecraft modding)
    const configLocations = [
      { name: "config", path: "config" },
      { name: "defaultconfigs", path: "defaultconfigs" },
      { name: "kubejs", path: "kubejs" },
      { name: "scripts", path: "scripts" },
      { name: "options", path: "options.txt" }, // Vanilla options
      { name: "servers", path: "servers.dat" }, // Server list
      { name: "resourcepacks", path: "resourcepacks" },
      { name: "shaderpacks", path: "shaderpacks" },
      { name: "local", path: "local" }, // Some mods use this
      { name: "saves", path: "saves" }, // World-specific configs
    ];

    for (const location of configLocations) {
      const fullPath = path.join(instancePath, location.path);
      if (await fs.pathExists(fullPath)) {
        // Check if it's a file or directory
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          const folder = await this.scanFolder(instancePath, location.path);
          if (folder) {
            folders.push(folder);
          }
        } else if (stat.isFile()) {
          // For single files like options.txt, create a virtual folder
          const ext = path.extname(location.path).toLowerCase().slice(1) || "txt";
          const virtualFolder: ConfigFolder = {
            path: path.dirname(location.path) || ".",
            name: location.name,
            fileCount: 1,
            totalSize: stat.size,
            subfolders: [],
            files: [{
              path: location.path,
              name: path.basename(location.path),
              extension: ext,
              size: stat.size,
              modified: stat.mtime.toISOString(),
              type: this.getConfigType(ext),
              folder: ".",
            }],
          };
          folders.push(virtualFolder);
        }
      }
    }

    return folders;
  }

  /**
   * Scan a folder recursively for config files
   */
  private async scanFolder(basePath: string, relativePath: string): Promise<ConfigFolder | null> {
    const fullPath = path.join(basePath, relativePath);
    
    if (!await fs.pathExists(fullPath)) {
      return null;
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      return null;
    }

    const folder: ConfigFolder = {
      path: relativePath,
      name: path.basename(relativePath),
      fileCount: 0,
      totalSize: 0,
      subfolders: [],
      files: [],
    };

    // Valid config file extensions
    const validConfigExtensions = new Set([
      'toml', 'json', 'json5', 'properties', 'cfg', 
      'yaml', 'yml', 'txt', 'snbt', 'conf', 'ini', 'xml'
    ]);

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        const subfolder = await this.scanFolder(basePath, entryPath);
        if (subfolder) {
          folder.subfolders.push(subfolder);
          folder.fileCount += subfolder.fileCount;
          folder.totalSize += subfolder.totalSize;
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase().slice(1);
        
        // Skip non-config files (images, binaries, etc.)
        if (!validConfigExtensions.has(ext)) {
          continue;
        }
        
        const filePath = path.join(fullPath, entry.name);
        const fileStat = await fs.stat(filePath);
        
        const configFile: ConfigFile = {
          path: entryPath,
          name: entry.name,
          extension: ext,
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
          type: this.getConfigType(ext),
          folder: relativePath,
          modId: this.detectModId(entry.name, relativePath),
        };

        folder.files.push(configFile);
        folder.fileCount++;
        folder.totalSize += fileStat.size;
      }
    }

    // Sort files and subfolders
    folder.files.sort((a, b) => a.name.localeCompare(b.name));
    folder.subfolders.sort((a, b) => a.name.localeCompare(b.name));

    return folder;
  }

  /**
   * Get config type from file extension
   */
  private getConfigType(ext: string): ConfigType {
    switch (ext) {
      case "toml": return "toml";
      case "json": return "json";
      case "json5": return "json5";
      case "properties": return "properties";
      case "cfg": return "cfg";
      case "yaml":
      case "yml": return "yaml";
      case "txt": return "txt";
      case "snbt": return "snbt";
      default: return "unknown";
    }
  }

  /**
   * Try to detect mod ID from filename or path
   */
  private detectModId(filename: string, folderPath: string): string | undefined {
    // Common patterns:
    // - config/modid.toml
    // - config/modid-client.toml
    // - config/modid/
    // - kubejs/server_scripts/modid/
    
    const baseName = path.basename(filename, path.extname(filename));
    
    // Remove common suffixes
    const cleanName = baseName
      .replace(/-client$/, "")
      .replace(/-common$/, "")
      .replace(/-server$/, "")
      .replace(/_client$/, "")
      .replace(/_common$/, "")
      .replace(/_server$/, "");

    // Check if it looks like a mod ID (lowercase, underscores/hyphens allowed)
    if (/^[a-z][a-z0-9_-]*$/.test(cleanName)) {
      return cleanName;
    }

    // Check parent folder
    const parts = folderPath.split(/[/\\]/);
    if (parts.length > 1) {
      const parentFolder = parts[parts.length - 1];
      if (/^[a-z][a-z0-9_-]*$/.test(parentFolder)) {
        return parentFolder;
      }
    }

    return undefined;
  }

  /**
   * Search for config files by name or mod ID
   */
  async searchConfigs(instancePath: string, query: string): Promise<ConfigFile[]> {
    const results: ConfigFile[] = [];
    const folders = await this.getConfigFolders(instancePath);
    const lowerQuery = query.toLowerCase();

    const searchFolder = (folder: ConfigFolder) => {
      for (const file of folder.files) {
        if (
          file.name.toLowerCase().includes(lowerQuery) ||
          file.modId?.toLowerCase().includes(lowerQuery) ||
          file.path.toLowerCase().includes(lowerQuery)
        ) {
          results.push(file);
        }
      }
      for (const subfolder of folder.subfolders) {
        searchFolder(subfolder);
      }
    };

    for (const folder of folders) {
      searchFolder(folder);
    }

    return results;
  }

  // ==================== READ/WRITE ====================

  /**
   * Read a config file's content
   */
  async readConfig(instancePath: string, configPath: string): Promise<ConfigContent> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = await fs.readFile(fullPath, "utf-8");
    const ext = path.extname(configPath).toLowerCase().slice(1);
    const type = this.getConfigType(ext);

    const result: ConfigContent = {
      content,
      encoding: "utf-8",
    };

    // Try to parse based on type
    try {
      switch (type) {
        case "json":
        case "json5":
          result.parsed = JSON.parse(content);
          break;
        case "toml":
          // TOML parsing would require a library, store as string
          break;
        case "properties":
          result.parsed = this.parseProperties(content);
          break;
        case "yaml":
          // YAML parsing would require a library, store as string
          break;
      }
    } catch (error: any) {
      result.parseError = error.message;
    }

    return result;
  }

  /**
   * Write content to a config file
   */
  async writeConfig(instancePath: string, configPath: string, content: string): Promise<void> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    
    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(fullPath));
    
    // Backup original if exists
    if (await fs.pathExists(fullPath)) {
      const backupPath = fullPath + ".bak";
      await fs.copy(fullPath, backupPath);
    }

    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Delete a config file
   */
  async deleteConfig(instancePath: string, configPath: string): Promise<void> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }

  /**
   * Create a new config file
   */
  async createConfig(instancePath: string, configPath: string, content: string = ""): Promise<void> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    
    if (await fs.pathExists(fullPath)) {
      throw new Error(`Config file already exists: ${configPath}`);
    }

    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /**
   * Parse properties file format
   */
  private parseProperties(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split("\n");
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  // ==================== EXPORT/IMPORT ====================

  /**
   * Export configs from an instance to a zip file
   */
  async exportConfigs(
    instancePath: string,
    instanceId: string,
    instanceName: string,
    outputPath: string,
    folders: string[] = ["config", "kubejs", "defaultconfigs"]
  ): Promise<ConfigExport> {
    const zip = new AdmZip();
    let fileCount = 0;

    // Add manifest
    const manifest: ConfigExport = {
      exportedAt: new Date().toISOString(),
      sourceInstanceId: instanceId,
      sourceInstanceName: instanceName,
      folders,
      fileCount: 0,
    };

    // Add each folder
    for (const folder of folders) {
      const folderPath = path.join(instancePath, folder);
      if (await fs.pathExists(folderPath)) {
        const addFolder = async (dir: string, zipPath: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const entryZipPath = path.join(zipPath, entry.name);
            
            if (entry.isDirectory()) {
              await addFolder(fullPath, entryZipPath);
            } else {
              zip.addLocalFile(fullPath, path.dirname(entryZipPath));
              fileCount++;
            }
          }
        };
        
        await addFolder(folderPath, folder);
      }
    }

    manifest.fileCount = fileCount;
    zip.addFile("modex-config-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
    
    zip.writeZip(outputPath);
    
    return manifest;
  }

  /**
   * Import configs from a zip file to an instance
   */
  async importConfigs(
    instancePath: string,
    zipPath: string,
    overwrite: boolean = false
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };
    
    let zip;
    try {
      zip = new AdmZip(zipPath);
    } catch (zipError) {
      result.errors.push(`Invalid zip file: ${zipError instanceof Error ? zipError.message : 'Unknown error'}`);
      return result;
    }
    const entries = zip.getEntries();

    // Check for manifest
    const manifestEntry = entries.find(e => e.entryName === "modex-config-manifest.json");
    if (manifestEntry) {
      try {
        const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
        console.log(`[ConfigService] Importing configs from ${manifest.sourceInstanceName}`);
      } catch {}
    }

    // Import files
    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName === "modex-config-manifest.json") {
        continue;
      }

      const destPath = path.join(instancePath, entry.entryName);
      
      try {
        if (await fs.pathExists(destPath) && !overwrite) {
          result.skipped++;
          continue;
        }

        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, entry.getData());
        result.imported++;
      } catch (error: any) {
        result.errors.push(`Failed to import ${entry.entryName}: ${error.message}`);
      }
    }

    return result;
  }

  // ==================== COMPARE ====================

  /**
   * Compare configs between two instances
   */
  async compareConfigs(
    instancePath1: string,
    instancePath2: string,
    folder: string = "config"
  ): Promise<{
    onlyInFirst: string[];
    onlyInSecond: string[];
    different: string[];
    identical: string[];
  }> {
    const result = {
      onlyInFirst: [] as string[],
      onlyInSecond: [] as string[],
      different: [] as string[],
      identical: [] as string[],
    };

    const getFiles = async (basePath: string, dir: string): Promise<Map<string, string>> => {
      const files = new Map<string, string>();
      const fullDir = path.join(basePath, dir);
      
      if (!await fs.pathExists(fullDir)) {
        return files;
      }

      const walk = async (currentDir: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else {
            const relativePath = path.relative(basePath, fullPath);
            const content = await fs.readFile(fullPath, "utf-8");
            files.set(relativePath, content);
          }
        }
      };

      await walk(fullDir);
      return files;
    };

    const files1 = await getFiles(instancePath1, folder);
    const files2 = await getFiles(instancePath2, folder);

    // Find files only in first
    for (const [filepath] of files1) {
      if (!files2.has(filepath)) {
        result.onlyInFirst.push(filepath);
      }
    }

    // Find files only in second
    for (const [filepath] of files2) {
      if (!files1.has(filepath)) {
        result.onlyInSecond.push(filepath);
      }
    }

    // Compare common files
    for (const [filepath, content1] of files1) {
      const content2 = files2.get(filepath);
      if (content2 !== undefined) {
        if (content1 === content2) {
          result.identical.push(filepath);
        } else {
          result.different.push(filepath);
        }
      }
    }

    return result;
  }

  /**
   * Get diff between two config files
   */
  async diffConfig(
    instancePath1: string,
    instancePath2: string,
    configPath: string
  ): Promise<{ content1: string; content2: string }> {
    const fullPath1 = path.join(instancePath1, configPath);
    const fullPath2 = path.join(instancePath2, configPath);

    const content1 = await fs.pathExists(fullPath1) 
      ? await fs.readFile(fullPath1, "utf-8")
      : "";
    const content2 = await fs.pathExists(fullPath2)
      ? await fs.readFile(fullPath2, "utf-8")
      : "";

    return { content1, content2 };
  }

  // ==================== BACKUP/RESTORE ====================

  /**
   * Create a backup of all configs in an instance
   */
  async backupConfigs(instancePath: string): Promise<string> {
    const backupDir = path.join(instancePath, ".config-backups");
    await fs.ensureDir(backupDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `backup-${timestamp}.zip`);
    
    const zip = new AdmZip();
    const folders = ["config", "kubejs", "defaultconfigs", "scripts"];
    
    for (const folder of folders) {
      const folderPath = path.join(instancePath, folder);
      if (await fs.pathExists(folderPath)) {
        zip.addLocalFolder(folderPath, folder);
      }
    }
    
    zip.writeZip(backupPath);
    
    return backupPath;
  }

  /**
   * List available config backups
   */
  async listBackups(instancePath: string): Promise<{ path: string; date: string; size: number }[]> {
    const backupDir = path.join(instancePath, ".config-backups");
    
    if (!await fs.pathExists(backupDir)) {
      return [];
    }

    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const backups: { path: string; date: string; size: number }[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".zip")) {
        const fullPath = path.join(backupDir, entry.name);
        const stat = await fs.stat(fullPath);
        
        // Parse date from filename: backup-2024-01-15T12-30-00-000Z.zip
        const dateMatch = entry.name.match(/backup-(.+)\.zip/);
        const dateStr = dateMatch 
          ? dateMatch[1].replace(/-/g, (m, i) => i < 10 ? "-" : i === 10 ? "T" : i > 10 && i < 19 ? ":" : ".")
          : stat.mtime.toISOString();

        backups.push({
          path: fullPath,
          date: dateStr,
          size: stat.size,
        });
      }
    }

    // Sort by date descending
    backups.sort((a, b) => b.date.localeCompare(a.date));
    
    return backups;
  }

  /**
   * Restore configs from a backup
   */
  async restoreBackup(instancePath: string, backupPath: string): Promise<{ restored: number }> {
    // First backup current state
    await this.backupConfigs(instancePath);
    
    // Clear current configs
    const folders = ["config", "kubejs", "defaultconfigs", "scripts"];
    for (const folder of folders) {
      const folderPath = path.join(instancePath, folder);
      if (await fs.pathExists(folderPath)) {
        await fs.remove(folderPath);
      }
    }
    
    // Extract backup
    let zip;
    try {
      zip = new AdmZip(backupPath);
    } catch (zipError) {
      throw new Error(`Invalid backup file: ${zipError instanceof Error ? zipError.message : 'Unknown error'}`);
    }
    zip.extractAllTo(instancePath, true);
    
    return { restored: zip.getEntries().filter(e => !e.isDirectory).length };
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupPath: string): Promise<void> {
    if (await fs.pathExists(backupPath)) {
      await fs.remove(backupPath);
    }
  }

  // ==================== COPY BETWEEN INSTANCES ====================

  /**
   * Copy specific config files from one instance to another
   */
  async copyConfigFiles(
    sourceInstance: string,
    targetInstance: string,
    configPaths: string[],
    overwrite: boolean = true
  ): Promise<{ copied: number; skipped: number; errors: string[] }> {
    const result = { copied: 0, skipped: 0, errors: [] as string[] };

    for (const configPath of configPaths) {
      const sourcePath = path.join(sourceInstance, configPath);
      const targetPath = path.join(targetInstance, configPath);

      try {
        if (!await fs.pathExists(sourcePath)) {
          result.errors.push(`Source file not found: ${configPath}`);
          continue;
        }

        if (await fs.pathExists(targetPath) && !overwrite) {
          result.skipped++;
          continue;
        }

        await fs.ensureDir(path.dirname(targetPath));
        await fs.copy(sourcePath, targetPath, { overwrite });
        result.copied++;
      } catch (error: any) {
        result.errors.push(`Failed to copy ${configPath}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Copy entire config folder from one instance to another
   */
  async copyConfigFolder(
    sourceInstance: string,
    targetInstance: string,
    folder: string = "config",
    overwrite: boolean = true
  ): Promise<{ copied: number }> {
    const sourcePath = path.join(sourceInstance, folder);
    const targetPath = path.join(targetInstance, folder);

    if (!await fs.pathExists(sourcePath)) {
      return { copied: 0 };
    }

    // Count files first
    const countFiles = async (dir: string): Promise<number> => {
      let count = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += await countFiles(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
      return count;
    };

    const fileCount = await countFiles(sourcePath);
    await fs.copy(sourcePath, targetPath, { overwrite });

    return { copied: fileCount };
  }

  // ==================== STRUCTURED CONFIG PARSING ====================

  /**
   * Parse a config file into structured entries
   */
  async parseConfigStructured(instancePath: string, configPath: string): Promise<ParsedConfig> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = await fs.readFile(fullPath, "utf-8");
    const ext = path.extname(configPath).toLowerCase().slice(1);
    const type = this.getConfigType(ext);

    const result: ParsedConfig = {
      path: configPath,
      type,
      sections: [],
      allEntries: [],
      errors: [],
      rawContent: content,
      encoding: "utf-8",
    };

    try {
      switch (type) {
        case "json":
        case "json5":
          this.parseJsonStructured(content, result);
          break;
        case "toml":
          this.parseTomlStructured(content, result);
          break;
        case "properties":
        case "cfg":
          this.parsePropertiesStructured(content, result);
          break;
        case "yaml":
          this.parseYamlStructured(content, result);
          break;
        default:
          // For unknown types, create a single "raw" entry
          result.sections.push({
            name: "content",
            displayName: "Content",
            entries: [{
              keyPath: "content",
              key: "content",
              value: content,
              originalValue: content,
              type: "string",
              depth: 0,
              modified: false,
            }],
            subsections: [],
            expanded: true,
          });
      }
    } catch (error: any) {
      result.errors.push(error.message);
    }

    // Flatten all entries
    const flattenSection = (section: ConfigSection, entries: ConfigEntry[]) => {
      entries.push(...section.entries);
      for (const sub of section.subsections) {
        flattenSection(sub, entries);
      }
    };
    for (const section of result.sections) {
      flattenSection(section, result.allEntries);
    }

    return result;
  }

  /**
   * Parse JSON into structured config
   */
  private parseJsonStructured(content: string, result: ParsedConfig): void {
    const parsed = JSON.parse(content);
    const lines = content.split("\n");
    
    // Helper to find line number for a key
    const findKeyLine = (key: string, startLine: number = 0): number => {
      // Search for "key": or "key" : pattern
      const keyPattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`);
      for (let i = startLine; i < lines.length; i++) {
        if (keyPattern.test(lines[i])) {
          return i + 1; // 1-based line number
        }
      }
      return 0;
    };
    
    let lastFoundLine = 0;
    
    // For top-level objects in JSON, treat first level nested objects as sections
    // e.g., { "dragon": {...}, "pixie": {...} } -> dragon and pixie are sections
    const isTopLevelSectionStructure = typeof parsed === 'object' && 
      !Array.isArray(parsed) &&
      Object.values(parsed).every(v => v !== null && typeof v === 'object' && !Array.isArray(v));
    
    const processObject = (obj: any, parentPath: string, depth: number, sectionName: string = ''): ConfigSection => {
      const section: ConfigSection = {
        name: parentPath || "root",
        displayName: parentPath ? parentPath.split(".").pop() || parentPath : "Root",
        entries: [],
        subsections: [],
        expanded: depth < 2,
      };

      for (const [key, value] of Object.entries(obj)) {
        const keyPath = parentPath ? `${parentPath}.${key}` : key;
        const lineNum = findKeyLine(key, lastFoundLine);
        if (lineNum > 0) lastFoundLine = lineNum;
        
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          // Check if this is a top-level section (depth 0 with section structure)
          if (depth === 0 && isTopLevelSectionStructure) {
            // This nested object is a section - process its contents with section name
            section.subsections.push(processObject(value, keyPath, depth + 1, key));
          } else {
            // Regular nested object becomes a subsection
            section.subsections.push(processObject(value, keyPath, depth + 1, sectionName));
          }
        } else {
          // Primitive or array becomes an entry
          // Use the immediate parent as section name for better grouping
          const effectiveSection = sectionName || (parentPath ? parentPath.split('.')[0] : '');
          section.entries.push({
            keyPath,
            key,
            value,
            originalValue: JSON.parse(JSON.stringify(value)),
            type: this.getValueType(value),
            depth,
            modified: false,
            line: lineNum || undefined,
            section: effectiveSection, // Add section name for grouping
          });
        }
      }

      return section;
    };

    result.sections.push(processObject(parsed, "", 0));
  }

  /**
   * Parse TOML into structured config (simplified parser)
   */
  private parseTomlStructured(content: string, result: ParsedConfig): void {
    const lines = content.split("\n");
    let currentSection: ConfigSection = {
      name: "general",
      displayName: "General",
      entries: [],
      subsections: [],
      expanded: true,
    };
    result.sections.push(currentSection);

    const sectionMap = new Map<string, ConfigSection>();
    sectionMap.set("general", currentSection);

    let lineNum = 0;
    let currentComment = "";

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        currentComment = "";
        continue;
      }

      // Comment
      if (trimmed.startsWith("#")) {
        currentComment = trimmed.slice(1).trim();
        continue;
      }

      // Section header [section] or [[array.section]]
      const sectionMatch = trimmed.match(/^\[+([^\]]+)\]+$/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1].trim();
        const displayName = sectionName.split(".").pop() || sectionName;
        
        if (!sectionMap.has(sectionName)) {
          const newSection: ConfigSection = {
            name: sectionName,
            displayName,
            comment: currentComment || undefined,
            entries: [],
            subsections: [],
            expanded: true,
          };
          sectionMap.set(sectionName, newSection);
          
          // Find parent section
          const parts = sectionName.split(".");
          if (parts.length > 1) {
            const parentName = parts.slice(0, -1).join(".");
            const parent = sectionMap.get(parentName);
            if (parent) {
              parent.subsections.push(newSection);
            } else {
              result.sections.push(newSection);
            }
          } else {
            result.sections.push(newSection);
          }
        }
        currentSection = sectionMap.get(sectionName)!;
        currentComment = "";
        continue;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let valueStr = kvMatch[2].trim();
        
        // Parse the value
        let value: any = valueStr;
        let type: ConfigEntry["type"] = "string";

        // Check for inline comment
        let inlineComment = "";
        const commentIdx = valueStr.indexOf("#");
        if (commentIdx > 0 && !valueStr.startsWith('"') && !valueStr.startsWith("'")) {
          inlineComment = valueStr.slice(commentIdx + 1).trim();
          valueStr = valueStr.slice(0, commentIdx).trim();
        }

        // Parse value type
        if (valueStr === "true" || valueStr === "false") {
          value = valueStr === "true";
          type = "boolean";
        } else if (valueStr.match(/^-?\d+$/)) {
          value = parseInt(valueStr, 10);
          type = "number";
        } else if (valueStr.match(/^-?\d+\.\d+$/)) {
          value = parseFloat(valueStr);
          type = "number";
        } else if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
          value = valueStr.slice(1, -1);
          type = "string";
        } else if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
          value = valueStr.slice(1, -1);
          type = "string";
        } else if (valueStr.startsWith("[")) {
          // Array - try to parse
          try {
            value = JSON.parse(valueStr.replace(/'/g, '"'));
            type = "array";
          } catch {
            value = valueStr;
            type = "string";
          }
        }

        const keyPath = currentSection.name === "general" 
          ? key 
          : `${currentSection.name}.${key}`;

        currentSection.entries.push({
          keyPath,
          key,
          value,
          originalValue: JSON.parse(JSON.stringify(value)),
          type,
          comment: currentComment || inlineComment || undefined,
          section: currentSection.name,
          depth: currentSection.name.split(".").length,
          modified: false,
          line: lineNum,
        });

        currentComment = "";
      }
    }

    // Remove empty general section if it exists
    if (result.sections[0]?.name === "general" && result.sections[0].entries.length === 0) {
      result.sections.shift();
    }
  }

  /**
   * Parse properties/cfg into structured config
   */
  private parsePropertiesStructured(content: string, result: ParsedConfig): void {
    const lines = content.split("\n");
    const section: ConfigSection = {
      name: "properties",
      displayName: "Properties",
      entries: [],
      subsections: [],
      expanded: true,
    };

    let lineNum = 0;
    let currentComment = "";

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      if (!trimmed) {
        currentComment = "";
        continue;
      }

      if (trimmed.startsWith("#") || trimmed.startsWith("!")) {
        currentComment = trimmed.slice(1).trim();
        continue;
      }

      const sepIdx = trimmed.indexOf("=");
      if (sepIdx === -1) continue;

      const key = trimmed.slice(0, sepIdx).trim();
      const valueStr = trimmed.slice(sepIdx + 1).trim();

      let value: any = valueStr;
      let type: ConfigEntry["type"] = "string";

      if (valueStr === "true" || valueStr === "false") {
        value = valueStr === "true";
        type = "boolean";
      } else if (valueStr.match(/^-?\d+$/)) {
        value = parseInt(valueStr, 10);
        type = "number";
      } else if (valueStr.match(/^-?\d+\.\d+$/)) {
        value = parseFloat(valueStr);
        type = "number";
      }

      section.entries.push({
        keyPath: key,
        key,
        value,
        originalValue: value,
        type,
        comment: currentComment || undefined,
        depth: 0,
        modified: false,
        line: lineNum,
      });

      currentComment = "";
    }

    result.sections.push(section);
  }

  /**
   * Parse YAML into structured config (simplified)
   */
  private parseYamlStructured(content: string, result: ParsedConfig): void {
    // Basic YAML parsing - handles simple key: value pairs
    const lines = content.split("\n");
    const rootSection: ConfigSection = {
      name: "root",
      displayName: "Root",
      entries: [],
      subsections: [],
      expanded: true,
    };

    const sectionStack: { section: ConfigSection; indent: number }[] = [
      { section: rootSection, indent: -2 }
    ];

    let lineNum = 0;
    let currentComment = "";

    for (const line of lines) {
      lineNum++;
      
      if (!line.trim()) {
        currentComment = "";
        continue;
      }

      if (line.trim().startsWith("#")) {
        currentComment = line.trim().slice(1).trim();
        continue;
      }

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Pop sections that are no longer in scope
      while (sectionStack.length > 1 && indent <= sectionStack[sectionStack.length - 1].indent) {
        sectionStack.pop();
      }

      const currentParent = sectionStack[sectionStack.length - 1].section;

      // Check if this is a key: value or just key:
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const valueStr = trimmed.slice(colonIdx + 1).trim();

      if (!valueStr) {
        // This is a section/object
        const newSection: ConfigSection = {
          name: key,
          displayName: key,
          comment: currentComment || undefined,
          entries: [],
          subsections: [],
          expanded: true,
        };
        currentParent.subsections.push(newSection);
        sectionStack.push({ section: newSection, indent });
      } else {
        // This is a value
        let value: any = valueStr;
        let type: ConfigEntry["type"] = "string";

        if (valueStr === "true" || valueStr === "false") {
          value = valueStr === "true";
          type = "boolean";
        } else if (valueStr === "null" || valueStr === "~") {
          value = null;
          type = "null";
        } else if (valueStr.match(/^-?\d+$/)) {
          value = parseInt(valueStr, 10);
          type = "number";
        } else if (valueStr.match(/^-?\d+\.\d+$/)) {
          value = parseFloat(valueStr);
          type = "number";
        } else if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
          value = valueStr.slice(1, -1);
        } else if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
          value = valueStr.slice(1, -1);
        } else if (valueStr.startsWith("[") && valueStr.endsWith("]")) {
          try {
            value = JSON.parse(valueStr);
            type = "array";
          } catch {
            // Keep as string
          }
        }

        currentParent.entries.push({
          keyPath: key,
          key,
          value,
          originalValue: JSON.parse(JSON.stringify(value)),
          type,
          comment: currentComment || undefined,
          depth: sectionStack.length - 1,
          modified: false,
          line: lineNum,
        });
      }

      currentComment = "";
    }

    result.sections.push(rootSection);
  }

  /**
   * Get the type of a value
   */
  private getValueType(value: any): ConfigEntry["type"] {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return "number";
    if (typeof value === "object") return "object";
    return "string";
  }

  /**
   * Save structured config back to file
   */
  async saveConfigStructured(
    instancePath: string, 
    configPath: string, 
    entries: ConfigEntry[],
    modpackId?: string
  ): Promise<{ success: boolean; modifications: ConfigModification[] }> {
    // Validate path to prevent path traversal attacks
    const fullPath = this.validatePath(instancePath, configPath);
    const ext = path.extname(configPath).toLowerCase().slice(1);
    const type = this.getConfigType(ext);

    console.log("[ConfigService] saveConfigStructured called:", {
      instancePath,
      configPath,
      fullPath,
      entriesCount: entries.length,
      modifiedCount: entries.filter(e => e.modified).length,
      entries: entries.map(e => ({ keyPath: e.keyPath, value: e.value, modified: e.modified }))
    });

    // Read original content
    const originalContent = await fs.readFile(fullPath, "utf-8");
    
    // Track modifications
    const modifications: ConfigModification[] = [];
    const modifiedEntries = entries.filter(e => e.modified);

    for (const entry of modifiedEntries) {
      modifications.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        filePath: configPath,
        keyPath: entry.keyPath,
        line: entry.line,
        oldValue: entry.originalValue,
        newValue: entry.value,
        timestamp: new Date().toISOString(),
      });
    }

    // Generate new content based on file type
    let newContent: string;

    try {
      switch (type) {
        case "json":
        case "json5":
          newContent = this.rebuildJson(originalContent, modifiedEntries);
          break;
        case "toml":
          newContent = this.rebuildToml(originalContent, modifiedEntries);
          break;
        case "properties":
        case "cfg":
          newContent = this.rebuildProperties(originalContent, modifiedEntries);
          break;
        case "yaml":
          newContent = this.rebuildYaml(originalContent, modifiedEntries);
          break;
        default:
          // For unknown types, just use the value directly
          if (modifiedEntries.length > 0) {
            newContent = String(modifiedEntries[0].value);
          } else {
            newContent = originalContent;
          }
      }
    } catch (error) {
      console.error(`[ConfigService] Failed to rebuild ${type} config:`, error);
      throw new Error(`Failed to parse config file: ${(error as Error).message}`);
    }

    console.log("[ConfigService] Content rebuild complete:", {
      type,
      modifiedEntriesCount: modifiedEntries.length,
      originalLength: originalContent.length,
      newLength: newContent.length,
      changed: originalContent !== newContent
    });

    // Backup original
    const backupPath = fullPath + ".modex-backup";
    await fs.copy(fullPath, backupPath);

    // Write new content
    await fs.writeFile(fullPath, newContent, "utf-8");
    
    console.log("[ConfigService] File written to:", fullPath);

    // Store modifications for version control if modpackId provided
    if (modpackId && modifications.length > 0) {
      await this.saveModificationsToVersionControl(modpackId, instancePath, modifications);
    }

    return { success: true, modifications };
  }

  /**
   * Rebuild JSON file with modifications
   */
  private rebuildJson(original: string, modifications: ConfigEntry[]): string {
    const parsed = JSON.parse(original);

    for (const mod of modifications) {
      const keys = mod.keyPath.split(".");
      let obj = parsed;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      
      obj[keys[keys.length - 1]] = mod.value;
    }

    // Try to preserve formatting
    const indent = original.match(/^(\s+)"/m)?.[1]?.length || 2;
    return JSON.stringify(parsed, null, indent);
  }

  /**
   * Rebuild TOML file with modifications
   */
  private rebuildToml(original: string, modifications: ConfigEntry[]): string {
    const lines = original.split("\n");
    
    // Create maps for matching
    const modByKeyPath = new Map(modifications.map(m => [m.keyPath, m]));
    const modByLine = new Map(modifications.filter(m => m.line).map(m => [m.line, m]));
    
    let currentSection = "";

    return lines.map((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      
      // Track section headers
      const sectionMatch = trimmed.match(/^\[(.+?)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        return line;
      }
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }

      // Find the = and extract key
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return line;

      const keyPart = line.slice(0, eqIdx).trim();
      const fullKeyPath = currentSection ? `${currentSection}.${keyPart}` : keyPart;
      
      // Try to find modification by keyPath
      let mod = modByKeyPath.get(fullKeyPath) || modByKeyPath.get(keyPart);
      
      // Fallback to line number
      if (!mod) {
        mod = modByLine.get(lineNum);
      }
      
      if (!mod) return line;

      const key = line.slice(0, eqIdx + 1);
      let valueStr: string;

      if (mod.type === "string") {
        valueStr = ` "${mod.value}"`;
      } else if (mod.type === "boolean") {
        valueStr = ` ${mod.value}`;
      } else if (mod.type === "array") {
        valueStr = ` ${JSON.stringify(mod.value)}`;
      } else {
        valueStr = ` ${mod.value}`;
      }

      // Preserve inline comment if present
      const commentMatch = line.match(/#.*$/);
      if (commentMatch) {
        valueStr += " " + commentMatch[0];
      }

      return key + valueStr;
    }).join("\n");
  }

  /**
   * Rebuild properties file with modifications
   */
  private rebuildProperties(original: string, modifications: ConfigEntry[]): string {
    const lines = original.split("\n");
    
    // Create a map by keyPath for matching
    const modByKeyPath = new Map(modifications.map(m => [m.keyPath, m]));
    // Also create map by line number as fallback
    const modByLine = new Map(modifications.filter(m => m.line).map(m => [m.line, m]));

    return lines.map((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
        return line;
      }

      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return line;

      // Extract the key part (everything before =)
      const keyPart = line.slice(0, eqIdx).trim();
      
      // Check if we have a modification for this key
      // Try exact match first
      let mod = modByKeyPath.get(keyPart);
      
      // If not found, try matching without type prefix (B:, S:, I:, etc.)
      if (!mod) {
        // CFG files often have format like: B:"Key Name"=value or S:keyName=value
        const keyMatch = keyPart.match(/^[A-Z]:["']?(.+?)["']?$/);
        if (keyMatch) {
          const cleanKey = keyMatch[1];
          // Try to find by clean key
          for (const [kp, m] of modByKeyPath) {
            if (kp.includes(cleanKey) || cleanKey.includes(kp.replace(/^[A-Z]:["']?|["']?$/g, ''))) {
              mod = m;
              break;
            }
          }
        }
      }
      
      // Fallback to line number
      if (!mod) {
        mod = modByLine.get(lineNum);
      }
      
      if (!mod) return line;

      // Rebuild the line with new value
      const key = line.slice(0, eqIdx + 1);
      let valueStr: string;
      
      if (typeof mod.value === "boolean") {
        valueStr = mod.value.toString();
      } else if (typeof mod.value === "string") {
        valueStr = mod.value;
      } else {
        valueStr = String(mod.value);
      }
      
      return key + valueStr;
    }).join("\n");
  }

  /**
   * Rebuild YAML file with modifications
   */
  private rebuildYaml(original: string, modifications: ConfigEntry[]): string {
    const lines = original.split("\n");
    
    // Create maps for matching
    const modByKeyPath = new Map(modifications.map(m => [m.keyPath, m]));
    const modByLine = new Map(modifications.filter(m => m.line).map(m => [m.line, m]));
    
    // Track indentation-based path
    const pathStack: { indent: number; key: string }[] = [];

    return lines.map((line, idx) => {
      const lineNum = idx + 1;
      
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return line;

      // Calculate indentation
      const indent = line.search(/\S/);
      const keyPart = line.slice(0, colonIdx).trim();
      
      // Update path stack based on indentation
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }
      
      // Build full key path
      const fullKeyPath = [...pathStack.map(p => p.key), keyPart].join(".");
      
      // Check if this line has a value (not just a parent key)
      const hasValue = line.slice(colonIdx + 1).trim().length > 0;
      if (!hasValue) {
        pathStack.push({ indent, key: keyPart });
        return line;
      }
      
      // Try to find modification
      let mod = modByKeyPath.get(fullKeyPath) || modByKeyPath.get(keyPart);
      if (!mod) {
        mod = modByLine.get(lineNum);
      }
      
      if (!mod) return line;

      const key = line.slice(0, colonIdx + 1);
      let valueStr: string;

      if (mod.type === "string" && String(mod.value).includes(":")) {
        valueStr = ` "${mod.value}"`;
      } else if (mod.type === "null") {
        valueStr = " null";
      } else if (mod.type === "array") {
        valueStr = ` ${JSON.stringify(mod.value)}`;
      } else {
        valueStr = ` ${mod.value}`;
      }

      return key + valueStr;
    }).join("\n");
  }

  /**
   * Save modifications to version control
   */
  private async saveModificationsToVersionControl(
    modpackId: string,
    instancePath: string,
    modifications: ConfigModification[]
  ): Promise<void> {
    console.log("[ConfigService] saveModificationsToVersionControl called:", {
      modpackId,
      instancePath,
      modificationsCount: modifications.length
    });
    
    // Store in a .modex-changes folder within the instance
    const changesDir = path.join(instancePath, ".modex-changes");
    await fs.ensureDir(changesDir);

    const changeSet: ConfigChangeSet = {
      id: `cs-${Date.now()}`,
      instanceId: path.basename(instancePath),
      modpackId,
      modifications,
      createdAt: new Date().toISOString(),
      committed: false,
    };

    // Append to changes log
    const logPath = path.join(changesDir, "config-changes.json");
    console.log("[ConfigService] Writing to:", logPath);
    
    let existingChanges: ConfigChangeSet[] = [];

    if (await fs.pathExists(logPath)) {
      try {
        existingChanges = JSON.parse(await fs.readFile(logPath, "utf-8"));
      } catch {
        existingChanges = [];
      }
    }

    existingChanges.push(changeSet);
    await fs.writeFile(logPath, JSON.stringify(existingChanges, null, 2));
    console.log("[ConfigService] Config changes saved successfully");
  }

  /**
   * Get all config modifications for an instance
   */
  async getConfigModifications(instancePath: string): Promise<ConfigChangeSet[]> {
    const logPath = path.join(instancePath, ".modex-changes", "config-changes.json");
    
    if (!await fs.pathExists(logPath)) {
      return [];
    }

    try {
      return JSON.parse(await fs.readFile(logPath, "utf-8"));
    } catch (error) {
      console.warn(`[ConfigService] Failed to parse config modifications log:`, error);
      return [];
    }
  }

  /**
   * Rollback config modifications from a change set
   */
  async rollbackConfigChanges(
    instancePath: string,
    changeSetId: string
  ): Promise<{ success: boolean; restored: number }> {
    const changes = await this.getConfigModifications(instancePath);
    const changeSet = changes.find(cs => cs.id === changeSetId);

    if (!changeSet) {
      throw new Error("Change set not found");
    }

    let restored = 0;

    // Group modifications by file
    const fileModifications = new Map<string, ConfigModification[]>();
    for (const mod of changeSet.modifications) {
      if (!fileModifications.has(mod.filePath)) {
        fileModifications.set(mod.filePath, []);
      }
      fileModifications.get(mod.filePath)!.push(mod);
    }

    // Rollback each file
    for (const [filePath, mods] of fileModifications) {
      const fullPath = path.join(instancePath, filePath);
      if (!await fs.pathExists(fullPath)) continue;

      // Create entries to "undo" - swap old/new values
      const rollbackEntries: ConfigEntry[] = mods.map(mod => ({
        keyPath: mod.keyPath,
        key: mod.keyPath.split(".").pop() || mod.keyPath,
        value: mod.oldValue, // Restore old value
        originalValue: mod.newValue,
        type: this.getValueType(mod.oldValue),
        depth: 0,
        modified: true,
        line: undefined,
      }));

      // Find line numbers by re-parsing
      const parsed = await this.parseConfigStructured(instancePath, filePath);
      for (const entry of rollbackEntries) {
        const found = parsed.allEntries.find(e => e.keyPath === entry.keyPath);
        if (found) {
          entry.line = found.line;
        }
      }

      await this.saveConfigStructured(instancePath, filePath, rollbackEntries);
      restored += mods.length;
    }

    // Remove the change set from history
    const updatedChanges = changes.filter(cs => cs.id !== changeSetId);
    const logPath = path.join(instancePath, ".modex-changes", "config-changes.json");
    await fs.writeFile(logPath, JSON.stringify(updatedChanges, null, 2));

    return { success: true, restored };
  }
}
