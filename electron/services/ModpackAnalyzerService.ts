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

// Known performance-impacting mods - Comprehensive database
// RAM impact values are based on typical memory usage patterns (in MB)
const KNOWN_HEAVY_MODS: Record<number, { name: string; ramImpact: number; category: string; warning?: string }> = {
  // ==================== TECHNOLOGY MODS ====================
  // Mekanism suite (extremely RAM intensive)
  245211: { name: "Mekanism", ramImpact: 180, category: "technology", warning: "Complex machinery with heavy rendering - allocate extra RAM" },
  268560: { name: "Mekanism", ramImpact: 180, category: "technology", warning: "Complex machinery with heavy rendering" },
  268566: { name: "Mekanism Generators", ramImpact: 45, category: "technology" },
  268567: { name: "Mekanism Tools", ramImpact: 20, category: "technology" },
  268565: { name: "Mekanism Additions", ramImpact: 35, category: "technology" },
  
  // Create suite
  328085: { name: "Create", ramImpact: 150, category: "technology", warning: "Contraption physics intensive with large builds" },
  459701: { name: "Create: Above and Beyond", ramImpact: 200, category: "technology", warning: "Extensive modpack content" },
  688768: { name: "Create: Steam 'n' Rails", ramImpact: 55, category: "technology" },
  623469: { name: "Create Crafts & Additions", ramImpact: 40, category: "technology" },
  689621: { name: "Create: Diesel Generators", ramImpact: 30, category: "technology" },
  667958: { name: "Create: Connected", ramImpact: 25, category: "technology" },
  
  // Applied Energistics 2
  223794: { name: "Applied Energistics 2", ramImpact: 130, category: "technology", warning: "Large storage networks significantly increase memory usage" },
  570458: { name: "AE2 Things", ramImpact: 25, category: "technology" },
  
  // Refined Storage
  243076: { name: "Refined Storage", ramImpact: 110, category: "technology", warning: "Storage networks consume memory proportional to items stored" },
  282962: { name: "Refined Storage Addons", ramImpact: 35, category: "technology" },
  
  // Thermal Series
  69163: { name: "Thermal Expansion", ramImpact: 95, category: "technology" },
  222880: { name: "Thermal Foundation", ramImpact: 55, category: "technology" },
  227443: { name: "Thermal Dynamics", ramImpact: 65, category: "technology" },
  291737: { name: "Thermal Locomotion", ramImpact: 45, category: "technology" },
  
  // Immersive Engineering
  231951: { name: "Immersive Engineering", ramImpact: 120, category: "technology", warning: "Multiblock structures increase memory usage" },
  429457: { name: "Immersive Petroleum", ramImpact: 50, category: "technology" },
  284827: { name: "Immersive Railroading", ramImpact: 90, category: "technology" },
  
  // Industrial Craft 2
  242638: { name: "Industrial Craft 2", ramImpact: 100, category: "technology" },
  
  // EnderIO
  64578: { name: "EnderIO", ramImpact: 110, category: "technology" },
  
  // Draconic Evolution
  223565: { name: "Draconic Evolution", ramImpact: 130, category: "technology", warning: "End-game content with high resource requirements" },
  
  // GregTech variants
  293327: { name: "GregTech CE Unofficial", ramImpact: 220, category: "technology", warning: "Extremely complex mod - requires significant RAM" },
  563928: { name: "GregTech: Modern", ramImpact: 240, category: "technology", warning: "Comprehensive overhaul - 8GB+ RAM recommended" },
  
  // PneumaticCraft
  281849: { name: "PneumaticCraft: Repressurized", ramImpact: 85, category: "technology" },
  
  // NuclearCraft
  226254: { name: "NuclearCraft", ramImpact: 100, category: "technology" },
  
  // ProjectE
  226410: { name: "ProjectE", ramImpact: 60, category: "technology" },
  
  // Flux Networks
  248020: { name: "Flux Networks", ramImpact: 40, category: "technology" },
  
  // ==================== MAGIC MODS ====================
  // Thaumcraft
  223628: { name: "Thaumcraft", ramImpact: 120, category: "magic" },
  237286: { name: "Thaumcraft", ramImpact: 100, category: "magic" },
  
  // Astral Sorcery
  241721: { name: "Astral Sorcery", ramImpact: 100, category: "magic", warning: "Starfield rendering can impact performance" },
  
  // Botania
  225643: { name: "Botania", ramImpact: 80, category: "magic" },
  
  // Blood Magic
  224791: { name: "Blood Magic", ramImpact: 90, category: "magic" },
  227083: { name: "Blood Magic", ramImpact: 90, category: "magic" },
  
  // Ars Nouveau
  401955: { name: "Ars Nouveau", ramImpact: 80, category: "magic" },
  
  // Electroblob's Wizardry
  265642: { name: "Electroblob's Wizardry", ramImpact: 70, category: "magic" },
  
  // Mana and Artifice
  351068: { name: "Mana and Artifice", ramImpact: 85, category: "magic" },
  
  // Occultism
  361026: { name: "Occultism", ramImpact: 75, category: "magic" },
  
  // Hexerei
  494980: { name: "Hexerei", ramImpact: 60, category: "magic" },
  
  // Apotheosis
  313970: { name: "Apotheosis", ramImpact: 55, category: "magic" },
  
  // Iron's Spells 'n Spellbooks
  855414: { name: "Iron's Spells 'n Spellbooks", ramImpact: 75, category: "magic" },
  
  // ==================== WORLD GENERATION ====================
  // Biomes O' Plenty
  220318: { name: "Biomes O' Plenty", ramImpact: 130, category: "worldgen", warning: "Extensive biome generation - affects world loading" },
  238222: { name: "Biomes O' Plenty", ramImpact: 80, category: "worldgen", warning: "Increases world generation time" },
  
  // Terralith
  513575: { name: "Terralith", ramImpact: 110, category: "worldgen", warning: "Large-scale terrain modifications" },
  352522: { name: "Terralith", ramImpact: 100, category: "worldgen" },
  
  // Oh The Biomes You'll Go
  291982: { name: "Oh The Biomes You'll Go", ramImpact: 120, category: "worldgen" },
  306737: { name: "Oh The Biomes You'll Go", ramImpact: 90, category: "worldgen" },
  
  // Regions Unexplored
  576761: { name: "Regions Unexplored", ramImpact: 100, category: "worldgen" },
  
  // William Wythers Expanded Ecosphere
  635350: { name: "William Wythers' Overhauled Overworld", ramImpact: 90, category: "worldgen" },
  
  // Better End
  406048: { name: "Better End", ramImpact: 100, category: "worldgen", warning: "Complete End dimension overhaul" },
  
  // Better Nether
  311377: { name: "Better Nether", ramImpact: 100, category: "worldgen", warning: "Complete Nether dimension overhaul" },
  
  // Amplified Nether
  552164: { name: "Amplified Nether", ramImpact: 70, category: "worldgen" },
  
  // ==================== DIMENSIONS ====================
  // The Twilight Forest
  227639: { name: "The Twilight Forest", ramImpact: 140, category: "dimension", warning: "Full dimension with complex structures and bosses" },
  235279: { name: "The Twilight Forest", ramImpact: 120, category: "dimension" },
  
  // The Aether
  255308: { name: "The Aether", ramImpact: 120, category: "dimension" },
  
  // Blue Skies
  312918: { name: "Blue Skies", ramImpact: 110, category: "dimension" },
  312353: { name: "Blue Skies", ramImpact: 100, category: "dimension" },
  
  // Atum 2
  59621: { name: "Atum 2", ramImpact: 85, category: "dimension" },
  
  // The Bumblezone
  378612: { name: "The Bumblezone", ramImpact: 70, category: "dimension" },
  
  // Mining Dimension
  268039: { name: "Advanced Mining Dimension", ramImpact: 50, category: "dimension" },
  
  // ==================== MOBS & ENTITIES ====================
  // Alex's Mobs
  426558: { name: "Alex's Mobs", ramImpact: 100, category: "mobs", warning: "Many animated entities can impact performance" },
  261725: { name: "Alex's Mobs", ramImpact: 80, category: "mobs" },
  
  // Ice and Fire
  264231: { name: "Ice and Fire: Dragons", ramImpact: 110, category: "mobs", warning: "Complex dragon entities with animations" },
  248787: { name: "Ice and Fire", ramImpact: 100, category: "mobs", warning: "Dragon entities can cause lag" },
  
  // Mowzie's Mobs
  250498: { name: "Mowzie's Mobs", ramImpact: 75, category: "mobs" },
  
  // L_Ender's Cataclysm
  561495: { name: "L_Ender's Cataclysm", ramImpact: 70, category: "mobs" },
  
  // Mutant Creatures
  68779: { name: "Mutant Creatures", ramImpact: 55, category: "mobs" },
  
  // Rats
  323235: { name: "Rats", ramImpact: 60, category: "mobs" },
  
  // Friends and Foes
  602059: { name: "Friends and Foes", ramImpact: 45, category: "mobs" },
  
  // Naturalist
  606536: { name: "Naturalist", ramImpact: 50, category: "mobs" },
  
  // Creeper Overhaul
  570982: { name: "Creeper Overhaul", ramImpact: 35, category: "mobs" },
  
  // ==================== STORAGE & INVENTORY ====================
  // Storage Drawers
  223852: { name: "Storage Drawers", ramImpact: 65, category: "storage", warning: "Many drawers increase render overhead" },
  
  // Iron Chests
  228756: { name: "Iron Chests", ramImpact: 40, category: "storage" },
  
  // Sophisticated Backpacks
  422301: { name: "Sophisticated Backpacks", ramImpact: 45, category: "storage" },
  
  // Sophisticated Storage
  619320: { name: "Sophisticated Storage", ramImpact: 60, category: "storage" },
  
  // Functional Storage
  556489: { name: "Functional Storage", ramImpact: 55, category: "storage" },
  
  // Tinkers' Construct
  74072: { name: "Tinkers' Construct", ramImpact: 100, category: "tools" },
  
  // ==================== BUILDING & DECORATION ====================
  // Chisel
  250755: { name: "Chisel", ramImpact: 65, category: "building", warning: "Many block variants increase memory usage" },
  
  // Chisels & Bits
  231095: { name: "Chisels & Bits", ramImpact: 110, category: "building", warning: "Custom blocks are memory-intensive" },
  
  // FramedBlocks
  460929: { name: "FramedBlocks", ramImpact: 70, category: "building" },
  
  // MrCrayfish's Furniture
  55438: { name: "MrCrayfish's Furniture Mod", ramImpact: 55, category: "building" },
  
  // Decorative Blocks
  569737: { name: "Decorative Blocks", ramImpact: 35, category: "building" },
  
  // ==================== ADVENTURE & DUNGEONS ====================
  // Dungeon Crawl
  430100: { name: "Dungeon Crawl", ramImpact: 60, category: "adventure" },
  
  // When Dungeons Arise
  442394: { name: "When Dungeons Arise", ramImpact: 80, category: "adventure", warning: "Large structures impact chunk loading" },
  
  // YUNG's Better Dungeons
  300282: { name: "YUNG's Better Dungeons", ramImpact: 50, category: "adventure" },
  
  // YUNG's Better Mineshafts
  300276: { name: "YUNG's Better Mineshafts", ramImpact: 45, category: "adventure" },
  
  // YUNG's Better Strongholds
  347582: { name: "YUNG's Better Strongholds", ramImpact: 45, category: "adventure" },
  
  // Valhelsia Structures
  396115: { name: "Valhelsia Structures", ramImpact: 55, category: "adventure" },
  
  // ==================== FARMING ====================
  // Farmer's Delight
  398521: { name: "Farmer's Delight", ramImpact: 50, category: "farming" },
  
  // Pam's HarvestCraft 2
  456298: { name: "Pam's HarvestCraft 2: Food Core", ramImpact: 75, category: "farming" },
  456291: { name: "Pam's HarvestCraft 2: Crops", ramImpact: 55, category: "farming" },
  
  // Mystical Agriculture
  246640: { name: "Mystical Agriculture", ramImpact: 65, category: "farming" },
  
  // Cooking for Blockheads
  231484: { name: "Cooking for Blockheads", ramImpact: 35, category: "farming" },
  
  // ==================== GRAPHICS/SHADERS RELATED ====================
  // Dynamic Surroundings
  238891: { name: "Dynamic Surroundings", ramImpact: 90, category: "graphics", warning: "Environmental effects increase GPU/CPU load" },
  
  // Optifine (when used without optimization benefit)
  322385: { name: "OptiFine", ramImpact: 60, category: "graphics", warning: "Can conflict with some mods" },
  
  // Sound Physics Remastered
  535489: { name: "Sound Physics Remastered", ramImpact: 45, category: "audio" },
  
  // Presence Footsteps
  627946: { name: "Presence Footsteps", ramImpact: 30, category: "audio" },
  
  // Ambient Sounds
  254284: { name: "Ambient Sounds", ramImpact: 40, category: "audio" },
  
  // ==================== UTILITIES WITH IMPACT ====================
  // JEI (Just Enough Items)
  59751: { name: "JEI", ramImpact: 70, category: "utility", warning: "Memory usage scales with mod count" },
  
  // Waystones
  245755: { name: "Waystones", ramImpact: 30, category: "utility" },
  
  // FTB Chunks
  314906: { name: "FTB Chunks", ramImpact: 50, category: "utility" },
  
  // FTB Quests
  289412: { name: "FTB Quests", ramImpact: 55, category: "utility" },
  
  // Journey Map
  32274: { name: "JourneyMap", ramImpact: 70, category: "utility", warning: "Mapping data increases memory usage over time" }
};

// Known optimization mods - Comprehensive list
const KNOWN_OPTIMIZATION_MODS: number[] = [
  // ==================== RENDERING OPTIMIZATION ====================
  // Sodium family (Fabric/Quilt)
  394468, // Sodium - Modern rendering engine
  459857, // Sodium Extra - Additional Sodium features
  627566, // Sodium/Embeddium Options - Config screen
  
  // Sodium ports (Forge/NeoForge)
  635602, // Embeddium - Main Sodium port for Forge
  594406, // Rubidium - Older Sodium port
  250398, // Embeddium (alternative ID)
  
  // Iris/Shaders
  455508, // Iris Shaders - Fabric shader support
  459496, // Oculus - Forge shader support (with Embeddium)
  
  // Entity/Block rendering
  306612, // EntityCulling - Skip rendering hidden entities
  462999, // EntityCulling (alternative ID)
  401648, // Cull Leaves - Don't render hidden leaves
  441934, // Cull Less Leaves - Less aggressive culling
  
  // ==================== GAME LOGIC OPTIMIZATION ====================
  // Lithium family
  360438, // Lithium - General game logic optimization (Fabric)
  412953, // Lithium (alternative ID)
  661958, // Canary - Lithium port for Forge
  
  // ==================== LIGHTING OPTIMIZATION ====================
  445079, // Starlight - Complete light engine rewrite
  459857, // Starlight (alternative ID)
  373963, // Phosphor - Older lighting optimization
  
  // ==================== MEMORY OPTIMIZATION ====================
  433518, // FerriteCore - Reduces memory usage
  551816, // FerriteCore (alternative ID)
  548225, // Memory Leak Fix - Fixes memory leaks
  
  // ==================== STARTUP OPTIMIZATION ====================
  394012, // LazyDFU - Lazy DataFixerUpper
  433518, // LazyDFU (may be included in FerriteCore)
  
  // ==================== ALL-IN-ONE ====================
  521772, // ModernFix - Comprehensive optimization mod
  627566, // ImmediatelyFast - Fast immediate rendering
  
  // ==================== NETWORK OPTIMIZATION ====================
  532631, // Krypton - Networking optimization (Fabric)
  
  // ==================== CHUNK LOADING ====================
  393442, // C2ME - Chunk multithreading (Fabric)
  
  // ==================== MINOR OPTIMIZATIONS ====================
  360438, // FastFurnace
  372717, // FastBench - Fast crafting
  421137, // Clumps - Clumps XP orbs
  594211, // Clumps (alternative ID)
  238222, // AI Improvements - Better mob AI
  
  // ==================== SERVER-SIDE ====================
  393939, // ServerCore - Server optimizations
  623860, // Chunky - Pre-generate chunks
  
  // ==================== FABRIC SPECIFIC ====================
  308892, // Indium - Rendering API for Sodium
  547689, // Sodium/Indium Dynamic Lights
  
  // ==================== FORGE SPECIFIC ====================
  547689, // Embeddium Dynamic Lights
  667958, // Embeddium++ (extra features)
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
   * Uses comprehensive analysis based on mod types, file sizes, and known impacts
   */
  analyzeModpack(
    mods: ModpackPreview["mods"],
    options: { minecraftVersion: string; modLoader: string }
  ): ModpackAnalysis {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const modCategories: Record<string, number> = {};
    const compatibilityNotes: string[] = [];
    
    // Base RAM requirements by Minecraft version
    const mcVersion = options.minecraftVersion || "1.20.1";
    const mcMajor = parseInt(mcVersion.split('.')[1]) || 20;
    // Newer versions need more RAM: 1.12 = 1536MB, 1.16 = 1792MB, 1.18+ = 2048MB, 1.20+ = 2560MB
    let baseRam = mcMajor >= 20 ? 2560 : mcMajor >= 18 ? 2048 : mcMajor >= 16 ? 1792 : 1536;
    
    let modRam = 0;
    let heavyModCount = 0;
    let veryHeavyModCount = 0;
    let optimizationModCount = 0;
    let compatibilityIssues = 0;
    let totalFileSize = 0;
    
    // Track mod categories for categorized analysis
    const categoryTotals: Record<string, { count: number; ram: number }> = {};
    const detectedHeavyMods: string[] = [];
    const detectedOptimizationMods: string[] = [];
    
    // Analyze each mod
    for (const mod of mods) {
      // Check for known heavy mods
      const knownHeavy = KNOWN_HEAVY_MODS[mod.projectId];
      if (knownHeavy) {
        modRam += knownHeavy.ramImpact;
        
        // Track category
        const cat = knownHeavy.category;
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { count: 0, ram: 0 };
        }
        categoryTotals[cat].count++;
        categoryTotals[cat].ram += knownHeavy.ramImpact;
        modCategories[cat] = (modCategories[cat] || 0) + 1;
        
        // Count heavy mods
        if (knownHeavy.ramImpact >= 150) {
          veryHeavyModCount++;
          detectedHeavyMods.push(knownHeavy.name);
        } else if (knownHeavy.ramImpact >= 80) {
          heavyModCount++;
        }
        
        // Collect warnings (limit to avoid spam)
        if (knownHeavy.warning && warnings.length < 8) {
          warnings.push(`${knownHeavy.name}: ${knownHeavy.warning}`);
        }
      } else {
        // Estimate RAM based on file size if available
        const fileSize = (mod as any).fileSize || 0;
        totalFileSize += fileSize;
        
        if (fileSize > 10 * 1024 * 1024) { // > 10MB = likely heavy mod
          modRam += 80;
          heavyModCount++;
        } else if (fileSize > 5 * 1024 * 1024) { // > 5MB = medium mod
          modRam += 50;
        } else if (fileSize > 1 * 1024 * 1024) { // > 1MB = light-medium mod
          modRam += 35;
        } else {
          // Default RAM per mod (small mods, libraries, APIs)
          modRam += this.config.baseRamPerMod;
        }
        
        // Track as unknown category
        modCategories['unknown'] = (modCategories['unknown'] || 0) + 1;
      }

      // Check for optimization mods
      if (KNOWN_OPTIMIZATION_MODS.includes(mod.projectId)) {
        optimizationModCount++;
        detectedOptimizationMods.push(mod.name || 'Optimization mod');
      }
    }

    const modCount = mods.length;
    
    // ==================== RAM ESTIMATION ====================
    // Apply multipliers based on mod count (more mods = more overhead)
    const modCountMultiplier = modCount > 200 ? 1.3 
      : modCount > 150 ? 1.2 
      : modCount > 100 ? 1.1 
      : modCount > 50 ? 1.05 
      : 1.0;
    
    // Optimization mods reduce RAM usage
    const optimizationDiscount = Math.min(0.15, optimizationModCount * 0.03); // Up to 15% discount
    
    // Calculate total RAM with adjustments
    let totalModRam = modRam * modCountMultiplier * (1 - optimizationDiscount);
    
    // Add overhead for mod interactions (more mods = more cross-mod overhead)
    const interactionOverhead = modCount > 50 ? Math.sqrt(modCount) * 10 : 0;
    totalModRam += interactionOverhead;
    
    // Round to nearest 512MB for cleaner numbers
    const estimatedRamMin = Math.ceil((baseRam + totalModRam * 0.75) / 512) * 512;
    const estimatedRamRecommended = Math.ceil((baseRam + totalModRam * 1.0) / 512) * 512;
    const estimatedRamMax = Math.ceil((baseRam + totalModRam * 1.35) / 512) * 512;

    // ==================== PERFORMANCE IMPACT SCORING ====================
    // Base impact from mod count (logarithmic scale for large modpacks)
    let baseModImpact = modCount <= 50 
      ? modCount * 0.6 
      : 30 + Math.log2(modCount - 49) * 15;
    
    // Heavy mod impact
    const heavyModImpact = heavyModCount * 2.5 + veryHeavyModCount * 5;
    
    // Optimization benefit (stronger effect)
    const optimizationBenefit = optimizationModCount * 4;
    
    // Category-specific impacts
    let categoryImpact = 0;
    if (categoryTotals['technology']) categoryImpact += categoryTotals['technology'].count * 1.5;
    if (categoryTotals['worldgen']) categoryImpact += categoryTotals['worldgen'].count * 2;
    if (categoryTotals['mobs']) categoryImpact += categoryTotals['mobs'].count * 1.5;
    if (categoryTotals['dimension']) categoryImpact += categoryTotals['dimension'].count * 3;
    
    const performanceImpact = Math.max(0, Math.min(100, Math.round(
      baseModImpact + heavyModImpact + categoryImpact - optimizationBenefit
    )));
    
    // Load time impact (based on mod count and complexity)
    const loadTimeBase = modCount <= 50 ? modCount * 0.8 : 40 + (modCount - 50) * 0.5;
    const loadTimeImpact = Math.max(0, Math.min(100, Math.round(
      loadTimeBase + veryHeavyModCount * 3 + heavyModCount * 1.5
    )));
    
    // Storage impact (based on file sizes and mod count)
    const avgFileSize = totalFileSize > 0 ? totalFileSize / modCount : 2 * 1024 * 1024; // Default 2MB
    const storageFactor = avgFileSize / (2 * 1024 * 1024); // Relative to 2MB average
    const storageImpact = Math.max(0, Math.min(100, Math.round(
      modCount * 0.25 * storageFactor + veryHeavyModCount * 2
    )));

    // ==================== SMART RECOMMENDATIONS ====================
    // Modpack size warnings
    if (modCount > 300) {
      warnings.push(`Extremely large modpack (${modCount} mods) - loading may take 10+ minutes`);
    } else if (modCount > 200) {
      warnings.push(`Very large modpack (${modCount} mods) - expect 5-10 minute load times`);
    } else if (modCount > 100) {
      warnings.push(`Large modpack (${modCount} mods) - expect 2-5 minute load times`);
    }

    // RAM warnings
    if (estimatedRamRecommended > 12288) {
      warnings.push(`Very high RAM requirement: ${Math.round(estimatedRamRecommended / 1024)}GB recommended - ensure your system can support this`);
    } else if (estimatedRamRecommended > 8192) {
      warnings.push(`High RAM requirement: ${Math.round(estimatedRamRecommended / 1024)}GB recommended`);
    }

    // Heavy mod category warnings
    if (veryHeavyModCount > 3) {
      warnings.push(`${veryHeavyModCount} very resource-intensive mods detected: ${detectedHeavyMods.slice(0, 3).join(', ')}${veryHeavyModCount > 3 ? '...' : ''}`);
    }

    // Optimization recommendations
    if (optimizationModCount === 0 && modCount > 30) {
      const loaderOptMods = options.modLoader === 'fabric' || options.modLoader === 'quilt'
        ? 'Sodium, Lithium, and FerriteCore'
        : 'Embeddium, Canary, and FerriteCore';
      recommendations.push(`No optimization mods detected - strongly recommend adding ${loaderOptMods}`);
    } else if (optimizationModCount === 1 && modCount > 100) {
      recommendations.push('Consider adding more optimization mods for a modpack of this size');
    } else if (optimizationModCount > 0) {
      compatibilityNotes.push(`${optimizationModCount} optimization mod(s) detected - good for performance`);
    }

    // RAM allocation recommendation
    if (heavyModCount + veryHeavyModCount > 5) {
      recommendations.push(`Multiple resource-intensive mods detected - allocate at least ${Math.round(estimatedRamRecommended / 1024)}GB RAM`);
    }

    // Version-specific advice
    if (mcMajor >= 18) {
      recommendations.push('Java 17+ is required for Minecraft 1.18+, Java 21 recommended for 1.20.5+');
    }

    // Category-specific recommendations
    if (categoryTotals['worldgen'] && categoryTotals['worldgen'].count > 2) {
      recommendations.push('Multiple world generation mods detected - expect longer new world creation');
    }
    
    if (categoryTotals['technology'] && categoryTotals['technology'].count > 5) {
      recommendations.push('Many tech mods installed - complex automation may impact TPS');
    }
    
    if (categoryTotals['mobs'] && categoryTotals['mobs'].count > 3) {
      recommendations.push('Multiple mob mods detected - consider reducing spawn rates in configs');
    }

    if (categoryTotals['dimension'] && categoryTotals['dimension'].count > 1) {
      recommendations.push('Multiple dimension mods detected - each dimension increases memory usage when visited');
    }

    // ==================== COMPATIBILITY SCORING ====================
    // Start at 100, deduct for potential issues
    let compatScore = 100;
    
    // Version mismatches could cause issues
    if (!options.minecraftVersion) {
      compatScore -= 5;
      compatibilityNotes.push('Unknown Minecraft version - compatibility cannot be fully verified');
    }
    
    // Many heavy mods increase conflict probability
    if (veryHeavyModCount > 5) {
      compatScore -= veryHeavyModCount * 2;
    }
    
    // Large modpacks have higher conflict probability
    if (modCount > 200) {
      compatScore -= 10;
    } else if (modCount > 100) {
      compatScore -= 5;
    }
    
    // Deduct for detected compatibility issues
    compatScore -= compatibilityIssues * 10;
    
    const compatibilityScore = Math.max(0, Math.min(100, compatScore));

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
      compatibilityNotes
    };
  }

  /**
   * Analyze existing modpack by ID - Enhanced with file size data
   */
  async analyzeExistingModpack(
    modpackMods: Array<{ cf_project_id?: number; name: string; file_size?: number }>,
    options: { minecraftVersion: string; modLoader: string }
  ): Promise<ModpackAnalysis> {
    const mods: (ModpackPreview["mods"][0] & { fileSize?: number })[] = modpackMods.map(m => ({
      projectId: m.cf_project_id || 0,
      fileId: 0,
      name: m.name,
      required: true,
      fileSize: m.file_size || 0
    }));

    return this.analyzeModpack(mods as ModpackPreview["mods"], options);
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
