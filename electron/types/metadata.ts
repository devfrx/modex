/**
 * Metadata Types - Core type definitions for the metadata-only architecture
 *
 * These types define the structure of mods, modpacks, and version control.
 * Originally defined in MetadataManager.ts, extracted for better modularity.
 *
 * @module electron/types/metadata
 */

// ==================== MOD TYPES ====================

export interface Mod {
  id: string;
  name: string;
  slug?: string;
  version: string;
  game_version: string;
  game_versions?: string[]; // List of compatible MC versions (mainly for shaders/resourcepacks)
  loader: string;
  content_type?: "mod" | "resourcepack" | "shader";
  description?: string;
  author?: string;
  thumbnail_url?: string;
  download_count?: number;
  release_type?: "release" | "beta" | "alpha";
  date_released?: string;
  created_at: string;
  filename: string;
  source: "curseforge" | "modrinth";
  cf_project_id?: number;
  cf_file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
  tags?: string[];
  favorite?: boolean;
  dependencies?: { modId: number | string; type: string }[];
  // Additional metadata for better UX
  logo_url?: string; // Full size logo
  categories?: string[]; // Mod categories (e.g., "Technology", "Magic")
  cf_categories?: number[]; // CurseForge category IDs for recommendation matching
  file_size?: number; // File size in bytes
  date_created?: string; // Mod project creation date
  date_modified?: string; // Last mod update date
  website_url?: string; // Mod website/CurseForge page
  issues_url?: string; // Issue tracker URL
  source_url?: string; // Source code URL
  wiki_url?: string; // Wiki URL
}

// ==================== MODPACK TYPES ====================

export interface Modpack {
  id: string;
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  loader_version?: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at?: string;
  mod_count?: number;
  favorite?: boolean;
  share_code?: string;
  last_sync?: string;
  mod_ids: string[];
  disabled_mod_ids?: string[];
  locked_mod_ids?: string[];
  mod_notes?: Record<string, string>;
  remote_source?: {
    url: string;
    auto_check: boolean;
    last_checked?: string;
    skip_initial_check?: boolean;
  };
  /** Gist publishing configuration for this modpack */
  gist_config?: {
    gist_id: string;
    filename: string;
    is_public: boolean;
    last_pushed?: string;
    raw_url?: string;
    html_url?: string;
  };
  // Track mods that failed to import due to incompatibility
  incompatible_mods?: Array<{
    cf_project_id: number;
    name: string;
    reason: string;
  }>;
  // CurseForge source tracking for imported modpacks
  cf_project_id?: number;
  cf_file_id?: number;
  cf_slug?: string;
  // Path to saved overrides (config files, scripts, etc.) for this modpack
  overridesPath?: string;
}

export interface CreateModpackData {
  name: string;
  version?: string;
  minecraft_version?: string;
  loader?: string;
  loader_version?: string;
  description?: string;
}

// ==================== VERSION CONTROL TYPES ====================

export interface ModpackChange {
  type: "add" | "remove" | "update" | "enable" | "disable" | "version_control" | "loader_change" | "lock" | "unlock" | "note_add" | "note_remove" | "note_change";
  modId: string;
  modName: string;
  previousVersion?: string;
  newVersion?: string;
  previousFileId?: number;
  newFileId?: number;
  previousNote?: string;
  newNote?: string;
}

export interface ModpackVersion {
  id: string;
  tag: string;
  message: string;
  created_at: string;
  author?: string;
  changes: ModpackChange[];
  mod_ids: string[];
  disabled_mod_ids?: string[];
  locked_mod_ids?: string[];
  mod_notes?: Record<string, string>;
  /** Loader type at this version (forge, fabric, etc.) */
  loader?: string;
  /** Loader version at this version */
  loader_version?: string;
  parent_id?: string;
  /** Snapshots of mods for rollback restoration (supports CurseForge and Modrinth) */
  mod_snapshots?: Array<{
    id: string;
    name: string;
    version?: string;
    source: "curseforge" | "modrinth";
    cf_project_id?: number;
    cf_file_id?: number;
    mr_project_id?: string;
    mr_version_id?: string;
  }>;
  /** ID of the config snapshot for this version (stored in overrides/{modpackId}/snapshots/{versionId}/) */
  config_snapshot_id?: string;
  /** Config changes included in this version */
  config_changes?: Array<{
    filePath: string;
    keyPath: string;
    line?: number;
    oldValue: any;
    newValue: any;
  }>;
}

export interface ModpackVersionHistory {
  modpack_id: string;
  current_version_id: string;
  versions: ModpackVersion[];
}

// ==================== CURSEFORGE MANIFEST TYPES ====================

export interface CFManifestFile {
  projectID: number;
  fileID: number;
  required: boolean;
}

export interface CFManifest {
  minecraft: {
    version: string;
    modLoaders: Array<{ id: string; primary: boolean }>;
  };
  manifestType: string;
  manifestVersion: number;
  name: string;
  version: string;
  author: string;
  files: CFManifestFile[];
  overrides: string;
}

// Partial import data for conflict resolution
export interface CFImportPartialData {
  modpackId: string;
  modsImported?: number;
  modsSkipped?: number;
  errors?: string[];
  processedMods?: Mod[];
  newModIds?: string[];
  overridesPath?: string;
  addedModNames?: string[];
  oldModIds?: string[];
}

// ==================== MODEX MANIFEST TYPES ====================

export interface ModexManifestMod {
  id: string;
  name: string;
  version: string;
  filename: string;
  source: "curseforge" | "modrinth";
  content_type?: "mod" | "resourcepack" | "shader";
  cf_project_id?: number;
  cf_file_id?: number;
  /** Alias for cf_project_id (backwards compatibility with external formats) */
  project_id?: number;
  /** Alias for cf_file_id (backwards compatibility with external formats) */
  file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
  description?: string;
  author?: string;
  thumbnail_url?: string;
}

export interface ModexManifest {
  modex_version: "2.1" | "2.0";
  share_code: string;
  checksum: string;
  import_checksum?: string;
  version_history_hash?: string;
  exported_at: string;
  modpack: {
    name: string;
    version: string;
    minecraft_version?: string;
    loader?: string;
    loader_version?: string;
    description?: string;
    /** CurseForge project ID (if imported from CF) */
    cf_project_id?: number;
    /** CurseForge file ID (specific version imported) */
    cf_file_id?: number;
  };
  mods: ModexManifestMod[];
  disabled_mods?: string[];
  disabled_mods_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
  }>;
  /** Internal mod IDs of locked mods (for backwards compatibility) */
  locked_mods?: string[];
  /** Locked mods by project ID (stable cross-import identifiers) */
  locked_mods_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
  }>;
  /** Mods that failed to import due to incompatibility */
  incompatible_mods?: Array<{
    cf_project_id: number;
    name: string;
    reason: string;
  }>;
  stats: {
    mod_count: number;
    disabled_count?: number;
    locked_count?: number;
    notes_count?: number;
  };
  mod_notes?: Record<string, string>;
  mod_notes_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
    note: string;
  }>;
  version_history?: ModpackVersionHistory;
}

// ==================== INTERNAL TYPES ====================
// These are used internally by MetadataManager but exported for type compatibility

export interface LibraryData {
  version: string;
  mods: Mod[];
}

export interface AppConfig {
  curseforge_api_key?: string;
  /** Instance sync settings */
  instanceSync?: {
    /** Auto-sync modpack to instance before launching */
    autoSyncBeforeLaunch?: boolean;
    /** Auto-import config changes from instance after game closes */
    autoImportConfigsAfterGame?: boolean;
    /** Show confirmation dialog before auto-sync */
    showSyncConfirmation?: boolean;
    /** Default config sync mode when syncing */
    defaultConfigSyncMode?: "overwrite" | "new_only" | "skip";
    /** 
     * Instant sync: immediately apply mod changes to instance files.
     * When enabled, adding/removing/toggling mods will instantly update the instance folder.
     * This eliminates the need for manual "Sync" operations.
     * Default: true
     */
    instantSync?: boolean;
  };
  /** Gist publishing settings */
  gistSettings?: {
    /** Default manifest mode when publishing to Gist: 'full' includes version history, 'current' only latest */
    defaultManifestMode?: "full" | "current";
  };
}
