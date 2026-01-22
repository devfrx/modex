/**
 * Mod Analyzer IPC Handlers
 * Modpack analysis for dependencies, conflicts, and optimization
 */

import { ipcMain } from "electron";
import type { ModAnalyzerService, DependencyInfo } from "../services/ModAnalyzerService.js";
import type { CurseForgeService } from "../services/CurseForgeService.js";
import type { MetadataManager } from "../services/MetadataManager.js";
import { getContentTypeFromClassId } from "../services/CurseForgeService.js";

export interface AnalyzerIpcDeps {
  modAnalyzerService: ModAnalyzerService;
  curseforgeService: CurseForgeService;
  metadataManager: MetadataManager;
}

export function registerAnalyzerHandlers(deps: AnalyzerIpcDeps): void {
  const { modAnalyzerService, curseforgeService, metadataManager } = deps;

  // Analyze a modpack for conflicts and missing dependencies
  ipcMain.handle("analyzer:analyzeModpack", async (_, modpackId: string) => {
    try {
      const modpack = await metadataManager.getModpackById(modpackId);
      if (!modpack) {
        throw new Error("Modpack not found");
      }

      const modIds = modpack.mod_ids || [];
      const mods = await Promise.all(
        modIds.map(async (modId) => {
          const mod = await metadataManager.getModById(modId);
          return mod;
        })
      );

      const validMods = mods
        .filter(
          (m): m is NonNullable<typeof m> => m !== null && m !== undefined
        )
        .map((m) => ({
          id: m.id,
          name: m.name,
          curseforge_id: m.cf_project_id,
          loader: m.loader,
          game_version: m.game_version,
          version: m.version,
        }));

      const result = await modAnalyzerService.analyzeModpack(validMods);

      // Also get dependency health analysis for orphaned dependencies
      const healthAnalysis = await metadataManager.analyzeDependencyHealth(modpackId);

      // Transform to frontend format
      return {
        missingDependencies: result.dependencies.missing.map((dep) => ({
          modId: dep.modId,
          modName: dep.modName,
          requiredBy: dep.requiredBy,
          slug: dep.modSlug,
        })),
        conflicts: result.conflicts.map((c) => ({
          mod1: { id: c.mod1.id, name: c.mod1.name, curseforge_id: c.mod1.curseforge_id },
          mod2: { id: c.mod2.id, name: c.mod2.name, curseforge_id: c.mod2.curseforge_id },
          type: c.type,
          severity: c.severity,
          description: c.description,
          suggestion: c.suggestion,
          reason: c.description,
        })),
        orphanedDependencies: healthAnalysis.orphanedDependencies.map((o) => ({
          id: o.id,
          name: o.name,
          wasRequiredBy: o.wasRequiredBy,
          confidence: o.confidence,
          reason: o.reason,
        })),
        dependencyChains: healthAnalysis.dependencyChains.map((chain) => ({
          rootMod: chain.rootMod,
          chain: chain.chain,
        })),
        totalMods: result.modCount,
        satisfiedDependencies: result.dependencies.satisfied,
      };
    } catch (error: any) {
      console.error("Analyzer error:", error);
      throw error;
    }
  });

  // Analyze entire library
  ipcMain.handle("analyzer:analyzeLibrary", async () => {
    try {
      const allMods = await metadataManager.getAllMods();
      const mods = allMods.map((m) => ({
        id: m.id,
        name: m.name,
        curseforge_id: m.cf_project_id,
        loader: m.loader,
        game_version: m.game_version,
        version: m.version,
      }));

      return await modAnalyzerService.analyzeModpack(mods);
    } catch (error: any) {
      console.error("Analyzer error:", error);
      throw error;
    }
  });

  // Check dependencies for a specific mod
  ipcMain.handle("analyzer:checkDependencies", async (_, curseforgeId: number, loader: string, gameVersion: string) => {
    try {
      return await modAnalyzerService.checkModDependencies(
        curseforgeId,
        loader,
        gameVersion
      );
    } catch (error: any) {
      console.error("Dependency check error:", error);
      return [];
    }
  });

  // Get performance tips (deprecated)
  ipcMain.handle("analyzer:getPerformanceTips", async (_, modpackId: string) => {
    // Performance tips have been removed from ModAnalyzerService
    // This handler is kept for backward compatibility
    console.debug(`Performance tips requested for ${modpackId} but feature is deprecated`);
    return [];
  });

  // Install a dependency
  ipcMain.handle("analyzer:installDependency", async (_, depInfo: DependencyInfo, modpackId?: string) => {
    try {
      if (!depInfo.suggestedFile) {
        throw new Error("No suggested file for this dependency");
      }

      // Fetch the mod details from CurseForge
      const cfMods = await curseforgeService.getModsByIds([depInfo.modId]);
      if (cfMods.length === 0) {
        throw new Error("Mod not found on CurseForge");
      }

      const cfMod = cfMods[0];
      const cfFile = await curseforgeService.getFile(
        depInfo.modId,
        depInfo.suggestedFile.fileId
      );

      if (!cfFile) {
        throw new Error("File not found on CurseForge");
      }

      // Get modpack for loader/version info
      const modpack = modpackId
        ? await metadataManager.getModpackById(modpackId)
        : null;

      // Detect content type from classId
      const contentType = getContentTypeFromClassId(cfMod.classId);

      // Convert to library format and save
      const modData = curseforgeService.modToLibraryFormat(
        cfMod,
        cfFile,
        modpack?.loader || "forge",
        modpack?.minecraft_version || "1.20.1",
        contentType
      );
      const savedMod = await metadataManager.addMod(modData);

      // Add to modpack if specified
      if (modpackId && modpack) {
        if (!modpack.mod_ids.includes(savedMod.id)) {
          await metadataManager.addModToModpack(modpackId, savedMod.id);
        }
      }

      return { success: true, mod: savedMod };
    } catch (error: any) {
      console.error("Install dependency error:", error);
      return { success: false, error: error.message };
    }
  });
}
