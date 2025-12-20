<script setup lang="ts">
import { computed } from "vue";
import {
  Package,
  HardDrive,
  Cpu,
  Clock,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  XCircle,
  Loader2,
  FileArchive,
  Settings,
  Layers
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";

interface ModpackAnalysis {
  estimatedRamMin: number;
  estimatedRamRecommended: number;
  estimatedRamMax: number;
  performanceImpact: number;
  loadTimeImpact: number;
  storageImpact: number;
  modCategories?: Record<string, number>;
  warnings: string[];
  recommendations: string[];
  compatibilityScore: number;
  compatibilityNotes?: string[];
}

interface ModpackPreview {
  name: string;
  version: string;
  author?: string;
  description?: string;
  minecraftVersion: string;
  modLoader: string;
  modLoaderVersion?: string;
  modCount: number;
  mods: Array<{ projectId: number; fileId: number; name?: string; required: boolean }>;
  resourcePackCount: number;
  shaderCount: number;
  analysis: ModpackAnalysis;
  source: string;
  overridesCount: number;
  configFilesCount: number;
  totalSize?: number;
}

const props = defineProps<{
  preview: ModpackPreview;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: "import"): void;
  (e: "cancel"): void;
}>();

// Utility functions
function formatRam(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Computed
const impactLevel = computed(() => {
  const impact = props.preview.analysis.performanceImpact;
  if (impact < 30) return { level: "low", label: "Low", color: "text-green-500", bg: "bg-green-500/20" };
  if (impact < 60) return { level: "medium", label: "Medium", color: "text-yellow-500", bg: "bg-yellow-500/20" };
  if (impact < 80) return { level: "high", label: "High", color: "text-orange-500", bg: "bg-orange-500/20" };
  return { level: "extreme", label: "Extreme", color: "text-red-500", bg: "bg-red-500/20" };
});

const loaderDisplay = computed(() => {
  const loaders: Record<string, { icon: string; color: string }> = {
    forge: { icon: "🔥", color: "text-orange-400" },
    fabric: { icon: "🧵", color: "text-blue-400" },
    neoforge: { icon: "⚡", color: "text-purple-400" },
    quilt: { icon: "🧶", color: "text-pink-400" }
  };
  return loaders[props.preview.modLoader.toLowerCase()] || { icon: "📦", color: "text-gray-400" };
});

const sourceDisplay = computed(() => {
  const sources: Record<string, { label: string; icon: string; color: string }> = {
    curseforge: { label: "CurseForge", icon: "🔥", color: "text-orange-400" },
    modrinth: { label: "Modrinth", icon: "🟢", color: "text-green-400" },
    modex: { label: "ModEx", icon: "📦", color: "text-violet-400" },
    zip: { label: "Local ZIP", icon: "📁", color: "text-gray-400" }
  };
  return sources[props.preview.source] || { label: "Unknown", icon: "❓", color: "text-gray-400" };
});

const compatibilityBadge = computed(() => {
  const score = props.preview.analysis.compatibilityScore;
  if (score >= 90) return { label: "Excellent", color: "bg-green-500/20 text-green-400 border-green-500/30" };
  if (score >= 70) return { label: "Good", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
  if (score >= 50) return { label: "Fair", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
  return { label: "Poor", color: "bg-red-500/20 text-red-400 border-red-500/30" };
});
</script>

<template>
  <div class="bg-card border border-border rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-border bg-muted/30">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span :class="sourceDisplay.color">{{ sourceDisplay.icon }}</span>
            <span class="text-xs text-muted-foreground">{{ sourceDisplay.label }}</span>
          </div>
          <h3 class="text-lg font-semibold text-foreground truncate">{{ preview.name }}</h3>
          <p class="text-sm text-muted-foreground">{{ preview.version }}</p>
          <p v-if="preview.author" class="text-xs text-muted-foreground mt-1">
            by {{ preview.author }}
          </p>
        </div>

        <!-- Compatibility Badge -->
        <div class="px-2.5 py-1 rounded-lg border text-xs font-medium" :class="compatibilityBadge.color">
          {{ compatibilityBadge.label }}
        </div>
      </div>

      <p v-if="preview.description" class="text-sm text-muted-foreground mt-3 line-clamp-2">
        {{ preview.description }}
      </p>
    </div>

    <!-- Info Grid -->
    <div class="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <!-- Minecraft Version -->
      <div class="p-3 rounded-lg bg-muted/30 border border-border">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <Package class="w-4 h-4" />
          <span class="text-xs">Minecraft</span>
        </div>
        <div class="font-medium text-foreground">{{ preview.minecraftVersion || "Unknown" }}</div>
      </div>

      <!-- Mod Loader -->
      <div class="p-3 rounded-lg bg-muted/30 border border-border">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <span>{{ loaderDisplay.icon }}</span>
          <span class="text-xs">Loader</span>
        </div>
        <div class="font-medium capitalize" :class="loaderDisplay.color">
          {{ preview.modLoader }}
          <span v-if="preview.modLoaderVersion" class="text-xs text-muted-foreground ml-1">
            {{ preview.modLoaderVersion }}
          </span>
        </div>
      </div>

      <!-- Mod Count -->
      <div class="p-3 rounded-lg bg-muted/30 border border-border">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <Layers class="w-4 h-4" />
          <span class="text-xs">Mods</span>
        </div>
        <div class="font-medium text-foreground">{{ preview.modCount }}</div>
      </div>

      <!-- Total Size -->
      <div class="p-3 rounded-lg bg-muted/30 border border-border">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <FileArchive class="w-4 h-4" />
          <span class="text-xs">Size</span>
        </div>
        <div class="font-medium text-foreground">
          {{ preview.totalSize ? formatBytes(preview.totalSize) : "Unknown" }}
        </div>
      </div>
    </div>

    <!-- Performance Analysis -->
    <div class="p-4 border-t border-border">
      <h4 class="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
        <Cpu class="w-4 h-4" />
        Performance Analysis
      </h4>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <!-- RAM Requirement -->
        <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div class="flex items-center gap-2 text-blue-400 mb-2">
            <HardDrive class="w-4 h-4" />
            <span class="text-xs font-medium">RAM Required</span>
          </div>
          <div class="text-xl font-bold text-foreground">
            {{ formatRam(preview.analysis.estimatedRamRecommended) }}
          </div>
          <div class="text-xs text-muted-foreground mt-1">
            {{ formatRam(preview.analysis.estimatedRamMin) }} - {{ formatRam(preview.analysis.estimatedRamMax) }}
          </div>
        </div>

        <!-- Performance Impact -->
        <div class="p-3 rounded-lg" :class="impactLevel.bg + ' border border-current/20'">
          <div class="flex items-center gap-2 mb-2" :class="impactLevel.color">
            <Cpu class="w-4 h-4" />
            <span class="text-xs font-medium">Performance Impact</span>
          </div>
          <div class="text-xl font-bold text-foreground">{{ impactLevel.label }}</div>
          <div class="w-full bg-muted rounded-full h-1.5 mt-2">
            <div class="h-1.5 rounded-full transition-all" :class="impactLevel.color.replace('text-', 'bg-')"
              :style="{ width: `${preview.analysis.performanceImpact}%` }"></div>
          </div>
        </div>

        <!-- Load Time -->
        <div class="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div class="flex items-center gap-2 text-purple-400 mb-2">
            <Clock class="w-4 h-4" />
            <span class="text-xs font-medium">Load Time Impact</span>
          </div>
          <div class="text-xl font-bold text-foreground">
            {{ preview.analysis.loadTimeImpact }}%
          </div>
          <div class="w-full bg-muted rounded-full h-1.5 mt-2">
            <div class="h-1.5 rounded-full bg-purple-500 transition-all"
              :style="{ width: `${preview.analysis.loadTimeImpact}%` }"></div>
          </div>
        </div>
      </div>

      <!-- Extra Info -->
      <div class="flex flex-wrap gap-2 text-xs">
        <div v-if="preview.overridesCount > 0" class="px-2 py-1 rounded bg-muted border border-border">
          <Settings class="w-3 h-3 inline mr-1" />
          {{ preview.overridesCount }} override files
        </div>
        <div v-if="preview.configFilesCount > 0" class="px-2 py-1 rounded bg-muted border border-border">
          {{ preview.configFilesCount }} config files
        </div>
        <div v-if="preview.resourcePackCount > 0"
          class="px-2 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
          {{ preview.resourcePackCount }} resource packs
        </div>
        <div v-if="preview.shaderCount > 0"
          class="px-2 py-1 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30">
          {{ preview.shaderCount }} shaders
        </div>
      </div>
    </div>

    <!-- Warnings -->
    <div v-if="preview.analysis.warnings.length > 0" class="p-4 border-t border-border bg-orange-500/5">
      <h4 class="text-sm font-medium text-orange-400 mb-2 flex items-center gap-2">
        <AlertTriangle class="w-4 h-4" />
        Warnings
      </h4>
      <ul class="space-y-1.5">
        <li v-for="(warning, i) in preview.analysis.warnings" :key="i"
          class="text-xs text-orange-300/80 flex items-start gap-2">
          <XCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {{ warning }}
        </li>
      </ul>
    </div>

    <!-- Recommendations -->
    <div v-if="preview.analysis.recommendations.length > 0" class="p-4 border-t border-border bg-blue-500/5">
      <h4 class="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
        <Lightbulb class="w-4 h-4" />
        Recommendations
      </h4>
      <ul class="space-y-1.5">
        <li v-for="(rec, i) in preview.analysis.recommendations" :key="i"
          class="text-xs text-blue-300/80 flex items-start gap-2">
          <CheckCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {{ rec }}
        </li>
      </ul>
    </div>

    <!-- Actions -->
    <div class="p-4 border-t border-border bg-muted/20 flex justify-end gap-3">
      <Button variant="ghost" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button variant="default" :disabled="isLoading" @click="$emit('import')">
        <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
        Import Modpack
      </Button>
    </div>
  </div>
</template>
