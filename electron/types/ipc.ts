/**
 * IPC Event Type Definitions
 * 
 * Defines the shape of data for all IPC events between main and renderer
 */

import type { IpcRendererEvent } from "electron";

// ==================== UPDATE EVENTS ====================

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateNotAvailableInfo {
  version: string;
}

export interface DownloadProgressInfo {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateDownloadedInfo {
  version: string;
  releaseNotes?: string;
}

export interface UpdateErrorInfo {
  message: string;
}

// ==================== PROGRESS EVENTS ====================

export interface RefreshDependenciesProgress {
  current: number;
  total: number;
  modName: string;
}

export interface ImportProgressData {
  current: number;
  total: number;
  currentMod?: string;
}

export interface DownloadProgressData {
  current: number;
  total: number;
  modName?: string;
  speed?: number;
}

// ==================== GAME EVENTS ====================

export interface GameLaunchInfo {
  instanceId: string;
  pid?: number;
}

export interface GameExitInfo {
  instanceId: string;
  exitCode: number;
}

export interface RunningGameInfo {
  instanceId: string;
  instanceName: string;
  minecraftVersion: string;
  loader: string;
  pid: number;
  startedAt: string;
}

// ==================== TYPE-SAFE IPC LISTENER ====================

/**
 * Creates a type-safe IPC listener with automatic cleanup
 * @returns Cleanup function to remove the listener
 */
export type IpcEventHandler<T> = (event: IpcRendererEvent, data: T) => void;

/**
 * Generic IPC event subscription that returns an unsubscribe function
 */
export type IpcSubscription = () => void;

/**
 * Helper to create type-safe event listeners
 */
export function createTypedListener<T>(
  callback: (data: T) => void
): IpcEventHandler<T> {
  return (_event: IpcRendererEvent, data: T) => callback(data);
}

// ==================== IPC RESPONSE TYPES ====================

export interface IpcSuccessResponse {
  success: true;
}

export interface IpcErrorResponse {
  success: false;
  error: string;
}

export type IpcResponse = IpcSuccessResponse | IpcErrorResponse;

export interface IpcResultResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== MOD RELATED TYPES ====================

export interface ModRemovalImpact {
  modToAffect: { id: string; name: string } | null;
  dependentMods: Array<{ id: string; name: string; willBreak: boolean; depth?: number }>;
  orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
  warnings: string[];
}

export interface ModToggleResult {
  enabled: boolean;
}

// ==================== CONFIG CHANGE TYPES ====================

export interface ConfigChangeData {
  filePath: string;
  keyPath: string;
  line?: number;
  oldValue: unknown;
  newValue: unknown;
}

// ==================== IMPORT TYPES ====================

export interface ImportConflict {
  modEntry: {
    name: string;
    cf_project_id?: number;
    cf_file_id?: number;
  };
  existingMod: {
    id: string;
    name: string;
    version: string;
  };
  resolution?: "keep" | "replace" | "skip";
}

export interface ImportPartialData {
  modpackName: string;
  modpackVersion: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion?: string;
  description?: string;
  cfProjectId?: number;
  cfFileId?: number;
}

export interface ImportResult {
  success: boolean;
  modpackId?: string;
  modpack?: {
    id: string;
    name: string;
    mod_count?: number;
  };
  conflicts?: ImportConflict[];
  partialData?: ImportPartialData;
  changes?: {
    added: number;
    removed: number;
    updated: number;
  };
  error?: string;
}

// ==================== REMOTE UPDATE TYPES ====================

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

export interface RemoteUpdateResult {
  hasUpdate: boolean;
  changes?: RemoteUpdateChanges;
  remoteManifest?: unknown; // ModexManifest but avoiding circular deps
  error?: string;
}
