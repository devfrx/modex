import { ref, watch, computed } from "vue";
import type { GameType } from "@/types";

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
  { id: "organize", name: "Folders", route: "/organize", icon: "FolderTree", enabled: true, order: 3, games: ["minecraft"] },
  { id: "stats", name: "Insights", route: "/stats", icon: "BarChart3", enabled: true, order: 4, games: ["minecraft"] },
  { id: "sandbox", name: "Visualize", route: "/sandbox", icon: "LayoutGrid", enabled: true, order: 5, games: ["minecraft"] },
  { id: "guide", name: "Guide", route: "/guide", icon: "BookOpen", enabled: true, order: 6, games: ["minecraft"] },
];

// Hytale sidebar items
const defaultHytaleItems: SidebarNavItem[] = [
  { id: "hytale-home", name: "Hytale", route: "/hytale", icon: "Home", enabled: true, order: 0, games: ["hytale"] },
  { id: "hytale-mods", name: "Browse Mods", route: "/hytale/browse", icon: "Library", enabled: true, order: 1, games: ["hytale"] },
  { id: "hytale-worlds", name: "Worlds", route: "/hytale/worlds", icon: "FolderTree", enabled: true, order: 2, games: ["hytale"] },
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

function loadSettings(): SidebarSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all fields exist
      return {
        ...defaultSettings,
        ...parsed,
        items: parsed.items || defaultMinecraftItems,
        hytaleItems: parsed.hytaleItems || defaultHytaleItems,
      };
    }
  } catch (e) {
    console.error("Failed to load sidebar settings:", e);
  }
  return { ...defaultSettings };
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch (e) {
    console.error("Failed to save sidebar settings:", e);
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
    activeGame.value = game;
  }

  function setPosition(position: "left" | "right") {
    settings.value.position = position;
  }

  function setCollapsed(collapsed: boolean) {
    settings.value.collapsed = collapsed;
  }

  function toggleCollapsed() {
    settings.value.collapsed = !settings.value.collapsed;
  }

  function setShowLabels(show: boolean) {
    settings.value.showLabels = show;
  }

  function toggleItemEnabled(itemId: string) {
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
