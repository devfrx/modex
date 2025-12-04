export interface Mod {
  id: string; // CF project ID as string, or hash for local mods
  filename: string;
  name: string;
  slug?: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path?: string; // Optional - only set when file is downloaded
  hash?: string;
  created_at: string;
  size: number;
  favorite?: boolean;
  tags?: string[];
  folderId?: string; // Reference to parent folder
  
  // CurseForge specific fields
  cf_project_id?: number;
  cf_file_id?: number;
  thumbnail_url?: string;
  download_count?: number;
  release_type?: 'release' | 'beta' | 'alpha';
  date_released?: string;
  dependencies?: { modId: number; type: string }[];
  source?: 'curseforge' | 'modrinth' | 'local';
}

// Folder/Group for organizing mods
export interface ModFolder {
  id: string;
  name: string;
  parentId: string | null; // null = root level
  color?: string;
  icon?: string;
  expanded?: boolean;
  order: number;
  created_at: string;
}

// Tree node for visualization
export interface TreeNode {
  id: string;
  type: 'folder' | 'mod';
  name: string;
  parentId: string | null;
  children?: TreeNode[];
  data?: Mod | ModFolder;
  expanded?: boolean;
  order: number;
}

export interface Modpack {
  id: string; // Folder name
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  image_path?: string;
  created_at: string;
  mod_count?: number;
  favorite?: boolean;
}

export interface ElectronAPI {
  mods: {
    getAll: () => Promise<Mod[]>;
    getById: (id: string) => Promise<Mod | undefined>;
    import: (sourcePaths: string[]) => Promise<Mod[]>;
    update: (id: string, updates: Partial<Mod>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    bulkDelete: (ids: string[]) => Promise<number>;
    refreshMetadata: (id: string) => Promise<{ success: boolean; updates?: Partial<Mod>; error?: string }>;
    refreshAllMetadata: () => Promise<{ updated: number; failed: number; total: number }>;
    addFromCurseForge: (projectId: number, fileId: number, preferredLoader?: string) => Promise<Mod | null>;
  };
  curseforge: {
    search: (options: {
      query?: string;
      gameVersion?: string;
      modLoader?: string;
      categoryId?: number;
      pageSize?: number;
      index?: number;
    }) => Promise<{ mods: any[]; pagination: any }>;
    getMod: (modId: number) => Promise<any | null>;
    getModFiles: (modId: number, options?: { gameVersion?: string; modLoader?: string }) => Promise<any[]>;
    getCategories: () => Promise<any[]>;
    getPopular: (gameVersion?: string, modLoader?: string) => Promise<any[]>;
    downloadMod: (modId: number, fileId: number, destPath: string) => Promise<{ success: boolean; filePath: string; error?: string }>;
    hasApiKey: () => Promise<boolean>;
  };
  modpacks: {
    getAll: () => Promise<Modpack[]>;
    getById: (id: string) => Promise<Modpack | undefined>;
    create: (data: { name: string; version?: string; description?: string }) => Promise<string>;
    add: (data: { name: string; version?: string; description?: string }) => Promise<string>;
    update: (id: string, updates: Partial<Modpack>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getMods: (modpackId: string) => Promise<Mod[]>;
    addMod: (modpackId: string, modId: string) => Promise<boolean>;
    removeMod: (modpackId: string, modId: string) => Promise<boolean>;
    clone: (modpackId: string, newName: string) => Promise<string | null>;
    selectImage: () => Promise<string | null>;
    setImage: (modpackId: string, imagePath: string) => Promise<string | null>;
  };
  scanner: {
    selectFolder: () => Promise<string | null>;
    selectFiles: () => Promise<string[]>;
    selectZipFile: () => Promise<string | null>;
    selectGameFolder: () => Promise<string | null>;
    scanFolder: (folderPath: string) => Promise<Omit<Mod, "id" | "created_at" | "size">[]>;
    scanFiles: (filePaths: string[]) => Promise<Omit<Mod, "id" | "created_at" | "size">[]>;
    importMods: (filePaths: string[]) => Promise<Mod[]>;
    importModpack: (zipPath: string, modpackName: string) => Promise<{ modpackId: string; modCount: number }>;
    exportModpack: (modpackId: string, exportPath: string) => Promise<{ success: boolean; path: string }>;
    exportToGameFolder: (modIds: string[], targetFolder: string) => Promise<{ success: boolean; count: number }>;
    exportModpackToGameFolder: (modpackId: string, targetFolder: string) => Promise<{ success: boolean; count: number }>;
    selectExportPath: (defaultName: string) => Promise<string | null>;
    openInExplorer: (path: string) => Promise<void>;
    openLibrary: () => Promise<void>;
    openModpackFolder: (modpackId: string) => Promise<void>;
    getBasePath: () => Promise<string>;
    getLibraryPath: () => Promise<string>;
  };
  share: {
    exportModex: (modpackId: string) => Promise<{ success: boolean; code: string; path: string } | null>;
    importModex: () => Promise<{
      success: boolean;
      modpackId: string;
      code: string;
      isUpdate: boolean;
      changes?: { added: number; removed: number; unchanged: number };
    } | null>;
    importCurseForgeZip: () => Promise<{
      success: boolean;
      modpackId?: string;
      modsImported: number;
      modsSkipped: number;
      errors: string[];
    } | null>;
    getInfo: (modpackId: string) => Promise<{ shareCode: string | null; lastSync: string | null }>;
    generateCode: (modpackId: string) => Promise<{ code: string; checksum: string }>;
  };
  updates: {
    setApiKey: (source: "curseforge" | "modrinth", apiKey: string) => Promise<{ success: boolean }>;
    getApiKey: (source: "curseforge" | "modrinth") => Promise<string>;
    checkMod: (modId: string) => Promise<ModUpdateInfo>;
    checkAll: () => Promise<ModUpdateInfo[]>;
    checkModpack: (modpackId: string) => Promise<ModUpdateInfo[]>;
    applyUpdate: (modId: string, downloadUrl: string) => Promise<{ success: boolean; newPath: string | null; error?: string }>;
    applyModpackUpdate: (modpackId: string, modId: string, downloadUrl: string) => Promise<{ success: boolean; newPath: string | null; error?: string }>;
  };
  on: (channel: string, callback: (data: any) => void) => void;
}

export interface ModUpdateInfo {
  modId: string;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  updateUrl: string | null;
  downloadUrl: string | null;
  source: "curseforge" | "modrinth" | "unknown";
  projectId: string | null;
  projectName: string | null;
  changelog: string | null;
  releaseDate: string | null;
}

declare global {
  interface Window {
    api: ElectronAPI;
    electronUtils: {
      getPathForFile: (file: File) => string;
    };
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      off: (channel: string, func: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}
