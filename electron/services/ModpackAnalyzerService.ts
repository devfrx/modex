/**
 * ModpackAnalyzerService - Modpack Analysis and Performance Estimation
 * 
 * Features:
 * - RAM estimation based on mod count and types
 * - Performance impact analysis
 * - Modpack size calculation
 * - Compatibility checks
 * - Pre-import preview
 */

import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";

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
  
  // Analysis
  analysis: ModpackAnalysis;
  
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

export interface ModpackAnalysis {
  // Performance estimates
  estimatedRamMin: number;        // Minimum RAM in MB
  estimatedRamRecommended: number; // Recommended RAM in MB
  estimatedRamMax: number;        // Maximum RAM for best performance
  
  // Impact ratings (0-100)
  performanceImpact: number;
  loadTimeImpact: number;
  storageImpact: number;
  
  // Categories
  modCategories: Record<string, number>;
  
  // Warnings
  warnings: string[];
  
  // Recommendations
  recommendations: string[];
  
  // Compatibility
  compatibilityScore: number; // 0-100
  compatibilityNotes: string[];
}

export interface AnalysisConfig {
  // Base RAM per mod type (in MB)
  baseRamPerMod: number;
  heavyModMultiplier: number;
  lightModMultiplier: number;
  
  // Categories that indicate heavy mods
  heavyCategories: string[];
  
  // Categories that indicate light mods
  lightCategories: string[];
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: AnalysisConfig = {
  baseRamPerMod: 30, // 30MB per mod on average
  heavyModMultiplier: 2.5,
  lightModMultiplier: 0.5,
  
  heavyCategories: [
    "Technology",
    "Magic",
    "World Gen",
    "Dimensions",
    "Mobs",
    "Biomes",
    "Storage",
    "Automation"
  ],
  
  lightCategories: [
    "Cosmetic",
    "Utility",
    "Library",
    "API",
    "Performance",
    "Bug Fix",
    "Tweak",
    "HUD"
  ]
};

// Known performance-impacting mods
const KNOWN_HEAVY_MODS: Record<number, { name: string; ramImpact: number; warning?: string }> = {
  // Tech mods
  245211: { name: "Mekanism", ramImpact: 150, warning: "Complex machines may cause TPS issues" },
  268560: { name: "Create", ramImpact: 120, warning: "Contraptions can impact performance" },
  223794: { name: "Applied Energistics 2", ramImpact: 100 },
  459701: { name: "Create: Above and Beyond", ramImpact: 200 },
  
  // Magic mods
  237286: { name: "Thaumcraft", ramImpact: 100 },
  225643: { name: "Botania", ramImpact: 80 },
  227083: { name: "Blood Magic", ramImpact: 90 },
  
  // World gen
  238222: { name: "Biomes O' Plenty", ramImpact: 80, warning: "Increases world generation time" },
  306737: { name: "Oh The Biomes You'll Go", ramImpact: 90 },
  352522: { name: "Terralith", ramImpact: 100 },
  
  // Dimensions
  235279: { name: "The Twilight Forest", ramImpact: 120 },
  312353: { name: "Blue Skies", ramImpact: 100 },
  
  // Mobs
  248787: { name: "Ice and Fire", ramImpact: 100, warning: "Dragon entities can cause lag" },
  261725: { name: "Alex's Mobs", ramImpact: 80 },
  
  // Heavy content
  238086: { name: "Industrial Craft 2", ramImpact: 120 },
  231951: { name: "Thermal Foundation", ramImpact: 70 },
  223852: { name: "Tinkers' Construct", ramImpact: 100 }
};

// Known optimization mods
const KNOWN_OPTIMIZATION_MODS: number[] = [
  // Sodium family
  394468, // Sodium
  459857, // Sodium Extra
  627566, // Sodium/Embeddium Options
  
  // Performance
  412953, // Lithium
  433518, // LazyDFU
  551816, // FerriteCore
  445079, // Starlight
  360438, // FastFurnace
  372717, // FastBench
  421137, // Clumps
  401648, // Cull Leaves
  
  // Memory
  373963, // Phosphor (replaced by Starlight)
  462999, // EntityCulling
  
  // Fabric
  306612, // Lithium (Fabric)
  
  // Forge
  635602, // Embeddium (Sodium port)
  594406  // Rubidium
];

// ==================== SERVICE ====================

export class ModpackAnalyzerService {
  private config: AnalysisConfig;

  constructor(config?: Partial<AnalysisConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

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
      console.error("Error previewing modpack:", error);
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
        analysis: this.analyzeModpack(mods, { minecraftVersion, modLoader }),
        source: "curseforge",
        cfProjectId: modpackData.id,
        cfFileId: fileData.id,
        overridesCount: 0,
        configFilesCount: 0,
        totalSize: fileData.fileLength
      };

      return preview;
    } catch (error) {
      console.error("Error previewing CurseForge modpack:", error);
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
      analysis: this.analyzeModpack(mods, { minecraftVersion, modLoader }),
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
      analysis: this.analyzeModpack(mods, { 
        minecraftVersion: index.dependencies?.minecraft || "",
        modLoader: Object.keys(index.dependencies || {}).find(k => k !== "minecraft") || "unknown"
      }),
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
      analysis: this.analyzeModpack(mods, {
        minecraftVersion: manifest.modpack?.minecraft_version || "",
        modLoader: manifest.modpack?.loader || "forge"
      }),
      source: "modex",
      overridesCount: entries.filter(e => e.entryName.startsWith("overrides/")).length,
      configFilesCount: 0,
      totalSize: fs.statSync(zipPath).size
    };

    return preview;
  }

  // ==================== ANALYSIS ====================

  /**
   * Analyze a modpack and estimate performance impact
   */
  analyzeModpack(
    mods: ModpackPreview["mods"],
    options: { minecraftVersion: string; modLoader: string }
  ): ModpackAnalysis {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const modCategories: Record<string, number> = {};
    
    let baseRam = 2048; // Base Minecraft RAM
    let modRam = 0;
    let heavyModCount = 0;
    let optimizationModCount = 0;
    let compatibilityIssues = 0;

    // Analyze each mod
    for (const mod of mods) {
      // Check for known heavy mods
      const knownHeavy = KNOWN_HEAVY_MODS[mod.projectId];
      if (knownHeavy) {
        modRam += knownHeavy.ramImpact;
        heavyModCount++;
        if (knownHeavy.warning) {
          warnings.push(`${knownHeavy.name}: ${knownHeavy.warning}`);
        }
      } else {
        // Default RAM per mod
        modRam += this.config.baseRamPerMod;
      }

      // Check for optimization mods
      if (KNOWN_OPTIMIZATION_MODS.includes(mod.projectId)) {
        optimizationModCount++;
      }
    }

    // Calculate RAM estimates
    const totalModRam = modRam;
    const estimatedRamMin = Math.ceil((baseRam + totalModRam * 0.7) / 512) * 512;
    const estimatedRamRecommended = Math.ceil((baseRam + totalModRam) / 512) * 512;
    const estimatedRamMax = Math.ceil((baseRam + totalModRam * 1.5) / 512) * 512;

    // Calculate impact scores
    const modCount = mods.length;
    const performanceImpact = Math.min(100, Math.round(
      (modCount * 0.5) + (heavyModCount * 3) - (optimizationModCount * 5)
    ));
    const loadTimeImpact = Math.min(100, Math.round(modCount * 0.8));
    const storageImpact = Math.min(100, Math.round(modCount * 0.3));

    // Generate recommendations
    if (modCount > 100) {
      warnings.push(`Large modpack with ${modCount} mods - expect longer load times`);
    }

    if (estimatedRamRecommended > 8192) {
      warnings.push(`High RAM requirement: ${estimatedRamRecommended}MB recommended`);
    }

    if (optimizationModCount === 0 && modCount > 50) {
      recommendations.push("Consider adding optimization mods like Sodium/Embeddium, Lithium, or FerriteCore");
    }

    if (heavyModCount > 5) {
      recommendations.push("Multiple heavy mods detected - ensure adequate RAM allocation");
    }

    // Compatibility score (simplified)
    const compatibilityScore = Math.max(0, 100 - compatibilityIssues * 10);

    return {
      estimatedRamMin,
      estimatedRamRecommended,
      estimatedRamMax,
      performanceImpact,
      loadTimeImpact,
      storageImpact,
      modCategories,
      warnings,
      recommendations,
      compatibilityScore,
      compatibilityNotes: []
    };
  }

  /**
   * Analyze existing modpack by ID
   */
  async analyzeExistingModpack(
    modpackMods: Array<{ cf_project_id?: number; name: string; file_size?: number }>,
    options: { minecraftVersion: string; modLoader: string }
  ): Promise<ModpackAnalysis> {
    const mods: ModpackPreview["mods"] = modpackMods.map(m => ({
      projectId: m.cf_project_id || 0,
      fileId: 0,
      name: m.name,
      required: true
    }));

    return this.analyzeModpack(mods, options);
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

  formatRam(mb: number): string {
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }
}

export default ModpackAnalyzerService;
