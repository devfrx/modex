<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useToast } from "@/composables/useToast";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Package,
  Link,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Cpu,
  Image,
  Globe,
  Lightbulb,
  GitBranch,
  Lock,
  Activity,
  Shield,
  TrendingUp,
  Clock,
  HardDrive,
  Gauge,
  Loader2,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import type {
  ModpackAnalysis,
  DependencyInfo,
  ConflictInfo,
  PerformanceStats,
} from "@/types/electron";

const props = defineProps<{
  modpackId: string;
  isLinked?: boolean;
}>();

const emit = defineEmits<{
  (e: "addMod", modId: number): void;
  (e: "refresh"): void;
}>();

const toast = useToast();

// Format RAM in MB to display string (e.g., "6GB" or "3.5GB")
function formatRam(mb: number): string {
  if (mb < 1024) return `${mb}MB`;
  return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)}GB`;
}

const analysis = ref<ModpackAnalysis | null>(null);
const ramAnalysis = ref<{
  estimatedRamMin: number;
  estimatedRamRecommended: number;
  estimatedRamMax: number;
  performanceImpact: number;
  loadTimeImpact: number;
  storageImpact: number;
  modCategories: Record<string, number>;
  warnings: string[];
  recommendations: string[];
  compatibilityScore: number;
  compatibilityNotes: string[];
} | null>(null);
const isLoading = ref(false);
const installingDepIds = ref<Set<number>>(new Set()); // Track which dependencies are being installed
const expandedSections = ref({
  dependencies: true,
  conflicts: true,
  performance: true,
  ramEstimate: true,
  recommendations: true,
  dependencyGraph: false,
});

// Dependency graph data structure
interface DependencyNode {
  id: string;
  name: string;
  dependencies: { modId: number; modName: string; isSatisfied: boolean }[];
}
const dependencyGraph = ref<DependencyNode[]>([]);
const expandedNodes = ref<Set<string>>(new Set());

const hasIssues = computed(() => {
  if (!analysis.value) return false;
  return (
    analysis.value.missingDependencies.length > 0 ||
    analysis.value.conflicts.length > 0
  );
});

// Separate conflicts by severity
const errorConflicts = computed(() => {
  if (!analysis.value) return [];
  return analysis.value.conflicts.filter(c => c.severity === 'error' || !c.severity);
});

const warningConflicts = computed(() => {
  if (!analysis.value) return [];
  return analysis.value.conflicts.filter(c => c.severity === 'warning');
});

const overallScore = computed(() => {
  if (!analysis.value) return 100;
  let score = 100;
  score -= analysis.value.missingDependencies.length * 10;
  score -= analysis.value.conflicts.length * 15;
  score -= analysis.value.performanceStats.resourceHeavy * 3;
  score -= analysis.value.performanceStats.graphicsIntensive * 2;
  score += analysis.value.performanceStats.optimizationMods * 5;
  return Math.max(0, Math.min(100, score));
});

const scoreColor = computed(() => {
  if (overallScore.value >= 80) return "text-emerald-400";
  if (overallScore.value >= 60) return "text-yellow-400";
  if (overallScore.value >= 40) return "text-orange-400";
  return "text-red-400";
});

const scoreGradient = computed(() => {
  if (overallScore.value >= 80) return "from-emerald-500/20 to-emerald-600/10";
  if (overallScore.value >= 60) return "from-yellow-500/20 to-yellow-600/10";
  if (overallScore.value >= 40) return "from-orange-500/20 to-orange-600/10";
  return "from-red-500/20 to-red-600/10";
});

const scoreLabel = computed(() => {
  if (overallScore.value >= 80) return "Excellent";
  if (overallScore.value >= 60) return "Good";
  if (overallScore.value >= 40) return "Fair";
  return "Needs Attention";
});

const totalIssues = computed(() => {
  if (!analysis.value) return 0;
  return analysis.value.missingDependencies.length + analysis.value.conflicts.length;
});

async function runAnalysis() {
  isLoading.value = true;
  try {
    // Run both analyses in parallel
    const [analysisResult, ramResult] = await Promise.all([
      window.api.analyzer.analyzeModpack(props.modpackId),
      window.api.preview.analyzeModpack(props.modpackId)
    ]);

    analysis.value = analysisResult;
    ramAnalysis.value = ramResult;

    // Build dependency graph from mod data
    await buildDependencyGraph();

    if (
      analysis.value.missingDependencies.length === 0 &&
      analysis.value.conflicts.length === 0
    ) {
      toast.success("All Good!", "No issues found in your modpack");
    } else {
      const issues =
        analysis.value.missingDependencies.length +
        analysis.value.conflicts.length;
      toast.warning("Issues Found", `${issues} issue(s) need attention`);
    }
  } catch (err) {
    console.error("Analysis failed:", err);
    toast.error("Analysis Failed", (err as Error).message);
  } finally {
    isLoading.value = false;
  }
}

async function buildDependencyGraph() {
  try {
    const mods = await window.api.modpacks.getMods(props.modpackId);
    const modIds = new Set(mods.map((m) => m.cf_project_id).filter(Boolean));

    const graph: DependencyNode[] = [];

    for (const mod of mods) {
      // Get dependencies for each mod if we have the info
      const deps: { modId: number; modName: string; isSatisfied: boolean }[] =
        [];

      // Check if mod has dependency info from analysis
      if (analysis.value?.missingDependencies) {
        for (const missing of analysis.value.missingDependencies) {
          if (missing.requiredBy.includes(mod.name)) {
            deps.push({
              modId: missing.modId,
              modName: missing.modName,
              isSatisfied: false,
            });
          }
        }
      }

      // Only add to graph if mod has dependencies to show
      if (deps.length > 0 || mod.cf_project_id) {
        graph.push({
          id: mod.id,
          name: mod.name,
          dependencies: deps,
        });
      }
    }

    dependencyGraph.value = graph.sort(
      (a, b) => b.dependencies.length - a.dependencies.length
    );
  } catch (err) {
    console.error("Failed to build dependency graph:", err);
  }
}

function toggleNode(id: string) {
  if (expandedNodes.value.has(id)) {
    expandedNodes.value.delete(id);
  } else {
    expandedNodes.value.add(id);
  }
}

async function addDependency(dep: DependencyInfo) {
  if (installingDepIds.value.has(dep.modId)) return; // Already installing

  installingDepIds.value.add(dep.modId);

  try {
    // Get the mod details from CurseForge
    const cfMod = await window.api.curseforge.getMod(dep.modId);
    if (!cfMod) {
      toast.error("Mod not found", `Could not find ${dep.modName} on CurseForge`);
      return;
    }

    // Get the modpack to know version/loader
    const modpack = await window.api.modpacks.getById(props.modpackId);
    if (!modpack) {
      toast.error("Error", "Could not load modpack details");
      return;
    }

    // Find the best file for this mod
    const files = await window.api.curseforge.getModFiles(dep.modId, {
      gameVersion: modpack.minecraft_version,
      modLoader: modpack.loader,
    });

    if (files.length === 0) {
      toast.error("No compatible files", `No files found for ${dep.modName} matching your MC version and loader`);
      return;
    }

    // Add to library
    const addedMod = await window.api.curseforge.addToLibrary(
      dep.modId,
      files[0].id,
      modpack.loader || "fabric"
    );

    if (addedMod) {
      // Add to modpack
      await window.api.modpacks.addMod(props.modpackId, addedMod.id);
      toast.success("Dependency Added", `${dep.modName} has been added to the modpack`);

      // Notify parent to refresh
      emit("refresh");

      // Re-run analysis to update the list
      await runAnalysis();
    }
  } catch (err) {
    console.error("Failed to add dependency:", err);
    toast.error("Failed to add", (err as Error).message);
  } finally {
    installingDepIds.value.delete(dep.modId);
  }
}

// Track if we're installing all dependencies
const isInstallingAll = ref(false);

// Install all missing dependencies
async function installAllDependencies() {
  if (!analysis.value || analysis.value.missingDependencies.length === 0) return;
  if (isInstallingAll.value) return;

  isInstallingAll.value = true;
  const deps = [...analysis.value.missingDependencies];
  let installed = 0;
  let failed = 0;

  try {
    const modpack = await window.api.modpacks.getById(props.modpackId);
    if (!modpack) {
      toast.error("Error", "Could not load modpack details");
      return;
    }

    for (const dep of deps) {
      if (installingDepIds.value.has(dep.modId)) continue;
      installingDepIds.value.add(dep.modId);

      try {
        const cfMod = await window.api.curseforge.getMod(dep.modId);
        if (!cfMod) {
          failed++;
          continue;
        }

        const files = await window.api.curseforge.getModFiles(dep.modId, {
          gameVersion: modpack.minecraft_version,
          modLoader: modpack.loader,
        });

        if (files.length === 0) {
          failed++;
          continue;
        }

        const addedMod = await window.api.curseforge.addToLibrary(
          dep.modId,
          files[0].id,
          modpack.loader || "fabric"
        );

        if (addedMod) {
          await window.api.modpacks.addMod(props.modpackId, addedMod.id);
          installed++;
        }
      } catch {
        failed++;
      } finally {
        installingDepIds.value.delete(dep.modId);
      }
    }

    if (installed > 0) {
      toast.success("Dependencies Installed", `${installed} dependencies added${failed > 0 ? `, ${failed} failed` : ''}`);
      emit("refresh");
      await runAnalysis();
    } else if (failed > 0) {
      toast.error("Installation Failed", `Could not install ${failed} dependencies`);
    }
  } catch (err) {
    console.error("Failed to install all dependencies:", err);
    toast.error("Failed", (err as Error).message);
  } finally {
    isInstallingAll.value = false;
  }
}

function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section];
}

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

function getPerformanceIcon(category: string) {
  switch (category) {
    case "optimization":
      return Zap;
    case "clientOnly":
      return Cpu;
    case "graphics":
      return Image;
    case "worldGen":
      return Globe;
    default:
      return Package;
  }
}

watch(
  () => props.modpackId,
  () => {
    analysis.value = null;
  }
);
</script>

<template>
  <div class="h-full flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
    <!-- No Analysis Yet - Hero State -->
    <div v-if="!analysis && !isLoading"
      class="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <!-- Animated Background Elements -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse"
          style="animation-delay: 1s;" />
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-border/10 rounded-full" />
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-border/10 rounded-full" />
      </div>

      <div class="relative z-10 text-center max-w-md">
        <!-- Icon -->
        <div class="relative mx-auto w-20 h-20 mb-6">
          <div class="absolute inset-0 bg-primary/20 rounded-lg rotate-6 blur-sm" />
          <div
            class="relative w-full h-full bg-gradient-to-br from-primary/15 to-primary/5 rounded-lg flex items-center justify-center border border-primary/20">
            <Activity class="w-10 h-10 text-primary" />
          </div>
        </div>

        <!-- Title -->
        <h2 class="text-xl font-semibold mb-2 text-foreground">
          Health Analysis
        </h2>
        <p class="text-muted-foreground text-sm mb-6 leading-relaxed">
          Scan your modpack for missing dependencies, conflicts, performance issues, and get recommendations to improve
          stability.
        </p>

        <!-- Feature Cards -->
        <div class="grid grid-cols-2 gap-2 mb-6">
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
            <Link class="w-4 h-4 text-amber-400 mb-1.5" />
            <div class="text-sm font-medium">Dependencies</div>
            <div class="text-xs text-muted-foreground">Check required mods</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
            <XCircle class="w-4 h-4 text-red-400 mb-1.5" />
            <div class="text-sm font-medium">Conflicts</div>
            <div class="text-xs text-muted-foreground">Detect incompatibilities</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
            <Cpu class="w-4 h-4 text-primary mb-1.5" />
            <div class="text-sm font-medium">RAM Estimate</div>
            <div class="text-xs text-muted-foreground">Memory requirements</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
            <Lightbulb class="w-4 h-4 text-yellow-400 mb-1.5" />
            <div class="text-sm font-medium">Suggestions</div>
            <div class="text-xs text-muted-foreground">Optimization tips</div>
          </div>
        </div>

        <!-- CTA Button -->
        <Button variant="default" size="lg" class="gap-2 px-8 shadow-lg shadow-primary/20" @click="runAnalysis">
          <Zap class="w-5 h-5" />
          Start Analysis
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else-if="isLoading" class="flex-1 flex flex-col items-center justify-center p-8">
      <div class="relative">
        <div class="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <Activity class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-primary" />
      </div>
      <h3 class="font-semibold text-lg mt-6 mb-2">Analyzing Modpack</h3>
      <p class="text-sm text-muted-foreground text-center max-w-xs">
        Checking dependencies, detecting conflicts, and calculating performance metrics...
      </p>
    </div>

    <!-- Results -->
    <template v-else-if="analysis">
      <!-- Fixed Header with Score -->
      <div class="shrink-0 p-4 border-b border-border/30 bg-gradient-to-r" :class="scoreGradient">
        <div class="flex items-center gap-4">
          <!-- Score Circle -->
          <div class="relative">
            <svg class="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="6" fill="none" class="text-muted/20" />
              <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="6" fill="none" :class="scoreColor"
                :stroke-dasharray="`${(overallScore / 100) * 226} 226`" stroke-linecap="round"
                class="transition-all duration-500" />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-2xl font-bold" :class="scoreColor">{{ overallScore }}</span>
            </div>
          </div>

          <!-- Score Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <Shield class="w-5 h-5" :class="scoreColor" />
              <span class="font-semibold text-lg">{{ scoreLabel }}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-0.5">
              {{ analysis.performanceStats.totalMods }} mods analyzed
            </p>

            <!-- Quick Stats -->
            <div class="flex items-center gap-3 mt-2">
              <div class="flex items-center gap-1 text-xs"
                :class="analysis.missingDependencies.length > 0 ? 'text-orange-400' : 'text-emerald-400'">
                <Link class="w-3.5 h-3.5" />
                <span>{{ analysis.missingDependencies.length }} missing</span>
              </div>
              <div class="flex items-center gap-1 text-xs"
                :class="errorConflicts.length > 0 ? 'text-red-400' : 'text-emerald-400'">
                <XCircle class="w-3.5 h-3.5" />
                <span>{{ errorConflicts.length }} conflicts</span>
              </div>
              <div v-if="warningConflicts.length > 0" class="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle class="w-3.5 h-3.5" />
                <span>{{ warningConflicts.length }} warnings</span>
              </div>
              <div v-if="ramAnalysis" class="flex items-center gap-1 text-xs text-blue-400">
                <Cpu class="w-3.5 h-3.5" />
                <span>{{ formatRam(ramAnalysis.estimatedRamRecommended) }}</span>
              </div>
            </div>
          </div>

          <!-- Refresh Button -->
          <Button variant="outline" size="sm" class="gap-1.5 shrink-0" @click="runAnalysis">
            <RefreshCw class="w-4 h-4" />
            Re-analyze
          </Button>
        </div>
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">

        <!-- Quick Overview Cards -->
        <div class="grid grid-cols-5 gap-2">
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
            <div class="text-xl font-bold text-foreground">{{ analysis.performanceStats.totalMods }}</div>
            <div class="text-xs text-muted-foreground">Total Mods</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
            <div class="text-xl font-bold"
              :class="analysis.missingDependencies.length > 0 ? 'text-amber-400' : 'text-primary'">
              {{ analysis.missingDependencies.length }}
            </div>
            <div class="text-xs text-muted-foreground">Missing Deps</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
            <div class="text-xl font-bold" :class="errorConflicts.length > 0 ? 'text-red-400' : 'text-primary'">
              {{ errorConflicts.length }}
            </div>
            <div class="text-xs text-muted-foreground">Conflicts</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
            <div class="text-xl font-bold" :class="warningConflicts.length > 0 ? 'text-amber-400' : 'text-primary'">
              {{ warningConflicts.length }}
            </div>
            <div class="text-xs text-muted-foreground">Warnings</div>
          </div>
          <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
            <div class="text-xl font-bold text-primary">{{ analysis.performanceStats.optimizationMods }}</div>
            <div class="text-xs text-muted-foreground">Optimizers</div>
          </div>
        </div>

        <!-- Missing Dependencies Section -->
        <div class="rounded-lg border overflow-hidden"
          :class="analysis.missingDependencies.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-muted/20'">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('dependencies')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="analysis.missingDependencies.length > 0 ? 'bg-orange-500/20' : 'bg-emerald-500/20'">
                <Link class="w-5 h-5"
                  :class="analysis.missingDependencies.length > 0 ? 'text-orange-400' : 'text-emerald-400'" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">Missing Dependencies</span>
                <div class="text-xs text-muted-foreground">
                  {{ analysis.missingDependencies.length > 0 ? 'Required mods not installed' : 'Dependenciessatisfied'
                  }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold" :class="analysis.missingDependencies.length > 0
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-emerald-500/20 text-emerald-400'
                ">
                {{ analysis.missingDependencies.length }}
              </span>
              <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                :class="{ '-rotate-180': expandedSections.dependencies }" />
            </div>
          </button>

          <div v-if="expandedSections.dependencies && analysis.missingDependencies.length > 0"
            class="border-t border-border/30">
            <!-- Install All Header -->
            <div v-if="analysis.missingDependencies.length > 1 && !isLinked"
              class="px-4 py-2 bg-muted/30 border-b border-border/20 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">
                {{ analysis.missingDependencies.length }} dependencies missing
              </span>
              <Button variant="default" size="sm" class="h-7 text-xs gap-1.5" @click.stop="installAllDependencies"
                :disabled="isInstallingAll || installingDepIds.size > 0">
                <Loader2 v-if="isInstallingAll" class="w-3.5 h-3.5 animate-spin" />
                <Package v-else class="w-3.5 h-3.5" />
                {{ isInstallingAll ? 'Installing...' : 'Install All' }}
              </Button>
            </div>
            <div class="divide-y divide-border/20">
              <div v-for="dep in analysis.missingDependencies" :key="dep.modId"
                class="p-4 flex items-center justify-between gap-4 hover:bg-accent/10 transition-colors">
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-sm flex items-center gap-2">
                    <Package class="w-4 h-4 text-orange-400 shrink-0" />
                    {{ dep.modName }}
                  </div>
                  <div class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span>Required by:</span>
                    <span class="text-foreground/70">{{ dep.requiredBy.join(", ") }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <a v-if="dep.slug" :href="`https://www.curseforge.com/minecraft/mc-mods/${dep.slug}`" target="_blank"
                    class="p-2 rounded-lg hover:bg-accent transition-colors" title="View on CurseForge">
                    <ExternalLink class="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </a>
                  <Button variant="default" size="sm" class="h-8 text-xs gap-1.5" @click="addDependency(dep)"
                    :disabled="isLinked || installingDepIds.has(dep.modId)">
                    <Loader2 v-if="installingDepIds.has(dep.modId)" class="w-3.5 h-3.5 animate-spin" />
                    <Package v-else-if="!isLinked" class="w-3.5 h-3.5" />
                    <Lock v-else class="w-3.5 h-3.5" />
                    {{ installingDepIds.has(dep.modId) ? "Installing..." : isLinked ? "Locked" : "Install" }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conflicts Section -->
        <div class="rounded-lg border overflow-hidden"
          :class="errorConflicts.length > 0 ? 'border-red-500/30 bg-red-500/5' : warningConflicts.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-muted/20'">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('conflicts')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="errorConflicts.length > 0 ? 'bg-red-500/20' : warningConflicts.length > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'">
                <XCircle v-if="errorConflicts.length > 0" class="w-5 h-5 text-red-400" />
                <AlertTriangle v-else-if="warningConflicts.length > 0" class="w-5 h-5 text-amber-400" />
                <CheckCircle v-else class="w-5 h-5 text-emerald-400" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">Mod Conflicts & Warnings</span>
                <div class="text-xs text-muted-foreground">
                  {{ errorConflicts.length > 0 ? `${errorConflicts.length} conflict(s)` : '' }}
                  {{ errorConflicts.length > 0 && warningConflicts.length > 0 ? ', ' : '' }}
                  {{ warningConflicts.length > 0 ? `${warningConflicts.length} warning(s)` : '' }}
                  {{ analysis.conflicts.length === 0 ? 'No issues detected' : '' }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="errorConflicts.length > 0"
                class="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400">
                {{ errorConflicts.length }}
              </span>
              <span v-if="warningConflicts.length > 0"
                class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400">
                {{ warningConflicts.length }}
              </span>
              <span v-if="analysis.conflicts.length === 0"
                class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400">
                0
              </span>
              <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                :class="{ '-rotate-180': expandedSections.conflicts }" />
            </div>
          </button>

          <div v-if="expandedSections.conflicts && analysis.conflicts.length > 0" class="border-t border-border/30">
            <div class="divide-y divide-border/20">
              <!-- Error Conflicts -->
              <div v-for="(conflict, idx) in errorConflicts" :key="'error-' + idx" class="p-4">
                <div class="flex items-center gap-3 mb-2">
                  <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-sm">
                    <span class="font-medium text-red-400">{{ conflict.mod1.name }}</span>
                    <XCircle class="w-4 h-4 text-red-500" />
                    <span class="font-medium text-red-400">{{ conflict.mod2.name }}</span>
                  </div>
                </div>
                <p class="text-sm text-muted-foreground pl-1">
                  {{ conflict.description || conflict.reason }}
                </p>
                <p v-if="conflict.suggestion" class="text-xs text-muted-foreground/70 pl-1 mt-1 italic">
                  💡 {{ conflict.suggestion }}
                </p>
              </div>

              <!-- Warning Conflicts (loader mismatch, etc.) -->
              <div v-for="(conflict, idx) in warningConflicts" :key="'warning-' + idx" class="p-4 bg-amber-500/5">
                <div class="flex items-center gap-3 mb-2">
                  <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-sm">
                    <AlertTriangle class="w-4 h-4 text-amber-500" />
                    <span class="font-medium text-amber-400">{{ conflict.mod1.name }}</span>
                    <span class="text-amber-400/70 text-xs">({{ conflict.type === 'loader_mismatch' ? 'different loader'
                      : conflict.type }})</span>
                  </div>
                </div>
                <p class="text-sm text-muted-foreground pl-1">
                  {{ conflict.description || conflict.reason }}
                </p>
                <p v-if="conflict.suggestion" class="text-xs text-amber-400/70 pl-1 mt-1 italic">
                  💡 {{ conflict.suggestion }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- RAM & Performance Section -->
        <div v-if="ramAnalysis" class="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('ramEstimate')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Cpu class="w-5 h-5 text-blue-400" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">RAM & Performance</span>
                <div class="text-xs text-muted-foreground">
                  Recommended: {{ formatRam(ramAnalysis.estimatedRamRecommended) }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold" :class="{
                'bg-emerald-500/20 text-emerald-400': ramAnalysis.performanceImpact <= 30,
                'bg-yellow-500/20 text-yellow-400': ramAnalysis.performanceImpact > 30 && ramAnalysis.performanceImpact <= 60,
                'bg-red-500/20 text-red-400': ramAnalysis.performanceImpact > 60
              }">
                {{ ramAnalysis.performanceImpact <= 30 ? 'Low' : ramAnalysis.performanceImpact <= 60 ? 'Medium' : 'High'
                }} Impact </span>
                  <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                    :class="{ '-rotate-180': expandedSections.ramEstimate }" />
            </div>
          </button>

          <div v-if="expandedSections.ramEstimate" class="border-t border-border/30 p-4 space-y-4">
            <!-- RAM Cards -->
            <div class="grid grid-cols-3 gap-2">
              <div class="relative p-3 rounded-lg bg-muted/30 border border-border/30 text-center overflow-hidden">
                <Gauge class="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
                <div class="text-xl font-bold text-foreground">{{ formatRam(ramAnalysis.estimatedRamMin) }}</div>
                <div class="text-xs text-muted-foreground mt-0.5">Minimum</div>
              </div>
              <div class="relative p-3 rounded-lg bg-primary/5 border border-primary/20 text-center overflow-hidden">
                <CheckCircle class="w-4 h-4 text-primary mx-auto mb-1.5" />
                <div class="text-xl font-bold text-primary">{{ formatRam(ramAnalysis.estimatedRamRecommended) }}
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">Recommended</div>
              </div>
              <div class="relative p-3 rounded-lg bg-muted/30 border border-border/30 text-center overflow-hidden">
                <TrendingUp class="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
                <div class="text-xl font-bold text-foreground">{{ formatRam(ramAnalysis.estimatedRamMax) }}</div>
                <div class="text-xs text-muted-foreground mt-0.5">Maximum</div>
              </div>
            </div>

            <!-- Impact Meters -->
            <div class="space-y-3 p-3 rounded-lg bg-muted/30">
              <div>
                <div class="flex justify-between text-xs mb-1.5">
                  <span class="text-muted-foreground flex items-center gap-1.5">
                    <Zap class="w-3 h-3" />
                    Performance Impact
                  </span>
                  <span class="font-medium">{{ ramAnalysis.performanceImpact }}%</span>
                </div>
                <div class="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div class="h-full transition-all rounded-full" :class="{
                    'bg-primary': ramAnalysis.performanceImpact <= 30,
                    'bg-amber-500': ramAnalysis.performanceImpact > 30 && ramAnalysis.performanceImpact <= 60,
                    'bg-red-500': ramAnalysis.performanceImpact > 60
                  }" :style="{ width: `${ramAnalysis.performanceImpact}%` }" />
                </div>
              </div>
              <div>
                <div class="flex justify-between text-xs mb-1.5">
                  <span class="text-muted-foreground flex items-center gap-1.5">
                    <Clock class="w-3 h-3" />
                    Load Time Impact
                  </span>
                  <span class="font-medium">{{ ramAnalysis.loadTimeImpact }}%</span>
                </div>
                <div class="h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div class="h-full transition-all rounded-full" :class="{
                    'bg-primary': ramAnalysis.loadTimeImpact <= 30,
                    'bg-amber-500': ramAnalysis.loadTimeImpact > 30 && ramAnalysis.loadTimeImpact <= 60,
                    'bg-red-500': ramAnalysis.loadTimeImpact > 60
                  }" :style="{ width: `${ramAnalysis.loadTimeImpact}%` }" />
                </div>
              </div>
            </div>

            <!-- Warnings -->
            <div v-if="ramAnalysis.warnings.length > 0"
              class="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div class="text-xs font-medium text-amber-400 flex items-center gap-1.5 mb-2">
                <AlertTriangle class="w-3.5 h-3.5" />
                Warnings
              </div>
              <div v-for="(warning, idx) in ramAnalysis.warnings" :key="idx"
                class="text-sm text-muted-foreground flex items-start gap-2">
                <span class="w-1 h-1 rounded-full bg-amber-500 mt-2 shrink-0" />
                {{ warning }}
              </div>
            </div>

            <!-- RAM Recommendations -->
            <div v-if="ramAnalysis.recommendations.length > 0"
              class="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <div class="text-xs font-medium text-primary flex items-center gap-1.5 mb-2">
                <Lightbulb class="w-3.5 h-3.5" />
                Recommendations
              </div>
              <div v-for="(rec, idx) in ramAnalysis.recommendations" :key="idx"
                class="text-sm text-muted-foreground flex items-start gap-2">
                <span class="w-1 h-1 rounded-full bg-primary mt-2 shrink-0" />
                {{ rec }}
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Profile -->
        <div class="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('performance')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Zap class="w-5 h-5 text-purple-400" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">Performance Profile</span>
                <div class="text-xs text-muted-foreground">
                  Mod category breakdown
                </div>
              </div>
            </div>
            <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
              :class="{ '-rotate-180': expandedSections.performance }" />
          </button>

          <div v-if="expandedSections.performance" class="border-t border-border/30 p-4">
            <div class="grid grid-cols-2 gap-2">
              <div class="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div class="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Zap class="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div class="text-lg font-bold text-primary">{{ analysis.performanceStats.optimizationMods }}</div>
                  <div class="text-xs text-muted-foreground">Optimization Mods</div>
                </div>
              </div>
              <div class="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <div class="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Cpu class="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-lg font-bold text-foreground">{{ analysis.performanceStats.clientOnly }}</div>
                  <div class="text-xs text-muted-foreground">Client Only</div>
                </div>
              </div>
              <div class="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <div class="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Package class="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-lg font-bold text-foreground">{{ analysis.performanceStats.resourceHeavy }}</div>
                  <div class="text-xs text-muted-foreground">Resource Heavy</div>
                </div>
              </div>
              <div class="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                <div class="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <Image class="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-lg font-bold text-foreground">{{ analysis.performanceStats.graphicsIntensive }}</div>
                  <div class="text-xs text-muted-foreground">Graphics Intensive</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dependency Graph -->
        <div class="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('dependencyGraph')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <GitBranch class="w-5 h-5 text-cyan-400" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">Dependency Graph</span>
                <div class="text-xs text-muted-foreground">
                  {{dependencyGraph.filter((n) => n.dependencies.length > 0).length}} mods with dependencies
                </div>
              </div>
            </div>
            <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
              :class="{ '-rotate-180': expandedSections.dependencyGraph }" />
          </button>

          <div v-if="expandedSections.dependencyGraph" class="border-t border-border/30">
            <div v-if="dependencyGraph.filter(n => n.dependencies.length > 0).length === 0" class="p-6 text-center">
              <CheckCircle class="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <div class="text-sm text-muted-foreground">No dependency information available</div>
            </div>
            <div v-else class="max-h-[300px] overflow-y-auto">
              <div v-for="node in dependencyGraph.filter((n) => n.dependencies.length > 0)" :key="node.id"
                class="border-b border-border/20 last:border-0">
                <button @click="toggleNode(node.id)"
                  class="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/10 text-left transition-colors">
                  <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform shrink-0"
                    :class="{ '-rotate-90': !expandedNodes.has(node.id) }" />
                  <Package class="w-4 h-4 text-cyan-400 shrink-0" />
                  <span class="text-sm font-medium truncate">{{ node.name }}</span>
                  <span class="text-xs text-muted-foreground ml-auto shrink-0 px-2 py-0.5 rounded-lg bg-muted/50">
                    {{ node.dependencies.length }} dep{{ node.dependencies.length !== 1 ? "s" : "" }}
                  </span>
                </button>
                <div v-if="expandedNodes.has(node.id)" class="pl-12 pr-4 pb-3 space-y-1">
                  <div v-for="dep in node.dependencies" :key="dep.modId"
                    class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                    :class="dep.isSatisfied ? 'bg-muted/20' : 'bg-red-500/10'">
                    <div class="w-2 h-2 rounded-full shrink-0"
                      :class="dep.isSatisfied ? 'bg-emerald-500' : 'bg-red-500'" />
                    <span class="truncate" :class="dep.isSatisfied ? 'text-muted-foreground' : 'text-red-400'">
                      {{ dep.modName }}
                    </span>
                    <span v-if="!dep.isSatisfied"
                      class="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-auto shrink-0 font-medium">
                      Missing
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- General Recommendations -->
        <div v-if="analysis.recommendations.length > 0"
          class="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
          <button class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
            @click="toggleSection('recommendations')">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Lightbulb class="w-5 h-5 text-yellow-400" />
              </div>
              <div class="text-left">
                <span class="font-medium text-sm">Recommendations</span>
                <div class="text-xs text-muted-foreground">
                  {{ analysis.recommendations.length }} suggestion{{ analysis.recommendations.length !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
            <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
              :class="{ '-rotate-180': expandedSections.recommendations }" />
          </button>

          <div v-if="expandedSections.recommendations" class="border-t border-border/30 p-4 space-y-2">
            <div v-for="(rec, idx) in analysis.recommendations" :key="idx"
              class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <Info class="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p class="text-sm text-foreground/80">{{ rec }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
