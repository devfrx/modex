<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ChangelogDialog from "./ChangelogDialog.vue";
import ModDetailsModal from "./ModDetailsModal.vue";
import { useToast } from "@/composables/useToast";
import { createLogger } from "@/utils/logger";
import type { Modpack, CFMod, CFFile, CFFileIndex, CFCategory } from "@/types/electron";
import type { Mod } from "@/types";

const log = createLogger("CurseForgeSearch");
const toast = useToast();

const props = defineProps<{
  open: boolean;
  gameVersion?: string;
  modLoader?: string;
  installedProjectFiles?: Map<number, Set<number>>;
  initialContentType?: "mods" | "resourcepacks" | "shaders";
  // Lock mode - when opened from ModpackEditor
  lockedModpackId?: string;
  lockFilters?: boolean;
  // Full screen mode - when used as a view
  fullScreen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "added", mod: Mod | null, addedIds?: string[]): void;
}>();

// State
const searchQuery = ref("");
const selectedVersion = ref(props.gameVersion || "");
const selectedLoader = ref(props.modLoader || "");
const selectedContentType = ref<"mods" | "resourcepacks" | "shaders">(props.initialContentType || "mods");
const searchResults = ref<CFMod[]>([]);
const isSearching = ref(false);
const isAddingMod = ref<number | null>(null);
const hasApiKey = ref(false);
const currentPage = ref(0);
const totalResults = ref(0);
const pageSize = 20;

// Changelog State
const changelogOpen = ref(false);
const selectedChangelogMod = ref<{
  id: number;
  name: string;
  fileId: number;
  version: string;
  slug: string;
} | null>(null);

function viewChangelog(mod: CFMod, file: CFFile) {
  selectedChangelogMod.value = {
    id: mod.id,
    name: mod.name,
    fileId: file.id,
    version: file.displayName,
    slug: mod.slug,
  };
  changelogOpen.value = true;
}

// Mod Details Modal State
const modDetailsOpen = ref(false);
const selectedModForDetails = ref<Mod | null>(null);

function viewModDetails(cfMod: CFMod, event?: MouseEvent) {
  // Stop propagation to prevent toggling the expand
  if (event) {
    event.stopPropagation();
  }

  // Convert CFMod to Mod type for the modal
  const mod: Mod = {
    id: `cf-${cfMod.id}-0`, // Placeholder file ID
    name: cfMod.name,
    slug: cfMod.slug,
    version: cfMod.latestFiles?.[0]?.displayName || "Unknown",
    game_version: selectedVersion.value || cfMod.latestFiles?.[0]?.gameVersions?.[0] || "Unknown",
    loader: selectedLoader.value || "",
    content_type: selectedContentType.value === "mods" ? "mod" : selectedContentType.value === "resourcepacks" ? "resourcepack" : "shader",
    description: cfMod.summary,
    author: cfMod.authors?.map(a => a.name).join(", ") || "Unknown",
    thumbnail_url: cfMod.logo?.thumbnailUrl,
    logo_url: cfMod.logo?.url,
    download_count: cfMod.downloadCount,
    created_at: new Date().toISOString(),
    filename: cfMod.latestFiles?.[0]?.fileName || "",
    source: "curseforge",
    cf_project_id: cfMod.id,
  };

  selectedModForDetails.value = mod;
  modDetailsOpen.value = true;
}

function closeModDetails() {
  modDetailsOpen.value = false;
  selectedModForDetails.value = null;
}

// Accordion & Files State
const expandedModId = ref<number | null>(null);
const modFiles = ref<CFFile[]>([]);
const isLoadingFiles = ref(false);

// Filter panel collapsed state (starts collapsed)
const isFilterSidebarCollapsed = ref(true);

// New Filters
const showReleaseConfig = ref(false); // To toggle advanced filter visibility if needed
const filterRelease = ref(true);
const filterBeta = ref(false);
const filterAlpha = ref(false);

// Bulk selection state
const selectedModIds = ref<Set<number>>(new Set()); // For Header selection (Quick Download)
const selectedFileIds = ref<Set<number>>(new Set()); // For specific file selection
const isSelectionMode = ref(false);
const targetModpackId = ref<string | null>(null); // Target modpack for direct add
const isAddingBulk = ref(false);

// Modpacks for direct add feature
const allModpacks = ref<Modpack[]>([]);

// Filtered modpacks based on current version/loader filters
// ONLY show modpacks when BOTH version and loader filters are set
const compatibleModpacks = computed(() => {
  // If both version and loader are not set, return empty array - no modpacks available
  if (!selectedVersion.value || !selectedLoader.value) {
    return [];
  }

  return allModpacks.value
    .filter((pack) => {
      // Both version and loader filters are set, match both
      return (
        pack.minecraft_version === selectedVersion.value &&
        pack.loader?.toLowerCase() === selectedLoader.value.toLowerCase()
      );
    })
    .filter((pack) => !pack.remote_source?.url); // Exclude linked/read-only modpacks
});

// Dynamic fetched versions
const fetchedGameVersions = ref<string[]>([]);
const fetchedLoaderTypes = ref<string[]>([]);
const isLoadingGameVersions = ref(false);
const isLoadingLoaderTypes = ref(false);

// Fallback values if fetch fails
const fallbackGameVersions = [
  "",
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19.1",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.17.1",
  "1.17",
  "1.16.5",
  "1.16.4",
  "1.16.3",
  "1.16.2",
  "1.16.1",
  "1.15.2",
];

const fallbackLoaders = [
  { value: "", label: "All Loaders" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

// Computed for available game versions - uses fetched or fallback
const gameVersions = computed(() => {
  if (fetchedGameVersions.value.length > 0) {
    return ["", ...fetchedGameVersions.value];
  }
  return fallbackGameVersions;
});

// Computed for available loaders - uses fetched or fallback
const modLoaders = computed(() => {
  if (fetchedLoaderTypes.value.length > 0) {
    return [
      { value: "", label: "All Loaders" },
      ...fetchedLoaderTypes.value.map(l => ({
        value: l.toLowerCase(),
        label: l.charAt(0).toUpperCase() + l.slice(1).toLowerCase()
      }))
    ];
  }
  return fallbackLoaders;
});

// Fetch Minecraft versions from CurseForge
async function fetchGameVersions() {
  if (!window.api || isLoadingGameVersions.value) return;
  if (fetchedGameVersions.value.length > 0) return; // Already fetched

  isLoadingGameVersions.value = true;
  try {
    const versions = await window.api.curseforge.getMinecraftVersions();
    const approvedVersions = versions
      .filter((v: { approved: boolean }) => v.approved)
      .map((v: { versionString: string }) => v.versionString);
    fetchedGameVersions.value = approvedVersions;
    log.debug("Fetched MC versions", { count: approvedVersions.length });
  } catch (err) {
    log.error("Failed to fetch MC versions", { error: String(err) });
  } finally {
    isLoadingGameVersions.value = false;
  }
}

// Fetch loader types from CurseForge
async function fetchLoaderTypes() {
  if (!window.api || isLoadingLoaderTypes.value) return;
  if (fetchedLoaderTypes.value.length > 0) return; // Already fetched

  isLoadingLoaderTypes.value = true;
  try {
    const loaders = await window.api.curseforge.getLoaderTypes();
    fetchedLoaderTypes.value = loaders;
    log.debug("Fetched loader types", { count: loaders.length, loaders });
  } catch (err) {
    log.error("Failed to fetch loader types", { error: String(err) });
  } finally {
    isLoadingLoaderTypes.value = false;
  }
}

const sortFields = [
  { value: 2, label: "Popularity" },
  { value: 1, label: "Featured" },
  { value: 3, label: "Last Updated" },
  { value: 4, label: "Name" },
  { value: 5, label: "Author" },
  { value: 6, label: "Total Downloads" },
];

const categories = ref<{ value: number; label: string }[]>([
  { value: 0, label: "All Categories" },
]);

const selectedSortField = ref(2);
const selectedCategory = ref(0);

const STORAGE_KEYS = {
  VERSION: "modex:cf-search:version",
  LOADER: "modex:cf-search:loader",
  SORT: "modex:cf-search:sort",
  RELEASE_TYPES: "modex:cf-search:release-types",
};

onMounted(async () => {
  hasApiKey.value = await window.api.curseforge.hasApiKey();

  // Fetch dynamic versions and loaders from CurseForge
  fetchGameVersions();
  fetchLoaderTypes();

  // Load modpacks for direct-add feature
  try {
    allModpacks.value = await window.api.modpacks.getAll();
  } catch (err) {
    log.error("Failed to load modpacks", { error: String(err) });
  }

  if (!props.gameVersion) {
    const savedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
    if (savedVersion) selectedVersion.value = savedVersion;
  }

  if (!props.modLoader) {
    const savedLoader = localStorage.getItem(STORAGE_KEYS.LOADER);
    if (savedLoader) selectedLoader.value = savedLoader;
  }

  const savedSort = localStorage.getItem(STORAGE_KEYS.SORT);
  if (savedSort) selectedSortField.value = parseInt(savedSort);

  // Load Saved Release Types
  const savedTypes = localStorage.getItem(STORAGE_KEYS.RELEASE_TYPES);
  if (savedTypes) {
    try {
      const types = JSON.parse(savedTypes);
      filterRelease.value = types.release ?? true;
      filterBeta.value = types.beta ?? false;
      filterAlpha.value = types.alpha ?? false;
    } catch (e) {
      log.error("Failed to parse release types from localStorage:", e);
      localStorage.removeItem(STORAGE_KEYS.RELEASE_TYPES);
    }
  }

  if (hasApiKey.value) {
    try {
      const cfCategories = await window.api.curseforge.getCategories(
        selectedContentType.value
      );
      categories.value = [
        { value: 0, label: "All Categories" },
        ...cfCategories.map((cat: CFCategory) => ({ value: cat.id, label: cat.name })),
      ];
    } catch (err) {
      log.error("Failed to load categories", { error: String(err) });
    }
    if (props.open) loadPopular();
  }
});

// Reload categories and results when content type changes
watch(selectedContentType, async (newType) => {
  if (!hasApiKey.value) return;

  // Reset category selection
  selectedCategory.value = 0;

  // Reload categories for new content type
  try {
    const cfCategories = await window.api.curseforge.getCategories(newType);
    categories.value = [
      { value: 0, label: "All Categories" },
      ...cfCategories.map((cat: CFCategory) => ({ value: cat.id, label: cat.name })),
    ];
  } catch (err) {
    log.error("Failed to load categories", { error: String(err) });
  }

  // Reload search results
  if (searchQuery.value.trim()) {
    searchMods();
  } else {
    loadPopular();
  }
});

watch([selectedVersion, selectedLoader], ([v, l]) => {
  if (v) localStorage.setItem(STORAGE_KEYS.VERSION, v);
  else localStorage.removeItem(STORAGE_KEYS.VERSION);
  if (l) localStorage.setItem(STORAGE_KEYS.LOADER, l);
  else localStorage.removeItem(STORAGE_KEYS.LOADER);
});

watch(selectedSortField, (newVal) => {
  localStorage.setItem(STORAGE_KEYS.SORT, newVal.toString());
});

watch([filterRelease, filterBeta, filterAlpha], () => {
  localStorage.setItem(
    STORAGE_KEYS.RELEASE_TYPES,
    JSON.stringify({
      release: filterRelease.value,
      beta: filterBeta.value,
      alpha: filterAlpha.value,
    })
  );
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      // Reset content type to initial when opening
      if (props.initialContentType) {
        selectedContentType.value = props.initialContentType;
      }
      // Reset version/loader if provided
      if (props.gameVersion) {
        selectedVersion.value = props.gameVersion;
      }
      if (props.modLoader) {
        selectedLoader.value = props.modLoader;
      }
      // Set locked modpack if provided
      if (props.lockedModpackId) {
        targetModpackId.value = props.lockedModpackId;
      }
      if (hasApiKey.value && searchResults.value.length === 0) {
        loadPopular();
      }
    } else {
      // Reset state when dialog closes
      selectedModIds.value.clear();
      selectedFilesMap.value.clear();
      isSelectionMode.value = false;
      // Reset targetModpackId only if not locked
      if (!props.lockedModpackId) {
        targetModpackId.value = null;
      }
    }
  }
);

// --- Selection Logic ---

function toggleModHeaderSelection(modId: number) {
  // Block selecting already installed mods
  if (isModInstalled(modId)) return;

  // If we uncheck header, we keep file selections if any (or clear them? User said "allows selecting specific versions", usually implies clear or keep. Let's clear to avoid confusion or keep as is.
  // Actually, if we CHECK header, we should probably clear any individual file selections for this mod to avoid double-adding.
  if (selectedModIds.value.has(modId)) {
    selectedModIds.value.delete(modId);
  } else {
    selectedModIds.value.add(modId);
    // Remove any individual file selections for this mod
    // We need to iterate over selectedFileIds and remove those belonging to this mod.
    // Since we store only ID, we might need a map. But for now, let's just leave them or clear all if feasible.
    // For simpler logic: if Header is selected, we IGNORE individual selections for this mod during 'Add'.
  }
}

function toggleFileSelection(fileId: number) {
  if (selectedFileIds.value.has(fileId)) {
    selectedFileIds.value.delete(fileId);
  } else {
    selectedFileIds.value.add(fileId);
  }
}

function selectAll() {
  searchResults.value.forEach((mod) => {
    // Skip already installed mods
    if (!isModInstalled(mod.id)) {
      selectedModIds.value.add(mod.id);
    }
  });
}

function deselectAll() {
  selectedModIds.value.clear();
  selectedFileIds.value.clear();
}

// Bulk Add
async function addSelectedMods() {
  if (selectedModIds.value.size === 0 && selectedFileIds.value.size === 0)
    return;

  isAddingBulk.value = true;
  const successCount = ref(0);
  const failCount = ref(0);

  try {
    // 1. Process Header Selections (Quick Download Latest Release)
    for (const modId of selectedModIds.value) {
      try {
        const mod = searchResults.value.find((m) => m.id === modId);
        if (!mod) continue;

        // For shaders/resourcepacks, don't filter by loader
        const isModContent = selectedContentType.value === "mods";

        // Fetch latest release
        const files = await window.api.curseforge.getModFiles(mod.id, {
          gameVersion: selectedVersion.value || undefined,
          modLoader: isModContent
            ? selectedLoader.value || undefined
            : undefined,
        });

        // Filter for Release type specifically for "Quick Download"
        // Also filter by game version for shaders/resourcepacks
        let releaseFile = files.find((f: CFFile) => {
          if (f.releaseType !== 1) return false;
          // For non-mods, verify game version is in the file's gameVersions list
          if (!isModContent && selectedVersion.value) {
            return f.gameVersions?.some(
              (gv: string) =>
                gv === selectedVersion.value ||
                gv.startsWith(selectedVersion.value + ".") ||
                selectedVersion.value.startsWith(gv + ".")
            );
          }
          return true;
        });

        // Fallback to first file if no release found
        if (!releaseFile) {
          releaseFile = files[0];
        }

        if (!releaseFile) {
          failCount.value++;
          continue;
        }

        const addedMod = await window.api.curseforge.addToLibrary(
          mod.id,
          releaseFile.id,
          isModContent ? selectedLoader.value || undefined : undefined,
          selectedContentType.value
        );

        if (addedMod) {
          successCount.value++;
        } else {
          failCount.value++;
        }
      } catch (err) {
        log.error("Failed to add mod", { modId, error: String(err) });
        failCount.value++;
      }
    }

    // 2. Process Individual File Selections
    // Note: If a mod header was selected, we should skip its individual files to prevent double install.
    // However, finding which file belongs to which mod is tricky without a map.
    // But typically user won't check both due to UI disabling.

    // We need a helper to know mod ID for a file ID, or we fetch file details.
    // To simplify: we iterate search results, look at their fetched files (if cached) or we might have to re-fetch if we didn't store mapping.
    // IMPROVEMENT: Store file->mod mapping when fetching files.

    // For now, let's assume we can find the file in the currently expanded modFiles if currently visible.
    // But if user expanded multiple mods?
    // Let's iterate searchResults => expanded => check file IDs.

    // Actually, simpler approach: We only allow selecting files in EXPANDED accordions.
    // And we have 'modFiles' which is just for the ONE expanded mod?
    // Wait, the current implementation of 'toggleExpand' only keeps ONE mod expanded at a time?
    // "expandedModId.value = mod.id" => Yes, only one.
    // So 'selectedFileIds' only makes sense for the CURRENTLY expanded mod effectively, unless we persist files?
    // If we close accordion, do we want to keep selection? Yes ideally.
    // We need a map of modId -> files list cache if we want to support global multi-file selection.

    // *Limitation Fix*: To support multi-mod file selection, we need to cache files for visited mods.
    // Let's assume we do best effort or fetch on demand.

    // For this implementation, we will iterate all selectedFileIds. We need their Mod IDs.
    // We can store composite keys "modId-fileId" in the Set or use a map.
    // Let's switch selectedFileIds to a Map<number, number> (fileId -> modId).
  } finally {
    isAddingBulk.value = false;
    selectedModIds.value.clear();
    selectedFileIds.value.clear(); // Using Set for now, logic below handles composite if needed
    // Emit 'added' event just once or per mod? The parent refreshes library.
    emit("added", null);
  }
}

// Fixed addSelectedMods for the current scope (using header selection mainly)
// For the file selection: We will update the state to store {fileId, modId}
const selectedFilesMap = ref<Map<number, number>>(new Map()); // FileID -> ModID

function toggleFileSelectionMap(fileId: number, modId: number) {
  if (selectedFilesMap.value.has(fileId)) {
    selectedFilesMap.value.delete(fileId);
  } else {
    selectedFilesMap.value.set(fileId, modId);
  }
}

async function executeBulkAdd() {
  if (selectedModIds.value.size === 0 && selectedFilesMap.value.size === 0)
    return;
  isAddingBulk.value = true;

  const addedModIds: string[] = [];

  // Get target modpack if selected (for compatibility validation)
  const targetPack = targetModpackId.value
    ? allModpacks.value.find((p) => p.id === targetModpackId.value)
    : null;

  // For shaders/resourcepacks, don't use loader
  const isModContent = selectedContentType.value === "mods";

  try {
    // 1. Header Selections
    for (const modId of selectedModIds.value) {
      const mod = searchResults.value.find((m) => m.id === modId);
      if (!mod) continue;
      const files = await window.api.curseforge.getModFiles(mod.id, {
        gameVersion: selectedVersion.value || undefined,
        modLoader: isModContent ? selectedLoader.value || undefined : undefined,
      });

      // Find release file with proper version matching for non-mods
      let releaseFile = files.find((f: CFFile) => {
        if (f.releaseType !== 1) return false;
        if (!isModContent && selectedVersion.value) {
          return f.gameVersions?.some(
            (gv: string) =>
              gv === selectedVersion.value ||
              gv.startsWith(selectedVersion.value + ".") ||
              selectedVersion.value.startsWith(gv + ".")
          );
        }
        return true;
      });
      if (!releaseFile) releaseFile = files[0];

      if (releaseFile) {
        const added = await window.api.curseforge.addToLibrary(
          mod.id,
          releaseFile.id,
          isModContent ? selectedLoader.value || undefined : undefined,
          selectedContentType.value
        );
        if (added) {
          addedModIds.push(added.id);
        }
      }
    }

    // 2. File Selections
    for (const [fileId, modId] of selectedFilesMap.value) {
      // Skip if mod header was already selected (optimization)
      if (selectedModIds.value.has(modId)) continue;

      const mod = searchResults.value.find((m) => m.id === modId);
      if (!mod) continue;

      const added = await window.api.curseforge.addToLibrary(
        mod.id,
        fileId,
        isModContent ? selectedLoader.value || undefined : undefined,
        selectedContentType.value
      );
      if (added) {
        addedModIds.push(added.id);
      }
    }

    // 3. Add to target modpack if selected
    if (targetModpackId.value && addedModIds.length > 0) {
      let addedToPackCount = 0;
      let skippedCount = 0;

      for (const modId of addedModIds) {
        try {
          await window.api.modpacks.addMod(targetModpackId.value, modId);
          addedToPackCount++;
        } catch (err) {
          // Mod might be incompatible with modpack
          log.warn("Skipped adding mod to modpack", { modId, modpackId: targetModpackId.value, error: String(err) });
          skippedCount++;
        }
      }

      if (addedToPackCount > 0) {
        log.info("Bulk added mods to modpack", { addedCount: addedToPackCount, skippedCount });
        toast.success(
          "Added to Modpack",
          `${addedToPackCount} mod(s) added to ${targetPack?.name || "modpack"
          }${skippedCount > 0 ? `, ${skippedCount} skipped (incompatible)` : ""
          }`
        );
      } else if (skippedCount > 0) {
        toast.error(
          "Incompatible Mods",
          `All ${skippedCount} mods were incompatible with the modpack`
        );
      }
    }

    emit("added", null, addedModIds);
  } catch (e) {
    log.error("Bulk add failed", { error: String(e) });
    toast.error("Couldn't add", (e as Error).message);
  } finally {
    isAddingBulk.value = false;
    selectedModIds.value.clear();
    selectedFilesMap.value.clear();
    isSelectionMode.value = false;
  }
}

// Regular Actions
async function loadPopular() {
  if (!hasApiKey.value) return;
  isSearching.value = true;
  currentPage.value = 0;
  try {
    const result = await window.api.curseforge.search({
      query: undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: 0,
      contentType: selectedContentType.value,
    });
    searchResults.value = result.mods;
    totalResults.value = result.pagination.totalCount;
  } catch (err) {
    log.error("Failed to load popular", { error: String(err) });
  } finally {
    isSearching.value = false;
  }
}

async function searchMods() {
  if (!hasApiKey.value) return;
  log.info("Searching CurseForge", {
    query: searchQuery.value,
    version: selectedVersion.value,
    loader: selectedLoader.value,
    contentType: selectedContentType.value
  });
  const startTime = Date.now();
  isSearching.value = true;
  currentPage.value = 0;
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: 0,
      contentType: selectedContentType.value,
    });
    searchResults.value = result.mods;
    totalResults.value = result.pagination.totalCount;
    log.info("Search completed", {
      resultsCount: result.mods.length,
      totalCount: result.pagination.totalCount,
      durationMs: Date.now() - startTime
    });
  } catch (err) {
    log.error("Search failed", { error: String(err) });
  } finally {
    isSearching.value = false;
  }
}

async function loadMore() {
  if (!hasApiKey.value || isSearching.value) return;
  isSearching.value = true;
  currentPage.value++;
  log.debug("Loading more results", { page: currentPage.value });
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      categoryId: selectedCategory.value || undefined,
      sortField: selectedSortField.value,
      pageSize,
      index: currentPage.value * pageSize,
      contentType: selectedContentType.value,
    });
    searchResults.value = [...searchResults.value, ...result.mods];
    log.debug("Loaded more results", { newCount: result.mods.length });
  } catch (err) {
    currentPage.value--;
    log.error("Failed to load more results", { error: String(err) });
  } finally {
    isSearching.value = false;
  }
}

// Expand & Fetch
async function toggleExpand(mod: CFMod) {
  if (expandedModId.value === mod.id) {
    expandedModId.value = null;
    modFiles.value = [];
    return;
  }
  expandedModId.value = mod.id;
  modFiles.value = [];
  await fetchModFiles(mod.id);
}

async function fetchModFiles(modId: number) {
  log.debug("Fetching mod files", { modId });
  isLoadingFiles.value = true;
  try {
    // For shaders/resourcepacks, don't filter by loader
    const isModContent = selectedContentType.value === "mods";
    const files = await window.api.curseforge.getModFiles(modId, {
      gameVersion: selectedVersion.value || undefined,
      modLoader: isModContent ? selectedLoader.value || undefined : undefined,
    });
    // Sort by date desc
    modFiles.value = files.sort(
      (a: CFFile, b: CFFile) =>
        new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
    );
    log.debug("Mod files loaded", { modId, filesCount: files.length });
  } catch (err) {
    log.error("Failed to fetch mod files", { modId, error: String(err) });
  } finally {
    isLoadingFiles.value = false;
  }
}

// Filtered Files (Release Type + Loader Strict Filter - only for mods)
const filteredModFiles = computed(() => {
  const isModContent = selectedContentType.value === "mods";

  return modFiles.value.filter((f) => {
    // Filter by release type
    if (f.releaseType === 1 && !filterRelease.value) return false;
    if (f.releaseType === 2 && !filterBeta.value) return false;
    if (f.releaseType === 3 && !filterAlpha.value) return false;

    // Strict loader filter: only apply for mods content type
    // Resourcepacks and shaders don't have loaders
    if (isModContent && selectedLoader.value) {
      const loaderLower = selectedLoader.value.toLowerCase();
      const fileLoaders = (f.gameVersions || []).map((gv: string) =>
        gv.toLowerCase()
      );
      if (!fileLoaders.includes(loaderLower)) {
        return false;
      }
    }

    // For shaders/resourcepacks, filter by game version if selected
    // Check if the file's gameVersions list contains the selected version
    if (!isModContent && selectedVersion.value) {
      const fileVersions = f.gameVersions || [];
      const hasMatchingVersion = fileVersions.some(
        (gv: string) =>
          gv === selectedVersion.value ||
          gv.startsWith(selectedVersion.value + ".") ||
          selectedVersion.value.startsWith(gv + ".")
      );
      if (!hasMatchingVersion) {
        return false;
      }
    }

    return true;
  });
});

function isFileInstalled(modId: number, fileId: number): boolean {
  return props.installedProjectFiles?.get(modId)?.has(fileId) || false;
}

function isModInstalled(modId: number): boolean {
  return props.installedProjectFiles?.has(modId) || false;
}

// Get the latest file ID from latestFilesIndexes that matches current filters
// Priority: Release (1) > Beta (2) > Alpha (3)
function getLatestFileId(mod: CFMod): number | null {
  if (!mod.latestFilesIndexes?.length) return null;

  const isModContent = selectedContentType.value === "mods";

  // Helper to check if a file matches current filters
  const matchesFilters = (f: CFFileIndex): boolean => {
    // For mods, filter by loader
    if (isModContent && selectedLoader.value) {
      const loaderMap: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
      const targetLoaderId = loaderMap[selectedLoader.value.toLowerCase()];
      if (targetLoaderId && f.modLoader !== targetLoaderId && f.modLoader !== 0) return false;
    }

    // Filter by game version if set
    if (selectedVersion.value) {
      if (f.gameVersion !== selectedVersion.value &&
        !f.gameVersion?.startsWith(selectedVersion.value + ".") &&
        !selectedVersion.value.startsWith(f.gameVersion + ".")) {
        return false;
      }
    }

    return true;
  };

  // Try to find files in priority order: Release > Beta > Alpha
  for (const releaseType of [1, 2, 3]) {
    const matchingFile = mod.latestFilesIndexes.find((f: CFFileIndex) =>
      f.releaseType === releaseType && matchesFilters(f)
    );
    if (matchingFile) return matchingFile.fileId;
  }

  // Fallback: try any file type without filters
  for (const releaseType of [1, 2, 3]) {
    const fallbackFile = mod.latestFilesIndexes.find((f: CFFileIndex) => f.releaseType === releaseType);
    if (fallbackFile) return fallbackFile.fileId;
  }

  return null;
}

// Check if the latest file for a mod is already installed
function isLatestFileInstalled(mod: CFMod): boolean {
  const latestFileId = getLatestFileId(mod);
  if (!latestFileId) return false;
  return isFileInstalled(mod.id, latestFileId);
}

async function addFileToLibrary(mod: CFMod, file: CFFile) {
  isAddingMod.value = mod.id;
  log.info("Adding file to library", { modId: mod.id, modName: mod.name, fileId: file.id });
  try {
    // For shaders/resourcepacks, don't pass loader
    const isModContent = selectedContentType.value === "mods";

    const addedMod = await window.api.curseforge.addToLibrary(
      mod.id,
      file.id,
      isModContent ? selectedLoader.value || undefined : undefined,
      selectedContentType.value
    );
    if (addedMod) {
      log.info("Mod added to library", { modId: mod.id, libraryId: addedMod.id });
      // Add to modpack if selected
      if (targetModpackId.value) {
        try {
          await window.api.modpacks.addMod(targetModpackId.value, addedMod.id);
          const pack = allModpacks.value.find(
            (p) => p.id === targetModpackId.value
          );
          toast.success(
            "Added ✓",
            `${mod.name} is now in ${pack?.name || "your pack"}.`
          );
        } catch (err) {
          toast.error(
            "Couldn't add to pack",
            (err as Error).message
          );
        }
      }

      emit("added", addedMod);
    }
  } catch (err) {
    log.error("Failed to add file to library", { modId: mod.id, fileId: file.id, error: String(err) });
    toast.error("Couldn't add", (err as Error).message);
  } finally {
    isAddingMod.value = null;
  }
}

// Quick Download (Latest file matching filters - Release > Beta > Alpha fallback)
async function quickDownload(mod: CFMod) {
  isAddingMod.value = mod.id;
  try {
    // For shaders/resourcepacks, don't filter by loader
    const isModContent = selectedContentType.value === "mods";

    const files = await window.api.curseforge.getModFiles(mod.id, {
      gameVersion: selectedVersion.value || undefined,
      modLoader: isModContent ? selectedLoader.value || undefined : undefined,
    });

    // Helper to check version match for non-mods
    const matchesVersion = (f: CFFile): boolean => {
      if (!isModContent && selectedVersion.value) {
        return f.gameVersions?.some(
          (gv: string) =>
            gv === selectedVersion.value ||
            gv.startsWith(selectedVersion.value + ".") ||
            selectedVersion.value.startsWith(gv + ".")
        );
      }
      return true;
    };

    // Find file with priority: Release (1) > Beta (2) > Alpha (3)
    let targetFile: CFFile | undefined;
    for (const releaseType of [1, 2, 3]) {
      targetFile = files.find((f: CFFile) => f.releaseType === releaseType && matchesVersion(f));
      if (targetFile) break;
    }

    // Ultimate fallback: first file in the list
    if (!targetFile) targetFile = files[0];

    if (!targetFile) return;

    const addedMod = await window.api.curseforge.addToLibrary(
      mod.id,
      targetFile.id,
      isModContent ? selectedLoader.value || undefined : undefined,
      selectedContentType.value
    );
    if (addedMod) {
      log.info("Quick download successful", { modId: mod.id, fileId: targetFile.id });
      // Add to modpack if selected
      if (targetModpackId.value) {
        try {
          await window.api.modpacks.addMod(targetModpackId.value, addedMod.id);
          const pack = allModpacks.value.find(
            (p) => p.id === targetModpackId.value
          );
          toast.success(
            "Added ✓",
            `${mod.name} is now in ${pack?.name || "your pack"}.`
          );
        } catch (err) {
          toast.error(
            "Couldn't add to pack",
            (err as Error).message
          );
        }
      }

      emit("added", addedMod);
    }
  } catch (err) {
    log.error("Quick download failed", { modId: mod.id, error: String(err) });
    toast.error("Couldn't add", (err as Error).message);
  } finally {
    isAddingMod.value = null;
  }
}

function openModPage(mod: CFMod) {
  if (mod.slug) {
    const urlPaths: Record<string, string> = {
      mods: "mc-mods",
      resourcepacks: "texture-packs",
      shaders: "shaders",
    };
    const path = urlPaths[selectedContentType.value] || "mc-mods";
    window.open(
      `https://www.curseforge.com/minecraft/${path}/${mod.slug}`,
      "_blank"
    );
  }
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return count.toString();
}

function getAuthors(mod: any): string {
  if (!mod.authors?.length) return "Unknown";
  return mod.authors.map((a: any) => a.name).join(", ");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

// Debounce Search
let searchTimeout: ReturnType<typeof setTimeout>;
function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (searchQuery.value.trim()) searchMods();
    else loadPopular();
  }, 500);
}

const hasMore = computed(() => searchResults.value.length < totalResults.value);

function getReleaseColor(type: number) {
  if (type === 1) return "bg-primary/10 text-primary border-primary/20";
  if (type === 2) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  return "bg-orange-500/10 text-orange-500 border-orange-500/20";
}
</script>

<template>
  <component :is="fullScreen ? 'div' : Dialog" v-if="!fullScreen || open" :open="open" @close="emit('close')"
    maxWidth="6xl" contentClass="p-0 border-none bg-transparent shadow-none"
    :class="fullScreen ? 'relative h-full' : ''">
    <div :class="[
      'flex flex-col overflow-hidden bg-background relative',
      fullScreen ? 'h-screen w-full' : 'h-[90vh] md:h-[80vh] rounded-xl border border-border shadow-2xl'
    ]">

      <!-- Fullscreen Header with Back Button -->
      <div v-if="fullScreen" class="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <Button variant="ghost" size="sm" @click="emit('close')" class="gap-2">
          <Icon name="ArrowLeft" class="w-4 h-4" />
          Back
        </Button>
        <div class="h-4 w-px bg-border"></div>
        <h1 class="text-lg font-semibold">Browse CurseForge</h1>
      </div>

      <div class="flex flex-1 flex-col overflow-hidden">
        <!-- Collapsible Filter Bar -->
        <div class="border-b border-border bg-muted/10">
          <!-- Filter Toggle Header -->
          <button @click="isFilterSidebarCollapsed = !isFilterSidebarCollapsed"
            class="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
            <span class="flex items-center gap-2 text-sm font-medium">
              <Icon name="Filter" class="w-4 h-4 text-primary" />
              Filters
              <!-- Active filters badges -->
              <span v-if="selectedContentType !== 'mods'"
                class="px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400">
                {{ selectedContentType === 'resourcepacks' ? 'Packs' : 'Shaders' }}
              </span>
              <span v-if="selectedVersion" class="px-2 py-0.5 text-xs rounded-full bg-primary/15 text-primary">
                {{ selectedVersion }}
              </span>
              <span v-if="selectedLoader && selectedContentType === 'mods'" class="px-2 py-0.5 text-xs rounded-full"
                :class="selectedLoader.includes('forge') ? 'bg-orange-500/15 text-orange-400' : 'bg-blue-500/15 text-blue-400'">
                {{ selectedLoader }}
              </span>
              <span v-if="selectedCategory" class="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                {{categories.find(c => c.value === selectedCategory)?.label || selectedCategory}}
              </span>
            </span>
            <Icon name="ChevronDown" class="w-4 h-4 transition-transform duration-200"
              :class="!isFilterSidebarCollapsed ? 'rotate-180' : ''" />
          </button>

          <!-- Expanded Filters Panel -->
          <div class="overflow-hidden transition-all duration-300"
            :class="isFilterSidebarCollapsed ? 'max-h-0' : 'max-h-[500px]'">
            <div class="p-4 pt-0 space-y-4">
              <!-- Row 1: Content Type + Basic Filters -->
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <!-- Content Type -->
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Type
                    <span v-if="lockFilters" class="text-[10px] text-amber-500">(locked)</span>
                  </label>
                  <div class="flex gap-1">
                    <button
                      class="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1"
                      :class="selectedContentType === 'mods'
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'" :disabled="lockFilters"
                      @click="!lockFilters && (selectedContentType = 'mods')">
                      <Icon name="Layers" class="w-3 h-3" />
                      Mods
                    </button>
                    <button
                      class="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1"
                      :class="selectedContentType === 'resourcepacks'
                        ? 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'" :disabled="lockFilters"
                      @click="!lockFilters && (selectedContentType = 'resourcepacks')">
                      <Icon name="Image" class="w-3 h-3" />
                      Packs
                    </button>
                    <button
                      class="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1"
                      :class="selectedContentType === 'shaders'
                        ? 'bg-pink-500/15 text-pink-500 ring-1 ring-pink-500/30'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'" :disabled="lockFilters"
                      @click="!lockFilters && (selectedContentType = 'shaders')">
                      <Icon name="Sparkles" class="w-3 h-3" />
                      Shaders
                    </button>
                  </div>
                </div>

                <!-- Game Version -->
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Version
                    <span v-if="lockFilters" class="text-[10px] text-amber-500">(locked)</span>
                  </label>
                  <div class="relative">
                    <select v-model="selectedVersion" :disabled="lockFilters"
                      class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs focus:ring-1 focus:ring-primary appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                      @change="searchQuery ? searchMods() : loadPopular()">
                      <option value="" class="bg-popover text-popover-foreground">All</option>
                      <option v-for="v in gameVersions.filter(Boolean)" :key="v" :value="v"
                        class="bg-popover text-popover-foreground">{{ v }}</option>
                    </select>
                    <Icon name="ChevronDown"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                  </div>
                </div>

                <!-- Mod Loader (only for mods) -->
                <div v-if="selectedContentType === 'mods'" class="space-y-1.5">
                  <label
                    class="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Loader
                    <span v-if="lockFilters" class="text-[10px] text-amber-500">(locked)</span>
                  </label>
                  <div class="relative">
                    <select v-model="selectedLoader" :disabled="lockFilters"
                      class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs focus:ring-1 focus:ring-primary appearance-none disabled:opacity-60 disabled:cursor-not-allowed"
                      @change="searchQuery ? searchMods() : loadPopular()">
                      <option v-for="l in modLoaders" :key="l.value" :value="l.value"
                        class="bg-popover text-popover-foreground">{{ l.label }}</option>
                    </select>
                    <Icon name="ChevronDown"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                  </div>
                </div>

                <!-- Category -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
                  <div class="relative">
                    <select v-model="selectedCategory"
                      class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs focus:ring-1 focus:ring-primary appearance-none"
                      @change="searchQuery ? searchMods() : loadPopular()">
                      <option v-for="c in categories" :key="c.value" :value="c.value"
                        class="bg-popover text-popover-foreground">{{ c.label }}</option>
                    </select>
                    <Icon name="ChevronDown"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                  </div>
                </div>

                <!-- Sort -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sort By</label>
                  <div class="relative">
                    <select v-model="selectedSortField"
                      class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs focus:ring-1 focus:ring-primary appearance-none"
                      @change="searchQuery ? searchMods() : loadPopular()">
                      <option v-for="s in sortFields" :key="s.value" :value="s.value"
                        class="bg-popover text-popover-foreground">{{ s.label }}</option>
                    </select>
                    <Icon name="ChevronDown"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                  </div>
                </div>
              </div>

              <!-- Row 2: Release Channels + Target Options -->
              <div class="flex flex-wrap items-end gap-4">
                <!-- Release Channels -->
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channels</label>
                  <div class="flex gap-1.5">
                    <label
                      class="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-all select-none"
                      :class="filterRelease ? 'bg-primary/15 ring-1 ring-primary/30' : 'bg-muted/50 hover:bg-muted'">
                      <input type="checkbox" v-model="filterRelease" class="sr-only" />
                      <div class="w-2.5 h-2.5 rounded-full bg-primary" />
                      <span class="text-xs font-medium"
                        :class="filterRelease ? 'text-primary' : 'text-muted-foreground'">Release</span>
                    </label>
                    <label
                      class="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-all select-none"
                      :class="filterBeta ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'bg-muted/50 hover:bg-muted'">
                      <input type="checkbox" v-model="filterBeta" class="sr-only" />
                      <div class="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span class="text-xs font-medium"
                        :class="filterBeta ? 'text-blue-400' : 'text-muted-foreground'">Beta</span>
                    </label>
                    <label
                      class="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-all select-none"
                      :class="filterAlpha ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'bg-muted/50 hover:bg-muted'">
                      <input type="checkbox" v-model="filterAlpha" class="sr-only" />
                      <div class="w-2.5 h-2.5 rounded-full bg-orange-500" />
                      <span class="text-xs font-medium"
                        :class="filterAlpha ? 'text-orange-400' : 'text-muted-foreground'">Alpha</span>
                    </label>
                  </div>
                </div>

                <!-- Separator -->
                <div class="hidden sm:block h-8 w-px bg-border"></div>

                <!-- Add to Modpack -->
                <div class="space-y-1.5 min-w-[180px]">
                  <label
                    class="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Icon name="Package" class="w-3 h-3" />
                    Add to Modpack
                    <span v-if="lockedModpackId" class="text-[10px] text-amber-500">(locked)</span>
                  </label>
                  <template v-if="lockedModpackId">
                    <div class="relative">
                      <select v-model="targetModpackId" disabled
                        class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs appearance-none opacity-60 cursor-not-allowed">
                        <option v-for="pack in allModpacks.filter(p => p.id === lockedModpackId)" :key="pack.id"
                          :value="pack.id">
                          {{ pack.name }}
                        </option>
                      </select>
                      <Icon name="ChevronDown"
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                    </div>
                  </template>
                  <template v-else-if="selectedVersion && selectedLoader">
                    <div class="relative">
                      <select v-model="targetModpackId"
                        class="w-full h-8 pl-2 pr-6 rounded-md border border-input bg-background/50 text-xs focus:ring-1 focus:ring-primary appearance-none">
                        <option :value="null">Library Only</option>
                        <option v-for="pack in compatibleModpacks" :key="pack.id" :value="pack.id">{{ pack.name }}
                        </option>
                      </select>
                      <Icon name="ChevronDown"
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50 pointer-events-none" />
                    </div>
                  </template>
                  <div v-else class="text-xs text-amber-500/80 italic">Set version & loader</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          <!-- Search Header -->
          <div
            class="p-3 md:p-4 border-b border-border flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
            <div class="relative flex-1">
              <Icon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input v-model="searchQuery" type="text" placeholder="Search mods..."
                class="w-full h-9 sm:h-10 pl-10 pr-4 rounded-lg border bg-input/50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all text-sm"
                @input="onSearchInput" @keyup.enter="searchMods" />
            </div>

            <!-- Bulk Actions (Only Visible when Selection Mode ON) -->
            <div v-if="isSelectionMode"
              class="flex items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-right-4 duration-200">
              <div class="hidden sm:block h-8 w-px bg-border mx-1"></div>

              <Button @click="executeBulkAdd" :disabled="isAddingBulk ||
                (selectedModIds.size === 0 && selectedFilesMap.size === 0)
                " size="sm" class="gap-2 shadow-lg shadow-primary/20 flex-1 sm:flex-none">
                <Icon v-if="isAddingBulk" name="Loader2" class="w-4 h-4 animate-spin" />
                <Icon v-else name="ArrowDownToLine" class="w-4 h-4" />
                <span class="hidden xs:inline">Install</span> ({{
                  selectedModIds.size + selectedFilesMap.size
                }})
              </Button>

              <Button variant="ghost" size="sm" @click="isSelectionMode = false">Cancel</Button>
            </div>

            <Button v-else variant="outline" size="sm" @click="isSelectionMode = true" class="gap-2">
              <Icon name="CheckSquare" class="w-4 h-4" /> <span class="hidden sm:inline">Select Multiple</span>
            </Button>

            <template v-if="!fullScreen">
              <div class="h-8 w-px bg-border mx-1"></div>

              <Button variant="ghost" size="icon" @click="emit('close')" title="Close">
                <Icon name="X" class="w-5 h-5" />
              </Button>
            </template>
          </div>

          <!-- Results Area -->
          <div class="flex-1 overflow-y-auto p-4 relative">
            <!-- API Warning -->
            <div v-if="!hasApiKey"
              class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-background/80 z-10">
              <Icon name="AlertTriangle" class="w-12 h-12 text-yellow-500 mb-4" />
              <h3 class="text-xl font-bold mb-2">API Key Required</h3>
              <p class="text-muted-foreground max-w-md mb-6">
                You need a CurseForge API key to browse and download mods. Please
                add it in Settings.
              </p>
              <a href="https://console.curseforge.com/" target="_blank" class="text-primary hover:underline">Get API
                Key</a>
            </div>

            <!-- Loading -->
            <div v-if="isSearching" class="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Icon name="Loader2" class="w-10 h-10 animate-spin text-primary" />
            </div>

            <!-- List -->
            <div v-if="searchResults.length > 0" class="flex flex-col gap-3">
              <div v-for="mod in searchResults" :key="mod.id"
                class="group border border-border rounded-xl bg-card overflow-hidden transition-all duration-200"
                :class="{
                  'ring-2 ring-primary/50 shadow-lg shadow-primary/5':
                    expandedModId === mod.id,
                  'ring-1 ring-primary bg-primary/5':
                    isSelectionMode && selectedModIds.has(mod.id),
                }">
                <!-- Mod Header -->
                <div class="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/30 transition-colors relative"
                  @click="toggleExpand(mod)">
                  <!-- Checkbox for Bulk Selection -->
                  <button v-if="isSelectionMode && !isModInstalled(mod.id)"
                    @click.stop="toggleModHeaderSelection(mod.id)"
                    class="p-1 rounded hover:bg-background transition-colors mr-1" title="Select Latest Release">
                    <div class="w-5 h-5 border rounded flex items-center justify-center transition-all" :class="selectedModIds.has(mod.id)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30 bg-background'
                      ">
                      <Icon v-if="selectedModIds.has(mod.id)" name="Check" class="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <!-- Disabled checkbox for installed mods in selection mode -->
                  <div v-else-if="isSelectionMode && isModInstalled(mod.id)"
                    class="p-1 mr-1 opacity-50 cursor-not-allowed" title="Already installed">
                    <div
                      class="w-5 h-5 border rounded flex items-center justify-center border-muted-foreground/30 bg-muted/50">
                      <Icon name="Check" class="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>

                  <!-- Icon -->
                  <div class="w-12 h-12 rounded-lg bg-muted border border-border overflow-hidden shrink-0">
                    <img v-if="mod.logo?.thumbnailUrl" :src="mod.logo.thumbnailUrl"
                      class="w-full h-full object-cover" />
                    <Icon v-else name="Star" class="w-6 h-6 m-auto text-muted-foreground/30" />
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="font-bold text-base truncate">{{ mod.name }}</h4>
                      <span v-if="isModInstalled(mod.id)"
                        class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5">
                        <Icon name="Check" class="w-3 h-3" /> INSTALLED
                      </span>
                    </div>
                    <p class="text-sm text-muted-foreground truncate">
                      {{ mod.summary }}
                    </p>

                    <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span class="flex items-center gap-1"><span class="font-medium text-foreground">{{
                        formatDownloads(mod.downloadCount)
                          }}</span>
                        downloads</span>
                      <span class="w-1 h-1 rounded-full bg-border"></span>
                      <span class="truncate max-w-[150px]">by {{ getAuthors(mod) }}</span>
                      <span class="w-1 h-1 rounded-full bg-border"></span>
                      <span>Updated {{ formatDate(mod.dateModified) }}</span>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex items-center gap-2" v-if="!isSelectionMode">
                    <Button variant="ghost" size="icon" @click.stop="viewModDetails(mod, $event)" title="View Details">
                      <Icon name="Eye" class="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" @click.stop="openModPage(mod)" title="View on CurseForge">
                      <Icon name="ExternalLink" class="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button :class="isLatestFileInstalled(mod) ? '' : 'gap-1.5'" class="min-w-[90px]" size="sm"
                      :variant="isLatestFileInstalled(mod) ? 'secondary' : 'default'"
                      :disabled="isAddingMod === mod.id || isLatestFileInstalled(mod)" @click.stop="quickDownload(mod)">
                      <Icon v-if="isAddingMod === mod.id" name="Loader2" class="w-4 h-4 animate-spin" />
                      <template v-else-if="isLatestFileInstalled(mod)">
                        <Icon name="Check" class="w-4 h-4 mr-1" />
                        <span>Installed</span>
                      </template>
                      <template v-else>
                        <Icon name="ArrowDownToLine" class="w-4 h-4" />
                        <span>Latest</span>
                      </template>
                    </Button>
                  </div>

                  <Icon name="ChevronDown" class="w-5 h-5 text-muted-foreground/50 transition-transform duration-300"
                    :class="{ 'rotate-180': expandedModId === mod.id }" />
                </div>

                <!-- Accordion Body -->
                <div v-if="expandedModId === mod.id"
                  class="border-t border-border bg-muted/20 animate-in slide-in-from-top-2 duration-200">
                  <div v-if="isLoadingFiles" class="flex justify-center p-8">
                    <Icon name="Loader2" class="w-8 h-8 animate-spin text-muted-foreground/50" />
                  </div>
                  <div v-else-if="filteredModFiles.length === 0" class="p-8 text-center text-muted-foreground text-sm">
                    No files found matching current filters.
                  </div>
                  <div v-else class="p-2 space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                    <div v-for="file in filteredModFiles" :key="file.id"
                      class="flex items-center gap-3 p-2 rounded-lg hover:bg-background border border-transparent hover:border-border transition-all group/file"
                      :class="{
                        'opacity-60 grayscale cursor-not-allowed':
                          isSelectionMode && selectedModIds.has(mod.id),
                      }">
                      <!-- Inner Checkbox -->
                      <div v-if="isSelectionMode" class="pl-2" :class="{
                        'pointer-events-none': selectedModIds.has(mod.id),
                      }">
                        <button class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                          :class="selectedFilesMap.has(file.id)
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30 bg-background'
                            " @click.stop="toggleFileSelectionMap(file.id, mod.id)">
                          <Icon v-if="selectedFilesMap.has(file.id)" name="Check" class="w-3 h-3" />
                        </button>
                      </div>

                      <div class="flex-1 grid grid-cols-12 gap-4 items-center text-sm">
                        <div class="col-span-5 font-medium truncate" :title="file.displayName">
                          {{ file.displayName }}
                        </div>
                        <!-- Game versions for shaders/resourcepacks -->
                        <div v-if="selectedContentType !== 'mods'" class="col-span-2">
                          <span v-if="
                            file.gameVersions && file.gameVersions.length > 0
                          " class="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded"
                            :title="file.gameVersions.filter((gv: string) => /^1\.\d+(\.\d+)?$/.test(gv)).join(', ')">
                            {{
                              file.gameVersions
                                .filter((gv: string) =>
                                  /^1\.\d+(\.\d+)?$/.test(gv)
                                )
                                .slice(0, 2)
                                .join(", ")
                            }}
                            <span
                              v-if="file.gameVersions.filter((gv: string) => /^1\.\d+(\.\d+)?$/.test(gv)).length > 2">
                              +{{
                                file.gameVersions.filter((gv: string) =>
                                  /^1\.\d+(\.\d+)?$/.test(gv)
                                ).length - 2
                              }}
                            </span>
                          </span>
                        </div>
                        <div v-else class="col-span-2"></div>
                        <div class="col-span-2 text-xs text-muted-foreground">
                          {{ formatDate(file.fileDate) }}
                        </div>
                        <div class="col-span-2">
                          <span class="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border"
                            :class="getReleaseColor(file.releaseType)">
                            {{
                              file.releaseType === 1
                                ? "Release"
                                : file.releaseType === 2
                                  ? "Beta"
                                  : "Alpha"
                            }}
                          </span>
                        </div>
                        <div class="col-span-1 text-xs text-muted-foreground text-right">
                          {{ (file.fileLength / 1024 / 1024).toFixed(1) }} MB
                        </div>
                      </div>

                      <div v-if="!isSelectionMode" class="flex items-center">
                        <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground mr-1"
                          title="View Changelog" @click.stop="viewChangelog(mod, file)">
                          <Icon name="FileText" class="w-4 h-4" />
                        </Button>

                        <Button size="sm" :variant="isFileInstalled(mod.id, file.id)
                          ? 'secondary'
                          : 'ghost'
                          " class="h-8 w-24 ml-2 text-xs" :disabled="isFileInstalled(mod.id, file.id) ||
                            isAddingMod === mod.id
                            " @click="addFileToLibrary(mod, file)">
                          <Icon v-if="isFileInstalled(mod.id, file.id)" name="Check" class="w-3 h-3 mr-1.5" />
                          {{
                            isFileInstalled(mod.id, file.id)
                              ? "Installed"
                              : "Install"
                          }}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Load More -->
              <div v-if="hasMore" class="flex justify-center py-6">
                <Button variant="outline" @click="loadMore" :disabled="isSearching" class="min-w-[150px]">
                  <Icon v-if="isSearching" name="Loader2" class="w-4 h-4 animate-spin mr-2" />
                  Load More
                </Button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="!isSearching && hasApiKey"
              class="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Icon name="Search" class="w-8 h-8 opacity-50" />
              </div>
              <p>No results found.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ChangelogDialog v-if="selectedChangelogMod" :open="changelogOpen" :mod-id="selectedChangelogMod.id"
      :file-id="selectedChangelogMod.fileId" :mod-name="selectedChangelogMod.name"
      :version="selectedChangelogMod.version" :slug="selectedChangelogMod.slug" @close="changelogOpen = false" />

    <!-- Mod Details Modal -->
    <ModDetailsModal v-if="selectedModForDetails" :open="modDetailsOpen" :mod="selectedModForDetails"
      :full-screen="fullScreen" :context="{
        type: 'browse',
        gameVersion: selectedVersion || undefined,
        loader: selectedLoader || undefined
      }" :readonly="true" :hide-files-tab="true" @close="closeModDetails" />
  </component>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 999px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
</style>
