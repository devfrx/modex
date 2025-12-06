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
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
import VersionHistoryPanel from "@/components/modpacks/VersionHistoryPanel.vue";
import ModpackAnalysisPanel from "@/components/modpacks/ModpackAnalysisPanel.vue";
import type { Mod, Modpack } from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update"): void;
  (e: "export"): void;
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
const isSaving = ref(false);
const activeTab = ref<"mods" | "analysis" | "versions" | "settings">("mods");

// Editable form fields
const editForm = ref({
  name: "",
  description: "",
  version: "",
  minecraft_version: "",
  loader: "",
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

// Check mod compatibility with modpack
function isModCompatible(mod: Mod): { compatible: boolean; reason?: string } {
  if (!modpack.value) return { compatible: true };

  const packLoader = modpack.value.loader?.toLowerCase();
  const packVersion = modpack.value.minecraft_version;
  const modLoader = mod.loader?.toLowerCase();
  const modVersion = mod.game_version;

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

  // Check MC version compatibility
  if (packVersion && modVersion && modVersion !== "unknown") {
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

  return { compatible: true };
}

// Filtered & Sorted Mods
const filteredInstalledMods = computed(() => {
  let mods = currentMods.value.filter((m) =>
    m.name.toLowerCase().includes(searchQueryInstalled.value.toLowerCase())
  );
  mods.sort((a, b) => {
    const aVal = a[sortBy.value] || "";
    const bVal = b[sortBy.value] || "";
    const cmp = aVal.localeCompare(bVal);
    return sortDir.value === "asc" ? cmp : -cmp;
  });
  return mods;
});

// Mods with compatibility info
const filteredAvailableMods = computed(() => {
  const currentIds = new Set(currentMods.value.map((m) => m.id));
  return availableMods.value
    .filter(
      (m) =>
        !currentIds.has(m.id) &&
        m.name.toLowerCase().includes(searchQueryAvailable.value.toLowerCase())
    )
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
  try {
    const [pack, cMods, allMods, disabled] = await Promise.all([
      window.api.modpacks.getById(props.modpackId),
      window.api.modpacks.getMods(props.modpackId),
      window.api.mods.getAll(),
      window.api.modpacks.getDisabledMods(props.modpackId),
    ]);
    modpack.value = pack || null;
    currentMods.value = cMods;
    availableMods.value = allMods;
    disabledModIds.value = new Set(disabled);
    selectedModIds.value.clear();

    // Initialize edit form
    if (pack) {
      editForm.value = {
        name: pack.name || "",
        description: pack.description || "",
        version: pack.version || "",
        minecraft_version: pack.minecraft_version || "",
        loader: pack.loader || "",
      };
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
  try {
    await window.api.modpacks.removeMod(props.modpackId, modId);
    await loadData();
    emit("update");
  } catch (err) {
    console.error("Failed to remove mod:", err);
  }
}

async function toggleModEnabled(modId: string) {
  try {
    const result = await window.api.modpacks.toggleMod(props.modpackId, modId);
    if (result) {
      // Update local state immediately for responsive UI
      if (result.enabled) {
        disabledModIds.value.delete(modId);
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

// Add mod from analysis (CurseForge project ID)
async function handleAddModFromAnalysis(cfProjectId: number) {
  if (!modpack.value) return;

  try {
    // Get the mod from CurseForge
    const cfMod = await window.api.curseforge.getMod(cfProjectId);
    if (!cfMod) {
      toast.error("Mod not found", "Could not find the mod on CurseForge");
      return;
    }

    // Find the best file for the modpack's MC version and loader
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

    // Add to library first
    const addedMod = await window.api.curseforge.addToLibrary(
      cfProjectId,
      files[0].id,
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
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
  >
    <div
      class="bg-background border border-border/50 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <!-- Compact Header -->
      <div
        class="shrink-0 border-b border-border/50 bg-gradient-to-r from-card/80 to-card/40"
      >
        <!-- Top Bar -->
        <div class="px-5 py-3 flex items-center gap-4">
          <!-- Pack Info -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <!-- Thumbnail -->
            <div
              v-if="modpack?.image_url"
              class="w-10 h-10 rounded-lg overflow-hidden ring-2 ring-primary/20 shrink-0"
            >
              <img
                :src="
                  modpack.image_url.startsWith('http') ||
                  modpack.image_url.startsWith('file:')
                    ? modpack.image_url
                    : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
                "
                class="w-full h-full object-cover"
              />
            </div>
            <div
              v-else
              class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-primary/20 shrink-0"
            >
              <Package class="w-5 h-5 text-primary" />
            </div>

            <!-- Name & Meta -->
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-bold truncate">
                  {{ modpack?.name || "Loading..." }}
                </h2>
                <span
                  v-if="modpack?.version"
                  class="text-xs text-muted-foreground font-mono"
                  >v{{ modpack.version }}</span
                >
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span
                  v-if="modpack?.minecraft_version"
                  class="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium"
                >
                  {{ modpack.minecraft_version }}
                </span>
                <span
                  v-if="modpack?.loader"
                  class="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-500 font-medium capitalize"
                >
                  {{ modpack.loader }}
                </span>
                <span class="text-muted-foreground">
                  <Layers class="w-3 h-3 inline mr-0.5" />
                  {{ currentMods.length }} mods
                </span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 px-2.5 gap-1.5"
              @click="selectImage"
              title="Set cover image"
            >
              <ImagePlus class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 px-2.5 gap-1.5"
              :disabled="!modpack?.minecraft_version || !modpack?.loader"
              :title="
                !modpack?.minecraft_version || !modpack?.loader
                  ? 'Set version and loader first'
                  : 'Check updates'
              "
              @click="showUpdatesDialog = true"
            >
              <ArrowUpCircle class="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="h-8 px-3 gap-1.5"
              @click="$emit('export')"
            >
              <Download class="w-4 h-4" />
              <span class="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 w-8 p-0 ml-1"
              @click="$emit('close')"
            >
              <X class="w-5 h-5" />
            </Button>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="px-5 flex items-center gap-1">
          <button
            class="px-4 py-2 text-sm font-medium transition-all relative"
            :class="
              activeTab === 'mods'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'mods'"
          >
            <div class="flex items-center gap-1.5">
              <Layers class="w-4 h-4" />
              Mods
            </div>
            <div
              v-if="activeTab === 'mods'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-all relative"
            :class="
              activeTab === 'analysis'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'analysis'"
          >
            <div class="flex items-center gap-1.5">
              <AlertCircle class="w-4 h-4" />
              Analysis
            </div>
            <div
              v-if="activeTab === 'analysis'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-all relative"
            :class="
              activeTab === 'versions'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'versions'"
          >
            <div class="flex items-center gap-1.5">
              <GitBranch class="w-4 h-4" />
              History
            </div>
            <div
              v-if="activeTab === 'versions'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-all relative"
            :class="
              activeTab === 'settings'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = 'settings'"
          >
            <div class="flex items-center gap-1.5">
              <Settings class="w-4 h-4" />
              Settings
            </div>
            <div
              v-if="activeTab === 'settings'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Mods Tab -->
        <template v-if="activeTab === 'mods'">
          <!-- Left: Installed Mods -->
          <div class="w-1/2 border-r border-border/50 flex flex-col">
            <!-- Header -->
            <div class="shrink-0 p-3 border-b border-border/30 bg-muted/20">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-sm">Installed</span>
                  <span class="text-xs text-muted-foreground">
                    {{ enabledModCount
                    }}<span
                      v-if="disabledModIds.size > 0"
                      class="text-amber-500"
                    >
                      (+{{ disabledModIds.size }} disabled)</span
                    >
                  </span>
                </div>
                <Transition name="fade">
                  <Button
                    v-if="selectedModIds.size > 0"
                    variant="destructive"
                    size="sm"
                    class="h-7 text-xs gap-1"
                    @click="removeSelectedMods"
                  >
                    <Trash2 class="w-3 h-3" />
                    Remove {{ selectedModIds.size }}
                  </Button>
                </Transition>
              </div>
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <Search
                    class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                  />
                  <input
                    v-model="searchQueryInstalled"
                    placeholder="Search installed..."
                    class="w-full h-8 pl-8 pr-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>
                <div
                  class="flex rounded-lg border border-border/50 overflow-hidden"
                >
                  <button
                    class="h-8 text-xs px-3 transition-colors"
                    :class="
                      sortBy === 'name'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted'
                    "
                    @click="toggleSort('name')"
                  >
                    Name
                  </button>
                  <button
                    class="h-8 text-xs px-3 border-l border-border/50 transition-colors"
                    :class="
                      sortBy === 'version'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted'
                    "
                    @click="toggleSort('version')"
                  >
                    Version
                  </button>
                </div>
              </div>
            </div>

            <!-- Mod List -->
            <div class="flex-1 overflow-y-auto p-2 space-y-1">
              <div
                v-for="mod in filteredInstalledMods"
                :key="mod.id"
                class="flex items-center gap-3 p-2.5 rounded-lg border transition-all group cursor-pointer"
                :class="[
                  selectedModIds.has(mod.id)
                    ? 'bg-primary/10 border-primary/50 shadow-sm'
                    : 'border-transparent hover:bg-accent/50 hover:border-border/50',
                  disabledModIds.has(mod.id) ? 'opacity-50' : '',
                ]"
                @click="toggleSelect(mod.id)"
              >
                <!-- Checkbox -->
                <div
                  class="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                  :class="
                    selectedModIds.has(mod.id)
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30 group-hover:border-muted-foreground/50'
                  "
                >
                  <Check
                    v-if="selectedModIds.has(mod.id)"
                    class="w-3 h-3 text-primary-foreground"
                  />
                </div>

                <!-- Enable/Disable Toggle -->
                <button
                  class="w-8 h-4 rounded-full relative shrink-0 transition-colors"
                  :class="
                    disabledModIds.has(mod.id)
                      ? 'bg-muted-foreground/30'
                      : 'bg-emerald-500'
                  "
                  @click.stop="toggleModEnabled(mod.id)"
                  :title="
                    disabledModIds.has(mod.id)
                      ? 'Click to enable mod'
                      : 'Click to disable mod'
                  "
                >
                  <span
                    class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all"
                    :class="disabledModIds.has(mod.id) ? 'left-0.5' : 'left-4'"
                  />
                </button>

                <!-- Mod Info -->
                <div class="min-w-0 flex-1">
                  <div
                    class="font-medium text-sm truncate flex items-center gap-1.5"
                  >
                    {{ mod.name }}
                    <span
                      v-if="disabledModIds.has(mod.id)"
                      class="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium"
                    >
                      disabled
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span
                      v-if="mod.game_version && mod.game_version !== 'unknown'"
                      class="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium"
                    >
                      {{ mod.game_version }}
                    </span>
                    <span
                      v-if="mod.loader && mod.loader !== 'unknown'"
                      class="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-500 font-medium capitalize"
                    >
                      {{ mod.loader }}
                    </span>
                    <span
                      v-if="mod.version"
                      class="text-[10px] text-muted-foreground truncate max-w-[100px] font-mono"
                      :title="mod.version"
                    >
                      {{ mod.version }}
                    </span>
                  </div>
                </div>

                <!-- Remove Button -->
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  @click.stop="removeMod(mod.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </Button>
              </div>

              <!-- Empty State -->
              <div
                v-if="filteredInstalledMods.length === 0"
                class="p-8 text-center"
              >
                <Layers
                  class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2"
                />
                <p class="text-sm text-muted-foreground">
                  {{
                    searchQueryInstalled
                      ? "No matching mods"
                      : "No mods in this pack yet"
                  }}
                </p>
              </div>
            </div>

            <!-- Selection Footer -->
            <div
              v-if="currentMods.length > 0"
              class="shrink-0 px-3 py-2 border-t border-border/30 bg-muted/10 flex items-center justify-between text-xs"
            >
              <span class="text-muted-foreground"
                >{{ selectedModIds.size }} of
                {{ currentMods.length }} selected</span
              >
              <div class="flex gap-3">
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="selectAll"
                >
                  Select All
                </button>
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="clearSelection"
                >
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
                  <span class="text-emerald-500"
                    >{{ compatibleCount }} compatible</span
                  >
                  <span v-if="incompatibleCount > 0" class="text-amber-500"
                    >{{ incompatibleCount }} incompatible</span
                  >
                </div>
              </div>
              <div class="relative">
                <Search
                  class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                />
                <input
                  v-model="searchQueryAvailable"
                  placeholder="Search library..."
                  class="w-full h-8 pl-8 pr-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
              </div>
            </div>

            <!-- Mod List -->
            <div class="flex-1 overflow-y-auto p-2 space-y-1">
              <div
                v-for="mod in filteredAvailableMods"
                :key="mod.id"
                class="flex items-center justify-between p-2.5 rounded-lg transition-all relative"
                :class="
                  mod.isCompatible
                    ? 'hover:bg-accent/50 cursor-pointer group'
                    : 'opacity-40'
                "
              >
                <!-- Mod Info -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm truncate">{{
                      mod.name
                    }}</span>
                    <AlertCircle
                      v-if="!mod.isCompatible"
                      class="w-3.5 h-3.5 text-amber-500 shrink-0"
                    />
                  </div>
                  <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span
                      v-if="mod.game_version && mod.game_version !== 'unknown'"
                      class="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 font-medium"
                    >
                      {{ mod.game_version }}
                    </span>
                    <span
                      v-if="mod.loader && mod.loader !== 'unknown'"
                      class="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-500 font-medium capitalize"
                    >
                      {{ mod.loader }}
                    </span>
                    <span
                      v-if="mod.version"
                      class="text-[10px] text-muted-foreground truncate max-w-[80px] font-mono"
                      :title="mod.version"
                    >
                      {{ mod.version }}
                    </span>
                    <span
                      v-if="!mod.isCompatible"
                      class="text-[10px] text-amber-500 italic"
                    >
                      {{ mod.incompatibilityReason }}
                    </span>
                  </div>
                </div>

                <!-- Add Button -->
                <Button
                  v-if="mod.isCompatible"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0 hover:bg-primary/10"
                  @click.stop="addMod(mod.id)"
                >
                  <Plus class="w-4 h-4" />
                </Button>
                <Lock
                  v-else
                  class="w-4 h-4 text-muted-foreground/50 shrink-0 mr-2"
                />
              </div>

              <!-- Empty State -->
              <div
                v-if="filteredAvailableMods.length === 0"
                class="p-8 text-center"
              >
                <Package
                  class="w-10 h-10 text-muted-foreground/30 mx-auto mb-2"
                />
                <p class="text-sm text-muted-foreground">
                  No mods available to add
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- Analysis Tab -->
        <div
          v-else-if="activeTab === 'analysis'"
          class="flex-1 overflow-hidden"
        >
          <ModpackAnalysisPanel
            :modpack-id="modpackId"
            @add-mod="handleAddModFromAnalysis"
            @refresh="loadData"
          />
        </div>

        <!-- Version History Tab -->
        <div
          v-else-if="activeTab === 'versions'"
          class="flex-1 p-6 overflow-auto"
        >
          <VersionHistoryPanel
            v-if="modpack"
            :modpack-id="modpackId"
            :modpack-name="modpack.name"
            @refresh="loadData"
          />
        </div>

        <!-- Settings Tab -->
        <div
          v-else-if="activeTab === 'settings'"
          class="flex-1 p-6 overflow-auto"
        >
          <div class="max-w-2xl mx-auto space-y-6">
            <div>
              <h3 class="text-lg font-semibold mb-4">Modpack Settings</h3>

              <div class="space-y-4">
                <!-- Name -->
                <div class="space-y-2">
                  <label class="text-sm font-medium">Name</label>
                  <input
                    v-model="editForm.name"
                    type="text"
                    class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                </div>

                <!-- Version -->
                <div class="space-y-2">
                  <label class="text-sm font-medium">Version</label>
                  <input
                    v-model="editForm.version"
                    type="text"
                    class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    placeholder="1.0.0"
                  />
                </div>

                <!-- MC Version & Loader Row -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <label
                      class="text-sm font-medium flex items-center gap-1.5"
                    >
                      Minecraft Version
                      <Lock
                        v-if="isExistingModpack"
                        class="w-3 h-3 text-muted-foreground"
                      />
                    </label>
                    <select
                      v-model="editForm.minecraft_version"
                      :disabled="isExistingModpack"
                      class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select version...</option>
                      <option v-for="v in gameVersions" :key="v" :value="v">
                        {{ v }}
                      </option>
                    </select>
                  </div>

                  <div class="space-y-2">
                    <label
                      class="text-sm font-medium flex items-center gap-1.5"
                    >
                      Mod Loader
                      <Lock
                        v-if="isExistingModpack"
                        class="w-3 h-3 text-muted-foreground"
                      />
                    </label>
                    <select
                      v-model="editForm.loader"
                      :disabled="isExistingModpack"
                      class="w-full h-10 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                    >
                      <option value="">Select loader...</option>
                      <option
                        v-for="l in loaders"
                        :key="l"
                        :value="l"
                        class="capitalize"
                      >
                        {{ l }}
                      </option>
                    </select>
                  </div>
                </div>

                <p
                  v-if="isExistingModpack"
                  class="text-xs text-muted-foreground"
                >
                  Minecraft version and loader cannot be changed after modpack
                  creation to prevent mod compatibility issues.
                </p>

                <!-- Description -->
                <div class="space-y-2">
                  <label class="text-sm font-medium">Description</label>
                  <textarea
                    v-model="editForm.description"
                    rows="3"
                    class="w-full px-3 py-2 rounded-lg border border-border/50 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    placeholder="Describe your modpack..."
                  ></textarea>
                </div>

                <!-- Save Button -->
                <div class="pt-2">
                  <Button
                    @click="saveModpackInfo"
                    :disabled="isSaving"
                    class="gap-2"
                  >
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
    <UpdatesDialog
      :open="showUpdatesDialog"
      :modpack-id="modpackId"
      @close="showUpdatesDialog = false"
      @updated="loadData"
    />
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
</style>
