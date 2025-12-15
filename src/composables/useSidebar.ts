import { ref, watch, computed } from "vue";

export interface SidebarNavItem {
  id: string;
  name: string;
  route: string;
  icon: string;
  enabled: boolean;
  order: number;
}

export interface SidebarSettings {
  position: "left" | "right";
  collapsed: boolean;
  autoCollapse: boolean;
  showLabels: boolean;
  items: SidebarNavItem[];
}

const STORAGE_KEY = "modex:sidebar-settings";

const defaultItems: SidebarNavItem[] = [
  { id: "home", name: "Home", route: "/home", icon: "Home", enabled: true, order: 0 },
  { id: "library", name: "Library", route: "/library", icon: "Library", enabled: true, order: 1 },
  { id: "modpacks", name: "Modpacks", route: "/modpacks", icon: "Package", enabled: true, order: 2 },
  { id: "organize", name: "Organize", route: "/organize", icon: "FolderTree", enabled: true, order: 3 },
  { id: "stats", name: "Statistics", route: "/stats", icon: "BarChart3", enabled: true, order: 4 },
  { id: "sandbox", name: "Sandbox", route: "/sandbox", icon: "LayoutGrid", enabled: true, order: 5 },
  { id: "guide", name: "Guide", route: "/guide", icon: "BookOpen", enabled: true, order: 6 },
];

const defaultSettings: SidebarSettings = {
  position: "left",
  collapsed: false,
  autoCollapse: false,
  showLabels: true,
  items: defaultItems,
};

// Global reactive state
const settings = ref<SidebarSettings>(loadSettings());

function loadSettings(): SidebarSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all fields exist
      return {
        ...defaultSettings,
        ...parsed,
        items: parsed.items || defaultItems,
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
  const enabledItems = computed(() =>
    settings.value.items
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order)
  );

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
    const item = settings.value.items.find((i) => i.id === itemId);
    if (item) {
      item.enabled = !item.enabled;
    }
  }

  function reorderItems(newOrder: string[]) {
    newOrder.forEach((id, index) => {
      const item = settings.value.items.find((i) => i.id === id);
      if (item) {
        item.order = index;
      }
    });
  }

  function resetSettings() {
    settings.value = { ...defaultSettings, items: [...defaultItems] };
  }

  return {
    settings,
    enabledItems,
    setPosition,
    setCollapsed,
    toggleCollapsed,
    setShowLabels,
    toggleItemEnabled,
    reorderItems,
    resetSettings,
    defaultItems,
  };
}
