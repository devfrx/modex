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
  Lock,
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
  Users,
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
import ProfilesPanel from "@/components/modpacks/ProfilesPanel.vue";
import UpdateReviewDialog from "@/components/modpacks/UpdateReviewDialog.vue";
import ConfigBrowser from "@/components/configs/ConfigBrowser.vue";
import ConfigStructuredEditor from "@/components/configs/ConfigStructuredEditor.vue";
import UpdateAvailableBanner from "@/components/modpacks/UpdateAvailableBanner.vue";
import CurseForgeSearch from "@/components/mods/CurseForgeSearch.vue";
import ModDetailsModal from "@/components/mods/ModDetailsModal.vue";
import type { Mod, Modpack, ModpackChange, RemoteUpdateResult, ModexInstance, InstanceSyncResult, ConfigFile } from "@/types";
import type { CFModLoader } from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isOpen: boolean;
  initialTab?: "play" | "mods" | "discover" | "health" | "versions" | "profiles" | "settings" | "remote" | "configs";
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
const searchQueryInstalled = ref("");
const searchQueryAvailable = ref("");
const isLoading = ref(true);
// Race condition protection: track current load requests
let loadRequestId = 0;
let instanceRequestId = 0;
const sortBy = ref<"name" | "version">("name");
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
const modsFilter = ref<"all" | "incompatible" | "warning" | "disabled" | "updates" | "recent-updated" | "recent-added">("all");
const activeTab = ref<
  | "play"
  | "mods"
  | "discover"
  | "health"
  | "versions"
  | "profiles"
  | "settings"
  | "remote"
  | "configs"
>("mods");
const contentTypeTab = ref<"mods" | "resourcepacks" | "shaders">("mods");

// Help Guide State
const showHelp = ref(false);

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
const logScrollRef = ref<HTMLDivElement | null>(null);
const maxLogLines = 200;

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

// Computed: Only importable configs (new or modified, not deleted)
const importableConfigs = computed(() =>
  modifiedConfigs.value.filter(c => c.status !== 'deleted')
);

// Computed: Deleted configs (exist in overrides but not in instance)
const deletedConfigs = computed(() =>
  modifiedConfigs.value.filter(c => c.status === 'deleted')
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
  dependentMods: Array<{ id: string; name: string; willBreak: boolean }>;
  orphanedDependencies: Array<{ id: string; name: string; usedByOthers: boolean }>;
  warnings: string[];
} | null>(null);
const pendingModAction = ref<{ modId: string; action: "remove" | "disable" } | null>(null);

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

const gameVersions = [
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
  "1.19.2",
  "1.19",
  "1.18.2",
  "1.17.1",
  "1.16.5",
];

const loaders = ["forge", "fabric", "neoforge", "quilt"];

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
  // Try common patterns
  // Pattern: loader-X.X.X (e.g., "forge-47.2.0", "neoforge-20.4.167")
  let match = loaderName.match(/^(?:forge|neoforge|fabric|quilt)-(?:loader-)?(.+)$/i);
  if (match) return match[1];

  // Pattern: version-loader-version (e.g., "1.20.1-forge-47.2.0")
  match = loaderName.match(/^\d+\.\d+(?:\.\d+)?-(?:forge|neoforge|fabric|quilt)-(.+)$/i);
  if (match) return match[1];

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
    if (modsFilter.value === "updates") {
      return !!updateAvailable.value[m.id];
    }
    if (modsFilter.value === "recent-updated") {
      return recentlyUpdatedMods.value.has(m.id);
    }
    if (modsFilter.value === "recent-added") {
      return recentlyAddedMods.value.has(m.id);
    }
    return true;
  });
  mods.sort((a, b) => {
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
const RECENT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const isLibraryCollapsed = ref(false); // Collapsible library panel

// CurseForge Browse Dialog State
const showCFSearch = ref(false);

function handleCFSearchClose() {
  showCFSearch.value = false;
}

async function handleCFModAdded(mod: any, addedIds?: string[]) {
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
    toast.success("Added to modpack", `${mod.name} has been added`);
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

function openSingleModUpdate(mod: any) {
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

async function checkModUpdate(mod: any) {
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

async function updateMod(mod: any) {
  const latest = updateAvailable.value[mod.id];
  if (!latest) return;

  try {
    const result = await window.api.updates.applyUpdate(mod.id, latest.id, props.modpackId);
    if (result.success) {
      delete updateAvailable.value[mod.id];
      emit("update");
      toast.success(`Updated ${mod.name} to version ${latest.displayName}`);
    } else {
      toast.error(`Failed to update ${mod.name}: ${result.error}`);
    }
  } catch (err) {
    console.error("Update failed:", err);
    toast.error("Failed to update mod");
  }
}

// Version picker for changing mod version
function openVersionPicker(mod: any) {
  if (!mod.cf_project_id) return;
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
      toast.success(`${versionPickerMod.value.name} version changed`);
    } else {
      toast.error(`Failed to change version: ${result.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    console.error("Version change failed:", err);
    toast.error(`Failed to change mod version: ${err?.message || 'Unknown error'}`);
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
      toast.success(`${modDetailsTarget.value.name} version changed`);
      closeModDetails();
    } else {
      toast.error(`Failed to change version: ${result.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    console.error("Version change failed:", err);
    toast.error(`Failed to change mod version: ${err?.message || 'Unknown error'}`);
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
async function quickUpdateMod(mod: any) {
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
      toast.success(`Updated ${mod.name}`);
    } else {
      toast.error(`Failed to update ${mod.name}: ${result.error}`);
    }
  } catch (err) {
    console.error("Update failed:", err);
    toast.error(`Failed to update ${mod.name}`);
  } finally {
    checkingUpdates.value[mod.id] = false;
  }
}

// Update all mods with available updates
async function updateAllMods() {
  const modsToUpdate = currentMods.value.filter(m => updateAvailable.value[m.id]);
  if (modsToUpdate.length === 0) return;

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
    toast.success(`Updated ${successCount} mods`);
  } else {
    toast.warning(`Updated ${successCount} mods, ${failCount} failed`);
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

// Refresh data and notify parent to update modpack list (e.g., for unsaved changes icon)
async function refreshAndNotify() {
  await loadData();
  // Also refresh instance sync status if linked
  if (instance.value) {
    try {
      instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
    } catch (err) {
      console.error("Failed to refresh sync status:", err);
    }
  }
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
    const [pack, cMods, allMods, disabled, linkedInstance] = await Promise.all([
      window.api.modpacks.getById(props.modpackId),
      window.api.modpacks.getMods(props.modpackId),
      window.api.mods.getAll(),
      window.api.modpacks.getDisabledMods(props.modpackId),
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
    selectedModIds.value.clear();
    linkedInstanceId.value = linkedInstance?.id || null;

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
      toast.error("Failed to load modpack", "Please try again or reload the page");
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
        toast.success("Instance Ready!", `Downloaded ${result.syncResult.modsDownloaded} mods`);

        const stats = await getInstanceStats(result.instance.id);
        if (stats) {
          instanceStats.value = {
            modCount: stats.modCount,
            configCount: stats.configCount,
            totalSize: stats.totalSize,
          };
        }
      } else {
        toast.error("Instance created with issues", `${result.syncResult.errors.length} errors`);
      }
    }
  } catch (err: any) {
    toast.error("Failed to create instance", err.message);
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
      toast.success("Sync Complete", `${result.modsDownloaded} mods updated`);

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
      toast.error("Sync had errors", result.errors.join(", "));
    }
  } catch (err: any) {
    toast.error("Sync failed", err.message);
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

  const removeProgressListener = window.api.on("loader:installProgress", (data: any) => {
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
        toast.success("Synced & Launched", "Instance synced, Minecraft loading...");
        instanceSyncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
      } else {
        toast.success("Minecraft Launcher Started", "Game is loading...");
      }

      emit("launched", instance.value);
    } else {
      toast.error("Launch failed", result.error || "Unknown error");
    }
  } catch (err: any) {
    toast.error("Launch failed", err.message);
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
      toast.success("Game Stopped", "Minecraft has been terminated.");
      gameLaunched.value = false;
    } else {
      toast.error("Failed to stop game", "Could not terminate the process.");
    }
  } catch (err: any) {
    toast.error("Error stopping game", err.message);
  }
}

// Open instance folder
async function handleOpenInstanceFolder(subfolder?: string) {
  if (!instance.value) return;
  await openInstanceFolder(instance.value.id, subfolder);
}

// Save instance settings
async function saveInstanceSettings() {
  if (!instance.value) return;

  try {
    await updateInstance(instance.value.id, {
      memory: { min: memoryMin.value, max: memoryMax.value },
      javaArgs: customJavaArgs.value || undefined
    });
    toast.success("Settings Saved", "Memory and JVM arguments updated");
    showInstanceSettings.value = false;
  } catch (err: any) {
    toast.error("Failed to save", err.message);
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

    // Auto-select all modified configs
    selectedConfigsForImport.value = new Set(
      modifiedConfigs.value
        .filter(c => c.status !== 'deleted')
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

// Select all configs
function selectAllConfigs() {
  selectedConfigsForImport.value = new Set(
    modifiedConfigs.value
      .filter(c => c.status !== 'deleted')
      .map(c => c.relativePath)
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
      toast.success("Configs Imported", `${result.imported} config files added to modpack`);

      // Reload modified configs
      await loadModifiedConfigs();
      showModifiedConfigsDetails.value = false;
    } else {
      toast.error("Import Error", result.errors.join(", "));
    }
  } catch (err: any) {
    toast.error("Import Failed", err.message);
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
    toast.success("Saved", "Modpack settings updated");
  } catch (err) {
    console.error("Failed to save modpack info:", err);
    toast.error("Save Failed", (err as Error).message);
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
      emit("update");
    }
  } catch (err) {
    console.error("Failed to toggle mod:", err);
    toast.error("Toggle Failed", (err as Error).message);
  }
}

async function removeSelectedMods() {
  if (selectedModIds.value.size === 0) return;

  const idsToRemove: string[] = Array.from(selectedModIds.value);

  try {
    for (const id of idsToRemove) {
      await window.api.modpacks.removeMod(props.modpackId, id);
    }
    selectedModIds.value = new Set();
    await loadData();
    emit("update");
  } catch (err) {
    console.error("Failed to remove mods:", err);
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

function clearSelection() {
  selectedModIds.value = new Set();
}

// Bulk enable/disable selected mods
async function bulkEnableSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  let successCount = 0;
  let failCount = 0;
  for (const modId of selectedModIds.value) {
    if (disabledModIds.value.has(modId)) {
      try {
        await window.api.modpacks.toggleMod(props.modpackId, modId);
        disabledModIds.value.delete(modId);
        successCount++;
      } catch (err) {
        console.error(`Failed to enable mod ${modId}:`, err);
        failCount++;
      }
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  emit("update");
  if (failCount === 0) {
    toast.success("Mods Enabled", `Enabled ${successCount} mod(s)`);
  } else {
    toast.warning("Mods Enabled", `Enabled ${successCount} mod(s), ${failCount} failed`);
  }
}

async function bulkDisableSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  let successCount = 0;
  let failCount = 0;
  for (const modId of selectedModIds.value) {
    if (!disabledModIds.value.has(modId)) {
      try {
        await window.api.modpacks.toggleMod(props.modpackId, modId);
        disabledModIds.value.add(modId);
        successCount++;
      } catch (err) {
        console.error(`Failed to disable mod ${modId}:`, err);
        failCount++;
      }
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  emit("update");
  if (failCount === 0) {
    toast.success("Mods Disabled", `Disabled ${successCount} mod(s)`);
  } else {
    toast.warning("Mods Disabled", `Disabled ${successCount} mod(s), ${failCount} failed`);
  }
}

async function removeIncompatibleMods() {
  if (isLinked.value) return;

  const incompatibleMods = currentMods.value.filter(
    (m) => !isModCompatible(m).compatible
  );
  if (incompatibleMods.length === 0) {
    toast.info(
      "No Incompatible Mods",
      "All mods are compatible with this modpack"
    );
    return;
  }

  // Show confirm dialog
  showRemoveIncompatibleDialog.value = true;
}

async function confirmRemoveIncompatibleMods() {
  showRemoveIncompatibleDialog.value = false;

  const incompatibleMods = currentMods.value.filter(
    (m) => !isModCompatible(m).compatible
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

function toggleSort(field: "name" | "version") {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = field;
    sortDir.value = "asc";
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

async function exportManifest() {
  if (!props.modpackId) return;
  try {
    const json = await window.api.remote.exportManifest(props.modpackId);
    await navigator.clipboard.writeText(json);
    toast.success(
      "Manifest Copied",
      "JSON copied to clipboard. You can now paste it into a GitHub Gist."
    );
  } catch (err) {
    console.error("Failed to export manifest:", err);
    toast.error("Export Failed", (err as Error).message);
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

      result.changes.addedMods.forEach((mod: any) => {
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

      // Show version control changes (includes config changes synced via version history)
      if (result.changes.hasVersionHistoryChanges) {
        changes.push({
          type: "version_control",
          modId: "version_history",
          modName: "Version Control History"
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

      // Set initial tab if provided
      if (props.initialTab) {
        activeTab.value = props.initialTab;
      }

      await loadData();
      await loadInstance();
      await loadSyncSettings();
      await loadModifiedConfigs();

      // Pre-fetch loader versions for settings tab
      if (editForm.value.minecraft_version && editForm.value.loader) {
        fetchLoaderVersions();
      }

      // Set up game log listener
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
      await loadData();
      await loadInstance();

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
</script>

<template>
  <div v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150">
    <div
      class="bg-background border border-border/50 rounded-lg sm:rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">

      <!-- Modern Header with Hero Style -->
      <div class="shrink-0 relative overflow-hidden">
        <!-- Background gradient -->
        <div class="absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-card/80"></div>
        <div
          class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent">
        </div>

        <!-- Content -->
        <div class="relative">
          <!-- Top Bar -->
          <div class="px-3 sm:px-5 py-3 sm:py-4 flex items-start gap-3 sm:gap-4">
            <!-- Pack Info with larger thumbnail -->
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <!-- Thumbnail - Responsive size -->
              <div v-if="modpack?.image_url"
                class="w-11 h-11 sm:w-14 sm:h-14 rounded-lg overflow-hidden ring-1 ring-border/50 shrink-0">
                <img :src="modpack.image_url.startsWith('http') ||
                  modpack.image_url.startsWith('file:')
                  ? modpack.image_url
                  : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
                  " class="w-full h-full object-cover" />
              </div>
              <div v-else
                class="w-11 h-11 sm:w-14 sm:h-14 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-1 ring-primary/20 shrink-0">
                <Package class="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>

              <!-- Name & Meta -->
              <div class="min-w-0 flex-1 py-0.5 sm:py-1">
                <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-1.5">
                  <h2 class="text-base sm:text-lg font-semibold truncate text-foreground">
                    {{ modpack?.name || "Loading..." }}
                  </h2>
                  <span v-if="modpack?.version"
                    class="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                    v{{ modpack.version }}
                  </span>
                  <span v-if="modpack?.remote_source?.url"
                    class="hidden sm:inline px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-medium border border-primary/20 flex items-center gap-1"
                    title="This modpack is linked to a remote source">
                    <Share2 class="w-3 h-3" />
                    Linked
                  </span>
                </div>

                <!-- Stats Row -->
                <div class="flex items-center gap-2 flex-wrap">
                  <div v-if="modpack?.minecraft_version"
                    class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                    <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
                    <span class="text-[10px] sm:text-xs font-medium text-primary">{{ modpack.minecraft_version
                    }}</span>
                  </div>
                  <div v-if="modpack?.loader"
                    class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border/30">
                    <div class="w-1.5 h-1.5 rounded-full bg-muted-foreground"></div>
                    <span class="text-[10px] sm:text-xs font-medium text-muted-foreground capitalize">{{ modpack.loader
                    }}</span>
                  </div>
                  <div
                    class="hidden xs:flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/30 border border-border/30">
                    <Layers class="w-3 h-3 text-muted-foreground" />
                    <span class="text-[10px] sm:text-xs font-medium text-muted-foreground">{{ currentMods.length }}
                      mods</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions - Responsive -->
            <div class="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button variant="ghost" size="sm" class="hidden sm:flex h-9 w-9 p-0 rounded-lg" @click="selectImage"
                title="Set cover image">
                <ImagePlus class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" class="hidden sm:flex h-9 w-9 p-0 rounded-lg"
                :disabled="isCheckingAllUpdates" title="Check for mod updates" @click="checkAllUpdates">
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isCheckingAllUpdates }" />
              </Button>
              <div class="hidden sm:block w-px h-6 bg-border/50 mx-1"></div>
              <Button variant="outline" size="sm" class="hidden md:flex h-9 px-3 gap-2 rounded-lg"
                @click="$emit('export')">
                <Download class="w-4 h-4" />
                <span>Export</span>
              </Button>
              <Button variant="ghost" size="sm"
                class="h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-400"
                @click="$emit('close')">
                <X class="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>
          </div>

          <!-- Remote Update Banner -->
          <div v-if="updateResult?.hasUpdate" class="px-3 sm:px-6 pb-3 sm:pb-4">
            <UpdateAvailableBanner :current-version="modpack?.version || 'unknown'" :new-version="updateResult.remoteManifest?.modpack.version || 'unknown'
              " :is-checking="isCheckingUpdate" @update="showReviewDialog = true" />
          </div>

          <!-- Tab Navigation - Scrollable on mobile -->
          <div class="px-3 sm:px-6 pb-3 sm:pb-4 overflow-x-auto scrollbar-hide">
            <div
              class="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/30 w-fit min-w-full sm:min-w-0">
              <!-- Play Tab - Primary action -->
              <button class="tab-pill"
                :class="activeTab === 'play' ? 'tab-pill-active tab-pill-play' : 'tab-pill-inactive'"
                @click="activeTab = 'play'">
                <Play class="w-3.5 h-3.5" />
                <span class="hidden xs:inline">Play</span>
                <span v-if="isGameRunning" class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              </button>
              <button class="tab-pill" :class="activeTab === 'mods' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'mods'">
                <Layers class="w-3.5 h-3.5" />
                <span class="hidden xs:inline">Resources</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'discover' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'discover'">
                <Sparkles class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Discover</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'configs' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'configs'">
                <FileCode class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Configs</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'health' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'health'">
                <AlertCircle class="w-3.5 h-3.5" />
                <span class="hidden md:inline">Health</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'versions' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'versions'">
                <GitBranch class="w-3.5 h-3.5" />
                <span class="hidden md:inline">History</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'profiles' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'profiles'">
                <Users class="w-3.5 h-3.5" />
                <span class="hidden lg:inline">Profiles</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'remote' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'remote'">
                <Globe class="w-3.5 h-3.5" />
                <span class="hidden lg:inline">Remote</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'settings' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'settings'">
                <Settings class="w-3.5 h-3.5" />
                <span class="hidden lg:inline">Settings</span>
              </button>
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
                      <li><b>Updates:</b> Show only mods with updates available</li>
                      <li><b>Update All:</b> Update all mods to latest version at once</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Updates are checked automatically when you open the modpack. Use the arrow for quick
                    updates, or Branch icon to pick a specific version!</span>
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

          <!-- Health Tab Help -->
          <div v-else-if="activeTab === 'health'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Health - Diagnose Modpack Issues</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Analyze your modpack for problems like missing dependencies, conflicts, and performance issues.
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">What it checks:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Missing dependencies:</b> Mods that require other mods you don't have</li>
                      <li><b>Conflicts:</b> Mods that are known to cause issues together</li>
                      <li><b>Performance:</b> Estimates RAM needs and performance impact</li>
                      <li><b>Dependency tree:</b> Visual map of which mods depend on which</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">How to use:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li>Click <b>"Analyze"</b> to run a full check</li>
                      <li>Review any <b>red warnings</b> for critical issues</li>
                      <li>Use <b>"Add"</b> buttons to fix missing dependencies</li>
                      <li>Check the <b>RAM estimate</b> to adjust your game settings</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Run an analysis after adding several mods to catch any issues early!</span>
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

          <!-- Profiles Tab Help -->
          <div v-else-if="activeTab === 'profiles'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">Profiles - Save Mod Configurations</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Create and switch between different mod setups without removing mods. Perfect for different
                  playstyles!
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">Example profiles:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li><b>Performance Mode:</b> Only essential mods enabled</li>
                      <li><b>Full Experience:</b> All mods enabled</li>
                      <li><b>Building Only:</b> Decorative and building mods</li>
                      <li><b>Adventure Mode:</b> RPG and exploration mods</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground">How to use:</h5>
                    <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                      <li>Enable/disable mods as you want them</li>
                      <li>Click <b>"Save Current Profile"</b></li>
                      <li>Give it a name</li>
                      <li>Click <b>"Load"</b> anytime to restore that setup</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Loading a profile only enables/disables mods - it never removes them!</span>
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
          <div class="flex-1 overflow-y-auto">
            <!-- No Instance State - Hero Style -->
            <div v-if="!instance" class="flex flex-col items-center justify-center h-full p-8">
              <!-- Background Effects -->
              <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[100px]" />
                <div class="absolute bottom-1/4 right-1/4 w-48 h-48 bg-primary/5 rounded-full blur-[80px]" />
              </div>

              <div class="relative z-10 text-center max-w-md">
                <div class="mb-5 flex justify-center">
                  <div class="relative">
                    <div class="absolute inset-0 bg-primary/20 rounded-lg blur-lg opacity-50" />
                    <div
                      class="relative w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Rocket class="w-7 h-7 text-primary" />
                    </div>
                  </div>
                </div>

                <h3 class="text-lg font-semibold mb-2">Ready to Play?</h3>
                <p class="text-muted-foreground text-sm mb-5 leading-relaxed">
                  Create an isolated game instance for this modpack. Your mods and configs will be synced automatically.
                </p>

                <button @click="handleCreateInstance" :disabled="isCreatingInstance"
                  class="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium flex items-center gap-2 mx-auto transition-all duration-150">
                  <Loader2 v-if="isCreatingInstance" class="w-4 h-4 animate-spin" />
                  <Play v-else class="w-4 h-4" />
                  {{ isCreatingInstance ? 'Creating Instance...' : 'Create & Play' }}
                </button>
              </div>
            </div>

            <!-- Instance Ready State -->
            <div v-else class="p-6 space-y-6">
              <!-- Main Play Card -->
              <div class="rounded-lg bg-gradient-to-br from-card to-card/50 border border-border/50 overflow-hidden">
                <!-- Play Header -->
                <div class="p-5 bg-gradient-to-r from-primary/5 via-primary/5 to-transparent border-b border-border/30">
                  <div class="flex items-center gap-4">
                    <!-- Play Button -->
                    <button @click="handleLaunch()"
                      :disabled="instance.state !== 'ready' || isLaunching || isGameRunning"
                      class="h-10 px-5 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-all duration-150 shrink-0"
                      :class="isGameRunning
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : instance.state === 'ready' && !isLaunching
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md hover:shadow-primary/20'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'">
                      <Loader2 v-if="isLaunching" class="w-4 h-4 animate-spin" />
                      <Gamepad2 v-else-if="isGameRunning" class="w-4 h-4" />
                      <Play v-else class="w-4 h-4" />
                      <span>{{ isGameRunning ? 'Playing' : isLaunching ? 'Starting...' : 'Play' }}</span>
                    </button>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-3">
                        <div>
                          <h3 class="text-base font-semibold">
                            {{ runningGame?.gameProcessRunning
                              ? (runningGame?.status === 'loading_mods' ? 'Loading Mods...' : 'Game Running')
                              : isGameRunning
                                ? 'Launching...'
                                : isLaunching
                                  ? 'Starting Launcher...'
                                  : 'Ready to Play' }}
                          </h3>
                          <p class="text-sm text-muted-foreground">
                            {{ instanceStats?.modCount || 0 }} mods • {{ modpack?.loader }} {{
                              modpack?.minecraft_version }}
                          </p>
                        </div>
                      </div>

                      <!-- First launch info -->
                      <div v-if="!isGameRunning && !isLaunching && !instance?.lastPlayed"
                        class="flex items-center gap-2 mt-2 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded w-fit">
                        <Info class="w-3 h-3" />
                        <span>{{ modpack?.loader }} will be installed on first launch</span>
                      </div>

                      <!-- Loader Progress -->
                      <div v-if="loaderProgress && isLaunching" class="mt-3 space-y-1">
                        <div class="flex items-center gap-2 text-sm">
                          <Loader2 class="w-4 h-4 animate-spin text-primary" />
                          <span>{{ loaderProgress.stage }}</span>
                          <span v-if="loaderProgress.total > 0" class="text-primary font-medium">
                            {{ loaderProgress.current }}/{{ loaderProgress.total }}
                          </span>
                        </div>
                        <div v-if="loaderProgress.detail" class="text-xs text-muted-foreground truncate">
                          {{ loaderProgress.detail }}
                        </div>
                      </div>

                      <!-- Game Running Actions -->
                      <div v-if="isGameRunning" class="flex items-center gap-3 mt-3">
                        <button @click="handleKillGame"
                          class="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                          :class="runningGame?.gameProcessRunning
                            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'">
                          <X class="w-4 h-4" />
                          {{ runningGame?.gameProcessRunning ? 'Stop Game' : 'Cancel Launch' }}
                        </button>
                        <button v-if="runningGame?.gameProcessRunning" @click="showLogConsole = !showLogConsole"
                          class="px-4 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium flex items-center gap-2 transition-colors">
                          <Terminal class="w-4 h-4" />
                          {{ showLogConsole ? 'Hide' : 'Show' }} Logs
                        </button>
                      </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="flex flex-col gap-2 shrink-0">
                      <button @click="showInstanceSettings = true"
                        class="p-2.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
                        title="Settings">
                        <Sliders class="w-4 h-4" />
                      </button>
                      <button @click="handleOpenInstanceFolder()"
                        class="p-2.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
                        title="Open Folder">
                        <FolderOpen class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Log Console -->
                <div v-if="showLogConsole && isGameRunning" class="border-t border-border/50">
                  <div class="bg-card/80 px-4 py-2 border-b border-border/50 flex items-center justify-between">
                    <span class="text-sm font-medium flex items-center gap-2">
                      <Terminal class="w-4 h-4 text-primary" />
                      Game Logs
                    </span>
                    <span class="text-xs text-muted-foreground">{{ gameLogs.length }} lines</span>
                  </div>
                  <div ref="logScrollRef" class="h-48 overflow-y-auto bg-black/50 p-3 font-mono text-xs space-y-0.5">
                    <div v-if="gameLogs.length === 0" class="text-muted-foreground text-center py-4">
                      Waiting for logs...
                    </div>
                    <div v-for="(log, idx) in gameLogs" :key="idx" class="flex gap-2">
                      <span class="text-muted-foreground shrink-0">{{ log.time }}</span>
                      <span class="shrink-0 font-medium" :class="{
                        'text-blue-400': log.level === 'INFO',
                        'text-amber-400': log.level === 'WARN',
                        'text-red-400': log.level === 'ERROR',
                        'text-muted-foreground': log.level === 'DEBUG'
                      }">{{ log.level }}</span>
                      <span class="text-foreground/90 break-all">{{ log.message }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Sync Status Card -->
              <div v-if="instanceSyncStatus?.needsSync"
                class="rounded-lg bg-amber-500/5 border border-amber-500/20 overflow-hidden">
                <div class="p-3 flex items-center justify-between">
                  <button @click="showSyncDetails = !showSyncDetails"
                    class="flex items-center gap-3 hover:bg-amber-500/5 -m-2 p-2 rounded-md transition-colors duration-150 flex-1">
                    <div class="p-2 rounded-lg bg-amber-500/15">
                      <AlertTriangle class="w-4 h-4 text-amber-400" />
                    </div>
                    <div class="text-left">
                      <div class="font-medium text-sm">Instance Out of Sync</div>
                      <div class="text-xs text-muted-foreground">
                        {{ instanceSyncStatus.totalDifferences }} differences detected
                      </div>
                    </div>
                    <ChevronDown class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ml-auto"
                      :class="{ 'rotate-180': showSyncDetails }" />
                  </button>
                  <button @click="handleSyncInstance" :disabled="isSyncingInstance"
                    class="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium flex items-center gap-2 transition-colors duration-150 ml-3">
                    <Loader2 v-if="isSyncingInstance" class="w-3.5 h-3.5 animate-spin" />
                    <RefreshCw v-else class="w-3.5 h-3.5" />
                    {{ isSyncingInstance ? 'Syncing...' : 'Sync Now' }}
                  </button>
                </div>

                <!-- Expanded Details -->
                <div v-if="showSyncDetails" class="px-4 pb-3 space-y-3 border-t border-amber-500/10 pt-3">
                  <!-- Missing in Instance -->
                  <div v-if="instanceSyncStatus.missingInInstance.length > 0"
                    class="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div class="flex items-center gap-2 text-primary font-medium text-sm mb-2">
                      <Plus class="w-3.5 h-3.5" />
                      {{ instanceSyncStatus.missingInInstance.length }} files to add
                    </div>
                    <div class="space-y-1 max-h-32 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.missingInInstance" :key="item.filename"
                        class="text-xs text-muted-foreground flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] uppercase">{{
                          item.type }}</span>
                        <span class="truncate">{{ item.filename }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Extra in Instance -->
                  <div v-if="instanceSyncStatus.extraInInstance.length > 0"
                    class="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div class="flex items-center gap-2 text-muted-foreground font-medium text-sm mb-2">
                      <Plus class="w-3.5 h-3.5" />
                      {{ instanceSyncStatus.extraInInstance.length }} additional files
                    </div>
                    <p class="text-xs text-muted-foreground mb-2">
                      These are files you added manually. They will be preserved.
                    </p>
                    <div class="space-y-1 max-h-32 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.extraInInstance" :key="item.filename"
                        class="text-xs text-muted-foreground flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-400 text-[10px] uppercase">{{
                          item.type }}</span>
                        <span class="truncate">{{ item.filename }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Loader Version Mismatch -->
                  <div v-if="instanceSyncStatus.loaderVersionMismatch"
                    class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div class="flex items-center gap-2 text-blue-400 font-medium text-sm mb-2">
                      <RefreshCw class="w-3.5 h-3.5" />
                      Loader version update
                    </div>
                    <div class="text-xs text-muted-foreground">
                      <p>The modpack loader version has changed.</p>
                      <p class="mt-1">Instance: <span class="text-foreground font-medium">{{ instance?.loaderVersion ||
                        'unknown' }}</span></p>
                      <p>Modpack: <span class="text-blue-400 font-medium">{{ modpack?.loader_version || 'unknown'
                      }}</span></p>
                      <p class="mt-2 text-blue-400/80">The new loader will be installed on next launch.</p>
                    </div>
                  </div>

                  <!-- Disabled State Mismatch -->
                  <div v-if="instanceSyncStatus.disabledMismatch.length > 0"
                    class="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div class="flex items-center gap-2 text-muted-foreground font-medium text-sm mb-2">
                      <FileWarning class="w-3.5 h-3.5" />
                      {{ instanceSyncStatus.disabledMismatch.length }} state mismatches
                    </div>
                    <div class="space-y-1 max-h-32 overflow-y-auto">
                      <div v-for="item in instanceSyncStatus.disabledMismatch" :key="item.filename"
                        class="text-xs text-muted-foreground flex items-center gap-2">
                        <span class="truncate flex-1">{{ item.filename }}</span>
                        <span class="text-muted-foreground/70 text-[10px]">{{ item.issue }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Sync Mode -->
                  <div class="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div class="text-sm font-medium mb-3">Sync Mode</div>
                    <div class="flex gap-2 flex-wrap">
                      <button @click="selectedSyncMode = 'new_only'"
                        class="px-4 py-2 rounded-lg text-sm font-medium transition-all" :class="selectedSyncMode === 'new_only'
                          ? 'bg-primary text-primary-foreground shadow-lg'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Only New Files
                      </button>
                      <button @click="selectedSyncMode = 'overwrite'"
                        class="px-4 py-2 rounded-lg text-sm font-medium transition-all" :class="selectedSyncMode === 'overwrite'
                          ? 'bg-amber-500 text-white shadow-lg'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Overwrite All
                      </button>
                      <button @click="selectedSyncMode = 'skip'"
                        class="px-4 py-2 rounded-lg text-sm font-medium transition-all" :class="selectedSyncMode === 'skip'
                          ? 'bg-zinc-600 text-white shadow-lg'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'">
                        Skip Existing
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Synced Status -->
              <div v-else-if="instanceSyncStatus && !instanceSyncStatus.needsSync"
                class="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-primary/15">
                    <Check class="w-4 h-4 text-primary" />
                  </div>
                  <div class="flex-1">
                    <div class="font-medium text-sm text-primary">Instance In Sync</div>
                    <div class="text-sm text-muted-foreground">
                      All modpack content matches the instance
                      <span v-if="instanceSyncStatus.extraInInstance.length > 0" class="text-muted-foreground/70">
                        • {{ instanceSyncStatus.extraInInstance.length }} additional files
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Quick Access Grid -->
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button @click="handleOpenInstanceFolder('mods')"
                  class="group p-4 rounded-lg bg-card/50 hover:bg-card border border-border/40 hover:border-primary/30 text-center transition-all duration-150 hover:shadow-md hover:shadow-primary/5">
                  <div
                    class="w-10 h-10 mx-auto mb-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                    <Layers class="w-5 h-5 text-primary" />
                  </div>
                  <span class="font-medium text-sm">Mods</span>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ instanceStats?.modCount || 0 }} files</p>
                </button>
                <button @click="handleOpenInstanceFolder('config')"
                  class="group p-4 rounded-lg bg-card/50 hover:bg-card border border-border/40 hover:border-primary/30 text-center transition-all duration-150 hover:shadow-md hover:shadow-primary/5">
                  <div
                    class="w-10 h-10 mx-auto mb-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                    <FileCode class="w-5 h-5 text-primary" />
                  </div>
                  <span class="font-medium text-sm">Configs</span>
                  <p class="text-xs text-muted-foreground mt-0.5">Game settings</p>
                </button>
                <button @click="handleOpenInstanceFolder('resourcepacks')"
                  class="group p-4 rounded-lg bg-card/50 hover:bg-card border border-border/40 hover:border-primary/30 text-center transition-all duration-150 hover:shadow-md hover:shadow-primary/5">
                  <div
                    class="w-10 h-10 mx-auto mb-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                    <Image class="w-5 h-5 text-primary" />
                  </div>
                  <span class="font-medium text-sm">Resources</span>
                  <p class="text-xs text-muted-foreground mt-0.5">Texture packs</p>
                </button>
                <button @click="handleOpenInstanceFolder('saves')"
                  class="group p-4 rounded-lg bg-card/50 hover:bg-card border border-border/40 hover:border-primary/30 text-center transition-all duration-150 hover:shadow-md hover:shadow-primary/5">
                  <div
                    class="w-10 h-10 mx-auto mb-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                    <Save class="w-5 h-5 text-primary" />
                  </div>
                  <span class="font-medium text-sm">Saves</span>
                  <p class="text-xs text-muted-foreground mt-0.5">World files</p>
                </button>
              </div>

              <!-- Instance Info Card -->
              <div class="rounded-lg bg-card/30 border border-border/30 p-4">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-12 h-12 rounded-lg flex items-center justify-center"
                    :class="instance.state === 'ready' ? 'bg-primary/15' : 'bg-amber-500/15'">
                    <Gamepad2 class="w-6 h-6" :class="instance.state === 'ready' ? 'text-primary' : 'text-amber-400'" />
                  </div>
                  <div class="flex-1">
                    <h4 class="font-semibold">{{ instance.name }}</h4>
                    <div class="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span class="flex items-center gap-1.5">
                        <Clock class="w-3.5 h-3.5" />
                        {{ formatPlayDate(instance.lastPlayed) }}
                      </span>
                      <span class="flex items-center gap-1.5">
                        <HardDrive class="w-3.5 h-3.5" />
                        {{ instanceStats?.totalSize || 'Calculating...' }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Sync Settings -->
                <div class="border-t border-border/30 pt-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-sm font-medium">Auto-sync before launch</div>
                      <div class="text-xs text-muted-foreground">Sync modpack changes automatically</div>
                    </div>
                    <button @click="toggleAutoSync" class="relative w-11 h-6 rounded-full transition-colors"
                      :class="syncSettings.autoSyncEnabled ? 'bg-primary' : 'bg-muted'">
                      <span class="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                        :class="{ 'translate-x-5': syncSettings.autoSyncEnabled }" />
                    </button>
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-sm font-medium">Show sync confirmation</div>
                      <div class="text-xs text-muted-foreground">Ask before syncing</div>
                    </div>
                    <button @click="toggleSyncConfirmation" class="relative w-11 h-6 rounded-full transition-colors"
                      :class="syncSettings.showConfirmation ? 'bg-primary' : 'bg-muted'">
                      <span class="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                        :class="{ 'translate-x-5': syncSettings.showConfirmation }" />
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
                    <div class="text-xs text-muted-foreground">
                      Select configs to import to modpack overrides
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

              <!-- Center: Search -->
              <div class="flex-1 max-w-md">
                <div class="relative">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input v-model="searchQueryInstalled" placeholder="Search installed..."
                    class="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-muted/50 border-none focus:ring-1 focus:ring-primary outline-none transition-all focus:bg-muted" />
                </div>
              </div>

              <!-- Right: Actions -->
              <div class="flex items-center gap-2">
                <!-- Quick Filters -->
                <div class="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
                  <button class="px-2.5 py-1 text-[10px] rounded-md transition-all" :class="modsFilter === 'all'
                    ? 'bg-background text-foreground ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'" @click="modsFilter = 'all'">
                    All
                  </button>
                  <button v-if="incompatibleModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'incompatible'
                      ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'incompatible'">
                    <AlertCircle class="w-3 h-3" />
                    {{ incompatibleModCount }}
                  </button>
                  <button v-if="warningModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'warning'
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'warning'"
                    title="Mods with different loader (may work with compatibility mods)">
                    <AlertTriangle class="w-3 h-3" />
                    {{ warningModCount }}
                  </button>
                  <button v-if="disabledModCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'disabled'
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'disabled'">
                    <ToggleLeft class="w-3 h-3" />
                    {{ disabledModCount }}
                  </button>
                  <button v-if="updatesAvailableCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'updates'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'updates'">
                    <ArrowUpCircle class="w-3 h-3" />
                    {{ updatesAvailableCount }}
                  </button>
                  <button v-if="recentlyUpdatedCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'recent-updated'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'recent-updated'">
                    <Check class="w-3 h-3" />
                    {{ recentlyUpdatedCount }}
                  </button>
                  <button v-if="recentlyAddedCount > 0"
                    class="px-2 py-1 text-[10px] rounded-md transition-all flex items-center gap-0.5" :class="modsFilter === 'recent-added'
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                    @click="modsFilter = 'recent-added'">
                    <Plus class="w-3 h-3" />
                    {{ recentlyAddedCount }}
                  </button>
                </div>

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
              <!-- Compact Header -->
              <div class="shrink-0 px-3 py-2 border-b border-border/20 bg-muted/10 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-muted-foreground">
                    {{ filteredInstalledMods.length }} installed
                    <span v-if="disabledModCount > 0" class="text-amber-500">({{ disabledModCount }} disabled)</span>
                  </span>
                  <span v-if="isCheckingAllUpdates" class="text-xs text-primary flex items-center gap-1">
                    <RefreshCw class="w-3 h-3 animate-spin" />
                    Checking...
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <!-- Sort buttons -->
                  <div class="flex rounded border border-border/30 overflow-hidden">
                    <button class="h-6 text-[10px] px-2 transition-colors" :class="sortBy === 'name'
                      ? 'bg-muted text-foreground'
                      : 'hover:bg-muted/50 text-muted-foreground'
                      " @click="toggleSort('name')">
                      Name
                    </button>
                    <button class="h-6 text-[10px] px-2 border-l border-border/30 transition-colors" :class="sortBy === 'version'
                      ? 'bg-muted text-foreground'
                      : 'hover:bg-muted/50 text-muted-foreground'
                      " @click="toggleSort('version')">
                      Version
                    </button>
                  </div>
                  <!-- Select All / Clear -->
                  <div v-if="currentMods.length > 0 && !isLinked" class="flex items-center gap-1 text-[10px]">
                    <button class="text-muted-foreground hover:text-foreground transition-colors"
                      @click="selectAll">All</button>
                    <span class="text-muted-foreground/50">|</span>
                    <button class="text-muted-foreground hover:text-foreground transition-colors"
                      @click="clearSelection">None</button>
                  </div>
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                <div v-for="mod in installedModsWithCompatibility" :key="mod.id"
                  class="flex items-center gap-2.5 p-2.5 rounded-lg border transition-all group cursor-pointer" :class="[
                    selectedModIds.has(mod.id)
                      ? 'bg-primary/10 border-primary/50 shadow-sm'
                      : !mod.isCompatible
                        ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15'
                        : mod.hasWarning
                          ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                          : 'border-transparent hover:bg-accent/50 hover:border-border/50',
                    disabledModIds.has(mod.id) ? 'opacity-50' : '',
                    isLinked ? 'cursor-default' : 'cursor-pointer',
                  ]" @click="!isLinked && toggleSelect(mod.id)" @dblclick.stop="openModDetails(mod)">
                  <!-- Mod Thumbnail -->
                  <div class="w-8 h-8 rounded-md bg-muted/50 overflow-hidden shrink-0 border border-border/30">
                    <img v-if="mod.thumbnail_url || mod.logo_url" :src="mod.thumbnail_url || mod.logo_url"
                      class="w-full h-full object-cover" alt="" loading="lazy"
                      @error="($event.target as HTMLImageElement).style.display = 'none'" />
                    <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/50">
                      <Layers v-if="mod.content_type === 'mod' || !mod.content_type" class="w-4 h-4" />
                      <Image v-else-if="mod.content_type === 'resourcepack'" class="w-4 h-4" />
                      <Sparkles v-else class="w-4 h-4" />
                    </div>
                  </div>

                  <!-- Checkbox -->
                  <div v-if="!isLinked"
                    class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors" :class="selectedModIds.has(mod.id)
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30 group-hover:border-muted-foreground/50'
                      ">
                    <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3 text-primary-foreground" />
                  </div>
                  <div v-else class="w-4 h-4 flex items-center justify-center shrink-0">
                    <div class="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"></div>
                  </div>

                  <!-- Enable/Disable Toggle -->
                  <button class="w-8 h-4 rounded-full relative shrink-0 transition-colors duration-150" :class="[
                    disabledModIds.has(mod.id)
                      ? 'bg-muted-foreground/30'
                      : 'bg-primary',
                    isLinked ? 'opacity-50 cursor-not-allowed' : '',
                  ]" @click.stop="!isLinked && toggleModEnabled(mod.id)" :title="isLinked
                    ? 'Managed by remote source'
                    : disabledModIds.has(mod.id)
                      ? 'Click to enable mod'
                      : 'Click to disable mod'
                    " :disabled="isLinked">
                    <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-150"
                      :class="disabledModIds.has(mod.id) ? 'left-0.5' : 'left-4'
                        " />
                  </button>

                  <!-- Mod Info -->
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm truncate flex items-center gap-1.5">
                      {{ mod.name }}
                      <!-- Recently Updated Badge -->
                      <span v-if="recentlyUpdatedMods.has(mod.id)"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium animate-pulse">
                        Updated
                      </span>
                      <!-- Recently Added Badge -->
                      <span v-else-if="recentlyAddedMods.has(mod.id)"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                        New
                      </span>
                      <span v-if="disabledModIds.has(mod.id)"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium">
                        disabled
                      </span>
                      <span v-if="!mod.isCompatible"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-500 font-medium">
                        incompatible
                      </span>
                      <span v-else-if="mod.hasWarning"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium"
                        title="This mod uses a different loader but may work via compatibility layers">
                        different loader
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <!-- Game versions (show list for ALL content types if available) -->
                      <span v-if="mod.game_versions && mod.game_versions.length >= 1"
                        class="text-[10px] px-1.5 py-0.5 rounded-md font-medium" :class="mod.isCompatible
                          ? 'bg-primary/15 text-primary'
                          : 'bg-red-500/15 text-red-500'
                          " :title="mod.game_versions.join(', ')">
                        {{ mod.game_versions.slice(0, 2).join(", ")
                        }}{{
                          mod.game_versions.length > 2
                            ? ` +${mod.game_versions.length - 2}`
                            : ""
                        }}
                      </span>
                      <span v-else-if="mod.game_version && mod.game_version !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md font-medium" :class="mod.isCompatible
                          ? 'bg-primary/15 text-primary'
                          : 'bg-red-500/15 text-red-500'
                          ">
                        {{ mod.game_version }}
                      </span>
                      <span v-if="mod.loader && mod.loader !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md font-medium capitalize" :class="!mod.isCompatible
                          ? 'bg-red-500/15 text-red-500'
                          : mod.hasWarning
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-muted text-muted-foreground'
                          ">
                        {{ mod.loader }}
                      </span>
                      <span v-if="mod.version"
                        class="text-[10px] text-muted-foreground truncate max-w-[100px] font-mono" :title="mod.version">
                        {{ mod.version }}
                      </span>
                    </div>
                    <div v-if="!mod.isCompatible && mod.incompatibilityReason"
                      class="text-[10px] text-red-500 mt-0.5 truncate" :title="mod.incompatibilityReason">
                      {{ mod.incompatibilityReason }}
                    </div>
                    <div v-else-if="mod.hasWarning && mod.incompatibilityReason"
                      class="text-[10px] text-amber-500 mt-0.5 truncate" :title="mod.incompatibilityReason">
                      {{ mod.incompatibilityReason }}
                    </div>
                  </div>

                  <!-- Update Actions -->
                  <div v-if="!isLinked && mod.cf_project_id" class="flex items-center gap-0.5">
                    <!-- Quick Update Button (when update available) -->
                    <Button v-if="updateAvailable[mod.id] && !checkingUpdates[mod.id]" variant="ghost" size="icon"
                      class="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10 transition-all duration-150 shrink-0"
                      :title="`Update to ${updateAvailable[mod.id].displayName}`" @click.stop="quickUpdateMod(mod)">
                      <ArrowUpCircle class="w-3.5 h-3.5" />
                    </Button>

                    <!-- Checking Indicator -->
                    <div v-else-if="checkingUpdates[mod.id]" class="h-7 w-7 flex items-center justify-center shrink-0"
                      title="Checking for updates...">
                      <RefreshCw class="w-3.5 h-3.5 animate-spin text-primary" />
                    </div>

                    <!-- Up to date indicator (checked, no update) -->
                    <div v-else-if="updateAvailable[mod.id] === null"
                      class="h-7 w-7 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100"
                      title="Up to date">
                      <Check class="w-3.5 h-3.5 text-muted-foreground/50" />
                    </div>

                    <!-- Unchecked - show nothing, auto-check runs in background -->
                  </div>

                  <!-- Change Version Button -->
                  <Button v-if="!isLinked && mod.cf_project_id" variant="ghost" size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Change version" @click.stop="openVersionPicker(mod)">
                    <GitBranch class="w-3.5 h-3.5" />
                  </Button>

                  <!-- Remove Button -->
                  <Button v-if="!isLinked" variant="ghost" size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    @click.stop="removeMod(mod.id)">
                    <Trash2 class="w-3.5 h-3.5" />
                  </Button>
                  <div v-else
                    class="h-7 w-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Managed by remote source">
                    <Lock class="w-3.5 h-3.5 text-muted-foreground/50" />
                  </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredInstalledMods.length === 0" class="p-8 text-center">
                  <Layers v-if="contentTypeTab === 'mods'" class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <Image v-else-if="contentTypeTab === 'resourcepacks'"
                    class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <Sparkles v-else class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p class="text-sm text-muted-foreground">
                    {{
                      searchQueryInstalled
                        ? "No matching items"
                        : contentTypeTab === "mods"
                          ? "No mods in this pack yet"
                          : contentTypeTab === "resourcepacks"
                            ? "No resource packs in this pack yet"
                            : "No shaders in this pack yet"
                    }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Right: Available Mods (Library) -->
            <div v-if="!isLibraryCollapsed" class="flex flex-col bg-muted/5 transition-all duration-150 w-[40%]">
              <!-- Header -->
              <div class="shrink-0 px-3 py-2 border-b border-border/20 bg-muted/10">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Package class="w-3.5 h-3.5 text-muted-foreground" />
                    <span class="text-xs font-medium">Library</span>
                    <span class="text-[10px] text-primary">{{ compatibleCount }}</span>
                    <span v-if="warningAvailableCount > 0" class="text-[10px] text-amber-500"
                      title="Mods with different loader">
                      +{{ warningAvailableCount }} other loader
                    </span>
                  </div>
                  <button @click="isLibraryCollapsed = true"
                    class="p-1 rounded hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground"
                    title="Collapse Library">
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div class="relative mt-2">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <input v-model="searchQueryAvailable" placeholder="Search library..."
                    class="w-full h-7 pl-7 pr-3 text-xs rounded-md bg-muted/50 border-none focus:ring-1 focus:ring-primary outline-none transition-all duration-150" />
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                <div v-for="mod in filteredAvailableMods" :key="mod.id"
                  class="flex items-center justify-between p-2 rounded-lg transition-all duration-150 relative" :class="mod.isCompatible
                    ? mod.hasWarning
                      ? 'hover:bg-amber-500/10 cursor-pointer group border border-amber-500/20'
                      : 'hover:bg-accent/50 cursor-pointer group'
                    : 'opacity-40'
                    " @dblclick.stop="openModDetails(mod)">
                  <!-- Mod Info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm truncate">{{
                        mod.name
                      }}</span>
                      <AlertCircle v-if="!mod.isCompatible" class="w-3.5 h-3.5 text-red-500 shrink-0"
                        title="Incompatible" />
                      <AlertTriangle v-else-if="mod.hasWarning" class="w-3.5 h-3.5 text-amber-500 shrink-0"
                        title="Different loader" />
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <!-- Game versions (show list for ALL content types if available) -->
                      <span v-if="mod.game_versions && mod.game_versions.length >= 1"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium"
                        :title="mod.game_versions.join(', ')">
                        {{ mod.game_versions.slice(0, 2).join(", ")
                        }}{{
                          mod.game_versions.length > 2
                            ? ` +${mod.game_versions.length - 2}`
                            : ""
                        }}
                      </span>
                      <span v-else-if="mod.game_version && mod.game_version !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
                        {{ mod.game_version }}
                      </span>
                      <span v-if="mod.loader && mod.loader !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md font-medium capitalize"
                        :class="mod.hasWarning ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'">
                        {{ mod.loader }}
                      </span>
                      <span v-if="mod.version" class="text-[10px] text-muted-foreground truncate max-w-[80px] font-mono"
                        :title="mod.version">
                        {{ mod.version }}
                      </span>
                      <span v-if="!mod.isCompatible" class="text-[10px] text-red-500 italic">
                        {{ mod.incompatibilityReason }}
                      </span>
                      <span v-else-if="mod.hasWarning" class="text-[10px] text-amber-500 italic">
                        {{ mod.incompatibilityReason }}
                      </span>
                    </div>
                  </div>

                  <!-- Add Button - Now also enabled for warning mods -->
                  <Button v-if="mod.isCompatible && !isLinked" variant="ghost" size="icon"
                    class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    :class="mod.hasWarning ? 'text-amber-500 hover:bg-amber-500/10' : 'text-primary hover:bg-primary/10'"
                    @click.stop="addMod(mod.id)"
                    :title="mod.hasWarning ? 'Add (different loader - may need compatibility mod)' : 'Add to modpack'">
                    <Plus class="w-4 h-4" />
                  </Button>
                  <Lock v-else class="w-4 h-4 text-muted-foreground/50 shrink-0 mr-2" :title="isLinked ? 'Managed by remote source' : 'Incompatible'
                    " />
                </div>

                <!-- Empty State -->
                <div v-if="filteredAvailableMods.length === 0" class="p-8 text-center">
                  <Package class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p class="text-sm text-muted-foreground">
                    No
                    {{
                      contentTypeTab === "mods"
                        ? "mods"
                        : contentTypeTab === "resourcepacks"
                          ? "resource packs"
                          : "shaders"
                    }}
                    available to add
                  </p>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Discover Tab -->
        <div v-else-if="activeTab === 'discover'" class="flex-1 overflow-hidden">
          <RecommendationsPanel :modpack-id="modpackId" :is-linked="isLinked" @add-mod="handleAddModFromAnalysis" />
        </div>

        <!-- Health Tab (Analysis) -->
        <div v-else-if="activeTab === 'health'" class="flex-1 overflow-hidden">
          <ModpackAnalysisPanel :modpack-id="modpackId" :is-linked="isLinked" @add-mod="handleAddModFromAnalysis"
            @refresh="loadData" />
        </div>

        <!-- Version History Tab -->
        <div v-else-if="activeTab === 'versions'" class="flex-1 p-6 overflow-auto">
          <VersionHistoryPanel v-if="modpack" :modpack-id="modpackId" :modpack-name="modpack.name"
            :instance-id="linkedInstanceId || undefined" :is-linked="isLinked" @refresh="refreshAndNotify" />
        </div>

        <!-- Profiles Tab -->
        <div v-else-if="activeTab === 'profiles'" class="flex-1 p-6 overflow-auto">
          <ProfilesPanel v-if="modpack" :modpack="modpack" :is-linked="isLinked" @refresh="loadData" />
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
                      <option v-for="v in gameVersions" :key="v" :value="v">
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
                          :value="extractLoaderVersion(lv.name)">
                          {{ extractLoaderVersion(lv.name) }}{{ lv.recommended ? ' (Recommended)' : lv.latest ? ' (Latest)' : '' }}
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
                    <Button variant="outline" size="sm" class="gap-2 w-full sm:w-auto" @click="exportManifest">
                      <Share2 class="w-3.5 h-3.5" />
                      Export Manifest JSON
                    </Button>
                    <p class="text-xs text-muted-foreground mt-2">
                      Generates a .json file you can upload to Gist/GitHub to
                      act as the "Master" version.
                    </p>
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
          <ul class="text-sm space-y-1 ml-6">
            <li v-for="mod in dependencyImpact?.dependentMods.filter(d => d.willBreak)" :key="mod.id">
              {{ mod.name }}
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
          Do you want to continue?
        </p>
      </div>

      <template #footer>
        <div class="flex gap-2">
          <Button variant="secondary" @click="cancelDependencyImpactAction">Cancel</Button>
          <Button :variant="dependencyImpact?.action === 'remove' ? 'destructive' : 'outline'"
            @click="confirmDependencyImpactAction">
            {{ dependencyImpact?.action === 'remove' ? 'Remove Anyway' : 'Disable Anyway' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <ModUpdateDialog :open="showSingleModUpdateDialog" :mod="selectedUpdateMod" :modpack-id="modpackId"
      :minecraft-version="modpack?.minecraft_version" :loader="modpack?.loader"
      @close="showSingleModUpdateDialog = false" @updated="handleSingleModUpdated" />

    <!-- CurseForge Browse Dialog -->
    <CurseForgeSearch :open="showCFSearch" :game-version="modpack?.minecraft_version" :mod-loader="modpack?.loader"
      :initial-content-type="contentTypeTab" :locked-modpack-id="modpackId" :lock-filters="true"
      @close="handleCFSearchClose" @added="handleCFModAdded" />

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
    }" :current-file-id="modDetailsTarget?.cf_file_id" @close="closeModDetails"
      @version-changed="handleModDetailsVersionChange" />

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
              <h3 class="font-semibold text-foreground">Sync Before Launch?</h3>
              <p class="text-sm text-muted-foreground">Instance is out of sync</p>
            </div>
          </div>
        </div>

        <div class="px-5 py-4 space-y-3">
          <p class="text-sm text-muted-foreground">
            <span class="font-medium text-foreground">{{ pendingLaunchData?.differences || 0 }} differences</span>
            detected between modpack and instance.
          </p>

          <div v-if="pendingLaunchData?.lastSynced" class="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock class="w-3.5 h-3.5" />
            Last sync: {{ formatPlayDate(pendingLaunchData.lastSynced) }}
          </div>

          <div class="bg-muted/30 rounded-lg p-3 space-y-2">
            <div class="flex items-start gap-2">
              <Download class="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div class="text-sm">
                <span class="text-foreground font-medium">Sync</span>
                <span class="text-muted-foreground"> - Update mods before launching</span>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <Play class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div class="text-sm">
                <span class="text-foreground font-medium">Launch Anyway</span>
                <span class="text-muted-foreground"> - Play with current mods</span>
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
            Launch
          </button>
          <button @click="handleSyncConfirmation('sync')"
            class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors duration-150 flex items-center justify-center gap-2">
            <Download class="w-4 h-4" />
            Sync & Launch
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
  @apply px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all duration-150 whitespace-nowrap;
}

.tab-pill-active {
  @apply bg-primary text-primary-foreground shadow-sm shadow-primary/20;
}

.tab-pill-play {
  @apply bg-primary shadow-primary/20;
}

.tab-pill-inactive {
  @apply text-muted-foreground hover:text-foreground hover:bg-muted/40;
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
</style>
