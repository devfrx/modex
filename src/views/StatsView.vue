<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import ChartCard from "@/components/stats/ChartCard.vue";
import ColorPicker from "@/components/stats/ColorPicker.vue";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
} from "chart.js";
import { Bar } from "vue-chartjs";
import {
  BarChart3,
  PieChart,
  Package,
  Layers,
  RefreshCw,
  HardDrive,
  Target,
  ArrowUpRight,
  Star,
  Settings,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-vue-next";
import type { Mod, Modpack } from "@/types/electron";

// Register Chart.js components
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler
);

const toast = useToast();

const isLoading = ref(true);
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);

// Animated stats
const animatedTotalMods = ref(0);
const animatedTotalModpacks = ref(0);
const animatedTotalSize = ref(0);
const animatedLoaders = ref(0);

// Settings
const SETTINGS_KEY = "modex:stats:settings";
const showSettings = ref(false);

// Custom colors
const customColors = ref<string[]>([
  "#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308", "#06b6d4", "#ec4899"
]);

const backgroundColors = computed(() =>
  customColors.value.map(c => c + "cc")
);

// Chart visibility settings
const chartVisibility = ref<Record<string, boolean>>({
  loader: true,
  version: true,
  content: true,
  modpackSizes: true,
  mostUsed: true,
});

// Chart types for each chart
const chartTypes = {
  loader: ["doughnut", "polar", "bar", "pie"] as const,
  version: ["bar", "line", "radar", "polar"] as const,
  content: ["doughnut", "polar", "bar", "pie"] as const,
  modpackSizes: ["bar", "line"] as const,
  mostUsed: ["bar", "polar", "radar"] as const,
};

// Save/Load settings
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    customColors: customColors.value,
    chartVisibility: chartVisibility.value,
  }));
}

function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      const settings = JSON.parse(stored);
      if (settings.customColors) customColors.value = settings.customColors;
      if (settings.chartVisibility) chartVisibility.value = { ...chartVisibility.value, ...settings.chartVisibility };
    } catch (e) {
      console.error("Failed to load stats settings:", e);
    }
  }
}

function resetSettings() {
  customColors.value = ["#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308", "#06b6d4", "#ec4899"];
  chartVisibility.value = {
    loader: true,
    version: true,
    content: true,
    modpackSizes: true,
    mostUsed: true,
  };
  saveSettings();
}

watch([customColors, chartVisibility], saveSettings, { deep: true });

function animateValue(start: number, end: number, setter: (val: number) => void, duration = 1000) {
  const startTime = performance.now();
  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    setter(Math.floor(start + (end - start) * eased));
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

// Stats computed
const totalMods = computed(() => mods.value.length);
const totalModpacks = computed(() => modpacks.value.length);

const totalSize = computed(() => {
  return mods.value.reduce((sum, mod) => sum + (mod.file_size || 0), 0);
});

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024)
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
};

// Loader distribution
const loaderStats = computed(() => {
  const counts: Record<string, number> = {};
  for (const mod of mods.value) {
    const loader = mod.loader || "Unknown";
    counts[loader] = (counts[loader] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / totalMods.value) * 100,
    }))
    .sort((a, b) => b.count - a.count);
});

// Game version distribution
const versionStats = computed(() => {
  const counts: Record<string, number> = {};
  for (const mod of mods.value) {
    const version = mod.game_version || "Unknown";
    counts[version] = (counts[version] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / totalMods.value) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
});

// Content type distribution
const contentTypeStats = computed(() => {
  const counts: Record<string, number> = { mod: 0, resourcepack: 0, shader: 0 };
  for (const mod of mods.value) {
    const type = mod.content_type || "mod";
    counts[type] = (counts[type] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({
      name:
        name === "resourcepack"
          ? "Resource Packs"
          : name.charAt(0).toUpperCase() + name.slice(1) + "s",
      count,
      percentage: (count / totalMods.value) * 100,
    }))
    .filter((item) => item.count > 0);
});

// Modpack mod counts
const modpackModCounts = ref<{ name: string; count: number }[]>([]);

// Most used mods
const modUsage = ref<Map<string, string[]>>(new Map());
const mostUsedMods = computed(() => {
  return Array.from(modUsage.value.entries())
    .map(([id, packs]) => {
      const mod = mods.value.find((m) => m.id === id);
      return {
        id,
        name: mod?.name || "Unknown",
        packCount: packs.length,
        packs,
      };
    })
    .filter((item) => item.packCount > 1)
    .sort((a, b) => b.packCount - a.packCount)
    .slice(0, 10);
});

// Chart data
const loaderChartData = computed(() => ({
  labels: loaderStats.value.map((s) => s.name),
  datasets: [
    {
      data: loaderStats.value.map((s) => s.count),
    },
  ],
}));

const versionChartData = computed(() => ({
  labels: versionStats.value.map((s) => s.name),
  datasets: [
    {
      label: "Mods",
      data: versionStats.value.map((s) => s.count),
    },
  ],
}));

const contentChartData = computed(() => ({
  labels: contentTypeStats.value.map((s) => s.name),
  datasets: [
    {
      data: contentTypeStats.value.map((s) => s.count),
    },
  ],
}));

const modpackChartData = computed(() => ({
  labels: modpackModCounts.value.map((p) => p.name),
  datasets: [
    {
      label: "Mods in Pack",
      data: modpackModCounts.value.map((p) => p.count),
    },
  ],
}));

const mostUsedChartData = computed(() => ({
  labels: mostUsedMods.value.map((m) => m.name),
  datasets: [
    {
      label: "Used in Packs",
      data: mostUsedMods.value.map((m) => m.packCount),
    },
  ],
}));

// Count visible charts
const visibleChartCount = computed(() =>
  Object.values(chartVisibility.value).filter(Boolean).length
);

async function loadData() {
  isLoading.value = true;
  try {
    const [modsData, modpacksData] = await Promise.all([
      window.api.mods.getAll(),
      window.api.modpacks.getAll(),
    ]);
    mods.value = modsData;
    modpacks.value = modpacksData;

    // Calculate mod usage across modpacks
    const usage = new Map<string, string[]>();
    const packCounts: { name: string; count: number }[] = [];

    for (const pack of modpacksData) {
      const packMods = await window.api.modpacks.getMods(pack.id);
      packCounts.push({ name: pack.name, count: packMods.length });

      for (const mod of packMods) {
        if (!usage.has(mod.id)) {
          usage.set(mod.id, []);
        }
        usage.get(mod.id)?.push(pack.name);
      }
    }

    modUsage.value = usage;
    modpackModCounts.value = packCounts.sort((a, b) => b.count - a.count);

    // Animate values
    animateValue(0, modsData.length, (v) => (animatedTotalMods.value = v));
    animateValue(0, modpacksData.length, (v) => (animatedTotalModpacks.value = v));
    animateValue(0, totalSize.value, (v) => (animatedTotalSize.value = v), 1500);
    animateValue(0, loaderStats.value.length, (v) => (animatedLoaders.value = v));
  } catch (err) {
    toast.error("Load Failed", (err as Error).message);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadSettings();
  loadData();
});
</script>

<template>
  <div class="h-full flex flex-col bg-background overflow-hidden">
    <!-- Compact Header -->
    <div class="shrink-0 relative border-b border-border z-20">
      <div class="relative px-3 sm:px-6 py-3 sm:py-4 bg-background/80 backdrop-blur-sm">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          <div class="flex items-center gap-3 sm:gap-4">
            <div class="flex items-center gap-2 sm:gap-3">
              <div class="p-2 sm:p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <BarChart3 class="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
              </div>
              <div>
                <h1 class="text-base sm:text-lg font-semibold tracking-tight">Statistics</h1>
                <p class="text-[10px] sm:text-xs text-muted-foreground">
                  Library analytics and insights
                </p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Color Picker -->
            <ColorPicker v-model="customColors" />

            <!-- Settings Button -->
            <button @click="showSettings = !showSettings"
              class="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-all" :class="showSettings
                ? 'bg-primary/20 text-primary'
                : 'bg-muted/50 border border-border hover:bg-muted'">
              <Settings class="w-4 h-4" />
              <span class="hidden sm:inline">Charts</span>
            </button>

            <Button variant="outline" size="sm" @click="loadData" :disabled="isLoading"
              class="h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <RefreshCw class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isLoading }" />
              <span class="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        <!-- Settings Panel -->
        <Transition name="slide-down">
          <div v-if="showSettings" class="mt-4 p-4 rounded-lg border border-border bg-card/50">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-medium">Visible Charts</h4>
              <button @click="resetSettings"
                class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RotateCcw class="w-3 h-3" />
                Reset
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button v-for="(visible, key) in chartVisibility" :key="key" @click="chartVisibility[key] = !visible"
                class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-all" :class="visible
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'">
                <Eye v-if="visible" class="w-3.5 h-3.5" />
                <EyeOff v-else class="w-3.5 h-3.5" />
                {{ key === 'loader' ? 'Loaders' :
                  key === 'version' ? 'Versions' :
                    key === 'content' ? 'Content Types' :
                      key === 'modpackSizes' ? 'Modpack Sizes' :
                        'Most Used' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="relative">
          <div class="w-16 h-16 rounded-full border-4 border-muted animate-pulse" />
          <BarChart3
            class="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
        </div>
        <p class="text-muted-foreground mt-4">Analyzing your library...</p>
      </div>
    </div>

    <!-- Content -->
    <div v-else class="flex-1 overflow-auto px-6 py-6 sm:px-8">
      <div class="max-w-[1600px] mx-auto space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            class="group p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300">
            <div class="flex items-start justify-between">
              <div class="p-2 rounded-xl bg-emerald-500/20">
                <Layers class="w-5 h-5 text-emerald-500" />
              </div>
              <ArrowUpRight class="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p class="text-3xl font-bold text-emerald-500 mt-3">{{ animatedTotalMods }}</p>
            <p class="text-sm text-muted-foreground mt-1">Total Items</p>
          </div>

          <div
            class="group p-5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300">
            <div class="flex items-start justify-between">
              <div class="p-2 rounded-xl bg-blue-500/20">
                <Package class="w-5 h-5 text-blue-500" />
              </div>
              <ArrowUpRight class="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p class="text-3xl font-bold text-blue-500 mt-3">{{ animatedTotalModpacks }}</p>
            <p class="text-sm text-muted-foreground mt-1">Modpacks</p>
          </div>

          <div
            class="group p-5 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/5 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300">
            <div class="flex items-start justify-between">
              <div class="p-2 rounded-xl bg-purple-500/20">
                <HardDrive class="w-5 h-5 text-purple-500" />
              </div>
              <ArrowUpRight class="w-4 h-4 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p class="text-3xl font-bold text-purple-500 mt-3">{{ formatSize(animatedTotalSize) }}</p>
            <p class="text-sm text-muted-foreground mt-1">Library Size</p>
          </div>

          <div
            class="group p-5 rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-orange-500/5 hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-300">
            <div class="flex items-start justify-between">
              <div class="p-2 rounded-xl bg-orange-500/20">
                <Target class="w-5 h-5 text-orange-500" />
              </div>
              <ArrowUpRight class="w-4 h-4 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p class="text-3xl font-bold text-orange-500 mt-3">{{ animatedLoaders }}</p>
            <p class="text-sm text-muted-foreground mt-1">Loaders Used</p>
          </div>
        </div>

        <!-- Charts Grid -->
        <div v-if="visibleChartCount > 0" class="grid lg:grid-cols-2 gap-6">
          <!-- Loader Distribution -->
          <ChartCard v-if="chartVisibility.loader" title="Mods by Loader" :icon="PieChart"
            :chart-types="chartTypes.loader" :data="loaderChartData" :colors="customColors"
            :background-colors="backgroundColors" default-type="doughnut" />

          <!-- Game Version Distribution -->
          <ChartCard v-if="chartVisibility.version" title="Top Game Versions" :icon="BarChart3"
            :chart-types="chartTypes.version" :data="versionChartData" :colors="customColors"
            :background-colors="backgroundColors" default-type="bar" />

          <!-- Content Type Distribution -->
          <ChartCard v-if="chartVisibility.content" title="Content Types" :icon="Layers"
            :chart-types="chartTypes.content" :data="contentChartData" :colors="customColors"
            :background-colors="backgroundColors" default-type="doughnut" />

          <!-- Modpack Sizes -->
          <ChartCard v-if="chartVisibility.modpackSizes" title="Mods per Modpack" :icon="Package"
            :chart-types="chartTypes.modpackSizes" :data="modpackChartData" :colors="customColors"
            :background-colors="backgroundColors" default-type="bar" />
        </div>

        <!-- Most Used Mods (Full Width) -->
        <ChartCard v-if="chartVisibility.mostUsed && mostUsedMods.length > 0" title="Most Popular Mods" :icon="Star"
          :chart-types="chartTypes.mostUsed" :data="mostUsedChartData" :colors="customColors"
          :background-colors="backgroundColors" default-type="bar" />

        <div v-else-if="chartVisibility.mostUsed" class="rounded-2xl border border-border bg-card p-5">
          <h3 class="font-semibold flex items-center gap-2 mb-4">
            <Star class="w-4 h-4 text-yellow-500" />
            Most Popular Mods
            <span class="text-xs text-muted-foreground">(across modpacks)</span>
          </h3>
          <div class="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
            <Star class="w-12 h-12 opacity-20 mb-3" />
            <p class="text-sm">No mods are used in multiple modpacks yet</p>
            <p class="text-xs mt-1">Add mods to multiple modpacks to see popularity stats</p>
          </div>
        </div>

        <!-- No Charts Message -->
        <div v-if="visibleChartCount === 0" class="flex flex-col items-center justify-center py-16">
          <EyeOff class="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 class="text-lg font-medium mb-2">No charts visible</h3>
          <p class="text-sm text-muted-foreground mb-4">Click the "Charts" button to enable some charts</p>
          <Button variant="outline" size="sm" @click="showSettings = true">
            <Settings class="w-4 h-4 mr-2" />
            Configure Charts
          </Button>
        </div>

        <!-- Quick Stats Row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 rounded-xl border border-border bg-card/50 text-center">
            <p class="text-2xl font-bold text-primary">{{ versionStats.length }}</p>
            <p class="text-xs text-muted-foreground mt-1">Game Versions</p>
          </div>
          <div class="p-4 rounded-xl border border-border bg-card/50 text-center">
            <p class="text-2xl font-bold text-primary">{{ contentTypeStats.length }}</p>
            <p class="text-xs text-muted-foreground mt-1">Content Types</p>
          </div>
          <div class="p-4 rounded-xl border border-border bg-card/50 text-center">
            <p class="text-2xl font-bold text-primary">{{ mostUsedMods.length }}</p>
            <p class="text-xs text-muted-foreground mt-1">Shared Mods</p>
          </div>
          <div class="p-4 rounded-xl border border-border bg-card/50 text-center">
            <p class="text-2xl font-bold text-primary">{{modpackModCounts.reduce((sum, p) => sum + p.count, 0)}}</p>
            <p class="text-xs text-muted-foreground mt-1">Total Installations</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
