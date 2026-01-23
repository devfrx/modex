import { ref, watch, computed } from "vue";
import type { GameType } from "@/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("Sidebar");

export interface SidebarNavItem {
  id: string;
  name: string;
  route: string;
  icon: string;
  enabled: boolean;
  order: number;
  /** Which games this item is available for. If undefined, available for all games. */
  games?: GameType[];
}

export interface SidebarSettings {
  position: "left" | "right";
  collapsed: boolean;
  autoCollapse: boolean;
  showLabels: boolean;
  items: SidebarNavItem[];
  /** Hytale-specific items (separate to not mix with Minecraft settings) */
  hytaleItems: SidebarNavItem[];
}

const STORAGE_KEY = "modex:sidebar-settings";

// Minecraft sidebar items
const defaultMinecraftItems: SidebarNavItem[] = [
  { id: "home", name: "Home", route: "/home", icon: "Home", enabled: true, order: 0, games: ["minecraft"] },
  { id: "library", name: "My Mods", route: "/library", icon: "Library", enabled: true, order: 1, games: ["minecraft"] },
  { id: "modpacks", name: "My Packs", route: "/modpacks", icon: "Package", enabled: true, order: 2, games: ["minecraft"] },
  { id: "browse-mods", name: "Browse Mods", route: "/library/search", icon: "Globe", enabled: true, order: 3, games: ["minecraft"] },
  { id: "browse-modpacks", name: "Browse Packs", route: "/modpacks/browse", icon: "Compass", enabled: true, order: 4, games: ["minecraft"] },
  { id: "guide", name: "Guide", route: "/guide", icon: "BookOpen", enabled: true, order: 5, games: ["minecraft"] },
];

// Hytale sidebar items
const defaultHytaleItems: SidebarNavItem[] = [
  { id: "hytale-home", name: "Home", route: "/hytale", icon: "Home", enabled: true, order: 0, games: ["hytale"] },
  { id: "hytale-mods", name: "My Mods", route: "/hytale/mods", icon: "Library", enabled: true, order: 1, games: ["hytale"] },
  { id: "hytale-modpacks", name: "My Packs", route: "/hytale/modpacks", icon: "Package", enabled: true, order: 2, games: ["hytale"] },
  { id: "hytale-browse", name: "Browse Mods", route: "/hytale/browse", icon: "LayoutGrid", enabled: true, order: 3, games: ["hytale"] },
  { id: "hytale-worlds", name: "Worlds", route: "/hytale/worlds", icon: "FolderTree", enabled: true, order: 4, games: ["hytale"] },
  { id: "hytale-guide", name: "Guide", route: "/guide", icon: "BookOpen", enabled: true, order: 5, games: ["hytale"] },
];

// Legacy items for backwards compatibility
const defaultItems: SidebarNavItem[] = defaultMinecraftItems;

const defaultSettings: SidebarSettings = {
  position: "left",
  collapsed: false,
  autoCollapse: false,
  showLabels: true,
  items: defaultMinecraftItems,
  hytaleItems: defaultHytaleItems,
};

// Global reactive state
const settings = ref<SidebarSettings>(loadSettings());

// Track active game for filtering items
const activeGame = ref<GameType>("minecraft");

function mergeItems(savedItems: SidebarNavItem[] | undefined, defaultItems: SidebarNavItem[]): SidebarNavItem[] {
  if (!savedItems) return [...defaultItems];
  
  // Create a set of valid item IDs from defaults
  const validIds = new Set(defaultItems.map(item => item.id));
  
  // Filter saved items to only include valid IDs (remove deprecated items)
  const filteredSaved = savedItems.filter(item => validIds.has(item.id));
  
  // Create a map of filtered saved items by id
  const savedMap = new Map(filteredSaved.map(item => [item.id, item]));
  
  // Start with filtered saved items, then add any missing defaults
  const result = [...filteredSaved];
  for (const defaultItem of defaultItems) {
    if (!savedMap.has(defaultItem.id)) {
      result.push(defaultItem);
    }
  }
  
  // Sort by order
  return result.sort((a, b) => a.order - b.order);
}

function loadSettings(): SidebarSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all fields exist AND add new items
      return {
        ...defaultSettings,
        ...parsed,
        items: mergeItems(parsed.items, defaultMinecraftItems),
        hytaleItems: mergeItems(parsed.hytaleItems, defaultHytaleItems),
      };
    }
  } catch (e) {
    log.error("Failed to load sidebar settings:", e);
  }
  return { ...defaultSettings };
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch (e) {
    log.error("Failed to save sidebar settings:", e);
  }
}

// Auto-save on changes
watch(settings, saveSettings, { deep: true });

export function useSidebar() {
  /** Get items for the current game */
  const enabledItems = computed(() => {
    const gameItems = activeGame.value === "hytale" 
      ? settings.value.hytaleItems 
      : settings.value.items;
    
    return gameItems
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order);
  });

  /** Get all items for the current game (including disabled) */
  const allItemsForGame = computed(() => {
    return activeGame.value === "hytale" 
      ? settings.value.hytaleItems 
      : settings.value.items;
  });

  /** Set the active game to filter sidebar items */
  function setActiveGame(game: GameType) {
    log.info('Switching active game', { from: activeGame.value, to: game });
    activeGame.value = game;
  }

  function setPosition(position: "left" | "right") {
    settings.value.position = position;
  }

  function setCollapsed(collapsed: boolean) {
    log.debug('Setting sidebar collapsed', { collapsed });
    settings.value.collapsed = collapsed;
  }

  function toggleCollapsed() {
    log.debug('Toggling sidebar collapsed', { newState: !settings.value.collapsed });
    settings.value.collapsed = !settings.value.collapsed;
  }

  function setShowLabels(show: boolean) {
    settings.value.showLabels = show;
  }

  function toggleItemEnabled(itemId: string) {
    log.debug('Toggling sidebar item', { itemId, game: activeGame.value });
    // Check in current game's items
    const items = activeGame.value === "hytale" 
      ? settings.value.hytaleItems 
      : settings.value.items;
    
    const item = items.find((i) => i.id === itemId);
    if (item) {
      item.enabled = !item.enabled;
    }
  }

  function reorderItems(newOrder: string[]) {
    const items = activeGame.value === "hytale" 
      ? settings.value.hytaleItems 
      : settings.value.items;
    
    newOrder.forEach((id, index) => {
      const item = items.find((i) => i.id === id);
      if (item) {
        item.order = index;
      }
    });
  }

  function resetSettings() {
    log.info('Resetting sidebar settings to defaults');
    settings.value = { 
      ...defaultSettings, 
      items: [...defaultMinecraftItems],
      hytaleItems: [...defaultHytaleItems],
    };
  }

  return {
    settings,
    activeGame,
    enabledItems,
    allItemsForGame,
    setActiveGame,
    setPosition,
    setCollapsed,
    toggleCollapsed,
    setShowLabels,
    toggleItemEnabled,
    reorderItems,
    resetSettings,
    defaultItems: defaultMinecraftItems,
    defaultHytaleItems,
  };
}
