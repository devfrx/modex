<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
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
import { Doughnut, Bar, Line, PolarArea, Radar } from "vue-chartjs";
import {
  BarChart3,
  PieChart,
  Package,
  Layers,
  RefreshCw,
  TrendingUp,
  HardDrive,
  Palette,
  Calendar,
  Star,
  Zap,
  Target,
  Clock,
  Activity,
  ArrowUpRight,
  ChevronRight,
  Circle,
  TrendingUp as LineChartIcon,
  Hexagon,
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

// Chart style options (using icon component names)
const chartStyles = [
  { id: "default", name: "Default", icon: "Palette" },
  { id: "gradient", name: "Gradient", icon: "TrendingUp" },
  { id: "neon", name: "Neon", icon: "Zap" },
  { id: "pastel", name: "Pastel", icon: "Star" },
];
const selectedStyle = ref("default");

// Chart type toggles
const loaderChartType = ref<"doughnut" | "polar" | "bar">("doughnut");
const versionChartType = ref<"bar" | "line" | "radar">("bar");
const contentChartType = ref<"doughnut" | "polar" | "bar">("doughnut");

// Chart type options for v-for
const loaderChartTypes = ["doughnut", "polar", "bar"] as const;
const versionChartTypes = ["bar", "line", "radar"] as const;
const contentChartTypes = ["doughnut", "polar", "bar"] as const;

// Color palettes based on style
const colorPalettes = {
  default: {
    primary: ["#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308"],
    background: [
      "rgba(249, 115, 22, 0.8)",
      "rgba(59, 130, 246, 0.8)",
      "rgba(168, 85, 247, 0.8)",
      "rgba(239, 68, 68, 0.8)",
      "rgba(34, 197, 94, 0.8)",
      "rgba(234, 179, 8, 0.8)",
    ],
  },
  gradient: {
    primary: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dfe6e9"],
    background: [
      "rgba(255, 107, 107, 0.8)",
      "rgba(78, 205, 196, 0.8)",
      "rgba(69, 183, 209, 0.8)",
      "rgba(150, 206, 180, 0.8)",
      "rgba(255, 234, 167, 0.8)",
      "rgba(223, 230, 233, 0.8)",
    ],
  },
  neon: {
    primary: ["#00ff87", "#ff00ff", "#00ffff", "#ffff00", "#ff6600", "#ff0066"],
    background: [
      "rgba(0, 255, 135, 0.7)",
      "rgba(255, 0, 255, 0.7)",
      "rgba(0, 255, 255, 0.7)",
      "rgba(255, 255, 0, 0.7)",
      "rgba(255, 102, 0, 0.7)",
      "rgba(255, 0, 102, 0.7)",
    ],
  },
  pastel: {
    primary: ["#b8e0d2", "#d6eadf", "#eac4d5", "#95b8d1", "#edafb8", "#f7e1d7"],
    background: [
      "rgba(184, 224, 210, 0.9)",
      "rgba(214, 234, 223, 0.9)",
      "rgba(234, 196, 213, 0.9)",
      "rgba(149, 184, 209, 0.9)",
      "rgba(237, 175, 184, 0.9)",
      "rgba(247, 225, 215, 0.9)",
    ],
  },
};

const currentPalette = computed(
  () => colorPalettes[selectedStyle.value as keyof typeof colorPalettes]
);

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

// Chart data computed
const loaderChartData = computed(() => ({
  labels: loaderStats.value.map((s) => s.name),
  datasets: [
    {
      data: loaderStats.value.map((s) => s.count),
      backgroundColor: currentPalette.value.background.slice(
        0,
        loaderStats.value.length
      ),
      borderColor: currentPalette.value.primary.slice(
        0,
        loaderStats.value.length
      ),
      borderWidth: 2,
    },
  ],
}));

const versionChartData = computed(() => ({
  labels: versionStats.value.map((s) => s.name),
  datasets: [
    {
      label: "Mods",
      data: versionStats.value.map((s) => s.count),
      backgroundColor:
        versionChartType.value === "line"
          ? "rgba(139, 92, 246, 0.2)"
          : currentPalette.value.background,
      borderColor:
        versionChartType.value === "line"
          ? "#8b5cf6"
          : currentPalette.value.primary,
      borderWidth: 2,
      fill: versionChartType.value === "line",
      tension: 0.4,
    },
  ],
}));

const contentChartData = computed(() => ({
  labels: contentTypeStats.value.map((s) => s.name),
  datasets: [
    {
      data: contentTypeStats.value.map((s) => s.count),
      backgroundColor: [
        currentPalette.value.background[4],
        currentPalette.value.background[1],
        currentPalette.value.background[2],
      ],
      borderColor: [
        currentPalette.value.primary[4],
        currentPalette.value.primary[1],
        currentPalette.value.primary[2],
      ],
      borderWidth: 2,
    },
  ],
}));

const modpackChartData = computed(() => ({
  labels: modpackModCounts.value.map((p) => p.name),
  datasets: [
    {
      label: "Mods in Pack",
      data: modpackModCounts.value.map((p) => p.count),
      backgroundColor: "rgba(139, 92, 246, 0.6)",
      borderColor: "#8b5cf6",
      borderWidth: 1,
      borderRadius: 4,
    },
  ],
}));

const mostUsedChartData = computed(() => ({
  labels: mostUsedMods.value.map((m) => m.name),
  datasets: [
    {
      label: "Used in Packs",
      data: mostUsedMods.value.map((m) => m.packCount),
      backgroundColor: currentPalette.value.background,
      borderColor: currentPalette.value.primary,
      borderWidth: 2,
    },
  ],
}));

// Chart options
const doughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: {
        color: "rgba(255,255,255,0.7)",
        padding: 15,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  cutout: "60%",
}));

const barOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "rgba(255,255,255,0.5)" },
    },
    y: {
      grid: { display: false },
      ticks: { color: "rgba(255,255,255,0.7)" },
    },
  },
}));

const verticalBarOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "rgba(255,255,255,0.5)", maxRotation: 45 },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "rgba(255,255,255,0.7)" },
    },
  },
}));

const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "rgba(255,255,255,0.5)" },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "rgba(255,255,255,0.7)" },
    },
  },
}));

const radarOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    r: {
      grid: { color: "rgba(255,255,255,0.1)" },
      angleLines: { color: "rgba(255,255,255,0.1)" },
      ticks: { display: false },
      pointLabels: { color: "rgba(255,255,255,0.7)" },
    },
  },
}));

const polarOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: {
        color: "rgba(255,255,255,0.7)",
        padding: 15,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      titleColor: "#fff",
      bodyColor: "#fff",
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    r: {
      grid: { color: "rgba(255,255,255,0.1)" },
      ticks: { display: false },
    },
  },
}));

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

onMounted(loadData);
</script>

<template>
  <div class="h-full flex flex-col bg-background overflow-hidden">
    <!-- Compact Header -->
    <div class="shrink-0 relative overflow-hidden border-b border-border">
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
            <!-- Style Selector -->
            <div class="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border border-border">
              <button v-for="style in chartStyles" :key="style.id" @click="selectedStyle = style.id"
                class="px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1.5" :class="selectedStyle === style.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'hover:bg-muted text-muted-foreground'">
                <component
                  :is="style.icon === 'Palette' ? Palette : style.icon === 'TrendingUp' ? TrendingUp : style.icon === 'Zap' ? Zap : Star"
                  class="w-3 h-3" />
                <span class="hidden sm:inline">{{ style.name }}</span>
              </button>
            </div>

            <Button variant="outline" size="sm" @click="loadData" :disabled="isLoading"
              class="h-7 sm:h-8 px-2 sm:px-3 text-xs">
              <RefreshCw class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isLoading }" />
              <span class="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
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
        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Loader Distribution -->
          <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold flex items-center gap-2">
                <PieChart class="w-4 h-4 text-primary" />
                Mods by Loader
              </h3>
              <div class="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button v-for="type in loaderChartTypes" :key="type" @click="loaderChartType = type"
                  class="px-2.5 py-1 text-xs rounded-md transition-all flex items-center justify-center" :class="loaderChartType === type
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted/80 text-muted-foreground'"
                  :title="type === 'doughnut' ? 'Doughnut' : type === 'polar' ? 'Polar' : 'Bar'">
                  <Circle v-if="type === 'doughnut'" class="w-3.5 h-3.5" />
                  <Target v-else-if="type === 'polar'" class="w-3.5 h-3.5" />
                  <BarChart3 v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div class="h-[300px]">
              <Doughnut v-if="loaderChartType === 'doughnut'" :data="loaderChartData" :options="doughnutOptions" />
              <PolarArea v-else-if="loaderChartType === 'polar'" :data="loaderChartData" :options="polarOptions" />
              <Bar v-else :data="loaderChartData" :options="barOptions" />
            </div>
          </div>

          <!-- Game Version Distribution -->
          <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold flex items-center gap-2">
                <BarChart3 class="w-4 h-4 text-primary" />
                Top Game Versions
              </h3>
              <div class="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button v-for="type in versionChartTypes" :key="type" @click="versionChartType = type"
                  class="px-2.5 py-1 text-xs rounded-md transition-all flex items-center justify-center" :class="versionChartType === type
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted/80 text-muted-foreground'"
                  :title="type === 'bar' ? 'Bar' : type === 'line' ? 'Line' : 'Radar'">
                  <BarChart3 v-if="type === 'bar'" class="w-3.5 h-3.5" />
                  <TrendingUp v-else-if="type === 'line'" class="w-3.5 h-3.5" />
                  <Hexagon v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div class="h-[300px]">
              <Bar v-if="versionChartType === 'bar'" :data="versionChartData" :options="barOptions" />
              <Line v-else-if="versionChartType === 'line'" :data="versionChartData" :options="lineOptions" />
              <Radar v-else :data="versionChartData" :options="radarOptions" />
            </div>
          </div>

          <!-- Content Type Distribution -->
          <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold flex items-center gap-2">
                <Layers class="w-4 h-4 text-primary" />
                Content Types
              </h3>
              <div class="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button v-for="type in contentChartTypes" :key="type" @click="contentChartType = type"
                  class="px-2.5 py-1 text-xs rounded-md transition-all flex items-center justify-center" :class="contentChartType === type
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-muted/80 text-muted-foreground'"
                  :title="type === 'doughnut' ? 'Doughnut' : type === 'polar' ? 'Polar' : 'Bar'">
                  <Circle v-if="type === 'doughnut'" class="w-3.5 h-3.5" />
                  <Target v-else-if="type === 'polar'" class="w-3.5 h-3.5" />
                  <BarChart3 v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div class="h-[300px]">
              <Doughnut v-if="contentChartType === 'doughnut'" :data="contentChartData" :options="doughnutOptions" />
              <PolarArea v-else-if="contentChartType === 'polar'" :data="contentChartData" :options="polarOptions" />
              <Bar v-else :data="contentChartData" :options="barOptions" />
            </div>
          </div>

          <!-- Modpack Sizes -->
          <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow">
            <h3 class="font-semibold flex items-center gap-2 mb-4">
              <Package class="w-4 h-4 text-primary" />
              Mods per Modpack
            </h3>
            <div class="h-[300px]">
              <Bar :data="modpackChartData" :options="verticalBarOptions" />
            </div>
          </div>
        </div>

        <!-- Most Used Mods -->
        <div class="rounded-2xl border border-border bg-card p-5 hover:shadow-lg transition-shadow">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold flex items-center gap-2">
              <Star class="w-4 h-4 text-yellow-500" />
              Most Popular Mods
              <span class="text-xs text-muted-foreground">(across modpacks)</span>
            </h3>
          </div>
          <div class="h-[300px]" v-if="mostUsedMods.length > 0">
            <Bar :data="mostUsedChartData" :options="barOptions" />
          </div>
          <div v-else class="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
            <Star class="w-12 h-12 opacity-20 mb-3" />
            <p class="text-sm">No mods are used in multiple modpacks yet</p>
            <p class="text-xs mt-1">Add mods to multiple modpacks to see popularity stats</p>
          </div>
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
