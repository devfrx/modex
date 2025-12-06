/**
 * Mod Analyzer Service
 * 
 * Provides functionality for:
 * - Dependency resolution (finding missing required mods)
 * - Conflict detection (incompatible mods)
 * - Performance optimization suggestions
 */

import { CurseForgeService, CFMod, CFFile, CFDependency } from './CurseForgeService';

// ==================== TYPES ====================

export interface DependencyInfo {
  modId: number;
  modName: string;
  modSlug: string;
  thumbnailUrl?: string;
  relationType: 'required' | 'optional' | 'embedded' | 'tool' | 'include';
  status: 'missing' | 'present' | 'outdated';
  requiredBy: string[]; // Names of mods that require this dependency
  suggestedFile?: {
    fileId: number;
    fileName: string;
    gameVersion: string;
    downloadUrl: string | null;
  };
}

export interface ConflictInfo {
  mod1: {
    id: string;
    name: string;
    curseforge_id?: number;
  };
  mod2: {
    id: string;
    name: string;
    curseforge_id?: number;
  };
  type: 'incompatible' | 'duplicate' | 'version_mismatch' | 'loader_mismatch';
  severity: 'error' | 'warning' | 'info';
  description: string;
  suggestion?: string;
}

export interface PerformanceSuggestion {
  type: 'add_mod' | 'remove_mod' | 'replace_mod' | 'config_change' | 'tip';
  severity: 'critical' | 'recommended' | 'optional';
  title: string;
  description: string;
  modId?: number;
  modName?: string;
  modSlug?: string;
  thumbnailUrl?: string;
  action?: {
    type: 'install' | 'remove' | 'replace';
    targetModId?: number;
  };
}

export interface AnalysisResult {
  dependencies: {
    missing: DependencyInfo[];
    optional: DependencyInfo[];
    satisfied: number;
  };
  conflicts: ConflictInfo[];
  performance: PerformanceSuggestion[];
  analyzedAt: string;
  modCount: number;
}

// Known performance mods by loader
const PERFORMANCE_MODS: Record<string, { id: number; name: string; slug: string; description: string }[]> = {
  fabric: [
    { id: 394468, name: 'Sodium', slug: 'sodium', description: 'Modern rendering engine with massive FPS improvements' },
    { id: 360438, name: 'Lithium', slug: 'lithium', description: 'General-purpose optimization mod for game logic' },
    { id: 372124, name: 'Phosphor', slug: 'phosphor', description: 'Lighting engine optimizations (use Starlight for newer versions)' },
    { id: 459857, name: 'Starlight', slug: 'starlight', description: 'Complete rewrite of the light engine for better performance' },
    { id: 394012, name: 'LazyDFU', slug: 'lazydfu', description: 'Makes DataFixerUpper initialization lazy for faster startup' },
    { id: 433518, name: 'FerriteCore', slug: 'ferritecore', description: 'Reduces memory usage significantly' },
    { id: 521772, name: 'ModernFix', slug: 'modernfix', description: 'All-in-one performance mod with many optimizations' },
    { id: 627566, name: 'ImmediatelyFast', slug: 'immediatelyfast', description: 'Improves immediate mode rendering performance' },
    { id: 306612, name: 'EntityCulling', slug: 'entityculling', description: 'Skips rendering entities that are not visible' },
    { id: 532631, name: 'Krypton', slug: 'krypton', description: 'Optimizes Minecraft networking stack' },
    { id: 548225, name: 'Memory Leak Fix', slug: 'memoryleakfix', description: 'Fixes memory leaks in Minecraft' },
  ],
  forge: [
    { id: 250398, name: 'Embeddium', slug: 'embeddium', description: 'Unofficial Sodium port for Forge with great FPS gains' },
    { id: 433518, name: 'FerriteCore', slug: 'ferritecore', description: 'Reduces memory usage significantly' },
    { id: 521772, name: 'ModernFix', slug: 'modernfix', description: 'All-in-one performance mod with many optimizations' },
    { id: 459857, name: 'Starlight', slug: 'starlight', description: 'Complete rewrite of the light engine for better performance' },
    { id: 306612, name: 'EntityCulling', slug: 'entityculling', description: 'Skips rendering entities that are not visible' },
    { id: 661958, name: 'Canary', slug: 'canary', description: 'General optimization mod (Lithium port for Forge)' },
    { id: 594211, name: 'Clumps', slug: 'clumps', description: 'Clumps XP orbs together to reduce lag' },
    { id: 238222, name: 'AI Improvements', slug: 'ai-improvements', description: 'Optimizes mob AI performance' },
  ],
  neoforge: [
    { id: 250398, name: 'Embeddium', slug: 'embeddium', description: 'Unofficial Sodium port with great FPS gains' },
    { id: 433518, name: 'FerriteCore', slug: 'ferritecore', description: 'Reduces memory usage significantly' },
    { id: 521772, name: 'ModernFix', slug: 'modernfix', description: 'All-in-one performance mod with many optimizations' },
    { id: 306612, name: 'EntityCulling', slug: 'entityculling', description: 'Skips rendering entities that are not visible' },
  ],
  quilt: [
    { id: 394468, name: 'Sodium', slug: 'sodium', description: 'Modern rendering engine with massive FPS improvements' },
    { id: 360438, name: 'Lithium', slug: 'lithium', description: 'General-purpose optimization mod for game logic' },
    { id: 433518, name: 'FerriteCore', slug: 'ferritecore', description: 'Reduces memory usage significantly' },
    { id: 521772, name: 'ModernFix', slug: 'modernfix', description: 'All-in-one performance mod with many optimizations' },
  ],
};

// Known conflicting mod pairs
const KNOWN_CONFLICTS: Array<{
  mod1Ids: number[];
  mod2Ids: number[];
  description: string;
  suggestion: string;
}> = [
  {
    mod1Ids: [394468], // Sodium
    mod2Ids: [32274], // OptiFine
    description: 'Sodium and OptiFine are incompatible rendering mods',
    suggestion: 'Remove OptiFine and use Sodium with Iris for shaders support',
  },
  {
    mod1Ids: [372124], // Phosphor
    mod2Ids: [459857], // Starlight
    description: 'Phosphor and Starlight both modify the lighting engine',
    suggestion: 'Use Starlight instead of Phosphor for better performance on newer versions',
  },
  {
    mod1Ids: [360438], // Lithium
    mod2Ids: [661958], // Canary
    description: 'Canary is a Lithium port, they conflict with each other',
    suggestion: 'Use only one: Lithium for Fabric or Canary for Forge',
  },
  {
    mod1Ids: [394468, 250398], // Sodium, Embeddium
    mod2Ids: [250398, 394468], // Embeddium, Sodium
    description: 'Sodium and Embeddium are the same mod for different loaders',
    suggestion: 'Use only one based on your mod loader',
  },
];

// Mods that can cause performance issues
const PERFORMANCE_IMPACT_MODS: Array<{
  modIds: number[];
  name: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}> = [
  {
    modIds: [32274],
    name: 'OptiFine',
    impact: 'medium',
    description: 'OptiFine can cause compatibility issues with many mods',
    suggestion: 'Consider using Sodium + Iris for better mod compatibility and similar performance',
  },
  {
    modIds: [223794],
    name: 'Dynamic Surroundings',
    impact: 'medium',
    description: 'Adds many visual and audio effects that can impact performance',
    suggestion: 'Disable some features in config if experiencing lag',
  },
];

// ==================== SERVICE ====================

export class ModAnalyzerService {
  constructor(private curseForgeService: CurseForgeService) {}

  /**
   * Analyze a modpack or list of mods for dependencies, conflicts, and performance
   */
  async analyzeModpack(mods: Array<{
    id: string;
    name: string;
    curseforge_id?: number;
    loader?: string;
    game_version?: string;
    version?: string;
  }>): Promise<AnalysisResult> {
    console.log(`[ModAnalyzer] Analyzing ${mods.length} mods...`);
    
    const result: AnalysisResult = {
      dependencies: {
        missing: [],
        optional: [],
        satisfied: 0,
      },
      conflicts: [],
      performance: [],
      analyzedAt: new Date().toISOString(),
      modCount: mods.length,
    };

    // Get CurseForge IDs
    const cfModIds = mods
      .filter(m => m.curseforge_id)
      .map(m => m.curseforge_id!);

    if (cfModIds.length === 0) {
      console.log('[ModAnalyzer] No CurseForge mods to analyze');
      return result;
    }

    try {
      // Fetch mod details from CurseForge
      const cfMods = await this.curseForgeService.getModsByIds(cfModIds);
      
      // Determine dominant loader and version
      const loaderCounts: Record<string, number> = {};
      const versionCounts: Record<string, number> = {};
      
      for (const mod of mods) {
        if (mod.loader) {
          loaderCounts[mod.loader.toLowerCase()] = (loaderCounts[mod.loader.toLowerCase()] || 0) + 1;
        }
        if (mod.game_version) {
          versionCounts[mod.game_version] = (versionCounts[mod.game_version] || 0) + 1;
        }
      }
      
      const dominantLoader = Object.entries(loaderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fabric';
      const dominantVersion = Object.entries(versionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '1.20.1';

      // Analyze dependencies
      const depResult = await this.analyzeDependencies(cfMods, cfModIds, dominantLoader, dominantVersion);
      result.dependencies = depResult;

      // Analyze conflicts
      result.conflicts = this.analyzeConflicts(mods, cfMods);

      // Analyze performance
      result.performance = await this.analyzePerformance(cfMods, cfModIds, dominantLoader, dominantVersion);

    } catch (error) {
      console.error('[ModAnalyzer] Analysis error:', error);
    }

    return result;
  }

  /**
   * Analyze dependencies and find missing required mods
   */
  private async analyzeDependencies(
    cfMods: CFMod[],
    installedCfIds: number[],
    loader: string,
    gameVersion: string
  ): Promise<AnalysisResult['dependencies']> {
    const result: AnalysisResult['dependencies'] = {
      missing: [],
      optional: [],
      satisfied: 0,
    };

    const installedSet = new Set(installedCfIds);
    const dependencyMap = new Map<number, DependencyInfo>();
    const requiredByMap = new Map<number, string[]>();

    // Collect all dependencies from installed mods
    for (const cfMod of cfMods) {
      // Find the appropriate file for this loader/version
      const file = this.findBestFile(cfMod, loader, gameVersion);
      if (!file) continue;

      for (const dep of file.dependencies) {
        const existing = requiredByMap.get(dep.modId) || [];
        existing.push(cfMod.name);
        requiredByMap.set(dep.modId, existing);

        // Skip if already installed
        if (installedSet.has(dep.modId)) {
          result.satisfied++;
          continue;
        }

        // Skip if we already processed this dependency
        if (dependencyMap.has(dep.modId)) {
          const existingDep = dependencyMap.get(dep.modId)!;
          if (!existingDep.requiredBy.includes(cfMod.name)) {
            existingDep.requiredBy.push(cfMod.name);
          }
          continue;
        }

        // Determine relation type
        let relationType: DependencyInfo['relationType'];
        switch (dep.relationType) {
          case 1: relationType = 'embedded'; break;
          case 2: relationType = 'optional'; break;
          case 3: relationType = 'required'; break;
          case 4: relationType = 'tool'; break;
          case 6: relationType = 'include'; break;
          default: relationType = 'optional';
        }

        dependencyMap.set(dep.modId, {
          modId: dep.modId,
          modName: `Mod #${dep.modId}`, // Will be updated
          modSlug: '',
          relationType,
          status: 'missing',
          requiredBy: [cfMod.name],
        });
      }
    }

    // Fetch details for missing dependencies
    const missingIds = Array.from(dependencyMap.keys());
    if (missingIds.length > 0) {
      try {
        const depMods = await this.curseForgeService.getModsByIds(missingIds);
        
        for (const depMod of depMods) {
          const depInfo = dependencyMap.get(depMod.id);
          if (depInfo) {
            depInfo.modName = depMod.name;
            depInfo.modSlug = depMod.slug;
            depInfo.thumbnailUrl = depMod.logo?.thumbnailUrl;

            // Find suggested file
            const suggestedFile = this.findBestFile(depMod, loader, gameVersion);
            if (suggestedFile) {
              depInfo.suggestedFile = {
                fileId: suggestedFile.id,
                fileName: suggestedFile.fileName,
                gameVersion: suggestedFile.gameVersions.find(v => v.match(/^\d+\.\d+/)) || gameVersion,
                downloadUrl: suggestedFile.downloadUrl,
              };
            }
          }
        }
      } catch (error) {
        console.error('[ModAnalyzer] Failed to fetch dependency details:', error);
      }
    }

    // Sort dependencies into missing and optional
    // Only include dependencies that have a compatible file available
    for (const dep of dependencyMap.values()) {
      // Skip dependencies without a compatible file
      if (!dep.suggestedFile) {
        console.log(`[ModAnalyzer] Skipping ${dep.modName} - no compatible file for ${loader}/${gameVersion}`);
        continue;
      }
      
      if (dep.relationType === 'required') {
        result.missing.push(dep);
      } else if (dep.relationType === 'optional') {
        result.optional.push(dep);
      }
    }

    // Sort by number of mods requiring the dependency
    result.missing.sort((a, b) => b.requiredBy.length - a.requiredBy.length);
    result.optional.sort((a, b) => b.requiredBy.length - a.requiredBy.length);

    return result;
  }

  /**
   * Find the best file for a mod matching loader and game version
   */
  private findBestFile(mod: CFMod, loader: string, gameVersion: string): CFFile | null {
    const loaderVariants = [loader, loader.charAt(0).toUpperCase() + loader.slice(1)];
    
    // First, try to find exact match
    for (const file of mod.latestFiles) {
      const hasLoader = loaderVariants.some(l => file.gameVersions.includes(l));
      const hasVersion = file.gameVersions.includes(gameVersion);
      if (hasLoader && hasVersion) {
        return file;
      }
    }

    return null;
  }

  /**
   * Detect conflicts between mods
   */
  private analyzeConflicts(
    mods: Array<{ id: string; name: string; curseforge_id?: number; loader?: string; game_version?: string }>,
    cfMods: CFMod[]
  ): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    const cfModMap = new Map(cfMods.map(m => [m.id, m]));
    const installedCfIds = new Set(mods.filter(m => m.curseforge_id).map(m => m.curseforge_id!));

    // Check for known conflicts
    for (const knownConflict of KNOWN_CONFLICTS) {
      const hasMod1 = knownConflict.mod1Ids.some(id => installedCfIds.has(id));
      const hasMod2 = knownConflict.mod2Ids.some(id => installedCfIds.has(id));
      
      if (hasMod1 && hasMod2) {
        const mod1Id = knownConflict.mod1Ids.find(id => installedCfIds.has(id))!;
        const mod2Id = knownConflict.mod2Ids.find(id => installedCfIds.has(id))!;
        
        if (mod1Id !== mod2Id) {
          const mod1 = mods.find(m => m.curseforge_id === mod1Id);
          const mod2 = mods.find(m => m.curseforge_id === mod2Id);
          
          if (mod1 && mod2) {
            conflicts.push({
              mod1: { id: mod1.id, name: mod1.name, curseforge_id: mod1Id },
              mod2: { id: mod2.id, name: mod2.name, curseforge_id: mod2Id },
              type: 'incompatible',
              severity: 'error',
              description: knownConflict.description,
              suggestion: knownConflict.suggestion,
            });
          }
        }
      }
    }

    // Check for API-reported incompatibilities
    for (const cfMod of cfMods) {
      const file = cfMod.latestFiles[0];
      if (!file) continue;

      for (const dep of file.dependencies) {
        if (dep.relationType === 5 && installedCfIds.has(dep.modId)) {
          // Incompatible mod is installed
          const incompatibleMod = mods.find(m => m.curseforge_id === dep.modId);
          const thisMod = mods.find(m => m.curseforge_id === cfMod.id);
          
          if (incompatibleMod && thisMod) {
            // Check if we already reported this conflict
            const alreadyReported = conflicts.some(c => 
              (c.mod1.curseforge_id === cfMod.id && c.mod2.curseforge_id === dep.modId) ||
              (c.mod1.curseforge_id === dep.modId && c.mod2.curseforge_id === cfMod.id)
            );
            
            if (!alreadyReported) {
              conflicts.push({
                mod1: { id: thisMod.id, name: thisMod.name, curseforge_id: cfMod.id },
                mod2: { id: incompatibleMod.id, name: incompatibleMod.name, curseforge_id: dep.modId },
                type: 'incompatible',
                severity: 'error',
                description: `${cfMod.name} reports incompatibility with ${incompatibleMod.name}`,
                suggestion: 'Remove one of the conflicting mods',
              });
            }
          }
        }
      }
    }

    // Check for loader mismatches
    const loaderGroups = new Map<string, typeof mods>();
    for (const mod of mods) {
      const loader = mod.loader?.toLowerCase() || 'unknown';
      if (!loaderGroups.has(loader)) {
        loaderGroups.set(loader, []);
      }
      loaderGroups.get(loader)!.push(mod);
    }

    if (loaderGroups.size > 1) {
      const loaders = Array.from(loaderGroups.keys()).filter(l => l !== 'unknown');
      if (loaders.length > 1) {
        const [dominant, ...others] = loaders.sort((a, b) => 
          (loaderGroups.get(b)?.length || 0) - (loaderGroups.get(a)?.length || 0)
        );
        
        for (const other of others) {
          const wrongLoaderMods = loaderGroups.get(other) || [];
          for (const mod of wrongLoaderMods) {
            conflicts.push({
              mod1: { id: mod.id, name: mod.name, curseforge_id: mod.curseforge_id },
              mod2: { id: '', name: `${dominant} modpack`, curseforge_id: undefined },
              type: 'loader_mismatch',
              severity: 'error',
              description: `${mod.name} is for ${other} but this modpack uses ${dominant}`,
              suggestion: `Find a ${dominant} version of this mod or remove it`,
            });
          }
        }
      }
    }

    // Check for duplicate mods (same name, different versions)
    const nameGroups = new Map<string, typeof mods>();
    for (const mod of mods) {
      const normalizedName = mod.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!nameGroups.has(normalizedName)) {
        nameGroups.set(normalizedName, []);
      }
      nameGroups.get(normalizedName)!.push(mod);
    }

    for (const [, group] of nameGroups) {
      if (group.length > 1) {
        for (let i = 0; i < group.length - 1; i++) {
          conflicts.push({
            mod1: { id: group[i].id, name: group[i].name, curseforge_id: group[i].curseforge_id },
            mod2: { id: group[i + 1].id, name: group[i + 1].name, curseforge_id: group[i + 1].curseforge_id },
            type: 'duplicate',
            severity: 'warning',
            description: `Duplicate mod detected: ${group[i].name}`,
            suggestion: 'Keep only one version of this mod',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Analyze performance and suggest optimizations
   */
  private async analyzePerformance(
    cfMods: CFMod[],
    installedCfIds: number[],
    loader: string,
    gameVersion: string
  ): Promise<PerformanceSuggestion[]> {
    const suggestions: PerformanceSuggestion[] = [];
    const installedSet = new Set(installedCfIds);

    // Check for performance mods that could be added
    const perfMods = PERFORMANCE_MODS[loader.toLowerCase()] || [];
    const installedPerfMods = perfMods.filter(pm => installedSet.has(pm.id));
    const missingPerfMods = perfMods.filter(pm => !installedSet.has(pm.id));

    // Essential performance mods
    const essentialMods = ['Sodium', 'Embeddium', 'Lithium', 'FerriteCore'];
    const hasRenderingOptimizer = installedPerfMods.some(m => 
      m.name === 'Sodium' || m.name === 'Embeddium' || m.name === 'OptiFine'
    );

    if (!hasRenderingOptimizer) {
      const renderMod = loader === 'fabric' || loader === 'quilt'
        ? perfMods.find(m => m.name === 'Sodium')
        : perfMods.find(m => m.name === 'Embeddium');
      
      if (renderMod) {
        suggestions.push({
          type: 'add_mod',
          severity: 'critical',
          title: `Install ${renderMod.name}`,
          description: renderMod.description + '. This can double or triple your FPS!',
          modId: renderMod.id,
          modName: renderMod.name,
          modSlug: renderMod.slug,
          action: { type: 'install' },
        });
      }
    }

    // Suggest other missing performance mods
    for (const perfMod of missingPerfMods) {
      if (essentialMods.includes(perfMod.name) && 
          perfMod.name !== 'Sodium' && 
          perfMod.name !== 'Embeddium') {
        suggestions.push({
          type: 'add_mod',
          severity: 'recommended',
          title: `Install ${perfMod.name}`,
          description: perfMod.description,
          modId: perfMod.id,
          modName: perfMod.name,
          modSlug: perfMod.slug,
          action: { type: 'install' },
        });
      }
    }

    // Check for mods that could cause performance issues
    for (const impactMod of PERFORMANCE_IMPACT_MODS) {
      if (impactMod.modIds.some(id => installedSet.has(id))) {
        suggestions.push({
          type: 'tip',
          severity: impactMod.impact === 'high' ? 'critical' : 'optional',
          title: `Performance impact: ${impactMod.name}`,
          description: impactMod.description,
          modName: impactMod.name,
        });
      }
    }

    // Add general tips
    if (installedCfIds.length > 100) {
      suggestions.push({
        type: 'tip',
        severity: 'recommended',
        title: 'Large modpack detected',
        description: `You have ${installedCfIds.length} mods. Consider increasing Java heap size (RAM allocation) to at least 6-8GB for smooth gameplay.`,
      });
    }

    if (!installedPerfMods.some(m => m.name === 'FerriteCore')) {
      const ferriteCore = perfMods.find(m => m.name === 'FerriteCore');
      if (ferriteCore && installedCfIds.length > 50) {
        suggestions.push({
          type: 'add_mod',
          severity: 'recommended',
          title: 'Install FerriteCore',
          description: 'Reduces memory usage significantly - especially important for large modpacks',
          modId: ferriteCore.id,
          modName: ferriteCore.name,
          modSlug: ferriteCore.slug,
          action: { type: 'install' },
        });
      }
    }

    return suggestions;
  }

  /**
   * Quick check if a mod has any dependencies
   */
  async checkModDependencies(curseforgeId: number, loader: string, gameVersion: string): Promise<DependencyInfo[]> {
    try {
      const mods = await this.curseForgeService.getModsByIds([curseforgeId]);
      if (mods.length === 0) return [];

      const mod = mods[0];
      const file = this.findBestFile(mod, loader, gameVersion);
      if (!file) return [];

      const requiredDeps = file.dependencies.filter(d => d.relationType === 3);
      if (requiredDeps.length === 0) return [];

      const depMods = await this.curseForgeService.getModsByIds(requiredDeps.map(d => d.modId));
      
      return depMods.map(dm => ({
        modId: dm.id,
        modName: dm.name,
        modSlug: dm.slug,
        thumbnailUrl: dm.logo?.thumbnailUrl,
        relationType: 'required' as const,
        status: 'missing' as const,
        requiredBy: [mod.name],
        suggestedFile: (() => {
          const sf = this.findBestFile(dm, loader, gameVersion);
          return sf ? {
            fileId: sf.id,
            fileName: sf.fileName,
            gameVersion: sf.gameVersions.find(v => v.match(/^\d+\.\d+/)) || gameVersion,
            downloadUrl: sf.downloadUrl,
          } : undefined;
        })(),
      }));
    } catch (error) {
      console.error('[ModAnalyzer] Error checking dependencies:', error);
      return [];
    }
  }
}
