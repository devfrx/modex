<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import {
  Sparkles,
  RefreshCw,
  Plus,
  Loader2,
  Tag,
  ExternalLink,
  Package,
  Layers,
  Palette,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import { useToast } from "@/composables/useToast";
import type { Mod } from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isLinked: boolean;
}>();

const emit = defineEmits<{
  (e: "add-mod", projectId: number): void;
  (e: "refresh"): void;
}>();

const toast = useToast();
const recommendations = ref<Array<{ mod: any; reason: string }>>([]);
const isLoading = ref(false);
const activeTab = ref<"mod" | "resourcepack" | "shader">("mod");

const tabs = [
  { id: "mod", label: "Mods", icon: Package },
  { id: "resourcepack", label: "Resource Packs", icon: Layers },
  { id: "shader", label: "Shaders", icon: Palette },
] as const;

async function loadRecommendations(randomize = false) {
  if (isLoading.value) return;

  isLoading.value = true;
  recommendations.value = [];

  try {
    const mods = await window.api.modpacks.getMods(props.modpackId);
    const modpack = await window.api.modpacks.getById(props.modpackId);

    // Extract installed project IDs to exclude them from recommendations
    const installedProjectIds = mods
      .filter((m) => m.cf_project_id)
      .map((m) => m.cf_project_id as number);

    // Filter categories based on active tab type if possible
    // For now, we rely on the backend to handle the distinction or fallback to popular
    const categoryIds: number[] = [];

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
    console.error("Failed to load recommendations:", err);
    toast.error("Error", "Failed to load recommendations");
  } finally {
    isLoading.value = false;
  }
}

function handleAdd(mod: any) {
  emit("add-mod", mod.id);
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
    <div
      class="flex flex-col gap-6 p-6 pb-2 shrink-0 border-b border-white/5 bg-background/20 backdrop-blur-md z-10"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10"
          >
            <Sparkles class="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 class="text-xl font-bold tracking-tight text-white">
              Discover Content
            </h3>
            <p class="text-sm text-white/60">
              Smart recommendations based on your modpack
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          class="gap-2 bg-white/5 border-white/10 hover:bg-white/10"
          :disabled="isLoading"
          @click="loadRecommendations(true)"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
          Shuffle
        </Button>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all relative"
          :class="[
            activeTab === tab.id
              ? 'text-white bg-white/10'
              : 'text-white/40 hover:text-white/80 hover:bg-white/5',
          ]"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          {{ tab.label }}

          <!-- Active Indicator -->
          <div
            v-if="activeTab === tab.id"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500"
          ></div>
        </button>
      </div>
    </div>

    <!-- Scrollable Content Area -->
    <div class="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-6">
      <div
        v-if="isLoading && recommendations.length === 0"
        class="h-full flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 class="w-8 h-8 animate-spin text-primary" />
          <p>Finding the best {{ activeTab }}s for you...</p>
        </div>
      </div>

      <div
        v-else-if="recommendations.length === 0"
        class="h-full flex items-center justify-center text-center p-8"
      >
        <div class="max-w-md">
          <Sparkles class="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h4 class="text-lg font-medium mb-2">No recommendations found</h4>
          <p class="text-muted-foreground">
            Try changing your filters or refreshing to see new suggestions.
          </p>
        </div>
      </div>

      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 pb-6"
      >
        <div
          v-for="{ mod, reason } in recommendations"
          :key="mod.id"
          class="bg-card/40 border border-white/5 group relative rounded-xl overflow-hidden hover:bg-card/60 hover:border-white/20 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full shadow-lg shadow-black/20"
        >
          <!-- Thumbnail / Header -->
          <div
            class="relative h-32 bg-gradient-to-br from-black/40 to-black/60 flex items-center justify-center overflow-hidden"
          >
            <img
              v-if="mod.logo?.thumbnailUrl"
              :src="mod.logo.thumbnailUrl"
              class="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            />
            <component
              :is="tabs.find((t) => t.id === activeTab)?.icon"
              v-else
              class="w-8 h-8 text-white/20"
            />

            <!-- Gradient Overlay -->
            <div
              class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90"
            ></div>

            <div
              class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Button
                size="icon"
                variant="secondary"
                class="h-8 w-8 rounded-lg bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-white hover:text-black"
                @click.stop="openCurseForge(mod.links?.websiteUrl)"
                title="View on CurseForge"
              >
                <ExternalLink class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 flex-1 flex flex-col relative -mt-8">
            <div class="mb-3">
              <div class="flex justify-between items-start gap-2 mb-1">
                <h4
                  class="font-bold truncate text-base text-white group-hover:text-purple-400 transition-colors"
                  :title="mod.name"
                >
                  {{ mod.name }}
                </h4>
              </div>
              <p
                class="text-xs text-white/50 line-clamp-2 min-h-[2.5em] leading-relaxed"
              >
                {{ mod.summary }}
              </p>
            </div>

            <div class="mt-auto space-y-3">
              <!-- Reason Badge -->
              <div
                class="flex items-center gap-1.5 text-[10px] text-purple-300 font-medium bg-purple-500/10 px-2.5 py-1 rounded-md w-fit border border-purple-500/20"
              >
                <Sparkles class="w-3 h-3" />
                {{ reason }}
              </div>

              <!-- Stats / Meta -->
              <div
                class="flex items-center justify-between text-xs text-white/40 font-medium"
              >
                <span
                  class="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded text-[10px] border border-white/5"
                >
                  <Tag class="w-3 h-3" />
                  {{ mod.categories?.[0]?.name || "Content" }}
                </span>
                <span>
                  {{ (mod.downloadCount / 1000000).toFixed(1) }}M dls
                </span>
              </div>

              <Button
                class="w-full gap-2 transition-all shadow-lg hover:shadow-purple-500/20"
                :variant="isLinked ? 'ghost' : 'default'"
                :disabled="isLinked"
                @click="handleAdd(mod)"
              >
                <Plus class="w-4 h-4" />
                {{ isLinked ? "Managed by Remote" : "Add to Pack" }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
