/**
 * Mod Analyzer Service - Simplified
 * 
 * Provides functionality for:
 * - Dependency resolution (finding missing required mods)
 * - Conflict detection (API-based incompatibilities only)
 * - Loader mismatch detection
 * - Duplicate mod detection
 */

import { CurseForgeService, CFMod, CFFile } from './CurseForgeService';
import { createLogger } from "./LoggerService.js";

const log = createLogger("ModAnalyzer");

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
  type: 'duplicate' | 'loader_mismatch';
  severity: 'error' | 'warning' | 'info';
  description: string;
  suggestion?: string;
}

export interface AnalysisResult {
  dependencies: {
    missing: DependencyInfo[];
    optional: DependencyInfo[];
    satisfied: number;
  };
  conflicts: ConflictInfo[];
  analyzedAt: string;
  modCount: number;
}

// ==================== SERVICE ====================

export class ModAnalyzerService {
  constructor(private curseForgeService: CurseForgeService) { }

  /**
   * Analyze a modpack or list of mods for dependencies and conflicts
   */
  async analyzeModpack(mods: Array<{
    id: string;
    name: string;
    curseforge_id?: number;
    loader?: string;
    game_version?: string;
    version?: string;
  }>): Promise<AnalysisResult> {
    log.info(`Analyzing ${mods.length} mods...`);

    const result: AnalysisResult = {
      dependencies: {
        missing: [],
        optional: [],
        satisfied: 0,
      },
      conflicts: [],
      analyzedAt: new Date().toISOString(),
      modCount: mods.length,
    };

    // Get CurseForge IDs
    const cfModIds = mods
      .filter(m => m.curseforge_id)
      .map(m => m.curseforge_id!);

    if (cfModIds.length === 0) {
      log.info('No CurseForge mods to analyze');
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

      // Analyze conflicts (API-based only)
      result.conflicts = this.analyzeConflicts(mods, cfMods);

    } catch (error) {
      log.error('Analysis error:', error);
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
        log.error('Failed to fetch dependency details:', error);
      }
    }

    // Sort dependencies into missing and optional
    // Only include dependencies that have a compatible file available
    for (const dep of dependencyMap.values()) {
      // Skip dependencies without a compatible file
      if (!dep.suggestedFile) {
        log.info(`Skipping ${dep.modName} - no compatible file for ${loader}/${gameVersion}`);
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
   * Uses flexible version matching (1.20 matches 1.20.1, etc.)
   */
  private findBestFile(mod: CFMod, loader: string, gameVersion: string): CFFile | null {
    const loaderVariants = [
      loader.toLowerCase(),
      loader.charAt(0).toUpperCase() + loader.slice(1).toLowerCase(),
      loader.toUpperCase()
    ];

    // Parse the game version for flexible matching
    const versionParts = gameVersion.split('.');
    const majorMinor = versionParts.slice(0, 2).join('.'); // e.g., "1.20"

    // Sort files by release type (release > beta > alpha) and date
    const sortedFiles = [...mod.latestFiles].sort((a, b) => {
      // Prefer release > beta > alpha
      if (a.releaseType !== b.releaseType) {
        return a.releaseType - b.releaseType;
      }
      // Then by date (newer first)
      return new Date(b.fileDate || 0).getTime() - new Date(a.fileDate || 0).getTime();
    });

    // First pass: exact version match
    for (const file of sortedFiles) {
      const hasLoader = loaderVariants.some(l =>
        file.gameVersions.some(v => v.toLowerCase() === l.toLowerCase())
      );
      const hasExactVersion = file.gameVersions.includes(gameVersion);
      if (hasLoader && hasExactVersion) {
        return file;
      }
    }

    // Second pass: major.minor match (e.g., 1.20 matches 1.20.1)
    for (const file of sortedFiles) {
      const hasLoader = loaderVariants.some(l =>
        file.gameVersions.some(v => v.toLowerCase() === l.toLowerCase())
      );
      const hasVersionMatch = file.gameVersions.some(v => {
        // Check if version starts with our majorMinor
        return v.startsWith(majorMinor + '.') || v === majorMinor;
      });
      if (hasLoader && hasVersionMatch) {
        return file;
      }
    }

    // Third pass: just loader match with any reasonably close version
    for (const file of sortedFiles) {
      const hasLoader = loaderVariants.some(l =>
        file.gameVersions.some(v => v.toLowerCase() === l.toLowerCase())
      );
      // Check for same major version (1.x)
      const hasSameMajor = file.gameVersions.some(v =>
        v.startsWith(versionParts[0] + '.')
      );
      if (hasLoader && hasSameMajor) {
        return file;
      }
    }

    return null;
  }

  /**
   * Detect conflicts between mods
   * Checks for loader mismatches and duplicate mods only
   * Note: CurseForge API does not provide incompatibility data between mods
   */
  private analyzeConflicts(
    mods: Array<{ id: string; name: string; curseforge_id?: number; loader?: string; game_version?: string }>,
    _cfMods: CFMod[]
  ): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

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
              severity: 'warning',
              description: `${mod.name} is for ${other} but this modpack uses ${dominant}`,
              suggestion: `Find a ${dominant} version or use a compatibility layer like Sinytra Connector`,
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
      log.error('Error checking dependencies:', error);
      return [];
    }
  }
}
