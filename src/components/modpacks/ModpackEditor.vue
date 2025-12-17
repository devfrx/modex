<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
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
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
import ModUpdateDialog from "@/components/mods/ModUpdateDialog.vue";
import VersionHistoryPanel from "@/components/modpacks/VersionHistoryPanel.vue";
import ModpackAnalysisPanel from "@/components/modpacks/ModpackAnalysisPanel.vue";
import RecommendationsPanel from "@/components/modpacks/RecommendationsPanel.vue";
import ProfilesPanel from "@/components/modpacks/ProfilesPanel.vue";
import UpdateReviewDialog from "@/components/modpacks/UpdateReviewDialog.vue";
import UpdateAvailableBanner from "@/components/modpacks/UpdateAvailableBanner.vue";
import {
  remoteUpdateService,
  UpdateResult,
} from "@/services/RemoteUpdateService";
import type { Mod, Modpack, ModpackChange } from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update"): void;
  (e: "export"): void;
  (e: "updated"): void;
}>();

const toast = useToast();

const modpack = ref<Modpack | null>(null);
const currentMods = ref<Mod[]>([]);
const availableMods = ref<Mod[]>([]);
const disabledModIds = ref<Set<string>>(new Set());
const searchQueryInstalled = ref("");
const searchQueryAvailable = ref("");
const isLoading = ref(true);
const sortBy = ref<"name" | "version">("name");
const sortDir = ref<"asc" | "desc">("asc");
const selectedModIds = ref<Set<string>>(new Set());
const showUpdatesDialog = ref(false);
const showSingleModUpdateDialog = ref(false);
const selectedUpdateMod = ref<any>(null);
const isSaving = ref(false);
const modsFilter = ref<"all" | "incompatible" | "disabled">("all");
const activeTab = ref<
  | "mods"
  | "discover"
  | "health"
  | "versions"
  | "profiles"
  | "settings"
  | "remote"
>("mods");
const contentTypeTab = ref<"mods" | "resourcepacks" | "shaders">("mods");

// Help Guide State
const showHelp = ref(false);

// Linked instance (for config sync in version control)
const linkedInstanceId = ref<string | null>(null);

// Confirm dialog state for removing incompatible mods
const showRemoveIncompatibleDialog = ref(false);

// Remote Updates
const showReviewDialog = ref(false);
const updateResult = ref<UpdateResult | null>(null);
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

// Check if modpack exists (not a new one being created)
const isExistingModpack = computed(() => {
  return modpack.value !== null && modpack.value.id !== undefined;
});

// Check if modpack is linked to a remote source (Read-Only mode)
const isLinked = computed(() => {
  return !!modpack.value?.remote_source?.url;
});

// Check mod compatibility with modpack
function isModCompatible(mod: Mod): { compatible: boolean; reason?: string } {
  if (!modpack.value) return { compatible: true };

  const modContentType = mod.content_type || "mod";
  const packVersion = modpack.value.minecraft_version;
  const modVersion = mod.game_version;

  // Only check loader for mods (resourcepacks and shaders don't have loaders)
  if (modContentType === "mod") {
    const packLoader = modpack.value.loader?.toLowerCase();
    const modLoader = mod.loader?.toLowerCase();

    // Check loader compatibility
    if (packLoader && modLoader && modLoader !== "unknown") {
      const isNeoForgeForgeCompat =
        (packLoader === "neoforge" && modLoader === "forge") ||
        (packLoader === "forge" && modLoader === "neoforge");

      if (modLoader !== packLoader && !isNeoForgeForgeCompat) {
        return {
          compatible: false,
          reason: `Requires ${modLoader}, modpack uses ${packLoader}`,
        };
      }
    }
  }

  // Check MC version compatibility
  if (packVersion && modVersion && modVersion !== "unknown") {
    // For shaders/resourcepacks, check if packVersion is in the game_versions array
    if (
      modContentType !== "mod" &&
      mod.game_versions &&
      mod.game_versions.length > 0
    ) {
      const isVersionCompatible = mod.game_versions.some(
        (gv) =>
          gv === packVersion ||
          gv.startsWith(packVersion) ||
          packVersion.startsWith(gv)
      );
      if (!isVersionCompatible) {
        return {
          compatible: false,
          reason: `Supports MC ${mod.game_versions.slice(0, 3).join(", ")}${mod.game_versions.length > 3 ? "..." : ""
            }, modpack is ${packVersion}`,
        };
      }
    } else {
      // Standard single version check for mods or items without game_versions array
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
    if (modsFilter.value === "disabled") {
      return disabledModIds.value.has(m.id);
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

// Update Checking
const checkingUpdates = ref<Record<string, boolean>>({});
const updateAvailable = ref<Record<string, any>>({});

function openSingleModUpdate(mod: any) {
  selectedUpdateMod.value = mod;
  showSingleModUpdateDialog.value = true;
}

function handleSingleModUpdated() {
  loadData();
  emit("update");
  if (selectedUpdateMod.value) {
    if (updateAvailable.value[selectedUpdateMod.value.id]) {
      delete updateAvailable.value[selectedUpdateMod.value.id];
    }
  }
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
    const result = await window.api.updates.applyUpdate(mod.id, latest.id);
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
  () => filteredAvailableMods.value.filter((m) => m.isCompatible).length
);
const incompatibleCount = computed(
  () => filteredAvailableMods.value.filter((m) => !m.isCompatible).length
);

// Count of enabled mods
const enabledModCount = computed(() => {
  return currentMods.value.filter((m) => !disabledModIds.value.has(m.id))
    .length;
});

async function loadData() {
  if (!props.modpackId) return;
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
        remote_url: pack.remote_source?.url || "",
        auto_check_remote: pack.remote_source?.auto_check || false,
      };

      // Auto-check for updates if enabled
      if (pack.remote_source?.url && pack.remote_source.auto_check) {
        checkForRemoteUpdates();
      }
    }
  } catch (err) {
    console.error("Failed to load modpack data:", err);
  } finally {
    isLoading.value = false;
  }
}

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

    if (impact.dependentMods.filter(d => d.willBreak).length > 0 || impact.orphanedDependencies.length > 0) {
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

  for (const modId of selectedModIds.value) {
    if (disabledModIds.value.has(modId)) {
      try {
        await window.api.modpacks.toggleMod(props.modpackId, modId);
        disabledModIds.value.delete(modId);
      } catch (err) {
        console.error(`Failed to enable mod ${modId}:`, err);
      }
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  emit("update");
  toast.success("Mods Enabled", `Enabled ${selectedModIds.value.size} mod(s)`);
}

async function bulkDisableSelected() {
  if (selectedModIds.value.size === 0 || isLinked.value) return;

  for (const modId of selectedModIds.value) {
    if (!disabledModIds.value.has(modId)) {
      try {
        await window.api.modpacks.toggleMod(props.modpackId, modId);
        disabledModIds.value.add(modId);
      } catch (err) {
        console.error(`Failed to disable mod ${modId}:`, err);
      }
    }
  }
  disabledModIds.value = new Set(disabledModIds.value);
  emit("update");
  toast.success(
    "Mods Disabled",
    `Disabled ${selectedModIds.value.size} mod(s)`
  );
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

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) loadData();
  },
  { immediate: true }
);

watch(
  () => props.modpackId,
  () => {
    if (props.isOpen) loadData();
  }
);
</script>

<template>
  <div v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
    <div
      class="bg-background border border-border/50 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

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
          <div class="px-6 py-4 flex items-start gap-5">
            <!-- Pack Info with larger thumbnail -->
            <div class="flex items-start gap-4 min-w-0 flex-1">
              <!-- Thumbnail - Larger -->
              <div v-if="modpack?.image_url"
                class="w-16 h-16 rounded-xl overflow-hidden ring-2 ring-white/10 shadow-lg shrink-0">
                <img :src="modpack.image_url.startsWith('http') ||
                  modpack.image_url.startsWith('file:')
                  ? modpack.image_url
                  : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
                  " class="w-full h-full object-cover" />
              </div>
              <div v-else
                class="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-2 ring-white/10 shadow-lg shrink-0">
                <Package class="w-8 h-8 text-primary" />
              </div>

              <!-- Name & Meta -->
              <div class="min-w-0 flex-1 py-1">
                <div class="flex items-center gap-3 mb-2">
                  <h2 class="text-xl font-bold truncate text-foreground">
                    {{ modpack?.name || "Loading..." }}
                  </h2>
                  <span v-if="modpack?.version"
                    class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                    v{{ modpack.version }}
                  </span>
                  <span v-if="modpack?.remote_source?.url"
                    class="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[10px] font-medium border border-purple-500/20 flex items-center gap-1"
                    title="This modpack is linked to a remote source">
                    <Share2 class="w-3 h-3" />
                    Linked
                  </span>
                </div>

                <!-- Stats Row -->
                <div class="flex items-center gap-3 flex-wrap">
                  <div v-if="modpack?.minecraft_version"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span class="text-xs font-medium text-emerald-400">{{ modpack.minecraft_version }}</span>
                  </div>
                  <div v-if="modpack?.loader"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span class="text-xs font-medium text-blue-400 capitalize">{{ modpack.loader }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 border border-border/50">
                    <Layers class="w-3.5 h-3.5 text-muted-foreground" />
                    <span class="text-xs font-medium text-muted-foreground">{{ currentMods.length }} mods</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions - Vertical Stack Style -->
            <div class="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" class="h-9 w-9 p-0 rounded-lg" @click="selectImage"
                title="Set cover image">
                <ImagePlus class="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" class="h-9 w-9 p-0 rounded-lg"
                :disabled="!modpack?.minecraft_version || !modpack?.loader" :title="!modpack?.minecraft_version || !modpack?.loader
                  ? 'Set version and loader first'
                  : 'Check updates'
                  " @click="showUpdatesDialog = true">
                <ArrowUpCircle class="w-4 h-4" />
              </Button>
              <div class="w-px h-6 bg-border/50 mx-1"></div>
              <Button variant="outline" size="sm" class="h-9 px-3 gap-2 rounded-lg" @click="$emit('export')">
                <Download class="w-4 h-4" />
                <span>Export</span>
              </Button>
              <Button variant="ghost" size="sm" class="h-9 w-9 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-400"
                @click="$emit('close')">
                <X class="w-5 h-5" />
              </Button>
            </div>
          </div>

          <!-- Remote Update Banner -->
          <div v-if="updateResult?.hasUpdate" class="px-6 pb-4">
            <UpdateAvailableBanner :current-version="modpack?.version || 'unknown'" :new-version="updateResult.remoteManifest?.modpack.version || 'unknown'
              " :is-checking="isCheckingUpdate" @update="showReviewDialog = true" />
          </div>

          <!-- Tab Navigation - Modern Segment Style -->
          <div class="px-6 pb-4">
            <div class="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border/30 w-fit">
              <button class="tab-pill" :class="activeTab === 'mods' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'mods'">
                <Layers class="w-4 h-4" />
                <span>Resources</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'discover' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'discover'">
                <Sparkles class="w-4 h-4" />
                <span>Discover</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'health' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'health'">
                <AlertCircle class="w-4 h-4" />
                <span>Health</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'versions' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'versions'">
                <GitBranch class="w-4 h-4" />
                <span>History</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'profiles' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'profiles'">
                <Users class="w-4 h-4" />
                <span>Profiles</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'remote' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'remote'">
                <Globe class="w-4 h-4" />
                <span>Remote</span>
              </button>
              <button class="tab-pill" :class="activeTab === 'settings' ? 'tab-pill-active' : 'tab-pill-inactive'"
                @click="activeTab = 'settings'">
                <Settings class="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom border -->
        <div
          class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent">
        </div>
      </div>

      <!-- Help Guide Banner (collapsible) -->
      <div class="shrink-0 border-b border-border/30">
        <!-- Help Toggle Button -->
        <button @click="showHelp = !showHelp"
          class="w-full px-6 py-2 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors">
          <div class="flex items-center gap-2">
            <HelpCircle class="w-4 h-4 text-primary" />
            <span class="text-muted-foreground">
              <span class="font-medium text-foreground">Need help?</span>
              Click to see how to use this section
            </span>
          </div>
          <ChevronDown :class="['w-4 h-4 text-muted-foreground transition-transform', showHelp && 'rotate-180']" />
        </button>

        <!-- Help Content (expanded) -->
        <div v-if="showHelp" class="px-6 pb-4 pt-2 bg-muted/20 border-t border-border/20">
          <!-- Resources Tab Help -->
          <div v-if="activeTab === 'mods'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-foreground mb-2">📦 Resources - Manage Your Mod Content</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  This is where you manage all the mods, resource packs, and shaders in your modpack.
                </p>

                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <span
                        class="w-5 h-5 rounded bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xs">1</span>
                      Left Panel: Your Installed Content
                    </h5>
                    <ul class="space-y-1 text-muted-foreground ml-6 list-disc">
                      <li><b>Toggle ON/OFF:</b> Click the green switch to enable/disable mods</li>
                      <li><b>Checkbox:</b> Select multiple mods for bulk actions</li>
                      <li><b>Trash icon:</b> Remove a mod from the modpack</li>
                      <li><b>Search:</b> Filter by name</li>
                      <li><b>Quick filters:</b> Show all, only incompatible, or only disabled</li>
                    </ul>
                  </div>

                  <div class="space-y-2">
                    <h5 class="font-medium text-foreground flex items-center gap-1.5">
                      <span
                        class="w-5 h-5 rounded bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs">2</span>
                      Right Panel: Your Library
                    </h5>
                    <ul class="space-y-1 text-muted-foreground ml-6 list-disc">
                      <li><b>Green mods:</b> Compatible with your modpack version</li>
                      <li><b>Dimmed mods:</b> Incompatible (wrong version or loader)</li>
                      <li><b>+ Button:</b> Click to add a compatible mod</li>
                      <li><b>Lock icon:</b> Cannot be added (incompatible)</li>
                    </ul>
                  </div>
                </div>

                <div
                  class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <Lightbulb class="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>Tip:</b> Use the sub-tabs above to switch between Mods, Resource Packs, and Shaders!</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Discover Tab Help -->
          <div v-else-if="activeTab === 'discover'" class="help-content">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">✨ Discover - Find New Content</h4>
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
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">🏥 Health - Diagnose Modpack Issues</h4>
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
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">📜 History - Version Control</h4>
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
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">👥 Profiles - Save Mod Configurations</h4>
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
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">🌐 Remote - Updates & Collaboration</h4>
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
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen class="w-5 h-5 text-primary" />
              </div>
              <div class="flex-1">
                <h4 class="font-semibold text-foreground mb-2">⚙️ Settings - Modpack Configuration</h4>
                <p class="text-sm text-muted-foreground mb-3">
                  Basic settings for your modpack. Some settings are locked after creation to prevent issues.
                </p>

                <div class="space-y-2 text-sm">
                  <ul class="space-y-1 text-muted-foreground list-disc ml-4">
                    <li><b>Name:</b> The display name of your modpack</li>
                    <li><b>Version:</b> Your modpack's version number (e.g., 1.0.0)</li>
                    <li><b>Minecraft Version:</b> The game version (🔒 locked after creation)</li>
                    <li><b>Mod Loader:</b> Forge, Fabric, NeoForge, or Quilt (🔒 locked after creation)</li>
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
        <!-- Mods Tab -->
        <template v-if="activeTab === 'mods'">
          <!-- Content Type Sub-tabs -->
          <div class="shrink-0 px-4 py-2 border-b border-border/30 bg-muted/10 flex items-center gap-1">
            <button class="px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5" :class="contentTypeTab === 'mods'
              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
              : 'hover:bg-muted text-muted-foreground'
              " @click="contentTypeTab = 'mods'">
              <Layers class="w-3.5 h-3.5" />
              Mods
              <span class="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10">{{
                contentTypeCounts.mods
              }}</span>
            </button>
            <button class="px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5" :class="contentTypeTab === 'resourcepacks'
              ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
              : 'hover:bg-muted text-muted-foreground'
              " @click="contentTypeTab = 'resourcepacks'">
              <Image class="w-3.5 h-3.5" />
              Resource Packs
              <span class="text-[10px] px-1 py-0.5 rounded bg-blue-500/10">{{
                contentTypeCounts.resourcepacks
              }}</span>
            </button>
            <button class="px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5" :class="contentTypeTab === 'shaders'
              ? 'bg-pink-500/15 text-pink-500 border border-pink-500/30'
              : 'hover:bg-muted text-muted-foreground'
              " @click="contentTypeTab = 'shaders'">
              <Sparkles class="w-3.5 h-3.5" />
              Shaders
              <span class="text-[10px] px-1 py-0.5 rounded bg-pink-500/10">{{
                contentTypeCounts.shaders
              }}</span>
            </button>
          </div>

          <!-- Content Split View -->
          <div class="flex-1 flex overflow-hidden">
            <!-- Left: Installed Mods -->
            <div class="w-1/2 border-r border-border/50 flex flex-col">
              <!-- Header -->
              <div class="shrink-0 p-3 border-b border-border/30 bg-muted/20">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-sm">Installed</span>
                    <span class="text-xs text-muted-foreground">
                      {{ filteredInstalledMods.length
                      }}<span v-if="disabledModCount > 0" class="text-amber-500">
                        (+{{ disabledModCount }} disabled)</span>
                    </span>
                    <span v-if="incompatibleModCount > 0" class="text-xs text-red-500 font-medium">
                      ({{ incompatibleModCount }} incompatible)
                    </span>
                  </div>
                  <!-- Bulk Actions -->
                  <div v-if="selectedModIds.size > 0 && !isLinked" class="flex items-center gap-1">
                    <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 text-emerald-500 hover:text-emerald-600"
                      @click="bulkEnableSelected" title="Enable selected">
                      <ToggleRight class="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" class="h-7 text-xs gap-1 text-amber-500 hover:text-amber-600"
                      @click="bulkDisableSelected" title="Disable selected">
                      <ToggleLeft class="w-3 h-3" />
                    </Button>
                    <Button variant="destructive" size="sm" class="h-7 text-xs gap-1" @click="removeSelectedMods">
                      <Trash2 class="w-3 h-3" />
                      {{ selectedModIds.size }}
                    </Button>
                  </div>
                </div>

                <!-- Quick Filters -->
                <div class="flex items-center gap-1 mb-2">
                  <button class="h-6 text-[10px] px-2 rounded transition-colors" :class="modsFilter === 'all'
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                    " @click="modsFilter = 'all'">
                    All
                  </button>
                  <button v-if="incompatibleModCount > 0" class="h-6 text-[10px] px-2 rounded transition-colors" :class="modsFilter === 'incompatible'
                    ? 'bg-red-500/15 text-red-500 font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                    " @click="modsFilter = 'incompatible'">
                    <AlertCircle class="w-3 h-3 inline mr-0.5" />
                    Incompatible ({{ incompatibleModCount }})
                  </button>
                  <button v-if="disabledModCount > 0" class="h-6 text-[10px] px-2 rounded transition-colors" :class="modsFilter === 'disabled'
                    ? 'bg-amber-500/15 text-amber-500 font-medium'
                    : 'hover:bg-muted text-muted-foreground'
                    " @click="modsFilter = 'disabled'">
                    Disabled ({{ disabledModCount }})
                  </button>

                  <!-- Remove all incompatible mods button -->
                  <button v-if="incompatibleModCount > 0 && !isLinked"
                    class="h-6 text-[10px] px-2.5 rounded transition-colors ml-auto flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
                    @click="removeIncompatibleMods" title="Remove all incompatible mods from this modpack">
                    <Trash2 class="w-3 h-3" />
                    <span>Remove All Incompatible</span>
                  </button>
                </div>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input v-model="searchQueryInstalled" placeholder="Search installed..."
                      class="w-full h-8 pl-8 pr-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
                  </div>
                  <div class="flex rounded-lg border border-border/50 overflow-hidden">
                    <button class="h-8 text-xs px-3 transition-colors" :class="sortBy === 'name'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted'
                      " @click="toggleSort('name')">
                      Name
                    </button>
                    <button class="h-8 text-xs px-3 border-l border-border/50 transition-colors" :class="sortBy === 'version'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted'
                      " @click="toggleSort('version')">
                      Version
                    </button>
                  </div>
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                <div v-for="mod in installedModsWithCompatibility" :key="mod.id"
                  class="flex items-center gap-3 p-2.5 rounded-lg border transition-all group cursor-pointer" :class="[
                    selectedModIds.has(mod.id)
                      ? 'bg-primary/10 border-primary/50 shadow-sm'
                      : !mod.isCompatible
                        ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15'
                        : 'border-transparent hover:bg-accent/50 hover:border-border/50',
                    disabledModIds.has(mod.id) ? 'opacity-50' : '',
                    isLinked ? 'cursor-default' : 'cursor-pointer',
                  ]" @click="!isLinked && toggleSelect(mod.id)">
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
                  <button class="w-8 h-4 rounded-full relative shrink-0 transition-colors" :class="[
                    disabledModIds.has(mod.id)
                      ? 'bg-muted-foreground/30'
                      : 'bg-emerald-500',
                    isLinked ? 'opacity-50 cursor-not-allowed' : '',
                  ]" @click.stop="!isLinked && toggleModEnabled(mod.id)" :title="isLinked
                    ? 'Managed by remote source'
                    : disabledModIds.has(mod.id)
                      ? 'Click to enable mod'
                      : 'Click to disable mod'
                    " :disabled="isLinked">
                    <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all" :class="disabledModIds.has(mod.id) ? 'left-0.5' : 'left-4'
                      " />
                  </button>

                  <!-- Mod Info -->
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm truncate flex items-center gap-1.5">
                      {{ mod.name }}
                      <span v-if="disabledModIds.has(mod.id)"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium">
                        disabled
                      </span>
                      <span v-if="!mod.isCompatible"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-500 font-medium">
                        incompatible
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <!-- Game versions (show list for shaders/resourcepacks if available) -->
                      <span v-if="
                        mod.content_type !== 'mod' &&
                        mod.game_versions &&
                        mod.game_versions.length >= 1
                      " class="text-[10px] px-1.5 py-0.5 rounded-md font-medium" :class="mod.isCompatible
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-red-500/15 text-red-500'
                        " :title="mod.game_versions.join(', ')">
                        {{ mod.game_versions.slice(0, 2).join(", ")
                        }}{{
                          mod.game_versions.length > 2
                            ? ` +${mod.game_versions.length - 2}`
                            : ""
                        }}
                      </span>
                      <span v-else-if="
                        mod.game_version && mod.game_version !== 'unknown'
                      " class="text-[10px] px-1.5 py-0.5 rounded-md font-medium" :class="mod.isCompatible
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-red-500/15 text-red-500'
                        ">
                        {{ mod.game_version }}
                      </span>
                      <span v-if="mod.loader && mod.loader !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md font-medium capitalize" :class="mod.isCompatible
                          ? 'bg-blue-500/15 text-blue-500'
                          : 'bg-red-500/15 text-red-500'
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
                  </div>

                  <!-- Update Actions -->
                  <div v-if="!isLinked && mod.cf_project_id" class="flex items-center">
                    <!-- Update Available -->
                    <Button v-if="updateAvailable[mod.id]" variant="ghost" size="icon"
                      class="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 transition-all shrink-0"
                      :title="`Update to ${updateAvailable[mod.id].displayName
                        }`" @click.stop="openSingleModUpdate(mod)">
                      <Download class="w-3.5 h-3.5" />
                    </Button>

                    <!-- Checking -->
                    <div v-else-if="checkingUpdates[mod.id]" class="h-7 w-7 flex items-center justify-center shrink-0"
                      title="Checking for updates...">
                      <RefreshCw class="w-3.5 h-3.5 animate-spin text-primary" />
                    </div>

                    <!-- Check Button -->
                    <Button v-else variant="ghost" size="icon"
                      class="h-7 w-7 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="Check for update" @click.stop="openSingleModUpdate(mod)">
                      <RefreshCw class="w-3.5 h-3.5" />
                    </Button>
                  </div>

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

              <!-- Selection Footer -->
              <div v-if="currentMods.length > 0 && !isLinked"
                class="shrink-0 px-3 py-2 border-t border-border/30 bg-muted/10 flex items-center justify-between text-xs">
                <span class="text-muted-foreground">{{ selectedModIds.size }} of
                  {{ currentMods.length }} selected</span>
                <div class="flex gap-3">
                  <button class="text-muted-foreground hover:text-foreground transition-colors" @click="selectAll">
                    Select All
                  </button>
                  <button class="text-muted-foreground hover:text-foreground transition-colors" @click="clearSelection">
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <!-- Right: Available Mods -->
            <div class="w-1/2 flex flex-col bg-muted/5">
              <!-- Header -->
              <div class="shrink-0 p-3 border-b border-border/30 bg-muted/20">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-sm">Library</span>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-emerald-500">{{ compatibleCount }} compatible</span>
                    <span v-if="incompatibleCount > 0" class="text-amber-500">{{ incompatibleCount }}
                      incompatible</span>
                  </div>
                </div>
                <div class="relative">
                  <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input v-model="searchQueryAvailable" placeholder="Search library..."
                    class="w-full h-8 pl-8 pr-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
                </div>
              </div>

              <!-- Mod List -->
              <div class="flex-1 overflow-y-auto p-2 space-y-1">
                <div v-for="mod in filteredAvailableMods" :key="mod.id"
                  class="flex items-center justify-between p-2.5 rounded-lg transition-all relative" :class="mod.isCompatible
                    ? 'hover:bg-accent/50 cursor-pointer group'
                    : 'opacity-40'
                    ">
                  <!-- Mod Info -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm truncate">{{
                        mod.name
                      }}</span>
                      <AlertCircle v-if="!mod.isCompatible" class="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    </div>
                    <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <!-- Game versions (show list for shaders/resourcepacks if available) -->
                      <span v-if="
                        mod.content_type !== 'mod' &&
                        mod.game_versions &&
                        mod.game_versions.length >= 1
                      " class="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium"
                        :title="mod.game_versions.join(', ')">
                        {{ mod.game_versions.slice(0, 2).join(", ")
                        }}{{
                          mod.game_versions.length > 2
                            ? ` +${mod.game_versions.length - 2}`
                            : ""
                        }}
                      </span>
                      <span v-else-if="
                        mod.game_version && mod.game_version !== 'unknown'
                      " class="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium">
                        {{ mod.game_version }}
                      </span>
                      <span v-if="mod.loader && mod.loader !== 'unknown'"
                        class="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-500 font-medium capitalize">
                        {{ mod.loader }}
                      </span>
                      <span v-if="mod.version" class="text-[10px] text-muted-foreground truncate max-w-[80px] font-mono"
                        :title="mod.version">
                        {{ mod.version }}
                      </span>
                      <span v-if="!mod.isCompatible" class="text-[10px] text-amber-500 italic">
                        {{ mod.incompatibilityReason }}
                      </span>
                    </div>
                  </div>

                  <!-- Add Button -->
                  <Button v-if="mod.isCompatible && !isLinked" variant="ghost" size="icon"
                    class="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0 hover:bg-primary/10"
                    @click.stop="addMod(mod.id)">
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
            :instance-id="linkedInstanceId || undefined" @refresh="loadData" />
        </div>

        <!-- Profiles Tab -->
        <div v-else-if="activeTab === 'profiles'" class="flex-1 p-6 overflow-auto">
          <ProfilesPanel v-if="modpack" :modpack="modpack" @refresh="loadData" />
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
                <Download class="w-5 h-5 text-orange-500" />
                CurseForge Updates
              </h3>

              <div class="space-y-4">
                <!-- Current version info -->
                <div class="p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
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
                    class="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-medium text-green-400 text-sm flex items-center gap-2">
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

    <!-- Updates Dialog -->
    <UpdatesDialog :open="showUpdatesDialog" :modpack-id="modpackId" @close="showUpdatesDialog = false"
      @updated="loadData" />

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
        <div class="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
          <div class="flex items-center gap-3">
            <ArrowUpCircle class="w-8 h-8 text-green-500 shrink-0" />
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
  @apply px-4 py-2 text-sm font-medium rounded-full flex items-center gap-2 transition-all duration-200 whitespace-nowrap;
}

.tab-pill-active {
  @apply bg-primary text-primary-foreground shadow-md shadow-primary/25;
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
