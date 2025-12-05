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
  Edit,
  Save,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import UpdatesDialog from "@/components/mods/UpdatesDialog.vue";
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
const searchQueryInstalled = ref("");
const searchQueryAvailable = ref("");
const isLoading = ref(true);
const isRefreshingMetadata = ref(false);
const sortBy = ref<"name" | "version">("name");
const sortDir = ref<"asc" | "desc">("asc");
const selectedModIds = ref<Set<string>>(new Set());
const showUpdatesDialog = ref(false);
const showEditInfo = ref(false);
const isSaving = ref(false);

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
    // NeoForge and Forge have some compatibility
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

// Stats
const loaderStats = computed(() => {
  const stats: Record<string, number> = {};
  for (const mod of currentMods.value) {
    stats[mod.loader] = (stats[mod.loader] || 0) + 1;
  }
  return Object.entries(stats).map(([loader, count]) => ({ loader, count }));
});

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
  return (
    availableMods.value
      .filter(
        (m) =>
          !currentIds.has(m.id) &&
          m.name
            .toLowerCase()
            .includes(searchQueryAvailable.value.toLowerCase())
      )
      .map((mod) => {
        const compatibility = isModCompatible(mod);
        return {
          ...mod,
          isCompatible: compatibility.compatible,
          incompatibilityReason: compatibility.reason,
        };
      })
      // Sort: compatible mods first, then incompatible
      .sort((a, b) => {
        if (a.isCompatible && !b.isCompatible) return -1;
        if (!a.isCompatible && b.isCompatible) return 1;
        return a.name.localeCompare(b.name);
      })
  );
});

async function loadData() {
  if (!props.modpackId) return;
  isLoading.value = true;
  try {
    const [pack, cMods, allMods] = await Promise.all([
      window.api.modpacks.getById(props.modpackId),
      window.api.modpacks.getMods(props.modpackId),
      window.api.mods.getAll(),
    ]);
    modpack.value = pack || null;
    currentMods.value = cMods;
    availableMods.value = allMods;
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

    // Reload data to reflect changes
    await loadData();
    showEditInfo.value = false;
    emit("update");
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

async function removeSelectedMods() {
  if (selectedModIds.value.size === 0) return;

  // Copy the Set to an array before iterating to avoid mutation issues
  const idsToRemove: string[] = Array.from(selectedModIds.value);

  try {
    for (const id of idsToRemove) {
      await window.api.modpacks.removeMod(props.modpackId, id);
    }
    selectedModIds.value = new Set(); // Clear selection reactively
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
    // Use the new setImage API that stores the URL
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

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) loadData();
  },
  { immediate: true }
);

// Also watch modpackId changes
watch(
  () => props.modpackId,
  () => {
    if (props.isOpen) loadData();
  }
);
</script>

<template>
  <div v-if="isOpen"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
    <div
      class="bg-background border rounded-lg shadow-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="p-4 border-b bg-card/50">
        <!-- View mode -->
        <div v-if="!showEditInfo" class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold">
              {{ modpack?.name || "Loading..." }}
            </h2>
            <div class="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{{ modpack?.version }}</span>
              <span>•</span>
              <span class="font-medium text-foreground">{{
                currentMods.length
              }}</span>
              mods
              <span v-if="modpack?.minecraft_version"
                class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs">
                {{ modpack.minecraft_version }}
              </span>
              <span v-if="modpack?.loader"
                class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs capitalize">
                {{ modpack.loader }}
              </span>
            </div>
            <p v-if="modpack?.description" class="text-sm text-muted-foreground mt-1 line-clamp-1">
              {{ modpack.description }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" @click="showEditInfo = true" title="Edit modpack info">
              <Edit class="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" class="gap-2" @click="selectImage" title="Set cover image">
              <ImagePlus class="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" class="gap-2"
              :disabled="!modpack?.minecraft_version || !modpack?.loader" :title="!modpack?.minecraft_version || !modpack?.loader
                ? 'Set Minecraft version and loader first'
                : 'Check for mod updates'
                " @click="showUpdatesDialog = true">
              <ArrowUpCircle class="w-4 h-4" />
              Updates
            </Button>
            <Button variant="outline" size="sm" class="gap-2" @click="$emit('export')" title="Export as ZIP file">
              <Download class="w-4 h-4" />
              Export ZIP
            </Button>
            <Button variant="ghost" size="icon" @click="$emit('close')">
              <X class="w-5 h-5" />
            </Button>
          </div>
        </div>

        <!-- Edit mode -->
        <div v-else class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">Edit Modpack Info</h2>
            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" @click="showEditInfo = false" :disabled="isSaving">
                Cancel
              </Button>
              <Button size="sm" class="gap-2" @click="saveModpackInfo" :disabled="isSaving">
                <Save class="w-4 h-4" />
                {{ isSaving ? "Saving..." : "Save" }}
              </Button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">Name</label>
              <input v-model="editForm.name" type="text"
                class="w-full h-9 px-3 rounded-md border bg-background text-sm" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">Version</label>
              <input v-model="editForm.version" type="text"
                class="w-full h-9 px-3 rounded-md border bg-background text-sm" placeholder="1.0.0" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                Minecraft Version
                <Lock v-if="isExistingModpack" class="w-3 h-3" title="Cannot change version of existing modpack" />
              </label>
              <select v-model="editForm.minecraft_version" :disabled="isExistingModpack"
                class="w-full h-9 px-3 rounded-md border bg-background text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                :title="isExistingModpack ? 'Cannot change version of existing modpack. Use conversion feature to create a copy with different version.' : ''">
                <option value="">Select version...</option>
                <option v-for="v in gameVersions" :key="v" :value="v">
                  {{ v }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                Mod Loader
                <Lock v-if="isExistingModpack" class="w-3 h-3" title="Cannot change loader of existing modpack" />
              </label>
              <select v-model="editForm.loader" :disabled="isExistingModpack"
                class="w-full h-9 px-3 rounded-md border bg-background text-sm disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                :title="isExistingModpack ? 'Cannot change loader of existing modpack. Use conversion feature to create a copy with different loader.' : ''">
                <option value="">Select loader...</option>
                <option v-for="l in loaders" :key="l" :value="l" class="capitalize">
                  {{ l }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea v-model="editForm.description" rows="2"
              class="w-full px-3 py-2 rounded-md border bg-background text-sm resize-none"
              placeholder="Modpack description..."></textarea>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left: Installed Mods -->
        <div class="w-1/2 border-r flex flex-col bg-card/30">
          <div class="p-3 border-b bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm">Installed Mods</span>
              <Button v-if="selectedModIds.size > 0" variant="destructive" size="sm" class="h-7 text-xs gap-1"
                @click="removeSelectedMods">
                <Trash2 class="w-3 h-3" />
                Remove ({{ selectedModIds.size }})
              </Button>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Search class="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <input v-model="searchQueryInstalled" placeholder="Search installed..."
                  class="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div class="flex gap-1">
                <button class="h-7 text-xs px-2 rounded-md transition-colors hover:bg-accent"
                  :class="sortBy === 'name' ? 'bg-accent' : ''" @click="toggleSort('name')">
                  Name
                </button>
                <button class="h-7 text-xs px-2 rounded-md transition-colors hover:bg-accent"
                  :class="sortBy === 'version' ? 'bg-accent' : ''" @click="toggleSort('version')">
                  Version
                </button>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div v-for="mod in filteredInstalledMods" :key="mod.id"
              class="flex items-center gap-2 p-2 rounded-md border transition-colors group cursor-pointer" :class="selectedModIds.has(mod.id)
                ? 'bg-primary/10 border-primary'
                : 'bg-background hover:bg-accent/50'
                " @click="toggleSelect(mod.id)">
              <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors" :class="selectedModIds.has(mod.id)
                ? 'bg-primary border-primary'
                : 'border-muted-foreground/30'
                ">
                <Check v-if="selectedModIds.has(mod.id)" class="w-3 h-3 text-primary-foreground" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span v-if="mod.game_version && mod.game_version !== 'unknown'"
                    class="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{ mod.game_version
                    }}</span>
                  <span v-if="mod.loader && mod.loader !== 'unknown'"
                    class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">{{ mod.loader
                    }}</span>
                  <span v-if="mod.version" class="text-[10px] text-muted-foreground truncate max-w-[100px]"
                    :title="mod.version">{{ mod.version }}</span>
                </div>
              </div>
              <Button variant="ghost" size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                @click.stop="removeMod(mod.id)">
                <Trash2 class="w-3.5 h-3.5" />
              </Button>
            </div>
            <div v-if="filteredInstalledMods.length === 0" class="p-8 text-center text-muted-foreground text-sm">
              {{
                searchQueryInstalled
                  ? "No matching mods."
                  : "No mods in this pack yet."
              }}
            </div>
          </div>

          <!-- Selection Footer -->
          <div v-if="currentMods.length > 0"
            class="p-2 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>{{ selectedModIds.size }} selected</span>
            <div class="flex gap-2">
              <button class="hover:text-foreground" @click="selectAll">
                Select All
              </button>
              <button class="hover:text-foreground" @click="clearSelection">
                Clear
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Available Mods -->
        <div class="w-1/2 flex flex-col bg-background">
          <div class="p-3 border-b bg-muted/20 font-medium text-sm flex items-center justify-between gap-2">
            <span>Available Mods</span>
            <div class="flex items-center gap-2">
              <div class="relative w-44">
                <Search class="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <input v-model="searchQueryAvailable" placeholder="Search library..."
                  class="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div v-for="mod in filteredAvailableMods" :key="mod.id"
              class="flex items-center justify-between p-2 rounded-md border transition-colors relative" :class="[
                mod.isCompatible
                  ? 'border-transparent hover:border-border hover:bg-accent/50 cursor-pointer group'
                  : 'border-transparent bg-muted/30 opacity-50 cursor-not-allowed',
              ]" :title="mod.incompatibilityReason">
              <!-- Lock icon for incompatible mods -->
              <div v-if="!mod.isCompatible"
                class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="bg-background/80 rounded-full p-1">
                  <Lock class="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span v-if="mod.game_version && mod.game_version !== 'unknown'"
                    class="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{{ mod.game_version
                    }}</span>
                  <span v-if="mod.loader && mod.loader !== 'unknown'"
                    class="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 capitalize">{{ mod.loader
                    }}</span>
                  <span v-if="mod.version" class="text-[10px] text-muted-foreground truncate max-w-[80px]"
                    :title="mod.version">{{ mod.version }}</span>
                  <span v-if="!mod.isCompatible" class="text-[10px] text-yellow-500">
                    ({{ mod.incompatibilityReason }})
                  </span>
                </div>
              </div>
              <Button v-if="mod.isCompatible" variant="ghost" size="icon"
                class="h-7 w-7 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop="addMod(mod.id)">
                <Plus class="w-4 h-4" />
              </Button>
            </div>
            <div v-if="filteredAvailableMods.length === 0" class="p-8 text-center text-muted-foreground text-sm">
              No matching mods found.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Updates Dialog -->
    <UpdatesDialog :open="showUpdatesDialog" :modpack-id="modpackId" @close="showUpdatesDialog = false"
      @updated="loadData" />
  </div>
</template>
