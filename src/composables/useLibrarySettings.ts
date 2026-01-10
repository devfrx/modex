import { ref, watch, type Ref } from "vue";

const SETTINGS_KEY = "modex:library:settings";

export interface LibrarySettingsState {
  viewMode: Ref<"grid" | "gallery" | "list" | "compact">;
  sortBy: Ref<"name" | "loader" | "created_at" | "version">;
  sortDir: Ref<"asc" | "desc">;
  showThumbnails: Ref<boolean>;
  selectedLoader: Ref<string>;
  selectedGameVersion: Ref<string>;
  searchField: Ref<"all" | "name" | "author" | "version" | "description">;
  modpackFilter: Ref<string>;
  selectedContentType: Ref<"all" | "mod" | "resourcepack" | "shader">;
  visibleColumns: Ref<Set<string>>;
  showFilters: Ref<boolean>;
  itemsPerPage: Ref<number>;
  enableGrouping: Ref<boolean>;
}

/**
 * Composable for managing library settings persistence.
 * Settings are automatically saved to localStorage when any value changes.
 */
export function useLibrarySettings() {
  // Initialize all settings refs with defaults
  const viewMode = ref<"grid" | "gallery" | "list" | "compact">("grid");
  const sortBy = ref<"name" | "loader" | "created_at" | "version">("name");
  const sortDir = ref<"asc" | "desc">("asc");
  const showThumbnails = ref<boolean>(true);
  const selectedLoader = ref<string>("all");
  const selectedGameVersion = ref<string>("all");
  const searchField = ref<"all" | "name" | "author" | "version" | "description">("all");
  const modpackFilter = ref<string>("all");
  const selectedContentType = ref<"all" | "mod" | "resourcepack" | "shader">("all");
  const visibleColumns = ref<Set<string>>(new Set(["name", "version", "loader", "author"]));
  const showFilters = ref<boolean>(false);
  const itemsPerPage = ref<number>(50);
  const enableGrouping = ref<boolean>(true);

  function saveSettings(): void {
    const settings = {
      viewMode: viewMode.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      showThumbnails: showThumbnails.value,
      selectedLoader: selectedLoader.value,
      selectedGameVersion: selectedGameVersion.value,
      searchField: searchField.value,
      modpackFilter: modpackFilter.value,
      selectedContentType: selectedContentType.value,
      visibleColumns: Array.from(visibleColumns.value),
      showFilters: showFilters.value,
      itemsPerPage: itemsPerPage.value,
      enableGrouping: enableGrouping.value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadSettings(): void {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.viewMode) viewMode.value = settings.viewMode;
        if (settings.sortBy) sortBy.value = settings.sortBy;
        if (settings.sortDir) sortDir.value = settings.sortDir;
        if (settings.showThumbnails !== undefined)
          showThumbnails.value = settings.showThumbnails;
        if (settings.selectedLoader)
          selectedLoader.value = settings.selectedLoader;
        if (settings.selectedGameVersion)
          selectedGameVersion.value = settings.selectedGameVersion;
        if (settings.searchField) searchField.value = settings.searchField;
        if (settings.modpackFilter) modpackFilter.value = settings.modpackFilter;
        if (settings.selectedContentType)
          selectedContentType.value = settings.selectedContentType;
        if (settings.visibleColumns)
          visibleColumns.value = new Set(settings.visibleColumns);
        if (settings.showFilters !== undefined)
          showFilters.value = settings.showFilters;
        if (settings.itemsPerPage) itemsPerPage.value = settings.itemsPerPage;
        if (settings.enableGrouping !== undefined)
          enableGrouping.value = settings.enableGrouping;
      }
    } catch (e) {
      console.warn("Failed to load settings", e);
    }
  }

  // Set up watcher for auto-save (call after loadSettings to avoid saving defaults)
  function setupAutoSave(): void {
    watch(
      [
        viewMode,
        sortBy,
        sortDir,
        showThumbnails,
        selectedLoader,
        selectedGameVersion,
        searchField,
        modpackFilter,
        selectedContentType,
        visibleColumns,
        showFilters,
        itemsPerPage,
        enableGrouping,
      ],
      () => {
        saveSettings();
      },
      { deep: true }
    );
  }

  return {
    // Settings refs
    viewMode,
    sortBy,
    sortDir,
    showThumbnails,
    selectedLoader,
    selectedGameVersion,
    searchField,
    modpackFilter,
    selectedContentType,
    visibleColumns,
    showFilters,
    itemsPerPage,
    enableGrouping,
    // Methods
    loadSettings,
    saveSettings,
    setupAutoSave,
  };
}
