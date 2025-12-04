<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  X,
  Plus,
  Trash2,
  Search,
  Download,
  Check,
  ImagePlus,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
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

const modpack = ref<Modpack | null>(null);
const currentMods = ref<Mod[]>([]);
const availableMods = ref<Mod[]>([]);
const searchQueryInstalled = ref("");
const searchQueryAvailable = ref("");
const isLoading = ref(true);
const sortBy = ref<"name" | "loader" | "version">("name");
const sortDir = ref<"asc" | "desc">("asc");
const selectedModIds = ref<Set<string>>(new Set());

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

const filteredAvailableMods = computed(() => {
  const currentIds = new Set(currentMods.value.map((m) => m.id));
  return availableMods.value.filter(
    (m) =>
      !currentIds.has(m.id) &&
      m.name.toLowerCase().includes(searchQueryAvailable.value.toLowerCase())
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
  } catch (err) {
    console.error("Failed to load modpack data:", err);
  } finally {
    isLoading.value = false;
  }
}

async function addMod(modId: string) {
  try {
    await window.api.modpacks.addMod(props.modpackId, modId);
    await loadData();
    emit("update");
  } catch (err) {
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

function toggleSort(field: "name" | "loader" | "version") {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = field;
    sortDir.value = "asc";
  }
}

async function selectImage() {
  const imagePath = await window.api.modpacks.selectImage();
  if (imagePath && modpack.value) {
    // Use the new setImage API that copies the image to the modpack folder
    const newImagePath = await window.api.modpacks.setImage(props.modpackId, imagePath);
    if (newImagePath) {
      modpack.value.image_path = newImagePath;
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
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
  >
    <div
      class="bg-background border rounded-lg shadow-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <div class="p-4 border-b flex items-center justify-between bg-card/50">
        <div>
          <h2 class="text-xl font-bold">{{ modpack?.name || "Loading..." }}</h2>
          <div class="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{{ modpack?.version }}</span>
            <span>•</span>
            <span class="font-medium text-foreground">{{
              currentMods.length
            }}</span>
            mods
            <span v-if="loaderStats.length > 0">•</span>
            <span
              v-for="stat in loaderStats"
              :key="stat.loader"
              class="text-xs bg-secondary/50 px-1.5 py-0.5 rounded"
            >
              {{ stat.count }} {{ stat.loader }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            @click="selectImage"
            title="Set cover image"
          >
            <ImagePlus class="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            @click="$emit('export')"
          >
            <Download class="w-4 h-4" />
            Export
          </Button>
          <Button variant="ghost" size="icon" @click="$emit('close')">
            <X class="w-5 h-5" />
          </Button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left: Installed Mods -->
        <div class="w-1/2 border-r flex flex-col bg-card/30">
          <div class="p-3 border-b bg-muted/20 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm">Installed Mods</span>
              <Button
                v-if="selectedModIds.size > 0"
                variant="destructive"
                size="sm"
                class="h-7 text-xs gap-1"
                @click="removeSelectedMods"
              >
                <Trash2 class="w-3 h-3" />
                Remove ({{ selectedModIds.size }})
              </Button>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Search
                  class="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground"
                />
                <input
                  v-model="searchQueryInstalled"
                  placeholder="Search installed..."
                  class="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div class="flex gap-1">
                <button
                  class="h-7 text-xs px-2 rounded-md transition-colors hover:bg-accent"
                  :class="sortBy === 'name' ? 'bg-accent' : ''"
                  @click="toggleSort('name')"
                >
                  Name
                </button>
                <button
                  class="h-7 text-xs px-2 rounded-md transition-colors hover:bg-accent"
                  :class="sortBy === 'loader' ? 'bg-accent' : ''"
                  @click="toggleSort('loader')"
                >
                  Loader
                </button>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-for="mod in filteredInstalledMods"
              :key="mod.id"
              class="flex items-center gap-2 p-2 rounded-md border transition-colors group cursor-pointer"
              :class="selectedModIds.has(mod.id) ? 'bg-primary/10 border-primary' : 'bg-background hover:bg-accent/50'"
              @click="toggleSelect(mod.id)"
            >
              <div
                class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                :class="selectedModIds.has(mod.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'"
              >
                <Check
                  v-if="selectedModIds.has(mod.id)"
                  class="w-3 h-3 text-primary-foreground"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="text-xs text-muted-foreground truncate">
                  {{ mod.version }} • {{ mod.loader }}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                @click.stop="removeMod(mod.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </Button>
            </div>
            <div
              v-if="filteredInstalledMods.length === 0"
              class="p-8 text-center text-muted-foreground text-sm"
            >
              {{
                searchQueryInstalled
                  ? "No matching mods."
                  : "No mods in this pack yet."
              }}
            </div>
          </div>

          <!-- Selection Footer -->
          <div
            v-if="currentMods.length > 0"
            class="p-2 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground"
          >
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
          <div
            class="p-3 border-b bg-muted/20 font-medium text-sm flex items-center justify-between gap-2"
          >
            <span>Available Mods</span>
            <div class="relative w-44">
              <Search
                class="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground"
              />
              <input
                v-model="searchQueryAvailable"
                placeholder="Search library..."
                class="w-full h-7 pl-7 pr-2 rounded-md border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-for="mod in filteredAvailableMods"
              :key="mod.id"
              class="flex items-center justify-between p-2 rounded-md border border-transparent hover:border-border hover:bg-accent/50 transition-colors group cursor-pointer"
            >
              <div class="min-w-0">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="text-xs text-muted-foreground truncate">
                  {{ mod.version }} • {{ mod.loader }}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop="addMod(mod.id)"
              >
                <Plus class="w-4 h-4" />
              </Button>
            </div>
            <div
              v-if="filteredAvailableMods.length === 0"
              class="p-8 text-center text-muted-foreground text-sm"
            >
              No matching mods found.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
