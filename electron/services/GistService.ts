/**
 * GistService - Manages GitHub Gist operations for manifest hosting
 * 
 * Features:
 * - Create new Gists
 * - Update existing Gists
 * - Validate Gist access
 * - List user Gists
 */

import path from "path";
import fs from "fs-extra";

// ==================== TYPES ====================

export interface GistConfig {
  /** GitHub Personal Access Token with gist scope */
  token: string;
  /** Default filename for manifests */
  defaultFilename?: string;
}

export interface GistFile {
  filename: string;
  content: string;
}

export interface GistInfo {
  id: string;
  description: string;
  htmlUrl: string;
  rawUrl: string;
  files: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGistOptions {
  description: string;
  filename: string;
  content: string;
  isPublic?: boolean;
}

export interface UpdateGistOptions {
  gistId: string;
  filename: string;
  content: string;
  description?: string;
}

export interface GistOperationResult {
  success: boolean;
  gistId?: string;
  htmlUrl?: string;
  rawUrl?: string;
  error?: string;
}

// ==================== SERVICE ====================

export class GistService {
  private basePath: string;
  private configPath: string;
  private config: GistConfig | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.configPath = path.join(basePath, "gist-config.json");
  }

  /**
   * Load Gist configuration from disk
   */
  async loadConfig(): Promise<GistConfig | null> {
    try {
      if (await fs.pathExists(this.configPath)) {
        this.config = await fs.readJson(this.configPath);
        return this.config;
      }
    } catch (err) {
      console.error("[GistService] Failed to load config:", err);
    }
    return null;
  }

  /**
   * Save Gist configuration to disk
   */
  async saveConfig(config: GistConfig): Promise<void> {
    this.config = config;
    await fs.writeJson(this.configPath, config, { spaces: 2 });
  }

  /**
   * Get the current token (if configured)
   */
  async getToken(): Promise<string> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config?.token || "";
  }

  /**
   * Set the GitHub token
   */
  async setToken(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate the token by making a test request
      const isValid = await this.validateToken(token);
      if (!isValid) {
        return { success: false, error: "Invalid token or insufficient permissions. Ensure the token has 'gist' scope." };
      }

      await this.saveConfig({
        ...this.config,
        token,
        defaultFilename: this.config?.defaultFilename || "modpack-manifest.json",
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Validate a GitHub token
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ModEx-App",
        },
      });

      if (!response.ok) {
        return false;
      }

      // Check if token has gist scope by trying to list gists
      const gistsResponse = await fetch("https://api.github.com/gists?per_page=1", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ModEx-App",
        },
      });

      return gistsResponse.ok;
    } catch (err) {
      console.error("[GistService] Token validation failed:", err);
      return false;
    }
  }

  /**
   * Check if a token is configured
   */
  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Get the authenticated user info
   */
  async getUser(): Promise<{ login: string; avatarUrl: string } | null> {
    const token = await this.getToken();
    if (!token) return null;

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ModEx-App",
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      return {
        login: data.login,
        avatarUrl: data.avatar_url,
      };
    } catch (err) {
      console.error("[GistService] Failed to get user:", err);
      return null;
    }
  }

  /**
   * List user's Gists (for selection UI)
   */
  async listGists(options?: { perPage?: number; page?: number }): Promise<GistInfo[]> {
    const token = await this.getToken();
    if (!token) return [];

    try {
      const perPage = options?.perPage || 30;
      const page = options?.page || 1;

      const response = await fetch(
        `https://api.github.com/gists?per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "ModEx-App",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list gists: ${response.statusText}`);
      }

      const gists = await response.json();

      return gists.map((gist: any) => ({
        id: gist.id,
        description: gist.description || "(No description)",
        htmlUrl: gist.html_url,
        rawUrl: this.buildRawUrl(gist),
        files: Object.keys(gist.files),
        isPublic: gist.public,
        createdAt: gist.created_at,
        updatedAt: gist.updated_at,
      }));
    } catch (err) {
      console.error("[GistService] Failed to list gists:", err);
      return [];
    }
  }

  /**
   * Create a new Gist
   */
  async createGist(options: CreateGistOptions): Promise<GistOperationResult> {
    const token = await this.getToken();
    if (!token) {
      return { success: false, error: "GitHub token not configured. Add it in Settings." };
    }

    try {
      const response = await fetch("https://api.github.com/gists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "ModEx-App",
        },
        body: JSON.stringify({
          description: options.description,
          public: options.isPublic ?? false,
          files: {
            [options.filename]: {
              content: options.content,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const gist = await response.json();
      const rawUrl = this.buildRawUrl(gist, options.filename);

      return {
        success: true,
        gistId: gist.id,
        htmlUrl: gist.html_url,
        rawUrl,
      };
    } catch (err) {
      console.error("[GistService] Failed to create gist:", err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Update an existing Gist
   */
  async updateGist(options: UpdateGistOptions): Promise<GistOperationResult> {
    const token = await this.getToken();
    if (!token) {
      return { success: false, error: "GitHub token not configured. Add it in Settings." };
    }

    try {
      const body: any = {
        files: {
          [options.filename]: {
            content: options.content,
          },
        },
      };

      if (options.description) {
        body.description = options.description;
      }

      const response = await fetch(`https://api.github.com/gists/${options.gistId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "ModEx-App",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const gist = await response.json();
      const rawUrl = this.buildRawUrl(gist, options.filename);

      return {
        success: true,
        gistId: gist.id,
        htmlUrl: gist.html_url,
        rawUrl,
      };
    } catch (err) {
      console.error("[GistService] Failed to update gist:", err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Get a specific Gist by ID
   */
  async getGist(gistId: string): Promise<GistInfo | null> {
    const token = await this.getToken();
    
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ModEx-App",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers });

      if (!response.ok) {
        return null;
      }

      const gist = await response.json();

      return {
        id: gist.id,
        description: gist.description || "(No description)",
        htmlUrl: gist.html_url,
        rawUrl: this.buildRawUrl(gist),
        files: Object.keys(gist.files),
        isPublic: gist.public,
        createdAt: gist.created_at,
        updatedAt: gist.updated_at,
      };
    } catch (err) {
      console.error("[GistService] Failed to get gist:", err);
      return null;
    }
  }

  /**
   * Check if a Gist exists remotely
   */
  async gistExists(gistId: string): Promise<boolean> {
    const gist = await this.getGist(gistId);
    return gist !== null;
  }

  /**
   * Delete a Gist by ID
   */
  async deleteGist(gistId: string): Promise<GistOperationResult> {
    const token = await this.getToken();
    if (!token) {
      return { success: false, error: "GitHub token not configured. Add it in Settings." };
    }

    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "ModEx-App",
        },
      });

      if (!response.ok) {
        // 404 means Gist was already deleted externally - treat as success
        if (response.status === 404) {
          console.log(`[GistService] Gist ${gistId} already deleted (404)`);
          return { success: true, gistId };
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true, gistId };
    } catch (err) {
      console.error("[GistService] Failed to delete gist:", err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Build the raw URL for a file in a Gist
   */
  private buildRawUrl(gist: any, filename?: string): string {
    const files = Object.keys(gist.files);
    const targetFile = filename || files[0];
    
    if (!targetFile || !gist.files[targetFile]) {
      return "";
    }

    // Build URL without commit hash so it always fetches latest
    // Format: https://gist.githubusercontent.com/{user}/{id}/raw/{filename}
    const owner = gist.owner?.login || "anonymous";
    return `https://gist.githubusercontent.com/${owner}/${gist.id}/raw/${targetFile}`;
  }

  /**
   * Push manifest to Gist (create or update based on modpack config)
   */
  async pushManifest(options: {
    modpackId: string;
    modpackName: string;
    manifest: string;
    gistId?: string;
    filename?: string;
    isPublic?: boolean;
  }): Promise<GistOperationResult> {
    const filename = options.filename || `${options.modpackName.replace(/[^a-zA-Z0-9-_]/g, "-")}-manifest.json`;
    const description = `ModEx Manifest: ${options.modpackName}`;

    if (options.gistId) {
      // Update existing Gist
      return this.updateGist({
        gistId: options.gistId,
        filename,
        content: options.manifest,
        description,
      });
    } else {
      // Create new Gist
      return this.createGist({
        description,
        filename,
        content: options.manifest,
        isPublic: options.isPublic ?? false,
      });
    }
  }
}
