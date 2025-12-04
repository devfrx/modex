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
        // Fallback: parse filename
        console.warn(
          `Could not extract metadata from ${filename}, using filename`
        );
        metadata = {
          name: filename.replace(".jar", ""),
          version: "1.0.0",
          loader: "unknown",
          game_version: "unknown",
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
