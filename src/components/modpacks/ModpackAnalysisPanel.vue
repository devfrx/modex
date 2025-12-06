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
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import type { ModpackAnalysis, DependencyInfo, ConflictInfo, PerformanceStats } from "@/types/electron";

const props = defineProps<{
    modpackId: string;
}>();

const emit = defineEmits<{
    (e: "addMod", modId: number): void;
    (e: "refresh"): void;
}>();

const toast = useToast();

const analysis = ref<ModpackAnalysis | null>(null);
const isLoading = ref(false);
const expandedSections = ref({
    dependencies: true,
    conflicts: true,
    performance: true,
    recommendations: true,
});

const hasIssues = computed(() => {
    if (!analysis.value) return false;
    return (
        analysis.value.missingDependencies.length > 0 ||
        analysis.value.conflicts.length > 0
    );
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
    if (overallScore.value >= 80) return "text-emerald-500";
    if (overallScore.value >= 60) return "text-yellow-500";
    if (overallScore.value >= 40) return "text-orange-500";
    return "text-red-500";
});

const scoreBg = computed(() => {
    if (overallScore.value >= 80) return "bg-emerald-500/20";
    if (overallScore.value >= 60) return "bg-yellow-500/20";
    if (overallScore.value >= 40) return "bg-orange-500/20";
    return "bg-red-500/20";
});

async function runAnalysis() {
    isLoading.value = true;
    try {
        analysis.value = await window.api.analyzer.analyzeModpack(props.modpackId);
        if (analysis.value.missingDependencies.length === 0 && analysis.value.conflicts.length === 0) {
            toast.success("All Good!", "No issues found in your modpack");
        } else {
            const issues = analysis.value.missingDependencies.length + analysis.value.conflicts.length;
            toast.warning("Issues Found", `${issues} issue(s) need attention`);
        }
    } catch (err) {
        console.error("Analysis failed:", err);
        toast.error("Analysis Failed", (err as Error).message);
    } finally {
        isLoading.value = false;
    }
}

async function addDependency(dep: DependencyInfo) {
    emit("addMod", dep.modId);
    // Re-run analysis after adding
    setTimeout(() => runAnalysis(), 500);
}

function toggleSection(section: keyof typeof expandedSections.value) {
    expandedSections.value[section] = !expandedSections.value[section];
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
    <div class="h-full flex flex-col">
        <!-- Header -->
        <div class="shrink-0 p-4 border-b border-border/30 bg-muted/20">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-semibold text-sm">Modpack Analysis</h3>
                    <p class="text-xs text-muted-foreground mt-0.5">
                        Check for dependencies, conflicts, and performance
                    </p>
                </div>
                <Button variant="default" size="sm" class="gap-1.5" :disabled="isLoading" @click="runAnalysis">
                    <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
                    {{ isLoading ? 'Analyzing...' : 'Analyze' }}
                </Button>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <!-- No Analysis Yet -->
            <div v-if="!analysis && !isLoading"
                class="flex flex-col items-center justify-center h-full text-center py-12">
                <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Zap class="w-8 h-8 text-primary" />
                </div>
                <h3 class="font-semibold text-lg mb-2">Ready to Analyze</h3>
                <p class="text-sm text-muted-foreground max-w-xs mb-4">
                    Click the Analyze button to scan your modpack for missing dependencies, conflicts, and performance
                    issues.
                </p>
                <Button variant="default" size="lg" class="gap-2" @click="runAnalysis">
                    <Zap class="w-5 h-5" />
                    Start Analysis
                </Button>
            </div>

            <!-- Loading -->
            <div v-else-if="isLoading" class="flex flex-col items-center justify-center h-full text-center py-12">
                <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                    <RefreshCw class="w-8 h-8 text-primary animate-spin" />
                </div>
                <h3 class="font-semibold text-lg mb-2">Analyzing Modpack...</h3>
                <p class="text-sm text-muted-foreground">
                    Checking CurseForge for dependency information
                </p>
            </div>

            <!-- Results -->
            <template v-else-if="analysis">
                <!-- Score Card -->
                <div class="rounded-xl border border-border/50 p-4" :class="scoreBg">
                    <div class="flex items-center gap-4">
                        <div class="text-4xl font-bold" :class="scoreColor">
                            {{ overallScore }}
                        </div>
                        <div class="flex-1">
                            <div class="font-semibold flex items-center gap-2">
                                <CheckCircle v-if="overallScore >= 80" class="w-5 h-5 text-emerald-500" />
                                <AlertTriangle v-else-if="overallScore >= 40" class="w-5 h-5 text-yellow-500" />
                                <XCircle v-else class="w-5 h-5 text-red-500" />
                                Health Score
                            </div>
                            <p class="text-xs text-muted-foreground mt-0.5">
                                {{ analysis.performanceStats.totalMods }} mods analyzed
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Missing Dependencies -->
                <div class="rounded-xl border border-border/50 overflow-hidden">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
                        @click="toggleSection('dependencies')">
                        <div class="flex items-center gap-2">
                            <Link class="w-4 h-4 text-orange-500" />
                            <span class="font-medium text-sm">Missing Dependencies</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="analysis.missingDependencies.length > 0
                                ? 'bg-orange-500/20 text-orange-500'
                                : 'bg-emerald-500/20 text-emerald-500'">
                                {{ analysis.missingDependencies.length }}
                            </span>
                        </div>
                        <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                            :class="{ '-rotate-180': expandedSections.dependencies }" />
                    </button>

                    <div v-if="expandedSections.dependencies" class="border-t border-border/30">
                        <div v-if="analysis.missingDependencies.length === 0"
                            class="p-4 text-center text-sm text-muted-foreground">
                            <CheckCircle class="w-5 h-5 mx-auto mb-2 text-emerald-500" />
                            All dependencies are satisfied
                        </div>
                        <div v-else class="divide-y divide-border/30">
                            <div v-for="dep in analysis.missingDependencies" :key="dep.modId"
                                class="p-3 flex items-center justify-between hover:bg-accent/20">
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium text-sm truncate">{{ dep.modName }}</div>
                                    <div class="text-xs text-muted-foreground mt-0.5">
                                        Required by: {{ dep.requiredBy.join(', ') }}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <a v-if="dep.slug"
                                        :href="`https://www.curseforge.com/minecraft/mc-mods/${dep.slug}`"
                                        target="_blank" class="p-1.5 rounded-lg hover:bg-accent transition-colors"
                                        title="View on CurseForge">
                                        <ExternalLink class="w-4 h-4 text-muted-foreground" />
                                    </a>
                                    <Button variant="default" size="sm" class="h-7 text-xs gap-1"
                                        @click="addDependency(dep)">
                                        <Package class="w-3 h-3" />
                                        Add
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Conflicts -->
                <div class="rounded-xl border border-border/50 overflow-hidden">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
                        @click="toggleSection('conflicts')">
                        <div class="flex items-center gap-2">
                            <XCircle class="w-4 h-4 text-red-500" />
                            <span class="font-medium text-sm">Conflicts</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium" :class="analysis.conflicts.length > 0
                                ? 'bg-red-500/20 text-red-500'
                                : 'bg-emerald-500/20 text-emerald-500'">
                                {{ analysis.conflicts.length }}
                            </span>
                        </div>
                        <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                            :class="{ '-rotate-180': expandedSections.conflicts }" />
                    </button>

                    <div v-if="expandedSections.conflicts" class="border-t border-border/30">
                        <div v-if="analysis.conflicts.length === 0"
                            class="p-4 text-center text-sm text-muted-foreground">
                            <CheckCircle class="w-5 h-5 mx-auto mb-2 text-emerald-500" />
                            No conflicts detected
                        </div>
                        <div v-else class="divide-y divide-border/30">
                            <div v-for="(conflict, idx) in analysis.conflicts" :key="idx" class="p-3">
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="font-medium text-red-400">{{ conflict.mod1.name }}</span>
                                    <XCircle class="w-3 h-3 text-red-500" />
                                    <span class="font-medium text-red-400">{{ conflict.mod2.name }}</span>
                                </div>
                                <p class="text-xs text-muted-foreground mt-1">{{ conflict.reason }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Performance Stats -->
                <div class="rounded-xl border border-border/50 overflow-hidden">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
                        @click="toggleSection('performance')">
                        <div class="flex items-center gap-2">
                            <Zap class="w-4 h-4 text-yellow-500" />
                            <span class="font-medium text-sm">Performance Profile</span>
                        </div>
                        <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                            :class="{ '-rotate-180': expandedSections.performance }" />
                    </button>

                    <div v-if="expandedSections.performance" class="border-t border-border/30 p-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10">
                                <Zap class="w-4 h-4 text-emerald-500" />
                                <div>
                                    <div class="text-xs text-muted-foreground">Optimization</div>
                                    <div class="font-semibold text-sm text-emerald-500">
                                        {{ analysis.performanceStats.optimizationMods }} mods
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10">
                                <Cpu class="w-4 h-4 text-blue-500" />
                                <div>
                                    <div class="text-xs text-muted-foreground">Client Only</div>
                                    <div class="font-semibold text-sm text-blue-500">
                                        {{ analysis.performanceStats.clientOnly }} mods
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10">
                                <Package class="w-4 h-4 text-orange-500" />
                                <div>
                                    <div class="text-xs text-muted-foreground">Resource Heavy</div>
                                    <div class="font-semibold text-sm text-orange-500">
                                        {{ analysis.performanceStats.resourceHeavy }} mods
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10">
                                <Image class="w-4 h-4 text-purple-500" />
                                <div>
                                    <div class="text-xs text-muted-foreground">Graphics</div>
                                    <div class="font-semibold text-sm text-purple-500">
                                        {{ analysis.performanceStats.graphicsIntensive }} mods
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recommendations -->
                <div v-if="analysis.recommendations.length > 0"
                    class="rounded-xl border border-border/50 overflow-hidden">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
                        @click="toggleSection('recommendations')">
                        <div class="flex items-center gap-2">
                            <Lightbulb class="w-4 h-4 text-blue-500" />
                            <span class="font-medium text-sm">Recommendations</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500">
                                {{ analysis.recommendations.length }}
                            </span>
                        </div>
                        <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform"
                            :class="{ '-rotate-180': expandedSections.recommendations }" />
                    </button>

                    <div v-if="expandedSections.recommendations"
                        class="border-t border-border/30 divide-y divide-border/30">
                        <div v-for="(rec, idx) in analysis.recommendations" :key="idx"
                            class="p-3 flex items-start gap-2">
                            <Info class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <p class="text-sm text-muted-foreground">{{ rec }}</p>
                        </div>
                    </div>
                </div>
            </template>
        </div>
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
