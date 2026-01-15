/**
 * ModEx Types - Metadata-Only Architecture
 *
 * Mods are stored as API references (CurseForge/Modrinth IDs) without local files.
 * This enables lightweight storage and native export to modpack formats.
 */

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

  /** Game version (e.g., "1.20.1" for Minecraft) - kept as game_version for backwards compatibility */
  game_version: string;

  /** List of compatible game versions (primarily for shaders/resourcepacks) */
  game_versions?: string[];

  /** Mod loader (forge, fabric, quilt, neoforge) - empty for games without mod loaders */
  loader: string;
  
  /** Which game this mod is for */
  gameType?: GameType;

  /** Content type: mod, resourcepack, or shader */
  content_type?: "mod" | "resourcepack" | "shader";

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

  /** Mod loader version (e.g., "47.2.0" for Forge, "0.14.21" for Fabric) */
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

  /** Disabled mod IDs (mods that are in the pack but temporarily disabled) */
  disabled_mod_ids?: string[];

  /** Locked mod IDs (mods that cannot be updated, removed, or modified) */
  locked_mod_ids?: string[];

  /** Per-mod notes (maps mod ID to note text) */
  mod_notes?: Record<string, string>;

  /** Remote source configuration for collaboration/updates */
  remote_source?: {
    /** URL to the remote manifest JSON (e.g. GitHub Gist Raw URL) */
    url: string;
    /** Whether to automatically check for updates on startup */
    auto_check: boolean;
    /** Last time updates were checked */
    last_checked?: string;
    /** Skip initial auto-check (set after fresh import) */
    skip_initial_check?: boolean;
  };

  /** Gist publishing configuration for this modpack */
  gist_config?: {
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
  };

  /** Mods that failed to import due to incompatibility */
  incompatible_mods?: Array<{
    cf_project_id: number;
    name: string;
    reason: string;
  }>;

  // CurseForge source tracking for imported modpacks
  /** CurseForge project ID (if imported from CF) */
  cf_project_id?: number;
  /** CurseForge file ID (specific version imported) */
  cf_file_id?: number;
  /** CurseForge modpack slug */
  cf_slug?: string;
  /** Path to saved overrides (config files, scripts, etc.) for this modpack */
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
  modex_version: "2.1" | "2.0"; // 2.1 is current, 2.0 for backwards compatibility
  share_code: string;
  checksum: string;
  /** Checksum captured at the start of import for conflict detection */
  import_checksum?: string;
  /** Hash of version history for detecting version control changes */
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
  /** Internal mod IDs of disabled mods (for backwards compatibility) */
  disabled_mods?: string[];
  /** Disabled mods by project ID (stable cross-import identifiers) */
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
  /** Mod notes (maps internal mod ID to note text) */
  mod_notes?: Record<string, string>;
  /** Mod notes by project ID (stable cross-import identifiers) */
  mod_notes_by_project?: Array<{
    cf_project_id?: number;
    mr_project_id?: string;
    name: string;
    note: string;
  }>;
  /** Version control history (optional, included if modpack has versions) */
  version_history?: ModpackVersionHistory;
}

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

// ==================== UPDATE INFO ====================

export interface ModUpdateInfo {
  modId: string;
  projectId: string | null;
  projectName: string;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  source: "curseforge" | "modrinth" | "unknown" | string;
  updateUrl: string | null;
  /** New file ID to update to (CurseForge) */
  newFileId?: number;
  /** New version ID to update to (Modrinth) */
  newVersionId?: string;
  /** Release date of the new version */
  releaseDate?: string | number;
  /** Changelog for the update */
  changelog?: string | null;
}

// ==================== REMOTE UPDATE RESULT ====================

/** Structured changes from remote update check (returned by backend) */
export interface RemoteUpdateChanges {
  added: number;
  removed: number;
  updated: number;
  addedMods: Array<{ name: string; version: string }>;
  removedMods: string[];
  updatedMods: string[];
  enabledMods: string[];
  disabledMods: string[];
  lockedMods: string[];
  unlockedMods: string[];
  notesAdded: Array<{ modName: string; note: string }>;
  notesRemoved: Array<{ modName: string; note: string }>;
  notesChanged: Array<{ modName: string; oldNote: string; newNote: string }>;
  hasVersionHistoryChanges: boolean;
  loaderChanged?: { from?: string; to?: string };
  loaderVersionChanged?: { from?: string; to?: string };
  minecraftVersionChanged?: { from?: string; to?: string };
}

/** Result of checking for remote updates from a Gist or remote manifest (backend) */
export interface RemoteUpdateResult {
  hasUpdate: boolean;
  /** Changes structured object from backend analysis */
  changes?: RemoteUpdateChanges;
  remoteManifest?: ModexManifest;
  error?: string;
}

/** Frontend-specific update result with pre-computed changes array for UI display */
export interface FrontendUpdateResult {
  hasUpdate: boolean;
  /** Changes array computed from RemoteUpdateChanges for UI display */
  changes: ModpackChange[];
  remoteManifest?: ModexManifest;
  error?: string;
}

// ==================== VERSION CONTROL ====================

/** A single change in a modpack version */
export interface ModpackChange {
  type: "add" | "remove" | "update" | "enable" | "disable" | "lock" | "unlock" | "version_control" | "loader_change" | "note_add" | "note_remove" | "note_change";
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
  /** For note changes: previous note text */
  previousNote?: string;
  /** For note changes: new note text */
  newNote?: string;
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
  /** Snapshot of locked mod IDs at this version */
  locked_mod_ids?: string[];
  /** Snapshot of mod notes at this version */
  mod_notes?: Record<string, string>;
  /** Loader type at this version (forge, fabric, etc.) */
  loader?: string;
  /** Loader version at this version */
  loader_version?: string;
  /** Parent version ID (for branching support in the future) */
  parent_id?: string;
  /** Snapshots of CF mods for rollback restoration */
  mod_snapshots?: Array<{
    id: string;
    name: string;
    version?: string;
    cf_project_id: number;
    cf_file_id: number;
  }>;
  /** ID of the config snapshot for this version */
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
  /** Gist publishing settings */
  gistSettings?: {
    /** Default manifest mode when publishing to Gist: 'full' includes version history, 'current' only latest */
    defaultManifestMode?: "full" | "current";
  };
  theme?: "light" | "dark" | "system";
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
  };
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

// ==================== MINECRAFT INSTALLATIONS ====================

export interface MinecraftInstallation {
  id: string;
  name: string;
  type: "vanilla" | "prism" | "multimc" | "curseforge" | "atlauncher" | "gdlauncher" | "modrinth" | "custom";
  path: string;
  modsPath: string;
  version?: string;
  loader?: string;
  lastUsed?: string;
  isDefault?: boolean;
  icon?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
  syncedMods: string[];
}

// ==================== MODPACK PREVIEW/ANALYSIS ====================

export interface ModpackAnalysis {
  estimatedRamMin: number;
  estimatedRamRecommended: number;
  estimatedRamMax: number;
  performanceImpact: number;
  loadTimeImpact: number;
  storageImpact: number;
  modCategories: Record<string, number>;
  warnings: string[];
  recommendations: string[];
  compatibilityScore: number;
  compatibilityNotes: string[];
}

export interface ModpackPreview {
  name: string;
  version: string;
  author?: string;
  description?: string;
  minecraftVersion: string;
  modLoader: string;
  modLoaderVersion?: string;
  modCount: number;
  mods: Array<{
    projectId: number;
    fileId: number;
    name?: string;
    required: boolean;
  }>;
  resourcePackCount: number;
  shaderCount: number;
  analysis: ModpackAnalysis;
  source: "curseforge" | "modrinth" | "modex" | "zip" | "unknown";
  cfProjectId?: number;
  cfFileId?: number;
  mrProjectId?: string;
  overridesCount: number;
  configFilesCount: number;
  totalSize?: number;
}

// ==================== IMAGE CACHE ====================

export interface CacheStats {
  totalSize: number;
  entryCount: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

// ==================== LIBRARY PAGINATION ====================

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LibraryFilters {
  search: string;
  loader: string;
  gameVersion: string;
  contentType: "all" | "mod" | "resourcepack" | "shader";
  sortBy: "name" | "created_at" | "download_count" | "author";
  sortDir: "asc" | "desc";
  favorites: boolean;
  folderId?: string;
}

// ==================== MODEX INSTANCES ====================

/** Isolated game instance managed by ModEx */
export interface ModexInstance {
  /** Unique instance ID */
  id: string;

  /** Display name */
  name: string;

  /** Instance description */
  description?: string;

  /** Minecraft version (e.g., "1.20.1") */
  minecraftVersion: string;

  /** Mod loader (forge, fabric, neoforge, quilt) */
  loader: string;

  /** Loader version (e.g., "47.2.0" for Forge) */
  loaderVersion?: string;

  /** Path to instance directory */
  path: string;

  /** Associated modpack ID (if created from modpack) */
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
  state: "ready" | "installing" | "error";

  /** Memory allocation in MB */
  memory?: {
    min: number;
    max: number;
  };

  /** Java arguments */
  javaArgs?: string;

  /** CurseForge/Modrinth source info */
  source?: {
    type: "curseforge" | "modrinth" | "local";
    projectId?: number;
    fileId?: number;
    name?: string;
    version?: string;
  };
}

/** Config sync mode options */
export type ConfigSyncMode = "overwrite" | "new_only" | "skip";

/** Result of syncing mods to an instance */
export interface InstanceSyncResult {
  success: boolean;
  modsDownloaded: number;
  modsSkipped: number;
  configsCopied: number;
  configsSkipped: number;
  errors: string[];
  warnings: string[];
}

/** Result of launching an instance */
export interface InstanceLaunchResult {
  success: boolean;
  error?: string;
}

/** Instance statistics */
export interface InstanceStats {
  modCount: number;
  configCount: number;
  totalSize: string;
  folders: Array<{ name: string; count: number }>;
}

// ==================== CONFIG MANAGEMENT TYPES ====================

/** Config file type based on extension */
export type ConfigType =
  | "toml"       // Most common for Forge mods
  | "json"       // JSON configs
  | "json5"      // JSON5 configs
  | "properties" // Properties files
  | "cfg"        // Old CFG format
  | "yaml"       // YAML configs
  | "txt"        // Plain text
  | "snbt"       // Stringified NBT (KubeJS, etc.)
  | "unknown";

/** Individual config file info */
export interface ConfigFile {
  /** Relative path from instance root */
  path: string;
  /** File name */
  name: string;
  /** File extension */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: string;
  /** Config type based on extension */
  type: ConfigType;
  /** Parent folder */
  folder: string;
  /** Associated mod (if detectable from folder/filename) */
  modId?: string;
}

/** Config folder with contents */
export interface ConfigFolder {
  /** Folder path relative to instance */
  path: string;
  /** Folder name */
  name: string;
  /** Number of config files */
  fileCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Subfolders */
  subfolders: ConfigFolder[];
  /** Files in this folder */
  files: ConfigFile[];
}

/** Content of a config file */
export interface ConfigContent {
  /** The raw content of the file */
  content: string;
  /** Parsed content (if parseable) */
  parsed?: any;
  /** File encoding */
  encoding: string;
  /** Parse errors if any */
  parseError?: string;
}

/** Config export manifest */
export interface ConfigExport {
  /** Export timestamp */
  exportedAt: string;
  /** Source instance ID */
  sourceInstanceId: string;
  /** Source instance name */
  sourceInstanceName: string;
  /** Modpack ID if linked */
  modpackId?: string;
  /** Included config folders */
  folders: string[];
  /** Total files */
  fileCount: number;
}

/** Config backup info */
export interface ConfigBackup {
  /** Full path to backup file */
  path: string;
  /** Backup date */
  date: string;
  /** Backup size in bytes */
  size: number;
}

/** Config comparison result */
export interface ConfigComparison {
  /** Files only in first instance */
  onlyInFirst: string[];
  /** Files only in second instance */
  onlyInSecond: string[];
  /** Files that are different */
  different: string[];
  /** Files that are identical */
  identical: string[];
}

// ==================== STRUCTURED CONFIG EDITOR ====================

/** A parsed config entry (key-value pair) */
export interface ConfigEntry {
  /** Unique key path (e.g., "general.enableFeature" or "[section].key") */
  keyPath: string;
  /** Display key name */
  key: string;
  /** Current value */
  value: any;
  /** Original value (for tracking changes) */
  originalValue: any;
  /** Value type */
  type: "string" | "number" | "boolean" | "array" | "object" | "null";
  /** Comment above or inline */
  comment?: string;
  /** Section/category this belongs to */
  section?: string;
  /** Nesting depth */
  depth: number;
  /** Has been modified */
  modified: boolean;
  /** Line number in original file */
  line?: number;
}

/** A section in the config file */
export interface ConfigSection {
  /** Section name/path */
  name: string;
  /** Display name */
  displayName: string;
  /** Section comment */
  comment?: string;
  /** Entries in this section */
  entries: ConfigEntry[];
  /** Subsections */
  subsections: ConfigSection[];
  /** Is expanded in UI */
  expanded: boolean;
}

/** Parsed config file structure */
export interface ParsedConfig {
  /** File path */
  path: string;
  /** File type */
  type: ConfigType;
  /** Root sections */
  sections: ConfigSection[];
  /** Flat list of all entries */
  allEntries: ConfigEntry[];
  /** Parse errors if any */
  errors: string[];
  /** Raw content for fallback */
  rawContent: string;
  /** File encoding */
  encoding: string;
}

/** Config modification record for version control */
export interface ConfigModification {
  /** Unique ID */
  id: string;
  /** File path */
  filePath: string;
  /** Key path that was modified */
  keyPath: string;
  /** Line number in file */
  line?: number;
  /** Old value */
  oldValue: any;
  /** New value */
  newValue: any;
  /** Timestamp */
  timestamp: string;
  /** Optional description */
  description?: string;
}

/** Config change set for version control */
export interface ConfigChangeSet {
  /** Change set ID */
  id: string;
  /** Instance ID */
  instanceId: string;
  /** Modpack ID */
  modpackId: string;
  /** List of modifications */
  modifications: ConfigModification[];
  /** When created */
  createdAt: string;
  /** Description */
  description?: string;
  /** Applied to version control */
  committed: boolean;
}

// ==================== HYTALE TYPES ====================

/** Hytale mod configuration */
export interface HytaleMod {
  /** Unique ID for ModEx (matches library mod ID format: "cf-file-{fileId}" or "hytale-{name}") */
  id: string;
  
  /** Hytale's internal mod ID (e.g., "JarHax:EyeSpy") - used in config.json */
  hytaleModId?: string;
  
  /** Display name */
  name: string;
  
  /** File or folder name in mods folder (JAR file or folder name) */
  folderName: string;
  
  /** Mod version */
  version: string;
  
  /** CurseForge project ID */
  cfProjectId?: number;
  
  /** CurseForge file ID */
  cfFileId?: number;
  
  /** Logo URL from CurseForge */
  logoUrl?: string;
  
  /** Whether the mod exists in global mods folder */
  isInstalled: boolean;
  
  /** Whether the mod is disabled (.disabled extension or config.json) */
  isDisabled: boolean;
  
  /** File/folder size in bytes */
  folderSize?: number;
  
  /** Installation timestamp */
  installedAt?: string;
  
  /** Mod author (from mod.json if available) */
  author?: string;
  
  /** Mod description (from mod.json if available) */
  description?: string;
}

/** Single mod entry in a Hytale modpack */
export interface HytaleModpackEntry {
  /** ModEx ID (cf-file-xxx or hytale-xxx) */
  modId: string;
  
  /** Hytale's internal mod ID (e.g., "JarHax:EyeSpy") for config.json */
  hytaleModId?: string;
  
  /** Display name for UI */
  name: string;
  
  /** Whether this mod should be enabled when modpack is activated */
  enabled: boolean;
  
  /** File name in mods folder (for fallback matching) */
  fileName: string;
  
  /** Version at time of saving */
  version?: string;
}

/** Hytale virtual modpack - a saved configuration of mods */
export interface HytaleModpack {
  /** Unique ID */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Description */
  description?: string;
  
  /** Cover image URL or path */
  imageUrl?: string;
  
  /** 
   * List of mod entries with full metadata.
   * Each entry contains the mod ID, name, and enabled state.
   */
  mods: HytaleModpackEntry[];
  
  /** 
   * @deprecated Legacy field - map of filenames to enabled state.
   * Kept for backward compatibility with older modpacks.
   */
  modStates?: Record<string, boolean>;
  
  /** 
   * @deprecated Legacy field - list of enabled mod IDs
   */
  modIds?: string[];
  
  /** 
   * @deprecated Legacy field - list of disabled mod IDs  
   */
  disabledModIds?: string[];
  
  /** Creation timestamp */
  createdAt: string;
  
  /** Last updated timestamp */
  updatedAt: string;
  
  /** Last activated timestamp */
  lastActivated?: string;
  
  /** Whether this is the currently active modpack */
  isActive: boolean;
}

/** Sync result for Hytale mods */
export interface HytaleSyncResult {
  success: boolean;
  installed: number;
  removed: number;
  disabled: number;
  enabled: number;
  errors: string[];
  /** Mods in modpack that are not installed in the folder */
  missingMods?: string[];
  /** Mods in folder that are not tracked by the modpack */
  newMods?: string[];
}

/** Hytale stats */
export interface HytaleStats {
  totalMods: number;
  enabledMods: number;
  disabledMods: number;
  totalSize: number;
  modpackCount: number;
}

/** Hytale world/save with mod configuration */
export interface HytaleWorld {
  id: string;
  name: string;
  path: string;
  /** Path to the mods folder within this save */
  modsPath: string;
  lastPlayed?: string;
  /** Mod IDs enabled in config.json */
  enabledMods: string[];
  /** Mod IDs disabled in config.json */
  disabledMods: string[];
  /** Mod data folders present in this save's mods folder */
  modDataFolders: string[];
}
