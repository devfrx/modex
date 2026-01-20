/**
 * ModpackAnalyzerService - Modpack Preview and Parsing
 * 
 * Features:
 * - Pre-import preview from zip files
 * - Parse CurseForge, Modrinth, and Modex manifest formats
 * - Basic modpack information extraction
 * 
 * NOTE: RAM estimation and performance analysis have been removed
 * as they were based on unreliable static data.
 */

import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { createLogger } from "./LoggerService.js";

const log = createLogger("ModpackAnalyzer");

// ==================== TYPES ====================

export interface ModpackPreview {
  // Basic info
  name: string;
  version: string;
  author?: string;
  description?: string;
  
  // Minecraft info
  minecraftVersion: string;
  modLoader: string;
  modLoaderVersion?: string;
  
  // Mod info
  modCount: number;
  mods: Array<{
    projectId: number;
    fileId: number;
    name?: string;
    required: boolean;
  }>;
  
  // Resource packs and shaders
  resourcePackCount: number;
  shaderCount: number;
  
  // Source info
  source: "curseforge" | "modrinth" | "modex" | "zip" | "unknown";
  cfProjectId?: number;
  cfFileId?: number;
  mrProjectId?: string;
  
  // Files
  overridesCount: number;
  configFilesCount: number;
  totalSize?: number;
}

// ==================== SERVICE ====================

export class ModpackAnalyzerService {
  constructor() {}

  // ==================== PREVIEW ====================

  /**
   * Parse and preview a modpack from a zip file
   */
  async previewFromZip(zipPath: string): Promise<ModpackPreview | null> {
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Look for manifest
      const manifestEntry = entries.find(e => 
        e.entryName === "manifest.json" || 
        e.entryName.endsWith("/manifest.json")
      );

      // Look for modrinth index
      const modrinthEntry = entries.find(e =>
        e.entryName === "modrinth.index.json" ||
        e.entryName.endsWith("/modrinth.index.json")
      );

      // Look for .modex manifest
      const modexEntry = entries.find(e =>
        e.entryName.endsWith(".modex") ||
        e.entryName === "modex-manifest.json"
      );

      if (manifestEntry) {
        return this.parseManifest(
          JSON.parse(manifestEntry.getData().toString("utf8")),
          entries,
          zipPath
        );
      }

      if (modrinthEntry) {
        return this.parseModrinthIndex(
          JSON.parse(modrinthEntry.getData().toString("utf8")),
          entries,
          zipPath
        );
      }

      if (modexEntry) {
        return this.parseModexManifest(
          JSON.parse(modexEntry.getData().toString("utf8")),
          entries,
          zipPath
        );
      }

      return null;
    } catch (error) {
      log.error("Error previewing modpack:", error);
      return null;
    }
  }

  /**
   * Preview from CurseForge modpack data (before download)
   */
  async previewFromCurseForge(
    modpackData: any,
    fileData: any
  ): Promise<ModpackPreview | null> {
    try {
      const mods: ModpackPreview["mods"] = [];
      let modCount = 0;
      let resourcePackCount = 0;
      let shaderCount = 0;

      // CurseForge file may have dependencies listed
      if (fileData.dependencies) {
        for (const dep of fileData.dependencies) {
          mods.push({
            projectId: dep.modId,
            fileId: dep.fileId || 0,
            required: dep.relationType === 3
          });
          modCount++;
        }
      }

      // Try to get more info from modules if available
      if (fileData.modules) {
        for (const module of fileData.modules) {
          if (module.type === 1) { // Mod
            modCount++;
          } else if (module.type === 6) { // Resource pack
            resourcePackCount++;
          } else if (module.type === 7) { // Shader
            shaderCount++;
          }
        }
      }

      const minecraftVersion = this.extractMinecraftVersion(fileData.gameVersions || []);
      const modLoader = this.extractModLoader(fileData.gameVersions || []);

      const preview: ModpackPreview = {
        name: modpackData.name,
        version: fileData.displayName || fileData.fileName,
        author: modpackData.authors?.[0]?.name,
        description: modpackData.summary,
        minecraftVersion,
        modLoader,
        modCount,
        mods,
        resourcePackCount,
        shaderCount,
        source: "curseforge",
        cfProjectId: modpackData.id,
        cfFileId: fileData.id,
        overridesCount: 0,
        configFilesCount: 0,
        totalSize: fileData.fileLength
      };

      return preview;
    } catch (error) {
      log.error("Error previewing CurseForge modpack:", error);
      return null;
    }
  }

  // ==================== PARSING ====================

  private parseManifest(
    manifest: any,
    entries: AdmZip.IZipEntry[],
    zipPath: string
  ): ModpackPreview {
    const mods: ModpackPreview["mods"] = [];
    let resourcePackCount = 0;
    let shaderCount = 0;

    // Parse files
    for (const file of manifest.files || []) {
      mods.push({
        projectId: file.projectID,
        fileId: file.fileID,
        required: file.required !== false
      });
    }

    // Count overrides
    const overrides = entries.filter(e => 
      e.entryName.startsWith("overrides/") || 
      e.entryName.startsWith(manifest.overrides + "/")
    );

    const configFiles = overrides.filter(e => 
      e.entryName.includes("/config/") ||
      e.entryName.endsWith(".cfg") ||
      e.entryName.endsWith(".json5") ||
      e.entryName.endsWith(".toml")
    );

    const minecraftVersion = manifest.minecraft?.version || "";
    const modLoaderInfo = manifest.minecraft?.modLoaders?.[0] || {};
    const modLoader = modLoaderInfo.id?.split("-")[0] || "forge";

    const preview: ModpackPreview = {
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      minecraftVersion,
      modLoader,
      modLoaderVersion: modLoaderInfo.id?.split("-")[1],
      modCount: mods.length,
      mods,
      resourcePackCount,
      shaderCount,
      source: "curseforge",
      overridesCount: overrides.length,
      configFilesCount: configFiles.length,
      totalSize: fs.statSync(zipPath).size
    };

    return preview;
  }

  private parseModrinthIndex(
    index: any,
    entries: AdmZip.IZipEntry[],
    zipPath: string
  ): ModpackPreview {
    const mods: ModpackPreview["mods"] = [];

    for (const file of index.files || []) {
      // Modrinth uses hashes instead of IDs
      mods.push({
        projectId: 0, // Would need API call to resolve
        fileId: 0,
        name: file.path?.split("/").pop()?.replace(".jar", ""),
        required: true
      });
    }

    const preview: ModpackPreview = {
      name: index.name,
      version: index.versionId,
      description: index.summary,
      minecraftVersion: index.dependencies?.minecraft || "",
      modLoader: Object.keys(index.dependencies || {}).find(k => k !== "minecraft") || "unknown",
      modCount: mods.length,
      mods,
      resourcePackCount: 0,
      shaderCount: 0,
      source: "modrinth",
      mrProjectId: index.versionId,
      overridesCount: entries.filter(e => e.entryName.startsWith("overrides/")).length,
      configFilesCount: 0,
      totalSize: fs.statSync(zipPath).size
    };

    return preview;
  }

  private parseModexManifest(
    manifest: any,
    entries: AdmZip.IZipEntry[],
    zipPath: string
  ): ModpackPreview {
    const mods = (manifest.mods || []).map((m: any) => ({
      projectId: m.cf_project_id || 0,
      fileId: m.cf_file_id || 0,
      name: m.name,
      required: !m.disabled
    }));

    const preview: ModpackPreview = {
      name: manifest.modpack?.name || manifest.name || "Unknown",
      version: manifest.modpack?.version || manifest.version || "1.0.0",
      author: manifest.modpack?.author,
      description: manifest.modpack?.description,
      minecraftVersion: manifest.modpack?.minecraft_version || "",
      modLoader: manifest.modpack?.loader || "forge",
      modCount: mods.length,
      mods,
      resourcePackCount: 0,
      shaderCount: 0,
      source: "modex",
      overridesCount: entries.filter(e => e.entryName.startsWith("overrides/")).length,
      configFilesCount: 0,
      totalSize: fs.statSync(zipPath).size
    };

    return preview;
  }

  // ==================== HELPERS ====================

  private extractMinecraftVersion(gameVersions: string[]): string {
    for (const v of gameVersions) {
      if (/^\d+\.\d+(\.\d+)?$/.test(v)) {
        return v;
      }
    }
    return "";
  }

  private extractModLoader(gameVersions: string[]): string {
    const loaders = ["forge", "fabric", "neoforge", "quilt"];
    for (const v of gameVersions) {
      const lower = v.toLowerCase();
      if (loaders.includes(lower)) {
        return lower;
      }
    }
    return "forge";
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export default ModpackAnalyzerService;
