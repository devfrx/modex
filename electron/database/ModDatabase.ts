import { app } from "electron";
import path from "path";
import fs from "fs-extra";
import { JSONFilePreset } from "lowdb/node";

export interface Mod {
  id: string; // Changed to string for UUID or simple ID
  filename: string;
  name: string;
  version: string;
  game_version: string;
  loader: string; // 'forge' | 'fabric' | 'quilt' | 'neoforge'
  description?: string;
  author?: string;
  path: string;
  hash: string;
  created_at: string;
}

export interface Modpack {
  id: string;
  name: string;
  version: string;
  minecraft_version: string; // e.g. "1.20.1", "1.21.1"
  loader: string; // 'forge' | 'fabric' | 'quilt' | 'neoforge'
  description?: string;
  image_path?: string;
  created_at: string;
}

export interface ModpackMod {
  modpack_id: string;
  mod_id: string;
}

interface DatabaseSchema {
  mods: Mod[];
  modpacks: Modpack[];
  modpack_mods: ModpackMod[];
}

class ModDatabase {
  private db: any; // Lowdb instance

  constructor() {
    this.init();
  }

  private async init() {
    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "modex-db.json");

    // Initialize lowdb with default data
    const defaultData: DatabaseSchema = {
      mods: [],
      modpacks: [],
      modpack_mods: [],
    };
    this.db = await JSONFilePreset<DatabaseSchema>(dbPath, defaultData);
  }

  // Helper to ensure DB is ready
  private async ensureDb() {
    if (!this.db) await this.init();
    await this.db.read();
  }

  // ========== MODS CRUD ==========

  async getAllMods(): Promise<Mod[]> {
    await this.ensureDb();
    return this.db.data.mods.sort((a: Mod, b: Mod) =>
      a.name.localeCompare(b.name)
    );
  }

  async getModById(id: string): Promise<Mod | undefined> {
    await this.ensureDb();
    return this.db.data.mods.find((m: Mod) => m.id === id);
  }

  async addMod(mod: Omit<Mod, "id" | "created_at">): Promise<string> {
    await this.ensureDb();

    // Check for duplicates by path or hash
    const existing = this.db.data.mods.find(
      (m: Mod) => m.path === mod.path || m.hash === mod.hash
    );
    if (existing) return existing.id;

    const newMod: Mod = {
      ...mod,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    this.db.data.mods.push(newMod);
    await this.db.write();
    return newMod.id;
  }

  async updateMod(id: string, mod: Partial<Mod>): Promise<void> {
    await this.ensureDb();
    const index = this.db.data.mods.findIndex((m: Mod) => m.id === id);
    if (index !== -1) {
      this.db.data.mods[index] = { ...this.db.data.mods[index], ...mod };
      await this.db.write();
    }
  }

  async deleteMod(id: string): Promise<void> {
    await this.ensureDb();
    this.db.data.mods = this.db.data.mods.filter((m: Mod) => m.id !== id);
    // Also remove from modpacks
    this.db.data.modpack_mods = this.db.data.modpack_mods.filter(
      (mm: ModpackMod) => mm.mod_id !== id
    );
    await this.db.write();
  }

  // ========== MODPACKS CRUD ==========

  async getAllModpacks(): Promise<Modpack[]> {
    await this.ensureDb();
    return this.db.data.modpacks.sort((a: Modpack, b: Modpack) =>
      a.name.localeCompare(b.name)
    );
  }

  async getModpackById(id: string): Promise<Modpack | undefined> {
    await this.ensureDb();
    return this.db.data.modpacks.find((m: Modpack) => m.id === id);
  }

  async addModpack(
    modpack: Omit<Modpack, "id" | "created_at">
  ): Promise<string> {
    await this.ensureDb();
    const newModpack: Modpack = {
      ...modpack,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.db.data.modpacks.push(newModpack);
    await this.db.write();
    return newModpack.id;
  }

  async updateModpack(id: string, modpack: Partial<Modpack>): Promise<void> {
    await this.ensureDb();
    const index = this.db.data.modpacks.findIndex((m: Modpack) => m.id === id);
    if (index !== -1) {
      this.db.data.modpacks[index] = {
        ...this.db.data.modpacks[index],
        ...modpack,
      };
      await this.db.write();
    }
  }

  async deleteModpack(id: string): Promise<void> {
    await this.ensureDb();
    this.db.data.modpacks = this.db.data.modpacks.filter(
      (m: Modpack) => m.id !== id
    );
    // Remove relations
    this.db.data.modpack_mods = this.db.data.modpack_mods.filter(
      (mm: ModpackMod) => mm.modpack_id !== id
    );
    await this.db.write();
  }

  // ========== MODPACK-MOD RELATIONS ==========

  async getModsInModpack(modpackId: string): Promise<Mod[]> {
    await this.ensureDb();
    const modIds = this.db.data.modpack_mods
      .filter((mm: ModpackMod) => mm.modpack_id === modpackId)
      .map((mm: ModpackMod) => mm.mod_id);

    return this.db.data.mods.filter((m: Mod) => modIds.includes(m.id));
  }

  async addModToModpack(modpackId: string, modId: string): Promise<void> {
    await this.ensureDb();
    const exists = this.db.data.modpack_mods.some(
      (mm: ModpackMod) => mm.modpack_id === modpackId && mm.mod_id === modId
    );
    if (!exists) {
      this.db.data.modpack_mods.push({ modpack_id: modpackId, mod_id: modId });
      await this.db.write();
    }
  }

  async removeModFromModpack(modpackId: string, modId: string): Promise<void> {
    await this.ensureDb();
    this.db.data.modpack_mods = this.db.data.modpack_mods.filter(
      (mm: ModpackMod) => !(mm.modpack_id === modpackId && mm.mod_id === modId)
    );
    await this.db.write();
  }

  async getModpackCount(modId: string): Promise<number> {
    await this.ensureDb();
    return this.db.data.modpack_mods.filter(
      (mm: ModpackMod) => mm.mod_id === modId
    ).length;
  }

  close(): void {
    // No-op for lowdb
  }
}

export default ModDatabase;
