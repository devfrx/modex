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

  /** List of compatible Minecraft versions (primarily for shaders/resourcepacks) */
  game_versions?: string[];

  /** Mod loader (forge, fabric, quilt, neoforge) */
  loader: string;

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

  /** Remote source configuration for collaboration/updates */
  remote_source?: {
    /** URL to the remote manifest JSON (e.g. GitHub Gist Raw URL) */
    url: string;
    /** Whether to automatically check for updates on startup */
    auto_check: boolean;
    /** Last time updates were checked */
    last_checked?: string;
  };

  /** Saved configuration profiles (sets of enabled mods) */
  profiles?: ModpackProfile[];
  
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

export interface ModpackProfile {
  id: string;
  name: string;
  enabled_mod_ids: string[];
  created_at: string;
  /** Optional: config overrides specific to this profile */
  config_overrides_path?: string;
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
  modex_version: "2.1" | "2.0"; // 2.1 is current, 2.0 for backwards compatibility
  share_code: string;
  checksum: string;
  /** Checksum captured at the start of import for conflict detection */
  import_checksum?: string;
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
  type: "add" | "remove" | "update" | "enable" | "disable" | "version_control";
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
  /** ID of the config snapshot for this version */
  config_snapshot_id?: string;
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
