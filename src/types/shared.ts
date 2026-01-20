/**
 * Re-export shared types for backwards compatibility
 * 
 * Components that import from @/types will still work.
 * New code should import directly from @shared/types.
 */

// Re-export all shared types
export * from "../../shared/types";

// Import specific types for use in this file
import type {
  Mod as SharedMod,
  Modpack as SharedModpack,
  ModexInstance as SharedModexInstance,
  InstanceSyncResult as SharedInstanceSyncResult,
  ConfigSyncMode as SharedConfigSyncMode,
  RunningGameInfo as SharedRunningGameInfo,
  ModpackVersion as SharedModpackVersion,
  ModpackVersionHistory as SharedModpackVersionHistory,
  ModpackChange as SharedModpackChange,
  CFManifest as SharedCFManifest,
  ModexManifest as SharedModexManifest,
  RemoteUpdateResult as SharedRemoteUpdateResult,
  ConfigChange,
  ModSnapshot,
  ModexManifestMod,
  CFManifestFile,
} from "../../shared/types";

// Re-export with original names for backwards compatibility
export type Mod = SharedMod;
export type Modpack = SharedModpack;
export type ModexInstance = SharedModexInstance;
export type InstanceSyncResult = SharedInstanceSyncResult;
export type ConfigSyncMode = SharedConfigSyncMode;
export type RunningGameInfo = SharedRunningGameInfo;
export type ModpackVersion = SharedModpackVersion;
export type ModpackVersionHistory = SharedModpackVersionHistory;
export type ModpackChange = SharedModpackChange;
export type CFManifest = SharedCFManifest;
export type ModexManifest = SharedModexManifest;
export type RemoteUpdateResult = SharedRemoteUpdateResult;

// ==================== ADDITIONAL FRONTEND-SPECIFIC TYPES ====================

/** Extended modpack with UI-specific fields */
export interface ModpackWithUI extends SharedModpack {
  /** Computed mod count for display */
  modCount: number;
  /** Whether there are unsaved changes */
  hasUnsavedChanges?: boolean;
  /** Cloud sync status */
  cloudStatus?: "published" | "subscribed" | "error" | null;
}

/** CurseForge Mod Loader info from API */
export interface CFModLoader {
  name: string;
  gameVersion: string;
  latest: boolean;
  recommended: boolean;
  dateModified: string;
  type: number;
}

/** Update check result for a single mod */
export interface ModUpdateInfo {
  id: number;
  displayName?: string;
  fileName?: string;
}

/** Frontend-specific remote update result with additional UI data */
export interface FrontendUpdateResult extends SharedRemoteUpdateResult {
  /** Timestamp of when check was performed */
  checkedAt?: string;
}

// ==================== CONFIG TYPES ====================

/** Application configuration */
export interface AppConfig {
  curseforge_api_key?: string;
  instanceSync?: InstanceSyncSettings;
  gistSettings?: GistSettings;
}

/** Instance sync settings */
export interface InstanceSyncSettings {
  autoSyncBeforeLaunch?: boolean;
  autoImportConfigsAfterGame?: boolean;
  showSyncConfirmation?: boolean;
  defaultConfigSyncMode?: SharedConfigSyncMode;
  instantSync?: boolean;
}

/** Gist publishing settings */
export interface GistSettings {
  defaultManifestMode?: "full" | "current";
}

// ==================== CONFIG FILE TYPES ====================

/** Config file for structured editing */
export interface ConfigFile {
  path: string;
  name: string;
  type: "toml" | "json" | "properties" | "cfg" | "yaml" | "unknown";
  size: number;
  modifiedAt: string;
  parsed?: unknown;
}

/** Config folder structure */
export interface ConfigFolder {
  path: string;
  name: string;
  children: Array<ConfigFile | ConfigFolder>;
}

/** Config file content */
export interface ConfigContent {
  path: string;
  content: string;
  type: ConfigFile["type"];
  parsed?: Record<string, unknown>;
}

/** Config export data */
export interface ConfigExport {
  modpackId: string;
  modpackName: string;
  exportedAt: string;
  files: Array<{
    path: string;
    content: string;
  }>;
}

/** Config entry for structured editing */
export interface ConfigEntry {
  key: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "array" | "object" | "null";
  originalValue: unknown;
  modified: boolean;
  path: string[];
  comment?: string;
  line?: number;
}

/** Config change tracking */
export interface ConfigChangeInfo {
  filePath: string;
  keyPath: string;
  line?: number;
  oldValue: unknown;
  newValue: unknown;
}

// ==================== LIBRARY VERIFICATION TYPES ====================

/** Library verification result */
export interface LibraryVerification {
  name: string;
  path: string;
  exists: boolean;
  size?: number;
  sha1Valid?: boolean;
  expectedSha1?: string;
  actualSha1?: string;
}

/** Mod loader verification result */
export interface ModLoaderVerificationResult {
  isValid: boolean;
  loader: "fabric" | "forge" | "neoforge" | "quilt" | "vanilla";
  loaderVersion: string;
  minecraftVersion: string;
  versionJsonValid: boolean;
  versionJsonPath: string;
  totalLibraries: number;
  validLibraries: number;
  invalidLibraries: LibraryVerification[];
  missingLibraries: LibraryVerification[];
  baseVersionInstalled: boolean;
  errors: string[];
  warnings: string[];
  canRepair: boolean;
}

/** Mod loader repair result */
export interface ModLoaderRepairResult {
  success: boolean;
  librariesRepaired: number;
  librariesFailed: number;
  errors: string[];
  fullReinstall: boolean;
}

// ==================== HYTALE TYPES ====================

/** Hytale mod entry */
export interface HytaleMod {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  thumbnail_url?: string;
  filename: string;
  enabled: boolean;
  source: "curseforge" | "local";
  cf_project_id?: number;
  cf_file_id?: number;
  created_at: string;
}

/** Hytale modpack */
export interface HytaleModpack {
  id: string;
  name: string;
  description?: string;
  mod_ids: string[];
  disabled_mod_ids?: string[];
  created_at: string;
  updated_at?: string;
}

/** Hytale sync result */
export interface HytaleSyncResult {
  success: boolean;
  modsInstalled: number;
  modsRemoved: number;
  errors: string[];
}
