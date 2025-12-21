<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import { useInstances } from "@/composables/useInstances";
import ModpackCard from "@/components/modpacks/ModpackCard.vue";
import ModpackListItem from "@/components/modpacks/ModpackListItem.vue";
import ModpackCompactCard from "@/components/modpacks/ModpackCompactCard.vue";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";
import ModpackCompareDialog from "@/components/modpacks/ModpackCompareDialog.vue";
import CreateModpackDialog from "@/components/modpacks/CreateModpackDialog.vue";
import ShareDialog from "@/components/modpacks/ShareDialog.vue";
import ConvertModpackDialog from "@/components/modpacks/ConvertModpackDialog.vue";
import CurseForgeModpackSearch from "@/components/modpacks/CurseForgeModpackSearch.vue";
import SyncModpackDialog from "@/components/modpacks/SyncModpackDialog.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import ProgressDialog from "@/components/ui/ProgressDialog.vue";
import BulkActionBar from "@/components/ui/BulkActionBar.vue";
import {
  PackagePlus,
  Download,
  Trash2,
  ArrowLeftRight,
  BarChart3,
  Heart,
  Share2,
  RefreshCw,
  Search,
  Copy,
  Upload,
  FolderOpen,
  Merge,
  Package,
  Globe,
  LayoutGrid,
  List,
  LayoutList,
  Filter,
  X,
  Flame,
} from "lucide-vue-next";
import type { Modpack, Mod } from "@/types/electron";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { getInstanceByModpack, createFromModpack, launchInstance, runningGames, loadInstances } = useInstances();

interface ModpackWithCount extends Modpack {
  modCount: number;
}

// Map instance to modpack for running game detection
const instanceToModpack = ref<Map<string, string>>(new Map());

const modpacks = ref<ModpackWithCount[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Selection State
const selectedModpackIds = ref<Set<string>>(new Set());

// Favorites
const favoriteModpacks = ref<Set<string>>(new Set());

// Quick filter
const quickFilter = ref<"all" | "favorites">("all");
const searchQuery = ref("");
const sortBy = ref<"name" | "updated" | "mods" | "created">("name");
const sortDir = ref<"asc" | "desc">("asc");

// View Mode
const viewMode = ref<"grid" | "list" | "compact">("grid");

// Filter State
const showFilters = ref(false);
const selectedLoader = ref<string>("all");
const selectedGameVersion = ref<string>("all");
const sourceFilter = ref<"all" | "curseforge" | "local">("all");

// Settings persistence key
const SETTINGS_KEY = "modex:modpacks:settings";

// Editor State
const showEditor = ref(false);
const selectedModpackId = ref<string | null>(null);

// Compare State
const showCompare = ref(false);
const comparePackA = ref<string | null>(null);
const comparePackB = ref<string | null>(null);

// Delete State
const showDeleteDialog = ref(false);
const showBulkDeleteDialog = ref(false);
const modpackToDelete = ref<string | null>(null);

// Create State
const showCreateDialog = ref(false);

// Share State
const showShareDialog = ref(false);
const shareModpackId = ref<string | null>(null);
const shareModpackName = ref<string>("");

// Convert State
const showConvertDialog = ref(false);
const convertModpack = ref<Modpack | null>(null);

// CurseForge Browse State
const showCFBrowse = ref(false);

// Sync State (now unified with Editor)
const editorInitialTab = ref<"play" | "mods" | "discover" | "health" | "versions" | "profiles" | "settings" | "remote" | "configs">("mods");

// Import State
const showProgress = ref(false);
const progressTitle = ref("");
const progressMessage = ref("");
const importZipName = ref("");

// CF Import Conflicts
const showCFConflictDialog = ref(false);
const pendingCFConflicts = ref<{
  conflicts: Array<{
    modName: string;
    existingVersion: string;
    existingGameVersion: string;
    newVersion: string;
    newGameVersion: string;
    projectID: number;
    fileID: number;
    existingFileId: number;
    existingMod: {
      id: string;
      name: string;
      version: string;
      game_version: string;
    };
    resolution?: "use_existing" | "use_new";
  }>;
  modpackId: string;
} | null>(null);

// Stats
const totalMods = computed(() =>
  modpacks.value.reduce((sum, p) => sum + p.modCount, 0)
);
const loaderBreakdown = computed(() => {
  // This would require loading all mods - simplified for now
  return modpacks.value.length > 0 ? `${modpacks.value.length} packs` : "";
});

// Check if running in Electron
const isElectron = () => window.api !== undefined;

// Check if a modpack has a running instance
function isModpackRunning(modpackId: string): boolean {
  for (const [instanceId, gameInfo] of runningGames.value.entries()) {
    if (instanceToModpack.value.get(instanceId) === modpackId) {
      return gameInfo.status !== 'stopped';
    }
  }
  return false;
}

// Load instance-to-modpack mapping
async function loadInstanceMapping() {
  try {
    const instances = await loadInstances();
    const mapping = new Map<string, string>();
    for (const inst of instances) {
      if (inst.modpackId) {
        mapping.set(inst.id, inst.modpackId);
      }
    }
    instanceToModpack.value = mapping;
  } catch (err) {
    console.error("Failed to load instance mapping:", err);
  }
}

async function loadModpacks() {
  if (!isElectron()) {
    error.value = "This app must be run in Electron, not in a browser.";
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    // Load instance mapping in parallel
    loadInstanceMapping();

    const packs = await window.api.modpacks.getAll();

    const packsWithCounts = await Promise.all(
      packs.map(async (pack) => {
        const [mods, hasUnsaved] = await Promise.all([
          window.api.modpacks.getMods(pack.id!),
          window.api.modpacks.hasUnsavedChanges(pack.id!),
        ]);
        return { ...pack, modCount: mods.length, hasUnsavedChanges: hasUnsaved };
      })
    );

    modpacks.value = packsWithCounts;

    const currentIds = new Set(modpacks.value.map((m) => m.id!));
    for (const id of selectedModpackIds.value) {
      if (!currentIds.has(id)) selectedModpackIds.value.delete(id);
    }
  } catch (err) {
    console.error("Failed to load modpacks:", err);
    error.value = "Failed to load modpacks: " + (err as Error).message;
  } finally {
    isLoading.value = false;
  }
}

// Selection Logic
function toggleSelection(id: string) {
  if (selectedModpackIds.value.has(id)) {
    selectedModpackIds.value.delete(id);
  } else {
    selectedModpackIds.value.add(id);
  }
}

function clearSelection() {
  selectedModpackIds.value.clear();
}

// Bulk Actions
function confirmBulkDelete() {
  showBulkDeleteDialog.value = true;
}

async function deleteSelectedModpacks() {
  showBulkDeleteDialog.value = false;

  showProgress.value = true;
  progressTitle.value = "Deleting Modpacks";

  const ids = Array.from(selectedModpackIds.value);
  let deletedCount = 0;

  try {
    for (const id of ids) {
      progressMessage.value = `Deleting ${++deletedCount} of ${ids.length}...`;
      await window.api.modpacks.delete(id);
    }
    await loadModpacks();
    clearSelection();
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

async function duplicateSelectedModpacks() {
  showProgress.value = true;
  progressTitle.value = "Duplicating Modpacks";

  const ids = Array.from(selectedModpackIds.value);
  let count = 0;

  try {
    for (const id of ids) {
      progressMessage.value = `Duplicating ${++count} of ${ids.length}...`;
      const original = modpacks.value.find((p) => p.id === id);
      if (original) {
        await window.api.modpacks.clone(id, `${original.name} (Copy)`);
      }
    }
    await loadModpacks();
    clearSelection();
    toast.success("Success", `Duplicated ${count} modpacks`);
  } catch (err) {
    toast.error("Duplicate Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export all selected modpacks as CurseForge ZIPs
async function exportSelectedModpacks() {
  showProgress.value = true;
  progressTitle.value = "Exporting Modpacks";

  const ids = Array.from(selectedModpackIds.value);
  let count = 0;
  let successCount = 0;

  try {
    for (const id of ids) {
      progressMessage.value = `Exporting ${++count} of ${ids.length}...`;
      try {
        const result = await window.api.export.curseforge(id);
        if (result) successCount++;
      } catch (e) {
        console.error(`Failed to export modpack ${id}:`, e);
      }
    }
    clearSelection();
    toast.success(
      "Export Complete",
      `Exported ${successCount} of ${ids.length} modpacks`
    );
  } catch (err) {
    toast.error("Export Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Open compare dialog with selected modpacks pre-filled
function openCompareWithSelected() {
  if (selectedModpackIds.value.size !== 2) {
    toast.error("Compare", "Please select exactly 2 modpacks to compare");
    return;
  }
  const ids = Array.from(selectedModpackIds.value);
  comparePackA.value = ids[0];
  comparePackB.value = ids[1];
  showCompare.value = true;
}

// Merge selected modpacks into a new one
const showMergeDialog = ref(false);
const mergeModpackName = ref("");
const showMergeSummary = ref(false);
const mergedModsList = ref<{ name: string; sourcePack: string }[]>([]);
const mergedPackName = ref("");

async function mergeSelectedModpacks() {
  if (selectedModpackIds.value.size < 2) {
    toast.error("Merge", "Please select at least 2 modpacks to merge");
    return;
  }

  const ids = Array.from(selectedModpackIds.value);
  const names = ids
    .map((id) => modpacks.value.find((p) => p.id === id)?.name || "Unknown")
    .join(" + ");
  mergeModpackName.value = `Merged: ${names.length > 30 ? names.substring(0, 30) + "..." : names
    }`;
  showMergeDialog.value = true;
}

async function confirmMerge() {
  if (!mergeModpackName.value.trim()) {
    toast.error("Invalid Name", "Please enter a name for the merged modpack");
    return;
  }

  const ids = Array.from(selectedModpackIds.value);
  const selectedPacks = ids.map((id) => modpacks.value.find((p) => p.id === id)).filter(Boolean);

  // Validate that all modpacks have the same loader and minecraft version
  const firstPack = selectedPacks[0];
  if (!firstPack) {
    toast.error("Merge Failed", "Could not find selected modpacks");
    return;
  }

  const incompatiblePacks = selectedPacks.filter(
    (p) => p!.minecraft_version !== firstPack.minecraft_version || p!.loader !== firstPack.loader
  );

  if (incompatiblePacks.length > 0) {
    const incompatibleNames = incompatiblePacks.map((p) => `${p!.name} (${p!.minecraft_version} ${p!.loader})`).join(", ");
    toast.error(
      "Incompatible Modpacks",
      `Cannot merge modpacks with different MC versions or loaders. Base: ${firstPack.minecraft_version} ${firstPack.loader}. Incompatible: ${incompatibleNames}`
    );
    return;
  }

  showMergeDialog.value = false;
  showProgress.value = true;
  progressTitle.value = "Merging Modpacks";
  progressMessage.value = "Creating merged modpack...";

  const collectedMods: { name: string; sourcePack: string }[] = [];

  try {
    // Create new modpack
    const newPackId = await window.api.modpacks.create({
      name: mergeModpackName.value.trim(),
      version: "1.0.0",
      description: `Merged from ${ids.length} modpacks`,
      minecraft_version: firstPack?.minecraft_version,
      loader: firstPack?.loader,
    });

    // Collect all unique mod IDs from selected modpacks
    const allModIds = new Set<string>();
    const modInfoMap = new Map<string, { name: string; sourcePack: string }>();

    // Use batch API to load mods from all modpacks at once
    progressMessage.value = `Loading mods from ${ids.length} modpacks...`;
    const modpackModsMap = await window.api.modpacks.getModsMultiple(ids);

    for (const packId of ids) {
      const pack = modpacks.value.find((p) => p.id === packId);
      const packMods = modpackModsMap[packId] || [];
      for (const mod of packMods) {
        if (!allModIds.has(mod.id)) {
          allModIds.add(mod.id);
          modInfoMap.set(mod.id, {
            name: mod.name,
            sourcePack: pack?.name || "Unknown",
          });
        }
      }
    }

    // Add all mods to new modpack using batch API
    progressMessage.value = `Adding ${allModIds.size} mods to merged modpack...`;
    const modIdsArray = Array.from(allModIds);
    await window.api.modpacks.addModsBatch(newPackId, modIdsArray);

    // Build collected mods info for summary
    for (const modId of allModIds) {
      const info = modInfoMap.get(modId);
      if (info) collectedMods.push(info);
    }

    await loadModpacks();
    clearSelection();

    // Show merge summary
    mergedModsList.value = collectedMods;
    mergedPackName.value = mergeModpackName.value;
    showMergeSummary.value = true;
  } catch (err) {
    toast.error("Merge Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Open Explorer for all selected modpacks
async function openSelectedFolders() {
  const ids = Array.from(selectedModpackIds.value);
  for (const id of ids) {
    try {
      await window.api.modpacks.openFolder(id);
    } catch (e) {
      console.error(`Failed to open folder for ${id}:`, e);
    }
  }
}

// Select all modpacks
function selectAll() {
  for (const pack of sortedModpacks.value) {
    selectedModpackIds.value.add(pack.id);
  }
}

// Create Modpack
async function createModpack(data: {
  name: string;
  version: string;
  description: string;
  image_path?: string;
}) {
  showCreateDialog.value = false;
  try {
    await window.api.modpacks.create(data);
    await loadModpacks();
  } catch (err) {
    toast.error("Create Failed", (err as Error).message);
  }
}

// Export Modpack as CurseForge ZIP
async function exportModpack(modpackId: string) {
  showProgress.value = true;
  progressTitle.value = "Exporting Modpack";
  progressMessage.value = "Creating CurseForge manifest...";

  try {
    const result = await window.api.export.curseforge(modpackId);
    if (result) {
      toast.success("Export Complete", `Exported to: ${result.path}`);
    }
  } catch (err) {
    toast.error("Export Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Export to Game Folder - Not available in metadata-only mode
async function exportModpackToGame(_modpackId: string) {
  toast.info(
    "Not Available",
    "Export to game folder is not available in this version. Mods are stored as references only. Export as CurseForge format and import in your launcher."
  );
}

// Clone Modpack
async function cloneModpack(modpackId: string) {
  const original = modpacks.value.find((p) => p.id === modpackId);
  if (!original) return;

  showProgress.value = true;
  progressTitle.value = "Cloning Modpack";
  progressMessage.value = "Creating copy...";

  try {
    // Use the new clone API that handles everything
    const newPackId = await window.api.modpacks.clone(
      modpackId,
      `${original.name} (Copy)`
    );

    if (!newPackId) {
      throw new Error("Clone failed");
    }

    await loadModpacks();
  } catch (err) {
    toast.error("Clone Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Open modpack folder in explorer
async function openInExplorer(modpackId: string) {
  try {
    await window.api.modpacks.openFolder(modpackId);
  } catch (err) {
    console.error("Failed to open folder:", err);
  }
}

// Import CurseForge Modpack
const importProgress = ref({ current: 0, total: 0, modName: "" });

async function importCurseForgeModpack() {
  if (!isElectron()) return;

  showProgress.value = true;
  progressTitle.value = "Importing CurseForge Modpack";
  progressMessage.value = "Select a modpack ZIP file...";
  importProgress.value = { current: 0, total: 0, modName: "" };

  // Listen for progress updates
  const progressHandler = (data: {
    current: number;
    total: number;
    modName: string;
  }) => {
    importProgress.value = data;
    progressMessage.value = `Downloading mod ${data.current}/${data.total}: ${data.modName}`;
  };

  const removeProgressListener = window.api.on("import:progress", progressHandler);

  try {
    const result = await window.api.import.curseforge();
    console.log("[CF Import] Result:", result);

    if (!result) {
      // User cancelled - cleanup and return
      removeProgressListener();
      showProgress.value = false;
      return;
    }

    // Check if conflicts need resolution
    if (result.requiresResolution && result.conflicts) {
      console.log(
        `[CF Import] ${result.conflicts.length} conflicts detected, showing dialog`
      );
      removeProgressListener();
      showProgress.value = false;

      pendingCFConflicts.value = {
        conflicts: result.conflicts.map((c: any) => ({
          ...c,
          resolution: "use_existing" as const,
          existingGameVersion:
            c.existingGameVersion || c.existingMod?.game_version || "unknown",
          newGameVersion: c.newGameVersion || "unknown",
          existingFileId: c.existingFileId || c.existingMod?.cf_file_id || 0,
        })),
        modpackId: result.modpackId || "",
      };
      showCFConflictDialog.value = true;
      return;
    }

    if (result.success) {
      let message = `Successfully imported ${result.modsImported} mods.`;
      if (result.modsSkipped > 0) {
        message += ` ${result.modsSkipped} mods were skipped.`;
      }
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 5).join("\n")}`;
        if (result.errors.length > 5) {
          message += `\n... and ${result.errors.length - 5} more errors`;
        }
      }
      toast.success("Import Successful", message, 7000);
      await loadModpacks();
    } else {
      toast.error("Import Failed", result.errors[0] || "Unknown error", 7000);
    }
  } catch (err) {
    toast.error("Import Error", (err as Error).message, 7000);
  } finally {
    removeProgressListener();
    showProgress.value = false;
    // Ensure DOM update completes
    await nextTick();
    // Force focus restore
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.focus();
    document.body.blur();
    console.log(
      "[ModpackView] Progress dialog closed, showProgress =",
      showProgress.value
    );
  }
}

async function resolveCFConflicts() {
  if (!pendingCFConflicts.value) return;

  showProgress.value = true;
  progressTitle.value = "Resolving conflicts...";
  progressMessage.value = "Applying your choices";

  try {
    const result = await window.api.import.resolveCFConflicts({
      modpackId: pendingCFConflicts.value.modpackId,
      conflicts: pendingCFConflicts.value.conflicts.map((c) => ({
        projectID: c.projectID,
        fileID: c.fileID,
        existingModId: c.existingMod.id,
        resolution: c.resolution || "use_existing",
      })),
    });

    if (result.success) {
      showCFConflictDialog.value = false;
      pendingCFConflicts.value = null;

      let message = `Successfully imported ${result.modsImported} mods.`;
      if (result.modsSkipped > 0) {
        message += ` ${result.modsSkipped} mods were skipped.`;
      }
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 3).join("\n")}`;
      }
      toast.success("Import Successful", message, 7000);
      await loadModpacks();
    } else {
      toast.error("Import Failed", result.errors[0] || "Unknown error");
    }
  } catch (err) {
    console.error("[CF Conflicts] Resolution failed:", err);
    toast.error("Resolution Failed", (err as Error).message);
  } finally {
    showProgress.value = false;
  }
}

// Editor
function openEditor(id: string) {
  selectedModpackId.value = id;
  showEditor.value = true;
}

// Open editor with play tab
function openPlayTab(id: string) {
  selectedModpackId.value = id;
  editorInitialTab.value = "play";
  showEditor.value = true;
}

// Share
function openShareExport(id: string, name: string) {
  shareModpackId.value = id;
  shareModpackName.value = name;
  showShareDialog.value = true;
}

function openShareImport() {
  shareModpackId.value = null;
  shareModpackName.value = "";
  showShareDialog.value = true;
}

// Delete Single
function confirmDelete(id: string) {
  modpackToDelete.value = id;
  showDeleteDialog.value = true;
}

async function deleteModpack() {
  if (!modpackToDelete.value) return;
  try {
    await window.api.modpacks.delete(modpackToDelete.value);
    await loadModpacks();
    showDeleteDialog.value = false;
    modpackToDelete.value = null;
  } catch (err) {
    toast.error("Delete Failed", (err as Error).message);
  }
}

// Convert Modpack
function openConvertDialog(id: string) {
  const pack = modpacks.value.find((p) => p.id === id);
  if (pack) {
    convertModpack.value = pack;
    showConvertDialog.value = true;
  }
}

function closeConvertDialog() {
  showConvertDialog.value = false;
  convertModpack.value = null;
}

async function handleConvertSuccess() {
  await loadModpacks();
  closeConvertDialog();
  toast.success("Conversion Complete", "Your converted modpack is ready!");
}

// Drag & Drop support for ZIP files
const isDragging = ref(false);
const dragCounter = ref(0);

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  dragCounter.value++;
  isDragging.value = true;
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  dragCounter.value--;
  if (dragCounter.value === 0) {
    isDragging.value = false;
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  dragCounter.value = 0;

  // Drag and drop import not supported in metadata-only mode
  toast.info(
    "Not Available",
    "Drag and drop import is not available. Please use the 'Import CF Modpack' button instead."
  );
}

// Favorites system
function loadFavoriteModpacks() {
  const stored = localStorage.getItem("modex:favorites:modpacks");
  if (stored) {
    favoriteModpacks.value = new Set(JSON.parse(stored));
  }
}

function saveFavoriteModpacks() {
  localStorage.setItem(
    "modex:favorites:modpacks",
    JSON.stringify([...favoriteModpacks.value])
  );
  window.dispatchEvent(new Event("storage"));
}

function toggleFavoriteModpack(id: string) {
  if (favoriteModpacks.value.has(id)) {
    favoriteModpacks.value.delete(id);
  } else {
    favoriteModpacks.value.add(id);
  }
  saveFavoriteModpacks();
}

// Computed data for filters
const loaderOptions = computed(() => {
  const loaders = new Set<string>();
  for (const pack of modpacks.value) {
    if (pack.loader) loaders.add(pack.loader);
  }
  return Array.from(loaders).sort();
});

const gameVersionOptions = computed(() => {
  const versions = new Set<string>();
  for (const pack of modpacks.value) {
    if (pack.minecraft_version) versions.add(pack.minecraft_version);
  }
  return Array.from(versions).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );
});

// Save/Load settings
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    viewMode: viewMode.value,
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    selectedLoader: selectedLoader.value,
    selectedGameVersion: selectedGameVersion.value,
    sourceFilter: sourceFilter.value,
  }));
}

function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      const settings = JSON.parse(stored);
      if (settings.viewMode) viewMode.value = settings.viewMode;
      if (settings.sortBy) sortBy.value = settings.sortBy;
      if (settings.sortDir) sortDir.value = settings.sortDir;
      if (settings.selectedLoader) selectedLoader.value = settings.selectedLoader;
      if (settings.selectedGameVersion) selectedGameVersion.value = settings.selectedGameVersion;
      if (settings.sourceFilter) sourceFilter.value = settings.sourceFilter;
    } catch (e) {
      console.error("Failed to load modpack settings:", e);
    }
  }
}

// Watch settings changes
watch([viewMode, sortBy, sortDir, selectedLoader, selectedGameVersion, sourceFilter], saveSettings);

// Count of active filters
const activeFilterCount = computed(() => {
  let count = 0;
  if (selectedLoader.value !== "all") count++;
  if (selectedGameVersion.value !== "all") count++;
  if (sourceFilter.value !== "all") count++;
  return count;
});

// Clear all filters
function clearFilters() {
  selectedLoader.value = "all";
  selectedGameVersion.value = "all";
  sourceFilter.value = "all";
  searchQuery.value = "";
}

// Sort and filter modpacks
const sortedModpacks = computed(() => {
  let result = [...modpacks.value];

  // Search
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }

  // Apply quick filter
  if (quickFilter.value === "favorites") {
    result = result.filter((p) => favoriteModpacks.value.has(p.id));
  }

  // Apply loader filter
  if (selectedLoader.value !== "all") {
    result = result.filter((p) => p.loader === selectedLoader.value);
  }

  // Apply game version filter
  if (selectedGameVersion.value !== "all") {
    result = result.filter((p) => p.minecraft_version === selectedGameVersion.value);
  }

  // Apply source filter
  if (sourceFilter.value === "curseforge") {
    result = result.filter((p) => p.cf_project_id);
  } else if (sourceFilter.value === "local") {
    result = result.filter((p) => !p.cf_project_id);
  }

  // Sort - favorites first, then by selected sort
  return result.sort((a, b) => {
    const aFav = favoriteModpacks.value.has(a.id) ? 0 : 1;
    const bFav = favoriteModpacks.value.has(b.id) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;

    const dir = sortDir.value === "asc" ? 1 : -1;

    if (sortBy.value === "name") return a.name.localeCompare(b.name) * dir;
    if (sortBy.value === "mods") return (a.modCount - b.modCount) * dir;
    if (sortBy.value === "updated") {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return (dateB - dateA) * dir;
    }
    if (sortBy.value === "created") {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return (dateB - dateA) * dir;
    }
    return a.name.localeCompare(b.name) * dir;
  });
});

// Handle URL filter parameter
watch(
  () => route.query.filter,
  (filter) => {
    if (filter === "favorites") {
      quickFilter.value = "favorites";
    } else {
      quickFilter.value = "all";
    }
  },
  { immediate: true }
);

// Handle URL id parameter (open specific modpack editor)
watch(
  () => route.query.id,
  async (id) => {
    if (id && typeof id === "string") {
      // Wait for modpacks to load if not already
      if (modpacks.value.length === 0) {
        await loadModpacks();
      }
      // Check if modpack exists
      if (modpacks.value.some((m) => m.id === id)) {
        openEditor(id);
      }
      // Clear the query param after opening
      router.replace({ query: { ...route.query, id: undefined } });
    }
  },
  { immediate: true }
);

// Handle URL action parameter (e.g. browse)
watch(
  () => route.query.action,
  (action) => {
    if (action === 'browse') {
      showCFBrowse.value = true;
      router.replace({ query: { ...route.query, action: undefined } });
    }
  },
  { immediate: true }
);

// Handle URL create parameter (open create dialog)
watch(
  () => route.query.create,
  (create) => {
    if (create === "true") {
      showCreateDialog.value = true;
      // Clear the query param after opening
      router.replace({ query: { ...route.query, create: undefined } });
    }
  },
  { immediate: true }
);

function handleSyncComplete() {
  showEditor.value = false;
  toast.success("Ready to Play", "Instance is ready!");
}

onMounted(() => {
  loadSettings();
  loadFavoriteModpacks();
  loadModpacks();
});
</script>

<template>
  <div class="h-full flex flex-col relative" @dragenter="handleDragEnter" @dragover="handleDragOver"
    @dragleave="handleDragLeave" @drop="handleDrop">
    <!-- Drag & Drop Overlay -->
    <div v-if="isDragging"
      class="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
      <div class="text-center">
        <Download class="w-16 h-16 mx-auto text-primary mb-4" />
        <p class="text-xl font-semibold">Drop modpack .zip here</p>
        <p class="text-muted-foreground">The modpack will be imported</p>
      </div>
    </div>

    <!-- Compact Header -->
    <div class="shrink-0 relative border-b border-border z-20">
      <div class="relative px-3 sm:px-6 py-3 sm:py-4 bg-background/80 backdrop-blur-sm">
        <!-- Mobile: Stack vertically, Desktop: Row -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          <!-- Left: Title & Stats -->
          <div class="flex items-center gap-3 sm:gap-4">
            <div class="flex items-center gap-2 sm:gap-3">
              <div
                class="p-2 sm:p-2.5 bg-gradient-to-br from-blue-500/20 to-violet-500/10 rounded-xl border border-blue-500/20">
                <Package class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              </div>
              <div>
                <h1 class="text-base sm:text-lg font-semibold tracking-tight">
                  Modpacks
                </h1>
                <p class="text-[10px] sm:text-xs text-muted-foreground">
                  {{ modpacks.length }} packs • {{ totalMods }} mods
                </p>
              </div>
            </div>

            <!-- Separator - hidden on mobile -->
            <div class="hidden sm:block h-8 w-px bg-border" />

            <!-- Quick Filters -->
            <div class="flex items-center gap-1 sm:gap-1.5">
              <button class="px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all" :class="quickFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                " @click="
                  quickFilter = 'all';
                router.push('/modpacks');
                ">
                All
              </button>
              <button
                class="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs rounded-md transition-all"
                :class="quickFilter === 'favorites'
                  ? 'bg-rose-500/20 text-rose-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  " @click="
                    quickFilter = 'favorites';
                  router.push('/modpacks?filter=favorites');
                  ">
                <Heart class="w-3 h-3" :class="quickFilter === 'favorites' ? 'fill-rose-400' : ''" />
                <span v-if="favoriteModpacks.size > 0" class="hidden xs:inline">({{ favoriteModpacks.size }})</span>
              </button>
            </div>
          </div>

          <!-- Search & Sort -->
          <div class="hidden md:flex items-center gap-2 flex-1 max-w-md mx-auto">
            <div class="relative flex-1">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input v-model="searchQuery" placeholder="Search packs..."
                class="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-muted/50 border-none focus:ring-1 focus:ring-primary outline-none transition-all focus:bg-muted" />
            </div>

            <!-- Filter Button -->
            <button @click="showFilters = !showFilters"
              class="relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-all" :class="showFilters || activeFilterCount > 0
                ? 'bg-primary/20 text-primary'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'">
              <Filter class="w-3.5 h-3.5" />
              <span class="hidden lg:inline">Filters</span>
              <span v-if="activeFilterCount > 0"
                class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                {{ activeFilterCount }}
              </span>
            </button>

            <!-- View Mode Toggle -->
            <div class="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md">
              <button @click="viewMode = 'grid'" class="p-1.5 rounded transition-all"
                :class="viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="Grid View">
                <LayoutGrid class="w-3.5 h-3.5" />
              </button>
              <button @click="viewMode = 'list'" class="p-1.5 rounded transition-all"
                :class="viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="List View">
                <List class="w-3.5 h-3.5" />
              </button>
              <button @click="viewMode = 'compact'" class="p-1.5 rounded transition-all"
                :class="viewMode === 'compact' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                title="Compact View">
                <LayoutList class="w-3.5 h-3.5" />
              </button>
            </div>

            <select v-model="sortBy"
              class="text-xs bg-muted/50 border-none rounded-md py-1.5 pl-2 pr-8 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:bg-muted transition-colors appearance-none"
              style="
              background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
              background-repeat: no-repeat;
              background-position: right 0.5rem center;
              background-size: 0.65em auto;
            ">
              <option value="name">Name</option>
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="mods">Mod Count</option>
            </select>

            <!-- Sort Direction -->
            <button @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
              class="p-1.5 rounded-md bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
              :title="sortDir === 'asc' ? 'Ascending' : 'Descending'">
              <svg class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': sortDir === 'desc' }"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-1.5 sm:gap-2">
            <Button @click="showCompare = true" :disabled="modpacks.length < 2" variant="ghost" size="sm"
              class="gap-1 sm:gap-1.5 text-muted-foreground hover:text-foreground h-7 sm:h-8 px-2 sm:px-3">
              <ArrowLeftRight class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden lg:inline text-xs">Compare</span>
            </Button>

            <!-- Selection Actions -->
            <div class="hidden md:flex items-center gap-1 border-l border-border pl-2 ml-1">
              <Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                @click="selectAll" :disabled="modpacks.length === 0">
                Select All
              </Button>
              <Button variant="ghost" size="sm" class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                @click="clearSelection" :disabled="selectedModpackIds.size === 0">
                Clear
              </Button>
            </div>

            <Button @click="openShareImport" :disabled="!isElectron()" variant="ghost" size="sm"
              class="gap-1 sm:gap-1.5 text-muted-foreground hover:text-foreground h-7 sm:h-8 px-2 sm:px-3 hidden sm:flex">
              <Share2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden lg:inline text-xs">.modex</span>
            </Button>
            <Button @click="showCFBrowse = true" :disabled="!isElectron()" variant="outline" size="sm"
              class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <Globe class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden xs:inline">Browse CF</span>
            </Button>
            <Button @click="importCurseForgeModpack" :disabled="!isElectron()" variant="secondary" size="sm"
              class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <Download class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden xs:inline">Import</span>
            </Button>
            <Button @click="showCreateDialog = true" :disabled="!isElectron()" size="sm"
              class="gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <PackagePlus class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span class="hidden xs:inline">Create</span>
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-if="error" class="flex items-center justify-center flex-1 bg-background">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <div v-else-if="isLoading" class="flex items-center justify-center flex-1 bg-background">
      <div class="flex flex-col items-center gap-2">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <div v-else-if="modpacks.length === 0" class="flex items-center justify-center flex-1 bg-background">
      <div class="text-center max-w-sm flex flex-col items-center">
        <div class="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-6">
          <Package class="w-8 h-8 text-muted-foreground" />
        </div>

        <h3 class="text-xl font-bold mb-2">No Modpacks</h3>
        <p class="text-muted-foreground mb-8 text-sm max-w-xs mx-auto leading-relaxed">
          Create your first custom modpack or import one from CurseForge to get
          started.
        </p>

        <div class="flex justify-center gap-3">
          <Button @click="showCFBrowse = true" variant="outline" size="lg" class="gap-2 h-11 px-5">
            <Globe class="w-5 h-5" />
            Browse CF
          </Button>
          <Button @click="importCurseForgeModpack" variant="secondary" size="lg" class="gap-2 h-11 px-5">
            <Download class="w-5 h-5" />
            Import ZIP
          </Button>
          <Button @click="showCreateDialog = true" size="lg"
            class="gap-2 h-11 px-5 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
            <PackagePlus class="w-5 h-5" />
            Create
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex overflow-hidden bg-background">
      <!-- Filter Sidebar -->
      <Transition name="slide">
        <div v-if="showFilters" class="w-64 shrink-0 border-r border-border bg-card/50 p-4 overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-sm">Filters</h3>
            <button @click="showFilters = false" class="p-1 rounded-md hover:bg-muted text-muted-foreground">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="space-y-4">
            <!-- Source Filter -->
            <div>
              <label class="text-xs font-medium text-muted-foreground mb-2 block">Source</label>
              <div class="space-y-1">
                <button @click="sourceFilter = 'all'"
                  class="w-full px-3 py-2 text-xs text-left rounded-md transition-all flex items-center gap-2"
                  :class="sourceFilter === 'all' ? 'bg-primary/20 text-primary' : 'hover:bg-muted'">
                  <span class="w-2 h-2 rounded-full bg-muted-foreground"></span>
                  All Sources
                </button>
                <button @click="sourceFilter = 'curseforge'"
                  class="w-full px-3 py-2 text-xs text-left rounded-md transition-all flex items-center gap-2"
                  :class="sourceFilter === 'curseforge' ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-muted'">
                  <Flame class="w-3 h-3 text-orange-500" />
                  CurseForge
                </button>
                <button @click="sourceFilter = 'local'"
                  class="w-full px-3 py-2 text-xs text-left rounded-md transition-all flex items-center gap-2"
                  :class="sourceFilter === 'local' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-muted'">
                  <Package class="w-3 h-3 text-blue-500" />
                  Local
                </button>
              </div>
            </div>

            <!-- Loader Filter -->
            <div>
              <label class="text-xs font-medium text-muted-foreground mb-2 block">Mod Loader</label>
              <select v-model="selectedLoader"
                class="w-full px-3 py-2 text-xs rounded-md bg-muted border border-border focus:ring-1 focus:ring-primary outline-none">
                <option value="all">All Loaders</option>
                <option v-for="loader in loaderOptions" :key="loader" :value="loader" class="capitalize">
                  {{ loader }}
                </option>
              </select>
            </div>

            <!-- Game Version Filter -->
            <div>
              <label class="text-xs font-medium text-muted-foreground mb-2 block">Minecraft Version</label>
              <select v-model="selectedGameVersion"
                class="w-full px-3 py-2 text-xs rounded-md bg-muted border border-border focus:ring-1 focus:ring-primary outline-none">
                <option value="all">All Versions</option>
                <option v-for="version in gameVersionOptions" :key="version" :value="version">
                  {{ version }}
                </option>
              </select>
            </div>

            <!-- Clear Filters -->
            <button v-if="activeFilterCount > 0" @click="clearFilters"
              class="w-full px-3 py-2 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all">
              Clear All Filters
            </button>
          </div>
        </div>
      </Transition>

      <!-- Main Content -->
      <div class="flex-1 overflow-auto p-3 sm:p-6 pb-20">
        <!-- Results info -->
        <div v-if="activeFilterCount > 0 || searchQuery"
          class="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Showing {{ sortedModpacks.length }} of {{ modpacks.length }} modpacks</span>
          <button v-if="activeFilterCount > 0" @click="clearFilters" class="text-primary hover:underline">
            Clear filters
          </button>
        </div>

        <!-- Grid View -->
        <div v-if="viewMode === 'grid'"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          <ModpackCard v-for="pack in sortedModpacks" :key="pack.id" :modpack="pack"
            :selected="selectedModpackIds.has(pack.id)" :favorite="favoriteModpacks.has(pack.id)"
            :is-running="isModpackRunning(pack.id!)" @delete="confirmDelete" @edit="openEditor"
            @toggle-select="toggleSelection" @clone="cloneModpack" @open-folder="openInExplorer"
            @toggle-favorite="toggleFavoriteModpack" @share="openShareExport" @convert="openConvertDialog"
            @play="openPlayTab" />
        </div>

        <!-- List View -->
        <div v-else-if="viewMode === 'list'" class="space-y-1">
          <!-- List Header -->
          <div
            class="hidden sm:flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border">
            <div class="w-5"></div>
            <div class="w-10"></div>
            <div class="flex-1">Name</div>
            <div class="w-20 text-center">Version</div>
            <div class="hidden md:block w-20 text-center">Loader</div>
            <div class="hidden lg:block w-16 text-center">Mods</div>
            <div class="hidden xl:block w-24">Updated</div>
            <div class="w-8"></div>
            <div class="w-8"></div>
          </div>
          <ModpackListItem v-for="pack in sortedModpacks" :key="pack.id" :modpack="pack"
            :selected="selectedModpackIds.has(pack.id)" :favorite="favoriteModpacks.has(pack.id)"
            @delete="confirmDelete" @edit="openEditor" @toggle-select="toggleSelection" @clone="cloneModpack"
            @open-folder="openInExplorer" @toggle-favorite="toggleFavoriteModpack" @share="openShareExport"
            @convert="openConvertDialog" />
        </div>

        <!-- Compact View -->
        <div v-else-if="viewMode === 'compact'"
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          <ModpackCompactCard v-for="pack in sortedModpacks" :key="pack.id" :modpack="pack"
            :selected="selectedModpackIds.has(pack.id)" :favorite="favoriteModpacks.has(pack.id)" @edit="openEditor"
            @toggle-select="toggleSelection" @toggle-favorite="toggleFavoriteModpack" />
        </div>

        <!-- Empty Filtered State -->
        <div v-if="sortedModpacks.length === 0 && modpacks.length > 0"
          class="flex flex-col items-center justify-center py-16 text-center">
          <Filter class="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 class="text-lg font-medium mb-2">No matching modpacks</h3>
          <p class="text-sm text-muted-foreground mb-4">Try adjusting your filters or search query</p>
          <Button variant="outline" size="sm" @click="clearFilters">
            Clear Filters
          </Button>
        </div>
      </div>
    </div>

    <!-- Bulk Action Bar -->
    <BulkActionBar v-if="selectedModpackIds.size > 0" :count="selectedModpackIds.size" label="modpacks"
      @clear="clearSelection">
      <Button variant="secondary" size="sm" class="gap-2" @click="exportSelectedModpacks"
        title="Export all as CurseForge">
        <Upload class="w-4 h-4" />
        Export
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" :disabled="selectedModpackIds.size !== 2"
        @click="openCompareWithSelected" title="Compare selected modpacks">
        <ArrowLeftRight class="w-4 h-4" />
        Compare
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" :disabled="selectedModpackIds.size < 2"
        @click="mergeSelectedModpacks" title="Merge into new modpack">
        <Merge class="w-4 h-4" />
        Merge
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" @click="openSelectedFolders" title="Open all in Explorer">
        <FolderOpen class="w-4 h-4" />
        Folders
      </Button>
      <Button variant="secondary" size="sm" class="gap-2" @click="duplicateSelectedModpacks">
        <Copy class="w-4 h-4" />
        Duplicate
      </Button>
      <Button variant="destructive" size="sm" class="gap-2" @click="confirmBulkDelete">
        <Trash2 class="w-4 h-4" />
        Delete
      </Button>
    </BulkActionBar>

    <!-- Modpack Editor Modal (unified with play functionality) -->
    <ModpackEditor v-if="selectedModpackId" :modpack-id="selectedModpackId" :is-open="showEditor"
      :initial-tab="editorInitialTab" @close="showEditor = false; editorInitialTab = 'mods'" @update="loadModpacks"
      @export="exportModpack(selectedModpackId || '')" @exportToGame="exportModpackToGame(selectedModpackId || '')"
      @launched="handleSyncComplete" />

    <!-- Compare Dialog -->
    <ModpackCompareDialog :open="showCompare" :pre-selected-pack-a="comparePackA || undefined"
      :pre-selected-pack-b="comparePackB || undefined" @close="
        showCompare = false;
      comparePackA = null;
      comparePackB = null;
      " />

    <!-- Create Dialog -->
    <CreateModpackDialog :open="showCreateDialog" @close="showCreateDialog = false" @create="createModpack" />

    <!-- Delete Confirmation -->
    <Dialog :open="showDeleteDialog" title="Delete Modpack" description="This will not delete the mods inside.">
      <template #footer>
        <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
        <Button variant="destructive" @click="deleteModpack">Delete</Button>
      </template>
    </Dialog>

    <ConfirmDialog :open="showBulkDeleteDialog" title="Delete Selected Modpacks" :message="`Are you sure you want to delete ${selectedModpackIds.size
      } selected modpack${selectedModpackIds.size > 1 ? 's' : ''
      }? This will not delete the mods inside.`" confirm-text="Delete" variant="danger" icon="trash"
      @confirm="deleteSelectedModpacks" @cancel="showBulkDeleteDialog = false" @close="showBulkDeleteDialog = false" />

    <ProgressDialog :open="showProgress" :title="progressTitle" :message="progressMessage" />

    <!-- Share Dialog -->
    <ShareDialog :open="showShareDialog" :modpack-id="shareModpackId ?? undefined" :modpack-name="shareModpackName"
      @close="showShareDialog = false" @refresh="loadModpacks" />

    <!-- Convert Dialog -->
    <ConvertModpackDialog :open="showConvertDialog" :modpack="convertModpack" @close="closeConvertDialog"
      @success="handleConvertSuccess" />

    <!-- CurseForge Modpack Browse Dialog -->
    <CurseForgeModpackSearch :open="showCFBrowse" @close="showCFBrowse = false" @imported="loadModpacks" />

    <!-- CF Import Conflict Resolution Dialog -->
    <Dialog :open="showCFConflictDialog" @close="showCFConflictDialog = false">
      <template #header>
        <h2 class="text-xl font-bold">Version Conflicts Detected</h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Some mods already exist in your library with different versions.
          Choose which version to use:
        </p>

        <div v-if="pendingCFConflicts" class="space-y-3 max-h-96 overflow-y-auto">
          <div v-for="(conflict, idx) in pendingCFConflicts.conflicts" :key="idx"
            class="p-4 rounded-lg border bg-card space-y-3">
            <div class="flex items-center justify-between">
              <div class="font-semibold">{{ conflict.modName }}</div>
              <div class="text-xs text-muted-foreground">
                File ID: {{ conflict.existingFileId }} → {{ conflict.fileID }}
              </div>
            </div>

            <!-- Use Existing Version -->
            <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_existing'
              ? 'bg-primary/10 border-primary'
              : 'bg-muted/50 border-border hover:bg-muted'
              ">
              <input type="radio" :name="`cf-conflict-${idx}`" value="use_existing" v-model="conflict.resolution"
                class="mt-1" />
              <div class="flex-1">
                <div class="font-medium text-sm">Keep existing version</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{
                    conflict.existingGameVersion || "unknown" }}</span>
                  <span class="text-xs text-muted-foreground truncate max-w-[200px]"
                    :title="conflict.existingVersion">{{
                      conflict.existingVersion }}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  Already in your library
                </div>
              </div>
            </label>

            <!-- Use New Version -->
            <label class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all" :class="conflict.resolution === 'use_new'
              ? 'bg-primary/10 border-primary'
              : 'bg-muted/50 border-border hover:bg-muted'
              ">
              <input type="radio" :name="`cf-conflict-${idx}`" value="use_new" v-model="conflict.resolution"
                class="mt-1" />
              <div class="flex-1">
                <div class="font-medium text-sm">Download new version</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{
                    conflict.newGameVersion
                    || "unknown" }}</span>
                  <span class="text-xs text-muted-foreground truncate max-w-[200px]" :title="conflict.newVersion">{{
                    conflict.newVersion }}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  From the imported modpack
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2">
          <Button variant="outline" @click="
            showCFConflictDialog = false;
          pendingCFConflicts = null;
          ">
            Cancel
          </Button>
          <Button @click="resolveCFConflicts"> Apply Choices </Button>
        </div>
      </template>
    </Dialog>

    <!-- Merge Dialog -->
    <Dialog :open="showMergeDialog" @close="showMergeDialog = false">
      <template #header>
        <h2 class="text-xl font-bold flex items-center gap-2">
          <Merge class="w-5 h-5" />
          Merge Modpacks
        </h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Create a new modpack containing all unique mods from the
          {{ selectedModpackIds.size }} selected modpacks.
        </p>

        <div class="space-y-2">
          <label class="text-sm font-medium">New Modpack Name</label>
          <input v-model="mergeModpackName" type="text"
            class="w-full px-3 py-2 rounded-md bg-muted border border-border focus:ring-1 focus:ring-primary outline-none"
            placeholder="Enter name for merged modpack" />
        </div>

        <div class="p-3 rounded-lg bg-muted/50 border border-border">
          <div class="text-xs text-muted-foreground">
            <strong>Note:</strong> This will create a new modpack. The original
            modpacks will not be modified.
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2">
          <Button variant="outline" @click="showMergeDialog = false">
            Cancel
          </Button>
          <Button @click="confirmMerge" :disabled="!mergeModpackName.trim()">
            <Package class="w-4 h-4 mr-2" />
            Create Merged Modpack
          </Button>
        </div>
      </template>
    </Dialog>

    <!-- Merge Summary Dialog -->
    <Dialog :open="showMergeSummary" @close="showMergeSummary = false" maxWidth="2xl">
      <template #header>
        <h2 class="text-xl font-bold flex items-center gap-2 text-green-500">
          <Package class="w-5 h-5" />
          Merge Complete!
        </h2>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Successfully created
          <strong class="text-foreground">"{{ mergedPackName }}"</strong> with
          {{ mergedModsList.length }} mods.
        </p>

        <div class="border border-border rounded-lg overflow-hidden">
          <div
            class="bg-muted/50 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            All Mods Added ({{ mergedModsList.length }})
          </div>
          <div class="max-h-[300px] overflow-y-auto divide-y divide-border">
            <div v-for="(mod, idx) in mergedModsList" :key="idx"
              class="px-4 py-2 flex items-center justify-between hover:bg-muted/30">
              <span class="font-medium text-sm">{{ mod.name }}</span>
              <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                from {{ mod.sourcePack }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button @click="showMergeSummary = false"> Close </Button>
      </template>
    </Dialog>
  </div>
</template>
<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>