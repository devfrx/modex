/**
 * useGameProfile - Composable for managing game profiles and active game type
 * 
 * Provides reactive state and methods for:
 * - Switching between games (Minecraft, Hytale)
 * - Managing game profiles
 * - Detecting installed games
 * - Getting game-specific configurations
 */

import { ref, computed, onMounted, watch } from "vue";
import type { GameType, GameProfile, GameConfig } from "@/types";

// Reactive state (shared across all component instances)
const activeGameType = ref<GameType>("minecraft");
const profiles = ref<GameProfile[]>([]);
const gameConfigs = ref<Record<GameType, GameConfig | null>>({
  minecraft: null,
  hytale: null,
});
const installedGames = ref<Record<GameType, boolean>>({
  minecraft: false,
  hytale: false,
});
const isLoading = ref(false);
const isInitialized = ref(false);

// Computed
const currentGameConfig = computed(() => gameConfigs.value[activeGameType.value]);
const currentProfiles = computed(() => 
  profiles.value.filter(p => p.gameType === activeGameType.value)
);
const defaultProfile = computed(() => 
  profiles.value.find(p => p.gameType === activeGameType.value && p.isDefault) ||
  profiles.value.find(p => p.gameType === activeGameType.value)
);

// Game display info
const gameDisplayInfo: Record<GameType, {
  name: string;
  icon: string;
  description: string;
  color: string;
}> = {
  minecraft: {
    name: "Minecraft",
    icon: "⛏️",
    description: "Java Edition with mod loaders & instances",
    color: "#4ade80", // green
  },
  hytale: {
    name: "Hytale",
    icon: "🎮",
    description: "Built-in modding, single mods folder",
    color: "#f59e0b", // amber
  },
};

/**
 * Initialize game profiles and detect installations
 */
async function initialize(): Promise<void> {
  if (isInitialized.value) return;
  
  isLoading.value = true;
  try {
    // Load active game type
    activeGameType.value = await window.api.game.getActiveGameType();
    
    // Detect installed games
    const detection = await window.api.game.detectAllGames();
    installedGames.value = {
      minecraft: detection.minecraft?.installed || false,
      hytale: detection.hytale?.installed || false,
    };
    
    // Load game configs
    for (const gameType of ["minecraft", "hytale"] as GameType[]) {
      gameConfigs.value[gameType] = await window.api.game.getGameConfig(gameType);
    }
    
    // Load all profiles
    profiles.value = await window.api.game.getProfiles();
    
    isInitialized.value = true;
    console.log("[useGameProfile] Initialized:", {
      activeGameType: activeGameType.value,
      installedGames: installedGames.value,
      profileCount: profiles.value.length,
    });
  } catch (error) {
    console.error("[useGameProfile] Error initializing:", error);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Set the active game type
 */
async function setActiveGame(gameType: GameType): Promise<void> {
  if (gameType === activeGameType.value) return;
  
  try {
    await window.api.game.setActiveGameType(gameType);
    activeGameType.value = gameType;
    console.log("[useGameProfile] Switched to:", gameType);
  } catch (error) {
    console.error("[useGameProfile] Error switching game:", error);
    throw error;
  }
}

/**
 * Check if a specific game is installed
 */
function isGameInstalled(gameType: GameType): boolean {
  return installedGames.value[gameType];
}

/**
 * Get display info for a game
 */
function getGameDisplayInfo(gameType: GameType) {
  return gameDisplayInfo[gameType];
}

/**
 * Get profiles for a specific game type
 */
function getProfilesForGame(gameType: GameType): GameProfile[] {
  return profiles.value.filter(p => p.gameType === gameType);
}

/**
 * Create a new profile
 */
async function createProfile(options: {
  gameType: GameType;
  name: string;
  description?: string;
  icon?: string;
  launcherPath?: string;
  modsPath?: string;
}): Promise<GameProfile> {
  const profile = await window.api.game.createProfile(options);
  profiles.value.push(profile);
  return profile;
}

/**
 * Update a profile
 */
async function updateProfile(
  id: string, 
  updates: Partial<Omit<GameProfile, "id" | "gameType" | "createdAt">>
): Promise<GameProfile | null> {
  const updated = await window.api.game.updateProfile(id, updates);
  if (updated) {
    const index = profiles.value.findIndex(p => p.id === id);
    if (index !== -1) {
      profiles.value[index] = updated;
    }
  }
  return updated;
}

/**
 * Delete a profile
 */
async function deleteProfile(id: string): Promise<boolean> {
  const success = await window.api.game.deleteProfile(id);
  if (success) {
    profiles.value = profiles.value.filter(p => p.id !== id);
  }
  return success;
}

/**
 * Set a profile as default for its game type
 */
async function setDefaultProfile(id: string): Promise<boolean> {
  const profile = profiles.value.find(p => p.id === id);
  if (!profile) return false;
  
  const success = await window.api.game.setDefaultProfile(id);
  if (success) {
    // Update local state
    profiles.value.forEach(p => {
      if (p.gameType === profile.gameType) {
        p.isDefault = p.id === id;
      }
    });
  }
  return success;
}

/**
 * Launch a game with a specific profile
 */
async function launchGame(profileId: string): Promise<{ success: boolean; error?: string }> {
  return window.api.game.launchGame(profileId);
}

/**
 * Open mods folder for a profile
 */
async function openModsFolder(profileId: string): Promise<boolean> {
  return window.api.game.openModsFolder(profileId);
}

/**
 * Reload profiles from backend
 */
async function reloadProfiles(): Promise<void> {
  try {
    profiles.value = await window.api.game.getProfiles();
  } catch (error) {
    console.error("[useGameProfile] Error reloading profiles:", error);
  }
}

/**
 * Check if the current game uses instances (Minecraft) or not (Hytale)
 */
const usesInstances = computed(() => {
  const config = currentGameConfig.value;
  return config?.usesInstances ?? true; // Default to Minecraft behavior
});

/**
 * Check if the current game has mod loaders
 */
const hasModLoaders = computed(() => {
  const config = currentGameConfig.value;
  return config?.hasModLoaders ?? true; // Default to Minecraft behavior
});

/**
 * Check if the current game supports resource packs
 */
const supportsResourcePacks = computed(() => {
  const config = currentGameConfig.value;
  return config?.supportsResourcePacks ?? true;
});

/**
 * Check if the current game supports shaders
 */
const supportsShaders = computed(() => {
  const config = currentGameConfig.value;
  return config?.supportsShaders ?? true;
});

export function useGameProfile() {
  // Initialize on first use
  if (!isInitialized.value && !isLoading.value) {
    initialize();
  }

  return {
    // State
    activeGameType,
    profiles,
    gameConfigs,
    installedGames,
    isLoading,
    isInitialized,
    
    // Computed
    currentGameConfig,
    currentProfiles,
    defaultProfile,
    usesInstances,
    hasModLoaders,
    supportsResourcePacks,
    supportsShaders,
    
    // Methods
    initialize,
    setActiveGame,
    isGameInstalled,
    getGameDisplayInfo,
    getProfilesForGame,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    launchGame,
    openModsFolder,
    reloadProfiles,
    gameDisplayInfo,
  };
}
