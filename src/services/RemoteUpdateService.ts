import { Modpack, ModexManifest, Mod, ModpackChange } from "@/types";

export interface UpdateResult {
  hasUpdate: boolean;
  changes: ModpackChange[];
  remoteManifest?: ModexManifest;
  error?: string;
}

export class RemoteUpdateService {
  /**
   * Fetches the remote manifest and compares it with the local modpack.
   */
  async checkForUpdates(modpack: Modpack): Promise<UpdateResult> {
    if (!modpack.remote_source?.url) {
      return { hasUpdate: false, changes: [] };
    }

    try {
      const response = await fetch(modpack.remote_source.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch remote manifest: ${response.statusText}`
        );
      }

      const remoteManifest = (await response.json()) as ModexManifest;
      return this.compareManifests(modpack, remoteManifest);
    } catch (error) {
      console.error("Failed to check for updates:", error);
      return {
        hasUpdate: false,
        changes: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Compares the local modpack with the remote manifest to generate a list of changes.
   */
  private compareManifests(
    local: Modpack,
    remote: ModexManifest
  ): UpdateResult {
    const changes: ModpackChange[] = [];

    // Check main version difference
    // Note: We might want to allow "downgrades" or just "sync to state",
    // so we simply check if the versions are different OR if the mod lists differ.
    // For now, let's assume if versions differ, we should notify.

    // 1. Identify Removed Mods (Present in Local but NOT in Remote)
    // We compare by Source ID if possible, or fallback to file names?
    // Ideally ModExManifest stores IDs.

    const remoteModsMap = new Map<
      string,
      { id: string; version: string; name: string }
    >();
    if (remote.mods) {
      remote.mods.forEach((m) => remoteModsMap.set(m.id, m));
    }

    // Iterate local mod IDs. We need the actual Mod objects locally to compare.
    // However, the Modpack interface only stores `mod_ids`.
    // IMPORTANT: We need the full list of local mods to do a proper comparison.
    // In the frontend, we usually have access to the pinned Store or we can fetch them.
    // But this service call might just rely on IDs if the matching is 1:1.
    // Let's assume for this "Check" we might need to be passed the local mods, OR we accept that
    // we can't fully diff details without them.
    // BUT wait, `checkForUpdates` takes `Modpack`.
    // If we want to show "Update from v1.0.0 to v1.1.0", that's easy.
    // If we want the specific file changes, we need the logic.

    // Let's rely on the IDs for the diff.
    const localModIds = new Set(local.mod_ids);
    const remoteModIds = new Set(remoteModsMap.keys());

    // Check for ADDED mods (In Remote, not in Local)
    for (const [rId, rMod] of remoteModsMap) {
      if (!localModIds.has(rId)) {
        changes.push({
          type: "add",
          modId: rId,
          modName: rMod.name,
          newVersion: rMod.version,
        });
      } else {
        // Mod exists in both, check for Version update
        // We'd need to know the LOCAL version of this mod.
        // Iterate local mods is tricky without them passed in.
        // TODO: This service might need the `localMods: Mod[]` argument to be precise.
      }
    }

    // Check for REMOVED mods (In Local, not in Remote)
    for (const lId of localModIds) {
      if (!remoteModIds.has(lId)) {
        // We need the name of the local mod to show a nice message.
        // We'll mark it with ID for now.
        changes.push({
          type: "remove",
          modId: lId,
          modName: lId, // Placeholder until we look it up
        });
      }
    }

    // If we can't check versions (because we lack local Mod objects),
    // the diff is incomplete.
    // Let's update the signature to require local Mods or fetch them.

    const hasUpdate =
      changes.length > 0 || local.version !== remote.modpack.version;

    return {
      hasUpdate,
      changes,
      remoteManifest: remote,
    };
  }

  /**
   * More advanced compare that requires full local mod objects
   */
  compareWithDetails(
    localPack: Modpack,
    localMods: Mod[],
    remote: ModexManifest
  ): UpdateResult {
    const changes: ModpackChange[] = [];
    const remoteModsMap = new Map(remote.mods.map((m) => [m.id, m]));
    const localModsMap = new Map(localMods.map((m) => [m.id, m]));

    // 1. Added
    for (const [rId, rMod] of remoteModsMap) {
      if (!localModsMap.has(rId)) {
        changes.push({
          type: "add",
          modId: rId,
          modName: rMod.name,
          newVersion: rMod.version,
        });
      } else {
        // Exists in both, check version
        const lMod = localModsMap.get(rId)!;
        if (lMod.version !== rMod.version) {
          changes.push({
            type: "update",
            modId: rId,
            modName: rMod.name,
            previousVersion: lMod.version,
            newVersion: rMod.version,
          });
        }
      }
    }

    // 2. Removed
    for (const [lId, lMod] of localModsMap) {
      if (!remoteModsMap.has(lId)) {
        changes.push({
          type: "remove",
          modId: lId,
          modName: lMod.name,
          previousVersion: lMod.version,
        });
      }
    }

    // Check main version
    // We consider it an update if the manifest version is different OR if there are file changes.
    const hasUpdate =
      changes.length > 0 || localPack.version !== remote.modpack.version;

    return {
      hasUpdate,
      changes,
      remoteManifest: remote,
    };
  }
}

export const remoteUpdateService = new RemoteUpdateService();
