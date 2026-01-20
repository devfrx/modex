/**
 * Shared Types - Core type definitions used across frontend and backend
 * 
 * This file contains the canonical type definitions that are shared between
 * the Electron main process and the Vue renderer process.
 * 
 * IMPORTANT: This file should NOT import from electron or vue packages
 * to maintain compatibility across both environments.
 */

// ==================== CONTENT TYPE ====================

/**
 * Internal content type for library storage (singular form)
 * Used throughout the application for mod data stored in the library
 */
export type ModContentType = "mod" | "resourcepack" | "shader";

/**
 * CurseForge API content type (plural form)
 * Used when communicating with CurseForge API
 */
export type CurseForgeContentType = "mods" | "resourcepacks" | "shaders" | "modpacks";

/**
 * Release stability type
 */
export type ReleaseType = "release" | "beta" | "alpha";

/**
 * Mod source platform
 */
export type ModSource = "curseforge" | "modrinth";

/**
 * Dependency relationship type
 */
export type DependencyType = "required" | "optional" | "incompatible" | "embedded" | "include" | "tool" | "unknown";

// ==================== GAME TYPES ====================

/** Supported game types */
export type GameType = "minecraft" | "hytale";

/** Game profile configuration */
export interface GameProfile {
  /** Unique profile ID */
  id: string;
  
  /** Game type */
  gameType: GameType;
  
  /** Display name */
  name: string;
  
  /** Profile description */
  description?: string;
  
  /** Profile icon (emoji or path) */
  icon?: string;
  
  /** Whether this is the default profile for this game type */
  isDefault?: boolean;
  
  /** Game installation path */
  gamePath?: string;
  
  /** Launcher executable path */
  launcherPath?: string;
  
  /** Mods directory */
  modsPath: string;
  
  /** Creation timestamp */
  createdAt: string;
  
  /** Last used timestamp */
  lastUsed?: string;
}

/** Game-specific configuration */
export interface GameConfig {
  /** CurseForge Game ID */
  cfGameId: number;
  
  /** CurseForge Mods Class ID */
  cfModsClassId: number;
  
  /** Whether the game uses separate instances (like Minecraft) */
  usesInstances: boolean;
  
  /** Whether the game has mod loaders */
  hasModLoaders: boolean;
  
  /** Available mod loaders (empty for games without mod loaders) */
  modLoaders: string[];
  
  /** Whether the game supports resource packs */
  supportsResourcePacks: boolean;
  
  /** Whether the game supports shaders */
  supportsShaders: boolean;
  
  /** Display name */
  displayName: string;
  
  /** Game icon (emoji) */
  icon: string;
}

// ==================== MOD DEPENDENCY ====================

export interface ModDependency {
  modId: number | string;
  type: DependencyType;
}

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

  /** Game version (e.g., "1.20.1" for Minecraft) */
  game_version: string;

  /** List of compatible game versions (primarily for shaders/resourcepacks) */
  game_versions?: string[];

  /** Mod loader (forge, fabric, quilt, neoforge) - empty for games without mod loaders */
  loader: string;
  
  /** Which game this mod is for */
  gameType?: GameType;

  /** Content type: mod, resourcepack, or shader */
  content_type?: ModContentType;

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
  release_type?: ReleaseType;

  /** When the file was released */
  date_released?: string;

  /** When added to library */
  created_at: string;

  /** Original filename (for display/export) */
  filename: string;

  // ==================== SOURCE IDENTIFIERS ====================

  /** Source platform */
  source: ModSource;

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

  /** Mod categories (e.g., "Technology", "Magic") */
  categories?: string[];

  /** CurseForge category IDs for recommendation matching */
  cf_categories?: number[];

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

// ==================== MODPACK ====================

/** Remote source configuration for modpack collaboration/updates */
export interface ModpackRemoteSource {
  /** URL to the remote manifest JSON (e.g. GitHub Gist Raw URL) */
  url: string;
  /** Whether to automatically check for updates on startup */
  auto_check: boolean;
  /** Last time updates were checked */
  last_checked?: string;
  /** Skip initial auto-check (set after fresh import) */
  skip_initial_check?: boolean;
}

/** Gist publishing configuration for a modpack */
export interface ModpackGistConfig {
  /** GitHub Gist ID (if already published) */
  gist_id: string;
  /** Filename used in the Gist */
  filename: string;
  /** Whether the Gist is public */
  is_public: boolean;
  /** Last time the manifest was pushed to Gist */
  last_pushed?: string;
  /** The raw URL to the Gist file */
  raw_url?: string;
  /** The HTML URL to the Gist */
  html_url?: string;
}

/** Incompatible mod info (failed to import) */
export interface IncompatibleModInfo {
  cf_project_id: number;
  name: string;
  reason: string;
}

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

  /** Mod loader version */
  loader_version?: string;

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

  /** Disabled mod IDs */
  disabled_mod_ids?: string[];

  /** Locked mod IDs */
  locked_mod_ids?: string[];

  /** Per-mod notes */
  mod_notes?: Record<string, string>;

  /** Remote source configuration */
  remote_source?: ModpackRemoteSource;

  /** Gist publishing configuration */
  gist_config?: ModpackGistConfig;

  /** Mods that failed to import */
  incompatible_mods?: IncompatibleModInfo[];

  /** CurseForge project ID */
  cf_project_id?: number;

  /** CurseForge file ID */
  cf_file_id?: number;

  /** CurseForge modpack slug */
  cf_slug?: string;

  /** Path to saved overrides */
  overridesPath?: string;
}

// ==================== MODPACK CREATION ====================

export interface CreateModpackData {
  name: string;
  version?: string;
  minecraft_version?: string;
  loader?: string;
  loader_version?: string;
  description?: string;
}

// ==================== VERSION CONTROL ====================

export type ModpackChangeType = 
  | "add" 
  | "remove" 
  | "update" 
  | "enable" 
  | "disable" 
  | "version_control" 
  | "loader_change" 
  | "lock" 
  | "unlock" 
  | "note_add" 
  | "note_remove" 
  | "note_change";

export interface ModpackChange {
  type: ModpackChangeType;
  modId: string;
  modName: string;
  previousVersion?: string;
  newVersion?: string;
  previousFileId?: number;
  newFileId?: number;
  previousNote?: string;
  newNote?: string;
}

/** Snapshot of a mod for version rollback */
export interface ModSnapshot {
  id: string;
  name: string;
  version?: string;
  source: ModSource;
  cf_project_id?: number;
  cf_file_id?: number;
  mr_project_id?: string;
  mr_version_id?: string;
}

/** Config change in a version */
export interface ConfigChange {
  filePath: string;
  keyPath: string;
  line?: number;
  oldValue: unknown;
  newValue: unknown;
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
  loader?: string;
  loader_version?: string;
  parent_id?: string;
  mod_snapshots?: ModSnapshot[];
  config_snapshot_id?: string;
  config_changes?: ConfigChange[];
}

export interface ModpackVersionHistory {
  modpack_id: string;
  current_version_id: string;
  versions: ModpackVersion[];
}

// ==================== CURSEFORGE MANIFEST ====================

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

// ==================== MODEX MANIFEST ====================

export interface ModexManifestMod {
  id: string;
  name: string;
  version: string;
  filename: string;
  source: ModSource;
  content_type?: ModContentType;
  cf_project_id?: number;
  cf_file_id?: number;
  /** Alias for cf_project_id (backwards compatibility) */
  project_id?: number;
  /** Alias for cf_file_id (backwards compatibility) */
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
    cf_project_id?: number;
    cf_file_id?: number;
  };
  mods: ModexManifestMod[];
  disabled_mods?: string[];
  disabled_mods_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
  }>;
  locked_mods?: string[];
  locked_mods_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
  }>;
  mod_notes?: Record<string, string>;
  mod_notes_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
    note: string;
  }>;
  incompatible_mods?: IncompatibleModInfo[];
  stats: {
    mod_count: number;
    disabled_count?: number;
    locked_count?: number;
    notes_count?: number;
  };
  version_history?: ModpackVersionHistory;
}

// ==================== INSTANCE ====================

export interface InstanceSource {
  type: "curseforge" | "modrinth" | "local";
  projectId?: number;
  fileId?: number;
  name?: string;
  version?: string;
}

export interface InstanceMemory {
  min: number;
  max: number;
}

export type InstanceState = "ready" | "installing" | "error";

export interface ModexInstance {
  /** Unique instance ID */
  id: string;
  /** Display name */
  name: string;
  /** Instance description */
  description?: string;
  /** Minecraft version */
  minecraftVersion: string;
  /** Mod loader (forge, fabric, neoforge, quilt) */
  loader: string;
  /** Loader version */
  loaderVersion?: string;
  /** Path to instance directory */
  path: string;
  /** Associated modpack ID */
  modpackId?: string;
  /** Instance icon (emoji or path) */
  icon?: string;
  /** Total mods count */
  modCount?: number;
  /** Instance creation date */
  createdAt: string;
  /** Last played date */
  lastPlayed?: string;
  /** Total play time in minutes */
  playTime?: number;
  /** Instance state */
  state: InstanceState;
  /** Last time the instance was synced with modpack */
  lastSynced?: string;
  /** Memory allocation */
  memory?: InstanceMemory;
  /** Java arguments */
  javaArgs?: string;
  /** Source info */
  source?: InstanceSource;
}

// ==================== SYNC RESULTS ====================

export interface InstanceSyncResult {
  success: boolean;
  modsDownloaded: number;
  modsSkipped: number;
  configsCopied: number;
  configsSkipped: number;
  errors: string[];
  warnings: string[];
}

export type ConfigSyncMode = "overwrite" | "new_only" | "skip";

// ==================== RUNNING GAME ====================

export type GameStatus = "launching" | "loading_mods" | "running" | "stopped";

export interface RunningGameInfo {
  instanceId: string;
  launcherPid?: number;
  gamePid?: number;
  startTime: number;
  status: GameStatus;
  loadedMods: number;
  totalMods: number;
  currentMod?: string;
  gameProcessRunning: boolean;
}

// ==================== REMOTE UPDATE ====================

export interface RemoteModChange {
  type: "added" | "removed" | "updated" | "enabled" | "disabled" | "locked" | "unlocked" | "note_added" | "note_removed" | "note_changed";
  modId?: string;
  mod?: ModexManifestMod;
  oldVersion?: string;
  newVersion?: string;
  note?: string;
  oldNote?: string;
}

export interface RemoteUpdateResult {
  hasUpdates: boolean;
  remoteManifest?: ModexManifest;
  changes: {
    modsAdded: ModexManifestMod[];
    modsRemoved: Array<{ id: string; name: string }>;
    modsUpdated: Array<{ id: string; name: string; oldVersion?: string; newVersion?: string }>;
    modsEnabled: Array<{ id: string; name: string }>;
    modsDisabled: Array<{ id: string; name: string }>;
    modsLocked: Array<{ id: string; name: string }>;
    modsUnlocked: Array<{ id: string; name: string }>;
    notesAdded: Array<{ id: string; name: string; note: string }>;
    notesRemoved: Array<{ id: string; name: string }>;
    notesChanged: Array<{ id: string; name: string; oldNote: string; newNote: string }>;
    loaderChanged?: { oldLoader?: string; newLoader?: string; oldVersion?: string; newVersion?: string };
    versionHistoryChanged?: boolean;
  };
  localChecksum?: string;
  remoteChecksum?: string;
  error?: string;
}

// ==================== UTILITY TYPES ====================

/**
 * Helper type to convert CurseForge content type to internal content type
 */
export function cfContentTypeToInternal(cfType: CurseForgeContentType): ModContentType {
  const map: Record<CurseForgeContentType, ModContentType> = {
    mods: "mod",
    resourcepacks: "resourcepack",
    shaders: "shader",
    modpacks: "mod" // modpacks default to mods
  };
  return map[cfType];
}

/**
 * Convert internal content type to CurseForge content type
 */
export function internalToCfContentType(internalType: ModContentType): CurseForgeContentType {
  const map: Record<ModContentType, CurseForgeContentType> = {
    mod: "mods",
    resourcepack: "resourcepacks",
    shader: "shaders"
  };
  return map[internalType];
}
