/**
 * ModEx Types - Metadata-Only Architecture
 *
 * Mods are stored as API references (CurseForge/Modrinth IDs) without local files.
 * This enables lightweight storage and native export to modpack formats.
 */

// ==================== MOD ====================

export interface Mod {
  /** Unique ID: "cf-{projectId}-{fileId}" or "mr-{projectId}-{versionId}" */
  id: string;

  /** Display name */
  name: string;

  /** URL-friendly slug */
  slug?: string;

  /** File/version string (e.g., "1.2.3", "0.15.0+1.20.1") */
  version: string;

  /** Minecraft version (e.g., "1.20.1", "1.21.1") */
  game_version: string;

  /** Mod loader (forge, fabric, quilt, neoforge) */
  loader: string;

  /** Short description */
  description?: string;

  /** Author name(s) */
  author?: string;

  /** Thumbnail/logo URL */
  thumbnail_url?: string;

  /** Full size logo URL */
  logo_url?: string;

  /** Download count from source */
  download_count?: number;

  /** Release type */
  release_type?: "release" | "beta" | "alpha";

  /** When the file was released */
  date_released?: string;

  /** When added to library */
  created_at: string;

  /** Original filename (for display/export) */
  filename: string;

  // ==================== SOURCE IDENTIFIERS ====================

  /** Source platform */
  source: "curseforge" | "modrinth";

  /** CurseForge project ID */
  cf_project_id?: number;

  /** CurseForge file ID */
  cf_file_id?: number;

  /** Modrinth project ID (future) */
  mr_project_id?: string;

  /** Modrinth version ID (future) */
  mr_version_id?: string;

  // ==================== OPTIONAL METADATA ====================

  /** User-defined tags */
  tags?: string[];

  /** User favorite flag */
  favorite?: boolean;

  /** Dependencies from source */
  dependencies?: ModDependency[];

  // ==================== ADDITIONAL METADATA ====================

  /** Mod categories (e.g., "Technology", "Magic") */
  categories?: string[];

  /** File size in bytes */
  file_size?: number;

  /** Mod project creation date */
  date_created?: string;

  /** Last mod update date */
  date_modified?: string;

  /** Mod website/CurseForge page */
  website_url?: string;

  /** Issue tracker URL */
  issues_url?: string;

  /** Source code URL */
  source_url?: string;

  /** Wiki URL */
  wiki_url?: string;
}

export interface ModDependency {
  modId: number | string;
  type: "required" | "optional" | "incompatible" | "embedded";
}

// ==================== MODPACK ====================

export interface Modpack {
  /** Unique ID (sanitized name or UUID) */
  id: string;

  /** Display name */
  name: string;

  /** Version string */
  version: string;

  /** Target Minecraft version */
  minecraft_version?: string;

  /** Target mod loader */
  loader?: string;

  /** Description */
  description?: string;

  /** Cover image URL or local path */
  image_url?: string;

  /** Creation timestamp */
  created_at: string;

  /** Last modified timestamp */
  updated_at?: string;

  /** Number of mods (computed) */
  mod_count?: number;

  /** User favorite flag */
  favorite?: boolean;

  /** Share code for MODEX sync */
  share_code?: string;

  /** Last sync timestamp */
  last_sync?: string;

  /** Mod IDs in this modpack */
  mod_ids: string[];

  /** Disabled mod IDs (mods that are in the pack but temporarily disabled) */
  disabled_mod_ids?: string[];
}

// ==================== MODPACK CREATION ====================

export interface CreateModpackData {
  name: string;
  version?: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
}

// ==================== CURSEFORGE EXPORT ====================

export interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: { id: string; primary: boolean }[];
  };
  manifestType: "minecraftModpack";
  manifestVersion: 1;
  name: string;
  version: string;
  author: string;
  files: CurseForgeManifestFile[];
  overrides: string;
}

export interface CurseForgeManifestFile {
  projectID: number;
  fileID: number;
  required: boolean;
}

// ==================== MODEX EXPORT ====================

export interface ModexManifest {
  modex_version: "2.0";
  share_code: string;
  checksum: string;
  exported_at: string;
  modpack: {
    name: string;
    version: string;
    minecraft_version?: string;
    loader?: string;
    description?: string;
  };
  mods: ModexManifestMod[];
  stats: {
    mod_count: number;
  };
  /** Version control history (optional, included if modpack has versions) */
  version_history?: ModpackVersionHistory;
}

export interface ModexManifestMod {
  id: string;
  name: string;
  version: string;
  filename: string;
  source: "curseforge" | "modrinth";
  cf_project_id?: number;
  cf_file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
}

// ==================== UPDATE INFO ====================

export interface ModUpdateInfo {
  modId: string;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  updateUrl: string | null;
  source: "curseforge" | "modrinth" | "unknown";
  projectId: string | null;
  projectName: string | null;
  changelog: string | null;
  releaseDate: string | null;
  /** New file ID to update to */
  newFileId?: number;
  newVersionId?: string;
}

// ==================== VERSION CONTROL ====================

/** A single change in a modpack version */
export interface ModpackChange {
  type: "add" | "remove" | "update" | "enable" | "disable";
  modId: string;
  modName: string;
  /** For updates: previous version string */
  previousVersion?: string;
  /** For updates: new version string */
  newVersion?: string;
  /** For updates: previous file ID */
  previousFileId?: number;
  /** For updates: new file ID */
  newFileId?: number;
}

/** A snapshot/commit of the modpack state */
export interface ModpackVersion {
  /** Unique version ID (e.g., "v1", "v2", or timestamp) */
  id: string;
  /** Version tag (e.g., "1.0.0", "1.1.0") */
  tag: string;
  /** Commit message */
  message: string;
  /** Timestamp of when this version was created */
  created_at: string;
  /** Author (for future multi-user support) */
  author?: string;
  /** List of changes from previous version */
  changes: ModpackChange[];
  /** Complete snapshot of mod IDs at this version */
  mod_ids: string[];
  /** Snapshot of disabled mod IDs at this version */
  disabled_mod_ids?: string[];
  /** Parent version ID (for branching support in the future) */
  parent_id?: string;
  /** Snapshots of CF mods for rollback restoration */
  mod_snapshots?: Array<{
    id: string;
    name: string;
    cf_project_id: number;
    cf_file_id: number;
  }>;
}

/** Version control history for a modpack */
export interface ModpackVersionHistory {
  /** Modpack ID this history belongs to */
  modpack_id: string;
  /** Current/latest version ID */
  current_version_id: string;
  /** All versions, ordered from oldest to newest */
  versions: ModpackVersion[];
}

// ==================== API CONFIG ====================

export interface AppConfig {
  curseforge_api_key?: string;
  modrinth_api_key?: string;
  theme?: "light" | "dark" | "system";
}

// ==================== FOLDER ORGANIZATION (Frontend-only) ====================

export interface ModFolder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  expanded?: boolean;
  order: number;
  created_at: string;
}

export interface TreeNode {
  id: string;
  type: "folder" | "mod";
  name: string;
  parentId: string | null;
  children?: TreeNode[];
  data: Mod | ModFolder;
  expanded?: boolean;
  order: number;
}
