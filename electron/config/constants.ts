/**
 * Application Constants and Configuration
 * 
 * Centralized location for all configurable values and constants.
 * These can be overridden via environment variables or config files.
 */

// ==================== TIMING CONSTANTS ====================

/** Lock timeout for file operations (ms) */
export const FILE_LOCK_TIMEOUT = Number(process.env.MODEX_FILE_LOCK_TIMEOUT) || 30_000;

/** Lock timeout for modpack operations (ms) */
export const MODPACK_LOCK_TIMEOUT = Number(process.env.MODEX_MODPACK_LOCK_TIMEOUT) || 60_000;

/** Default API request timeout (ms) */
export const API_TIMEOUT = Number(process.env.MODEX_API_TIMEOUT) || 30_000;

/** Download timeout (ms) */
export const DOWNLOAD_TIMEOUT = Number(process.env.MODEX_DOWNLOAD_TIMEOUT) || 120_000;

/** Cache TTL for API responses (ms) */
export const API_CACHE_TTL = Number(process.env.MODEX_API_CACHE_TTL) || 5 * 60 * 1000;

/** Debounce time for file saves (ms) */
export const SAVE_DEBOUNCE_TIME = Number(process.env.MODEX_SAVE_DEBOUNCE) || 500;

// ==================== RETRY CONFIGURATION ====================

/** Default retry count for failed operations */
export const DEFAULT_RETRY_COUNT = Number(process.env.MODEX_RETRY_COUNT) || 3;

/** Default retry delay (ms) */
export const DEFAULT_RETRY_DELAY = Number(process.env.MODEX_RETRY_DELAY) || 1000;

/** Maximum retry delay with exponential backoff (ms) */
export const MAX_RETRY_DELAY = Number(process.env.MODEX_MAX_RETRY_DELAY) || 30_000;

// ==================== RATE LIMITING ====================

/** CurseForge API rate limit (requests per minute) */
export const CURSEFORGE_RATE_LIMIT = Number(process.env.MODEX_CF_RATE_LIMIT) || 120;

/** Gist API rate limit (requests per hour) */
export const GIST_RATE_LIMIT = Number(process.env.MODEX_GIST_RATE_LIMIT) || 30;

// ==================== DOWNLOAD CONFIGURATION ====================

/** Maximum concurrent downloads */
export const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MODEX_MAX_DOWNLOADS) || 5;

/** Chunk size for large file downloads (bytes) */
export const DOWNLOAD_CHUNK_SIZE = Number(process.env.MODEX_CHUNK_SIZE) || 1024 * 1024;

// ==================== CACHE CONFIGURATION ====================

/** Maximum image cache size (bytes) - default 100MB */
export const IMAGE_CACHE_MAX_SIZE = Number(process.env.MODEX_IMAGE_CACHE_SIZE) || 100 * 1024 * 1024;

/** Image cache max age (days) */
export const IMAGE_CACHE_MAX_AGE = Number(process.env.MODEX_IMAGE_CACHE_DAYS) || 30;

/** Maximum memory cache entries */
export const MEMORY_CACHE_MAX_ENTRIES = Number(process.env.MODEX_MEMORY_CACHE) || 100;

// ==================== CURSEFORGE CONSTANTS ====================

/** CurseForge API base URL */
export const CURSEFORGE_API_URL = process.env.MODEX_CF_API_URL || "https://api.curseforge.com/v1";

/** Minecraft Game ID on CurseForge */
export const CF_MINECRAFT_GAME_ID = 432;

/** Hytale Game ID on CurseForge */
export const CF_HYTALE_GAME_ID = 79630;

/** Mods class ID on CurseForge */
export const CF_MODS_CLASS_ID = 6;

/** Resource Packs class ID on CurseForge */
export const CF_RESOURCEPACKS_CLASS_ID = 12;

/** Shaders class ID on CurseForge */
export const CF_SHADERS_CLASS_ID = 6552;

/** Modpacks class ID on CurseForge */
export const CF_MODPACKS_CLASS_ID = 4471;

// ==================== FILE SYSTEM CONSTANTS ====================

/** Maximum file path length */
export const MAX_PATH_LENGTH = 4096;

/** Maximum file name length */
export const MAX_FILENAME_LENGTH = 255;

/** Allowed mod file extensions */
export const MOD_FILE_EXTENSIONS = [".jar", ".zip", ".disabled"] as const;

/** Config file extensions */
export const CONFIG_EXTENSIONS = [
  ".toml",
  ".json",
  ".json5",
  ".properties",
  ".cfg",
  ".yaml",
  ".yml",
  ".txt",
  ".snbt",
] as const;

// ==================== PAGINATION DEFAULTS ====================

/** Default page size for library */
export const DEFAULT_PAGE_SIZE = Number(process.env.MODEX_PAGE_SIZE) || 50;

/** Maximum page size */
export const MAX_PAGE_SIZE = 100;

// ==================== VALIDATION LIMITS ====================

/** Maximum modpack name length */
export const MAX_MODPACK_NAME_LENGTH = 128;

/** Maximum mod note length */
export const MAX_MOD_NOTE_LENGTH = 1000;

/** Maximum description length */
export const MAX_DESCRIPTION_LENGTH = 5000;

/** Maximum mods per modpack (soft limit) */
export const MAX_MODS_PER_MODPACK = 1000;

// ==================== MINECRAFT PATHS ====================

/** Default Minecraft directory name */
export const MINECRAFT_DIR_NAME = ".minecraft";

/** Mods folder name */
export const MODS_FOLDER = "mods";

/** Config folder name */
export const CONFIG_FOLDER = "config";

/** Resource packs folder name */
export const RESOURCEPACKS_FOLDER = "resourcepacks";

/** Shader packs folder name */
export const SHADERPACKS_FOLDER = "shaderpacks";

// ==================== HELPER FUNCTIONS ====================

/**
 * Get configuration value with fallback
 */
export function getConfigValue<T>(
  envVar: string,
  defaultValue: T,
  parser: (value: string) => T = (v) => v as unknown as T
): T {
  const value = process.env[envVar];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  try {
    return parser(value);
  } catch {
    return defaultValue;
  }
}

/**
 * Validate and clamp a numeric config value
 */
export function clampConfigValue(
  value: number,
  min: number,
  max: number
): number {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
