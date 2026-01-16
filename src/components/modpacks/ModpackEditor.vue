<script setup lang="ts">
import { ref, computed, watch, onMounted, toRef } from "vue";
import { useToast } from "@/composables/useToast";
import { useInstances } from "@/composables/useInstances";
import { useModpackCompatibility } from "@/composables/useModpackCompatibility";
import { useModpackFiltering } from "@/composables/useModpackFiltering";
import { useModpackSelection } from "@/composables/useModpackSelection";
import { useModpackMods } from "@/composables/useModpackMods";
import { useModpackUpdates, type UpdateInfo } from "@/composables/useModpackUpdates";
import { useModpackInstance } from "@/composables/useModpackInstance";
import { useModpackGameLogs } from "@/composables/useModpackGameLogs";
import { useModpackConfigSync } from "@/composables/useModpackConfigSync";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";
import ModUpdateDialog from "@/components/mods/ModUpdateDialog.vue";
import FilePickerDialog from "@/components/mods/FilePickerDialog.vue";
import VersionHistoryPanel from "@/components/modpacks/VersionHistoryPanel.vue";
import ModpackAnalysisPanel from "@/components/modpacks/ModpackAnalysisPanel.vue";
import RecommendationsPanel from "@/components/modpacks/RecommendationsPanel.vue";
import UpdateReviewDialog from "@/components/modpacks/UpdateReviewDialog.vue";
import ConfigBrowser from "@/components/configs/ConfigBrowser.vue";
import ConfigStructuredEditor from "@/components/configs/ConfigStructuredEditor.vue";
import UpdateAvailableBanner from "@/components/modpacks/UpdateAvailableBanner.vue";
import CurseForgeSearch from "@/components/mods/CurseForgeSearch.vue";
import ModDetailsModal from "@/components/mods/ModDetailsModal.vue";
import ChangelogDialog from "@/components/mods/ChangelogDialog.vue";
import type { Mod, Modpack, ModpackChange, RemoteUpdateResult, FrontendUpdateResult, ModexInstance, InstanceSyncResult, ConfigFile } from "@/types";
import type { CFModLoader } from "@/types/electron";
import DefaultModpackImage from "@/assets/modpack-placeholder.png";

const props = defineProps<{
  modpackId: string;
  isOpen: boolean;
  initialTab?: "mods" | "discover" | "health" | "versions" | "settings" | "remote" | "configs";
  /** When true, renders as a full-screen view instead of a modal dialog */
  fullScreen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update"): void;
  (e: "export"): void;
  (e: "updated"): void;
  (e: "launched", instance: ModexInstance): void;
}>();

const toast = useToast();

// Create a ref from the prop for composable compatibility
const modpackIdRef = toRef(props, 'modpackId');

// Note: Most useInstances functionality is now accessed through useModpackInstance composable
// Only keeping getInstanceByModpack for version history linking
const {
  getInstanceByModpack,
} = useInstances();

const modpack = ref<Modpack | null>(null);
const currentMods = ref<Mod[]>([]);
const availableMods = ref<Mod[]>([]);
const disabledModIds = ref<Set<string>>(new Set());
const lockedModIds = ref<Set<string>>(new Set());
const modNotes = ref<Record<string, string>>({});
const searchQueryAvailable = ref("");
const isLoading = ref(true);
// Race condition protection: track current load requests
let loadRequestId = 0;
// instanceRequestId no longer needed - race condition protection is now handled by useModpackInstance composable
// selectedModIds is now provided by useModpackSelection composable
// showSingleModUpdateDialog, selectedUpdateMod, showVersionPickerDialog, versionPickerMod
// are now provided by useModpackUpdates composable
const isSaving = ref(false);

// Update Checking state - shared between useModpackFiltering and useModpackUpdates
const checkingUpdates = ref<Record<string, boolean>>({});
const updateAvailable = ref<Record<string, UpdateInfo | null>>({});
const isCheckingAllUpdates = ref(false);
// recentlyUpdatedMods and recentlyAddedMods are shared with useModpackMods
const recentlyUpdatedMods = ref<Set<string>>(new Set()); // Mod IDs updated in last 5 min
const recentlyAddedMods = ref<Set<string>>(new Set()); // Mod IDs added in last 5 min

// Mod Details Modal state
const showModDetailsModal = ref(false);
const modDetailsTarget = ref<Mod | null>(null);

// Changelog Dialog state - showChangelogDialog, changelogMod are now from useModpackUpdates

// Mod Notes Dialog state - now provided by useModpackMods composable
// showModNoteDialog, noteDialogMod, noteDialogText, isSavingNote are from composable

const activeTab = ref<
  | "mods"
  | "discover"
  | "health"
  | "versions"
  | "settings"
  | "remote"
  | "configs"
>("mods");

// Error state for graceful degradation (prevents white screen)
const loadError = ref<string | null>(null);
const contentTypeTab = ref<"mods" | "resourcepacks" | "shaders">("mods");

// Floating bar minimize state
const isFloatingBarMinimized = ref(false);

// ========== DEFERRED CALLBACKS ==========
// These will be assigned to actual functions later in the file
// This pattern allows composables to reference functions defined after them
const deferredCallbacks = {
  loadData: async () => { },
  refreshSyncStatus: async () => { },
  refreshUnsavedChangesCount: async () => { },
  onUpdate: () => emit("update"),
};

// ========== COMPOSABLE INTEGRATIONS ==========
// Compatibility checking composable
const {
  isModCompatible,
  incompatibleModCount,
  warningModCount,
} = useModpackCompatibility({
  modpack,
  currentMods,
  contentTypeTab,
});

// Filtering composable - destructure with original names for template compatibility
const {
  searchQueryInstalled,
  modsFilter,
  sortBy,
  sortDir,
  contentTypeCounts,
  filteredInstalledMods,
  toggleSort,
  clearFilters,
} = useModpackFiltering({
  currentMods,
  disabledModIds,
  lockedModIds,
  modNotes,
  updateAvailable,
  recentlyUpdatedMods,
  recentlyAddedMods,
  isModCompatible,
  contentTypeTab,
});

// Selection composable - destructure with original names for template compatibility
const {
  selectedModIds,
  selectedCount,
  selectedModIdsArray,
  enabledUnlockedCount,
  disabledUnlockedCount,
  toggleSelect,
  selectAll,
  selectAllEnabled,
  selectHalfEnabled,
  selectAllDisabled,
  selectHalfDisabled,
  clearSelection,
  isSelected,
} = useModpackSelection({
  filteredMods: filteredInstalledMods,
  disabledModIds,
  lockedModIds,
  contentTypeTab,
});

// Mod CRUD composable - uses deferred callbacks for functions defined later
const {
  // State refs
  showDependencyImpactDialog,
  dependencyImpact,
  pendingModAction,
  showModNoteDialog,
  noteDialogMod,
  noteDialogText,
  isSavingNote,
  // Methods
  addMod,
  removeMod,
  executeModRemoval,
  toggleModEnabled,
  executeModToggle,
  toggleModLocked,
  openModNoteDialog,
  saveModNote,
  closeModNoteDialog,
  getModNote,
  markAsRecentlyUpdated,
  markAsRecentlyAdded,
  confirmDependencyImpactAction,
  cancelDependencyImpactAction,
} = useModpackMods({
  modpackId: modpackIdRef,
  modpack,
  currentMods,
  disabledModIds,
  lockedModIds,
  modNotes,
  isLinked: computed(() => !!modpack.value?.remote_source?.url),
  modsFilter,
  refreshSyncStatus: () => deferredCallbacks.refreshSyncStatus(),
  refreshUnsavedChangesCount: () => deferredCallbacks.refreshUnsavedChangesCount(),
  loadData: () => deferredCallbacks.loadData(),
  onUpdate: () => deferredCallbacks.onUpdate(),
  recentlyAddedMods,
  recentlyUpdatedMods,
});

// Updates composable - handles mod update checking and application
// Note: checkingUpdates, updateAvailable, isCheckingAllUpdates are passed in as external refs
const {
  showSingleModUpdateDialog,
  selectedUpdateMod,
  showVersionPickerDialog,
  versionPickerMod,
  showChangelogDialog,
  changelogMod,
  updatesAvailableCount,
  checkModUpdate,
  updateMod,
  checkAllUpdates,
  quickUpdateMod,
  updateAllMods,
  openVersionPicker,
  handleVersionSelected,
  openSingleModUpdate,
  handleSingleModUpdated,
  viewModChangelog,
} = useModpackUpdates({
  modpackId: modpackIdRef,
  modpack,
  currentMods,
  lockedModIds,
  contentTypeTab,
  recentlyUpdatedMods,
  loadData: () => deferredCallbacks.loadData(),
  onUpdate: () => deferredCallbacks.onUpdate(),
  // Pass shared refs
  checkingUpdates,
  updateAvailable,
  isCheckingAllUpdates,
});

// Instance composable - handles instance lifecycle, launch, sync, settings
const {
  instance,
  instanceStats,
  instanceSyncStatus,
  isLoadingInstance,
  isCreatingInstance,
  isSyncingInstance,
  syncResult,
  showSyncDetails,
  selectedSyncMode,
  clearExistingMods,
  syncSettings,
  isLaunching,
  gameLaunched,
  gameLoadingMessage,
  loaderProgress,
  showSyncConfirmDialog,
  pendingLaunchData,
  showInstanceSettings,
  showDeleteInstanceDialog,
  isDeletingInstance,
  memoryMin,
  memoryMax,
  customJavaArgs,
  systemMemory,
  runningGame,
  isGameRunning,
  maxAllowedRam,
  loadInstance,
  loadSyncSettings,
  handleCreateInstance,
  toggleAutoSync,
  toggleSyncConfirmation,
  handleSyncInstance,
  handleLaunch,
  handleSyncConfirmation,
  handleKillGame,
  handleOpenInstanceFolder,
  openInstanceSettings,
  saveInstanceSettings,
  handleDeleteInstance,
  refreshSyncStatus,
  formatPlayDate,
  formatFileSize,
} = useModpackInstance({
  modpackId: modpackIdRef,
  modpack,
  toast,
  emit: (event: string, ...args: unknown[]) => {
    // Type-safe emit wrapper for composable compatibility
    switch (event) {
      case 'close': emit('close'); break;
      case 'update': emit('update'); break;
      case 'export': emit('export'); break;
      case 'updated': emit('updated'); break;
      case 'launched': emit('launched', args[0] as ModexInstance); break;
    }
  },
});

// Game Logs composable - handles live log streaming and filtering
const {
  gameLogs,
  showLogConsole,
  logLevelFilter,
  logScrollRef,
  filteredGameLogs,
  logLevelCounts,
  totalLogCount,
  hasErrors,
  hasWarnings,
  setupLogListener,
  cleanupLogListener,
  clearLogs,
  toggleLogConsole,
  setLogLevelFilter,
  scrollToBottom,
  getLogLevelClass,
} = useModpackGameLogs({
  instance,
  maxLogLines: 200,
});

// Config Sync composable - handles bidirectional config synchronization
const {
  modifiedConfigs,
  showModifiedConfigsDetails,
  selectedConfigsForImport,
  isImportingConfigs,
  showOnlyModifiedConfigs,
  importableConfigs,
  deletedConfigs,
  newConfigsCount,
  selectedConfigsCount,
  allConfigsSelected,
  someConfigsSelected,
  loadModifiedConfigs,
  toggleConfigSelection,
  selectAllConfigs,
  deselectAllConfigs,
  toggleSelectAllConfigs,
  importSelectedConfigs,
  isConfigSelected,
  toggleShowOnlyModified,
  toggleModifiedConfigsDetails,
  formatFileSize: formatFileSizeConfig, // Renamed to avoid conflict
} = useModpackConfigSync({
  modpackId: modpackIdRef,
  instance,
  toast,
});

// Help Guide State
const showHelp = ref(false);

// Log Console Resize State
const logConsoleHeight = ref(300);
const isResizingLogConsole = ref(false);

function startLogConsoleResize(e: MouseEvent) {
  isResizingLogConsole.value = true;
  const startY = e.clientY;
  const startHeight = logConsoleHeight.value;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaY = startY - moveEvent.clientY;
    const newHeight = Math.min(Math.max(startHeight + deltaY, 150), window.innerHeight - 150);
    logConsoleHeight.value = newHeight;
  };

  const onMouseUp = () => {
    isResizingLogConsole.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// More Menu State (for secondary tabs)
const showMoreMenu = ref(false);
const showImageMenu = ref(false);
const moreMenuPosition = ref({ top: '0px', right: '0px' });
const moreButtonRef = ref<HTMLButtonElement | null>(null);
const secondaryTabs = ['discover', 'health', 'versions', 'remote'] as const;
const isSecondaryTab = computed(() => secondaryTabs.includes(activeTab.value as any));

function toggleMoreMenu(event: MouseEvent) {
  if (!showMoreMenu.value) {
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    moreMenuPosition.value = {
      top: `${rect.bottom + 8}px`,
      right: `${window.innerWidth - rect.right}px`
    };
  }
  showMoreMenu.value = !showMoreMenu.value;
}

// Mods Filter overflow menu
const showModsFilterMenu = ref(false);

// Linked instance (for config sync in version control)
const linkedInstanceId = ref<string | null>(null);

// ========== PLAY/INSTANCE STATE ==========
// instance, instanceStats, instanceSyncStatus, isLoadingInstance, isCreatingInstance,
// isSyncingInstance, syncResult, showSyncDetails, selectedSyncMode, clearExistingMods,
// syncSettings, isLaunching, gameLaunched, gameLoadingMessage, loaderProgress,
// showSyncConfirmDialog, pendingLaunchData, showInstanceSettings, showDeleteInstanceDialog,
// isDeletingInstance, memoryMin, memoryMax, customJavaArgs, systemMemory, runningGame,
// isGameRunning, maxAllowedRam are now provided by useModpackInstance composable

// gameLogs, showLogConsole, logLevelFilter, logScrollRef, filteredGameLogs, logLevelCounts,
// totalLogCount, hasErrors, hasWarnings are now provided by useModpackGameLogs composable

// modifiedConfigs, showModifiedConfigsDetails, selectedConfigsForImport, isImportingConfigs,
// showOnlyModifiedConfigs, importableConfigs, deletedConfigs, newConfigsCount,
// selectedConfigsCount, allConfigsSelected, someConfigsSelected are now provided by useModpackConfigSync composable

// Version History unsaved changes count
const versionUnsavedCount = ref(0);

// Helper to refresh unsaved changes count
async function refreshUnsavedChangesCount() {
  try {
    const unsavedData = await window.api.modpacks.getUnsavedChanges(props.modpackId);
    if (unsavedData?.hasChanges && unsavedData.changes) {
      const c = unsavedData.changes;
      const configCount = c.configDetails?.length || (c.configsChanged ? 1 : 0);
      const loaderChange = c.loaderChanged ? 1 : 0;
      const notesCount = (c.notesAdded?.length || 0) + (c.notesRemoved?.length || 0) + (c.notesChanged?.length || 0);
      versionUnsavedCount.value = c.modsAdded.length + c.modsRemoved.length + c.modsEnabled.length +
        c.modsDisabled.length + (c.modsUpdated?.length || 0) + (c.modsLocked?.length || 0) +
        (c.modsUnlocked?.length || 0) + loaderChange + configCount + notesCount;
    } else {
      versionUnsavedCount.value = 0;
    }
  } catch (err) {
    console.error("Failed to refresh unsaved changes count:", err);
  }
}

// Config Editor State
const showStructuredEditor = ref(false);
const structuredEditorFile = ref<ConfigFile | null>(null);
const configRefreshKey = ref(0);

// ========== END PLAY/INSTANCE STATE ==========

// Confirm dialog state for removing incompatible mods
const showRemoveIncompatibleDialog = ref(false);

// Remote Updates
const showReviewDialog = ref(false);
const updateResult = ref<FrontendUpdateResult | null>(null);
const isCheckingUpdate = ref(false);
const showProgressDialog = ref(false);
const progressState = ref({
  message: "Starting update...",
  percent: 0,
});

// CurseForge modpack updates
const cfUpdateInfo = ref<{
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  latestFileId?: number;
  releaseDate?: string;
  downloadUrl?: string;
} | null>(null);
const isCheckingCFUpdate = ref(false);
const showCFChangelog = ref(false);
const cfChangelog = ref("");
const isLoadingChangelog = ref(false);

// CF modpack update dialog
const showCFUpdateDialog = ref(false);
const isApplyingCFUpdate = ref(false);
const cfUpdateProgress = ref({ current: 0, total: 0, currentMod: "" });

// Incompatible mods re-search
const isReSearching = ref(false);
const reSearchProgress = ref({ current: 0, total: 0, currentMod: "" });

// Dependency Impact Dialog - showDependencyImpactDialog, dependencyImpact, pendingModAction
// are now provided by useModpackMods composable

// Bulk Dependency Impact Dialog
const showBulkDependencyImpactDialog = ref(false);
const bulkDependencyImpact = ref<{
  action: "remove" | "disable";
  modsToAffect: Array<{ id: string; name: string }>;
  allDependentMods: Array<{ id: string; name: string; dependsOn: string[] }>;
  allOrphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
  warnings: string[];
} | null>(null);
const pendingBulkModIds = ref<string[]>([]);

// Editable form fields
const editForm = ref({
  name: "",
  description: "",
  version: "",
  minecraft_version: "",
  loader: "",
  loader_version: "",
  // Remote source fields
  remote_url: "",
  auto_check_remote: false,
});

// Dynamic game versions from CurseForge
const fetchedGameVersions = ref<string[]>([]);
const isLoadingGameVersions = ref(false);

// Dynamic loader types from CurseForge
const fetchedLoaderTypes = ref<string[]>([]);
const isLoadingLoaderTypes = ref(false);

// Fallback static versions (used if API fails)
const fallbackGameVersions = [
  "1.21.4", "1.21.3", "1.21.1", "1.21",
  "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.20",
  "1.19.4", "1.19.2", "1.19",
  "1.18.2", "1.17.1", "1.16.5",
];

const fallbackLoaders = ["forge", "fabric", "neoforge", "quilt"];

// Computed list that includes the current modpack version
const availableGameVersions = computed(() => {
  const versions = fetchedGameVersions.value.length > 0 ? fetchedGameVersions.value : fallbackGameVersions;
  const currentVersion = editForm.value.minecraft_version;
  if (currentVersion && !versions.includes(currentVersion)) {
    // Insert current version at the appropriate position (sorted)
    const allVersions = [...versions, currentVersion];
    return allVersions.sort((a, b) => {
      const partsA = a.split('.').map(Number);
      const partsB = b.split('.').map(Number);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) return numB - numA; // Descending order
      }
      return 0;
    });
  }
  return versions;
});

// Computed loaders list
const loaders = computed(() => {
  return fetchedLoaderTypes.value.length > 0 ? fetchedLoaderTypes.value : fallbackLoaders;
});

// Loader version selection state
const availableLoaderVersions = ref<CFModLoader[]>([]);
const isLoadingLoaderVersions = ref(false);

// ModLoaderType enum from CurseForge API:
// 0 = Any, 1 = Forge, 2 = Cauldron, 3 = LiteLoader, 4 = Fabric, 5 = Quilt, 6 = NeoForge
const loaderTypeMap: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

// Filter loader versions by selected loader type using the numeric type field
// Fallback to name matching if type field is not reliable
const filteredLoaderVersions = computed(() => {
  const loaderType = editForm.value.loader?.toLowerCase() || "";
  const expectedType = loaderTypeMap[loaderType];

  if (expectedType === undefined) {
    return [];
  }

  // First try filtering by type field
  let filtered = availableLoaderVersions.value.filter((l) => l.type === expectedType);

  // Fallback: if no results with type, try matching by name pattern
  if (filtered.length === 0 && availableLoaderVersions.value.length > 0) {
    console.log(`[ModpackEditor] Type filter returned 0, falling back to name matching for "${loaderType}"`);
    filtered = availableLoaderVersions.value.filter((l) => {
      const name = l.name.toLowerCase();
      if (loaderType === "forge") {
        // Forge names: "forge-47.2.0" or "1.20.1-forge-47.2.0" (but NOT neoforge)
        return (name.startsWith("forge-") || name.includes("-forge-")) && !name.includes("neoforge");
      } else if (loaderType === "neoforge") {
        return name.startsWith("neoforge-") || name.includes("-neoforge-");
      } else if (loaderType === "fabric") {
        return name.startsWith("fabric-") || name.includes("-fabric-");
      } else if (loaderType === "quilt") {
        return name.startsWith("quilt-") || name.includes("-quilt-");
      }
      return false;
    });
  }

  return filtered;
});

// Extract clean version from loader name
function extractLoaderVersion(loaderName: string): string {
  2  // Fabric/Quilt format from CurseForge: "fabric-0.18.4-1.21.10" (loader-loaderVersion-mcVersion)
  // We want just the loader version part (0.18.4)
  let match = loaderName.match(/^(?:fabric|quilt)-(\d+\.\d+\.\d+)-\d+\.\d+/i);
  if (match) return match[1];

  // Pattern: loader-X.X.X (e.g., "forge-47.2.0", "neoforge-20.4.167")
  match = loaderName.match(/^(?:forge|neoforge)-(?:loader-)?(.+)$/i);
  if (match) return match[1];

  // Pattern: version-loader-version (e.g., "1.20.1-forge-47.2.0")
  match = loaderName.match(/^\d+\.\d+(?:\.\d+)?-(?:forge|neoforge|fabric|quilt)-(.+)$/i);
  if (match) return match[1];

  // Generic format: "X.X.X-Y.Y.Y" (loader version - MC version)
  // Simple split: take first part before hyphen if it looks like a version
  if (/^\d+\.\d+\.\d+-\d+\.\d+/.test(loaderName)) {
    return loaderName.split('-')[0];
  }

  // Fallback: return as-is
  return loaderName;
}

// Fetch loader versions when needed
async function fetchLoaderVersions() {
  if (!window.api || !editForm.value.minecraft_version) return;

  // Prevent duplicate fetches
  if (isLoadingLoaderVersions.value) return;

  isLoadingLoaderVersions.value = true;
  try {
    const versions = await window.api.curseforge.getModLoaders(editForm.value.minecraft_version);
    console.log(`[ModpackEditor] Received ${versions.length} loader versions for MC ${editForm.value.minecraft_version}`);
    if (versions.length > 0) {
      console.log(`[ModpackEditor] Sample loader:`, versions[0]);
    }
    availableLoaderVersions.value = versions;

    const loaderType = editForm.value.loader?.toLowerCase() || "";
    const expectedType = loaderTypeMap[loaderType];
    const filtered = filteredLoaderVersions.value;
    console.log(`[ModpackEditor] Loader: ${loaderType}, expectedType: ${expectedType}, filtered count: ${filtered.length}`);

    // If no version is selected, auto-select recommended or latest
    if (!editForm.value.loader_version && editForm.value.loader) {
      const recommended = filtered.find((l) => l.recommended);
      if (recommended) {
        editForm.value.loader_version = extractLoaderVersion(recommended.name);
      } else if (filtered.length > 0) {
        const sorted = [...filtered].sort(
          (a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
        );
        editForm.value.loader_version = extractLoaderVersion(sorted[0].name);
      }
    }
  } catch (err) {
    console.error("Failed to fetch loader versions:", err);
    availableLoaderVersions.value = [];
  } finally {
    isLoadingLoaderVersions.value = false;
  }
}

// Fetch Minecraft versions from CurseForge
async function fetchMinecraftVersions() {
  if (!window.api || isLoadingGameVersions.value) return;
  if (fetchedGameVersions.value.length > 0) return; // Already fetched

  isLoadingGameVersions.value = true;
  try {
    const versions = await window.api.curseforge.getMinecraftVersions();
    console.log(`[ModpackEditor] Received ${versions.length} Minecraft versions`);
    // Filter to approved versions and extract version strings
    const approvedVersions = versions
      .filter((v: { approved: boolean }) => v.approved)
      .map((v: { versionString: string }) => v.versionString);
    fetchedGameVersions.value = approvedVersions;
  } catch (err) {
    console.error("Failed to fetch Minecraft versions:", err);
    // Keep using fallback
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
    const types = await window.api.curseforge.getLoaderTypes();
    console.log(`[ModpackEditor] Received loader types:`, types);
    fetchedLoaderTypes.value = types;
  } catch (err) {
    console.error("Failed to fetch loader types:", err);
    // Keep using fallback
  } finally {
    isLoadingLoaderTypes.value = false;
  }
}

// Check if modpack exists (not a new one being created)
const isExistingModpack = computed(() => {
  return modpack.value !== null && modpack.value.id !== undefined;
});

// Check if modpack is linked to a remote source (Read-Only mode)
const isLinked = computed(() => {
  return !!modpack.value?.remote_source?.url;
});

// Installed mods with compatibility check (uses filteredInstalledMods from composable)
const installedModsWithCompatibility = computed(() => {
  return filteredInstalledMods.value.map((mod) => {
    const compatibility = isModCompatible(mod);
    return {
      ...mod,
      isCompatible: compatibility.compatible,
      hasWarning: compatibility.warning,
      incompatibilityReason: compatibility.reason,
    };
  });
});

// Installed project files map for CurseForge browse (prevents re-installing same versions)
const installedProjectFiles = computed(() => {
  const map = new Map<number, Set<number>>();
  for (const mod of currentMods.value) {
    if (mod.cf_project_id && mod.cf_file_id) {
      if (!map.has(mod.cf_project_id)) {
        map.set(mod.cf_project_id, new Set());
      }
      map.get(mod.cf_project_id)!.add(mod.cf_file_id);
    }
  }
  return map;
});
const RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const isLibraryCollapsed = ref(true); // Collapsible library panel - collapsed by default

// CurseForge Browse Dialog State
const showCFSearch = ref(false);

function handleCFSearchClose() {
  showCFSearch.value = false;
}

async function handleCFModAdded(mod: Mod | null, addedIds?: string[]) {
  // Reload data after a mod is added from CurseForge search
  await loadData();
  emit("update");

  // Mark as recently added - handle single mod or bulk add
  if (mod?.id) {
    // Single mod added
    recentlyAddedMods.value.add(mod.id);
    setTimeout(() => {
      recentlyAddedMods.value.delete(mod.id);
    }, RECENT_THRESHOLD_MS);
    toast.success("Added ✓", `${mod.name} is now in your pack`);
  } else if (addedIds && addedIds.length > 0) {
    // Bulk add - mark all added mods as new
    for (const modId of addedIds) {
      recentlyAddedMods.value.add(modId);
      setTimeout(() => {
        recentlyAddedMods.value.delete(modId);
      }, RECENT_THRESHOLD_MS);
    }
  }
}

// Update functions (openSingleModUpdate, handleSingleModUpdated, checkModUpdate, updateMod,
// openVersionPicker, handleVersionSelected, checkAllUpdates, quickUpdateMod, viewModChangelog,
// updateAllMods, updatesAvailableCount) are now provided by useModpackUpdates composable

// Mod Details Modal - open with full mod details
function openModDetails(mod: Mod) {
  if (!mod.cf_project_id) return;
  modDetailsTarget.value = mod;
  showModDetailsModal.value = true;
}

function closeModDetails() {
  showModDetailsModal.value = false;
  modDetailsTarget.value = null;
}

// Handle version change from ModDetailsModal
async function handleModDetailsVersionChange(fileId: number) {
  if (!modDetailsTarget.value) return;

  try {
    const result = await window.api.updates.applyUpdate(
      modDetailsTarget.value.id,
      fileId,
      props.modpackId
    );
    if (result.success) {
      // Mark as recently updated
      recentlyUpdatedMods.value.add(modDetailsTarget.value.id);
      setTimeout(() => {
        if (modDetailsTarget.value) {
          recentlyUpdatedMods.value.delete(modDetailsTarget.value.id);
        }
      }, RECENT_THRESHOLD_MS);

      // Clear any cached update status
      if (updateAvailable.value[modDetailsTarget.value.id]) {
        delete updateAvailable.value[modDetailsTarget.value.id];
      }
      await loadData();
      emit("update");
      toast.success(`${modDetailsTarget.value.name} updated ✓`);
      closeModDetails();
    } else {
      toast.error(`Couldn't change version: ${result.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    console.error("Version change failed:", err);
    toast.error(`Couldn't change version: ${err?.message || 'Unknown error'}`);
  }
}

// Count of disabled mods (per tab)
const disabledModCount = computed(() => {
  return currentMods.value.filter((m) => {
    const modContentType = m.content_type || "mod";
    if (contentTypeTab.value === "mods" && modContentType !== "mod")
      return false;
    if (
      contentTypeTab.value === "resourcepacks" &&
      modContentType !== "resourcepack"
    )
      return false;
    if (contentTypeTab.value === "shaders" && modContentType !== "shader")
      return false;
    return disabledModIds.value.has(m.id);
  }).length;
});

// Count of locked mods (per tab)
const lockedModCount = computed(() => {
  return currentMods.value.filter((m) => {
    const modContentType = m.content_type || "mod";
    if (contentTypeTab.value === "mods" && modContentType !== "mod")
      return false;
    if (
      contentTypeTab.value === "resourcepacks" &&
      modContentType !== "resourcepack"
    )
      return false;
    if (contentTypeTab.value === "shaders" && modContentType !== "shader")
      return false;
    return lockedModIds.value.has(m.id);
  }).length;
});

// Count of mods with notes (per tab)
const modsWithNotesCount = computed(() => {
  return currentMods.value.filter((m) => {
    const modContentType = m.content_type || "mod";
    if (contentTypeTab.value === "mods" && modContentType !== "mod")
      return false;
    if (contentTypeTab.value === "resourcepacks" && modContentType !== "resourcepack")
      return false;
    if (contentTypeTab.value === "shaders" && modContentType !== "shader")
      return false;
    return !!modNotes.value[m.id];
  }).length;
});

// Count of recently updated mods (per tab)
const recentlyUpdatedCount = computed(() => {
  return currentMods.value.filter((m) => {
    const modContentType = m.content_type || "mod";
    if (contentTypeTab.value === "mods" && modContentType !== "mod")
      return false;
    if (contentTypeTab.value === "resourcepacks" && modContentType !== "resourcepack")
      return false;
    if (contentTypeTab.value === "shaders" && modContentType !== "shader")
      return false;
    return recentlyUpdatedMods.value.has(m.id);
  }).length;
});

// Count of recently added mods (per tab)
const recentlyAddedCount = computed(() => {
  return currentMods.value.filter((m) => {
    const modContentType = m.content_type || "mod";
    if (contentTypeTab.value === "mods" && modContentType !== "mod")
      return false;
    if (contentTypeTab.value === "resourcepacks" && modContentType !== "resourcepack")
      return false;
    if (contentTypeTab.value === "shaders" && modContentType !== "shader")
      return false;
    return recentlyAddedMods.value.has(m.id);
  }).length;
});

// Mods with compatibility info
const filteredAvailableMods = computed(() => {
  const currentIds = new Set(currentMods.value.map((m) => m.id));
  return availableMods.value
    .filter((m) => {
      // Content type filter
      const modContentType = m.content_type || "mod";
      if (contentTypeTab.value === "mods" && modContentType !== "mod")
        return false;
      if (
        contentTypeTab.value === "resourcepacks" &&
        modContentType !== "resourcepack"
      )
        return false;
      if (contentTypeTab.value === "shaders" && modContentType !== "shader")
        return false;

      return (
        !currentIds.has(m.id) &&
        m.name.toLowerCase().includes(searchQueryAvailable.value.toLowerCase())
      );
    })
    .map((mod) => {
      const compatibility = isModCompatible(mod);
      return {
        ...mod,
        isCompatible: compatibility.compatible,
        hasWarning: compatibility.warning,
        incompatibilityReason: compatibility.reason,
      };
    })
    .sort((a, b) => {
      if (a.isCompatible && !b.isCompatible) return -1;
      if (!a.isCompatible && b.isCompatible) return 1;
      return a.name.localeCompare(b.name);
    });
});

// Compatibility stats
const compatibleCount = computed(
  () => filteredAvailableMods.value.filter((m) => m.isCompatible && !m.hasWarning).length
);
const warningAvailableCount = computed(
  () => filteredAvailableMods.value.filter((m) => m.isCompatible && m.hasWarning).length
);
const incompatibleAvailableCount = computed(
  () => filteredAvailableMods.value.filter((m) => !m.isCompatible).length
);

// Count of enabled mods
const enabledModCount = computed(() => {
  return currentMods.value.filter((m) => !disabledModIds.value.has(m.id))
    .length;
});

// refreshSyncStatus is now provided by useModpackInstance composable

// Refresh data and notify parent to update modpack list (e.g., for unsaved changes icon)
async function refreshAndNotify() {
  await loadData();
  emit("update");
}

async function loadData() {
  if (!props.modpackId) return;

  // Race condition protection: increment request ID and capture current ID
  const currentRequestId = ++loadRequestId;

  isLoading.value = true;
  // Reset update result when loading new data to prevent "Update Available" banner from persisting
  updateResult.value = null;

  try {
    const [pack, cMods, allMods, disabled, locked, linkedInstance] = await Promise.all([
      window.api.modpacks.getById(props.modpackId),
      window.api.modpacks.getMods(props.modpackId),
      window.api.mods.getAll(),
      window.api.modpacks.getDisabledMods(props.modpackId),
      window.api.modpacks.getLockedMods(props.modpackId),
      window.api.instances.getByModpack(props.modpackId),
    ]);

    // Race condition check: if a newer request was made, discard this result
    if (currentRequestId !== loadRequestId) {
      console.log(`[loadData] Discarding stale result (request ${currentRequestId}, current ${loadRequestId})`);
      return;
    }

    modpack.value = pack || null;
    currentMods.value = cMods;
    availableMods.value = allMods;
    disabledModIds.value = new Set(disabled);
    lockedModIds.value = new Set(locked);
    modNotes.value = pack?.mod_notes || {};
    selectedModIds.value.clear();
    linkedInstanceId.value = linkedInstance?.id || null;

    // Load unsaved changes count for version history badge
    await refreshUnsavedChangesCount();

    // Update instance sync status if linked
    if (linkedInstance) {
      instance.value = linkedInstance;
      try {
        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(linkedInstance.id, props.modpackId);
      } catch (err) {
        console.error("Failed to refresh sync status:", err);
      }
    } else {
      instance.value = null;
      instanceSyncStatus.value = null;
    }

    // Initialize edit form
    if (pack) {
      editForm.value = {
        name: pack.name || "",
        description: pack.description || "",
        version: pack.version || "",
        minecraft_version: pack.minecraft_version || "",
        loader: pack.loader || "",
        loader_version: pack.loader_version || "",
        remote_url: pack.remote_source?.url || "",
        auto_check_remote: pack.remote_source?.auto_check || false,
      };

      // Auto-check for updates if enabled (but skip if just imported)
      if (pack.remote_source?.url && pack.remote_source.auto_check) {
        if (pack.remote_source.skip_initial_check) {
          // Clear the skip flag for next time
          if (pack.id) {
            await window.api.modpacks.update(pack.id, {
              remote_source: {
                ...pack.remote_source,
                skip_initial_check: false,
              },
            });
          }
        } else {
          checkForRemoteUpdates();
        }
      }

    }
  } catch (err) {
    console.error("Failed to load modpack data:", err);
    // Only show error toast if this is still the current request
    if (currentRequestId === loadRequestId) {
      toast.error("Couldn't load pack", "Try again or refresh the page.");
    }
  } finally {
    // Only clear loading state if this is still the current request
    if (currentRequestId === loadRequestId) {
      isLoading.value = false;
    }
  }
}

// ========== ASSIGN DEFERRED CALLBACKS ==========
// Now that the functions are defined, assign them to the deferred callbacks object
// This enables composables initialized earlier to call these functions
deferredCallbacks.loadData = loadData;
deferredCallbacks.refreshSyncStatus = refreshSyncStatus;
deferredCallbacks.refreshUnsavedChangesCount = refreshUnsavedChangesCount;

// ========== INSTANCE/PLAY FUNCTIONS ==========
// loadInstance, loadSyncSettings, handleCreateInstance, toggleAutoSync, toggleSyncConfirmation,
// handleSyncInstance, handleLaunch, handleSyncConfirmation, handleKillGame, handleOpenInstanceFolder,
// openInstanceSettings, saveInstanceSettings, handleDeleteInstance, refreshSyncStatus,
// formatPlayDate, formatFileSize are now provided by useModpackInstance composable

// Open config file (local - not in composable)
function handleOpenStructuredEditor(file: ConfigFile) {
  structuredEditorFile.value = file;
  showStructuredEditor.value = true;
}

function handleCloseStructuredEditor() {
  showStructuredEditor.value = false;
  structuredEditorFile.value = null;
}

// ========== BIDIRECTIONAL CONFIG SYNC ==========
// loadModifiedConfigs, toggleConfigSelection, selectAllConfigs, deselectAllConfigs,
// importSelectedConfigs are now provided by useModpackConfigSync composable

// ========== END INSTANCE/PLAY FUNCTIONS ==========

// Save modpack info
async function saveModpackInfo() {
  if (!modpack.value) return;

  isSaving.value = true;
  try {
    await window.api.modpacks.update(props.modpackId, {
      name: editForm.value.name,
      description: editForm.value.description,
      version: editForm.value.version,
      minecraft_version: editForm.value.minecraft_version,
      loader: editForm.value.loader,
      loader_version: editForm.value.loader_version || undefined,
      // Save remote source config
      remote_source: editForm.value.remote_url
        ? {
          url: editForm.value.remote_url,
          auto_check: editForm.value.auto_check_remote,
          last_checked: modpack.value.remote_source?.last_checked,
        }
        : undefined,
    });

    await loadData();

    // Re-check sync status (loader version may have changed)
    if (instance.value) {
      instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
    }

    emit("update");
    toast.success("Saved ✓", "Pack settings updated.");
  } catch (err) {
    console.error("Failed to save modpack info:", err);
    toast.error("Couldn't save", (err as Error).message);
  } finally {
    isSaving.value = false;
  }
}

// Mod CRUD functions (addMod, removeMod, executeModRemoval, toggleModEnabled,
// executeModToggle, toggleModLocked) are now provided by useModpackMods composable

// Mod Notes functions (openModNoteDialog, saveModNote, closeModNoteDialog, getModNote)
// are now provided by useModpackMods composable

async function removeSelectedMods() {
  if (selectedModIds.value.size === 0) return;

  // Filter out locked mods
  const idsToRemove: string[] = Array.from(selectedModIds.value).filter(
    id => !lockedModIds.value.has(id)
  );

  if (idsToRemove.length === 0) {
    toast.warning("Cannot Remove", "All selected mods are locked");
    return;
  }

  // Check dependency impact for all mods being removed
  try {
    const modsToAffect: Array<{ id: string; name: string }> = [];
    const allDependentMods = new Map<string, { id: string; name: string; dependsOn: string[] }>();
    const allOrphanedDeps = new Map<string, { id: string; name: string; usedByOthers: boolean }>();
    const modIdSet = new Set(idsToRemove);

    for (const modId of idsToRemove) {
      const impact = await window.api.modpacks.analyzeModRemovalImpact(props.modpackId, modId, "remove");
      if (impact.modToAffect) {
        modsToAffect.push(impact.modToAffect);
      }

      // Collect dependent mods (excluding those we're also removing)
      for (const dep of impact.dependentMods.filter(d => d.willBreak)) {
        if (!modIdSet.has(dep.id)) {
          if (allDependentMods.has(dep.id)) {
            allDependentMods.get(dep.id)!.dependsOn.push(impact.modToAffect?.name || modId);
          } else {
            allDependentMods.set(dep.id, {
              id: dep.id,
              name: dep.name,
              dependsOn: [impact.modToAffect?.name || modId]
            });
          }
        }
      }

      // Collect orphaned dependencies
      for (const orphan of impact.orphanedDependencies.filter(d => !d.usedByOthers)) {
        if (!modIdSet.has(orphan.id) && !allOrphanedDeps.has(orphan.id)) {
          allOrphanedDeps.set(orphan.id, orphan);
        }
      }
    }

    // If there are dependent mods or orphaned dependencies, show the dialog
    if (allDependentMods.size > 0 || allOrphanedDeps.size > 0) {
      bulkDependencyImpact.value = {
        action: "remove",
        modsToAffect,
        allDependentMods: Array.from(allDependentMods.values()),
        allOrphanedDependencies: Array.from(allOrphanedDeps.values()),
        warnings: []
      };
      pendingBulkModIds.value = idsToRemove;
      showBulkDependencyImpactDialog.value = true;
      return;
    }
  } catch (err) {
    console.error("Failed to check bulk dependency impact:", err);
  }

  // No impact, proceed with removal
  await executeBulkRemove(idsToRemove);
}

async function executeBulkRemove(idsToRemove: string[]) {
  try {
    for (const id of idsToRemove) {
      await window.api.modpacks.removeMod(props.modpackId, id);
    }
    selectedModIds.value = new Set();
    await loadData();
    emit("update");
    toast.success("Mods Removed", `Removed ${idsToRemove.length} mod(s) from modpack`);
  } catch (err) {
    console.error("Failed to remove mods:", err);
    toast.error("Remove Failed", (err as Error).message);
  }
}

// Selection functions (toggleSelect, selectAll, selectAllEnabled, selectHalfEnabled,
// selectAllDisabled, selectHalfDisabled, clearSelection, isSelected) are now provided
// by useModpackSelection composable

// Bulk enable/disable selected mods
async function bulkEnableSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  // Filter out locked mods first
  const unlockedMods = [...selectedModIds.value].filter(id => !lockedModIds.value.has(id));
  const skippedLocked = selectedModIds.value.size - unlockedMods.length;

  // Check if all unlocked mods are already enabled
  const modsToEnable = unlockedMods.filter(id => disabledModIds.value.has(id));
  if (modsToEnable.length === 0) {
    if (skippedLocked > 0) {
      toast.warning("Cannot Enable", `All ${skippedLocked} selected mod(s) are locked`);
    } else {
      toast.info("All Already Enabled", "All selected mods are already enabled");
    }
    return;
  }

  let successCount = 0;
  let failCount = 0;
  for (const modId of modsToEnable) {
    try {
      await window.api.modpacks.toggleMod(props.modpackId, modId);
      disabledModIds.value.delete(modId);
      successCount++;
    } catch (err) {
      console.error(`Failed to enable mod ${modId}:`, err);
      failCount++;
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  // Refresh sync status to reflect enabled/disabled changes
  await refreshSyncStatus();
  // Refresh unsaved changes count
  await refreshUnsavedChangesCount();
  emit("update");
  if (failCount === 0 && skippedLocked === 0) {
    toast.success("Mods Enabled", `Enabled ${successCount} mod(s)`);
  } else if (failCount === 0 && skippedLocked > 0) {
    toast.success("Mods Enabled", `Enabled ${successCount} mod(s), ${skippedLocked} locked mod(s) skipped`);
  } else {
    toast.warning("Mods Enabled", `Enabled ${successCount} mod(s), ${failCount} failed`);
  }
}

async function bulkDisableSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  // Filter out locked mods first
  const unlockedMods = [...selectedModIds.value].filter(id => !lockedModIds.value.has(id));
  const skippedLocked = selectedModIds.value.size - unlockedMods.length;

  // Check if all unlocked mods are already disabled
  const modsToDisable = unlockedMods.filter(id => !disabledModIds.value.has(id));
  if (modsToDisable.length === 0) {
    if (skippedLocked > 0) {
      toast.warning("Cannot Disable", `All ${skippedLocked} selected mod(s) are locked`);
    } else {
      toast.info("All Already Disabled", "All selected mods are already disabled");
    }
    return;
  }

  // Check dependency impact for all mods being disabled
  try {
    const modsToAffect: Array<{ id: string; name: string }> = [];
    const allDependentMods = new Map<string, { id: string; name: string; dependsOn: string[] }>();
    const allOrphanedDeps = new Map<string, { id: string; name: string; usedByOthers: boolean }>();
    const modIdSet = new Set(modsToDisable);

    for (const modId of modsToDisable) {
      const impact = await window.api.modpacks.analyzeModRemovalImpact(props.modpackId, modId, "disable");
      if (impact.modToAffect) {
        modsToAffect.push(impact.modToAffect);
      }

      // Collect dependent mods (excluding those we're also disabling)
      for (const dep of impact.dependentMods.filter(d => d.willBreak)) {
        if (!modIdSet.has(dep.id)) {
          if (allDependentMods.has(dep.id)) {
            allDependentMods.get(dep.id)!.dependsOn.push(impact.modToAffect?.name || modId);
          } else {
            allDependentMods.set(dep.id, {
              id: dep.id,
              name: dep.name,
              dependsOn: [impact.modToAffect?.name || modId]
            });
          }
        }
      }
    }

    // If there are dependent mods, show the dialog
    if (allDependentMods.size > 0) {
      bulkDependencyImpact.value = {
        action: "disable",
        modsToAffect,
        allDependentMods: Array.from(allDependentMods.values()),
        allOrphanedDependencies: Array.from(allOrphanedDeps.values()),
        warnings: []
      };
      pendingBulkModIds.value = modsToDisable;
      showBulkDependencyImpactDialog.value = true;
      return;
    }
  } catch (err) {
    console.error("Failed to check bulk dependency impact:", err);
  }

  // No impact, proceed with disabling
  await executeBulkDisable(modsToDisable, skippedLocked);
}

async function executeBulkDisable(modsToDisable: string[], skippedLocked: number = 0) {
  let successCount = 0;
  let failCount = 0;
  for (const modId of modsToDisable) {
    try {
      await window.api.modpacks.toggleMod(props.modpackId, modId);
      disabledModIds.value.add(modId);
      successCount++;
    } catch (err) {
      console.error(`Failed to disable mod ${modId}:`, err);
      failCount++;
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  // Refresh sync status to reflect enabled/disabled changes
  await refreshSyncStatus();
  // Refresh unsaved changes count
  await refreshUnsavedChangesCount();
  emit("update");
  if (failCount === 0 && skippedLocked === 0) {
    toast.success("Mods Disabled", `Disabled ${successCount} mod(s)`);
  } else if (failCount === 0 && skippedLocked > 0) {
    toast.success("Mods Disabled", `Disabled ${successCount} mod(s), ${skippedLocked} locked mod(s) skipped`);
  } else {
    toast.warning("Mods Disabled", `Disabled ${successCount} mod(s), ${failCount} failed`);
  }
}

async function bulkLockSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  // Check if all selected mods are already locked
  const modsToLock = [...selectedModIds.value].filter(id => !lockedModIds.value.has(id));
  if (modsToLock.length === 0) {
    toast.info("All Already Locked", "All selected mods are already locked");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  for (const modId of modsToLock) {
    try {
      const result = await window.api.modpacks.setModLocked(props.modpackId, modId, true);
      if (result) {
        lockedModIds.value.add(modId);
        successCount++;
      }
    } catch (err) {
      console.error(`Failed to lock mod ${modId}:`, err);
      failCount++;
    }
  }
  lockedModIds.value = new Set(lockedModIds.value);
  await refreshUnsavedChangesCount();
  emit("update");
  if (failCount === 0) {
    toast.success("Mods Locked", `Locked ${successCount} mod(s)`);
  } else {
    toast.warning("Mods Locked", `Locked ${successCount} mod(s), ${failCount} failed`);
  }
}

async function bulkUnlockSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  // Check if all selected mods are already unlocked
  const modsToUnlock = [...selectedModIds.value].filter(id => lockedModIds.value.has(id));
  if (modsToUnlock.length === 0) {
    toast.info("All Already Unlocked", "All selected mods are already unlocked");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  for (const modId of modsToUnlock) {
    try {
      const result = await window.api.modpacks.setModLocked(props.modpackId, modId, false);
      if (result) {
        lockedModIds.value.delete(modId);
        successCount++;
      }
    } catch (err) {
      console.error(`Failed to unlock mod ${modId}:`, err);
      failCount++;
    }
  }
  lockedModIds.value = new Set(lockedModIds.value);
  await refreshUnsavedChangesCount();
  emit("update");
  if (failCount === 0) {
    toast.success("Mods Unlocked", `Unlocked ${successCount} mod(s)`);
  } else {
    toast.warning("Mods Unlocked", `Unlocked ${successCount} mod(s), ${failCount} failed`);
  }
}

async function removeIncompatibleMods() {
  if (isLinked.value) return;

  // Exclude locked mods from incompatible list
  const incompatibleMods = currentMods.value.filter(
    (m) => !isModCompatible(m).compatible && !lockedModIds.value.has(m.id)
  );
  if (incompatibleMods.length === 0) {
    toast.info(
      "No Incompatible Mods",
      "All incompatible mods are either compatible or locked"
    );
    return;
  }

  // Show confirm dialog
  showRemoveIncompatibleDialog.value = true;
}

async function confirmRemoveIncompatibleMods() {
  showRemoveIncompatibleDialog.value = false;

  // Exclude locked mods
  const incompatibleMods = currentMods.value.filter(
    (m) => !isModCompatible(m).compatible && !lockedModIds.value.has(m.id)
  );

  let removed = 0;
  for (const mod of incompatibleMods) {
    try {
      await window.api.modpacks.removeMod(props.modpackId, mod.id);
      removed++;
    } catch (err) {
      console.error(`Failed to remove mod ${mod.id}:`, err);
    }
  }

  await loadData();
  emit("update");
  toast.success("Mods Removed", `Removed ${removed} incompatible mod(s)`);
}

// confirmDependencyImpactAction and cancelDependencyImpactAction
// are now provided by useModpackMods composable

// Confirm action and also affect dependents
async function confirmDependencyImpactWithDependents() {
  showDependencyImpactDialog.value = false;

  if (!pendingModAction.value || !dependencyImpact.value) return;

  const { modId, action } = pendingModAction.value;
  const { dependentMods, orphanedDependencies } = dependencyImpact.value;

  // Collect all mods to process
  const allModIds = new Set<string>([modId]);

  // Add dependent mods
  for (const dep of dependentMods.filter(d => d.willBreak)) {
    allModIds.add(dep.id);
  }

  // For remove action, also include orphaned dependencies
  if (action === "remove") {
    for (const orphan of orphanedDependencies.filter(d => !d.usedByOthers)) {
      allModIds.add(orphan.id);
    }
  }

  const modsToProcess = Array.from(allModIds).filter(id => !lockedModIds.value.has(id));

  if (action === "remove") {
    await executeBulkRemove(modsToProcess);
  } else {
    await executeBulkDisable(modsToProcess);
  }

  pendingModAction.value = null;
  dependencyImpact.value = null;
}

// Bulk dependency impact action handlers
async function confirmBulkDependencyImpactAction() {
  showBulkDependencyImpactDialog.value = false;

  if (pendingBulkModIds.value.length === 0 || !bulkDependencyImpact.value) return;

  const { action } = bulkDependencyImpact.value;
  const modsToProcess = [...pendingBulkModIds.value];

  if (action === "remove") {
    await executeBulkRemove(modsToProcess);
  } else {
    await executeBulkDisable(modsToProcess);
  }

  pendingBulkModIds.value = [];
  bulkDependencyImpact.value = null;
}

async function confirmBulkDependencyWithDependents() {
  showBulkDependencyImpactDialog.value = false;

  if (pendingBulkModIds.value.length === 0 || !bulkDependencyImpact.value) return;

  const { action, allDependentMods, allOrphanedDependencies } = bulkDependencyImpact.value;

  // Combine the original mods with their dependents
  const allModIds = new Set(pendingBulkModIds.value);

  // Add dependent mods
  for (const dep of allDependentMods) {
    allModIds.add(dep.id);
  }

  // For remove action, also include orphaned dependencies
  if (action === "remove") {
    for (const orphan of allOrphanedDependencies) {
      allModIds.add(orphan.id);
    }
  }

  const modsToProcess = Array.from(allModIds).filter(id => !lockedModIds.value.has(id));

  if (action === "remove") {
    await executeBulkRemove(modsToProcess);
  } else {
    await executeBulkDisable(modsToProcess);
  }

  pendingBulkModIds.value = [];
  bulkDependencyImpact.value = null;
}

function cancelBulkDependencyImpactAction() {
  showBulkDependencyImpactDialog.value = false;
  pendingBulkModIds.value = [];
  bulkDependencyImpact.value = null;
}

// toggleSort is now provided by useModpackFiltering composable

async function selectImage() {
  const imagePath = await window.api.dialogs.selectImage();
  if (imagePath && modpack.value) {
    const success = await window.api.modpacks.setImage(
      props.modpackId,
      imagePath
    );
    if (success) {
      modpack.value.image_url = imagePath;
      emit("update");
    }
  }
}

async function removeImage() {
  if (!modpack.value) return;
  const success = await window.api.modpacks.setImage(props.modpackId, '');
  if (success) {
    modpack.value.image_url = '';
    emit("update");
    toast.success('Image Removed', 'Cover image has been removed');
  }
}

function sanitizeRemoteUrl() {
  if (!editForm.value.remote_url) return;

  // Check if it's a GitHub Gist Raw URL with commit hash
  // Format: https://gist.githubusercontent.com/<user>/<id>/raw/<hash>/<file>
  // Target: https://gist.githubusercontent.com/<user>/<id>/raw/<file>

  const gistRegex =
    /^(https:\/\/gist\.githubusercontent\.com\/[^/]+\/[^/]+\/raw)\/[0-9a-f]{40}\/(.+)$/;
  const match = editForm.value.remote_url.match(gistRegex);

  if (match) {
    const newUrl = `${match[1]}/${match[2]}`;
    // Only update if different to avoid infinite loops or cursor jumps if typing
    if (newUrl !== editForm.value.remote_url) {
      editForm.value.remote_url = newUrl;
      toast.info(
        "URL Sanitized",
        "Removed commit hash from Gist URL to ensure updates work."
      );
    }
  }
}

// Watch for remote URL changes to sanitize automatically
watch(
  () => editForm.value.remote_url,
  () => {
    sanitizeRemoteUrl();
  }
);

// Reset filters when content type tab changes
watch(contentTypeTab, () => {
  modsFilter.value = "all";
  searchQueryInstalled.value = "";
});

// Add mod from analysis (CurseForge project ID) or Discovery (with optional fileId)
async function handleAddModFromAnalysis(cfProjectId: number, fileId?: number) {
  if (!modpack.value) return;

  if (isLinked.value) {
    toast.error(
      "Action Restricted",
      "Cannot add mods to a linked modpack. Manage mods from the remote source."
    );
    return;
  }

  try {
    // Get the mod from CurseForge
    const cfMod = await window.api.curseforge.getMod(cfProjectId);
    if (!cfMod) {
      toast.error("Mod not found", "Could not find the mod on CurseForge");
      return;
    }

    let selectedFileId = fileId;

    // If no specific file provided, find the best match
    if (!selectedFileId) {
      const files = await window.api.curseforge.getModFiles(cfProjectId, {
        gameVersion: modpack.value.minecraft_version,
        modLoader: modpack.value.loader,
      });

      if (files.length === 0) {
        toast.error(
          "No compatible files",
          "No files found for your MC version and loader"
        );
        return;
      }
      selectedFileId = files[0].id;
    }

    // Add to library first
    const addedMod = await window.api.curseforge.addToLibrary(
      cfProjectId,
      selectedFileId,
      modpack.value.loader
    );

    if (addedMod) {
      // Add to modpack
      await window.api.modpacks.addMod(props.modpackId, addedMod.id);

      // Mark as recently added
      recentlyAddedMods.value.add(addedMod.id);
      setTimeout(() => {
        recentlyAddedMods.value.delete(addedMod.id);
      }, RECENT_THRESHOLD_MS);

      await loadData();
      emit("update");
      toast.success("Mod added", `${cfMod.name} has been added`);
    }
  } catch (err) {
    console.error("Failed to add mod from analysis:", err);
    toast.error("Failed to add mod", (err as Error).message);
  }
}

async function exportManifest(mode: 'full' | 'current' = 'full') {
  if (!props.modpackId) return;
  try {
    const json = await window.api.remote.exportManifest(props.modpackId, {
      versionHistoryMode: mode
    });
    await navigator.clipboard.writeText(json);
    toast.success(
      "Manifest Copied",
      `JSON copied to clipboard (${mode === 'full' ? 'full history' : 'current version only'}). You can now paste it into a GitHub Gist.`
    );
  } catch (err) {
    console.error("Failed to export manifest:", err);
    toast.error("Export Failed", (err as Error).message);
  }
}

// Resource list export
const isExportingResourceList = ref(false);

async function exportResourceList(format: 'simple' | 'detailed' | 'markdown') {
  if (!props.modpackId) return;
  isExportingResourceList.value = true;
  try {
    const result = await window.api.modpacks.generateResourceList(props.modpackId, {
      format,
      sortBy: 'name',
      includeDisabled: true
    });
    await navigator.clipboard.writeText(result.formatted);
    toast.success(
      "Resource List Copied",
      `${result.stats.total} resources copied to clipboard in ${format} format.`
    );
  } catch (err) {
    console.error("Failed to export resource list:", err);
    toast.error("Export Failed", (err as Error).message);
  } finally {
    isExportingResourceList.value = false;
  }
}

// Gist publishing
const isPushingToGist = ref(false);
const isDeletingGist = ref(false);
const hasGistToken = ref(false);
const gistExistsRemotely = ref(false);
const isCheckingGistExists = ref(false);

// Check for Gist token on mount
onMounted(async () => {
  hasGistToken.value = await window.api.gist.hasToken();
  // Note: checkGistExists is called after loadData() completes in the isOpen watcher
});

// Check if the linked Gist still exists remotely
async function checkGistExists() {
  if (!modpack.value?.gist_config?.gist_id) {
    gistExistsRemotely.value = false;
    return;
  }

  isCheckingGistExists.value = true;
  try {
    gistExistsRemotely.value = await window.api.gist.gistExists(modpack.value.gist_config.gist_id);
  } catch {
    gistExistsRemotely.value = false;
  } finally {
    isCheckingGistExists.value = false;
  }
}

async function deleteGistFromRemote() {
  if (!props.modpackId || !modpack.value?.gist_config?.gist_id) return;

  isDeletingGist.value = true;
  try {
    const result = await window.api.gist.deleteGist(props.modpackId);

    if (result.success) {
      await loadData();
      gistExistsRemotely.value = false;
      toast.success("Gist Deleted", "Remote Gist has been deleted and unlinked.");
    } else {
      toast.error("Delete Failed", result.error || "Unknown error");
    }
  } catch (err) {
    console.error("Failed to delete Gist:", err);
    toast.error("Delete Failed", (err as Error).message);
  } finally {
    isDeletingGist.value = false;
  }
}

async function pushToGist(mode?: 'full' | 'current') {
  if (!props.modpackId || !modpack.value) return;

  // Check if token is configured
  if (!hasGistToken.value) {
    toast.error(
      "GitHub Not Connected",
      "Add your GitHub token in Settings > General > GitHub Gist"
    );
    return;
  }

  isPushingToGist.value = true;
  try {
    // Use provided mode, or load default from settings
    let resolvedMode: 'full' | 'current' = mode || 'full';
    if (!mode) {
      try {
        const gistSettings = await window.api.settings.getGist();
        resolvedMode = gistSettings.defaultManifestMode || 'full';
      } catch {
        // Fallback to 'full' if settings fail
      }
    }

    const result = await window.api.gist.pushManifest(props.modpackId, {
      versionHistoryMode: resolvedMode,
    });

    if (result.success) {
      // Reload modpack data to get updated gist_config
      await loadData();

      // Mark that the Gist exists remotely
      gistExistsRemotely.value = true;

      // Copy the raw URL to clipboard for easy sharing
      if (result.rawUrl) {
        await navigator.clipboard.writeText(result.rawUrl);
      }

      toast.success(
        modpack.value.gist_config?.gist_id ? "Gist Updated ✓" : "Gist Created ✓",
        `Manifest published to Gist. URL copied to clipboard.`
      );
    } else {
      toast.error("Push Failed", result.error || "Unknown error");
    }
  } catch (err) {
    console.error("Failed to push to Gist:", err);
    toast.error("Push Failed", (err as Error).message);
  } finally {
    isPushingToGist.value = false;
  }
}

async function openGistInBrowser() {
  if (modpack.value?.gist_config?.html_url) {
    window.open(modpack.value.gist_config.html_url, '_blank');
  }
}

async function copyGistUrl() {
  if (modpack.value?.gist_config?.raw_url) {
    await navigator.clipboard.writeText(modpack.value.gist_config.raw_url);
    toast.success("URL Copied", "Gist raw URL copied to clipboard");
  }
}

async function checkForRemoteUpdates() {
  if (!modpack.value || !editForm.value.remote_url) return;

  isCheckingUpdate.value = true;
  try {
    // Save the URL first if it changed
    if (modpack.value.remote_source?.url !== editForm.value.remote_url) {
      await window.api.modpacks.update(props.modpackId, {
        remote_source: {
          url: editForm.value.remote_url,
          auto_check: editForm.value.auto_check_remote,
        },
      });
      // Update local ref
      if (!modpack.value.remote_source) {
        modpack.value.remote_source = {
          url: editForm.value.remote_url,
          auto_check: editForm.value.auto_check_remote,
        };
      } else {
        modpack.value.remote_source.url = editForm.value.remote_url;
      }
    }

    const result = await window.api.remote.checkUpdate(props.modpackId);

    if (result.hasUpdate && result.changes) {
      // Map backend changes to ModpackChange[]
      const changes: ModpackChange[] = [];

      result.changes.addedMods.forEach((mod: { name: string; version: string }) => {
        changes.push({
          type: "add",
          modId: mod.name,
          modName: mod.name,
          newVersion: mod.version,
        });
      });

      result.changes.removedMods.forEach((name) => {
        changes.push({ type: "remove", modId: name, modName: name });
      });

      result.changes.updatedMods.forEach((name) => {
        // Parse "ModName (v1.0.0 → v1.0.1)"
        const match = name.match(/^(.*) \((.*) → (.*)\)$/);
        if (match) {
          changes.push({
            type: "update",
            modId: match[1],
            modName: match[1],
            previousVersion: match[2],
            newVersion: match[3],
          });
        } else {
          changes.push({ type: "update", modId: name, modName: name });
        }
      });

      if (result.changes.enabledMods) {
        result.changes.enabledMods.forEach((name) => {
          changes.push({ type: "enable", modId: name, modName: name });
        });
      }

      if (result.changes.disabledMods) {
        result.changes.disabledMods.forEach((name) => {
          changes.push({ type: "disable", modId: name, modName: name });
        });
      }

      if (result.changes.lockedMods) {
        result.changes.lockedMods.forEach((name) => {
          changes.push({ type: "lock", modId: name, modName: name });
        });
      }

      if (result.changes.unlockedMods) {
        result.changes.unlockedMods.forEach((name) => {
          changes.push({ type: "unlock", modId: name, modName: name });
        });
      }

      // Show version control changes (includes config changes synced via version history)
      if (result.changes.hasVersionHistoryChanges) {
        changes.push({
          type: "version_control",
          modId: "version_history",
          modName: "Version Control History"
        });
      }

      // Show loader/version metadata changes
      if (result.changes.loaderChanged) {
        changes.push({
          type: "loader_change",
          modId: "_loader_type_",
          modName: `Loader: ${result.changes.loaderChanged.from || 'none'} → ${result.changes.loaderChanged.to || 'none'}`
        });
      }
      if (result.changes.loaderVersionChanged) {
        changes.push({
          type: "loader_change",
          modId: "_loader_version_",
          modName: `Loader Version: ${result.changes.loaderVersionChanged.from || 'none'} → ${result.changes.loaderVersionChanged.to || 'none'}`
        });
      }
      if (result.changes.minecraftVersionChanged) {
        changes.push({
          type: "loader_change",
          modId: "_minecraft_version_",
          modName: `Minecraft: ${result.changes.minecraftVersionChanged.from || 'none'} → ${result.changes.minecraftVersionChanged.to || 'none'}`
        });
      }

      updateResult.value = {
        hasUpdate: true,
        changes,
        remoteManifest: result.remoteManifest,
      };
      showReviewDialog.value = true;
    } else {
      toast.success("Up to Date", "No updates available from remote source");
    }
  } catch (error) {
    console.error("Failed to check updates:", error);
    toast.error("Check Failed", (error as Error).message);
  } finally {
    isCheckingUpdate.value = false;
  }
}

async function applyRemoteUpdate() {
  showReviewDialog.value = false;

  if (
    !updateResult.value ||
    !modpack.value ||
    !updateResult.value.remoteManifest
  )
    return;

  // Deep clone to remove Vue proxies and ensure clean JSON for IPC
  const manifest = JSON.parse(
    JSON.stringify(updateResult.value.remoteManifest)
  );

  // Show progress toast
  // toast.info("Updating Modpack", "Applying remote changes...");
  showProgressDialog.value = true;
  progressState.value = { message: "Starting update...", percent: 0 };

  try {
    // Progress handler
    const progressHandler = (data: {
      current: number;
      total: number;
      modName: string;
    }) => {
      const percent = Math.round((data.current / data.total) * 100);
      progressState.value = {
        message: `Downloading ${data.modName} (${data.current}/${data.total})`,
        percent,
      };
    };

    const removeProgressListener = window.api.on("import:progress", progressHandler);

    // Pass the current modpack ID to ensure we update THIS modpack
    const result = await window.api.import.modexFromData(
      manifest,
      props.modpackId
    );

    // Remove listener
    removeProgressListener();

    if (result && result.success) {
      toast.success("Update Complete", `Modpack updated successfully!`);
      // Clear update result so banner disappears
      updateResult.value = null;

      // Update check timestamp
      if (modpack.value.remote_source) {
        await window.api.modpacks.update(props.modpackId, {
          remote_source: {
            ...modpack.value.remote_source,
            last_checked: new Date().toISOString(),
          },
        });
      }

      await loadData();
      emit("update");
    } else {
      toast.error("Update Failed", result?.errors?.[0] || "Unknown error");
    }
  } catch (err) {
    console.error("Failed to apply update:", err);
    toast.error("Update Error", (err as Error).message);
  } finally {
    showProgressDialog.value = false;
  }
}

// CurseForge modpack update checking
async function checkForCFUpdate() {
  if (!modpack.value?.cf_project_id) return;

  isCheckingCFUpdate.value = true;
  try {
    const result = await window.api.modpacks.checkCFUpdate(props.modpackId);
    cfUpdateInfo.value = result;

    if (result.hasUpdate) {
      toast.success(
        "Update Available",
        `New version: ${result.latestVersion}`
      );
    } else {
      toast.success("Up to Date", "You have the latest version");
    }
  } catch (error) {
    console.error("Failed to check CF update:", error);
    toast.error("Check Failed", (error as Error).message);
  } finally {
    isCheckingCFUpdate.value = false;
  }
}

async function viewCFChangelog(fileId?: number) {
  if (!modpack.value?.cf_project_id) return;

  const targetFileId = fileId || modpack.value.cf_file_id;
  if (!targetFileId) return;

  isLoadingChangelog.value = true;
  showCFChangelog.value = true;

  try {
    cfChangelog.value = await window.api.modpacks.getCFChangelog(
      modpack.value.cf_project_id,
      targetFileId
    );
  } catch (error) {
    console.error("Failed to load changelog:", error);
    cfChangelog.value = "Failed to load changelog";
  } finally {
    isLoadingChangelog.value = false;
  }
}

// Check if modpack is from CurseForge
const isCFModpack = computed(() => {
  return !!modpack.value?.cf_project_id;
});

function openCFUpdateDialog() {
  showCFUpdateDialog.value = true;
}

async function applyCFUpdate(createNew: boolean) {
  if (!cfUpdateInfo.value?.latestFileId) return;

  isApplyingCFUpdate.value = true;
  cfUpdateProgress.value = { current: 0, total: 100, currentMod: "Starting update..." };

  try {
    const result = await window.api.modpacks.updateCFModpack(
      props.modpackId,
      cfUpdateInfo.value.latestFileId,
      createNew,
      (current, total, modName) => {
        cfUpdateProgress.value = { current, total, currentMod: modName };
      }
    );

    showCFUpdateDialog.value = false;

    if (result.success) {
      toast.success(
        "Update Complete",
        createNew
          ? `Created new modpack with ${result.modsImported} mods`
          : `Updated modpack with ${result.modsImported} mods`
      );

      // Reload data if we updated the current modpack
      if (!createNew) {
        await loadData();
        cfUpdateInfo.value = null;
      } else {
        // Emit event to refresh modpack list
        emit("updated");
      }
    } else {
      toast.error("Update Failed", result.errors[0] || "Unknown error");
    }
  } catch (error) {
    console.error("Failed to apply CF update:", error);
    toast.error("Update Failed", (error as Error).message);
  } finally {
    isApplyingCFUpdate.value = false;
    cfUpdateProgress.value = { current: 0, total: 0, currentMod: "" };
  }
}

// Re-search incompatible mods on CurseForge
async function reSearchIncompatibleMods() {
  if (!modpack.value?.incompatible_mods?.length) {
    toast.success("No incompatible mods", "There are no incompatible mods to search for");
    return;
  }

  isReSearching.value = true;
  reSearchProgress.value = { current: 0, total: modpack.value.incompatible_mods.length, currentMod: "" };

  try {
    const result = await window.api.modpacks.reSearchIncompatible(
      props.modpackId,
      (current, total, modName) => {
        reSearchProgress.value = { current, total, currentMod: modName };
      }
    );

    // Reload modpack data to get updated incompatible_mods list
    await loadData();

    if (result.added.length > 0) {
      toast.success(
        "Re-search Complete",
        `Found and added ${result.added.length} compatible version(s). ${result.stillIncompatible.length} mod(s) still incompatible.`
      );
    } else {
      toast.info(
        "Re-search Complete",
        `No compatible versions found. ${result.stillIncompatible.length} mod(s) still incompatible.`
      );
    }
  } catch (error) {
    console.error("Failed to re-search incompatible mods:", error);
    toast.error("Re-search Failed", (error as Error).message);
  } finally {
    isReSearching.value = false;
    reSearchProgress.value = { current: 0, total: 0, currentMod: "" };
  }
}

// Track if initial check has been done for this modpack session
const hasCheckedUpdatesOnOpen = ref(false);

// Game log listener cleanup is now handled by useModpackGameLogs composable

watch(
  () => props.isOpen,
  async (newVal) => {
    if (newVal) {
      hasCheckedUpdatesOnOpen.value = false;
      loadError.value = null; // Reset error state on open

      // Set initial tab if provided
      if (props.initialTab) {
        activeTab.value = props.initialTab;
      }

      // Fetch Minecraft versions and loader types from CurseForge (cached after first fetch)
      fetchMinecraftVersions();
      fetchLoaderTypes();

      try {
        await loadData();
        await loadInstance();
        await loadSyncSettings();
        await loadModifiedConfigs();

        // Check gist exists after modpack data is loaded
        await checkGistExists();
      } catch (err) {
        console.error("[ModpackEditor] Error during initial load:", err);
        loadError.value = (err as Error).message || "Failed to load modpack data";
      }

      // Pre-fetch loader versions for settings tab
      if (editForm.value.minecraft_version && editForm.value.loader) {
        fetchLoaderVersions();
      }

      // Set up game log listener (handled by composable)
      setupLogListener();

      // Check for mod updates only on initial open
      setTimeout(() => {
        if (!hasCheckedUpdatesOnOpen.value) {
          hasCheckedUpdatesOnOpen.value = true;
          checkAllUpdates();
        }
      }, 500);
    } else {
      // Cleanup on close
      cleanupLogListener();
      clearLogs();
    }
  },
  { immediate: true }
);

watch(
  () => props.modpackId,
  async () => {
    if (props.isOpen) {
      hasCheckedUpdatesOnOpen.value = false;
      try {
        await loadData();
        await loadInstance();

        // Check gist exists after modpack data is loaded
        await checkGistExists();
      } catch (err) {
        console.error("[ModpackEditor] Error loading modpack on ID change:", err);
        loadError.value = (err as Error).message || "Failed to load modpack";
      }

      // Check for mod updates only on modpack change
      setTimeout(() => {
        if (!hasCheckedUpdatesOnOpen.value) {
          hasCheckedUpdatesOnOpen.value = true;
          checkAllUpdates();
        }
      }, 500);
    }
  }
);

// Cleanup listener when component is destroyed (prevents memory leaks and white screen)
// Note: useModpackGameLogs composable handles its own cleanup via onUnmounted
</script>

<template>
  <!-- Wrapper: changes based on fullScreen mode -->
  <div v-if="isOpen"
    :class="fullScreen
      ? 'h-full flex flex-col bg-background overflow-hidden'
      : 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150'">

    <!-- Error State - Prevents white screen -->
    <div v-if="loadError && !isLoading"
      class="bg-background border border-border/50 rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col items-center gap-4">
      <div class="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <Icon name="AlertCircle" class="w-8 h-8 text-destructive" />
      </div>
      <div class="text-center">
        <h3 class="text-lg font-semibold text-foreground mb-2">Errore di Caricamento</h3>
        <p class="text-sm text-muted-foreground mb-4">{{ loadError }}</p>
      </div>
      <div class="flex gap-3">
        <Button variant="outline" @click="$emit('close')">
          <Icon name="X" class="w-4 h-4 mr-2" />
          Chiudi
        </Button>
        <Button @click="loadError = null; loadData()">
          <Icon name="RefreshCw" class="w-4 h-4 mr-2" />
          Riprova
        </Button>
      </div>
    </div>

    <!-- Main Content (only show if no error) -->
    <div v-else
      :class="fullScreen
        ? 'flex-1 flex flex-col overflow-hidden'
        : 'bg-background border border-border/50 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150'">

      <!-- Modern Header with Background Image -->
      <div class="shrink-0 relative overflow-hidden" :class="fullScreen && 'border-b border-border/40'">
        <!-- Background Image (modpack image or placeholder) -->
        <div class="absolute inset-0">
          <img :src="modpack?.image_url
            ? (modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
              ? modpack.image_url
              : 'atom:///' + modpack.image_url.replace(/\\/g, '/'))
            : DefaultModpackImage" class="w-full h-full object-cover blur-sm scale-110"
            @error="($event.target as HTMLImageElement).src = DefaultModpackImage" />
          <!-- Gradient overlays for readability -->
          <div class="absolute inset-0 bg-gradient-to-r from-background/95 via-background/50 to-background/10"></div>
          <div class="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent"></div>
        </div>

        <!-- Main Header Content -->
        <div class="relative px-4 sm:px-6 py-4 sm:py-5">
          <div class="flex items-center gap-4">
            <!-- Back Button (full-screen mode only) -->
            <Button v-if="fullScreen" variant="ghost" size="sm"
              class="h-9 w-9 p-0 rounded-xl shrink-0 hover:bg-white/10 backdrop-blur-sm" @click="$emit('close')">
              <Icon name="ArrowLeft" class="w-4 h-4" />
            </Button>

            <!-- Name & Meta -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h2 class="text-lg sm:text-xl font-bold truncate text-foreground tracking-tight drop-shadow-sm">
                  {{ modpack?.name || "Loading..." }}
                </h2>
                <span v-if="modpack?.version"
                  class="hidden sm:inline text-xs px-2.5 py-1 rounded-lg bg-muted/60 text-muted-foreground font-mono border border-border/40 backdrop-blur-sm">
                  v{{ modpack.version }}
                </span>
                <span v-if="modpack?.remote_source?.url"
                  class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-xs font-medium border border-primary/30 backdrop-blur-sm"
                  title="This modpack is linked to a remote source">
                  <Icon name="Share2" class="w-3 h-3" />
                  Linked
                </span>
              </div>

              <!-- Stats Row -->
              <div class="flex items-center gap-2 flex-wrap">
                <div v-if="modpack?.minecraft_version"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-sm">
                  <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span class="text-xs font-semibold text-emerald-400">{{ modpack.minecraft_version }}</span>
                </div>
                <div v-if="modpack?.loader"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border capitalize backdrop-blur-sm" :class="modpack.loader.toLowerCase() === 'forge'
                    ? 'bg-orange-500/15 border-orange-500/30'
                    : modpack.loader.toLowerCase() === 'fabric'
                      ? 'bg-yellow-500/15 border-yellow-500/30'
                      : modpack.loader.toLowerCase() === 'neoforge'
                        ? 'bg-red-500/15 border-red-500/30'
                        : 'bg-purple-500/15 border-purple-500/30'">
                  <div class="w-2 h-2 rounded-full" :class="modpack.loader.toLowerCase() === 'forge'
                    ? 'bg-orange-500'
                    : modpack.loader.toLowerCase() === 'fabric'
                      ? 'bg-yellow-500'
                      : modpack.loader.toLowerCase() === 'neoforge'
                        ? 'bg-red-500'
                        : 'bg-purple-500'"></div>
                  <span class="text-xs font-medium" :class="modpack.loader.toLowerCase() === 'forge'
                    ? 'text-orange-400'
                    : modpack.loader.toLowerCase() === 'fabric'
                      ? 'text-yellow-400'
                      : modpack.loader.toLowerCase() === 'neoforge'
                        ? 'text-red-400'
                        : 'text-purple-400'">{{ modpack.loader }}</span>
                </div>
                <div
                  class="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 border border-border/40 backdrop-blur-sm">
                  <Icon name="Layers" class="w-3.5 h-3.5 text-muted-foreground" />
                  <span class="text-xs font-medium text-muted-foreground">{{ currentMods.length }} mods</span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <!-- Image Menu -->
              <div class="relative hidden sm:block">
                <Button variant="ghost" size="sm" class="h-9 w-9 p-0 rounded-xl hover:bg-white/10 backdrop-blur-sm"
                  @click="showImageMenu = !showImageMenu" title="Manage cover image">
                  <Icon name="ImagePlus" class="w-4 h-4" />
                </Button>
                <!-- Click outside to close -->
                <div v-if="showImageMenu" class="fixed inset-0 z-40" @click="showImageMenu = false"></div>
                <div v-if="showImageMenu"
                  class="absolute right-0 top-full mt-1 w-40 py-1 bg-card border border-border rounded-xl shadow-xl z-50">
                  <button class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 flex items-center gap-2"
                    @click="selectImage(); showImageMenu = false">
                    <Icon name="ImagePlus" class="w-4 h-4" />
                    Set Image
                  </button>
                  <button v-if="modpack?.image_url"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                    @click="removeImage(); showImageMenu = false">
                    <Icon name="X" class="w-4 h-4" />
                    Remove Image
                  </button>
                </div>
              </div>
              <Button variant="outline" size="sm"
                class="hidden md:flex h-9 px-4 gap-2 rounded-xl border-border/50 hover:bg-white/10 backdrop-blur-sm"
                @click="$emit('export')">
                <Icon name="Download" class="w-4 h-4" />
                <span class="font-medium">Export</span>
              </Button>
              <!-- Close button (modal mode only) -->
              <Button v-if="!fullScreen" variant="ghost" size="sm"
                class="h-9 w-9 p-0 rounded-xl hover:bg-destructive/10 hover:text-destructive backdrop-blur-sm"
                @click="$emit('close')">
                <Icon name="X" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Remote Update Banner -->
        <div v-if="updateResult?.hasUpdate" class="px-3 sm:px-6 pb-3 sm:pb-4">
          <UpdateAvailableBanner :current-version="modpack?.version || 'unknown'" :new-version="updateResult.remoteManifest?.modpack.version || 'unknown'
            " :is-checking="isCheckingUpdate" @update="showReviewDialog = true" />
        </div>

        <!-- Tab Navigation -->
        <div class="relative px-4 sm:px-6 pb-4">
          <div class="flex justify-center items-center gap-3">
            <div class="inline-flex items-center gap-1 p-1 rounded-2xl bg-muted/50 border border-border/50">
              <!-- Primary Tabs -->
              <button class="tab-pill" :class="activeTab === 'mods' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'mods'">
                <Icon name="Layers" class="w-3.5 h-3.5" />
                <span>Resources</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'configs' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'configs'">
                <Icon name="FileCode" class="w-3.5 h-3.5" />
                <span>Configs</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'settings' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'settings'">
                <Icon name="Settings" class="w-3.5 h-3.5" />
                <span>Details</span>
              </button>

              <!-- More dropdown for secondary tabs -->
              <div class="relative">
                <button class="tab-pill" :class="isSecondaryTab ? 'tab-pill-active' : 'tab-pill-inactive'"
                  @click="toggleMoreMenu($event)">
                  <Icon name="MoreHorizontal" class="w-3.5 h-3.5" />
                  <span class="hidden sm:inline">More</span>
                  <span v-if="versionUnsavedCount > 0 && !isSecondaryTab"
                    class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <Icon name="ChevronDown" class="w-3 h-3 transition-transform"
                    :class="showMoreMenu ? 'rotate-180' : ''" />
                </button>
              </div>
            </div>

            <!-- Cloud Sync Button - Separate from main tabs -->
            <button class="tab-pill" :class="activeTab === 'remote' ? 'tab-pill-active' : 'tab-pill-inactive'"
              @click="activeTab = 'remote'" title="Sync with cloud & share your modpack">
              <Icon name="CloudUpload" class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Share</span>
              <span v-if="gistExistsRemotely || editForm.remote_url" class="w-2 h-2 rounded-full bg-primary"></span>
            </button>
          </div>

          <!-- Dropdown menu - Positioned outside the tab container for proper z-index -->
          <Teleport to="body">
            <Transition name="fade">
              <div v-if="showMoreMenu" class="fixed inset-0 z-[200]" @click="showMoreMenu = false">
                <div
                  class="absolute w-48 bg-popover/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl py-1.5 overflow-hidden"
                  :style="moreMenuPosition" @click.stop>
                  <button
                    class="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 hover:bg-muted/60 transition-colors"
                    :class="activeTab === 'discover' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'discover'; showMoreMenu = false">
                    <Icon name="Sparkles" class="w-4 h-4" />
                    Add Mods
                  </button>
                  <button
                    class="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 hover:bg-muted/60 transition-colors"
                    :class="activeTab === 'health' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'health'; showMoreMenu = false">
                    <Icon name="Stethoscope" class="w-4 h-4" />
                    Diagnostics
                  </button>
                  <button
                    class="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 hover:bg-muted/60 transition-colors"
                    :class="activeTab === 'versions' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'versions'; showMoreMenu = false">
                    <Icon name="GitBranch" class="w-4 h-4" />
                    History
                    <span v-if="versionUnsavedCount > 0"
                      class="ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {{ versionUnsavedCount }}
                    </span>
                  </button>
                </div>
              </div>
            </Transition>
          </Teleport>
        </div>
      </div>

      <!-- Help Guide Banner (collapsible) - Hidden on mobile -->
      <div class="hidden sm:block shrink-0 border-b border-border/30">
        <!-- Help Toggle Button -->
        <button @click="showHelp = !showHelp"
          class="w-full px-3 sm:px-6 py-2 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors">
          <div class="flex items-center gap-2">
            <Icon name="HelpCircle" class="w-4 h-4 text-primary" />
            <span class="text-muted-foreground">
              <span class="font-medium text-foreground">Need help?</span>
              <span class="hidden sm:inline"> Click to see how to use this section</span>
            </span>
          </div>
          <Icon name="ChevronDown"
            :class="['w-4 h-4 text-muted-foreground transition-transform', showHelp && 'rotate-180']" />
        </button>

        <!-- Help Content (expanded) -->
        <div v-if="showHelp" class="px-3 sm:px-6 pb-4 pt-2 bg-muted/20 border-t border-border/20">
          <!-- Configs Tab Help -->
          <div v-if="activeTab === 'configs'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="FileCode" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-foreground mb-2">Configs - Edit Game Settings</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Browse and edit configuration files for your mods directly from ModEx.
                </p>

                <!-- Understanding Config Locations -->
                <div class="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <h5 class="font-medium text-blue-400 flex items-center gap-1.5 mb-2">
                    <Icon name="Info" class="w-4 h-4" />
                    Understanding Config Locations
                  </h5>
                  <div class="text-sm text-muted-foreground space-y-2">
                    <p><strong class="text-foreground">Instance Configs</strong> — Where Minecraft actually runs. When
                      you play, mods read and write configs here. Your in-game changes are saved here.</p>
                    <p><strong class="text-foreground">Modpack Overrides</strong> — The "official" configs saved in the
                      modpack itself. When you sync or share the modpack, these are used.</p>
                  </div>
                </div>

                <!-- Config Changes Banner Explanation -->
                <div class="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <h5 class="font-medium text-amber-400 flex items-center gap-1.5 mb-2">
                    <Icon name="FolderSync" class="w-4 h-4" />
                    "Config Changes Detected" Banner
                  </h5>
                  <div class="text-sm text-muted-foreground space-y-2">
                    <p>This banner appears when your <strong class="text-foreground">instance configs differ from the
                        modpack overrides</strong>. This happens when you change settings while playing.</p>
                    <p><strong class="text-foreground">Import Selected</strong> — Saves your changes into the modpack.
                      Use this to:</p>
                    <ul class="list-disc ml-5 space-y-1">
                      <li>Preserve your keybind customizations</li>
                      <li>Save mod settings you've configured</li>
                      <li>Include your config tweaks when sharing the modpack</li>
                    </ul>
                    <p class="text-xs text-muted-foreground/70 mt-2">💡 By default, only <em>modified</em> configs are
                      shown. Check "Show new configs" to see files generated by mods that don't exist in the modpack
                      yet.</p>
                  </div>
                </div>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <Icon name="FileEdit" class="w-4 h-4 text-primary" />
                      Structured Editor
                    </h5>
                    <p class="text-muted-foreground">Edit TOML, JSON, and properties files with a friendly interface.
                    </p>
                  </div>
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <Icon name="FolderOpen" class="w-4 h-4 text-primary" />
                      Quick Access
                    </h5>
                    <p class="text-muted-foreground">Open config files in your default editor with one click.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Resources Tab Help -->
          <div v-else-if="activeTab === 'mods'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="BookOpen" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-foreground mb-2">Resources - Manage Your Mod Content</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  This is where you manage all the mods, resource packs, and shaders in your modpack.
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <span
                        class="w-5 h-5 rounded bg-primary/15 text-primary flex items-center justify-center text-xs">1</span>
                      Left Panel: Your Installed Content
                    </h5>
                    <ul class="space-y-1 text-muted-foreground ml-6 list-disc">
                      <li><b>Toggle ON/OFF:</b> Click the switch to enable/disable mods</li>
                      <li><b>Checkbox:</b> Select multiple mods for bulk actions</li>
                      <li><b>Arrow up icon:</b> Quick update to latest release version</li>
                      <li><b>Branch icon:</b> Change to any specific version (downgrade/beta/alpha)</li>
                      <li><b>Lock icon:</b> Lock a mod to prevent changes (updates, enable/disable, remove)</li>
                      <li><b>Trash icon:</b> Remove a mod from the modpack</li>
                      <li><b>Updated badge:</b> Shows mods updated in last 5 minutes</li>
                      <li><b>New badge:</b> Shows recently added mods</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <span
                        class="w-5 h-5 rounded bg-primary/15 text-primary flex items-center justify-center text-xs">2</span>
                      Filters & Actions
                    </h5>
                    <ul class="space-y-1 text-muted-foreground ml-6 list-disc">
                      <li><b>All:</b> Show all installed mods</li>
                      <li><b>Incompatible:</b> Show only mods with wrong version/loader</li>
                      <li><b>Disabled:</b> Show only disabled mods</li>
                      <li><b>Locked:</b> Show only locked mods (protected from changes)</li>
                      <li><b>Updates:</b> Show only mods with updates available</li>
                      <li><b>Update All:</b> Update all mods to latest version (excludes locked)</li>
                      <li><b>Remove Incompatible:</b> Remove all incompatible mods (excludes locked)</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Lock important mods to prevent accidental changes. Locked mods are excluded from
                    bulk actions like "Update All" and "Remove Incompatible"!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Discover Tab Help -->
          <div v-else-if="activeTab === 'discover'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="BookOpen" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Discover - Find New Content</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Get smart recommendations for mods that work well with your current modpack.
                </p>

                <div class="space-y-2 text-sm">
                  <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                    <li><b>Smart suggestions:</b> Based on categories of mods you already have</li>
                    <li><b>Shuffle button:</b> Click to see different recommendations</li>
                    <li><b>Content tabs:</b> Switch between Mods, Resource Packs, and Shaders</li>
                    <li><b>Add button:</b> Click on a card to add it to your modpack</li>
                    <li><b>External link:</b> Open on CurseForge to see more details</li>
                  </ul>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> The recommendations improve as you add more mods - it learns what categories you
                    like!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Diagnostics Tab Help -->
          <div v-else-if="activeTab === 'health'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="Stethoscope" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Diagnostics - Find & Fix Issues</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Scan your modpack for missing dependencies, conflicts, and get performance recommendations.
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">What it detects:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Missing dependencies:</b> Required mods that aren't installed</li>
                      <li><b>Conflicts:</b> Incompatible mod combinations</li>
                      <li><b>RAM estimate:</b> Memory requirements for your modpack</li>
                      <li><b>Optimizations:</b> Suggestions to improve performance</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">Quick actions:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li>Click <b>"Sync Deps"</b> to fetch latest dependency data</li>
                      <li>Use <b>"Install All"</b> to add all missing dependencies</li>
                      <li>Review <b>warnings</b> for potential issues</li>
                      <li>Check <b>RAM estimate</b> before launching</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Click "Sync Deps" first to get the most accurate dependency information from
                    CurseForge!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Versions Tab Help -->
          <div v-else-if="activeTab === 'versions'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="BookOpen" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">History - Version Control</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Save snapshots of your modpack and rollback if something breaks. Like "undo" but for your entire
                  modpack!
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">Key features:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Save Version:</b> Create a snapshot with a description</li>
                      <li><b>Timeline view:</b> See all your saved versions</li>
                      <li><b>Rollback:</b> Restore to any previous version</li>
                      <li><b>Change tracking:</b> See exactly what changed between versions</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">When to save:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li>Before adding lots of new mods</li>
                      <li>When everything is working perfectly</li>
                      <li>Before major changes to configs</li>
                      <li>Before updating mods</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Always write a descriptive message when saving - "Added Biomes O' Plenty" is better
                    than "update"!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Remote Tab Help -->
          <div v-else-if="activeTab === 'remote'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="BookOpen" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Remote - Updates & Collaboration</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Keep your modpack updated and share it with others using remote sync.
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">CurseForge Modpacks:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Check for Updates:</b> See if a new version is available</li>
                      <li><b>View Changelog:</b> See what changed in new versions</li>
                      <li><b>Apply Update:</b> Update to the latest version</li>
                      <li><b>Re-search incompatible:</b> Try to find compatible versions for failed mods</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">Remote Sync (for sharing):</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Export Manifest:</b> Create a shareable JSON file</li>
                      <li><b>Remote URL:</b> Paste a Gist URL to sync from</li>
                      <li><b>Auto-check:</b> Enable to check for updates on startup</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Use GitHub Gist to host your manifest for free sharing with friends!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Settings Tab Help -->
          <div v-else-if="activeTab === 'settings'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name="BookOpen" class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Settings - Modpack Configuration</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Basic settings for your modpack. Some settings are locked after creation to prevent issues.
                </p>

                <div class="space-y-2 text-sm">
                  <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                    <li><b>Name:</b> The display name of your modpack</li>
                    <li><b>Version:</b> Your modpack's version number (e.g., 1.0.0)</li>
                    <li><b>Minecraft Version:</b> The game version (locked after creation)</li>
                    <li><b>Mod Loader:</b> Forge, Fabric, NeoForge, or Quilt (locked after creation)</li>
                    <li><b>Description:</b> A description of what the modpack is about</li>
                  </ul>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Icon name="Lightbulb" class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Why locked?</b> Changing Minecraft version or loader would make your mods incompatible.
                    Create a new modpack instead!</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- CONFIGS TAB -->
        <template v-if="activeTab === 'configs'">
          <div class="flex-1 overflow-hidden flex flex-col">
            <div v-if="!instance" class="flex flex-col items-center justify-center h-full gap-4 p-6">
              <Icon name="FileCode" class="w-16 h-16 text-muted-foreground/50" />
              <div class="text-center">
                <h3 class="font-semibold text-lg">No Instance Found</h3>
                <p class="text-sm text-muted-foreground">Create an instance using the Play button to manage configs</p>
              </div>
              <button @click="handleCreateInstance" :disabled="isCreatingInstance"
                class="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-2">
                <Icon v-if="isCreatingInstance" name="Loader2" class="w-4 h-4 animate-spin" />
                <Icon v-else name="Play" class="w-4 h-4" />
                {{ isCreatingInstance ? 'Creating...' : 'Create Instance' }}
              </button>
            </div>

            <template v-else>
              <!-- Modified Configs Banner -->
              <div v-if="importableConfigs.length > 0"
                class="shrink-0 m-4 mb-0 rounded-lg bg-primary/5 border border-primary/20 overflow-hidden">
                <button @click="showModifiedConfigsDetails = !showModifiedConfigsDetails"
                  class="w-full p-3 flex items-center justify-between hover:bg-primary/5 transition-colors duration-150">
                  <div class="flex items-center gap-3">
                    <Icon name="FolderSync" class="w-4 h-4 text-primary" />
                    <div class="text-left">
                      <div class="font-medium text-sm text-primary">Config Changes Detected</div>
                      <div class="text-xs text-muted-foreground">
                        {{ importableConfigs.length }} config files modified in instance
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button @click.stop="importSelectedConfigs"
                      :disabled="selectedConfigsForImport.size === 0 || isImportingConfigs"
                      class="px-3 py-1.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                      <Icon v-if="isImportingConfigs" name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                      <Icon v-else name="Download" class="w-3.5 h-3.5" />
                      Import Selected
                    </button>
                    <Icon name="ChevronDown" class="w-4 h-4 text-primary transition-transform duration-150"
                      :class="{ 'rotate-180': showModifiedConfigsDetails }" />
                  </div>
                </button>

                <!-- Details -->
                <div v-if="showModifiedConfigsDetails" class="px-4 pb-4 border-t border-primary/20 pt-3">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <div class="text-xs text-muted-foreground">
                        Select configs to import to modpack overrides
                      </div>
                      <!-- Toggle to show new configs -->
                      <label v-if="newConfigsCount > 0" class="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" v-model="showOnlyModifiedConfigs"
                          class="w-3 h-3 rounded border-primary/30 text-primary focus:ring-primary/30"
                          :true-value="false" :false-value="true" />
                        <span class="text-muted-foreground">Show {{ newConfigsCount }} new configs</span>
                      </label>
                    </div>
                    <div class="flex gap-2">
                      <button @click="selectAllConfigs" class="text-xs text-primary hover:underline">Select All</button>
                      <button @click="deselectAllConfigs"
                        class="text-xs text-muted-foreground hover:underline">Clear</button>
                    </div>
                  </div>

                  <div class="space-y-1 max-h-48 overflow-y-auto">
                    <label v-for="config in importableConfigs" :key="config.relativePath"
                      class="flex items-center gap-3 p-2 rounded-lg hover:bg-primary/5 cursor-pointer group">
                      <input type="checkbox" :checked="selectedConfigsForImport.has(config.relativePath)"
                        @change="toggleConfigSelection(config.relativePath)"
                        class="w-4 h-4 rounded border-primary/30 text-primary focus:ring-primary/30" />
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">{{ config.relativePath }}</div>
                        <div class="text-xs text-muted-foreground">
                          {{ formatFileSize(config.size) }}
                        </div>
                      </div>
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase" :class="{
                        'bg-amber-500/20 text-amber-400': config.status === 'modified',
                        'bg-primary/15 text-primary': config.status === 'new'
                      }">
                        {{ config.status }}
                      </span>
                    </label>
                  </div>

                  <p class="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
                    <Icon name="Info" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Importing configs adds them to the modpack's overrides folder. This makes your customizations part
                    of the modpack.
                  </p>
                </div>
              </div>

              <!-- Config Browser -->
              <div class="flex-1 overflow-hidden">
                <ConfigBrowser :instance-id="instance.id" :instance-name="instance.name" :key="configRefreshKey"
                  @open-structured="handleOpenStructuredEditor" />
              </div>
            </template>
          </div>
        </template>

        <!-- Mods Tab -->
        <template v-else-if="activeTab === 'mods'">
          <!-- Header Bar (ModpackView style) -->
          <div class="shrink-0 px-4 py-3 border-b border-border/30 bg-muted/10">
            <div class="flex items-center justify-between gap-4">
              <!-- Left: Content Type Tabs -->
              <div class="flex items-center gap-1">
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  :class="contentTypeTab === 'mods'
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'hover:bg-muted/50 text-muted-foreground'
                    " @click="contentTypeTab = 'mods'">
                  <Icon name="Layers" class="w-3.5 h-3.5" />
                  Mods
                  <span class="text-[10px] px-1 py-0.5 rounded bg-primary/10">{{
                    contentTypeCounts.mods
                  }}</span>
                </button>
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  :class="contentTypeTab === 'resourcepacks'
                    ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
                    : 'hover:bg-muted/50 text-muted-foreground'
                    " @click="contentTypeTab = 'resourcepacks'">
                  <Icon name="Image" class="w-3.5 h-3.5" />
                  Packs
                  <span class="text-[10px] px-1 py-0.5 rounded bg-primary/10">{{
                    contentTypeCounts.resourcepacks
                  }}</span>
                </button>
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center gap-1.5"
                  :class="contentTypeTab === 'shaders'
                    ? 'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/30'
                    : 'hover:bg-muted/50 text-muted-foreground'
                    " @click="contentTypeTab = 'shaders'">
                  <Icon name="Sparkles" class="w-3.5 h-3.5" />
                  Shaders
                  <span class="text-[10px] px-1 py-0.5 rounded bg-primary/10">{{
                    contentTypeCounts.shaders
                  }}</span>
                </button>
              </div>

              <!-- Right: Actions -->
              <div class="flex items-center gap-2">
                <!-- Quick Filters (simplified - show only actionable items) -->
                <div class="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
                  <button class="px-2.5 py-1 text-[10px] rounded-md transition-all" :class="modsFilter === 'all'
                    ? 'bg-background text-foreground ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="modsFilter = 'all'">
                    All
                  </button>
                  <!-- Issues: incompatible + warnings combined visually -->
                  <button v-if="incompatibleModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'incompatible'
                      ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/40'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'incompatible'" title="Incompatible mods">
                    <Icon name="AlertCircle" class="w-3 h-3" />
                    {{ incompatibleModCount }}
                  </button>
                  <!-- Updates available (most actionable) -->
                  <button v-if="updatesAvailableCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'updates'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'updates'" title="Updates available">
                    <Icon name="ArrowUpCircle" class="w-3 h-3" />
                    {{ updatesAvailableCount }}
                  </button>
                  <!-- Disabled mods -->
                  <button v-if="disabledModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'disabled'
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'disabled'" title="Disabled mods">
                    <Icon name="ToggleLeft" class="w-3 h-3" />
                    {{ disabledModCount }}
                  </button>
                  <!-- Overflow: Less common filters in dropdown -->
                  <div
                    v-if="warningModCount > 0 || lockedModCount > 0 || modsWithNotesCount > 0 || recentlyUpdatedCount > 0 || recentlyAddedCount > 0"
                    class="relative">
                    <button
                      class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      @click="showModsFilterMenu = !showModsFilterMenu">
                      <Icon name="MoreHorizontal" class="w-3 h-3" />
                    </button>
                    <div v-if="showModsFilterMenu"
                      class="absolute top-full right-0 mt-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                      <button v-if="warningModCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'text-foreground'"
                        @click="modsFilter = 'warning'; showModsFilterMenu = false">
                        <Icon name="AlertTriangle" class="w-3 h-3" />
                        Warnings ({{ warningModCount }})
                      </button>
                      <button v-if="lockedModCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'locked' ? 'bg-amber-500/10 text-amber-400' : 'text-foreground'"
                        @click="modsFilter = 'locked'; showModsFilterMenu = false">
                        <Icon name="Lock" class="w-3 h-3" />
                        Locked ({{ lockedModCount }})
                      </button>
                      <button v-if="modsWithNotesCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'with-notes' ? 'bg-blue-500/10 text-blue-400' : 'text-foreground'"
                        @click="modsFilter = 'with-notes'; showModsFilterMenu = false">
                        <Icon name="MessageSquare" class="w-3 h-3" />
                        With Notes ({{ modsWithNotesCount }})
                      </button>
                      <div
                        v-if="(warningModCount > 0 || lockedModCount > 0 || modsWithNotesCount > 0) && (recentlyUpdatedCount > 0 || recentlyAddedCount > 0)"
                        class="h-px bg-border my-1"></div>
                      <button v-if="recentlyUpdatedCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'recent-updated' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                        @click="modsFilter = 'recent-updated'; showModsFilterMenu = false">
                        <Icon name="Check" class="w-3 h-3" />
                        Just Updated ({{ recentlyUpdatedCount }})
                      </button>
                      <button v-if="recentlyAddedCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'recent-added' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                        @click="modsFilter = 'recent-added'; showModsFilterMenu = false">
                        <Icon name="Plus" class="w-3 h-3" />
                        Just Added ({{ recentlyAddedCount }})
                      </button>
                    </div>
                    <div v-if="showModsFilterMenu" class="fixed inset-0 z-40" @click="showModsFilterMenu = false"></div>
                  </div>
                </div>

                <!-- Check Updates Button - For all content types with CurseForge support -->
                <button @click="checkAllUpdates" :disabled="isCheckingAllUpdates"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all" :class="isCheckingAllUpdates
                    ? 'bg-primary/20 text-primary cursor-wait'
                    : 'bg-muted/50 text-muted-foreground hover:bg-primary/20 hover:text-primary'"
                  :title="isCheckingAllUpdates ? 'Checking for updates...' : 'Check all resources for updates'">
                  <Icon name="RefreshCw" class="w-3.5 h-3.5" :class="{ 'animate-spin': isCheckingAllUpdates }" />
                  <span>{{ isCheckingAllUpdates ? 'Checking...' : 'Check Updates' }}</span>
                </button>

                <!-- Library Toggle -->
                <button @click="isLibraryCollapsed = !isLibraryCollapsed"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all" :class="!isLibraryCollapsed
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'">
                  <Icon name="Package" class="w-3.5 h-3.5" />
                  <span>Library</span>
                </button>

                <!-- CurseForge Button -->
                <button v-if="!isLinked"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm"
                  @click="showCFSearch = true">
                  <Icon name="Globe" class="w-3.5 h-3.5" />
                  <span>CurseForge</span>
                </button>
              </div>
            </div>

            <!-- Action Buttons (non-selection actions) -->
            <div v-if="updatesAvailableCount > 0 || incompatibleModCount > 0"
              class="flex items-center justify-end mt-2 pt-2 border-t border-border/20">
              <div class="flex items-center gap-2">
                <button v-if="updatesAvailableCount > 0 && !isLinked"
                  class="h-6 text-[10px] px-2.5 rounded flex items-center gap-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                  @click="updateAllMods">
                  <Icon name="ArrowUpCircle" class="w-3 h-3" />
                  Update All ({{ updatesAvailableCount }})
                </button>
                <button v-if="incompatibleModCount > 0 && !isLinked"
                  class="h-6 text-[10px] px-2.5 rounded flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
                  @click="removeIncompatibleMods">
                  <Icon name="Trash2" class="w-3 h-3" />
                  Remove Incompatible
                </button>
              </div>
            </div>
          </div>

          <!-- Content Split View -->
          <div class="flex-1 flex overflow-hidden">
            <!-- Left: Installed Mods -->
            <div class="flex-1 border-r border-border/50 flex flex-col"
              :class="isLibraryCollapsed ? '' : 'max-w-[60%]'">
              <!-- Compact Header with Search -->
              <div class="shrink-0 px-3 py-2 border-b border-border/20 bg-muted/10">
                <div class="flex items-center justify-between gap-3">
                  <!-- Left: Count & Status -->
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-xs font-medium text-muted-foreground">
                      {{ filteredInstalledMods.length }} installed
                      <span v-if="disabledModCount > 0" class="text-amber-500">({{ disabledModCount }} disabled)</span>
                    </span>
                  </div>

                  <!-- Center: Search Bar -->
                  <div class="flex-1 max-w-xs">
                    <div class="relative group">
                      <Icon name="Search"
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                      <input v-model="searchQueryInstalled" placeholder="Search resources..."
                        class="w-full h-8 pl-9 pr-8 text-sm rounded-lg bg-background/80 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50" />
                      <button v-if="searchQueryInstalled" @click="searchQueryInstalled = ''"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Icon name="X" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <!-- Right: Sort & Select -->
                  <div class="flex items-center gap-2 shrink-0">
                    <!-- Sort buttons -->
                    <div class="flex rounded-md border border-border/40 overflow-hidden bg-muted/20">
                      <button class="h-6 text-[10px] px-2.5 transition-colors font-medium" :class="sortBy === 'name'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'hover:bg-muted/50 text-muted-foreground'
                        " @click="toggleSort('name')">
                        Name
                      </button>
                      <button class="h-6 text-[10px] px-2.5 border-l border-border/30 transition-colors font-medium"
                        :class="sortBy === 'date'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'hover:bg-muted/50 text-muted-foreground'
                          " @click="toggleSort('date')">
                        Date
                      </button>
                      <button class="h-6 text-[10px] px-2.5 border-l border-border/30 transition-colors font-medium"
                        :class="sortBy === 'version'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'hover:bg-muted/50 text-muted-foreground'
                          " @click="toggleSort('version')">
                        Version
                      </button>
                    </div>
                    <!-- Select Enabled / Disabled / Clear -->
                    <div v-if="currentMods.length > 0 && !isLinked" class="flex items-center gap-1.5 text-[10px]">
                      <span class="text-muted-foreground/70">Select:</span>
                      <div
                        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                        <button class="text-primary hover:text-primary/80 transition-colors" @click="selectAllEnabled"
                          title="Select all enabled mods (excludes disabled and locked)">All</button>
                        <span class="text-primary/40">·</span>
                        <button class="text-primary hover:text-primary/80 transition-colors" @click="selectHalfEnabled"
                          title="Select half of enabled mods (excludes disabled and locked)">½</button>
                      </div>
                      <div
                        class="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        <button class="text-amber-500 hover:text-amber-400 transition-colors" @click="selectAllDisabled"
                          title="Select all disabled mods (excludes locked)">All</button>
                        <span class="text-amber-500/40">·</span>
                        <button class="text-amber-500 hover:text-amber-400 transition-colors"
                          @click="selectHalfDisabled" title="Select half of disabled mods (excludes locked)">½</button>
                      </div>
                      <button class="text-muted-foreground hover:text-foreground transition-colors"
                        @click="clearSelection">None</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-2">
                <div v-for="mod in installedModsWithCompatibility" :key="mod.id"
                  class="resource-card group relative rounded-xl transition-all duration-150" :class="[
                    selectedModIds.has(mod.id)
                      ? 'bg-primary/12 ring-1 ring-primary/40'
                      : !mod.isCompatible
                        ? 'bg-red-500/5 hover:bg-red-500/8'
                        : mod.hasWarning
                          ? 'bg-amber-500/5 hover:bg-amber-500/8'
                          : 'bg-muted/30 ring-1 ring-border/20 hover:bg-muted/50 hover:ring-border/40',
                    disabledModIds.has(mod.id) ? 'opacity-50' : '',
                    isLinked ? 'cursor-default' : 'cursor-pointer',
                  ]" @click="!isLinked && toggleSelect(mod.id)">

                  <!-- Main Content Row -->
                  <div class="flex items-center gap-3 p-2.5">
                    <!-- Thumbnail -->
                    <div class="relative">
                      <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted/50">
                        <img v-if="mod.thumbnail_url || mod.logo_url" :src="mod.thumbnail_url || mod.logo_url"
                          class="w-full h-full object-cover" alt="" loading="lazy"
                          @error="($event.target as HTMLImageElement).style.display = 'none'" />
                        <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Icon v-if="mod.content_type === 'mod' || !mod.content_type" name="Layers" class="w-4 h-4" />
                          <Icon v-else-if="mod.content_type === 'resourcepack'" name="Image" class="w-4 h-4" />
                          <Icon v-else name="Sparkles" class="w-4 h-4" />
                        </div>
                      </div>
                      <!-- Selection indicator overlay -->
                      <div v-if="selectedModIds.has(mod.id)"
                        class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                        <Icon name="Check" class="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    </div>

                    <!-- Info Section -->
                    <div class="flex-1 min-w-0">
                      <!-- Title Row -->
                      <div class="flex items-center gap-2 mb-1">
                        <h4
                          class="font-medium text-sm truncate text-foreground hover:text-primary cursor-pointer transition-colors"
                          @click.stop="openModDetails(mod)" title="Click to view details">
                          {{ mod.name }}
                        </h4>

                        <!-- Status Badges -->
                        <div class="flex items-center gap-1 shrink-0">
                          <span v-if="recentlyUpdatedMods.has(mod.id)"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                            <Icon name="ArrowUpCircle" class="w-2.5 h-2.5" />
                            Updated
                          </span>
                          <span v-else-if="recentlyAddedMods.has(mod.id)"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-medium">
                            <Icon name="Plus" class="w-2.5 h-2.5" />
                            New
                          </span>
                          <span v-if="!mod.isCompatible"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 font-medium">
                            <Icon name="AlertCircle" class="w-2.5 h-2.5" />
                            Incompatible
                          </span>
                          <span v-else-if="mod.hasWarning"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium"
                            title="This mod uses a different loader but may work via compatibility layers">
                            <Icon name="AlertTriangle" class="w-2.5 h-2.5" />
                            Loader
                          </span>
                        </div>
                      </div>

                      <!-- Meta Row -->
                      <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <!-- Version -->
                        <span v-if="mod.version" class="font-mono truncate max-w-[100px]" :title="mod.version">
                          v{{ mod.version }}
                        </span>

                        <span v-if="mod.version && (mod.game_versions?.length || mod.game_version)"
                          class="opacity-40">•</span>

                        <!-- Game Version -->
                        <span v-if="mod.game_versions && mod.game_versions.length >= 1" class="font-medium"
                          :class="mod.isCompatible ? 'text-primary/80' : 'text-red-500/80'"
                          :title="mod.game_versions.join(', ')">
                          {{ mod.game_versions[0] }}{{ mod.game_versions.length > 1 ? ` +${mod.game_versions.length -
                            1}` : '' }}
                        </span>
                        <span v-else-if="mod.game_version && mod.game_version !== 'unknown'" class="font-medium"
                          :class="mod.isCompatible ? 'text-primary/80' : 'text-red-500/80'">
                          {{ mod.game_version }}
                        </span>

                        <span v-if="mod.loader && mod.loader !== 'unknown'" class="opacity-40">•</span>

                        <!-- Loader -->
                        <span v-if="mod.loader && mod.loader !== 'unknown'" class="capitalize font-medium"
                          :class="mod.hasWarning ? 'text-amber-500/80' : ''">
                          {{ mod.loader }}
                        </span>

                        <!-- Incompatibility reason -->
                        <span v-if="!mod.isCompatible && mod.incompatibilityReason"
                          class="text-red-500/70 truncate max-w-[150px] ml-1" :title="mod.incompatibilityReason">
                          — {{ mod.incompatibilityReason }}
                        </span>
                        <span v-else-if="mod.hasWarning && mod.incompatibilityReason"
                          class="text-amber-500/70 truncate max-w-[150px] ml-1" :title="mod.incompatibilityReason">
                          — {{ mod.incompatibilityReason }}
                        </span>
                      </div>

                      <!-- Note Preview Row -->
                      <div v-if="getModNote(mod.id)"
                        class="flex items-center gap-1.5 text-[10px] text-blue-400/80 mt-1">
                        <Icon name="MessageSquare" class="w-3 h-3 shrink-0" />
                        <span class="truncate italic" :title="getModNote(mod.id)">
                          {{ getModNote(mod.id) }}
                        </span>
                      </div>
                    </div>

                    <!-- Right Side Controls -->
                    <div class="flex items-center gap-2 pl-2 shrink-0">
                      <!-- (buttons will be shown near lock-state) -->

                      <!-- Hover-only action buttons -->
                      <div
                        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <!-- Note Button -->
                        <button
                          class="w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-150"
                          :class="getModNote(mod.id)
                            ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/30 hover:border-blue-500/50'
                            : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-blue-400 border-border/40 hover:border-blue-500/50'"
                          :title="getModNote(mod.id) ? 'Edit note' : 'Add note'" @click.stop="openModNoteDialog(mod)">
                          <Icon v-if="getModNote(mod.id)" name="MessageSquare" class="w-3.5 h-3.5" />
                          <Icon v-else name="MessageSquarePlus" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Lock/Unlock Button (action) -->
                        <button v-if="!isLinked"
                          class="w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-150"
                          :class="lockedModIds.has(mod.id)
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-amber-500 border-border/40 hover:border-amber-500/50'"
                          :title="lockedModIds.has(mod.id) ? 'Unlock' : 'Lock'" @click.stop="toggleModLocked(mod.id)">
                          <Icon v-if="lockedModIds.has(mod.id)" name="Lock" class="w-3.5 h-3.5" />
                          <Icon v-else name="LockOpen" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Change Version Button -->
                        <button v-if="!isLinked && mod.cf_project_id"
                          class="w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-150"
                          :class="lockedModIds.has(mod.id)
                            ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground/40 border-border/20'
                            : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-primary border-border/40 hover:border-primary/50'"
                          :disabled="lockedModIds.has(mod.id)"
                          :title="lockedModIds.has(mod.id) ? 'Unlock to change' : 'Change version'"
                          @click.stop="!lockedModIds.has(mod.id) && openVersionPicker(mod)">
                          <Icon name="GitBranch" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Remove Button -->
                        <button v-if="!isLinked"
                          class="w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-150"
                          :class="lockedModIds.has(mod.id)
                            ? 'opacity-40 cursor-not-allowed bg-muted/30 text-muted-foreground/40 border-border/20'
                            : 'bg-muted/60 hover:bg-destructive/15 text-muted-foreground hover:text-destructive border-border/40 hover:border-destructive/50'"
                          :disabled="lockedModIds.has(mod.id)"
                          :title="lockedModIds.has(mod.id) ? 'Unlock to remove' : 'Remove'"
                          @click.stop="!lockedModIds.has(mod.id) && removeMod(mod.id)">
                          <Icon name="Trash2" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Managed indicator -->
                        <div v-if="isLinked"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-muted/30 text-muted-foreground/40 border border-border/20"
                          title="Remote managed">
                          <Icon name="Lock" class="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <!-- Lock state indicator and update/changelog (moved next to toggle) -->
                      <div class="flex items-center ml-1 gap-1">
                        <!-- Checking Indicator (shows while checking) -->
                        <div v-if="!isLinked && mod.cf_project_id && checkingUpdates[mod.id]"
                          class="w-6 h-6 flex items-center justify-center rounded-md bg-primary/10" title="Checking...">
                          <Icon name="RefreshCw" class="w-3.5 h-3.5 animate-spin text-primary/70" />
                        </div>

                        <!-- View Changelog (always visible when update available) -->
                        <button
                          v-if="!isLinked && mod.cf_project_id && updateAvailable[mod.id] && !checkingUpdates[mod.id]"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-muted/60 text-muted-foreground border border-border/40 hover:bg-muted hover:text-foreground transition-all duration-150"
                          title="View changelog" @click.stop="viewModChangelog(mod)">
                          <Icon name="FileText" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Update Available (always visible when update available) -->
                        <button
                          v-if="!isLinked && mod.cf_project_id && updateAvailable[mod.id] && !checkingUpdates[mod.id]"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 hover:border-primary/50 transition-all duration-150"
                          :title="`Update to ${updateAvailable[mod.id]?.displayName || 'latest version'}`"
                          @click.stop="quickUpdateMod(mod)">
                          <Icon name="ArrowUpCircle" class="w-3.5 h-3.5" />
                        </button>

                        <!-- Lock state icon (indicator only) -->
                        <div v-if="lockedModIds.has(mod.id)"
                          class="w-6 h-6 flex items-center justify-center text-amber-500" title="Locked">
                          <Icon name="Lock" class="w-3.5 h-3.5" />
                        </div>

                        <!-- Note indicator (always visible when note exists) -->
                        <button v-if="getModNote(mod.id)"
                          class="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-300 transition-colors"
                          :title="getModNote(mod.id)" @click.stop="openModNoteDialog(mod)">
                          <Icon name="MessageSquare" class="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <!-- Enable/Disable Toggle (moved to far right) -->
                      <button class="w-8 h-5 rounded-full relative shrink-0 transition-all duration-200 shadow-inner"
                        :class="[
                          disabledModIds.has(mod.id)
                            ? 'bg-muted-foreground/20'
                            : 'bg-primary shadow-primary/20',
                          (isLinked || lockedModIds.has(mod.id)) ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90',
                        ]" @click.stop="!(isLinked || lockedModIds.has(mod.id)) && toggleModEnabled(mod.id)" :title="isLinked
                          ? 'Managed by remote source'
                          : lockedModIds.has(mod.id)
                            ? 'Unlock mod to change state'
                            : disabledModIds.has(mod.id)
                              ? 'Click to enable mod'
                              : 'Click to disable mod'" :disabled="isLinked || lockedModIds.has(mod.id)">
                        <span
                          class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200"
                          :class="disabledModIds.has(mod.id) ? 'left-0.5' : 'left-[14px]'" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredInstalledMods.length === 0"
                  class="flex flex-col items-center justify-center py-12 px-4">
                  <div class="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                    <Icon v-if="contentTypeTab === 'mods'" name="Layers" class="w-8 h-8 text-muted-foreground/40" />
                    <Icon v-else-if="contentTypeTab === 'resourcepacks'" name="Image"
                      class="w-8 h-8 text-muted-foreground/40" />
                    <Icon v-else name="Sparkles" class="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-sm font-medium text-muted-foreground mb-1">
                    {{ searchQueryInstalled ? "No matching items" : "Nothing here yet" }}
                  </p>
                  <p class="text-xs text-muted-foreground/70">
                    {{
                      searchQueryInstalled
                        ? "Try a different search term"
                        : contentTypeTab === "mods"
                          ? "Add mods from the library or CurseForge"
                          : contentTypeTab === "resourcepacks"
                            ? "Add resource packs from your library"
                            : "Add shaders from your library"
                    }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Right: Available Mods (Library) -->
            <div v-if="!isLibraryCollapsed" class="flex flex-col bg-muted/5 transition-all duration-150 w-[40%]">
              <!-- Header -->
              <div class="shrink-0 px-3 py-2.5 border-b border-border/20 bg-muted/10">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <Icon name="Package" class="w-3.5 h-3.5 text-primary" />
                    <span class="text-xs font-medium">Library</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{{
                      compatibleCount }}</span>
                    <span v-if="warningAvailableCount > 0" class="text-[10px] text-amber-500" title="Different loader">
                      +{{ warningAvailableCount }}
                    </span>
                  </div>
                  <button @click="isLibraryCollapsed = true"
                    class="w-5 h-5 rounded hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                    title="Collapse">
                    <Icon name="X" class="w-3 h-3" />
                  </button>
                </div>
                <div class="relative">
                  <Icon name="Search"
                    class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  <input v-model="searchQueryAvailable" placeholder="Search..."
                    class="w-full h-7 pl-7 pr-3 text-xs rounded-lg bg-background/50 border border-border/30 focus:border-primary/40 focus:bg-background outline-none transition-all" />
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-2">
                <div v-for="mod in filteredAvailableMods" :key="mod.id"
                  class="library-card group relative rounded-lg transition-all duration-150" :class="[
                    mod.isCompatible
                      ? mod.hasWarning
                        ? 'bg-amber-500/5 ring-1 ring-amber-500/20 hover:bg-amber-500/10 cursor-pointer'
                        : 'bg-muted/30 ring-1 ring-border/20 hover:bg-muted/50 hover:ring-border/40 cursor-pointer'
                      : 'bg-muted/10 opacity-40 cursor-not-allowed'
                  ]">
                  <div class="flex items-center p-2 gap-2.5">
                    <!-- Thumbnail -->
                    <div class="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-muted/50">
                      <img v-if="mod.thumbnail_url || mod.logo_url" :src="mod.thumbnail_url || mod.logo_url"
                        class="w-full h-full object-cover" alt="" loading="lazy"
                        @error="($event.target as HTMLImageElement).style.display = 'none'" />
                      <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <Icon v-if="mod.content_type === 'mod' || !mod.content_type" name="Layers"
                          class="w-3.5 h-3.5" />
                        <Icon v-else-if="mod.content_type === 'resourcepack'" name="Image" class="w-3.5 h-3.5" />
                        <Icon v-else name="Sparkles" class="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <!-- Info -->
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="font-medium text-xs truncate hover:text-primary cursor-pointer transition-colors"
                          @click.stop="openModDetails(mod)" title="Click for details">
                          {{ mod.name }}
                        </span>
                        <Icon v-if="!mod.isCompatible" name="AlertCircle" class="w-2.5 h-2.5 text-red-500 shrink-0" />
                        <Icon v-else-if="mod.hasWarning" name="AlertTriangle"
                          class="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      </div>
                      <div class="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <!-- Game Version -->
                        <span v-if="mod.game_versions && mod.game_versions.length >= 1" class="text-primary/70"
                          :title="mod.game_versions.join(', ')">
                          {{ mod.game_versions[0] }}{{ mod.game_versions.length > 1 ? `+${mod.game_versions.length - 1}`
                            : '' }}
                        </span>
                        <span v-else-if="mod.game_version && mod.game_version !== 'unknown'" class="text-primary/70">
                          {{ mod.game_version }}
                        </span>

                        <span v-if="mod.loader && mod.loader !== 'unknown'" class="opacity-40">•</span>

                        <!-- Loader -->
                        <span v-if="mod.loader && mod.loader !== 'unknown'" class="capitalize"
                          :class="mod.hasWarning ? 'text-amber-500/80' : ''">
                          {{ mod.loader }}
                        </span>

                        <span v-if="mod.version" class="opacity-40">•</span>

                        <!-- Version -->
                        <span v-if="mod.version" class="font-mono truncate max-w-[60px]" :title="mod.version">
                          {{ mod.version }}
                        </span>
                      </div>

                      <!-- Error/Warning reason -->
                      <div v-if="!mod.isCompatible && mod.incompatibilityReason"
                        class="text-[9px] text-red-500/80 mt-0.5 truncate" :title="mod.incompatibilityReason">
                        {{ mod.incompatibilityReason }}
                      </div>
                      <div v-else-if="mod.hasWarning && mod.incompatibilityReason"
                        class="text-[9px] text-amber-500/80 mt-0.5 truncate" :title="mod.incompatibilityReason">
                        {{ mod.incompatibilityReason }}
                      </div>
                    </div>

                    <!-- Add Button -->
                    <button v-if="mod.isCompatible && !isLinked"
                      class="w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      :class="mod.hasWarning
                        ? 'text-amber-500 hover:bg-amber-500/10'
                        : 'text-primary hover:bg-primary/10'" @click.stop="addMod(mod.id)"
                      :title="mod.hasWarning ? 'Add (different loader)' : 'Add'">
                      <Icon name="Plus" class="w-3.5 h-3.5" />
                    </button>
                    <div v-else-if="!mod.isCompatible"
                      class="w-6 h-6 flex items-center justify-center shrink-0 text-muted-foreground/20">
                      <Icon name="Lock" class="w-3 h-3" />
                    </div>
                  </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredAvailableMods.length === 0"
                  class="flex flex-col items-center justify-center py-8 px-4">
                  <Icon name="Package" class="w-8 h-8 text-muted-foreground/25 mb-2" />
                  <p class="text-xs text-muted-foreground">No items available</p>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Discover Tab -->
        <div v-else-if="activeTab === 'discover'" class="flex-1 overflow-hidden">
          <RecommendationsPanel :modpack-id="modpackId" :is-linked="isLinked"
            :installed-project-files="installedProjectFiles" @add-mod="handleAddModFromAnalysis" />
        </div>

        <!-- Health Tab (Analysis) -->
        <div v-else-if="activeTab === 'health'" class="flex-1 overflow-hidden">
          <ModpackAnalysisPanel :modpack-id="modpackId" :is-linked="isLinked" @add-mod="handleAddModFromAnalysis"
            @refresh="loadData" />
        </div>

        <!-- Version History Tab -->
        <div v-else-if="activeTab === 'versions'" class="flex-1 p-6 overflow-auto">
          <VersionHistoryPanel v-if="modpack" :modpack-id="modpackId" :modpack-name="modpack.name"
            :instance-id="linkedInstanceId || undefined" :is-linked="isLinked" @refresh="refreshAndNotify"
            @unsaved-changes="(count) => versionUnsavedCount = count" />
        </div>

        <!-- Settings Tab -->
        <div v-else-if="activeTab === 'settings'" class="flex-1 p-6 overflow-auto">
          <div class="max-w-2xl mx-auto space-y-6">
            <div>
              <h3 class="text-lg font-semibold mb-4">Modpack Settings</h3>

              <div class="space-y-4">
                <!-- Name -->
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-1.5">
                    Name
                    <Icon v-if="isLinked" name="Lock" class="w-3 h-3 text-muted-foreground" />
                  </label>
                  <input v-model="editForm.name" type="text" :disabled="isLinked"
                    class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>

                <!-- Version -->
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-1.5">
                    Version
                    <Icon v-if="isLinked" name="Lock" class="w-3 h-3 text-muted-foreground" />
                  </label>
                  <input v-model="editForm.version" type="text" :disabled="isLinked"
                    class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="1.0.0" />
                </div>

                <!-- MC Version & Loader Row -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <label class="text-sm font-medium flex items-center gap-1.5">
                      Minecraft Version
                      <Icon v-if="isExistingModpack" name="Lock" class="w-3 h-3 text-muted-foreground" />
                    </label>
                    <select v-model="editForm.minecraft_version" :disabled="isExistingModpack"
                      class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed">
                      <option value="">Select version...</option>
                      <option v-for="v in availableGameVersions" :key="v" :value="v">
                        {{ v }}
                      </option>
                    </select>
                  </div>

                  <div class="space-y-2">
                    <label class="text-sm font-medium flex items-center gap-1.5">
                      Mod Loader
                      <Icon v-if="isExistingModpack" name="Lock" class="w-3 h-3 text-muted-foreground" />
                    </label>
                    <select v-model="editForm.loader" :disabled="isExistingModpack"
                      class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed capitalize">
                      <option value="">Select loader...</option>
                      <option v-for="l in loaders" :key="l" :value="l" class="capitalize">
                        {{ l }}
                      </option>
                    </select>
                  </div>

                  <!-- Loader Version -->
                  <div class="space-y-2 col-span-2">
                    <label class="text-sm font-medium flex items-center gap-1.5">
                      {{ editForm.loader ? editForm.loader.charAt(0).toUpperCase() + editForm.loader.slice(1) : 'Loader'
                      }}
                      Version
                      <Icon v-if="isLoadingLoaderVersions" name="Loader2"
                        class="w-3 h-3 animate-spin text-muted-foreground" />
                      <!-- Show current version badge when set -->
                      <span v-if="editForm.loader_version && !isLoadingLoaderVersions"
                        class="ml-auto text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Current: {{ editForm.loader_version }}
                      </span>
                    </label>
                    <div class="flex gap-2">
                      <select v-model="editForm.loader_version" :disabled="isLoadingLoaderVersions || isLinked"
                        class="flex-1 h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed">
                        <option v-if="editForm.loader_version && filteredLoaderVersions.length === 0"
                          :value="editForm.loader_version">
                          {{ editForm.loader_version }} (current)
                        </option>
                        <option v-if="!editForm.loader_version && filteredLoaderVersions.length === 0" value="">
                          {{ isLoadingLoaderVersions ? 'Loading...' : 'Click to load versions' }}
                        </option>
                        <option v-for="lv in filteredLoaderVersions" :key="lv.name"
                          :value="extractLoaderVersion(lv.name)">{{
                            extractLoaderVersion(lv.name) }}{{ lv.recommended ? ' (Recommended)' : lv.latest ? ' (Latest)'
                            : '' }}
                        </option>
                      </select>
                      <Button variant="outline" size="sm" @click="fetchLoaderVersions"
                        :disabled="isLoadingLoaderVersions || !editForm.minecraft_version || !editForm.loader"
                        title="Refresh available versions">
                        <Icon name="RefreshCw" class="w-4 h-4" :class="{ 'animate-spin': isLoadingLoaderVersions }" />
                      </Button>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      The specific version of the mod loader (used for instance creation and exports)
                    </p>
                  </div>
                </div>

                <p v-if="isExistingModpack" class="text-xs text-muted-foreground">
                  Minecraft version and loader cannot be changed after modpack
                  creation to prevent mod compatibility issues.
                </p>

                <!-- Description -->
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-1.5">
                    Description
                    <Icon v-if="isLinked" name="Lock" class="w-3 h-3 text-muted-foreground" />
                  </label>
                  <textarea v-model="editForm.description" rows="3" :disabled="isLinked"
                    class="w-full px-3 py-2 rounded-lg border border-border/50 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Describe your modpack..."></textarea>
                </div>

                <!-- Save Button -->
                <div class="pt-2">
                  <Button @click="saveModpackInfo" :disabled="isSaving || isLinked" class="gap-2">
                    <Icon name="Save" class="w-4 h-4" />
                    {{ isSaving ? "Saving..." : "Save Changes" }}
                  </Button>
                  <p v-if="isLinked" class="text-xs text-muted-foreground mt-2">
                    This modpack is managed by a remote source. Settings cannot
                    be changed locally.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Remote Tab -->
        <div v-else-if="activeTab === 'remote'" class="flex-1 p-6 overflow-auto">
          <div class="max-w-2xl mx-auto space-y-6">
            <!-- CurseForge Updates Section (for CF imported modpacks) -->
            <div v-if="isCFModpack">
              <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                <Icon name="Download" class="w-5 h-5 text-primary" />
                CurseForge Updates
              </h3>

              <div class="space-y-4">
                <!-- Current version info -->
                <div class="p-4 bg-muted/30 rounded-lg border border-border/30">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium text-sm">Installed from CurseForge</div>
                      <div class="text-xs text-muted-foreground mt-1">
                        Version: {{ modpack?.version || 'Unknown' }}
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <Button variant="ghost" size="sm" @click="viewCFChangelog()" :disabled="isLoadingChangelog">
                        <Icon name="History" class="w-3.5 h-3.5 mr-1.5" />
                        Changelog
                      </Button>
                      <Button variant="secondary" size="sm" @click="checkForCFUpdate" :disabled="isCheckingCFUpdate">
                        <Icon name="RefreshCw" class="w-3.5 h-3.5 mr-1.5"
                          :class="{ 'animate-spin': isCheckingCFUpdate }" />
                        Check Updates
                      </Button>
                    </div>
                  </div>

                  <!-- Update available banner -->
                  <div v-if="cfUpdateInfo?.hasUpdate"
                    class="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-medium text-primary text-sm flex items-center gap-2">
                          <Icon name="ArrowUpCircle" class="w-4 h-4" />
                          Update Available
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          {{ cfUpdateInfo.currentVersion }} → {{ cfUpdateInfo.latestVersion }}
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button variant="ghost" size="sm" @click="viewCFChangelog(cfUpdateInfo.latestFileId)">
                          <Icon name="History" class="w-3.5 h-3.5 mr-1.5" />
                          View Changes
                        </Button>
                        <Button size="sm" @click="openCFUpdateDialog">
                          <Icon name="Download" class="w-3.5 h-3.5 mr-1.5" />
                          Apply Update
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Incompatible Mods Section (for CF imported modpacks with incompatible mods) -->
            <div v-if="isCFModpack && modpack?.incompatible_mods?.length">
              <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                <Icon name="AlertTriangle" class="w-5 h-5 text-amber-500" />
                Incompatible Mods ({{ modpack.incompatible_mods.length }})
              </h3>

              <div class="space-y-4">
                <div class="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div class="flex items-center justify-between gap-4 mb-3">
                    <div class="min-w-0">
                      <div class="font-medium text-sm">Mods Not Imported</div>
                      <div class="text-xs text-muted-foreground mt-1">
                        These mods were not imported due to version/loader incompatibility
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" class="shrink-0 whitespace-nowrap"
                      @click="reSearchIncompatibleMods" :disabled="isReSearching">
                      <Icon name="RefreshCw" class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isReSearching }" />
                      {{ isReSearching ? 'Searching...' : 'Re-search' }}
                    </Button>
                  </div>

                  <!-- Progress indicator -->
                  <div v-if="isReSearching" class="mb-3 p-2 bg-background/50 rounded-md">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-muted-foreground truncate max-w-[70%]">{{ reSearchProgress.currentMod ||
                        'Starting...'
                      }}</span>
                      <span class="text-muted-foreground shrink-0">{{ reSearchProgress.current }}/{{
                        reSearchProgress.total
                      }}</span>
                    </div>
                    <div class="h-1.5 bg-background rounded-full overflow-hidden">
                      <div class="h-full bg-amber-500 transition-all duration-300"
                        :style="{ width: `${reSearchProgress.total > 0 ? (reSearchProgress.current / reSearchProgress.total) * 100 : 0}%` }">
                      </div>
                    </div>
                  </div>

                  <!-- Incompatible mods list -->
                  <div class="max-h-48 overflow-y-auto space-y-1.5">
                    <div v-for="(mod, index) in modpack.incompatible_mods" :key="index"
                      class="flex items-center justify-between gap-2 p-2 bg-background/30 rounded-md text-sm">
                      <span class="font-medium truncate min-w-0 flex-1">{{ mod.name }}</span>
                      <span class="text-xs text-muted-foreground shrink-0 max-w-[40%] truncate" :title="mod.reason">{{
                        mod.reason }}</span>
                    </div>
                  </div>
                </div>

                <p class="text-xs text-muted-foreground">
                  Click "Re-search CurseForge" to check if compatible versions have become available.
                  Found mods will be automatically added to your library and modpack.
                </p>
              </div>
            </div>

            <div>
              <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                <Icon name="Globe" class="w-5 h-5 text-primary" />
                Remote & Collaboration
              </h3>

              <div class="space-y-6">
                <!-- ═══════════════════════════════════════════════════════════════════
                     PUBLISHER / HOST SECTION
                     For modpack creators who want to share their modpack with others
                     Hidden if modpack is linked to a remote source (subscriber mode)
                ═══════════════════════════════════════════════════════════════════ -->
                <div v-if="!editForm.remote_url"
                  class="p-4 bg-gradient-to-r from-primary/5 to-transparent rounded-xl border border-primary/20">
                  <h4 class="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
                    <Icon name="CloudUpload" class="w-4 h-4" />
                    Publisher / Host
                  </h4>
                  <p class="text-xs text-muted-foreground mb-4">
                    Publish your modpack manifest so others can subscribe and receive updates.
                  </p>

                  <!-- Publish to Gist -->
                  <div class="space-y-3">
                    <div class="flex items-center gap-2">
                      <Icon name="Github" class="w-4 h-4" />
                      <span class="text-sm font-medium">GitHub Gist</span>
                    </div>

                    <!-- Show current Gist info if published AND exists remotely -->
                    <div v-if="modpack?.gist_config?.gist_id && gistExistsRemotely"
                      class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div class="flex items-center justify-between">
                        <div>
                          <div class="text-sm font-medium text-green-500 flex items-center gap-2">
                            <Icon name="Check" class="w-3.5 h-3.5" />
                            Published to Gist
                          </div>
                          <div class="text-xs text-muted-foreground mt-1">
                            Last updated: {{ modpack.gist_config.last_pushed
                              ? new Date(modpack.gist_config.last_pushed).toLocaleString()
                              : 'Unknown' }}
                          </div>
                        </div>
                        <div class="flex gap-1">
                          <Button variant="ghost" size="sm" @click="copyGistUrl" title="Copy raw URL">
                            <Icon name="Share2" class="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" @click="openGistInBrowser" title="Open in browser">
                            <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive"
                            @click="deleteGistFromRemote" :disabled="isDeletingGist" title="Delete Gist from GitHub">
                            <Icon v-if="!isDeletingGist" name="Trash2" class="w-3.5 h-3.5" />
                            <Icon v-else name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <!-- Show warning if gist_config exists but Gist was deleted remotely -->
                    <div v-else-if="modpack?.gist_config?.gist_id && !gistExistsRemotely && !isCheckingGistExists"
                      class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs">
                      <div class="font-medium text-amber-500 mb-1">Gist not found</div>
                      <span class="text-muted-foreground">
                        The linked Gist was deleted or is inaccessible. Create a new one to re-publish.
                      </span>
                    </div>

                    <div v-if="!hasGistToken" class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs">
                      <div class="font-medium text-amber-500 mb-1">GitHub token required</div>
                      <span class="text-muted-foreground">
                        Add your GitHub token in Settings → GitHub Gist to enable direct publishing.
                      </span>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <Button variant="default" size="sm" class="gap-2" @click="pushToGist()"
                        :disabled="isPushingToGist || !hasGistToken">
                        <Icon v-if="!isPushingToGist" name="CloudUpload" class="w-3.5 h-3.5" />
                        <Icon v-else name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                        {{ gistExistsRemotely ? 'Update Gist' : 'Create Gist' }}
                      </Button>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Manifest mode (Full History / Current Only) can be configured in Settings.
                    </p>
                  </div>

                  <!-- Manual Export -->
                  <div class="mt-4 pt-4 border-t border-border/30 space-y-3">
                    <div class="text-sm font-medium">Manual Export</div>
                    <p class="text-xs text-muted-foreground">
                      Download a JSON manifest to host elsewhere (GitHub, web server, etc.)
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" class="gap-2" @click="exportManifest('full')">
                        <Icon name="Share2" class="w-3.5 h-3.5" />
                        Full History
                      </Button>
                      <Button variant="outline" size="sm" class="gap-2" @click="exportManifest('current')">
                        <Icon name="Share2" class="w-3.5 h-3.5" />
                        Current Only
                      </Button>
                    </div>
                  </div>

                  <!-- Resource List Export -->
                  <div class="mt-4 pt-4 border-t border-border/30 space-y-3">
                    <div class="text-sm font-medium">Export Resource List</div>
                    <p class="text-xs text-muted-foreground">
                      Generate a list of mods/resources for sharing or documentation.
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" class="gap-2" @click="exportResourceList('simple')"
                        :disabled="isExportingResourceList">
                        Simple
                      </Button>
                      <Button variant="outline" size="sm" class="gap-2" @click="exportResourceList('detailed')"
                        :disabled="isExportingResourceList">
                        Detailed
                      </Button>
                      <Button variant="outline" size="sm" class="gap-2" @click="exportResourceList('markdown')"
                        :disabled="isExportingResourceList">
                        Markdown
                      </Button>
                    </div>
                  </div>
                </div>

                <!-- Info message when modpack is linked (subscriber mode) -->
                <div v-if="editForm.remote_url" class="p-4 bg-muted/20 rounded-xl border border-border/50">
                  <div class="flex items-start gap-3">
                    <Icon name="Info" class="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <h4 class="text-sm font-medium mb-1">Publishing disabled</h4>
                      <p class="text-xs text-muted-foreground">
                        This modpack is linked to a remote source and receives updates from a host.
                        To publish your own version, first remove the remote URL below to unlink it.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- ═══════════════════════════════════════════════════════════════════
                     SUBSCRIBER / CLIENT SECTION  
                     For users who want to sync with a remote modpack (read-only updates)
                ═══════════════════════════════════════════════════════════════════ -->
                <div class="p-4 bg-gradient-to-r from-blue-500/5 to-transparent rounded-xl border border-blue-500/20">
                  <h4 class="text-sm font-semibold mb-3 flex items-center gap-2 text-blue-500">
                    <Icon name="Download" class="w-4 h-4" />
                    Subscriber / Client
                  </h4>
                  <p class="text-xs text-muted-foreground mb-4">
                    Link to a remote manifest to receive updates from a host.
                    <span class="text-amber-500">Note: This will enable sync mode for this modpack.</span>
                  </p>

                  <!-- Update Status -->
                  <div v-if="editForm.remote_url"
                    class="mb-4 p-3 bg-muted/20 rounded-lg border border-border/50 flex items-center justify-between">
                    <div class="text-sm">
                      <div class="font-medium flex items-center gap-2">
                        <Icon name="RefreshCw" class="w-4 h-4 text-blue-500" />
                        Sync Status
                      </div>
                      <div class="text-xs text-muted-foreground mt-1">
                        Last checked:
                        {{
                          modpack?.remote_source?.last_checked
                            ? new Date(modpack.remote_source.last_checked).toLocaleString()
                            : "Never"
                        }}
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" @click="checkForRemoteUpdates" :disabled="isCheckingUpdate">
                      <Icon name="RefreshCw" class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': isCheckingUpdate }" />
                      Check Now
                    </Button>
                  </div>

                  <div class="space-y-3">
                    <div class="space-y-2">
                      <label class="text-sm font-medium">Remote Manifest URL</label>
                      <div class="flex gap-2">
                        <input v-model="editForm.remote_url" type="text"
                          class="flex-1 h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
                          placeholder="https://gist.githubusercontent.com/..." @change="sanitizeRemoteUrl" />
                        <Button v-if="editForm.remote_url" variant="ghost" size="sm" @click="editForm.remote_url = ''"
                          title="Clear URL">
                          <Icon name="X" class="w-4 h-4" />
                        </Button>
                      </div>
                      <p class="text-xs text-muted-foreground">
                        Paste the raw URL of a JSON manifest to sync with the host's modpack.
                      </p>
                    </div>

                    <div class="flex items-center gap-2">
                      <input type="checkbox" id="auto-check" v-model="editForm.auto_check_remote"
                        class="rounded border-border/50 text-blue-500 focus:ring-blue-500/30" />
                      <label for="auto-check" class="text-sm">Automatically check for updates on startup</label>
                    </div>
                  </div>
                </div>

                <!-- Save Button -->
                <div class="pt-4 border-t border-border/50">
                  <Button @click="saveModpackInfo" :disabled="isSaving" class="gap-2">
                    <Icon name="Save" class="w-4 h-4" />
                    {{ isSaving ? "Saving..." : "Save Changes" }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Global Floating Action Bar -->
    <Transition enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-8 scale-95" enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-8 scale-95">
      <div class="floating-bar-container">
        <!-- Sync Status Panel (above main bar) -->
        <Transition enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-2 scale-95" enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-2 scale-95">
          <div v-if="showSyncDetails && instanceSyncStatus?.needsSync" class="floating-sync-panel">
            <div class="sync-panel-header">
              <div class="flex items-center gap-2">
                <Icon name="AlertTriangle" class="w-4 h-4 text-amber-400" />
                <span class="font-medium text-sm">{{ instanceSyncStatus.totalDifferences }} changes pending</span>
              </div>
              <button @click="showSyncDetails = false" class="sync-panel-close">
                <Icon name="X" class="w-4 h-4" />
              </button>
            </div>
            <div class="sync-panel-content">
              <!-- Missing in Instance -->
              <div v-if="instanceSyncStatus.missingInInstance.length > 0" class="sync-section sync-section-add">
                <div class="sync-section-title">
                  <Icon name="Plus" class="w-3.5 h-3.5" />
                  {{ instanceSyncStatus.missingInInstance.length }} to add
                </div>
                <div class="sync-section-items">
                  <div v-for="item in instanceSyncStatus.missingInInstance.slice(0, 5)" :key="item.filename"
                    class="sync-item">
                    <span class="sync-item-type">{{ item.type }}</span>
                    <span class="sync-item-name">{{ item.filename }}</span>
                  </div>
                  <div v-if="instanceSyncStatus.missingInInstance.length > 5" class="sync-item-more">
                    +{{ instanceSyncStatus.missingInInstance.length - 5 }} more
                  </div>
                </div>
              </div>

              <!-- Updates to Apply (new section) -->
              <div v-if="instanceSyncStatus.updatesToApply?.length > 0" class="sync-section sync-section-update">
                <div class="sync-section-title">
                  <Icon name="RefreshCw" class="w-3.5 h-3.5" />
                  {{ instanceSyncStatus.updatesToApply.length }} to update
                </div>
                <div class="sync-section-items">
                  <div v-for="item in instanceSyncStatus.updatesToApply.slice(0, 5)" :key="item.newFilename"
                    class="sync-item sync-item-update">
                    <span class="sync-item-type">{{ item.type }}</span>
                    <span class="sync-item-name sync-item-old">{{ item.oldFilename }}</span>
                    <span class="sync-item-arrow">→</span>
                    <span class="sync-item-name sync-item-new">{{ item.newFilename }}</span>
                    <span v-if="item.willBeDisabled" class="sync-item-disabled-badge">disabled</span>
                  </div>
                  <div v-if="instanceSyncStatus.updatesToApply.length > 5" class="sync-item-more">
                    +{{ instanceSyncStatus.updatesToApply.length - 5 }} more
                  </div>
                </div>
              </div>

              <!-- Extra Mods to Remove -->
              <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length > 0"
                class="sync-section sync-section-remove">
                <div class="sync-section-title">
                  <Icon name="Trash2" class="w-3.5 h-3.5" />
                  {{instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length}} mods to remove
                </div>
                <div class="sync-section-items">
                  <div v-for="item in instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').slice(0, 5)"
                    :key="item.filename" class="sync-item">
                    <span class="sync-item-name">{{ item.filename }}</span>
                  </div>
                  <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length > 5"
                    class="sync-item-more">
                    +{{instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length - 5}} more
                  </div>
                </div>
              </div>

              <!-- Extra Files (preserved) -->
              <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length > 0"
                class="sync-section sync-section-extra">
                <div class="sync-section-title">
                  <Icon name="Package" class="w-3.5 h-3.5" />
                  {{instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length}} extra files (preserved)
                </div>
                <div class="sync-section-items">
                  <div v-for="item in instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').slice(0, 5)"
                    :key="item.filename" class="sync-item">
                    <span class="sync-item-type">{{ item.type }}</span>
                    <span class="sync-item-name">{{ item.filename }}</span>
                  </div>
                  <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length > 5"
                    class="sync-item-more">
                    +{{instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length - 5}} more
                  </div>
                </div>
              </div>

              <!-- Loader Version Mismatch -->
              <div v-if="instanceSyncStatus.loaderVersionMismatch" class="sync-section sync-section-loader">
                <div class="sync-section-title">
                  <Icon name="RefreshCw" class="w-3.5 h-3.5" />
                  Loader update available
                </div>
                <div class="text-[11px] text-muted-foreground">
                  {{ instance?.loaderVersion }} → {{ extractLoaderVersion(modpack?.loader_version || '') }}
                </div>
              </div>

              <!-- Disabled State Mismatch -->
              <div v-if="instanceSyncStatus.disabledMismatch?.length > 0" class="sync-section sync-section-disabled">
                <div class="sync-section-title">
                  <Icon name="ToggleLeft" class="w-3.5 h-3.5" />
                  {{ instanceSyncStatus.disabledMismatch.length }} enable/disable states to fix
                </div>
                <div class="sync-section-items">
                  <div v-for="item in instanceSyncStatus.disabledMismatch.slice(0, 5)" :key="item.filename"
                    class="sync-item">
                    <span class="sync-item-name">{{ item.filename }}</span>
                    <span class="sync-item-issue">{{ item.issue }}</span>
                  </div>
                  <div v-if="instanceSyncStatus.disabledMismatch.length > 5" class="sync-item-more">
                    +{{ instanceSyncStatus.disabledMismatch.length - 5 }} more
                  </div>
                </div>
              </div>

              <!-- Sync Mode Selection -->
              <div class="sync-mode-section">
                <span class="text-[10px] text-muted-foreground uppercase">Sync Mode</span>
                <div class="sync-mode-buttons">
                  <button @click="selectedSyncMode = 'new_only'" class="sync-mode-btn"
                    :class="{ 'sync-mode-active': selectedSyncMode === 'new_only' }"
                    title="Only add new files, keep existing ones unchanged">New Only</button>
                  <button @click="selectedSyncMode = 'overwrite'" class="sync-mode-btn"
                    :class="{ 'sync-mode-active-warning': selectedSyncMode === 'overwrite' }"
                    title="Replace all files with modpack versions">Overwrite</button>
                  <button @click="selectedSyncMode = 'skip'" class="sync-mode-btn"
                    :class="{ 'sync-mode-active-muted': selectedSyncMode === 'skip' }"
                    title="Don't sync now, I'll do it manually">Skip</button>
                </div>
                <p class="text-[10px] text-muted-foreground/70 mt-1.5">
                  {{ selectedSyncMode === 'new_only' ? 'Adds missing files without touching existing ones' :
                    selectedSyncMode === 'overwrite' ? 'Replaces all files to match the modpack exactly' :
                      'Skips syncing, launch with current instance state' }}
                </p>
              </div>
            </div>
          </div>
        </Transition>

        <!-- First Launch Notice (above main bar) -->
        <div v-if="instance && !instance.lastPlayed && !isGameRunning && !isLaunching" class="floating-notice">
          <Icon name="Info" class="w-3.5 h-3.5 text-primary" />
          <span>{{ modpack?.loader }} will be installed on first launch</span>
        </div>

        <!-- Launch Progress (above main bar) -->
        <div v-if="isLaunching && loaderProgress" class="floating-progress">
          <div class="progress-text">
            <span>{{ loaderProgress.stage }}</span>
            <span v-if="loaderProgress.total > 0" class="progress-count">{{ loaderProgress.current }}/{{
              loaderProgress.total }}</span>
          </div>
          <div v-if="loaderProgress.total > 0" class="progress-bar">
            <div class="progress-fill" :style="{ width: `${(loaderProgress.current / loaderProgress.total) * 100}%` }">
            </div>
          </div>
        </div>

        <div class="floating-bar" :class="{ 'floating-bar-minimized': isFloatingBarMinimized }">
          <!-- Minimize/Expand Toggle -->
          <button class="floating-bar-minimize-btn" @click="isFloatingBarMinimized = !isFloatingBarMinimized"
            :title="isFloatingBarMinimized ? 'Expand Bar' : 'Minimize Bar'">
            <Icon v-if="!isFloatingBarMinimized" name="ChevronDown" class="w-4 h-4" />
            <Icon v-else name="ChevronUp" class="w-4 h-4" />
          </button>

          <!-- Main Content (hidden when minimized) -->
          <template v-if="!isFloatingBarMinimized">
            <div class="floating-bar-divider floating-bar-divider-mini" />

            <!-- Primary: Play/Create Instance Button -->
            <template v-if="!instance">
              <button class="floating-bar-play floating-bar-create-instance" @click="handleCreateInstance()"
                title="Create Instance" :disabled="isCreatingInstance">
                <Icon v-if="isCreatingInstance" name="Loader2" class="w-5 h-5 animate-spin" />
                <Icon v-else name="Plus" class="w-5 h-5" />
              </button>
              <span class="floating-bar-status-text text-amber-400">{{ isCreatingInstance ? 'Creating...'
                : 'No instance' }}</span>
            </template>

            <template v-else-if="instance.state === 'installing'">
              <button class="floating-bar-play floating-bar-syncing" disabled title="Syncing...">
                <Icon name="Loader2" class="w-5 h-5 animate-spin" />
              </button>
              <span class="floating-bar-status-text text-blue-400">Syncing...</span>
            </template>

            <template v-else-if="isLaunching">
              <button class="floating-bar-play floating-bar-launching" disabled title="Launching...">
                <Icon name="Loader2" class="w-5 h-5 animate-spin" />
              </button>
              <span class="floating-bar-status-text text-primary">Launching...</span>
            </template>

            <template v-else-if="isGameRunning">
              <button class="floating-bar-play"
                :class="runningGame?.status === 'running' ? 'floating-bar-play-game' : 'floating-bar-play-launcher'"
                @click="handleKillGame()" :title="runningGame?.status === 'running' ? 'Stop Game' : 'Stop Launcher'">
                <Icon v-if="runningGame?.status !== 'running'" name="Square" class="w-4 h-4 fill-current" />
                <Icon v-else name="X" class="w-5 h-5" />
              </button>
              <span class="floating-bar-status-text"
                :class="runningGame?.status === 'running' ? 'text-green-400' : 'text-amber-400'">
                {{ runningGame?.status === 'running' ? 'Playing' : 'Loading...' }}
              </span>
            </template>

            <template v-else>
              <button class="floating-bar-play" :class="{ 'floating-bar-play-ready': instance.state === 'ready' }"
                :disabled="instance.state !== 'ready'" @click="handleLaunch()" title="Play">
                <Icon name="Play" class="w-5 h-5 fill-current" />
              </button>
              <span v-if="instance.state === 'ready'" class="floating-bar-status-text text-green-400">Ready</span>
              <span v-else class="floating-bar-status-text text-muted-foreground">{{ instance.state }}</span>
            </template>

            <!-- Sync Status Indicator -->
            <template v-if="instance && instanceSyncStatus?.needsSync">
              <div class="floating-bar-divider" />
              <button class="floating-bar-btn floating-bar-btn-sync"
                :class="{ 'floating-bar-btn-active': showSyncDetails }" @click="showSyncDetails = !showSyncDetails"
                :title="`${instanceSyncStatus.totalDifferences} changes pending`">
                <Icon name="AlertTriangle" class="w-4 h-4" />
                <span class="floating-bar-sync-count">{{ instanceSyncStatus.totalDifferences }}</span>
              </button>
              <button class="floating-bar-btn floating-bar-btn-sync-action" @click="handleSyncInstance"
                :disabled="isSyncingInstance" title="Sync Now">
                <Icon v-if="isSyncingInstance" name="Loader2" class="w-4 h-4 animate-spin" />
                <Icon v-else name="RefreshCw" class="w-4 h-4" />
              </button>
            </template>

            <!-- In Sync Badge -->
            <template v-else-if="instance && instanceSyncStatus && !instanceSyncStatus.needsSync">
              <div class="floating-bar-divider" />
              <span class="floating-bar-sync-ok">
                <Icon name="Check" class="w-3.5 h-3.5" />
                In Sync
              </span>
            </template>

            <!-- Divider -->
            <div class="floating-bar-divider" />

            <!-- Instance Actions (when instance exists) -->
            <template v-if="instance">
              <button class="floating-bar-btn" @click="openInstanceSettings()" title="Instance Settings">
                <Icon name="Sliders" class="w-4 h-4" />
              </button>
              <button class="floating-bar-btn" @click="handleOpenInstanceFolder()" title="Open Folder">
                <Icon name="FolderOpen" class="w-4 h-4" />
              </button>
              <button class="floating-bar-btn" @click="showLogConsole = !showLogConsole"
                :class="{ 'floating-bar-btn-active': showLogConsole }"
                :title="showLogConsole ? 'Hide Console' : 'Show Console'">
                <Icon name="Terminal" class="w-4 h-4" />
              </button>
              <button class="floating-bar-btn floating-bar-btn-delete-instance" @click="showDeleteInstanceDialog = true"
                title="Delete Instance">
                <Icon name="FolderX" class="w-4 h-4" />
              </button>
            </template>

            <!-- Selection Actions (only in mods tab with selection) -->
            <template v-if="activeTab === 'mods' && selectedModIds.size > 0">
              <div class="floating-bar-divider" />
              <span class="floating-bar-count">{{ selectedModIds.size }} selected</span>
              <div class="floating-bar-divider" />

              <button v-if="!isLinked" class="floating-bar-btn floating-bar-btn-enable" @click="bulkEnableSelected"
                title="Enable">
                <Icon name="ToggleRight" class="w-4 h-4" />
              </button>
              <button v-if="!isLinked" class="floating-bar-btn floating-bar-btn-disable" @click="bulkDisableSelected"
                title="Disable">
                <Icon name="ToggleLeft" class="w-4 h-4" />
              </button>
              <button v-if="!isLinked" class="floating-bar-btn" @click="bulkLockSelected" title="Lock">
                <Icon name="Lock" class="w-4 h-4" />
              </button>
              <button v-if="!isLinked" class="floating-bar-btn" @click="bulkUnlockSelected" title="Unlock">
                <Icon name="LockOpen" class="w-4 h-4" />
              </button>

              <div v-if="!isLinked" class="floating-bar-divider" />

              <button v-if="!isLinked" class="floating-bar-btn floating-bar-btn-danger" @click="removeSelectedMods"
                title="Remove">
                <Icon name="Trash2" class="w-4 h-4" />
              </button>

              <button class="floating-bar-btn floating-bar-btn-clear" @click="clearSelection" title="Clear selection">
                <Icon name="X" class="w-4 h-4" />
              </button>
            </template>
          </template>

          <!-- Minimized indicator -->
          <template v-else>
            <span class="floating-bar-minimized-label">Actions Bar</span>
          </template>
        </div>
      </div>
    </Transition>

    <!-- Instance Settings Modal -->
    <Dialog :open="showInstanceSettings" @close="showInstanceSettings = false" title="Instance Settings" size="md">
      <div class="space-y-6">
        <!-- Memory Settings -->
        <div class="space-y-4">
          <h4 class="text-sm font-semibold flex items-center gap-2">
            <Icon name="Sliders" class="w-4 h-4 text-primary" />
            Memory Allocation
          </h4>
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-muted-foreground">Minimum RAM</label>
                <span class="text-xs font-medium">{{ (memoryMin / 1024).toFixed(1) }} GB</span>
              </div>
              <input type="range" v-model.number="memoryMin" :min="1024" :max="maxAllowedRam" :step="512"
                class="w-full styled-range" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-muted-foreground">Maximum RAM</label>
                <span class="text-xs font-medium">{{ (memoryMax / 1024).toFixed(1) }} GB</span>
              </div>
              <input type="range" v-model.number="memoryMax" :min="2048" :max="maxAllowedRam" :step="512"
                class="w-full styled-range" />
            </div>
            <p class="text-[11px] text-muted-foreground">
              System has {{ systemMemory ? Math.round(systemMemory.total / 1024) : '...' }} GB RAM.
              Recommended max: {{ systemMemory ? Math.round(systemMemory.suggestedMax / 1024) : '...' }} GB.
            </p>
          </div>
        </div>

        <!-- Java Arguments -->
        <div class="space-y-2">
          <h4 class="text-sm font-semibold flex items-center gap-2">
            <Icon name="Terminal" class="w-4 h-4 text-primary" />
            Custom Java Arguments
          </h4>
          <textarea v-model="customJavaArgs" rows="2" placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50"
            class="w-full px-3 py-2 text-xs bg-muted/50 border border-border/50 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <p class="text-[11px] text-muted-foreground">
            Advanced: Add custom JVM flags. Leave empty for defaults.
          </p>
        </div>

        <!-- Sync Settings -->
        <div class="space-y-3">
          <h4 class="text-sm font-semibold flex items-center gap-2">
            <Icon name="RefreshCw" class="w-4 h-4 text-primary" />
            Sync Preferences
          </h4>
          <div class="space-y-2">
            <label class="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
              <span class="text-sm">Auto-sync before launch</span>
              <button @click="toggleAutoSync" class="relative w-9 h-5 rounded-full transition-colors"
                :class="syncSettings.autoSyncEnabled ? 'bg-primary' : 'bg-muted'">
                <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                  :class="{ 'translate-x-4': syncSettings.autoSyncEnabled }" />
              </button>
            </label>
            <label class="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
              <span class="text-sm">Confirm before sync</span>
              <button @click="toggleSyncConfirmation" class="relative w-9 h-5 rounded-full transition-colors"
                :class="syncSettings.showConfirmation ? 'bg-primary' : 'bg-muted'">
                <span class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                  :class="{ 'translate-x-4': syncSettings.showConfirmation }" />
              </button>
            </label>
          </div>
        </div>

        <!-- Instance Info -->
        <div class="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Last Played</span>
            <span>{{ formatPlayDate(instance?.lastPlayed) }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Size</span>
            <span>{{ instanceStats?.totalSize || '...' }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Mods</span>
            <span>{{ instanceStats?.modCount || 0 }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between w-full gap-3">
          <Button variant="destructive" size="sm"
            @click="showInstanceSettings = false; showDeleteInstanceDialog = true">
            <Icon name="Trash2" class="w-4 h-4 mr-2" />
            Delete Instance
          </Button>
          <div class="flex gap-3">
            <Button variant="secondary" @click="showInstanceSettings = false">Cancel</Button>
            <Button @click="saveInstanceSettings(); showInstanceSettings = false">Save Settings</Button>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Delete Instance Confirmation -->
    <ConfirmDialog :open="showDeleteInstanceDialog" title="Delete Instance"
      :message="`Are you sure you want to delete this instance? This will remove all installed mods, configs, and saves from the instance folder. Your library mods will not be affected.`"
      confirm-text="Delete Instance" cancel-text="Keep Instance" variant="danger" icon="trash"
      @close="showDeleteInstanceDialog = false" @confirm="handleDeleteInstance" />

    <!-- Log Console Slide-up Panel -->
    <Transition enter-active-class="transition duration-300 ease-out" enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-full opacity-0">
      <div v-if="showLogConsole && instance" class="log-console-panel" :style="{ height: logConsoleHeight + 'px' }">
        <!-- Resize Handle -->
        <div class="log-console-resize-handle" @mousedown="startLogConsoleResize">
          <div class="log-console-resize-bar"></div>
        </div>
        <div class="log-console-header">
          <div class="flex items-center gap-2">
            <Icon name="Terminal" class="w-4 h-4 text-primary" />
            <span class="font-medium text-sm">Game Console</span>
            <span v-if="isGameRunning" class="log-console-live-badge">
              <span class="log-console-live-dot"></span>
              LIVE
            </span>
          </div>

          <!-- Log Level Filters -->
          <div class="flex items-center gap-2">
            <button @click="setLogLevelFilter('all')" class="log-filter-btn"
              :class="{ 'log-filter-active': logLevelFilter === 'all' }">
              All
              <span class="log-filter-count">{{ totalLogCount }}</span>
            </button>
            <button @click="setLogLevelFilter('info')" class="log-filter-btn log-filter-info"
              :class="{ 'log-filter-active': logLevelFilter === 'info' }">
              Info
              <span v-if="logLevelCounts.info > 0" class="log-filter-count">{{ logLevelCounts.info }}</span>
            </button>
            <button @click="setLogLevelFilter('warn')" class="log-filter-btn log-filter-warn"
              :class="{ 'log-filter-active': logLevelFilter === 'warn' }">
              Warn
              <span v-if="logLevelCounts.warn > 0" class="log-filter-count">{{ logLevelCounts.warn }}</span>
            </button>
            <button @click="setLogLevelFilter('error')" class="log-filter-btn log-filter-error"
              :class="{ 'log-filter-active': logLevelFilter === 'error' }">
              Error
              <span v-if="logLevelCounts.error > 0" class="log-filter-count">{{ logLevelCounts.error }}</span>
            </button>
          </div>

          <div class="flex items-center gap-1">
            <button @click="clearLogs" class="log-console-btn" title="Clear">
              <Icon name="Trash2" class="w-3.5 h-3.5" />
            </button>
            <button @click="showLogConsole = false" class="log-console-btn" title="Close">
              <Icon name="X" class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div ref="logScrollRef" class="log-console-content">
          <div v-if="filteredGameLogs.length === 0" class="log-console-empty">
            <Icon name="Terminal" class="w-8 h-8 text-muted-foreground/20" />
            <p v-if="gameLogs.length === 0">No logs yet. Start the game to see output.</p>
            <p v-else>No logs match the current filter.</p>
          </div>
          <div v-else class="log-console-entries">
            <div v-for="(log, index) in filteredGameLogs" :key="index" class="log-console-entry"
              :class="getLogLevelClass(log.level)">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Remote Update Review Dialog -->
    <UpdateReviewDialog v-if="updateResult && modpack" :open="showReviewDialog" :modpack-name="modpack.name"
      :changes="updateResult.changes" :new-version="updateResult.remoteManifest?.modpack.version"
      @close="showReviewDialog = false" @confirm="applyRemoteUpdate" />

    <!-- Progress Dialog -->
    <ProgressDialog :open="showProgressDialog" title="Updating Modpack" :message="progressState.message"
      :progress="progressState.percent" />

    <!-- Confirm Remove Incompatible Mods Dialog -->
    <ConfirmDialog :open="showRemoveIncompatibleDialog" title="Remove Incompatible Mods"
      :message="`This will remove ${incompatibleModCount} mod(s) that don't match the modpack's version (${modpack?.minecraft_version}) or loader (${modpack?.loader}). The mods will remain in your library but will be removed from this modpack.`"
      confirm-text="Remove Mods" cancel-text="Cancel" variant="danger" icon="trash"
      @close="showRemoveIncompatibleDialog = false" @confirm="confirmRemoveIncompatibleMods" />

    <!-- Dependency Impact Warning Dialog -->
    <Dialog :open="showDependencyImpactDialog" @close="cancelDependencyImpactAction"
      :title="dependencyImpact?.action === 'remove' ? 'Dependency Warning - Remove' : 'Dependency Warning - Disable'"
      size="md">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          {{ dependencyImpact?.action === 'remove' ? 'Removing' : 'Disabling' }}
          <strong>{{ dependencyImpact?.modToAffect?.name }}</strong> may affect other mods:
        </p>

        <!-- Dependent Mods -->
        <div v-if="dependencyImpact?.dependentMods.filter(d => d.willBreak).length"
          class="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <div class="flex items-center gap-2 text-destructive font-medium mb-2">
            <Icon name="AlertTriangle" class="w-4 h-4" />
            <span>These mods depend on it and may not work:</span>
          </div>
          <ul class="text-sm space-y-1.5 ml-6">
            <li v-for="mod in dependencyImpact?.dependentMods.filter(d => d.willBreak)" :key="mod.id"
              class="flex items-center gap-2">
              <span>{{ mod.name }}</span>
              <span v-if="mod.depth === 1"
                class="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                Diretto
              </span>
              <span v-else-if="mod.depth && mod.depth > 1"
                class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium">
                Indiretto (livello {{ mod.depth }})
              </span>
            </li>
          </ul>
        </div>

        <!-- Orphaned Dependencies (only for remove) -->
        <div
          v-if="dependencyImpact?.action === 'remove' && dependencyImpact?.orphanedDependencies.filter(d => !d.usedByOthers).length"
          class="bg-warning/10 border border-warning/30 rounded-lg p-3">
          <div class="flex items-center gap-2 text-warning font-medium mb-2">
            <Icon name="Info" class="w-4 h-4" />
            <span>These dependencies may no longer be needed:</span>
          </div>
          <ul class="text-sm space-y-1 ml-6">
            <li v-for="mod in dependencyImpact?.orphanedDependencies.filter(d => !d.usedByOthers)" :key="mod.id">
              {{ mod.name }}
            </li>
          </ul>
        </div>

        <p class="text-sm text-muted-foreground">
          What would you like to do?
        </p>
      </div>

      <template #footer>
        <div class="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" @click="cancelDependencyImpactAction">Cancel</Button>
          <Button :variant="dependencyImpact?.action === 'remove' ? 'destructive' : 'outline'"
            @click="confirmDependencyImpactAction">
            {{ dependencyImpact?.action === 'remove' ? 'Remove Anyway' : 'Disable Anyway' }}
          </Button>
          <Button
            v-if="dependencyImpact?.dependentMods.filter(d => d.willBreak).length || (dependencyImpact?.action === 'remove' && dependencyImpact?.orphanedDependencies.filter(d => !d.usedByOthers).length)"
            :variant="dependencyImpact?.action === 'remove' ? 'destructive' : 'outline'"
            @click="confirmDependencyImpactWithDependents">
            {{dependencyImpact?.action === 'remove'
              ? `Remove All (${1 + (dependencyImpact?.dependentMods.filter(d => d.willBreak).length || 0) +
              (dependencyImpact?.orphanedDependencies.filter(d => !d.usedByOthers).length || 0)} mods)`
              : `Disable All (${1 + (dependencyImpact?.dependentMods.filter(d => d.willBreak).length || 0)} mods)`}}
          </Button>
        </div>
      </template>
    </Dialog>

    <!-- Bulk Dependency Impact Warning Dialog -->
    <Dialog :open="showBulkDependencyImpactDialog" @close="cancelBulkDependencyImpactAction"
      :title="bulkDependencyImpact?.action === 'remove' ? 'Dependency Warning - Bulk Remove' : 'Dependency Warning - Bulk Disable'"
      size="lg">
      <div class="space-y-4 max-h-[60vh] overflow-y-auto">
        <p class="text-sm text-muted-foreground">
          {{ bulkDependencyImpact?.action === 'remove' ? 'Removing' : 'Disabling' }}
          <strong>{{ bulkDependencyImpact?.modsToAffect?.length }} mod(s)</strong> may affect other mods:
        </p>

        <!-- Dependent Mods -->
        <div v-if="bulkDependencyImpact?.allDependentMods.length"
          class="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <div class="flex items-center gap-2 text-destructive font-medium mb-2">
            <Icon name="AlertTriangle" class="w-4 h-4" />
            <span>These mods depend on the selected mods and may not work:</span>
          </div>
          <ul class="text-sm space-y-1.5 ml-6 list-disc">
            <li v-for="mod in bulkDependencyImpact?.allDependentMods" :key="mod.id">
              <strong>{{ mod.name }}</strong>
              <span class="text-muted-foreground text-xs ml-1">
                (depends on: {{ mod.dependsOn.join(', ') }})
              </span>
            </li>
          </ul>
        </div>

        <!-- Orphaned Dependencies (only for remove) -->
        <div v-if="bulkDependencyImpact?.action === 'remove' && bulkDependencyImpact?.allOrphanedDependencies.length"
          class="bg-warning/10 border border-warning/30 rounded-lg p-3">
          <div class="flex items-center gap-2 text-warning font-medium mb-2">
            <Icon name="Info" class="w-4 h-4" />
            <span>These dependencies may no longer be needed:</span>
          </div>
          <ul class="text-sm space-y-1 ml-6 list-disc">
            <li v-for="mod in bulkDependencyImpact?.allOrphanedDependencies" :key="mod.id">
              {{ mod.name }}
            </li>
          </ul>
        </div>

        <p class="text-sm text-muted-foreground">
          What would you like to do?
        </p>
      </div>

      <template #footer>
        <div class="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" @click="cancelBulkDependencyImpactAction">Cancel</Button>
          <Button :variant="bulkDependencyImpact?.action === 'remove' ? 'destructive' : 'outline'"
            @click="confirmBulkDependencyImpactAction">
            {{ bulkDependencyImpact?.action === 'remove' ? 'Remove Anyway' : 'Disable Anyway' }}
          </Button>
          <Button
            v-if="bulkDependencyImpact?.allDependentMods.length || (bulkDependencyImpact?.action === 'remove' && bulkDependencyImpact?.allOrphanedDependencies.length)"
            :variant="bulkDependencyImpact?.action === 'remove' ? 'destructive' : 'outline'"
            @click="confirmBulkDependencyWithDependents">
            {{ bulkDependencyImpact?.action === 'remove'
              ? `Remove All (${pendingBulkModIds.length + (bulkDependencyImpact?.allDependentMods.length || 0) +
              (bulkDependencyImpact?.allOrphanedDependencies.length || 0)} mods)`
              : `Disable All (${pendingBulkModIds.length + (bulkDependencyImpact?.allDependentMods.length || 0)} mods)` }}
          </Button>
        </div>
      </template>
    </Dialog>

    <ModUpdateDialog :open="showSingleModUpdateDialog" :mod="selectedUpdateMod" :modpack-id="modpackId"
      :minecraft-version="modpack?.minecraft_version" :loader="modpack?.loader"
      @close="showSingleModUpdateDialog = false" @updated="handleSingleModUpdated" />

    <!-- CurseForge Browse Dialog -->
    <CurseForgeSearch :open="showCFSearch" :game-version="modpack?.minecraft_version" :mod-loader="modpack?.loader"
      :initial-content-type="contentTypeTab" :locked-modpack-id="modpackId" :lock-filters="true" :full-screen="true"
      :installed-project-files="installedProjectFiles" @close="handleCFSearchClose" @added="handleCFModAdded" />

    <!-- Version Picker Dialog -->
    <FilePickerDialog :open="showVersionPickerDialog" :mod="versionPickerMod" :game-version="modpack?.minecraft_version"
      :mod-loader="modpack?.loader" :content-type="versionPickerMod?.content_type || 'mod'"
      @close="showVersionPickerDialog = false" @select="handleVersionSelected" />

    <!-- Mod Details Modal -->
    <ModDetailsModal :open="showModDetailsModal" :mod="modDetailsTarget" :context="{
      type: 'modpack',
      modpackId: modpackId,
      gameVersion: modpack?.minecraft_version,
      loader: modpack?.loader
    }" :current-file-id="modDetailsTarget?.cf_file_id" :full-screen="true"
      :is-locked="modDetailsTarget ? lockedModIds.has(modDetailsTarget.id) : false" :readonly="isLinked"
      @close="closeModDetails" @version-changed="handleModDetailsVersionChange" />

    <!-- Mod Update Changelog Dialog -->
    <ChangelogDialog v-if="changelogMod" :open="showChangelogDialog" :mod-id="changelogMod.id"
      :file-id="changelogMod.fileId" :mod-name="changelogMod.name" :version="changelogMod.version"
      :slug="changelogMod.slug" @close="showChangelogDialog = false" />

    <!-- Mod Note Dialog -->
    <Dialog :open="showModNoteDialog" @close="closeModNoteDialog"
      :title="noteDialogMod ? `Note for ${noteDialogMod.name}` : 'Mod Note'" size="md">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Add a personal note for this mod in this modpack. Notes are specific to each modpack and can help you remember
          why
          you included a mod or any configuration tips.
        </p>
        <div class="space-y-2">
          <label class="text-sm font-medium">Note</label>
          <textarea v-model="noteDialogText"
            placeholder="e.g., Required for compatibility with X mod, or: Remember to configure recipe changes..."
            class="w-full h-32 px-3 py-2 text-sm rounded-lg bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all" />
        </div>
      </div>
      <template #footer>
        <div class="flex items-center justify-between w-full">
          <Button v-if="noteDialogMod && getModNote(noteDialogMod.id)" variant="ghost"
            class="text-destructive hover:text-destructive hover:bg-destructive/10"
            @click="noteDialogText = ''; saveModNote()" :disabled="isSavingNote">
            <Icon name="Trash2" class="w-4 h-4 mr-2" />
            Remove Note
          </Button>
          <div v-else></div>
          <div class="flex items-center gap-2">
            <Button variant="secondary" @click="closeModNoteDialog" :disabled="isSavingNote">Cancel</Button>
            <Button @click="saveModNote" :disabled="isSavingNote">
              <Icon v-if="isSavingNote" name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="Save" class="w-4 h-4 mr-2" />
              Save Note
            </Button>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- CurseForge Changelog Dialog -->
    <Dialog :open="showCFChangelog" @close="showCFChangelog = false" title="Modpack Changelog" size="lg">
      <div class="max-h-[60vh] overflow-auto">
        <div v-if="isLoadingChangelog" class="flex items-center justify-center py-8">
          <Icon name="RefreshCw" class="w-6 h-6 animate-spin text-primary" />
        </div>
        <div v-else-if="cfChangelog" class="prose prose-invert prose-sm max-w-none" v-html="cfChangelog"></div>
        <div v-else class="text-center py-8 text-muted-foreground">
          No changelog available
        </div>
      </div>
      <template #footer>
        <Button variant="secondary" @click="showCFChangelog = false">Close</Button>
      </template>
    </Dialog>

    <!-- CurseForge Update Dialog -->
    <Dialog :open="showCFUpdateDialog" @close="showCFUpdateDialog = false" title="Apply Modpack Update" size="md">
      <div class="space-y-4">
        <div class="p-4 bg-primary/10 rounded-lg border border-primary/20">
          <div class="flex items-center gap-3">
            <Icon name="ArrowUpCircle" class="w-8 h-8 text-primary shrink-0" />
            <div>
              <div class="font-medium">Update Available</div>
              <div class="text-sm text-muted-foreground mt-1">
                {{ cfUpdateInfo?.currentVersion }} → {{ cfUpdateInfo?.latestVersion }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="isApplyingCFUpdate" class="p-4 bg-muted/30 rounded-lg">
          <div class="flex items-center justify-between text-sm mb-2">
            <span class="text-muted-foreground truncate">{{ cfUpdateProgress.currentMod || 'Starting...' }}</span>
            <span class="text-muted-foreground shrink-0">{{ cfUpdateProgress.current }}/{{ cfUpdateProgress.total
            }}</span>
          </div>
          <div class="h-2 bg-background rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300"
              :style="{ width: `${cfUpdateProgress.total > 0 ? (cfUpdateProgress.current / cfUpdateProgress.total) * 100 : 0}%` }">
            </div>
          </div>
        </div>

        <div v-else class="space-y-3">
          <p class="text-sm text-muted-foreground">
            Choose how you want to apply this update:
          </p>

          <div class="grid gap-3">
            <button
              class="p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
              @click="applyCFUpdate(false)">
              <div class="font-medium flex items-center gap-2">
                <Icon name="RefreshCw" class="w-4 h-4 text-primary" />
                Replace Current Modpack
              </div>
              <div class="text-xs text-muted-foreground mt-1">
                Updates this modpack in place. Your current mods will be replaced with the new version's mods.
              </div>
            </button>

            <button
              class="p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
              @click="applyCFUpdate(true)">
              <div class="font-medium flex items-center gap-2">
                <Icon name="Plus" class="w-4 h-4 text-primary" />
                Create New Modpack
              </div>
              <div class="text-xs text-muted-foreground mt-1">
                Creates a separate modpack with the new version. Keeps your current modpack unchanged.
              </div>
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <Button variant="secondary" @click="showCFUpdateDialog = false" :disabled="isApplyingCFUpdate">
          Cancel
        </Button>
      </template>
    </Dialog>

    <!-- Delete Instance Confirmation Dialog -->
    <ConfirmDialog :open="showDeleteInstanceDialog" title="Delete this instance?"
      :message="`This removes the game instance and all its data (mods, configs, saves). Your pack won't be affected — you can set it up again anytime.`"
      confirm-text="Yes, delete" cancel-text="Keep it" variant="danger" :loading="isDeletingInstance"
      @confirm="handleDeleteInstance" @cancel="showDeleteInstanceDialog = false" />

    <!-- Sync Confirmation Dialog -->
    <div v-if="showSyncConfirmDialog"
      class="fixed inset-0 z-[70] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        class="bg-card border border-border/50 rounded-lg shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
        <div class="px-5 py-4 border-b border-border/50 bg-gradient-to-r from-amber-500/10 to-transparent">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Icon name="AlertCircle" class="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 class="font-semibold text-foreground">Sync before playing?</h3>
              <p class="text-sm text-muted-foreground">Your instance has changes</p>
            </div>
          </div>
        </div>

        <div class="px-5 py-4 space-y-3">
          <p class="text-sm text-muted-foreground">
            <span class="font-medium text-foreground">{{ pendingLaunchData?.differences || 0 }} change{{
              (pendingLaunchData?.differences || 0) !== 1 ? 's' : '' }}</span>
            between your pack and the game instance.
          </p>

          <div v-if="pendingLaunchData?.lastSynced" class="text-xs text-muted-foreground flex items-center gap-1.5">
            <Icon name="Clock" class="w-3.5 h-3.5" />
            Last sync: {{ formatPlayDate(pendingLaunchData.lastSynced) }}
          </div>

          <div class="bg-muted/30 rounded-lg p-3 space-y-2">
            <div class="flex items-start gap-2">
              <Icon name="Download" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div class="text-sm">
                <span class="text-foreground font-medium">Sync & Play</span>
                <span class="text-muted-foreground"> — Update mods first</span>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <Icon name="Play" class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div class="text-sm">
                <span class="text-foreground font-medium">Play now</span>
                <span class="text-muted-foreground"> — Use current mods</span>
              </div>
            </div>
          </div>
        </div>

        <div class="px-5 py-4 border-t border-border/50 bg-muted/20 flex gap-3">
          <button @click="handleSyncConfirmation('cancel')"
            class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-muted/50 hover:bg-muted text-foreground transition-colors duration-150">
            Cancel
          </button>
          <button @click="handleSyncConfirmation('skip')"
            class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors duration-150 flex items-center justify-center gap-2">
            <Icon name="Play" class="w-4 h-4" />
            Play now
          </button>
          <button @click="handleSyncConfirmation('sync')"
            class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors duration-150 flex items-center justify-center gap-2">
            <Icon name="Download" class="w-4 h-4" />
            Sync & Play
          </button>
        </div>
      </div>
    </div>

    <!-- Structured Config Editor - Fullscreen Mode -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showStructuredEditor" class="fixed inset-0 z-[200] bg-background flex flex-col">
          <!-- Fullscreen Header -->
          <div
            class="shrink-0 border-b border-border/50 bg-card/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <button @click="handleCloseStructuredEditor"
                class="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="ArrowLeft" class="w-5 h-5" />
              </button>
              <div
                class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
                <Icon name="Settings" class="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 class="font-semibold text-lg text-foreground">{{ structuredEditorFile?.name }}</h3>
                <p class="text-sm text-muted-foreground">{{ structuredEditorFile?.path }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button @click="handleCloseStructuredEditor"
                class="px-4 py-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                Close
              </button>
            </div>
          </div>
          <!-- Editor Content -->
          <div class="flex-1 overflow-hidden">
            <ConfigStructuredEditor v-if="instance && structuredEditorFile" :instance-id="instance.id"
              :config-path="structuredEditorFile.path" :refresh-key="configRefreshKey"
              @close="handleCloseStructuredEditor" @saved="handleCloseStructuredEditor" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modern Tab Pill Styles */
.tab-pill {
  @apply px-4 py-2 text-sm font-medium rounded-xl flex items-center gap-2 transition-all duration-200 whitespace-nowrap;
  @apply hover:scale-[1.02];
}

.tab-pill-active {
  @apply bg-background text-foreground font-semibold shadow-sm;
  @apply ring-1 ring-border/50;
}

.tab-pill-game {
  @apply bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/30;
  @apply ring-0;
}

.tab-pill-game:hover {
  @apply shadow-lg shadow-primary/40;
}

.tab-pill-inactive {
  @apply text-muted-foreground hover:text-foreground hover:bg-muted/60;
}

/* Sub-tab Styles */
.sub-tab {
  @apply px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200;
}

.sub-tab-active {
  @apply bg-muted text-foreground;
}

.sub-tab-inactive {
  @apply text-muted-foreground hover:text-foreground hover:bg-muted/30;
}

/* Scrollbar Styles */
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}

/* Card hover effect */
.mod-card {
  @apply transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30;
}

/* Resource Row Styles */
.resource-row {
  @apply transition-all duration-200;
}

.resource-row:hover {
  @apply shadow-sm;
}

/* Help Content Styles */
.help-content {
  @apply animate-in fade-in slide-in-from-top-2 duration-200;
}

.help-content h4 {
  @apply text-base;
}

.help-content h5 {
  @apply text-sm;
}

.help-content b {
  @apply text-foreground;
}

/* Play Button */
.play-button {
  @apply w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-all;
  @apply bg-primary text-primary-foreground;
  box-shadow: 0 4px 15px -3px hsl(var(--primary) / 0.4);
}

.play-button:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 6px 20px -3px hsl(var(--primary) / 0.5);
}

.play-button:disabled {
  @apply opacity-50 cursor-not-allowed;
  transform: none;
}

.play-button-active {
  @apply bg-primary/15 text-primary border-2 border-primary/40;
  box-shadow: none;
}

/* ═══════════════════════════════════════════════════════════════════
   FLOATING ACTION BAR
   ═══════════════════════════════════════════════════════════════════ */
.floating-bar-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  pointer-events: none;
}

.floating-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 16px;
  background: hsl(var(--card) / 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow:
    0 25px 50px -12px hsl(var(--background) / 0.5),
    0 0 0 1px hsl(var(--border) / 0.3);
  pointer-events: auto;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-bar-minimized {
  padding: 6px 12px;
  gap: 8px;
}

/* Minimize button */
.floating-bar-minimize-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.floating-bar-minimize-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.floating-bar-minimized .floating-bar-minimize-btn {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.floating-bar-minimized .floating-bar-minimize-btn:hover {
  background: hsl(var(--primary) / 0.25);
}

.floating-bar-divider-mini {
  height: 20px;
}

.floating-bar-minimized-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  padding: 0 4px;
}

.floating-bar-play {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
}

.floating-bar-play:hover:not(:disabled) {
  transform: scale(1.08);
  box-shadow: 0 4px 16px hsl(var(--primary) / 0.4);
}

.floating-bar-play:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Game is fully running - green with accent glow */
.floating-bar-play-game {
  background: hsl(142 76% 36%);
  border: 2px solid hsl(142 76% 50%);
  color: white;
  box-shadow: 0 0 12px hsl(142 76% 36% / 0.4);
  animation: game-running-glow 2s ease-in-out infinite;
}

.floating-bar-play-game:hover {
  background: hsl(0 84% 50%);
  border-color: hsl(0 84% 60%);
  box-shadow: 0 0 12px hsl(0 84% 50% / 0.4);
  animation: none;
}

/* Launcher loading - amber/orange pulsing */
.floating-bar-play-launcher {
  background: hsl(38 92% 50%);
  border: 2px solid hsl(38 92% 60%);
  color: white;
  box-shadow: 0 0 12px hsl(38 92% 50% / 0.4);
  animation: launcher-pulse 1.5s ease-in-out infinite;
}

.floating-bar-play-launcher:hover {
  background: hsl(0 84% 50%);
  border-color: hsl(0 84% 60%);
  box-shadow: 0 0 12px hsl(0 84% 50% / 0.4);
  animation: none;
}

@keyframes game-running-glow {

  0%,
  100% {
    box-shadow: 0 0 8px hsl(142 76% 36% / 0.4);
  }

  50% {
    box-shadow: 0 0 16px hsl(142 76% 36% / 0.6);
  }
}

@keyframes launcher-pulse {

  0%,
  100% {
    box-shadow: 0 0 8px hsl(38 92% 50% / 0.4);
    transform: scale(1);
  }

  50% {
    box-shadow: 0 0 16px hsl(38 92% 50% / 0.6);
    transform: scale(1.02);
  }
}

.floating-bar-divider {
  width: 1px;
  height: 24px;
  background: hsl(var(--border) / 0.5);
  margin: 0 4px;
}

.floating-bar-count {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  padding: 0 8px;
  white-space: nowrap;
}

.floating-bar-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.floating-bar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.floating-bar-btn-enable:hover {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
}

.floating-bar-btn-disable:hover {
  background: rgba(251, 191, 36, 0.2);
  color: rgb(251, 191, 36);
}

.floating-bar-btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

/* Delete Instance - Orange/Amber style to differentiate from Remove Mod (red) */
.floating-bar-btn-delete-instance {
  color: rgb(251, 191, 36);
}

.floating-bar-btn-delete-instance:hover {
  background: rgba(251, 191, 36, 0.2);
  color: rgb(252, 211, 77);
}

.floating-bar-btn-clear {
  margin-left: 2px;
}

.floating-bar-btn-clear:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.floating-bar-btn-active {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
}

.floating-bar-status-text {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 8px;
  white-space: nowrap;
}

.floating-bar-create-instance {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%);
  color: white;
}

.floating-bar-create-instance:hover:not(:disabled) {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.7) 100%);
}

.floating-bar-syncing {
  background: hsl(217 91% 60% / 0.2);
  border: 1px solid hsl(217 91% 60% / 0.4);
  color: hsl(217 91% 60%);
  box-shadow: none;
}

.floating-bar-launching {
  background: hsl(var(--primary) / 0.2);
  border: 1px solid hsl(var(--primary) / 0.4);
  color: hsl(var(--primary));
  box-shadow: none;
}

.floating-bar-play-ready {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%);
  color: hsl(var(--primary-foreground));
  box-shadow: 0 2px 12px hsl(var(--primary) / 0.4);
}

.floating-bar-play-ready:hover:not(:disabled) {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.75) 100%);
  box-shadow: 0 4px 20px hsl(var(--primary) / 0.5);
  transform: scale(1.08);
}

/* ═══════════════════════════════════════════════════════════════════
   LOG CONSOLE PANEL
   ═══════════════════════════════════════════════════════════════════ */
.log-console-panel {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, calc(100% - 40px));
  min-height: 150px;
  max-height: calc(100vh - 150px);
  background: hsl(var(--card) / 0.98);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow: 0 25px 50px -12px hsl(var(--background) / 0.5);
  z-index: 55;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.log-console-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.log-console-resize-handle:hover .log-console-resize-bar {
  background: hsl(var(--primary) / 0.5);
  width: 60px;
}

.log-console-resize-bar {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: hsl(var(--muted-foreground) / 0.3);
  transition: all 0.15s ease;
}

.log-console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: 16px;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  color: hsl(var(--foreground));
}

.log-console-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: hsl(142 76% 36% / 0.2);
  border: 1px solid hsl(142 76% 36% / 0.4);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  color: hsl(142 76% 50%);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.log-console-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(142 76% 50%);
  animation: live-pulse 1.5s ease-in-out infinite;
}

@keyframes live-pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }
}

.log-console-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.log-console-btn:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

/* Log Level Filter Buttons */
.log-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.3);
  border: 1px solid hsl(var(--border) / 0.3);
  transition: all 0.15s ease;
  cursor: pointer;
}

.log-filter-btn:hover {
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
  border-color: hsl(var(--border) / 0.5);
}

.log-filter-btn.log-filter-active {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}

.log-filter-info.log-filter-active {
  background: hsl(217 91% 60% / 0.15);
  color: hsl(217 91% 60%);
  border-color: hsl(217 91% 60% / 0.3);
}

.log-filter-warn.log-filter-active {
  background: hsl(38 92% 50% / 0.15);
  color: hsl(38 92% 50%);
  border-color: hsl(38 92% 50% / 0.3);
}

.log-filter-error.log-filter-active {
  background: hsl(0 84% 60% / 0.15);
  color: hsl(0 84% 60%);
  border-color: hsl(0 84% 60% / 0.3);
}

.log-filter-count {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: hsl(var(--muted) / 0.6);
  color: inherit;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.log-filter-active .log-filter-count {
  background: currentColor;
  color: hsl(var(--card));
}

.log-console-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.log-console-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: hsl(var(--muted-foreground) / 0.5);
  gap: 8px;
}

.log-console-empty p {
  font-size: 12px;
}

.log-console-entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-console-entry {
  color: rgba(255, 255, 255, 0.6);
  word-break: break-word;
  padding: 2px 0;
}

.log-console-entry.text-blue-400 {
  color: rgb(96, 165, 250);
}

.log-console-entry.text-amber-400 {
  color: rgb(251, 191, 36);
}

.log-console-entry.text-red-400 {
  color: rgb(248, 113, 113);
}

.log-console-entry.text-muted-foreground {
  color: rgba(255, 255, 255, 0.5);
}

.log-time {
  color: rgba(255, 255, 255, 0.4);
  margin-right: 8px;
  font-size: 10px;
}

.log-message {
  color: inherit;
}

/* ═══════════════════════════════════════════════════════════════════
   SYNC PANEL (above floating bar)
   ═══════════════════════════════════════════════════════════════════ */
.floating-sync-panel {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: min(500px, calc(100vw - 40px));
  margin-bottom: 12px;
  background: hsl(var(--card) / 0.98);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid hsl(var(--border) / 0.5);
  box-shadow: 0 25px 50px -12px hsl(var(--background) / 0.5);
  overflow: hidden;
  pointer-events: auto;
  z-index: 10;
}

.sync-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  color: hsl(var(--foreground));
}

.sync-panel-close {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.sync-panel-close:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

.sync-panel-content {
  padding: 12px 16px 16px;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sync-section {
  padding: 10px 12px;
  border-radius: 10px;
  background: hsl(var(--muted) / 0.3);
}

.sync-section-add {
  border-left: 3px solid hsl(142 76% 45%);
}

.sync-section-update {
  border-left: 3px solid hsl(38 92% 50%);
}

.sync-section-remove {
  border-left: 3px solid hsl(0 84% 60%);
}

.sync-section-loader {
  border-left: 3px solid hsl(217 91% 60%);
}

.sync-section-disabled {
  border-left: 3px solid hsl(280 60% 55%);
}

.sync-section-extra {
  border-left: 3px solid hsl(200 70% 50%);
  background: rgba(255, 255, 255, 0.02);
}

.sync-item-issue {
  font-size: 9px;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
}

.sync-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin-bottom: 8px;
}

.sync-section-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.sync-item-type {
  padding: 1px 4px;
  background: hsl(var(--muted) / 0.5);
  border-radius: 4px;
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.sync-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Update item styles */
.sync-item-update {
  flex-wrap: wrap;
}

.sync-item-old {
  text-decoration: line-through;
  opacity: 0.6;
}

.sync-item-arrow {
  color: hsl(38 92% 50%);
  font-weight: 600;
}

.sync-item-new {
  color: hsl(38 92% 50%);
}

.sync-item-disabled-badge {
  font-size: 9px;
  padding: 1px 5px;
  background: hsl(280 60% 55% / 0.2);
  color: hsl(280 60% 65%);
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.sync-item-more {
  font-size: 10px;
  color: hsl(var(--muted-foreground) / 0.7);
  padding-top: 4px;
}

.sync-mode-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid hsl(var(--border) / 0.5);
}

.sync-mode-buttons {
  display: flex;
  gap: 6px;
}

.sync-mode-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.3);
  color: hsl(var(--muted-foreground));
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.sync-mode-btn:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

.sync-mode-active {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}

.sync-mode-active-warning {
  background: hsl(45 93% 47% / 0.2);
  color: hsl(45 93% 60%);
  border-color: hsl(45 93% 47% / 0.4);
}

.sync-mode-active-muted {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
  border-color: hsl(var(--border));
}

/* ═══════════════════════════════════════════════════════════════════
   FLOATING BAR - SYNC INDICATOR
   ═══════════════════════════════════════════════════════════════════ */
.floating-bar-btn-sync {
  color: rgb(251, 191, 36);
  position: relative;
}

.floating-bar-btn-sync:hover {
  background: rgba(251, 191, 36, 0.2);
}

.floating-bar-sync-count {
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
}

.floating-bar-btn-sync-action {
  color: hsl(var(--primary));
}

.floating-bar-btn-sync-action:hover {
  background: hsl(var(--primary) / 0.2);
}

.floating-bar-sync-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: hsl(142 76% 50%);
  padding: 0 8px;
}

/* ═══════════════════════════════════════════════════════════════════
   FLOATING NOTICE & PROGRESS
   ═══════════════════════════════════════════════════════════════════ */
.floating-notice {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: hsl(var(--card) / 0.95);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid hsl(var(--primary) / 0.3);
  font-size: 11px;
  color: hsl(var(--foreground) / 0.8);
  white-space: nowrap;
  pointer-events: auto;
}

.floating-progress {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
  padding: 10px 14px;
  background: hsl(var(--card) / 0.95);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid hsl(var(--primary) / 0.3);
  pointer-events: auto;
}

.progress-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: hsl(var(--foreground) / 0.8);
}

.progress-count {
  font-weight: 600;
  color: hsl(var(--primary));
}

.progress-bar {
  height: 4px;
  background: hsl(var(--muted) / 0.5);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* ═══════════════════════════════════════════════════════════════════
   STYLED RANGE SLIDER
   ═══════════════════════════════════════════════════════════════════ */
.styled-range {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.styled-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--primary));
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.styled-range::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
}

.styled-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--primary));
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.styled-range::-moz-range-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
</style>
