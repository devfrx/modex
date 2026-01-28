<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { createLogger } from "@/utils/logger";
import { useToast } from "@/composables/useToast";
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import Button from "@/components/ui/Button.vue";
import type {
    ModpackAnalysis,
    DependencyInfo,
    ConflictInfo,
    OrphanedDependencyInfo,
} from "@/types/electron";

const log = createLogger("ModpackAnalysisPanel");

const props = defineProps<{
    modpackId: string;
    isLinked?: boolean;
}>();

const emit = defineEmits<{
    (e: "addMod", modId: number): void;
    (e: "refresh"): void;
}>();

const toast = useToast();

const analysis = ref<ModpackAnalysis | null>(null);
const isLoading = ref(false);
const installingDepIds = ref<Set<number>>(new Set());
const expandedSections = ref({
    dependencies: true,
    conflicts: true,
    orphaned: true,
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

const hasWarnings = computed(() => {
    if (!analysis.value) return false;
    return (
        analysis.value.orphanedDependencies?.filter(o => o.confidence !== 'low').length > 0
    );
});

// Separate conflicts by severity
const errorConflicts = computed(() => {
    if (!analysis.value) return [];
    return analysis.value.conflicts.filter(c => c.severity === 'error');
});

const warningConflicts = computed(() => {
    if (!analysis.value) return [];
    return analysis.value.conflicts.filter(c => c.severity === 'warning');
});

// Filter orphaned dependencies by confidence (only show medium/high)
const significantOrphans = computed(() => {
    if (!analysis.value?.orphanedDependencies) return [];
    return analysis.value.orphanedDependencies.filter(o => o.confidence !== 'low');
});

const totalIssues = computed(() => {
    if (!analysis.value) return 0;
    return analysis.value.missingDependencies.length + analysis.value.conflicts.length;
});

// Track if we've synced dependencies in this session
const hasSyncedDeps = ref(false);

// Progress tracking
const analysisProgress = ref({
    step: 0,
    totalSteps: 4,
    stepName: '',
    percentage: 0
});

async function runAnalysis(syncDepsFirst: boolean = false) {
    isLoading.value = true;
    analysisProgress.value = { step: 0, totalSteps: 4, stepName: 'Initializing...', percentage: 0 };

    try {
        // Step 1: Sync dependencies if needed
        if (syncDepsFirst && !hasSyncedDeps.value) {
            analysisProgress.value = { step: 1, totalSteps: 4, stepName: 'Fetching dependency data...', percentage: 15 };
            log.debug("Syncing dependencies before analysis", { modpackId: props.modpackId });
            try {
                await window.api.modpacks.refreshDependencies(props.modpackId);
                hasSyncedDeps.value = true;
            } catch (syncErr) {
                log.warn("Failed to sync dependencies", { modpackId: props.modpackId, error: String(syncErr) });
            }
        } else {
            analysisProgress.value = { step: 1, totalSteps: 4, stepName: 'Loading mod data...', percentage: 15 };
        }

        // Step 2: Run analysis
        analysisProgress.value = { step: 2, totalSteps: 4, stepName: 'Analyzing dependencies...', percentage: 40 };
        await new Promise(r => setTimeout(r, 100)); // Allow UI to update

        const analysisResult = await window.api.analyzer.analyzeModpack(props.modpackId);
        analysis.value = analysisResult;

        // Step 3: Build dependency graph
        analysisProgress.value = { step: 3, totalSteps: 4, stepName: 'Building dependency graph...', percentage: 70 };
        await new Promise(r => setTimeout(r, 100)); // Allow UI to update

        // Build dependency graph from mod data
        await buildDependencyGraph();

        // Step 4: Complete
        analysisProgress.value = { step: 4, totalSteps: 4, stepName: 'Complete!', percentage: 100 };
        await new Promise(r => setTimeout(r, 200)); // Brief pause to show completion

        if (
            analysis.value.missingDependencies.length === 0 &&
            analysis.value.conflicts.length === 0
        ) {
            if (significantOrphans.value.length > 0) {
                toast.info("Review Recommended", `${significantOrphans.value.length} possibly unused mod(s) found`);
            } else {
                toast.success("All Good!", "No issues found in your modpack");
            }
        } else {
            const issues = totalIssues.value;
            toast.warning("Issues Found", `${issues} issue(s) need attention`);
        }
    } catch (err) {
        log.error("Analysis failed", { modpackId: props.modpackId, error: String(err) });
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
            const deps: { modId: number; modName: string; isSatisfied: boolean }[] = [];

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
        log.error("Failed to build dependency graph", { modpackId: props.modpackId, error: String(err) });
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
    if (installingDepIds.value.has(dep.modId)) return;

    installingDepIds.value.add(dep.modId);

    try {
        const cfMod = await window.api.curseforge.getMod(dep.modId);
        if (!cfMod) {
            toast.error("Mod not found", `Could not find ${dep.modName} on CurseForge`);
            return;
        }

        const modpack = await window.api.modpacks.getById(props.modpackId);
        if (!modpack) {
            toast.error("Error", "Could not load modpack details");
            return;
        }

        const files = await window.api.curseforge.getModFiles(dep.modId, {
            gameVersion: modpack.minecraft_version,
            modLoader: modpack.loader,
        });

        if (files.length === 0) {
            toast.error("No compatible files", `No files found for ${dep.modName} matching your MC version and loader`);
            return;
        }

        const addedMod = await window.api.curseforge.addToLibrary(
            dep.modId,
            files[0].id,
            modpack.loader || "fabric"
        );

        if (addedMod) {
            await window.api.modpacks.addMod(props.modpackId, addedMod.id);
            toast.success("Dependency Added", `${dep.modName} has been added to the modpack`);
            emit("refresh");
            await runAnalysis();
        }
    } catch (err) {
        log.error("Failed to add dependency", { modpackId: props.modpackId, modId: dep.modId, error: String(err) });
        toast.error("Failed to add", (err as Error).message);
    } finally {
        installingDepIds.value.delete(dep.modId);
    }
}

// Track if we're installing all dependencies
const isInstallingAll = ref(false);

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
        log.error("Failed to install all dependencies", { modpackId: props.modpackId, error: String(err) });
        toast.error("Failed", (err as Error).message);
    } finally {
        isInstallingAll.value = false;
    }
}

// Refresh dependencies from CurseForge API
const isRefreshingDeps = ref(false);

async function refreshDependencies() {
    if (isRefreshingDeps.value) return;

    isRefreshingDeps.value = true;
    try {
        const result = await window.api.modpacks.refreshDependencies(props.modpackId);

        if (result.updated > 0) {
            toast.success(
                "Dependencies Updated",
                `Updated ${result.updated} mods with latest dependency data${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`
            );
            await runAnalysis();
        } else if (result.skipped > 0) {
            toast.info("No Updates Needed", `All ${result.skipped} mods already have current dependency data`);
        } else {
            toast.info("No Mods", "No mods with CurseForge data found to update");
        }

        if (result.errors.length > 0) {
            log.warn("Dependency refresh had errors", { modpackId: props.modpackId, errors: result.errors });
        }
    } catch (err) {
        log.error("Failed to refresh dependencies", { modpackId: props.modpackId, error: String(err) });
        toast.error("Refresh Failed", (err as Error).message);
    } finally {
        isRefreshingDeps.value = false;
    }
}

function toggleSection(section: keyof typeof expandedSections.value) {
    expandedSections.value[section] = !expandedSections.value[section];
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
            </div>

            <div class="relative z-10 text-center max-w-md">
                <!-- Icon -->
                <div class="relative mx-auto w-20 h-20 mb-6">
                    <div class="absolute inset-0 bg-primary/20 rounded-lg rotate-6 blur-sm" />
                    <div
                        class="relative w-full h-full bg-gradient-to-br from-primary/15 to-primary/5 rounded-lg flex items-center justify-center border border-primary/20">
                        <Icon name="Activity" class="w-10 h-10 text-primary" />
                    </div>
                </div>

                <!-- Title -->
                <h2 class="text-xl font-semibold mb-2 text-foreground">
                    Diagnostics
                </h2>
                <p class="text-muted-foreground text-sm mb-6 leading-relaxed">
                    Scan your modpack for dependency issues and potential problems.
                </p>

                <!-- Feature Cards -->
                <div class="grid grid-cols-3 gap-2 mb-6">
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
                        <Icon name="Link" class="w-4 h-4 text-red-400 mb-1.5" />
                        <div class="text-sm font-medium">Dependencies</div>
                        <div class="text-xs text-muted-foreground">Find missing required mods</div>
                    </div>
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
                        <Icon name="Trash2" class="w-4 h-4 text-amber-400 mb-1.5" />
                        <div class="text-sm font-medium">Orphans</div>
                        <div class="text-xs text-muted-foreground">Unused dependencies</div>
                    </div>
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-left">
                        <Icon name="AlertTriangle" class="w-4 h-4 text-amber-400 mb-1.5" />
                        <div class="text-sm font-medium">Problems</div>
                        <div class="text-xs text-muted-foreground">Loader conflicts, duplicates</div>
                    </div>
                </div>

                <!-- CTA Button -->
                <Button variant="default" size="lg" class="gap-2 px-8 shadow-lg shadow-primary/20"
                    @click="runAnalysis(true)">
                    <Icon name="Zap" class="w-5 h-5" />
                    Run Diagnostics
                </Button>
                <p class="text-xs text-muted-foreground mt-3">
                    Fetches latest dependency data from CurseForge
                </p>
            </div>
        </div>

        <!-- Loading State with Progress -->
        <div v-else-if="isLoading" class="flex-1 flex flex-col items-center justify-center p-8">
            <div class="relative mb-6">
                <div class="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Icon name="Activity"
                    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-primary" />
            </div>
            <h3 class="font-semibold text-lg mb-2">Analyzing Modpack</h3>
            <p class="text-sm text-muted-foreground text-center max-w-xs mb-4">
                {{ analysisProgress.stepName }}
            </p>

            <!-- Progress Bar -->
            <div class="w-64 max-w-full">
                <div class="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        :style="{ width: `${analysisProgress.percentage}%` }" />
                </div>
                <div class="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Step {{ analysisProgress.step }}/{{ analysisProgress.totalSteps }}</span>
                    <span>{{ analysisProgress.percentage }}%</span>
                </div>
            </div>
        </div>

        <!-- Results -->
        <template v-else-if="analysis">
            <!-- Fixed Header -->
            <div class="shrink-0 p-4 border-b border-border/30 bg-muted/10">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                            :class="hasIssues ? 'bg-amber-500/20' : 'bg-emerald-500/20'">
                            <Icon :name="hasIssues ? 'AlertTriangle' : 'CheckCircle'" class="w-5 h-5"
                                :class="hasIssues ? 'text-amber-400' : 'text-emerald-400'" />
                        </div>
                        <div>
                            <h3 class="font-semibold">
                                {{ hasIssues ? `${totalIssues} Issue${totalIssues !== 1 ? 's' : ''} Found` : 'All Good!'
                                }}
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                {{ analysis.totalMods }} mods analyzed • {{ analysis.satisfiedDependencies }}
                                dependencies satisfied
                            </p>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-2">
                        <Tooltip content="Fetch latest dependency data from CurseForge" position="bottom">
                            <Button variant="outline" size="sm" class="gap-1.5" @click="refreshDependencies"
                                :disabled="isRefreshingDeps">
                                <Icon v-if="isRefreshingDeps" name="Loader2" class="w-4 h-4 animate-spin" />
                                <Icon v-else name="GitBranch" class="w-4 h-4" />
                                Sync
                            </Button>
                        </Tooltip>
                        <Button variant="outline" size="sm" class="gap-1.5" @click="() => runAnalysis()">
                            <Icon name="RefreshCw" class="w-4 h-4" />
                            Re-scan
                        </Button>
                    </div>
                </div>
            </div>

            <!-- Scrollable Content -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
                <!-- Quick Stats -->
                <div class="grid grid-cols-3 gap-2">
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                        <div class="text-xl font-bold text-foreground">{{ analysis.totalMods }}</div>
                        <div class="text-xs text-muted-foreground">Total Mods</div>
                    </div>
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                        <div class="text-xl font-bold text-emerald-400">{{ analysis.satisfiedDependencies }}</div>
                        <div class="text-xs text-muted-foreground">Deps OK</div>
                    </div>
                    <div class="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                        <div class="text-xl font-bold"
                            :class="analysis.missingDependencies.length > 0 ? 'text-amber-400' : 'text-emerald-400'">
                            {{ analysis.missingDependencies.length }}
                        </div>
                        <div class="text-xs text-muted-foreground">Missing Deps</div>
                    </div>
                </div>

                <!-- Missing Dependencies Section -->
                <div class="rounded-lg border overflow-hidden"
                    :class="analysis.missingDependencies.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-muted/20'">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
                        @click="toggleSection('dependencies')">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                                :class="analysis.missingDependencies.length > 0 ? 'bg-orange-500/20' : 'bg-emerald-500/20'">
                                <Icon name="Link" class="w-5 h-5"
                                    :class="analysis.missingDependencies.length > 0 ? 'text-orange-400' : 'text-emerald-400'" />
                            </div>
                            <div class="text-left">
                                <span class="font-medium text-sm">Missing Dependencies</span>
                                <div class="text-xs text-muted-foreground">
                                    {{ analysis.missingDependencies.length > 0 ? 'Required mods not installed' :
                                        'All dependencies satisfied' }}
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
                            <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground transition-transform"
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
                            <Button variant="default" size="sm" class="h-7 text-xs gap-1.5"
                                @click.stop="installAllDependencies"
                                :disabled="isInstallingAll || installingDepIds.size > 0">
                                <Icon v-if="isInstallingAll" name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                                <Icon v-else name="Package" class="w-3.5 h-3.5" />
                                {{ isInstallingAll ? 'Installing...' : 'Install All' }}
                            </Button>
                        </div>
                        <div class="divide-y divide-border/20">
                            <div v-for="dep in analysis.missingDependencies" :key="dep.modId"
                                class="p-4 flex items-center justify-between gap-4 hover:bg-accent/10 transition-colors">
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium text-sm flex items-center gap-2">
                                        <Icon name="Package" class="w-4 h-4 text-orange-400 shrink-0" />
                                        {{ dep.modName }}
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <span>Required by:</span>
                                        <span class="text-foreground/70">{{ dep.requiredBy.join(", ") }}</span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <Tooltip v-if="dep.modSlug" content="View on CurseForge" position="top">
                                        <a :href="`https://www.curseforge.com/minecraft/mc-mods/${dep.modSlug}`"
                                            target="_blank" class="p-2 rounded-lg hover:bg-accent transition-colors">
                                            <Icon name="ExternalLink"
                                                class="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                        </a>
                                    </Tooltip>
                                    <Button variant="default" size="sm" class="h-8 text-xs gap-1.5"
                                        @click="addDependency(dep)"
                                        :disabled="isLinked || installingDepIds.has(dep.modId)">
                                        <Icon v-if="installingDepIds.has(dep.modId)" name="Loader2"
                                            class="w-3.5 h-3.5 animate-spin" />
                                        <Icon v-else-if="!isLinked" name="Package" class="w-3.5 h-3.5" />
                                        <Icon v-else name="Lock" class="w-3.5 h-3.5" />
                                        {{ installingDepIds.has(dep.modId) ? "Installing..." : isLinked ? "Locked" :
                                            "Install" }}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Conflicts Section -->
                <div class="rounded-lg border overflow-hidden"
                    :class="errorConflicts.length > 0 ? 'border-red-500/30 bg-red-500/5' : warningConflicts.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-muted/20'">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
                        @click="toggleSection('conflicts')">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                                :class="errorConflicts.length > 0 ? 'bg-red-500/20' : warningConflicts.length > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'">
                                <Icon v-if="errorConflicts.length > 0" name="XCircle" class="w-5 h-5 text-red-400" />
                                <Icon v-else-if="warningConflicts.length > 0" name="AlertTriangle"
                                    class="w-5 h-5 text-amber-400" />
                                <Icon v-else name="CheckCircle" class="w-5 h-5 text-emerald-400" />
                            </div>
                            <div class="text-left">
                                <span class="font-medium text-sm">Mod Conflicts</span>
                                <div class="text-xs text-muted-foreground">
                                    {{ errorConflicts.length > 0 ? `${errorConflicts.length} incompatibility` : '' }}
                                    {{ errorConflicts.length > 0 && warningConflicts.length > 0 ? ', ' : '' }}
                                    {{ warningConflicts.length > 0 ? `${warningConflicts.length}
                                    warning${warningConflicts.length !== 1 ? 's' : ''}` : '' }}
                                    {{ analysis.conflicts.length === 0 ? 'No conflicts detected' : '' }}
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
                            <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground transition-transform"
                                :class="{ '-rotate-180': expandedSections.conflicts }" />
                        </div>
                    </button>

                    <div v-if="expandedSections.conflicts && analysis.conflicts.length > 0"
                        class="border-t border-border/30">
                        <div class="divide-y divide-border/20">
                            <!-- Error Conflicts (API-reported incompatibilities) -->
                            <div v-for="(conflict, idx) in errorConflicts" :key="'error-' + idx" class="p-4">
                                <div class="flex items-center gap-3 mb-2">
                                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-sm">
                                        <span class="font-medium text-red-400">{{ conflict.mod1.name }}</span>
                                        <Icon name="XCircle" class="w-4 h-4 text-red-500" />
                                        <span class="font-medium text-red-400">{{ conflict.mod2.name }}</span>
                                    </div>
                                </div>
                                <p class="text-sm text-muted-foreground pl-1">
                                    {{ conflict.description }}
                                </p>
                                <p v-if="conflict.suggestion" class="text-xs text-muted-foreground/70 pl-1 mt-1 italic">
                                    💡 {{ conflict.suggestion }}
                                </p>
                            </div>

                            <!-- Warning Conflicts (loader mismatch, duplicates) -->
                            <div v-for="(conflict, idx) in warningConflicts" :key="'warning-' + idx"
                                class="p-4 bg-amber-500/5">
                                <div class="flex items-center gap-3 mb-2">
                                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-sm">
                                        <Icon name="AlertTriangle" class="w-4 h-4 text-amber-500" />
                                        <span class="font-medium text-amber-400">{{ conflict.mod1.name }}</span>
                                        <span class="text-amber-400/70 text-xs">({{ conflict.type === 'loader_mismatch'
                                            ? 'wrong loader' : conflict.type }})</span>
                                    </div>
                                </div>
                                <p class="text-sm text-muted-foreground pl-1">
                                    {{ conflict.description }}
                                </p>
                                <p v-if="conflict.suggestion" class="text-xs text-amber-400/70 pl-1 mt-1 italic">
                                    💡 {{ conflict.suggestion }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Orphaned Dependencies Section -->
                <div v-if="analysis.orphanedDependencies && analysis.orphanedDependencies.length > 0"
                    class="rounded-lg border overflow-hidden"
                    :class="significantOrphans.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/30 bg-muted/20'">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
                        @click="toggleSection('orphaned')">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                                :class="significantOrphans.length > 0 ? 'bg-amber-500/20' : 'bg-muted/30'">
                                <Icon name="Trash2" class="w-5 h-5"
                                    :class="significantOrphans.length > 0 ? 'text-amber-400' : 'text-muted-foreground'" />
                            </div>
                            <div class="text-left">
                                <span class="font-medium text-sm">Possibly Unused Mods</span>
                                <div class="text-xs text-muted-foreground">
                                    {{ significantOrphans.length > 0
                                        ? `${significantOrphans.length} mod${significantOrphans.length !== 1 ? 's' : ''} may
                                    no longer be needed`
                                        : 'All mods appear to be in use' }}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span v-if="significantOrphans.length > 0"
                                class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400">
                                {{ significantOrphans.length }}
                            </span>
                            <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground transition-transform"
                                :class="{ '-rotate-180': expandedSections.orphaned }" />
                        </div>
                    </button>

                    <div v-if="expandedSections.orphaned && significantOrphans.length > 0"
                        class="border-t border-border/30">
                        <div class="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
                            <p class="text-xs text-amber-400/80 flex items-center gap-1.5">
                                <Icon name="Info" class="w-3.5 h-3.5" />
                                These mods appear to be library/API mods with no active dependents. Review before
                                removing.
                            </p>
                        </div>
                        <div class="divide-y divide-border/20">
                            <div v-for="orphan in significantOrphans" :key="orphan.id"
                                class="p-4 flex items-center justify-between gap-4 hover:bg-accent/10 transition-colors">
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium text-sm flex items-center gap-2">
                                        <Icon name="Package" class="w-4 h-4 text-amber-400 shrink-0" />
                                        {{ orphan.name }}
                                        <span v-if="orphan.confidence === 'high'"
                                            class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
                                            Likely unused
                                        </span>
                                        <span v-else-if="orphan.confidence === 'medium'"
                                            class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400/70">
                                            Possibly unused
                                        </span>
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1">
                                        {{ orphan.reason }}
                                    </div>
                                    <div v-if="orphan.wasRequiredBy.length > 0"
                                        class="text-xs text-muted-foreground/70 mt-0.5">
                                        Was required by: {{ orphan.wasRequiredBy.join(', ') }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Dependency Graph -->
                <div class="rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
                    <button
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors"
                        @click="toggleSection('dependencyGraph')">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                <Icon name="GitBranch" class="w-5 h-5 text-cyan-400" />
                            </div>
                            <div class="text-left">
                                <span class="font-medium text-sm">Dependency Graph</span>
                                <div class="text-xs text-muted-foreground">
                                    {{dependencyGraph.filter((n) => n.dependencies.length > 0).length}} mods with
                                    missing dependencies
                                </div>
                            </div>
                        </div>
                        <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground transition-transform"
                            :class="{ '-rotate-180': expandedSections.dependencyGraph }" />
                    </button>

                    <div v-if="expandedSections.dependencyGraph" class="border-t border-border/30">
                        <div v-if="dependencyGraph.filter(n => n.dependencies.length > 0).length === 0"
                            class="p-6 text-center">
                            <Icon name="CheckCircle" class="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                            <div class="text-sm text-muted-foreground">All dependencies are satisfied</div>
                        </div>
                        <div v-else class="max-h-[300px] overflow-y-auto">
                            <div v-for="node in dependencyGraph.filter((n) => n.dependencies.length > 0)" :key="node.id"
                                class="border-b border-border/20 last:border-0">
                                <button @click="toggleNode(node.id)"
                                    class="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/10 text-left transition-colors">
                                    <Icon name="ChevronDown"
                                        class="w-4 h-4 text-muted-foreground transition-transform shrink-0"
                                        :class="{ '-rotate-90': !expandedNodes.has(node.id) }" />
                                    <Icon name="Package" class="w-4 h-4 text-cyan-400 shrink-0" />
                                    <span class="text-sm font-medium truncate">{{ node.name }}</span>
                                    <span
                                        class="text-xs text-muted-foreground ml-auto shrink-0 px-2 py-0.5 rounded-lg bg-muted/50">
                                        {{ node.dependencies.length }} missing
                                    </span>
                                </button>
                                <div v-if="expandedNodes.has(node.id)" class="pl-12 pr-4 pb-3 space-y-1">
                                    <div v-for="dep in node.dependencies" :key="dep.modId"
                                        class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-red-500/10">
                                        <div class="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                                        <span class="truncate text-red-400">{{ dep.modName }}</span>
                                        <span
                                            class="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-auto shrink-0 font-medium">
                                            Missing
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
