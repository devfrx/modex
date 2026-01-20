/**
 * CurseForge API Type Definitions
 * 
 * Based on CurseForge API v1 documentation
 * https://docs.curseforge.com/
 */

// ==================== ENUMS ====================

export enum ModLoaderType {
  Any = 0,
  Forge = 1,
  Cauldron = 2,
  LiteLoader = 3,
  Fabric = 4,
  Quilt = 5,
  NeoForge = 6,
}

export enum FileReleaseType {
  Release = 1,
  Beta = 2,
  Alpha = 3,
}

export enum FileStatus {
  Processing = 1,
  ChangesRequired = 2,
  UnderReview = 3,
  Approved = 4,
  Rejected = 5,
  MalwareDetected = 6,
  Deleted = 7,
  Archived = 8,
  Testing = 9,
  Released = 10,
  ReadyForReview = 11,
  Deprecated = 12,
  Baking = 13,
  AwaitingPublishing = 14,
  FailedPublishing = 15,
}

export enum DependencyType {
  EmbeddedLibrary = 1,
  OptionalDependency = 2,
  RequiredDependency = 3,
  Tool = 4,
  Incompatible = 5,
  Include = 6,
}

export enum ModStatus {
  New = 1,
  ChangesRequired = 2,
  UnderSoftReview = 3,
  Approved = 4,
  Rejected = 5,
  ChangesMade = 6,
  Inactive = 7,
  Abandoned = 8,
  Deleted = 9,
  UnderReview = 10,
}

// ==================== CORE TYPES ====================

export interface CFCategory {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  url: string;
  iconUrl: string;
  dateModified: string;
  isClass?: boolean;
  classId?: number;
  parentCategoryId?: number;
  displayIndex?: number;
}

export interface CFModAsset {
  id: number;
  modId: number;
  title: string;
  description: string;
  thumbnailUrl: string;
  url: string;
}

export interface CFModAuthor {
  id: number;
  name: string;
  url: string;
}

export interface CFModLinks {
  websiteUrl?: string;
  wikiUrl?: string;
  issuesUrl?: string;
  sourceUrl?: string;
}

export interface CFFileIndex {
  gameVersion: string;
  fileId: number;
  filename: string;
  releaseType: FileReleaseType;
  gameVersionTypeId?: number;
  modLoader?: ModLoaderType;
}

export interface CFFileDependency {
  modId: number;
  relationType: DependencyType;
}

export interface CFFileModule {
  name: string;
  fingerprint: number;
}

export interface CFSortableGameVersion {
  gameVersionName: string;
  gameVersionPadded: string;
  gameVersion: string;
  gameVersionReleaseDate: string;
  gameVersionTypeId?: number;
}

export interface CFFileHash {
  value: string;
  algo: number; // 1 = Sha1, 2 = Md5
}

export interface CFFile {
  id: number;
  gameId: number;
  modId: number;
  isAvailable: boolean;
  displayName: string;
  fileName: string;
  releaseType: FileReleaseType;
  fileStatus: FileStatus;
  hashes: CFFileHash[];
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  fileSizeOnDisk?: number;
  downloadUrl?: string;
  gameVersions: string[];
  sortableGameVersions: CFSortableGameVersion[];
  dependencies: CFFileDependency[];
  exposeAsAlternative?: boolean;
  parentProjectFileId?: number;
  alternateFileId?: number;
  isServerPack?: boolean;
  serverPackFileId?: number;
  isEarlyAccessContent?: boolean;
  earlyAccessEndDate?: string;
  fileFingerprint: number;
  modules: CFFileModule[];
}

export interface CFMod {
  id: number;
  gameId: number;
  name: string;
  slug: string;
  links: CFModLinks;
  summary: string;
  status: ModStatus;
  downloadCount: number;
  isFeatured: boolean;
  primaryCategoryId: number;
  categories: CFCategory[];
  classId?: number;
  authors: CFModAuthor[];
  logo?: {
    id: number;
    modId: number;
    title: string;
    description: string;
    thumbnailUrl: string;
    url: string;
  };
  screenshots: CFModAsset[];
  mainFileId: number;
  latestFiles: CFFile[];
  latestFilesIndexes: CFFileIndex[];
  latestEarlyAccessFilesIndexes?: CFFileIndex[];
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
  allowModDistribution?: boolean;
  gamePopularityRank: number;
  isAvailable: boolean;
  thumbsUpCount: number;
  rating?: number;
}

// ==================== API RESPONSES ====================

export interface CFPagination {
  index: number;
  pageSize: number;
  resultCount: number;
  totalCount: number;
}

export interface CFApiResponse<T> {
  data: T;
  pagination?: CFPagination;
}

export interface CFSearchModsResponse {
  data: CFMod[];
  pagination: CFPagination;
}

export interface CFGetModResponse {
  data: CFMod;
}

export interface CFGetModsResponse {
  data: CFMod[];
}

export interface CFGetFilesResponse {
  data: CFFile[];
}

export interface CFGetFileResponse {
  data: CFFile;
}

export interface CFGetVersionsResponse {
  data: Array<{
    type: number;
    versions: string[];
  }>;
}

export interface CFModLoaderVersion {
  name: string;
  gameVersion: string;
  latest: boolean;
  recommended: boolean;
  dateModified: string;
  type: ModLoaderType;
}

export interface CFGetModLoadersResponse {
  data: CFModLoaderVersion[];
}

export interface CFGetCategoriesResponse {
  data: CFCategory[];
}

export interface CFClass {
  id: number;
  name: string;
  slug: string;
}

// ==================== SEARCH PARAMETERS ====================

export interface CFSearchModsParams {
  gameId: number;
  classId?: number;
  categoryId?: number;
  categoryIds?: string; // Comma-separated
  gameVersion?: string;
  gameVersions?: string[]; // Array for multi-version search
  searchFilter?: string;
  sortField?: CFModSearchSortField;
  sortOrder?: "asc" | "desc";
  modLoaderType?: ModLoaderType;
  modLoaderTypes?: string; // Comma-separated ModLoaderType values
  gameVersionTypeId?: number;
  authorId?: number;
  primaryAuthorId?: number;
  slug?: string;
  index?: number;
  pageSize?: number;
}

export enum CFModSearchSortField {
  Featured = 1,
  Popularity = 2,
  LastUpdated = 3,
  Name = 4,
  Author = 5,
  TotalDownloads = 6,
  Category = 7,
  GameVersion = 8,
  EarlyAccess = 9,
  FeaturedReleased = 10,
  ReleasedDate = 11,
  Rating = 12,
}

// ==================== FINGERPRINT ====================

export interface CFFingerprintMatch {
  id: number;
  file: CFFile;
  latestFiles: CFFile[];
}

export interface CFFingerprintMatchesResult {
  isCacheBuilt: boolean;
  exactMatches: CFFingerprintMatch[];
  exactFingerprints: number[];
  partialMatches: CFFingerprintMatch[];
  partialMatchFingerprints: Record<string, number[]>;
  additionalProperties?: number[];
  installedFingerprints: number[];
  unmatchedFingerprints: number[];
}

export interface CFGetFingerprintMatchesResponse {
  data: CFFingerprintMatchesResult;
}

// ==================== HELPER TYPES ====================

/**
 * Mapped type for our internal mod format from CF API
 */
export interface CFModMapped {
  id: number;
  name: string;
  slug: string;
  description: string;
  author: string;
  thumbnailUrl?: string;
  logoUrl?: string;
  downloadCount: number;
  categories: CFCategory[];
  cfCategories: number[];
  websiteUrl?: string;
  issuesUrl?: string;
  sourceUrl?: string;
  wikiUrl?: string;
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
}

/**
 * Mapped type for our internal file format from CF API
 */
export interface CFFileMapped {
  id: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl?: string;
  gameVersions: string[];
  releaseType: "release" | "beta" | "alpha";
  dependencies: Array<{
    modId: number;
    type: "required" | "optional" | "incompatible" | "embedded";
  }>;
}

/**
 * Convert CF release type to string
 */
export function releaseTypeToString(
  type: FileReleaseType
): "release" | "beta" | "alpha" {
  switch (type) {
    case FileReleaseType.Release:
      return "release";
    case FileReleaseType.Beta:
      return "beta";
    case FileReleaseType.Alpha:
      return "alpha";
    default:
      return "release";
  }
}

/**
 * Convert CF dependency type to string
 */
export function dependencyTypeToString(
  type: DependencyType
): "required" | "optional" | "incompatible" | "embedded" {
  switch (type) {
    case DependencyType.RequiredDependency:
      return "required";
    case DependencyType.OptionalDependency:
      return "optional";
    case DependencyType.Incompatible:
      return "incompatible";
    case DependencyType.EmbeddedLibrary:
    case DependencyType.Include:
      return "embedded";
    default:
      return "optional";
  }
}

/**
 * Get mod loader name from type
 */
export function modLoaderTypeToName(type: ModLoaderType): string {
  switch (type) {
    case ModLoaderType.Forge:
      return "forge";
    case ModLoaderType.Fabric:
      return "fabric";
    case ModLoaderType.Quilt:
      return "quilt";
    case ModLoaderType.NeoForge:
      return "neoforge";
    case ModLoaderType.LiteLoader:
      return "liteloader";
    case ModLoaderType.Cauldron:
      return "cauldron";
    default:
      return "any";
  }
}

/**
 * Get mod loader type from name
 */
export function nameToModLoaderType(name: string): ModLoaderType {
  const lower = name.toLowerCase();
  switch (lower) {
    case "forge":
      return ModLoaderType.Forge;
    case "fabric":
      return ModLoaderType.Fabric;
    case "quilt":
      return ModLoaderType.Quilt;
    case "neoforge":
      return ModLoaderType.NeoForge;
    case "liteloader":
      return ModLoaderType.LiteLoader;
    case "cauldron":
      return ModLoaderType.Cauldron;
    default:
      return ModLoaderType.Any;
  }
}
