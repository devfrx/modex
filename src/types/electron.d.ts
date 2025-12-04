export interface Mod {
  id?: string;
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string;
  description?: string;
  author?: string;
  path: string;
  hash: string;
  created_at?: string;
}

export interface Modpack {
  id?: string;
  name: string;
  version: string;
  description?: string;
  image_path?: string;
  created_at?: string;
}

export interface ElectronAPI {
  mods: {
    getAll: () => Promise<Mod[]>;
    getById: (id: string) => Promise<Mod | undefined>;
    add: (mod: Omit<Mod, "id" | "created_at">) => Promise<string>;
    update: (id: string, mod: Partial<Mod>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
  };
  modpacks: {
    getAll: () => Promise<Modpack[]>;
    getById: (id: string) => Promise<Modpack | undefined>;
    add: (modpack: Omit<Modpack, "id" | "created_at">) => Promise<string>;
    update: (id: string, modpack: Partial<Modpack>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getMods: (modpackId: string) => Promise<Mod[]>;
    addMod: (modpackId: string, modId: string) => Promise<boolean>;
    removeMod: (modpackId: string, modId: string) => Promise<boolean>;
    selectImage: () => Promise<string | null>;
  };
  scanner: {
    selectFolder: () => Promise<string | null>;
    selectFiles: () => Promise<string[]>;
    scanFolder: (
      folderPath: string
    ) => Promise<Omit<Mod, "id" | "created_at">[]>;
    scanFiles: (
      filePaths: string[]
    ) => Promise<Omit<Mod, "id" | "created_at">[]>;
    importMods: (
      metadata: Omit<Mod, "id" | "created_at">[]
    ) => Promise<string[]>;
    importModpack: (
      zipPath: string
    ) => Promise<Omit<Mod, "id" | "created_at">[]>;
    exportModpack: (
      modpackId: string,
      exportPath: string
    ) => Promise<{ success: boolean; path: string }>;
    selectExportPath: (defaultName: string) => Promise<string | null>;
    selectZipFile: () => Promise<string | null>;
    openInExplorer: (path: string) => Promise<void>;
  };
  on: (channel: string, callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
    ipcRenderer: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      off: (channel: string, func: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}
