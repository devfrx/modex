export interface Mod {
  id: string; // Hash SHA256
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string;
  hash: string;
  created_at: string;
  size: number;
  favorite?: boolean;
  tags?: string[];
  folderId?: string; // Reference to parent folder
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
  on: (channel: string, callback: (data: any) => void) => void;
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
