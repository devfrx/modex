import AdmZip from "adm-zip";
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";

export interface ModMetadata {
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string;
  hash: string;
}

export class JarScanner {
  /**
   * Calculate SHA256 hash of a file
   */
  private static calculateHash(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Parse filename to extract mod name, version, loader, and game version
   * Examples:
   * - CrashAssistant-neoforge-1.21.9-1.21.10-1.10.24.jar
   * - sodium-fabric-0.6.0+mc1.21.4.jar
   * - jei-1.20.1-forge-15.2.0.27.jar
   * - create-1.20.1-0.5.1.f.jar
   */
  private static parseFilename(filename: string): { 
    name: string; 
    version: string; 
    loader: string; 
    game_version: string 
  } {
    const baseName = filename.replace('.jar', '');
    const loaders = ['neoforge', 'forge', 'fabric', 'quilt'];
    
    let loader = 'unknown';
    let game_version = 'unknown';
    let version = '1.0.0';
    let name = baseName;
    
    // Find loader in filename
    for (const l of loaders) {
      if (baseName.toLowerCase().includes(`-${l}-`) || 
          baseName.toLowerCase().includes(`-${l}+`) ||
          baseName.toLowerCase().includes(`+${l}`)) {
        loader = l;
        break;
      }
    }
    
    // Find MC version pattern (1.XX or 1.XX.X)
    const mcVersionPatterns = [
      /[+-]?(1\.2[0-4](?:\.\d+)?)/g,  // 1.20, 1.20.1, 1.21, 1.21.4, etc.
      /[+-]?(1\.1[6-9](?:\.\d+)?)/g,  // 1.16, 1.17, 1.18, 1.19
    ];
    
    for (const pattern of mcVersionPatterns) {
      const matches = [...baseName.matchAll(pattern)];
      if (matches.length > 0) {
        // Take the first MC version found
        game_version = matches[0][1];
        break;
      }
    }
    
    // Find mod version - usually comes after MC version or at end
    // Pattern: semver like X.Y.Z or X.Y.Z.W
    const versionPattern = /(\d+\.\d+\.\d+(?:\.\d+)?)/g;
    const allVersions = [...baseName.matchAll(versionPattern)];
    
    if (allVersions.length > 0) {
      // Filter out MC versions to find mod version
      const modVersions = allVersions.filter(m => {
        const v = m[1];
        return !v.startsWith('1.20') && !v.startsWith('1.21') && 
               !v.startsWith('1.19') && !v.startsWith('1.18') && 
               !v.startsWith('1.17') && !v.startsWith('1.16');
      });
      
      if (modVersions.length > 0) {
        version = modVersions[modVersions.length - 1][1]; // Take last one (usually mod version)
      } else if (allVersions.length > 1) {
        // If all versions look like MC versions, take the last one as mod version
        version = allVersions[allVersions.length - 1][1];
      }
    }
    
    // Extract clean name - remove loader, versions, and common separators
    let cleanName = baseName;
    // Remove loader
    for (const l of loaders) {
      cleanName = cleanName.replace(new RegExp(`[-+]${l}[-+]?`, 'gi'), '-');
    }
    // Remove version-like strings
    cleanName = cleanName.replace(/[-+]?\d+\.\d+(?:\.\d+)*(?:\+[a-z0-9]+)?/gi, '');
    // Clean up
    cleanName = cleanName.replace(/[-+]+/g, ' ').trim();
    cleanName = cleanName.replace(/\s+/g, ' ');
    
    if (cleanName) {
      name = cleanName;
    }
    
    return { name, version, loader, game_version };
  }

  /**
   * Extract metadata from a Fabric mod (fabric.mod.json)
   */
  private static extractFabricMetadata(
    zip: AdmZip,
    filePath: string
  ): Partial<ModMetadata> | null {
    try {
      const entry = zip.getEntry("fabric.mod.json");
      if (!entry) return null;

      const content = zip.readAsText(entry);
      const data = JSON.parse(content);

      return {
        name: data.name || data.id,
        version: data.version || "1.0.0",
        description: data.description,
        author: Array.isArray(data.authors)
          ? data.authors[0]?.name || data.authors[0]
          : data.authors,
        loader: "fabric",
        game_version: data.depends?.minecraft || "unknown",
      };
    } catch (error) {
      console.error("Failed to parse fabric.mod.json:", error);
      return null;
    }
  }

  /**
   * Extract metadata from a Forge mod (mcmod.info or mods.toml)
   */
  private static extractForgeMetadata(
    zip: AdmZip,
    filePath: string
  ): Partial<ModMetadata> | null {
    try {
      // Try mcmod.info (older Forge)
      let entry = zip.getEntry("mcmod.info");
      if (entry) {
        const content = zip.readAsText(entry);
        const data = JSON.parse(content);
        const modInfo = Array.isArray(data)
          ? data[0]
          : data.modList?.[0] || data;

        return {
          name: modInfo.name || modInfo.modid,
          version: modInfo.version || "1.0.0",
          description: modInfo.description,
          author: Array.isArray(modInfo.authorList)
            ? modInfo.authorList[0]
            : modInfo.authorList,
          loader: "forge",
          game_version: modInfo.mcversion || "unknown",
        };
      }

      // Try mods.toml (newer Forge/NeoForge)
      entry = zip.getEntry("META-INF/mods.toml");
      if (entry) {
        const content = zip.readAsText(entry);
        // Basic TOML parsing (naive approach)
        const nameMatch = content.match(/modId\s*=\s*["']([^"']+)["']/);
        const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
        const descMatch = content.match(/description\s*=\s*["']([^"']+)["']/);
        const authorsMatch = content.match(/authors\s*=\s*["']([^"']+)["']/);

        return {
          name: nameMatch?.[1] || "Unknown",
          version: versionMatch?.[1] || "1.0.0",
          description: descMatch?.[1],
          author: authorsMatch?.[1],
          loader: content.includes("neoforge") ? "neoforge" : "forge",
          game_version: "unknown",
        };
      }

      return null;
    } catch (error) {
      console.error("Failed to parse Forge metadata:", error);
      return null;
    }
  }

  /**
   * Extract metadata from Quilt mod (quilt.mod.json)
   */
  private static extractQuiltMetadata(
    zip: AdmZip,
    filePath: string
  ): Partial<ModMetadata> | null {
    try {
      const entry = zip.getEntry("quilt.mod.json");
      if (!entry) return null;

      const content = zip.readAsText(entry);
      const data = JSON.parse(content);
      const quiltLoader = data.quilt_loader;

      return {
        name: quiltLoader?.metadata?.name || quiltLoader?.id,
        version: quiltLoader?.version || "1.0.0",
        description: quiltLoader?.metadata?.description,
        author: quiltLoader?.metadata?.contributors?.[0]?.name,
        loader: "quilt",
        game_version:
          quiltLoader?.depends?.find((d: any) => d.id === "minecraft")
            ?.versions || "unknown",
      };
    } catch (error) {
      console.error("Failed to parse quilt.mod.json:", error);
      return null;
    }
  }

  /**
   * Scan a single JAR file and extract metadata
   */
  static async scanJarFile(filePath: string): Promise<ModMetadata | null> {
    if (!filePath.endsWith(".jar")) {
      console.warn(`Skipping non-JAR file: ${filePath}`);
      return null;
    }

    try {
      const zip = new AdmZip(filePath);
      const filename = path.basename(filePath);
      const hash = this.calculateHash(filePath);

      // Try different mod formats
      let metadata =
        this.extractFabricMetadata(zip, filePath) ||
        this.extractQuiltMetadata(zip, filePath) ||
        this.extractForgeMetadata(zip, filePath);

      if (!metadata) {
        // Fallback: parse filename intelligently
        console.warn(
          `Could not extract metadata from ${filename}, using filename`
        );
        
        const parsed = this.parseFilename(filename);
        metadata = {
          name: parsed.name,
          version: parsed.version,
          loader: parsed.loader,
          game_version: parsed.game_version,
        };
      }

      return {
        filename,
        name: metadata.name || "Unknown",
        version: metadata.version || "1.0.0",
        game_version: metadata.game_version || "unknown",
        loader: metadata.loader || "unknown",
        description: metadata.description,
        author: metadata.author,
        path: filePath,
        hash,
      };
    } catch (error) {
      console.error(`Failed to scan JAR file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Scan a directory recursively for JAR files
   */
  static async scanDirectory(dirPath: string): Promise<ModMetadata[]> {
    const mods: ModMetadata[] = [];

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        const subMods = await this.scanDirectory(fullPath);
        mods.push(...subMods);
      } else if (file.endsWith(".jar")) {
        const metadata = await this.scanJarFile(fullPath);
        if (metadata) {
          mods.push(metadata);
        }
      }
    }

    return mods;
  }
  /**
   * Extract a ZIP file to a destination directory
   */
  static async extractZip(zipPath: string, destDir: string): Promise<void> {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(destDir, true);
    } catch (error) {
      console.error(`Failed to extract ZIP ${zipPath}:`, error);
      throw error;
    }
  }
}
