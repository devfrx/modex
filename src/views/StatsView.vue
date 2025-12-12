<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import {
  BarChart3,
  PieChart,
  Package,
  Layers,
  RefreshCw,
  TrendingUp,
  Clock,
  HardDrive,
} from "lucide-vue-next";
import type { Mod, Modpack } from "@/types/electron";

const toast = useToast();

const isLoading = ref(true);
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);

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
    .slice(0, 10); // Top 10
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
      name,
      count,
      percentage: (count / totalMods.value) * 100,
    }))
    .filter((item) => item.count > 0);
});

// Most used mods (appears in most modpacks)
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
    .slice(0, 15);
});

// Modpack sizes
const modpackSizes = computed(() => {
  return modpacks.value
    .map((pack) => ({
      id: pack.id,
      name: pack.name,
      modCount: 0, // Will be populated
    }))
    .sort((a, b) => b.modCount - a.modCount);
});

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
    for (const pack of modpacksData) {
      const packMods = await window.api.modpacks.getMods(pack.id);
      for (const mod of packMods) {
        if (!usage.has(mod.id)) {
          usage.set(mod.id, []);
        }
        usage.get(mod.id)?.push(pack.name);
      }
    }
    modUsage.value = usage;
  } catch (err) {
    toast.error("Load Failed", (err as Error).message);
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadData);

// Bar chart helper
const maxValue = (items: { count: number }[]) =>
  Math.max(...items.map((i) => i.count), 1);

// Loader colors
const loaderColor = (loader: string) => {
  const l = loader.toLowerCase();
  if (l.includes("forge")) return "bg-orange-500";
  if (l.includes("fabric")) return "bg-blue-500";
  if (l.includes("quilt")) return "bg-purple-500";
  if (l.includes("neoforge")) return "bg-red-500";
  return "bg-gray-500";
};

// Content type colors
const contentTypeColor = (type: string) => {
  if (type === "mod") return "bg-emerald-500";
  if (type === "resourcepack") return "bg-blue-500";
  if (type === "shader") return "bg-pink-500";
  return "bg-gray-500";
};
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Header -->
    <div class="shrink-0 border-b border-border bg-card/50 p-4 sm:p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-primary/10 rounded-xl">
            <BarChart3 class="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold">Statistics</h1>
            <p class="text-sm text-muted-foreground">
              Library analytics and insights
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          @click="loadData"
          :disabled="isLoading"
        >
          <RefreshCw
            class="w-4 h-4 mr-2"
            :class="{ 'animate-spin': isLoading }"
          />
          Refresh
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <RefreshCw class="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p class="text-muted-foreground">Loading statistics...</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 rounded-xl border border-border bg-card">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-emerald-500/10">
              <Layers class="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ totalMods }}</p>
              <p class="text-xs text-muted-foreground">Total Items</p>
            </div>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-card">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-500/10">
              <Package class="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ totalModpacks }}</p>
              <p class="text-xs text-muted-foreground">Modpacks</p>
            </div>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-card">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-purple-500/10">
              <HardDrive class="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ formatSize(totalSize) }}</p>
              <p class="text-xs text-muted-foreground">Library Size</p>
            </div>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-border bg-card">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-orange-500/10">
              <TrendingUp class="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ loaderStats.length }}</p>
              <p class="text-xs text-muted-foreground">Loaders Used</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Loader Distribution -->
        <div class="rounded-xl border border-border bg-card p-4">
          <h3 class="font-semibold mb-4 flex items-center gap-2">
            <PieChart class="w-4 h-4 text-primary" />
            Mods by Loader
          </h3>
          <div class="space-y-3">
            <div v-for="stat in loaderStats" :key="stat.name" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium capitalize">{{ stat.name }}</span>
                <span class="text-muted-foreground"
                  >{{ stat.count }} ({{ stat.percentage.toFixed(0) }}%)</span
                >
              </div>
              <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="loaderColor(stat.name)"
                  :style="{ width: `${stat.percentage}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Game Version Distribution -->
        <div class="rounded-xl border border-border bg-card p-4">
          <h3 class="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 class="w-4 h-4 text-primary" />
            Top Game Versions
          </h3>
          <div class="space-y-2">
            <div
              v-for="stat in versionStats"
              :key="stat.name"
              class="flex items-center gap-3"
            >
              <span
                class="w-16 text-xs font-mono text-muted-foreground shrink-0"
                >{{ stat.name }}</span
              >
              <div class="flex-1 h-6 bg-muted rounded overflow-hidden">
                <div
                  class="h-full bg-primary/80 rounded flex items-center justify-end pr-2 transition-all duration-500"
                  :style="{
                    width: `${(stat.count / maxValue(versionStats)) * 100}%`,
                  }"
                >
                  <span class="text-[10px] text-primary-foreground font-bold">{{
                    stat.count
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Content Type & Most Used -->
      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Content Type Distribution -->
        <div class="rounded-xl border border-border bg-card p-4">
          <h3 class="font-semibold mb-4 flex items-center gap-2">
            <Layers class="w-4 h-4 text-primary" />
            Content Types
          </h3>
          <div class="flex gap-4">
            <div
              v-for="stat in contentTypeStats"
              :key="stat.name"
              class="flex-1 p-4 rounded-lg border border-border bg-muted/30 text-center"
            >
              <div
                class="w-3 h-3 rounded-full mx-auto mb-2"
                :class="contentTypeColor(stat.name)"
              />
              <p class="text-2xl font-bold">{{ stat.count }}</p>
              <p class="text-xs text-muted-foreground capitalize">
                {{
                  stat.name === "resourcepack"
                    ? "Resource Packs"
                    : stat.name + "s"
                }}
              </p>
              <p class="text-[10px] text-muted-foreground/60">
                {{ stat.percentage.toFixed(0) }}%
              </p>
            </div>
          </div>
        </div>

        <!-- Most Used Mods -->
        <div class="rounded-xl border border-border bg-card p-4">
          <h3 class="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp class="w-4 h-4 text-primary" />
            Most Used Mods
          </h3>
          <div class="space-y-2 max-h-[200px] overflow-y-auto">
            <div
              v-for="(item, idx) in mostUsedMods"
              :key="item.id"
              class="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
            >
              <span
                class="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground"
              >
                {{ idx + 1 }}
              </span>
              <span class="flex-1 truncate text-sm font-medium">{{
                item.name
              }}</span>
              <span
                class="text-xs text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full"
              >
                {{ item.packCount }} packs
              </span>
            </div>
            <div
              v-if="mostUsedMods.length === 0"
              class="text-center py-8 text-muted-foreground text-sm"
            >
              No mods are used in multiple modpacks yet
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
