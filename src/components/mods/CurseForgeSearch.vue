<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  Search,
  Download,
  Plus,
  ChevronDown,
  Loader2,
  ExternalLink,
  Star,
  X,
  AlertTriangle,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";

const props = defineProps<{
  open: boolean;
  gameVersion?: string;
  modLoader?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "added", mod: any): void;
}>();

// State
const searchQuery = ref("");
const selectedVersion = ref(props.gameVersion || "");
const selectedLoader = ref(props.modLoader || "");
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const isAddingMod = ref<number | null>(null);
const hasApiKey = ref(false);
const showFilters = ref(false);
const currentPage = ref(0);
const totalResults = ref(0);
const pageSize = 20;

// Available filters
const gameVersions = [
  "", "1.21.4", "1.21.3", "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.20",
  "1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19", "1.18.2", "1.18.1", "1.18",
  "1.17.1", "1.17", "1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1",
];

const modLoaders = [
  { value: "", label: "All Loaders" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
];

// Check API key on mount
onMounted(async () => {
  hasApiKey.value = await window.api.curseforge.hasApiKey();
  if (hasApiKey.value && props.open) {
    loadPopular();
  }
});

// Watch for open changes
watch(() => props.open, (isOpen) => {
  if (isOpen && hasApiKey.value && searchResults.value.length === 0) {
    loadPopular();
  }
});

// Load popular mods
async function loadPopular() {
  if (!hasApiKey.value) return;
  
  isSearching.value = true;
  try {
    const mods = await window.api.curseforge.getPopular(
      selectedVersion.value || undefined,
      selectedLoader.value || undefined
    );
    searchResults.value = mods;
  } catch (err) {
    console.error("Failed to load popular mods:", err);
  } finally {
    isSearching.value = false;
  }
}

// Search mods
async function searchMods() {
  if (!hasApiKey.value) return;
  
  isSearching.value = true;
  currentPage.value = 0;
  
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      pageSize,
      index: 0,
    });
    
    searchResults.value = result.mods;
    totalResults.value = result.pagination.totalCount;
  } catch (err) {
    console.error("Failed to search mods:", err);
  } finally {
    isSearching.value = false;
  }
}

// Load more results
async function loadMore() {
  if (!hasApiKey.value || isSearching.value) return;
  
  isSearching.value = true;
  currentPage.value++;
  
  try {
    const result = await window.api.curseforge.search({
      query: searchQuery.value || undefined,
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
      pageSize,
      index: currentPage.value * pageSize,
    });
    
    searchResults.value = [...searchResults.value, ...result.mods];
  } catch (err) {
    console.error("Failed to load more mods:", err);
    currentPage.value--;
  } finally {
    isSearching.value = false;
  }
}

// Add mod to library
async function addToLibrary(mod: any) {
  isAddingMod.value = mod.id;
  
  try {
    // Get the best file for the selected version/loader
    const files = await window.api.curseforge.getModFiles(mod.id, {
      gameVersion: selectedVersion.value || undefined,
      modLoader: selectedLoader.value || undefined,
    });
    
    if (files.length === 0) {
      console.error("No compatible files found");
      return;
    }
    
    // Use the first (most recent) file
    const file = files[0];
    
    // Add to library, passing the selected loader for priority
    const addedMod = await window.api.mods.addFromCurseForge(
      mod.id, 
      file.id, 
      selectedLoader.value || undefined
    );
    
    if (addedMod) {
      emit("added", addedMod);
    }
  } catch (err) {
    console.error("Failed to add mod:", err);
  } finally {
    isAddingMod.value = null;
  }
}

// Format download count
function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + "M";
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + "K";
  }
  return count.toString();
}

// Get authors string
function getAuthors(mod: any): string {
  if (!mod.authors || mod.authors.length === 0) return "Unknown";
  return mod.authors.map((a: any) => a.name).join(", ");
}

// ModLoader ID to name mapping
const loaderNames: Record<number, string> = {
  1: "Forge",
  4: "Fabric", 
  5: "Quilt",
  6: "NeoForge",
};

const loaderIds: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

// Find the best matching file index based on filters
function findMatchingFileIndex(mod: any): any | null {
  if (!mod.latestFilesIndexes || mod.latestFilesIndexes.length === 0) {
    return null;
  }
  
  const targetVersion = selectedVersion.value || null;
  const targetLoader = selectedLoader.value ? loaderIds[selectedLoader.value.toLowerCase()] : null;
  
  // Try to find exact match for both version and loader
  if (targetVersion && targetLoader) {
    const exactMatch = mod.latestFilesIndexes.find(
      (idx: any) => idx.gameVersion === targetVersion && idx.modLoader === targetLoader
    );
    if (exactMatch) return exactMatch;
  }
  
  // Try to match version only
  if (targetVersion) {
    const versionMatch = mod.latestFilesIndexes.find(
      (idx: any) => idx.gameVersion === targetVersion
    );
    if (versionMatch) return versionMatch;
  }
  
  // Try to match loader only
  if (targetLoader) {
    const loaderMatch = mod.latestFilesIndexes.find(
      (idx: any) => idx.modLoader === targetLoader
    );
    if (loaderMatch) return loaderMatch;
  }
  
  // Fallback to first available
  return mod.latestFilesIndexes[0];
}

// Get game version for display from the matching file
function getModGameVersion(mod: any): string {
  const matchingFile = findMatchingFileIndex(mod);
  return matchingFile?.gameVersion || "";
}

// Get mod loader for display from the matching file
function getModLoader(mod: any): string {
  const matchingFile = findMatchingFileIndex(mod);
  if (matchingFile?.modLoader && loaderNames[matchingFile.modLoader]) {
    return loaderNames[matchingFile.modLoader];
  }
  return "";
}

// Check if the mod matches the current filters
function matchesFilters(mod: any): boolean {
  const matchingFile = findMatchingFileIndex(mod);
  if (!matchingFile) return false;
  
  const targetVersion = selectedVersion.value || null;
  const targetLoader = selectedLoader.value ? loaderIds[selectedLoader.value.toLowerCase()] : null;
  
  if (targetVersion && matchingFile.gameVersion !== targetVersion) {
    return false;
  }
  if (targetLoader && matchingFile.modLoader !== targetLoader) {
    return false;
  }
  return true;
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (searchQuery.value.trim()) {
      searchMods();
    } else {
      loadPopular();
    }
  }, 500);
}

// Has more results
const hasMore = computed(() => {
  return searchResults.value.length < totalResults.value;
});
</script>

<template>
  <Dialog :open="open" @close="emit('close')" maxWidth="4xl">
    <template #title>
      <div class="flex items-center gap-2">
        <Search class="w-5 h-5" />
        Browse CurseForge
      </div>
    </template>

    <div class="space-y-4">
      <!-- API Key Warning -->
      <div
        v-if="!hasApiKey"
        class="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-500 text-sm"
      >
        <strong>CurseForge API Key Required</strong>
        <p class="mt-1 text-yellow-500/80">
          Please set your CurseForge API key in Settings to browse and download mods.
          <a
            href="https://console.curseforge.com/"
            target="_blank"
            class="underline inline-flex items-center gap-1"
          >
            Get API Key <ExternalLink class="w-3 h-3" />
          </a>
        </p>
      </div>

      <!-- Search & Filters -->
      <div v-if="hasApiKey" class="space-y-3">
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search mods..."
              class="w-full h-10 pl-10 pr-4 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              @input="onSearchInput"
              @keyup.enter="searchMods"
            />
          </div>
          <Button variant="outline" @click="showFilters = !showFilters">
            Filters
            <ChevronDown class="w-4 h-4 ml-1" :class="{ 'rotate-180': showFilters }" />
          </Button>
        </div>

        <!-- Filter Panel -->
        <div v-if="showFilters" class="flex gap-4 p-3 bg-muted/30 rounded-lg">
          <div class="flex-1">
            <label class="text-xs text-muted-foreground mb-1 block">Minecraft Version</label>
            <select
              v-model="selectedVersion"
              class="w-full h-9 px-3 rounded-md border bg-background text-sm"
              @change="searchQuery ? searchMods() : loadPopular()"
            >
              <option value="">All Versions</option>
              <option v-for="v in gameVersions.filter(Boolean)" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div class="flex-1">
            <label class="text-xs text-muted-foreground mb-1 block">Mod Loader</label>
            <select
              v-model="selectedLoader"
              class="w-full h-9 px-3 rounded-md border bg-background text-sm"
              @change="searchQuery ? searchMods() : loadPopular()"
            >
              <option v-for="l in modLoaders" :key="l.value" :value="l.value">{{ l.label }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div v-if="hasApiKey" class="relative min-h-[400px] max-h-[500px] overflow-y-auto">
        <!-- Loading -->
        <div v-if="isSearching && searchResults.length === 0" class="flex items-center justify-center py-20">
          <Loader2 class="w-8 h-8 animate-spin text-primary" />
        </div>

        <!-- Results Grid -->
        <div v-else-if="searchResults.length > 0" class="grid grid-cols-1 gap-2">
          <div
            v-for="mod in searchResults"
            :key="mod.id"
            class="flex items-center gap-4 p-3 rounded-lg border transition-colors"
            :class="matchesFilters(mod) ? 'bg-card hover:bg-accent/50' : 'bg-orange-500/5 border-orange-500/30'"
          >
            <!-- Thumbnail -->
            <img
              v-if="mod.logo?.thumbnailUrl"
              :src="mod.logo.thumbnailUrl"
              :alt="mod.name"
              class="w-12 h-12 rounded-md object-cover bg-muted"
            />
            <div v-else class="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
              <Star class="w-5 h-5 text-muted-foreground" />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate flex items-center gap-2">
                {{ mod.name }}
                <AlertTriangle 
                  v-if="!matchesFilters(mod)" 
                  class="w-4 h-4 text-orange-500 flex-shrink-0" 
                  title="Version/loader mismatch with filters"
                />
              </div>
              <div class="text-xs text-muted-foreground truncate">
                by {{ getAuthors(mod) }}
              </div>
              <div class="text-xs flex items-center gap-3 mt-1">
                <span class="flex items-center gap-1 text-muted-foreground">
                  <Download class="w-3 h-3" />
                  {{ formatDownloads(mod.downloadCount) }}
                </span>
                <span 
                  v-if="getModGameVersion(mod)" 
                  class="flex items-center gap-1"
                  :class="selectedVersion && getModGameVersion(mod) !== selectedVersion ? 'text-orange-500' : 'text-muted-foreground'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="selectedVersion && getModGameVersion(mod) !== selectedVersion ? 'bg-orange-500/50' : 'bg-green-500/50'" />
                  {{ getModGameVersion(mod) }}
                </span>
                <span 
                  v-if="getModLoader(mod)" 
                  class="flex items-center gap-1"
                  :class="selectedLoader && getModLoader(mod).toLowerCase() !== selectedLoader.toLowerCase() ? 'text-orange-500' : 'text-muted-foreground'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="selectedLoader && getModLoader(mod).toLowerCase() !== selectedLoader.toLowerCase() ? 'bg-orange-500/50' : 'bg-primary/50'" />
                  {{ getModLoader(mod) }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <Button
              size="sm"
              :disabled="isAddingMod === mod.id"
              @click="addToLibrary(mod)"
            >
              <Loader2 v-if="isAddingMod === mod.id" class="w-4 h-4 animate-spin" />
              <Plus v-else class="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          <!-- Load More -->
          <div v-if="hasMore" class="flex justify-center py-4">
            <Button variant="outline" :disabled="isSearching" @click="loadMore">
              <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin mr-2" />
              Load More
            </Button>
          </div>
        </div>

        <!-- No Results -->
        <div v-else class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Search class="w-12 h-12 mb-4 opacity-50" />
          <p>No mods found. Try a different search.</p>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="emit('close')">
        Close
      </Button>
    </template>
  </Dialog>
</template>
