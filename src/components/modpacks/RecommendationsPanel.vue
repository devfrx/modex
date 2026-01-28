<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { createLogger } from "@/utils/logger";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import FilePickerDialog from "@/components/mods/FilePickerDialog.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import { useToast } from "@/composables/useToast";
import type { Mod } from "@/types/electron";

const log = createLogger("RecommendationsPanel");

const props = defineProps<{
  modpackId: string;
  isLinked: boolean;
  installedProjectFiles?: Map<number, Set<number>>;
}>();

const emit = defineEmits<{
  (e: "add-mod", projectId: number, fileId?: number): void;
  (e: "refresh"): void;
}>();

const toast = useToast();
const recommendations = ref<Array<{ mod: any; reason: string }>>([]);
const isLoading = ref(false);
const activeTab = ref<"mod" | "resourcepack" | "shader">("mod");

// File picker state
const showFilePicker = ref(false);
const selectedMod = ref<any>(null);
const modpackInfo = ref<{ version?: string; loader?: string }>({});

const tabs = [
  { id: "mod", label: "Mods", icon: "Package" },
  { id: "resourcepack", label: "Resource Packs", icon: "Layers" },
  { id: "shader", label: "Shaders", icon: "Palette" },
] as const;

async function loadRecommendations(randomize = false) {
  if (isLoading.value) return;

  isLoading.value = true;
  recommendations.value = [];

  try {
    const mods = await window.api.modpacks.getMods(props.modpackId);
    const modpack = await window.api.modpacks.getById(props.modpackId);

    // Store modpack info for file picker
    modpackInfo.value = {
      version: modpack?.minecraft_version,
      loader: modpack?.loader,
    };

    // Extract installed project IDs to exclude them from recommendations
    const installedProjectIds = mods
      .filter((m) => m.cf_project_id)
      .map((m) => m.cf_project_id as number);

    // Extract categories from installed mods for smart recommendations
    const categoryIds: number[] = [];
    mods.forEach((mod) => {
      if (mod.cf_categories) {
        categoryIds.push(...mod.cf_categories);
      }
    });

    const result = await window.api.curseforge.getRecommendations(
      categoryIds,
      modpack?.minecraft_version,
      modpack?.loader,
      installedProjectIds,
      20, // Fetch 20 items
      randomize,
      activeTab.value
    );

    recommendations.value = result;
  } catch (err) {
    log.error("Failed to load recommendations", { modpackId: props.modpackId, error: String(err) });
    toast.error("Error", "Failed to load recommendations");
  } finally {
    isLoading.value = false;
  }
}

function handleAdd(mod: any) {
  // Open file picker dialog to select specific version
  selectedMod.value = mod;
  showFilePicker.value = true;
}

function handleFileSelect(fileId: number) {
  if (selectedMod.value) {
    emit("add-mod", selectedMod.value.id, fileId);
    selectedMod.value = null;
  }
}

function openCurseForge(url: string) {
  if (url) window.open(url, "_blank");
}

// Reload when tab changes
watch(activeTab, () => {
  loadRecommendations(true);
});

onMounted(() => {
  loadRecommendations(true); // Initial load with randomization
});
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Header Section -->
    <div class="flex flex-col gap-5 p-5 pb-2 shrink-0 border-b border-border/30 bg-background/30 backdrop-blur-md z-10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
            <Icon name="Sparkles" class="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 class="text-lg font-semibold tracking-tight">
              Discover Content
            </h3>
            <p class="text-xs text-muted-foreground">
              Smart recommendations based on your modpack
            </p>
          </div>
        </div>

        <Button variant="secondary" size="sm" class="gap-1.5" :disabled="isLoading" @click="loadRecommendations(true)">
          <Icon name="RefreshCw" class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" />
          Shuffle
        </Button>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1">
        <button v-for="tab in tabs" :key="tab.id"
          class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all relative" :class="[
            activeTab === tab.id
              ? 'text-foreground bg-muted'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          ]" @click="activeTab = tab.id">
          <component :is="tab.icon" class="w-3.5 h-3.5" />
          {{ tab.label }}

          <!-- Active Indicator -->
          <div v-if="activeTab === tab.id" class="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"></div>
        </button>
      </div>
    </div>

    <!-- Scrollable Content Area -->
    <div class="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-6">
      <div v-if="isLoading && recommendations.length === 0" class="h-full flex items-center justify-center">
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <Icon name="Loader2" class="w-8 h-8 animate-spin text-primary" />
          <p>Finding the best {{ activeTab }}s for you...</p>
        </div>
      </div>

      <div v-else-if="recommendations.length === 0" class="h-full flex items-center justify-center text-center p-8">
        <div class="max-w-md">
          <Icon name="Sparkles" class="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h4 class="text-lg font-medium mb-2">No recommendations found</h4>
          <p class="text-muted-foreground">
            Try changing your filters or refreshing to see new suggestions.
          </p>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 pb-6">
        <div v-for="{ mod, reason } in recommendations" :key="mod.id"
          class="bg-card/50 border border-border/40 group relative rounded-lg overflow-hidden hover:bg-card/70 hover:border-border/70 transition-all duration-150 flex flex-col h-full">
          <!-- Thumbnail / Header -->
          <div
            class="relative h-28 bg-gradient-to-br from-muted/40 to-muted/60 flex items-center justify-center overflow-hidden">
            <img v-if="mod.logo?.thumbnailUrl" :src="mod.logo.thumbnailUrl"
              class="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" />
            <component :is="tabs.find((t) => t.id === activeTab)?.icon" v-else
              class="w-8 h-8 text-muted-foreground/20" />

            <!-- Gradient Overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90">
            </div>

            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip content="View on CurseForge" position="left">
                <Button size="icon" variant="secondary"
                  class="h-7 w-7 rounded-md bg-background/60 backdrop-blur-md border border-border/30 hover:bg-background"
                  @click.stop="openCurseForge(mod.links?.websiteUrl)">
                  <Icon name="ExternalLink" class="w-3.5 h-3.5" />
                </Button>
              </Tooltip>
            </div>
          </div>

          <!-- Content -->
          <div class="p-3.5 flex-1 flex flex-col relative -mt-8">
            <div class="mb-2.5">
              <div class="flex justify-between items-start gap-2 mb-1">
                <Tooltip :content="mod.name" position="top">
                  <h4 class="font-semibold truncate text-sm group-hover:text-primary transition-colors">
                    {{ mod.name }}
                  </h4>
                </Tooltip>
              </div>
              <p class="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em] leading-relaxed">
                {{ mod.summary }}
              </p>
            </div>

            <div class="mt-auto space-y-2.5">
              <!-- Reason Badge -->
              <div
                class="flex items-center gap-1.5 text-[10px] text-primary font-medium bg-primary/10 px-2 py-1 rounded w-fit border border-primary/20">
                <Icon name="Sparkles" class="w-3 h-3" />
                {{ reason }}
              </div>

              <!-- Stats / Meta -->
              <div class="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span
                  class="flex items-center gap-1.5 bg-muted/30 px-2 py-0.5 rounded text-[10px] border border-border/30">
                  <Icon name="Tag" class="w-3 h-3" />
                  {{ mod.categories?.[0]?.name || "Content" }}
                </span>
                <span>
                  {{ (mod.downloadCount / 1000000).toFixed(1) }}M dls
                </span>
              </div>

              <Button class="w-full gap-1.5 h-8 text-xs" :variant="isLinked ? 'ghost' : 'default'" :disabled="isLinked"
                @click="handleAdd(mod)">
                <Icon name="Plus" class="w-3.5 h-3.5" />
                {{ isLinked ? "Managed by Remote" : "Add to Pack" }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- File Picker Dialog -->
    <FilePickerDialog :open="showFilePicker" :mod="selectedMod" :gameVersion="modpackInfo.version"
      :modLoader="modpackInfo.loader" :contentType="activeTab" :installed-project-files="installedProjectFiles"
      @close="showFilePicker = false" @select="handleFileSelect" />
  </div>
</template>
