<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useToast } from "@/composables/useToast";
import { useInstances } from "@/composables/useInstances";
import {
  X,
  Plus,
  Trash2,
  Search,
  Download,
  Check,
  ImagePlus,
  ArrowUpCircle,
  ArrowLeft,
  Lock,
  LockOpen,
  Save,
  GitBranch,
  Package,
  Settings,
  Layers,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Share2,
  Globe,
  ToggleLeft,
  ToggleRight,
  Filter,
  CheckSquare,
  Square,
  Image,
  Sparkles,
  History,
  ExternalLink,
  Info,
  HelpCircle,
  ChevronDown,
  BookOpen,
  Lightbulb,
  Play,
  Loader2,
  FolderOpen,
  FileCode,
  Clock,
  HardDrive,
  Gamepad2,
  Terminal,
  ChevronUp,
  Cpu,
  MemoryStick,
  Sliders,
  Rocket,
  FileWarning,
  FolderSync,
  FileEdit,
  FolderTree,
  FileText,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Stethoscope,
} from "lucide-vue-next";
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
import type { Mod, Modpack, ModpackChange, RemoteUpdateResult, ModexInstance, InstanceSyncResult, ConfigFile } from "@/types";
import type { CFModLoader } from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isOpen: boolean;
  initialTab?: "play" | "mods" | "discover" | "health" | "versions" | "settings" | "remote" | "configs";
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

// Instance composable for play functionality
const {
  syncProgress,
  runningGames,
  getInstanceByModpack,
  createFromModpack,
  syncModpackToInstance,
  launchInstance,
  openInstanceFolder,
  getInstanceStats,
  killGame,
  onGameLogLine,
  updateInstance,
  smartLaunch,
} = useInstances();

const modpack = ref<Modpack | null>(null);
const currentMods = ref<Mod[]>([]);
const availableMods = ref<Mod[]>([]);
const disabledModIds = ref<Set<string>>(new Set());
const lockedModIds = ref<Set<string>>(new Set());
const modNotes = ref<Record<string, string>>({});
const searchQueryInstalled = ref("");
const searchQueryAvailable = ref("");
const isLoading = ref(true);
// Race condition protection: track current load requests
let loadRequestId = 0;
let instanceRequestId = 0;
const sortBy = ref<"name" | "version" | "date">("name");
const sortDir = ref<"asc" | "desc">("asc");
const selectedModIds = ref<Set<string>>(new Set());
const showSingleModUpdateDialog = ref(false);
const selectedUpdateMod = ref<any>(null);
const showVersionPickerDialog = ref(false);
const versionPickerMod = ref<any>(null);
const isSaving = ref(false);

// Mod Details Modal state
const showModDetailsModal = ref(false);
const modDetailsTarget = ref<Mod | null>(null);
const modsFilter = ref<"all" | "incompatible" | "warning" | "disabled" | "locked" | "updates" | "recent-updated" | "recent-added" | "with-notes">("all");

// Changelog Dialog state
const showChangelogDialog = ref(false);
const changelogMod = ref<{
  id: number;
  fileId: number;
  name: string;
  version: string;
  slug?: string;
} | null>(null);

// Mod Notes Dialog state
const showModNoteDialog = ref(false);
const noteDialogMod = ref<Mod | null>(null);
const noteDialogText = ref("");
const isSavingNote = ref(false);

const activeTab = ref<
  | "play"
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

// Help Guide State
const showHelp = ref(false);

// More Menu State (for secondary tabs)
const showMoreMenu = ref(false);
const secondaryTabs = ['discover', 'health', 'versions', 'remote'] as const;
const isSecondaryTab = computed(() => secondaryTabs.includes(activeTab.value as any));

// Mods Filter overflow menu
const showModsFilterMenu = ref(false);

// Linked instance (for config sync in version control)
const linkedInstanceId = ref<string | null>(null);

// ========== PLAY/INSTANCE STATE ==========
const instance = ref<ModexInstance | null>(null);
const instanceStats = ref<{ modCount: number; configCount: number; totalSize: string } | null>(null);
const isInstanceLoading = ref(false);
const isCreatingInstance = ref(false);
const isSyncingInstance = ref(false);
const isLaunching = ref(false);
const syncResult = ref<InstanceSyncResult | null>(null);

// Sync Status for instance
const instanceSyncStatus = ref<{
  needsSync: boolean;
  missingInInstance: Array<{ filename: string; type: string }>;
  extraInInstance: Array<{ filename: string; type: string }>;
  disabledMismatch: Array<{ filename: string; issue: string }>;
  configDifferences: number;
  totalDifferences: number;
  loaderVersionMismatch?: boolean;
} | null>(null);

// Sync UI State
const showSyncDetails = ref(false);
const selectedSyncMode = ref<'overwrite' | 'new_only' | 'skip'>('new_only');
const syncSettings = ref({
  autoSyncEnabled: true,
  showConfirmation: true
});

// Loader Installation Progress
const loaderProgress = ref<{
  stage: string;
  current: number;
  total: number;
  detail: string;
} | null>(null);

// Game Launch State
const gameLaunched = ref(false);
const gameLoadingMessage = ref("");

// Instance Settings (RAM & JVM Args)
const showInstanceSettings = ref(false);
const showDeleteInstanceDialog = ref(false);
const isDeletingInstance = ref(false);
const memoryMin = ref(2048);
const memoryMax = ref(4096);
const customJavaArgs = ref("");
const systemMemory = ref<{ total: number; suggestedMax: number } | null>(null);

// Computed max RAM based on system
const maxAllowedRam = computed(() => {
  if (systemMemory.value) {
    return systemMemory.value.suggestedMax;
  }
  return 32768; // fallback
});

// Live Log State
const gameLogs = ref<Array<{ time: string; level: string; message: string }>>([]);
const showLogConsole = ref(false);

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
const logScrollRef = ref<HTMLDivElement | null>(null);
const maxLogLines = 200;
const logLevelFilter = ref<"all" | "info" | "warn" | "error">("all");

// Filtered logs based on level
const filteredGameLogs = computed(() => {
  if (logLevelFilter.value === "all") return gameLogs.value;
  const filterMap: Record<string, string[]> = {
    "info": ["INFO"],
    "warn": ["WARN", "WARNING"],
    "error": ["ERROR", "FATAL", "SEVERE"]
  };
  const allowedLevels = filterMap[logLevelFilter.value] || [];
  return gameLogs.value.filter(log => allowedLevels.includes(log.level.toUpperCase()));
});

// Log level counts for badges
const logLevelCounts = computed(() => {
  const counts = { info: 0, warn: 0, error: 0 };
  for (const log of gameLogs.value) {
    const level = log.level.toUpperCase();
    if (level === "INFO") counts.info++;
    else if (level === "WARN" || level === "WARNING") counts.warn++;
    else if (level === "ERROR" || level === "FATAL" || level === "SEVERE") counts.error++;
  }
  return counts;
});

// Running game computed
const runningGame = computed(() => {
  if (!instance.value) return null;
  return runningGames.value.get(instance.value.id) || null;
});

const isGameRunning = computed(() => {
  return runningGame.value !== null && runningGame.value.status !== "stopped";
});

// Config Editor State
const showStructuredEditor = ref(false);
const structuredEditorFile = ref<ConfigFile | null>(null);
const configRefreshKey = ref(0);

// Bidirectional Config Sync State
const modifiedConfigs = ref<Array<{
  relativePath: string;
  instancePath: string;
  overridePath?: string;
  status: 'modified' | 'new' | 'deleted';
  lastModified: Date;
  size: number;
}>>([]);
const showModifiedConfigsDetails = ref(false);
const selectedConfigsForImport = ref<Set<string>>(new Set());
const isImportingConfigs = ref(false);
const showOnlyModifiedConfigs = ref(true); // By default, only show actually modified configs, not new ones

// Computed: Only importable configs (new or modified, not deleted)
// When showOnlyModifiedConfigs is true, only show 'modified' status (files that exist in both places but differ)
const importableConfigs = computed(() =>
  modifiedConfigs.value.filter(c => {
    if (c.status === 'deleted') return false;
    if (showOnlyModifiedConfigs.value && c.status === 'new') return false;
    return true;
  })
);

// Computed: Deleted configs (exist in overrides but not in instance)
const deletedConfigs = computed(() =>
  modifiedConfigs.value.filter(c => c.status === 'deleted')
);

// Computed: New configs count (for showing toggle)
const newConfigsCount = computed(() =>
  modifiedConfigs.value.filter(c => c.status === 'new').length
);

// Sync Options
const clearExistingMods = ref(false);

// Smart Launch Confirmation
const showSyncConfirmDialog = ref(false);
const pendingLaunchData = ref<{
  needsSync: boolean;
  differences: number;
  lastSynced?: string;
} | null>(null);

// ========== END PLAY/INSTANCE STATE ==========

// Confirm dialog state for removing incompatible mods
const showRemoveIncompatibleDialog = ref(false);

// Remote Updates
const showReviewDialog = ref(false);
const updateResult = ref<RemoteUpdateResult | null>(null);
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

// Dependency Impact Dialog
const showDependencyImpactDialog = ref(false);
const dependencyImpact = ref<{
  action: "remove" | "disable";
  modToAffect: { id: string; name: string } | null;
  dependentMods: Array<{ id: string; name: string; willBreak: boolean; depth?: number }>;
  orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
  warnings: string[];
} | null>(null);
const pendingModAction = ref<{ modId: string; action: "remove" | "disable" } | null>(null);

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

// Check mod compatibility with modpack
// Returns: compatible (green), warning (amber - loader mismatch but might work), incompatible (red - version mismatch)
function isModCompatible(mod: Mod): { compatible: boolean; warning?: boolean; reason?: string } {
  if (!modpack.value) return { compatible: true };

  const modContentType = mod.content_type || "mod";
  const packVersion = modpack.value.minecraft_version;
  const modVersion = mod.game_version;

  // Track loader mismatch separately - it's a warning, not a hard incompatibility
  // Modpack creators sometimes include mods from other loaders that work via compatibility layers
  // (e.g., Sinytra Connector for Fabric mods on Forge, or mods that genuinely work across loaders)
  let loaderWarning: string | undefined;

  if (modContentType === "mod") {
    const packLoader = modpack.value.loader?.toLowerCase();
    const modLoader = mod.loader?.toLowerCase();

    if (packLoader && modLoader && modLoader !== "unknown") {
      const isNeoForgeForgeCompat =
        (packLoader === "neoforge" && modLoader === "forge") ||
        (packLoader === "forge" && modLoader === "neoforge");

      if (modLoader !== packLoader && !isNeoForgeForgeCompat) {
        loaderWarning = `${modLoader} mod in ${packLoader} pack`;
      }
    }
  }

  // Check MC version compatibility
  if (packVersion && modVersion && modVersion !== "unknown") {
    // Check game_versions array first (works for ALL content types including mods)
    // Many mods support multiple MC versions in a single file
    if (mod.game_versions && mod.game_versions.length > 0) {
      const isVersionCompatible = mod.game_versions.some(
        (gv) =>
          gv === packVersion ||
          gv.startsWith(packVersion) ||
          packVersion.startsWith(gv)
      );
      if (!isVersionCompatible) {
        // Version mismatch is a hard incompatibility
        return {
          compatible: false,
          reason: `Supports MC ${mod.game_versions.slice(0, 3).join(", ")}${mod.game_versions.length > 3 ? "..." : ""
            }, modpack is ${packVersion}`,
        };
      }
    } else {
      // Fallback: Standard single version check for items without game_versions array
      const versionsMatch =
        modVersion === packVersion ||
        modVersion.startsWith(packVersion) ||
        packVersion.startsWith(modVersion) ||
        modVersion.includes(packVersion);

      if (!versionsMatch) {
        return {
          compatible: false,
          reason: `For MC ${modVersion}, modpack is ${packVersion}`,
        };
      }
    }
  }

  // If we get here, version is compatible - but we might have a loader warning
  if (loaderWarning) {
    return { compatible: true, warning: true, reason: loaderWarning };
  }

  return { compatible: true };
}

// Filtered & Sorted Mods with compatibility info
const filteredInstalledMods = computed(() => {
  let mods = currentMods.value.filter((m) => {
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

    // Search filter
    const matchesSearch = m.name
      .toLowerCase()
      .includes(searchQueryInstalled.value.toLowerCase());
    if (!matchesSearch) return false;

    // Quick filter
    if (modsFilter.value === "incompatible") {
      return !isModCompatible(m).compatible;
    }
    if (modsFilter.value === "warning") {
      const compat = isModCompatible(m);
      return compat.compatible && compat.warning;
    }
    if (modsFilter.value === "disabled") {
      return disabledModIds.value.has(m.id);
    }
    if (modsFilter.value === "locked") {
      return lockedModIds.value.has(m.id);
    }
    if (modsFilter.value === "updates") {
      return !!updateAvailable.value[m.id];
    }
    if (modsFilter.value === "recent-updated") {
      return recentlyUpdatedMods.value.has(m.id);
    }
    if (modsFilter.value === "recent-added") {
      return recentlyAddedMods.value.has(m.id);
    }
    if (modsFilter.value === "with-notes") {
      return !!modNotes.value[m.id];
    }
    return true;
  });
  mods.sort((a, b) => {
    if (sortBy.value === "date") {
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return sortDir.value === "asc" ? aDate - bDate : bDate - aDate;
    }
    const aVal = a[sortBy.value] || "";
    const bVal = b[sortBy.value] || "";
    const cmp = aVal.localeCompare(bVal);
    return sortDir.value === "asc" ? cmp : -cmp;
  });
  return mods;
});

// Content type counts
const contentTypeCounts = computed(() => {
  const counts = { mods: 0, resourcepacks: 0, shaders: 0 };
  for (const m of currentMods.value) {
    const ct = m.content_type || "mod";
    if (ct === "mod") counts.mods++;
    else if (ct === "resourcepack") counts.resourcepacks++;
    else if (ct === "shader") counts.shaders++;
  }
  return counts;
});

// Installed mods with compatibility check
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

// Count of incompatible mods (per tab)
const incompatibleModCount = computed(() => {
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
    return !isModCompatible(m).compatible;
  }).length;
});

// Count of warning mods (different loader but version compatible)
const warningModCount = computed(() => {
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
    const compat = isModCompatible(m);
    return compat.compatible && compat.warning;
  }).length;
});

// Update Checking
const checkingUpdates = ref<Record<string, boolean>>({});
const updateAvailable = ref<Record<string, any>>({});
const isCheckingAllUpdates = ref(false);
const recentlyUpdatedMods = ref<Set<string>>(new Set()); // Mod IDs updated in last 5 min
const recentlyAddedMods = ref<Set<string>>(new Set()); // Mod IDs added in last 5 min

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

function openSingleModUpdate(mod: Mod) {
  selectedUpdateMod.value = mod;
  showSingleModUpdateDialog.value = true;
}

function handleSingleModUpdated() {
  // Mark as recently updated
  if (selectedUpdateMod.value) {
    recentlyUpdatedMods.value.add(selectedUpdateMod.value.id);
    // Clear after 5 minutes
    setTimeout(() => {
      recentlyUpdatedMods.value.delete(selectedUpdateMod.value?.id);
    }, RECENT_THRESHOLD_MS);

    if (updateAvailable.value[selectedUpdateMod.value.id]) {
      delete updateAvailable.value[selectedUpdateMod.value.id];
    }
  }
  loadData();
  emit("update");
}

async function checkModUpdate(mod: Mod) {
  if (!mod.cf_project_id || !mod.cf_file_id || checkingUpdates.value[mod.id])
    return;

  checkingUpdates.value[mod.id] = true;
  try {
    const latestFile = await window.api.updates.checkMod(
      mod.cf_project_id,
      modpack.value?.minecraft_version || "1.20.1",
      modpack.value?.loader || "forge",
      (mod.content_type || "mod") as "mod" | "resourcepack" | "shader"
    );

    if (
      latestFile &&
      latestFile.id !== mod.cf_file_id &&
      latestFile.id > mod.cf_file_id
    ) {
      updateAvailable.value[mod.id] = latestFile;
    } else {
      updateAvailable.value[mod.id] = null; // Checked, no update
    }
  } catch (err) {
    console.error(`Failed to check update for ${mod.name}:`, err);
  } finally {
    checkingUpdates.value[mod.id] = false;
  }
}

async function updateMod(mod: Mod) {
  const latest = updateAvailable.value[mod.id];
  if (!latest) return;

  try {
    const result = await window.api.updates.applyUpdate(mod.id, latest.id, props.modpackId);
    if (result.success) {
      delete updateAvailable.value[mod.id];
      emit("update");
      toast.success(`${mod.name} updated to ${latest.displayName} ✓`);
    } else {
      toast.error(`Couldn't update ${mod.name}: ${result.error}`);
    }
  } catch (err) {
    console.error("Update failed:", err);
    toast.error("Couldn't update mod");
  }
}

// Version picker for changing mod version
function openVersionPicker(mod: Mod) {
  if (!mod.cf_project_id) return;

  // Check if mod is locked
  if (lockedModIds.value.has(mod.id)) {
    toast.error(
      "Mod is locked",
      "Unlock it first to change the version."
    );
    return;
  }

  versionPickerMod.value = {
    id: mod.cf_project_id,
    name: mod.name,
    slug: mod.slug,
    logo: mod.thumbnail_url ? { thumbnailUrl: mod.thumbnail_url } : undefined,
    libraryModId: mod.id,
    currentFileId: mod.cf_file_id,
    content_type: mod.content_type || "mod"
  };
  showVersionPickerDialog.value = true;
}

async function handleVersionSelected(fileId: number) {
  if (!versionPickerMod.value) return;

  try {
    const result = await window.api.updates.applyUpdate(
      versionPickerMod.value.libraryModId,
      fileId,
      props.modpackId
    );
    if (result.success) {
      // Mark as recently updated
      recentlyUpdatedMods.value.add(versionPickerMod.value.libraryModId);
      setTimeout(() => {
        recentlyUpdatedMods.value.delete(versionPickerMod.value?.libraryModId);
      }, RECENT_THRESHOLD_MS);

      // Clear any cached update status
      if (updateAvailable.value[versionPickerMod.value.libraryModId]) {
        delete updateAvailable.value[versionPickerMod.value.libraryModId];
      }
      await loadData();
      emit("update");
      toast.success(`${versionPickerMod.value.name} updated ✓`);
    } else {
      toast.error(`Couldn't change version: ${result.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    console.error("Version change failed:", err);
    toast.error(`Couldn't change version: ${err?.message || 'Unknown error'}`);
  }

  showVersionPickerDialog.value = false;
  versionPickerMod.value = null;
}

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

// Check all mods for updates (auto-triggered on load)
async function checkAllUpdates() {
  if (isCheckingAllUpdates.value) return;

  const cfMods = currentMods.value.filter(m => m.cf_project_id && m.cf_file_id);
  if (cfMods.length === 0) return;

  isCheckingAllUpdates.value = true;

  // Process in parallel batches
  const BATCH_SIZE = 5;
  for (let i = 0; i < cfMods.length; i += BATCH_SIZE) {
    const batch = cfMods.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(mod => checkModUpdate(mod)));
  }

  isCheckingAllUpdates.value = false;
}

// Quick update a single mod to latest
async function quickUpdateMod(mod: Mod) {
  // Check if mod is locked
  if (lockedModIds.value.has(mod.id)) {
    toast.error(
      "Mod is locked",
      "Unlock it first to update."
    );
    return;
  }

  const latest = updateAvailable.value[mod.id];
  if (!latest) return;

  checkingUpdates.value[mod.id] = true;
  try {
    const result = await window.api.updates.applyUpdate(mod.id, latest.id, props.modpackId);
    if (result.success) {
      // Mark as recently updated
      recentlyUpdatedMods.value.add(mod.id);
      setTimeout(() => {
        recentlyUpdatedMods.value.delete(mod.id);
      }, RECENT_THRESHOLD_MS);

      delete updateAvailable.value[mod.id];
      await loadData();
      emit("update");
      toast.success(`${mod.name} updated ✓`);
    } else {
      toast.error(`Couldn't update ${mod.name}: ${result.error}`);
    }
  } catch (err) {
    console.error("Update failed:", err);
    toast.error(`Couldn't update ${mod.name}`);
  } finally {
    checkingUpdates.value[mod.id] = false;
  }
}

// View changelog for a mod update
function viewModChangelog(mod: Mod) {
  const update = updateAvailable.value[mod.id];
  if (!mod.cf_project_id || !update) return;

  changelogMod.value = {
    id: mod.cf_project_id,
    fileId: update.id,
    name: mod.name,
    version: update.displayName || update.fileName,
    slug: mod.slug,
  };
  showChangelogDialog.value = true;
}

// Update all mods with available updates (excluding locked mods)
async function updateAllMods() {
  const modsToUpdate = currentMods.value.filter(m =>
    updateAvailable.value[m.id] && !lockedModIds.value.has(m.id)
  );
  if (modsToUpdate.length === 0) {
    toast.info("All up to date", "Your mods are on their latest versions.");
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const mod of modsToUpdate) {
    try {
      const latest = updateAvailable.value[mod.id];
      const result = await window.api.updates.applyUpdate(mod.id, latest.id, props.modpackId);
      if (result.success) {
        recentlyUpdatedMods.value.add(mod.id);
        setTimeout(() => {
          recentlyUpdatedMods.value.delete(mod.id);
        }, RECENT_THRESHOLD_MS);
        delete updateAvailable.value[mod.id];
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  await loadData();
  emit("update");

  if (failCount === 0) {
    toast.success(`${successCount} mods updated ✓`);
  } else {
    toast.warning(`${successCount} updated, ${failCount} couldn't update`);
  }
}

// Count of mods with updates available (per tab)
const updatesAvailableCount = computed(() => {
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
    return updateAvailable.value[m.id];
  }).length;
});

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

// Lightweight refresh of just the sync status (without full data reload)
async function refreshSyncStatus() {
  if (!instance.value) {
    instanceSyncStatus.value = null;
    return;
  }
  try {
    instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
  } catch (err) {
    console.error("Failed to refresh sync status:", err);
  }
}

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
          await window.api.modpacks.update(pack.id!, {
            remote_source: {
              ...pack.remote_source,
              skip_initial_check: false,
            },
          });
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

// ========== INSTANCE/PLAY FUNCTIONS ==========

// Load system memory info
async function loadSystemInfo() {
  try {
    systemMemory.value = await window.api.system.getMemoryInfo();
  } catch (err) {
    console.error("Failed to get system memory info:", err);
  }
}

// Load instance for this modpack
async function loadInstance() {
  if (!props.modpackId) return;

  // Race condition protection
  const currentInstanceRequestId = ++instanceRequestId;

  isInstanceLoading.value = true;

  // Load system info in parallel
  loadSystemInfo();

  try {
    instance.value = await getInstanceByModpack(props.modpackId);

    // Check for stale request
    if (currentInstanceRequestId !== instanceRequestId) {
      console.log(`[loadInstance] Discarding stale result`);
      return;
    }

    if (instance.value) {
      const stats = await getInstanceStats(instance.value.id);
      if (stats) {
        instanceStats.value = {
          modCount: stats.modCount,
          configCount: stats.configCount,
          totalSize: stats.totalSize,
        };
      }

      // Load instance settings
      memoryMin.value = instance.value.memory?.min || 2048;
      memoryMax.value = instance.value.memory?.max || 4096;
      customJavaArgs.value = instance.value.javaArgs || "";

      // Check sync status
      try {
        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
      } catch (err) {
        console.error("Failed to check sync status:", err);
      }
    }
  } finally {
    if (currentInstanceRequestId === instanceRequestId) {
      isInstanceLoading.value = false;
    }
  }
}

// Create instance for modpack
async function handleCreateInstance() {
  isCreatingInstance.value = true;
  syncResult.value = null;

  try {
    const result = await createFromModpack(props.modpackId);
    if (result) {
      instance.value = result.instance;
      syncResult.value = result.syncResult;

      if (result.syncResult.success) {
        toast.success("Ready to play ✓", `Downloaded ${result.syncResult.modsDownloaded} mods`);

        const stats = await getInstanceStats(result.instance.id);
        if (stats) {
          instanceStats.value = {
            modCount: stats.modCount,
            configCount: stats.configCount,
            totalSize: stats.totalSize,
          };
        }
      } else {
        toast.error("Created with issues", `${result.syncResult.errors.length} items need attention`);
      }
    }
  } catch (err: any) {
    toast.error("Couldn't create instance", err.message);
  } finally {
    isCreatingInstance.value = false;
  }
}

// Load sync settings
async function loadSyncSettings() {
  try {
    const settings = await window.api.settings.getInstanceSync();
    syncSettings.value = {
      autoSyncEnabled: settings.autoSyncBeforeLaunch ?? true,
      showConfirmation: settings.showSyncConfirmation ?? true
    };
  } catch (err) {
    console.error("Failed to load sync settings:", err);
  }
}

// Toggle auto-sync setting
async function toggleAutoSync() {
  const newValue = !syncSettings.value.autoSyncEnabled;
  syncSettings.value.autoSyncEnabled = newValue;
  try {
    await window.api.settings.setInstanceSync({
      autoSyncBeforeLaunch: newValue
    });
  } catch (err) {
    console.error("Failed to save sync setting:", err);
  }
}

// Toggle sync confirmation setting
async function toggleSyncConfirmation() {
  const newValue = !syncSettings.value.showConfirmation;
  syncSettings.value.showConfirmation = newValue;
  try {
    await window.api.settings.setInstanceSync({
      showSyncConfirmation: newValue
    });
  } catch (err) {
    console.error("Failed to save sync setting:", err);
  }
}

// Sync instance with modpack
async function handleSyncInstance() {
  if (!instance.value) return;

  isSyncingInstance.value = true;
  syncResult.value = null;

  try {
    const result = await syncModpackToInstance(instance.value.id, props.modpackId, {
      clearExisting: clearExistingMods.value,
      configSyncMode: selectedSyncMode.value
    });

    syncResult.value = result;

    if (result.success) {
      toast.success("Synced ✓", `${result.modsDownloaded} mods updated`);

      // Refresh instance data (loader version may have been updated)
      await loadInstance();

      // Instance may have been updated by loadInstance - re-check
      if (instance.value) {
        const stats = await getInstanceStats(instance.value.id);
        if (stats) {
          instanceStats.value = {
            modCount: stats.modCount,
            configCount: stats.configCount,
            totalSize: stats.totalSize,
          };
        }

        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
      }
      showSyncDetails.value = false; // Collapse details after sync
    } else {
      toast.error("Sync had issues", result.errors.join(", "));
    }
  } catch (err: any) {
    toast.error("Couldn't sync", err.message);
  } finally {
    isSyncingInstance.value = false;
  }
}

// Launch instance
async function handleLaunch(options?: { forceSync?: boolean; skipSync?: boolean }) {
  if (!instance.value) return;

  isLaunching.value = true;
  loaderProgress.value = null;
  gameLaunched.value = false;
  gameLoadingMessage.value = "";

  const removeProgressListener = window.api.on("loader:installProgress", (data: {
    stage: string;
    current: number;
    total: number;
    detail?: string;
  }) => {
    loaderProgress.value = {
      stage: data.stage,
      current: data.current,
      total: data.total,
      detail: data.detail || ""
    };
  });

  try {
    const result = await smartLaunch(instance.value.id, props.modpackId, {
      forceSync: options?.forceSync,
      skipSync: options?.skipSync
      // Note: Auto-sync always uses new_only mode (hardcoded in backend)
      // selectedSyncMode is only for manual sync from the banner
    });

    if (result.requiresConfirmation && result.syncStatus) {
      pendingLaunchData.value = {
        needsSync: result.syncStatus.needsSync,
        differences: result.syncStatus.differences,
        lastSynced: result.syncStatus.lastSynced
      };
      showSyncConfirmDialog.value = true;
      isLaunching.value = false;
      removeProgressListener();
      return;
    }

    if (result.success) {
      gameLaunched.value = true;
      gameLoadingMessage.value = "Launching Minecraft...";

      if (result.syncPerformed && instance.value) {
        toast.success("Launching ✓", "Synced and starting Minecraft...");
        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
      } else {
        toast.success("Launching ✓", "Starting Minecraft...");
      }

      emit("launched", instance.value);
    } else {
      toast.error("Couldn't launch", result.error || "Unknown error");
    }
  } catch (err: any) {
    toast.error("Couldn't launch", err.message);
  } finally {
    removeProgressListener();
    isLaunching.value = false;
    loaderProgress.value = null;
  }
}

// Handle sync confirmation
function handleSyncConfirmation(action: "sync" | "skip" | "cancel") {
  showSyncConfirmDialog.value = false;
  pendingLaunchData.value = null;

  if (action === "cancel") return;

  handleLaunch({
    forceSync: action === "sync",
    skipSync: action === "skip"
  });
}

// Kill running game
async function handleKillGame() {
  if (!instance.value) return;

  try {
    const result = await killGame(instance.value.id);
    if (result) {
      toast.success("Stopped ✓", "Minecraft has been closed.");
      gameLaunched.value = false;
    } else {
      toast.error("Couldn't stop game", "The process may have already ended.");
    }
  } catch (err: any) {
    toast.error("Couldn't stop game", err.message);
  }
}

// Open instance folder
async function handleOpenInstanceFolder(subfolder?: string) {
  if (!instance.value) return;
  await openInstanceFolder(instance.value.id, subfolder);
}

// Open instance settings dialog with current values
function openInstanceSettings() {
  if (!instance.value) return;

  // Load current values from instance
  memoryMin.value = instance.value.memory?.min || 2048;
  memoryMax.value = instance.value.memory?.max || 4096;
  customJavaArgs.value = instance.value.javaArgs || "";

  showInstanceSettings.value = true;
}

// Save instance settings
async function saveInstanceSettings() {
  if (!instance.value) return;

  try {
    await updateInstance(instance.value.id, {
      memory: { min: memoryMin.value, max: memoryMax.value },
      javaArgs: customJavaArgs.value || undefined
    });

    // Update local instance state with new values
    instance.value = {
      ...instance.value,
      memory: { min: memoryMin.value, max: memoryMax.value },
      javaArgs: customJavaArgs.value || undefined
    };

    toast.success("Saved ✓", "Memory and JVM settings updated.");
    showInstanceSettings.value = false;
  } catch (err: any) {
    toast.error("Couldn't save", err.message);
  }
}

// Delete instance
async function handleDeleteInstance() {
  if (!instance.value) return;

  isDeletingInstance.value = true;
  try {
    const success = await window.api.instances.delete(instance.value.id);
    if (success) {
      toast.success("Deleted ✓", "You can recreate it anytime from Play.");
      instance.value = null;
      instanceStats.value = null;
      instanceSyncStatus.value = null;
    } else {
      toast.error("Couldn't delete instance");
    }
  } catch (err: any) {
    toast.error("Couldn't delete", err.message);
  } finally {
    isDeletingInstance.value = false;
    showDeleteInstanceDialog.value = false;
  }
}

// Open config file
function handleOpenStructuredEditor(file: ConfigFile) {
  structuredEditorFile.value = file;
  showStructuredEditor.value = true;
}

function handleCloseStructuredEditor() {
  showStructuredEditor.value = false;
  structuredEditorFile.value = null;
}

// ========== BIDIRECTIONAL CONFIG SYNC ==========

// Load modified configs from instance
async function loadModifiedConfigs() {
  if (!instance.value) return;

  try {
    const result = await window.api.instances.getModifiedConfigs(instance.value.id, props.modpackId);
    modifiedConfigs.value = result.modifiedConfigs;

    // Auto-select only modified configs (not new ones by default)
    selectedConfigsForImport.value = new Set(
      modifiedConfigs.value
        .filter(c => c.status === 'modified') // Only truly modified, not new
        .map(c => c.relativePath)
    );
  } catch (err) {
    console.error("Failed to load modified configs:", err);
  }
}

// Toggle config selection for import
function toggleConfigSelection(relativePath: string) {
  if (selectedConfigsForImport.value.has(relativePath)) {
    selectedConfigsForImport.value.delete(relativePath);
  } else {
    selectedConfigsForImport.value.add(relativePath);
  }
  // Trigger reactivity
  selectedConfigsForImport.value = new Set(selectedConfigsForImport.value);
}

// Select all configs (respects current filter)
function selectAllConfigs() {
  selectedConfigsForImport.value = new Set(
    importableConfigs.value.map(c => c.relativePath)
  );
}

// Deselect all configs
function deselectAllConfigs() {
  selectedConfigsForImport.value = new Set();
}

// Import selected configs to modpack
async function importSelectedConfigs() {
  if (!instance.value || selectedConfigsForImport.value.size === 0) return;

  isImportingConfigs.value = true;

  try {
    const configPaths = Array.from(selectedConfigsForImport.value);
    const result = await window.api.instances.importConfigs(
      instance.value.id,
      props.modpackId,
      configPaths
    );

    if (result.success) {
      toast.success("Imported ✓", `${result.imported} config files added.`);

      // Small delay to ensure filesystem is synced before reloading
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload modified configs
      await loadModifiedConfigs();
      showModifiedConfigsDetails.value = false;

      // If no more configs to import, clear selection
      if (importableConfigs.value.length === 0) {
        selectedConfigsForImport.value = new Set();
      }
    } else {
      toast.error("Couldn't import some files", result.errors.join(", "));
    }
  } catch (err: any) {
    toast.error("Couldn't import", err.message);
  } finally {
    isImportingConfigs.value = false;
  }
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ========== END BIDIRECTIONAL CONFIG SYNC ==========

// Format date helper
function formatPlayDate(dateString?: string): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

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

async function addMod(modId: string) {
  if (isLinked.value) {
    toast.error(
      "Action Restricted",
      "Cannot add mods to a linked modpack. Manage mods from the remote source."
    );
    return;
  }
  try {
    await window.api.modpacks.addMod(props.modpackId, modId);

    // Mark as recently added
    recentlyAddedMods.value.add(modId);
    setTimeout(() => {
      recentlyAddedMods.value.delete(modId);
    }, RECENT_THRESHOLD_MS);

    await loadData();
    emit("update");
  } catch (err) {
    const errorMsg = (err as Error).message;
    toast.error("Cannot Add Mod", errorMsg);
    console.error("Failed to add mod:", err);
  }
}

async function removeMod(modId: string) {
  if (isLinked.value) {
    toast.error(
      "Action Restricted",
      "Cannot remove mods from a linked modpack. Manage mods from the remote source."
    );
    return;
  }

  if (lockedModIds.value.has(modId)) {
    toast.error(
      "Mod Locked",
      "This mod is locked and cannot be removed. Unlock it first."
    );
    return;
  }

  // Check dependency impact before removing
  try {
    const impact = await window.api.modpacks.analyzeModRemovalImpact(props.modpackId, modId, "remove");

    // Only show dialog if there are actual visible items (mods that will break OR orphaned dependencies not used by others)
    const breakingMods = impact.dependentMods.filter(d => d.willBreak);
    const unusedOrphans = impact.orphanedDependencies.filter(d => !d.usedByOthers);

    if (breakingMods.length > 0 || unusedOrphans.length > 0) {
      // Show impact dialog
      dependencyImpact.value = { ...impact, action: "remove" };
      pendingModAction.value = { modId, action: "remove" };
      showDependencyImpactDialog.value = true;
      return;
    }

    // No impact, proceed directly
    await executeModRemoval(modId);
  } catch (err) {
    console.error("Failed to remove mod:", err);
  }
}

async function executeModRemoval(modId: string) {
  try {
    await window.api.modpacks.removeMod(props.modpackId, modId);
    await loadData();
    emit("update");
  } catch (err) {
    console.error("Failed to remove mod:", err);
    toast.error("Remove Failed", (err as Error).message);
  }
}

async function toggleModEnabled(modId: string) {
  // Check if mod is locked
  if (lockedModIds.value.has(modId)) {
    toast.error(
      "Mod Locked",
      "This mod is locked and cannot be enabled/disabled. Unlock it first."
    );
    return;
  }

  // Check if we're disabling (mod is currently enabled)
  const isCurrentlyEnabled = !disabledModIds.value.has(modId);

  if (isCurrentlyEnabled) {
    // We're about to disable - check dependency impact
    try {
      const impact = await window.api.modpacks.analyzeModRemovalImpact(props.modpackId, modId, "disable");

      if (impact.dependentMods.filter(d => d.willBreak).length > 0) {
        // Show impact dialog
        dependencyImpact.value = { ...impact, action: "disable" };
        pendingModAction.value = { modId, action: "disable" };
        showDependencyImpactDialog.value = true;
        return;
      }
    } catch (err) {
      console.error("Failed to check dependency impact:", err);
    }
  }

  // No impact or enabling, proceed
  await executeModToggle(modId);
}

async function executeModToggle(modId: string) {
  try {
    const result = await window.api.modpacks.toggleMod(props.modpackId, modId);
    if (result) {
      // Update local state immediately for responsive UI
      if (result.enabled) {
        disabledModIds.value.delete(modId);
        // If viewing disabled filter and enabling a mod, switch to "all" so it remains visible
        if (modsFilter.value === "disabled") {
          modsFilter.value = "all";
        }
      } else {
        disabledModIds.value.add(modId);
      }
      // Trigger reactivity
      disabledModIds.value = new Set(disabledModIds.value);
      // Refresh sync status to reflect enabled/disabled changes
      await refreshSyncStatus();
      // Refresh unsaved changes count
      await refreshUnsavedChangesCount();
      emit("update");
    }
  } catch (err) {
    console.error("Failed to toggle mod:", err);
    toast.error("Toggle Failed", (err as Error).message);
  }
}

async function toggleModLocked(modId: string) {
  const isCurrentlyLocked = lockedModIds.value.has(modId);
  const mod = currentMods.value.find(m => m.id === modId);
  const modName = mod?.name || modId;

  try {
    const result = await window.api.modpacks.setModLocked(props.modpackId, modId, !isCurrentlyLocked);
    if (result) {
      // Update local state immediately
      if (isCurrentlyLocked) {
        lockedModIds.value.delete(modId);
        toast.success("Mod Unlocked", `${modName} can now be modified`);
      } else {
        lockedModIds.value.add(modId);
        toast.success("Mod Locked", `${modName} is now protected from changes`);
      }
      // Trigger reactivity
      lockedModIds.value = new Set(lockedModIds.value);
      // Refresh unsaved changes count
      await refreshUnsavedChangesCount();
      emit("update");
    }
  } catch (err) {
    console.error("Failed to toggle mod lock:", err);
    toast.error("Lock Failed", (err as Error).message);
  }
}

// ========== MOD NOTES ==========
function openModNoteDialog(mod: Mod) {
  noteDialogMod.value = mod;
  noteDialogText.value = modNotes.value[mod.id] || "";
  showModNoteDialog.value = true;
}

async function saveModNote() {
  if (!noteDialogMod.value || !modpack.value) return;

  isSavingNote.value = true;
  try {
    const modId = noteDialogMod.value.id;
    const newNotes = { ...modNotes.value };

    if (noteDialogText.value.trim()) {
      newNotes[modId] = noteDialogText.value.trim();
    } else {
      delete newNotes[modId];
    }

    // Save to database
    await window.api.modpacks.update(props.modpackId, { mod_notes: newNotes });

    // Update local state
    modNotes.value = newNotes;

    // Refresh unsaved changes count for version history badge
    await refreshUnsavedChangesCount();

    toast.success("Note Saved", noteDialogText.value.trim()
      ? `Note saved for ${noteDialogMod.value.name}`
      : `Note removed from ${noteDialogMod.value.name}`);

    showModNoteDialog.value = false;
    noteDialogMod.value = null;
    noteDialogText.value = "";
  } catch (err) {
    console.error("Failed to save mod note:", err);
    toast.error("Save Failed", (err as Error).message);
  } finally {
    isSavingNote.value = false;
  }
}

function closeModNoteDialog() {
  showModNoteDialog.value = false;
  noteDialogMod.value = null;
  noteDialogText.value = "";
}

function getModNote(modId: string): string | undefined {
  return modNotes.value[modId];
}

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

function toggleSelect(modId: string) {
  const newSet = new Set(selectedModIds.value);
  if (newSet.has(modId)) {
    newSet.delete(modId);
  } else {
    newSet.add(modId);
  }
  selectedModIds.value = newSet;
}

function selectAll() {
  const newSet = new Set(selectedModIds.value);
  for (const mod of filteredInstalledMods.value) {
    newSet.add(mod.id!);
  }
  selectedModIds.value = newSet;
}

// Select all enabled mods (excludes disabled and locked)
function selectAllEnabled() {
  const enabledUnlockedMods = filteredInstalledMods.value.filter(
    mod => !disabledModIds.value.has(mod.id!) && !lockedModIds.value.has(mod.id!)
  );

  const newSet = new Set<string>();
  for (const mod of enabledUnlockedMods) {
    newSet.add(mod.id!);
  }
  selectedModIds.value = newSet;
}

// Select half of enabled mods (excludes disabled and locked)
function selectHalfEnabled() {
  const enabledUnlockedMods = filteredInstalledMods.value.filter(
    mod => !disabledModIds.value.has(mod.id!) && !lockedModIds.value.has(mod.id!)
  );

  if (enabledUnlockedMods.length === 0) {
    return;
  }

  const halfCount = Math.ceil(enabledUnlockedMods.length / 2);
  const modsToSelect = enabledUnlockedMods.slice(0, halfCount);

  const newSet = new Set<string>();
  for (const mod of modsToSelect) {
    newSet.add(mod.id!);
  }
  selectedModIds.value = newSet;
}

// Select all disabled mods (excludes locked)
function selectAllDisabled() {
  const disabledUnlockedMods = filteredInstalledMods.value.filter(
    mod => disabledModIds.value.has(mod.id!) && !lockedModIds.value.has(mod.id!)
  );

  const newSet = new Set<string>();
  for (const mod of disabledUnlockedMods) {
    newSet.add(mod.id!);
  }
  selectedModIds.value = newSet;
}

// Select half of disabled mods (excludes locked)
function selectHalfDisabled() {
  const disabledUnlockedMods = filteredInstalledMods.value.filter(
    mod => disabledModIds.value.has(mod.id!) && !lockedModIds.value.has(mod.id!)
  );

  if (disabledUnlockedMods.length === 0) {
    return;
  }

  const halfCount = Math.ceil(disabledUnlockedMods.length / 2);
  const modsToSelect = disabledUnlockedMods.slice(0, halfCount);

  const newSet = new Set<string>();
  for (const mod of modsToSelect) {
    newSet.add(mod.id!);
  }
  selectedModIds.value = newSet;
}

function clearSelection() {
  selectedModIds.value = new Set();
}

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

// Confirm action after dependency impact warning
async function confirmDependencyImpactAction() {
  showDependencyImpactDialog.value = false;

  if (!pendingModAction.value) return;

  const { modId, action } = pendingModAction.value;

  if (action === "remove") {
    await executeModRemoval(modId);
  } else {
    await executeModToggle(modId);
  }

  pendingModAction.value = null;
  dependencyImpact.value = null;
}

function cancelDependencyImpactAction() {
  showDependencyImpactDialog.value = false;
  pendingModAction.value = null;
  dependencyImpact.value = null;
}

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

function toggleSort(field: "name" | "version" | "date") {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = field;
    // Default to descending for date (newest first), ascending for others
    sortDir.value = field === "date" ? "desc" : "asc";
  }
}

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

// Game log listener cleanup
let removeLogListener: (() => void) | null = null;

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
      } catch (err) {
        console.error("[ModpackEditor] Error during initial load:", err);
        loadError.value = (err as Error).message || "Failed to load modpack data";
      }

      // Pre-fetch loader versions for settings tab
      if (editForm.value.minecraft_version && editForm.value.loader) {
        fetchLoaderVersions();
      }

      // Set up game log listener (wrapped to prevent crashes)
      removeLogListener = onGameLogLine((instanceId, logLine) => {
        if (instance.value && instanceId === instance.value.id) {
          gameLogs.value.push({
            time: logLine.time,
            level: logLine.level,
            message: logLine.message
          });
          // Keep only last maxLogLines
          if (gameLogs.value.length > maxLogLines) {
            gameLogs.value = gameLogs.value.slice(-maxLogLines);
          }
        }
      });

      // Check for mod updates only on initial open
      setTimeout(() => {
        if (!hasCheckedUpdatesOnOpen.value) {
          hasCheckedUpdatesOnOpen.value = true;
          checkAllUpdates();
        }
      }, 500);
    } else {
      // Cleanup on close
      if (removeLogListener) {
        removeLogListener();
        removeLogListener = null;
      }
      gameLogs.value = [];
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
onUnmounted(() => {
  if (removeLogListener) {
    removeLogListener();
    removeLogListener = null;
  }
});
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
        <AlertCircle class="w-8 h-8 text-destructive" />
      </div>
      <div class="text-center">
        <h3 class="text-lg font-semibold text-foreground mb-2">Errore di Caricamento</h3>
        <p class="text-sm text-muted-foreground mb-4">{{ loadError }}</p>
      </div>
      <div class="flex gap-3">
        <Button variant="outline" @click="$emit('close')">
          <X class="w-4 h-4 mr-2" />
          Chiudi
        </Button>
        <Button @click="loadError = null; loadData()">
          <RefreshCw class="w-4 h-4 mr-2" />
          Riprova
        </Button>
      </div>
    </div>

    <!-- Main Content (only show if no error) -->
    <div v-else
      :class="fullScreen
        ? 'flex-1 flex flex-col overflow-hidden'
        : 'bg-background border border-border/50 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150'">

      <!-- Modern Header -->
      <div class="shrink-0 relative bg-card/50" :class="fullScreen && 'border-b border-border/40'">
        <!-- Content -->
        <div class="px-4 sm:px-6 py-4 sm:py-5">
          <div class="flex items-center gap-4">
            <!-- Back Button (full-screen mode only) -->
            <Button v-if="fullScreen" variant="ghost" size="sm"
              class="h-9 w-9 p-0 rounded-xl shrink-0 hover:bg-muted/60" @click="$emit('close')">
              <ArrowLeft class="w-4 h-4" />
            </Button>

            <!-- Pack Thumbnail -->
            <div v-if="modpack?.image_url"
              class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden ring-2 ring-primary/30 shadow-lg shadow-primary/10 shrink-0">
              <img :src="modpack.image_url.startsWith('http') ||
                modpack.image_url.startsWith('file:')
                ? modpack.image_url
                : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
                " class="w-full h-full object-cover" />
            </div>
            <div v-else
              class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 flex items-center justify-center ring-2 ring-primary/20 shrink-0">
              <Package class="w-6 h-6 text-primary" />
            </div>

            <!-- Name & Meta -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h2 class="text-lg sm:text-xl font-bold truncate text-foreground tracking-tight">
                  {{ modpack?.name || "Loading..." }}
                </h2>
                <span v-if="modpack?.version"
                  class="hidden sm:inline text-xs px-2.5 py-1 rounded-lg bg-muted/80 text-muted-foreground font-mono border border-border/40">
                  v{{ modpack.version }}
                </span>
                <span v-if="modpack?.remote_source?.url"
                  class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                  title="This modpack is linked to a remote source">
                  <Share2 class="w-3 h-3" />
                  Linked
                </span>
              </div>

              <!-- Stats Row -->
              <div class="flex items-center gap-2 flex-wrap">
                <div v-if="modpack?.minecraft_version"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
                  <div class="w-2 h-2 rounded-full bg-primary"></div>
                  <span class="text-xs font-semibold text-primary">{{ modpack.minecraft_version }}</span>
                </div>
                <div v-if="modpack?.loader"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/40">
                  <div class="w-2 h-2 rounded-full bg-muted-foreground/60"></div>
                  <span class="text-xs font-medium text-muted-foreground capitalize">{{ modpack.loader }}</span>
                </div>
                <div
                  class="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/30">
                  <Layers class="w-3.5 h-3.5 text-muted-foreground" />
                  <span class="text-xs font-medium text-muted-foreground">{{ currentMods.length }} mods</span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" class="hidden sm:flex h-9 w-9 p-0 rounded-xl hover:bg-muted/60"
                @click="selectImage" title="Set cover image">
                <ImagePlus class="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm"
                class="hidden md:flex h-9 px-4 gap-2 rounded-xl border-border/50 hover:bg-muted/60"
                @click="$emit('export')">
                <Download class="w-4 h-4" />
                <span class="font-medium">Export</span>
              </Button>
              <!-- Close button (modal mode only) -->
              <Button v-if="!fullScreen" variant="ghost" size="sm"
                class="h-9 w-9 p-0 rounded-xl hover:bg-destructive/10 hover:text-destructive" @click="$emit('close')">
                <X class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Remote Update Banner -->
        <div v-if="updateResult?.hasUpdate" class="px-3 sm:px-6 pb-3 sm:pb-4">
          <UpdateAvailableBanner :current-version="modpack?.version || 'unknown'" :new-version="updateResult.remoteManifest?.modpack.version || 'unknown'
            " :is-checking="isCheckingUpdate" @update="showReviewDialog = true" />
        </div>

        <!-- Tab Navigation - Centered with More dropdown -->
        <div class="px-3 sm:px-6 pb-3 sm:pb-4 flex justify-center">
          <div class="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/30">
            <!-- Primary Tabs -->
            <button class="tab-pill"
              :class="activeTab === 'play' ? 'tab-pill-active tab-pill-game' : 'tab-pill-inactive'"
              @click="activeTab = 'play'">
              <Gamepad2 class="w-3.5 h-3.5" />
              <span>Game</span>
              <span v-if="isGameRunning" class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            </button>
            <button class="tab-pill" :class="activeTab === 'mods' ? 'tab-pill-active' : 'tab-pill-inactive'"
              @click="activeTab = 'mods'">
              <Layers class="w-3.5 h-3.5" />
              <span>Mods</span>
            </button>
            <button class="tab-pill" :class="activeTab === 'configs' ? 'tab-pill-active' : 'tab-pill-inactive'"
              @click="activeTab = 'configs'">
              <FileCode class="w-3.5 h-3.5" />
              <span>Configs</span>
            </button>
            <button class="tab-pill" :class="activeTab === 'settings' ? 'tab-pill-active' : 'tab-pill-inactive'"
              @click="activeTab = 'settings'">
              <Settings class="w-3.5 h-3.5" />
              <span>Details</span>
            </button>

            <!-- More dropdown for secondary tabs -->
            <div class="relative">
              <button class="tab-pill" :class="isSecondaryTab ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="showMoreMenu = !showMoreMenu">
                <MoreHorizontal class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">More</span>
                <span v-if="versionUnsavedCount > 0 && !isSecondaryTab"
                  class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <ChevronDown class="w-3 h-3 transition-transform" :class="showMoreMenu ? 'rotate-180' : ''" />
              </button>

              <!-- Dropdown menu - higher z-index -->
              <Transition name="fade">
                <div v-if="showMoreMenu"
                  class="absolute top-full right-0 mt-1 w-44 bg-popover border border-border rounded-lg shadow-xl z-[100] py-1 overflow-hidden">
                  <button
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors"
                    :class="activeTab === 'discover' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'discover'; showMoreMenu = false">
                    <Sparkles class="w-4 h-4" />
                    Add Mods
                  </button>
                  <button
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors"
                    :class="activeTab === 'health' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'health'; showMoreMenu = false">
                    <Stethoscope class="w-4 h-4" />
                    Diagnostics
                  </button>
                  <button
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors"
                    :class="activeTab === 'versions' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'versions'; showMoreMenu = false">
                    <GitBranch class="w-4 h-4" />
                    History
                    <span v-if="versionUnsavedCount > 0"
                      class="ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {{ versionUnsavedCount }}
                    </span>
                  </button>
                  <button
                    class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors"
                    :class="activeTab === 'remote' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                    @click="activeTab = 'remote'; showMoreMenu = false">
                    <Globe class="w-4 h-4" />
                    Cloud Sync
                  </button>
                </div>
              </Transition>

              <!-- Backdrop to close dropdown -->
              <div v-if="showMoreMenu" class="fixed inset-0 z-[99]" @click="showMoreMenu = false"></div>
            </div>
          </div>
        </div>

        <!-- Bottom border -->
        <div
          class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent">
        </div>
      </div>

      <!-- Help Guide Banner (collapsible) - Hidden on mobile -->
      <div class="hidden sm:block shrink-0 border-b border-border/30">
        <!-- Help Toggle Button -->
        <button @click="showHelp = !showHelp"
          class="w-full px-3 sm:px-6 py-2 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors">
          <div class="flex items-center gap-2">
            <HelpCircle class="w-4 h-4 text-primary" />
            <span class="text-muted-foreground">
              <span class="font-medium text-foreground">Need help?</span>
              <span class="hidden sm:inline"> Click to see how to use this section</span>
            </span>
          </div>
          <ChevronDown :class="['w-4 h-4 text-muted-foreground transition-transform', showHelp && 'rotate-180']" />
        </button>

        <!-- Help Content (expanded) -->
        <div v-if="showHelp" class="px-3 sm:px-6 pb-4 pt-2 bg-muted/20 border-t border-border/20">
          <!-- Play Tab Help -->
          <div v-if="activeTab === 'play'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Play class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-foreground mb-2">Play - Launch Your Modpack</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Create an isolated game instance and launch Minecraft with your modpack.
                </p>
                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <Gamepad2 class="w-4 h-4 text-primary" />
                      Instance System
                    </h5>
                    <p class="text-muted-foreground">Each modpack has its own isolated instance with separate mods,
                      configs, and saves.</p>
                  </div>
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <RefreshCw class="w-4 h-4 text-primary" />
                      Auto-Sync
                    </h5>
                    <p class="text-muted-foreground">Keep your instance updated with the latest modpack changes
                      automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Configs Tab Help -->
          <div v-else-if="activeTab === 'configs'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileCode class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-foreground mb-2">Configs - Edit Game Settings</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Browse and edit configuration files for your mods directly from ModEx.
                </p>

                <!-- Understanding Config Locations -->
                <div class="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <h5 class="font-medium text-blue-400 flex items-center gap-1.5 mb-2">
                    <Info class="w-4 h-4" />
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
                    <FolderSync class="w-4 h-4" />
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
                      <FileEdit class="w-4 h-4 text-primary" />
                      Structured Editor
                    </h5>
                    <p class="text-muted-foreground">Edit TOML, JSON, and properties files with a friendly interface.
                    </p>
                  </div>
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <FolderOpen class="w-4 h-4 text-primary" />
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
                <BookOpen class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
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
                <BookOpen class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
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
                <Stethoscope class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
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
                <BookOpen class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
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
                <BookOpen class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Use GitHub Gist to host your manifest for free sharing with friends!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Settings Tab Help -->
          <div v-else-if="activeTab === 'settings'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-4 h-4 text-primary" />
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
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
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
        <!-- PLAY TAB -->
        <template v-if="activeTab === 'play'">
          <!-- Play Tab - Clean Minimal Design -->
          <div class="flex-1 overflow-y-auto">
            <!-- No Instance State -->
            <div v-if="!instance" class="flex items-center justify-center h-full p-6">
              <div class="text-center max-w-sm">
                <div class="w-16 h-16 mx-auto mb-5 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Gamepad2 class="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 class="text-lg font-semibold mb-2">Create Game Instance</h3>
                <p class="text-sm text-muted-foreground mb-6 leading-relaxed">
                  Set up an isolated game environment to play this modpack with {{ modpackMods.length }} mods.
                </p>

                <!-- Quick Info -->
                <div class="flex items-center justify-center gap-4 mb-6 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1.5">
                    <Package class="w-3.5 h-3.5" />
                    {{ modpack?.minecraft_version }}
                  </span>
                  <span class="flex items-center gap-1.5 capitalize">
                    <Sparkles class="w-3.5 h-3.5" />
                    {{ modpack?.loader }}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <Layers class="w-3.5 h-3.5" />
                    {{ modpackMods.length }} mods
                  </span>
                </div>

                <button @click="handleCreateInstance" :disabled="isCreatingInstance"
                  class="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  <Loader2 v-if="isCreatingInstance" class="w-4 h-4 animate-spin" />
                  <Play v-else class="w-4 h-4" />
                  {{ isCreatingInstance ? 'Creating...' : 'Create Instance' }}
                </button>
              </div>
            </div>

            <!-- Instance Ready State -->
            <div v-else class="p-4 space-y-4">
              <!-- Main Launch Section -->
              <div class="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
                <div class="p-5 flex items-center gap-5">
                  <!-- Play Button -->
                  <button @click="handleLaunch()" :disabled="instance.state !== 'ready' || isLaunching || isGameRunning"
                    class="play-button" :class="{ 'play-button-active': isGameRunning }">
                    <Loader2 v-if="isLaunching" class="w-7 h-7 animate-spin" />
                    <Gamepad2 v-else-if="isGameRunning" class="w-7 h-7" />
                    <Play v-else class="w-7 h-7" />
                  </button>

                  <!-- Status -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-semibold">
                        {{ isGameRunning
                          ? (runningGame?.gameProcessRunning ? 'Game Running' : 'Launching...')
                          : isLaunching ? 'Starting...' : 'Ready to Play' }}
                      </h3>
                      <span v-if="isGameRunning && runningGame?.gameProcessRunning"
                        class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse"></span>
                        LIVE
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{{ instanceStats?.modCount || 0 }} mods</span>
                      <span>•</span>
                      <span>{{ modpack?.loader }} {{ modpack?.minecraft_version }}</span>
                    </div>

                    <!-- First Launch Notice -->
                    <div v-if="!isGameRunning && !isLaunching && !instance?.lastPlayed"
                      class="mt-2 text-xs text-primary flex items-center gap-1.5">
                      <Info class="w-3.5 h-3.5" />
                      {{ modpack?.loader }} will be installed on first launch
                    </div>

                    <!-- Launch Progress -->
                    <div v-if="loaderProgress && isLaunching" class="mt-2 text-xs text-muted-foreground">
                      <span>{{ loaderProgress.stage }}</span>
                      <span v-if="loaderProgress.total > 0" class="text-foreground ml-1">
                        {{ loaderProgress.current }}/{{ loaderProgress.total }}
                      </span>
                    </div>

                    <!-- Running Actions -->
                    <div v-if="isGameRunning" class="flex items-center gap-2 mt-3">
                      <button @click="handleKillGame"
                        class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors">
                        <X class="w-3.5 h-3.5" />
                        {{ runningGame?.gameProcessRunning ? 'Stop' : 'Cancel' }}
                      </button>
                      <button v-if="runningGame?.gameProcessRunning" @click="showLogConsole = !showLogConsole"
                        class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-muted hover:bg-muted/80 transition-colors">
                        <Terminal class="w-3.5 h-3.5" />
                        {{ showLogConsole ? 'Hide' : 'Logs' }}
                      </button>
                    </div>
                  </div>

                  <!-- Quick Actions -->
                  <div class="flex items-center gap-1">
                    <button @click="openInstanceSettings()"
                      class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Settings">
                      <Sliders class="w-4 h-4" />
                    </button>
                    <button @click="handleOpenInstanceFolder()"
                      class="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Open Folder">
                      <FolderOpen class="w-4 h-4" />
                    </button>
                    <button @click="showDeleteInstanceDialog = true"
                      class="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete Instance">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Log Console -->
                <div v-if="showLogConsole && isGameRunning" class="border-t border-border/50">
                  <div class="px-4 py-2 bg-muted/30 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Terminal class="w-3.5 h-3.5 text-muted-foreground" />
                      <span class="text-xs font-medium">Console</span>
                      <div class="flex items-center gap-0.5 ml-2">
                        <button @click="logLevelFilter = 'all'"
                          class="px-1.5 py-0.5 text-[10px] rounded transition-colors"
                          :class="logLevelFilter === 'all' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'">All</button>
                        <button @click="logLevelFilter = 'info'"
                          class="px-1.5 py-0.5 text-[10px] rounded transition-colors"
                          :class="logLevelFilter === 'info' ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:text-foreground'">Info</button>
                        <button @click="logLevelFilter = 'warn'"
                          class="px-1.5 py-0.5 text-[10px] rounded transition-colors"
                          :class="logLevelFilter === 'warn' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'">Warn</button>
                        <button @click="logLevelFilter = 'error'"
                          class="px-1.5 py-0.5 text-[10px] rounded transition-colors"
                          :class="logLevelFilter === 'error' ? 'bg-red-500/20 text-red-400' : 'text-muted-foreground hover:text-foreground'">Error</button>
                      </div>
                    </div>
                    <button @click="gameLogs = []; logLevelFilter = 'all'"
                      class="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                  </div>
                  <div ref="logScrollRef" class="h-40 overflow-y-auto bg-black/40 p-2 font-mono text-[11px] space-y-px">
                    <div v-if="filteredGameLogs.length === 0" class="text-muted-foreground text-center py-4 text-xs">
                      {{ gameLogs.length === 0 ? 'Waiting for logs...' : 'No logs match filter' }}
                    </div>
                    <div v-for="(log, idx) in filteredGameLogs" :key="idx" class="flex gap-2 leading-relaxed">
                      <span class="text-muted-foreground/60 shrink-0">{{ log.time }}</span>
                      <span class="shrink-0 font-medium w-12" :class="{
                        'text-blue-400': log.level === 'INFO',
                        'text-amber-400': log.level === 'WARN' || log.level === 'WARNING',
                        'text-red-400': log.level === 'ERROR' || log.level === 'FATAL' || log.level === 'SEVERE',
                        'text-muted-foreground/50': log.level === 'DEBUG' || log.level === 'TRACE'
                      }">{{ log.level }}</span>
                      <span class="text-foreground/80 break-all">{{ log.message }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Sync Status -->
              <div v-if="instanceSyncStatus?.needsSync"
                class="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div class="p-4 flex items-center gap-3">
                  <AlertTriangle class="w-4 h-4 text-amber-400 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium">Changes not synced</span>
                    <span class="text-xs text-muted-foreground ml-2">
                      {{ instanceSyncStatus.totalDifferences }} difference{{ instanceSyncStatus.totalDifferences > 1 ?
                      's' : '' }}
                    </span>
                  </div>
                  <button @click="showSyncDetails = !showSyncDetails"
                    class="p-1.5 rounded hover:bg-amber-500/10 text-muted-foreground">
                    <ChevronDown class="w-4 h-4 transition-transform" :class="{ 'rotate-180': showSyncDetails }" />
                  </button>
                  <button @click="handleSyncInstance" :disabled="isSyncingInstance"
                    class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <Loader2 v-if="isSyncingInstance" class="w-3 h-3 animate-spin" />
                    <RefreshCw v-else class="w-3 h-3" />
                    {{ isSyncingInstance ? 'Syncing...' : 'Sync' }}
                  </button>
                </div>

                <!-- Sync Details -->
                <div v-if="showSyncDetails" class="px-4 pb-4 space-y-3 border-t border-amber-500/20 pt-3">
                  <!-- Missing in Instance -->
                  <div v-if="instanceSyncStatus.missingInInstance.length > 0"
                    class="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                    <div class="flex items-center gap-2 text-primary font-medium text-xs mb-2">
                      <Plus class="w-3.5 h-3.5" />
                      {{ instanceSyncStatus.missingInInstance.length }} files to add
                    </div>
                    <div class="space-y-1 max-h-28 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.missingInInstance" :key="item.filename"
                        class="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] uppercase">{{
                          item.type }}</span>
                        <span class="truncate">{{ item.filename }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Extra Mods in Instance (will be REMOVED) -->
                  <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length > 0"
                    class="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div class="flex items-center gap-2 text-red-400 font-medium text-xs mb-2">
                      <Trash2 class="w-3.5 h-3.5" />
                      {{instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod').length}} mods to remove
                    </div>
                    <p class="text-[11px] text-muted-foreground mb-2">
                      These mods are not in the modpack and will be removed during sync.
                    </p>
                    <div class="space-y-1 max-h-28 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.extraInInstance.filter(i => i.type === 'mod')"
                        :key="item.filename" class="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] uppercase">{{
                          item.type }}</span>
                        <span class="truncate">{{ item.filename }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Extra Resourcepacks/Shaders in Instance (will be preserved) -->
                  <div v-if="instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length > 0"
                    class="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div class="flex items-center gap-2 text-muted-foreground font-medium text-xs mb-2">
                      <FileWarning class="w-3.5 h-3.5" />
                      {{instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod').length}} additional files
                    </div>
                    <p class="text-[11px] text-muted-foreground mb-2">
                      These files were added manually and will be preserved.
                    </p>
                    <div class="space-y-1 max-h-28 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.extraInInstance.filter(i => i.type !== 'mod')"
                        :key="item.filename" class="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 text-[10px] uppercase">{{
                          item.type }}</span>
                        <span class="truncate">{{ item.filename }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Loader Version Mismatch -->
                  <div v-if="instanceSyncStatus.loaderVersionMismatch"
                    class="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div class="flex items-center gap-2 text-blue-400 font-medium text-xs mb-1">
                      <RefreshCw class="w-3.5 h-3.5" />
                      Loader version update
                    </div>
                    <div class="text-[11px] text-muted-foreground space-y-0.5">
                      <p>Instance: <span class="text-foreground font-medium">{{ instance?.loaderVersion || 'unknown'
                          }}</span></p>
                      <p>Modpack: <span class="text-blue-400 font-medium">{{
                        extractLoaderVersion(modpack?.loader_version ||
                          'unknown') }}</span></p>
                      <p class="text-blue-400/80 mt-1">New loader will be installed on next launch.</p>
                    </div>
                  </div>

                  <!-- Disabled State Mismatch -->
                  <div v-if="instanceSyncStatus.disabledMismatch.length > 0"
                    class="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div class="flex items-center gap-2 text-muted-foreground font-medium text-xs mb-2">
                      <FileWarning class="w-3.5 h-3.5" />
                      {{ instanceSyncStatus.disabledMismatch.length }} state mismatches
                    </div>
                    <div class="space-y-1 max-h-28 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.disabledMismatch" :key="item.filename"
                        class="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span class="truncate flex-1">{{ item.filename }}</span>
                        <span class="text-muted-foreground/70 text-[10px]">{{ item.issue }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Sync Mode -->
                  <div class="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div class="text-xs font-medium mb-2">Sync Mode</div>
                    <div class="flex gap-1.5 flex-wrap">
                      <button @click="selectedSyncMode = 'new_only'"
                        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" :class="selectedSyncMode === 'new_only'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Only New Files
                      </button>
                      <button @click="selectedSyncMode = 'overwrite'"
                        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" :class="selectedSyncMode === 'overwrite'
                          ? 'bg-amber-500 text-white'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Overwrite All
                      </button>
                      <button @click="selectedSyncMode = 'skip'"
                        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" :class="selectedSyncMode === 'skip'
                          ? 'bg-zinc-600 text-white'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Skip Existing
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- In Sync Badge -->
              <div v-else-if="instanceSyncStatus && !instanceSyncStatus.needsSync"
                class="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
                <Check class="w-4 h-4 text-primary" />
                <div class="flex-1">
                  <span class="text-sm font-medium text-primary">Instance In Sync</span>
                  <span v-if="instanceSyncStatus.extraInInstance.length > 0" class="text-xs text-muted-foreground ml-2">
                    • {{ instanceSyncStatus.extraInInstance.length }} additional files
                  </span>
                </div>
              </div>

              <!-- Quick Access Grid -->
              <div class="grid grid-cols-4 gap-2">
                <button @click="handleOpenInstanceFolder('mods')"
                  class="p-3 rounded-xl bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30 text-center transition-all group">
                  <Layers
                    class="w-4 h-4 mx-auto mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div class="text-xs font-medium">Mods</div>
                  <div class="text-[10px] text-muted-foreground">{{ instanceStats?.modCount || 0 }}</div>
                </button>
                <button @click="handleOpenInstanceFolder('config')"
                  class="p-3 rounded-xl bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30 text-center transition-all group">
                  <FileCode
                    class="w-4 h-4 mx-auto mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div class="text-xs font-medium">Config</div>
                  <div class="text-[10px] text-muted-foreground">Settings</div>
                </button>
                <button @click="handleOpenInstanceFolder('resourcepacks')"
                  class="p-3 rounded-xl bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30 text-center transition-all group">
                  <Image
                    class="w-4 h-4 mx-auto mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div class="text-xs font-medium">Packs</div>
                  <div class="text-[10px] text-muted-foreground">Textures</div>
                </button>
                <button @click="handleOpenInstanceFolder('saves')"
                  class="p-3 rounded-xl bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30 text-center transition-all group">
                  <Save
                    class="w-4 h-4 mx-auto mb-1.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div class="text-xs font-medium">Saves</div>
                  <div class="text-[10px] text-muted-foreground">Worlds</div>
                </button>
              </div>

              <!-- Instance Details Card -->
              <div class="rounded-xl border border-border/50 bg-card/50 p-4">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    <Gamepad2 class="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">{{ instance.name }}</div>
                    <div class="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span class="flex items-center gap-1">
                        <Clock class="w-3 h-3" />
                        {{ formatPlayDate(instance.lastPlayed) }}
                      </span>
                      <span class="flex items-center gap-1">
                        <HardDrive class="w-3 h-3" />
                        {{ instanceStats?.totalSize || '...' }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Settings -->
                <div class="space-y-3 pt-4 border-t border-border/50">
                  <div class="flex items-center justify-between">
                    <span class="text-sm">Auto-sync before launch</span>
                    <button @click="toggleAutoSync" class="relative w-9 h-5 rounded-full transition-colors"
                      :class="syncSettings.autoSyncEnabled ? 'bg-primary' : 'bg-muted'">
                      <span
                        class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                        :class="{ 'translate-x-4': syncSettings.autoSyncEnabled }" />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-sm">Confirm before sync</span>
                    <button @click="toggleSyncConfirmation" class="relative w-9 h-5 rounded-full transition-colors"
                      :class="syncSettings.showConfirmation ? 'bg-primary' : 'bg-muted'">
                      <span
                        class="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                        :class="{ 'translate-x-4': syncSettings.showConfirmation }" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- CONFIGS TAB -->
        <template v-else-if="activeTab === 'configs'">
          <div class="flex-1 overflow-hidden flex flex-col">
            <div v-if="!instance" class="flex flex-col items-center justify-center h-full gap-4 p-6">
              <FileCode class="w-16 h-16 text-muted-foreground/50" />
              <div class="text-center">
                <h3 class="font-semibold text-lg">No Instance Found</h3>
                <p class="text-sm text-muted-foreground">Create an instance in the Play tab to manage configs</p>
              </div>
              <button @click="activeTab = 'play'"
                class="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
                Go to Play Tab
              </button>
            </div>

            <template v-else>
              <!-- Modified Configs Banner -->
              <div v-if="importableConfigs.length > 0"
                class="shrink-0 m-4 mb-0 rounded-lg bg-primary/5 border border-primary/20 overflow-hidden">
                <button @click="showModifiedConfigsDetails = !showModifiedConfigsDetails"
                  class="w-full p-3 flex items-center justify-between hover:bg-primary/5 transition-colors duration-150">
                  <div class="flex items-center gap-3">
                    <FolderSync class="w-4 h-4 text-primary" />
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
                      <Loader2 v-if="isImportingConfigs" class="w-3.5 h-3.5 animate-spin" />
                      <Download v-else class="w-3.5 h-3.5" />
                      Import Selected
                    </button>
                    <ChevronDown class="w-4 h-4 text-primary transition-transform duration-150"
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
                    <Info class="w-3.5 h-3.5 shrink-0 mt-0.5" />
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
                  <Layers class="w-3.5 h-3.5" />
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
                  <Image class="w-3.5 h-3.5" />
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
                  <Sparkles class="w-3.5 h-3.5" />
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
                    <AlertCircle class="w-3 h-3" />
                    {{ incompatibleModCount }}
                  </button>
                  <!-- Updates available (most actionable) -->
                  <button v-if="updatesAvailableCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'updates'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'updates'" title="Updates available">
                    <ArrowUpCircle class="w-3 h-3" />
                    {{ updatesAvailableCount }}
                  </button>
                  <!-- Disabled mods -->
                  <button v-if="disabledModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'disabled'
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'disabled'" title="Disabled mods">
                    <ToggleLeft class="w-3 h-3" />
                    {{ disabledModCount }}
                  </button>
                  <!-- Overflow: Less common filters in dropdown -->
                  <div
                    v-if="warningModCount > 0 || lockedModCount > 0 || modsWithNotesCount > 0 || recentlyUpdatedCount > 0 || recentlyAddedCount > 0"
                    class="relative">
                    <button
                      class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      @click="showModsFilterMenu = !showModsFilterMenu">
                      <MoreHorizontal class="w-3 h-3" />
                    </button>
                    <div v-if="showModsFilterMenu"
                      class="absolute top-full right-0 mt-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                      <button v-if="warningModCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'text-foreground'"
                        @click="modsFilter = 'warning'; showModsFilterMenu = false">
                        <AlertTriangle class="w-3 h-3" />
                        Warnings ({{ warningModCount }})
                      </button>
                      <button v-if="lockedModCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'locked' ? 'bg-amber-500/10 text-amber-400' : 'text-foreground'"
                        @click="modsFilter = 'locked'; showModsFilterMenu = false">
                        <Lock class="w-3 h-3" />
                        Locked ({{ lockedModCount }})
                      </button>
                      <button v-if="modsWithNotesCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'with-notes' ? 'bg-blue-500/10 text-blue-400' : 'text-foreground'"
                        @click="modsFilter = 'with-notes'; showModsFilterMenu = false">
                        <MessageSquare class="w-3 h-3" />
                        With Notes ({{ modsWithNotesCount }})
                      </button>
                      <div
                        v-if="(warningModCount > 0 || lockedModCount > 0 || modsWithNotesCount > 0) && (recentlyUpdatedCount > 0 || recentlyAddedCount > 0)"
                        class="h-px bg-border my-1"></div>
                      <button v-if="recentlyUpdatedCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'recent-updated' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                        @click="modsFilter = 'recent-updated'; showModsFilterMenu = false">
                        <Check class="w-3 h-3" />
                        Just Updated ({{ recentlyUpdatedCount }})
                      </button>
                      <button v-if="recentlyAddedCount > 0"
                        class="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
                        :class="modsFilter === 'recent-added' ? 'bg-primary/10 text-primary' : 'text-foreground'"
                        @click="modsFilter = 'recent-added'; showModsFilterMenu = false">
                        <Plus class="w-3 h-3" />
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
                  <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isCheckingAllUpdates }" />
                  <span>{{ isCheckingAllUpdates ? 'Checking...' : 'Check Updates' }}</span>
                </button>

                <!-- Library Toggle -->
                <button @click="isLibraryCollapsed = !isLibraryCollapsed"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all" :class="!isLibraryCollapsed
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'">
                  <Package class="w-3.5 h-3.5" />
                  <span>Library</span>
                </button>

                <!-- CurseForge Button -->
                <button v-if="!isLinked"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm"
                  @click="showCFSearch = true">
                  <Globe class="w-3.5 h-3.5" />
                  <span>CurseForge</span>
                </button>
              </div>
            </div>

            <!-- Secondary bar: Bulk actions & Update All -->
            <div v-if="selectedModIds.size > 0 || updatesAvailableCount > 0 || incompatibleModCount > 0"
              class="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
              <!-- Bulk Actions -->
              <div v-if="selectedModIds.size > 0 && !isLinked" class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground">{{ selectedModIds.size }} selected</span>
                <button
                  class="h-6 px-2 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
                  @click="bulkEnableSelected">
                  <ToggleRight class="w-3 h-3" />
                  Enable
                </button>
                <button
                  class="h-6 px-2 text-[10px] rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 flex items-center gap-1"
                  @click="bulkDisableSelected">
                  <ToggleLeft class="w-3 h-3" />
                  Disable
                </button>
                <button
                  class="h-6 px-2 text-[10px] rounded bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 flex items-center gap-1"
                  @click="bulkLockSelected">
                  <Lock class="w-3 h-3" />
                  Lock
                </button>
                <button
                  class="h-6 px-2 text-[10px] rounded bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 flex items-center gap-1"
                  @click="bulkUnlockSelected">
                  <LockOpen class="w-3 h-3" />
                  Unlock
                </button>
                <button
                  class="h-6 px-2 text-[10px] rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-1"
                  @click="removeSelectedMods">
                  <Trash2 class="w-3 h-3" />
                  Remove
                </button>
              </div>
              <div v-else class="flex-1"></div>

              <!-- Action Buttons -->
              <div class="flex items-center gap-2">
                <button v-if="updatesAvailableCount > 0 && !isLinked"
                  class="h-6 text-[10px] px-2.5 rounded flex items-center gap-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                  @click="updateAllMods">
                  <ArrowUpCircle class="w-3 h-3" />
                  Update All ({{ updatesAvailableCount }})
                </button>
                <button v-if="incompatibleModCount > 0 && !isLinked"
                  class="h-6 text-[10px] px-2.5 rounded flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
                  @click="removeIncompatibleMods">
                  <Trash2 class="w-3 h-3" />
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
                      <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                      <input v-model="searchQueryInstalled" placeholder="Search resources..."
                        class="w-full h-8 pl-9 pr-8 text-sm rounded-lg bg-background/80 border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50" />
                      <button v-if="searchQueryInstalled" @click="searchQueryInstalled = ''"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <X class="w-3.5 h-3.5" />
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
                          <Layers v-if="mod.content_type === 'mod' || !mod.content_type" class="w-4 h-4" />
                          <Image v-else-if="mod.content_type === 'resourcepack'" class="w-4 h-4" />
                          <Sparkles v-else class="w-4 h-4" />
                        </div>
                      </div>
                      <!-- Selection indicator overlay -->
                      <div v-if="selectedModIds.has(mod.id)"
                        class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                        <Check class="w-2.5 h-2.5 text-primary-foreground" />
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
                            <ArrowUpCircle class="w-2.5 h-2.5" />
                            Updated
                          </span>
                          <span v-else-if="recentlyAddedMods.has(mod.id)"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-medium">
                            <Plus class="w-2.5 h-2.5" />
                            New
                          </span>
                          <span v-if="!mod.isCompatible"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 font-medium">
                            <AlertCircle class="w-2.5 h-2.5" />
                            Incompatible
                          </span>
                          <span v-else-if="mod.hasWarning"
                            class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium"
                            title="This mod uses a different loader but may work via compatibility layers">
                            <AlertTriangle class="w-2.5 h-2.5" />
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
                        <MessageSquare class="w-3 h-3 shrink-0" />
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
                          <MessageSquare v-if="getModNote(mod.id)" class="w-3.5 h-3.5" />
                          <MessageSquarePlus v-else class="w-3.5 h-3.5" />
                        </button>

                        <!-- Lock/Unlock Button (action) -->
                        <button v-if="!isLinked"
                          class="w-7 h-7 flex items-center justify-center rounded-lg border transition-all duration-150"
                          :class="lockedModIds.has(mod.id)
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-amber-500 border-border/40 hover:border-amber-500/50'"
                          :title="lockedModIds.has(mod.id) ? 'Unlock' : 'Lock'" @click.stop="toggleModLocked(mod.id)">
                          <Lock v-if="lockedModIds.has(mod.id)" class="w-3.5 h-3.5" />
                          <LockOpen v-else class="w-3.5 h-3.5" />
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
                          <GitBranch class="w-3.5 h-3.5" />
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
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>

                        <!-- Managed indicator -->
                        <div v-if="isLinked"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-muted/30 text-muted-foreground/40 border border-border/20"
                          title="Remote managed">
                          <Lock class="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <!-- Lock state indicator and update/changelog (moved next to toggle) -->
                      <div class="flex items-center ml-1 gap-1">
                        <!-- Checking Indicator (shows while checking) -->
                        <div v-if="!isLinked && mod.cf_project_id && checkingUpdates[mod.id]"
                          class="w-6 h-6 flex items-center justify-center rounded-md bg-primary/10" title="Checking...">
                          <RefreshCw class="w-3.5 h-3.5 animate-spin text-primary/70" />
                        </div>

                        <!-- View Changelog (always visible when update available) -->
                        <button
                          v-if="!isLinked && mod.cf_project_id && updateAvailable[mod.id] && !checkingUpdates[mod.id]"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-muted/60 text-muted-foreground border border-border/40 hover:bg-muted hover:text-foreground transition-all duration-150"
                          title="View changelog" @click.stop="viewModChangelog(mod)">
                          <FileText class="w-3.5 h-3.5" />
                        </button>

                        <!-- Update Available (always visible when update available) -->
                        <button
                          v-if="!isLinked && mod.cf_project_id && updateAvailable[mod.id] && !checkingUpdates[mod.id]"
                          class="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 hover:border-primary/50 transition-all duration-150"
                          :title="`Update to ${updateAvailable[mod.id].displayName}`" @click.stop="quickUpdateMod(mod)">
                          <ArrowUpCircle class="w-3.5 h-3.5" />
                        </button>

                        <!-- Lock state icon (indicator only) -->
                        <div v-if="lockedModIds.has(mod.id)"
                          class="w-6 h-6 flex items-center justify-center text-amber-500" title="Locked">
                          <Lock class="w-3.5 h-3.5" />
                        </div>

                        <!-- Note indicator (always visible when note exists) -->
                        <button v-if="getModNote(mod.id)"
                          class="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-300 transition-colors"
                          :title="getModNote(mod.id)" @click.stop="openModNoteDialog(mod)">
                          <MessageSquare class="w-3.5 h-3.5" />
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
                    <Layers v-if="contentTypeTab === 'mods'" class="w-8 h-8 text-muted-foreground/40" />
                    <Image v-else-if="contentTypeTab === 'resourcepacks'" class="w-8 h-8 text-muted-foreground/40" />
                    <Sparkles v-else class="w-8 h-8 text-muted-foreground/40" />
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
                    <Package class="w-3.5 h-3.5 text-primary" />
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
                    <X class="w-3 h-3" />
                  </button>
                </div>
                <div class="relative">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
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
                        <Layers v-if="mod.content_type === 'mod' || !mod.content_type" class="w-3.5 h-3.5" />
                        <Image v-else-if="mod.content_type === 'resourcepack'" class="w-3.5 h-3.5" />
                        <Sparkles v-else class="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <!-- Info -->
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="font-medium text-xs truncate hover:text-primary cursor-pointer transition-colors"
                          @click.stop="openModDetails(mod)" title="Click for details">
                          {{ mod.name }}
                        </span>
                        <AlertCircle v-if="!mod.isCompatible" class="w-2.5 h-2.5 text-red-500 shrink-0" />
                        <AlertTriangle v-else-if="mod.hasWarning" class="w-2.5 h-2.5 text-amber-500 shrink-0" />
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
                      <Plus class="w-3.5 h-3.5" />
                    </button>
                    <div v-else-if="!mod.isCompatible"
                      class="w-6 h-6 flex items-center justify-center shrink-0 text-muted-foreground/20">
                      <Lock class="w-3 h-3" />
                    </div>
                  </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredAvailableMods.length === 0"
                  class="flex flex-col items-center justify-center py-8 px-4">
                  <Package class="w-8 h-8 text-muted-foreground/25 mb-2" />
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
                    <Lock v-if="isLinked" class="w-3 h-3 text-muted-foreground" />
                  </label>
                  <input v-model="editForm.name" type="text" :disabled="isLinked"
                    class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>

                <!-- Version -->
                <div class="space-y-2">
                  <label class="text-sm font-medium flex items-center gap-1.5">
                    Version
                    <Lock v-if="isLinked" class="w-3 h-3 text-muted-foreground" />
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
                      <Lock v-if="isExistingModpack" class="w-3 h-3 text-muted-foreground" />
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
                      <Lock v-if="isExistingModpack" class="w-3 h-3 text-muted-foreground" />
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
                      <Loader2 v-if="isLoadingLoaderVersions" class="w-3 h-3 animate-spin text-muted-foreground" />
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
                        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoadingLoaderVersions }" />
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
                    <Lock v-if="isLinked" class="w-3 h-3 text-muted-foreground" />
                  </label>
                  <textarea v-model="editForm.description" rows="3" :disabled="isLinked"
                    class="w-full px-3 py-2 rounded-lg border border-border/50 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Describe your modpack..."></textarea>
                </div>

                <!-- Save Button -->
                <div class="pt-2">
                  <Button @click="saveModpackInfo" :disabled="isSaving || isLinked" class="gap-2">
                    <Save class="w-4 h-4" />
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
                <Download class="w-5 h-5 text-primary" />
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
                        <History class="w-3.5 h-3.5 mr-1.5" />
                        Changelog
                      </Button>
                      <Button variant="secondary" size="sm" @click="checkForCFUpdate" :disabled="isCheckingCFUpdate">
                        <RefreshCw class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isCheckingCFUpdate }" />
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
                          <ArrowUpCircle class="w-4 h-4" />
                          Update Available
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          {{ cfUpdateInfo.currentVersion }} → {{ cfUpdateInfo.latestVersion }}
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button variant="ghost" size="sm" @click="viewCFChangelog(cfUpdateInfo.latestFileId)">
                          <History class="w-3.5 h-3.5 mr-1.5" />
                          View Changes
                        </Button>
                        <Button size="sm" @click="openCFUpdateDialog">
                          <Download class="w-3.5 h-3.5 mr-1.5" />
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
                <AlertTriangle class="w-5 h-5 text-amber-500" />
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
                      <RefreshCw class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isReSearching }" />
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
                <Globe class="w-5 h-5 text-primary" />
                Remote & Collaboration
              </h3>

              <div class="space-y-6">
                <!-- Check Button -->
                <div v-if="editForm.remote_url"
                  class="p-4 bg-muted/20 rounded-lg border border-border/50 flex items-center justify-between">
                  <div class="text-sm">
                    <div class="font-medium flex items-center gap-2">
                      <RefreshCw class="w-4 h-4 text-primary" />
                      Update Status
                    </div>
                    <div class="text-xs text-muted-foreground mt-1">
                      Last checked:
                      {{
                        modpack?.remote_source?.last_checked
                          ? new Date(
                            modpack.remote_source.last_checked
                          ).toLocaleString()
                          : "Never"
                      }}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" @click="checkForRemoteUpdates" :disabled="isCheckingUpdate">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': isCheckingUpdate }" />
                    Check Now
                  </Button>
                </div>

                <!-- Collaboration / Remote Updates -->
                <div class="space-y-4">
                  <div class="space-y-2">
                    <label class="text-sm font-medium">Remote Manifest URL</label>
                    <div class="flex gap-2">
                      <input v-model="editForm.remote_url" type="text"
                        class="flex-1 h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                        placeholder="https://gist.githubusercontent.com/..." @change="sanitizeRemoteUrl" />
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Paste the raw URL of a JSON manifest hosted on GitHub Gist
                      or similar.
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <input type="checkbox" id="auto-check" v-model="editForm.auto_check_remote"
                      class="rounded border-border/50 text-primary focus:ring-primary/30" />
                    <label for="auto-check" class="text-sm">Automatically check for updates on startup</label>
                  </div>

                  <div class="pt-4 border-t border-border/50">
                    <h4 class="text-sm font-medium mb-2">Export for Hosting</h4>
                    <p class="text-xs text-muted-foreground mb-3">
                      Generates a .json file you can upload to Gist/GitHub to
                      act as the "Master" version.
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" class="gap-2" @click="exportManifest('full')">
                        <Share2 class="w-3.5 h-3.5" />
                        Full History
                      </Button>
                      <Button variant="outline" size="sm" class="gap-2" @click="exportManifest('current')">
                        <Share2 class="w-3.5 h-3.5" />
                        Current Only
                      </Button>
                    </div>
                  </div>

                  <!-- Resource List Export -->
                  <div class="pt-4 border-t border-border/50">
                    <h4 class="text-sm font-medium mb-2">Export Resource List</h4>
                    <p class="text-xs text-muted-foreground mb-3">
                      Generate a sorted list of all mods and resources for sharing or documentation.
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

                <!-- Save Button -->
                <div class="pt-4 border-t border-border/50">
                  <Button @click="saveModpackInfo" :disabled="isSaving" class="gap-2">
                    <Save class="w-4 h-4" />
                    {{ isSaving ? "Saving..." : "Save Changes" }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

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
            <AlertTriangle class="w-4 h-4" />
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
            <Info class="w-4 h-4" />
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
            <AlertTriangle class="w-4 h-4" />
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
            <Info class="w-4 h-4" />
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
      :is-locked="modDetailsTarget ? lockedModIds.has(modDetailsTarget.id) : false" @close="closeModDetails"
      @version-changed="handleModDetailsVersionChange" />

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
            <Trash2 class="w-4 h-4 mr-2" />
            Remove Note
          </Button>
          <div v-else></div>
          <div class="flex items-center gap-2">
            <Button variant="secondary" @click="closeModNoteDialog" :disabled="isSavingNote">Cancel</Button>
            <Button @click="saveModNote" :disabled="isSavingNote">
              <Loader2 v-if="isSavingNote" class="w-4 h-4 mr-2 animate-spin" />
              <Save v-else class="w-4 h-4 mr-2" />
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
          <RefreshCw class="w-6 h-6 animate-spin text-primary" />
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
            <ArrowUpCircle class="w-8 h-8 text-primary shrink-0" />
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
                <RefreshCw class="w-4 h-4 text-primary" />
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
                <Plus class="w-4 h-4 text-primary" />
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

    <!-- Instance Settings Dialog -->
    <Dialog :open="showInstanceSettings" @close="showInstanceSettings = false">
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Sliders class="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 class="font-semibold">Instance Settings</h3>
            <p class="text-sm text-muted-foreground">Configure memory and JVM arguments</p>
          </div>
        </div>
      </template>

      <div class="space-y-6 py-4">
        <!-- Memory Settings -->
        <div class="space-y-4">
          <h4 class="font-medium flex items-center gap-2">
            <MemoryStick class="w-4 h-4 text-primary" />
            Memory Allocation
            <span v-if="systemMemory" class="text-xs text-muted-foreground font-normal ml-auto">
              System: {{ (systemMemory.total / 1024).toFixed(1) }} GB total
            </span>
          </h4>

          <!-- Min RAM Slider -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-sm text-muted-foreground">Minimum RAM</label>
              <span class="text-sm font-mono text-primary">{{ (memoryMin / 1024).toFixed(1) }} GB</span>
            </div>
            <input type="range" v-model.number="memoryMin" min="512" :max="Math.min(memoryMax - 512, maxAllowedRam)"
              step="256" class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
            <div class="flex justify-between text-[10px] text-muted-foreground">
              <span>512 MB</span>
              <span>{{ ((Math.min(memoryMax - 512, maxAllowedRam)) / 1024).toFixed(1) }} GB</span>
            </div>
          </div>

          <!-- Max RAM Slider -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-sm text-muted-foreground">Maximum RAM</label>
              <span class="text-sm font-mono text-primary">{{ (memoryMax / 1024).toFixed(1) }} GB</span>
            </div>
            <input type="range" v-model.number="memoryMax" :min="Math.max(1024, memoryMin + 512)" :max="maxAllowedRam"
              step="256" class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary" />
            <div class="flex justify-between text-[10px] text-muted-foreground">
              <span>{{ (Math.max(1024, memoryMin + 512) / 1024).toFixed(1) }} GB</span>
              <span>{{ (maxAllowedRam / 1024).toFixed(1) }} GB</span>
            </div>
          </div>

          <div class="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
            💡 Recommended: 4-6 GB for light modpacks, 8-12 GB for heavy modpacks
          </div>
        </div>

        <!-- JVM Arguments -->
        <div class="space-y-2">
          <h4 class="font-medium flex items-center gap-2">
            <Cpu class="w-4 h-4 text-primary" />
            Custom JVM Arguments
          </h4>
          <textarea v-model="customJavaArgs" rows="3" placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=200"
            class="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border focus:border-primary outline-none font-mono text-sm resize-none"></textarea>
          <div class="text-xs text-muted-foreground">
            Advanced: Add custom Java arguments (leave empty for defaults)
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="secondary" @click="showInstanceSettings = false">Cancel</Button>
        <Button @click="saveInstanceSettings">Save Settings</Button>
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
              <AlertCircle class="w-5 h-5 text-amber-400" />
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
            <Clock class="w-3.5 h-3.5" />
            Last sync: {{ formatPlayDate(pendingLaunchData.lastSynced) }}
          </div>

          <div class="bg-muted/30 rounded-lg p-3 space-y-2">
            <div class="flex items-start gap-2">
              <Download class="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div class="text-sm">
                <span class="text-foreground font-medium">Sync & Play</span>
                <span class="text-muted-foreground"> — Update mods first</span>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <Play class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
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
            <Play class="w-4 h-4" />
            Play now
          </button>
          <button @click="handleSyncConfirmation('sync')"
            class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors duration-150 flex items-center justify-center gap-2">
            <Download class="w-4 h-4" />
            Sync & Play
          </button>
        </div>
      </div>
    </div>

    <!-- Structured Config Editor -->
    <div v-if="showStructuredEditor"
      class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-150">
      <div
        class="bg-background border border-border/50 rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        <div class="shrink-0 border-b border-border/50 bg-card/50 px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Settings class="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 class="font-semibold text-foreground">Config Editor</h3>
              <p class="text-xs text-muted-foreground">{{ structuredEditorFile?.name }}</p>
            </div>
          </div>
          <button @click="handleCloseStructuredEditor"
            class="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden">
          <ConfigStructuredEditor v-if="instance && structuredEditorFile" :instance-id="instance.id"
            :config-path="structuredEditorFile.path" :refresh-key="configRefreshKey"
            @close="handleCloseStructuredEditor" @saved="handleCloseStructuredEditor" />
        </div>
      </div>
    </div>
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
  @apply px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-colors duration-150 whitespace-nowrap;
}

.tab-pill-active {
  @apply bg-muted text-foreground font-medium;
}

.tab-pill-game {
  @apply bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/20;
}

.tab-pill-inactive {
  @apply text-muted-foreground hover:text-foreground hover:bg-muted/50;
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
</style>
