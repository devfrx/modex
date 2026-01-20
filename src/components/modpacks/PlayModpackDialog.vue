<script setup lang="ts">
/**
 * PlayModpackDialog - Modern dialog for playing modpacks via isolated instances
 * 
 * Features:
 * - Sleek glassmorphism design with smooth animations
 * - Intuitive tab navigation with icons
 * - Real-time sync progress visualization
 * - Integrated config browser
 * - Quick folder access
 */

import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { createLogger } from "@/utils/logger";
import Icon from "@/components/ui/Icon.vue";
import { useInstances } from "@/composables/useInstances";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import ConfigBrowser from "@/components/configs/ConfigBrowser.vue";
import ConfigStructuredEditor from "@/components/configs/ConfigStructuredEditor.vue";
import type { ModexInstance, InstanceSyncResult, ConfigFile } from "@/types";

const log = createLogger("PlayModpackDialog");

const props = defineProps<{
    open: boolean;
    modpackId: string;
    modpackName: string;
    modpackIcon?: string;
    minecraftVersion?: string;
    loader?: string;
    modCount?: number;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "launched", instance: ModexInstance): void;
}>();

// Composables
const {
    syncProgress,
    runningGames,
    getInstanceByModpack,
    createFromModpack,
    syncModpackToInstance,
    launchInstance,
    openInstanceFolder,
    getInstanceStats,
    getRunningGame,
    killGame,
    onGameLogLine,
    updateInstance,
    smartLaunch,
    getInstanceSyncSettings,
} = useInstances();
const { success, error: showError } = useToast();

// State
const instance = ref<ModexInstance | null>(null);
const stats = ref<{ modCount: number; configCount: number; totalSize: string } | null>(null);
const isLoading = ref(true);
const isCreating = ref(false);
const isSyncing = ref(false);
const isLaunching = ref(false);
const syncResult = ref<InstanceSyncResult | null>(null);
const activeTab = ref<"play" | "sync" | "configs" | "folders">("play");

// Sync Status
const syncStatus = ref<{
    needsSync: boolean;
    missingInInstance: Array<{ filename: string; type: string }>;
    extraInInstance: Array<{ filename: string; type: string }>;
    disabledMismatch: Array<{ filename: string; issue: string }>;
    updatesToApply: Array<{ oldFilename: string; newFilename: string; type: string; willBeDisabled?: boolean }>;
    configDifferences: number;
    totalDifferences: number;
    loaderVersionMismatch?: boolean;
} | null>(null);

// Loader Installation Progress
const loaderProgress = ref<{
    stage: string;
    current: number;
    total: number;
    detail: string;
} | null>(null);

// Game Launch State
const gameLaunched = ref(false);
const gameLoadingMessage = ref("");

// Instance Settings (RAM & JVM Args)
const showSettings = ref(false);
const memoryMin = ref(2048);
const memoryMax = ref(4096);
const customJavaArgs = ref("");

// Live Log State
const gameLogs = ref<Array<{ time: string; level: string; message: string }>>([]);
const showLogConsole = ref(false);
const logScrollRef = ref<HTMLDivElement | null>(null);
const maxLogLines = 200;
const logLevelFilter = ref<"all" | "info" | "warn" | "error">("all");

// Filtered logs based on level
const filteredGameLogs = computed(() => {
    if (logLevelFilter.value === "all") return gameLogs.value;
    const filterMap: Record<string, string[]> = {
        "info": ["INFO"],
        "warn": ["WARN", "WARNING"],
        "error": ["ERROR", "FATAL", "SEVERE"]
    };
    const allowedLevels = filterMap[logLevelFilter.value] || [];
    return gameLogs.value.filter(log => allowedLevels.includes(log.level.toUpperCase()));
});

// Log level counts for badges
const logLevelCounts = computed(() => {
    const counts = { info: 0, warn: 0, error: 0 };
    for (const log of gameLogs.value) {
        const level = log.level.toUpperCase();
        if (level === "INFO") counts.info++;
        else if (level === "WARN" || level === "WARNING") counts.warn++;
        else if (level === "ERROR" || level === "FATAL" || level === "SEVERE") counts.error++;
    }
    return counts;
});

// Computed: current running game info for this instance
const runningGame = computed(() => {
    if (!instance.value) return null;
    return runningGames.value.get(instance.value.id) || null;
});

// Computed: is this instance's game currently running?
const isGameRunning = computed(() => {
    return runningGame.value !== null && runningGame.value.status !== "stopped";
});

// Structured Config Editor State
const showStructuredEditor = ref(false);
const structuredEditorFile = ref<ConfigFile | null>(null);
const configRefreshKey = ref(0);

// Sync Options
const clearExistingMods = ref(false);
const configSyncMode = ref<"overwrite" | "new_only" | "skip">("new_only");

// Smart Launch - Confirmation Dialog State
const showSyncConfirmDialog = ref(false);
const pendingLaunchData = ref<{
    needsSync: boolean;
    differences: number;
    lastSynced?: string;
} | null>(null);

// Check for existing instance
async function checkInstance() {
    isLoading.value = true;
    try {
        instance.value = await getInstanceByModpack(props.modpackId);
        if (instance.value) {
            const instanceStats = await getInstanceStats(instance.value.id);
            if (instanceStats) {
                stats.value = {
                    modCount: instanceStats.modCount,
                    configCount: instanceStats.configCount,
                    totalSize: instanceStats.totalSize,
                };
            }

            // Load instance settings (RAM, JVM args)
            loadInstanceSettings();

            // Check sync status
            try {
                syncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
            } catch (err) {
                log.error("Failed to check sync status", { instanceId: instance.value?.id, error: String(err) });
            }
        }
    } finally {
        isLoading.value = false;
    }
}

// Create new instance
async function handleCreateInstance() {
    isCreating.value = true;
    syncResult.value = null;

    try {
        const result = await createFromModpack(props.modpackId);

        if (result) {
            instance.value = result.instance;
            syncResult.value = result.syncResult;

            if (result.syncResult.success) {
                success(
                    "Instance Ready!",
                    `Downloaded ${result.syncResult.modsDownloaded} mods, ${result.syncResult.configsCopied} config files`
                );

                const instanceStats = await getInstanceStats(result.instance.id);
                if (instanceStats) {
                    stats.value = {
                        modCount: instanceStats.modCount,
                        configCount: instanceStats.configCount,
                        totalSize: instanceStats.totalSize,
                    };
                }
            } else {
                showError(
                    "Instance created with issues",
                    `${result.syncResult.errors.length} errors, ${result.syncResult.warnings.length} warnings`
                );
            }
        }
    } catch (err: any) {
        showError("Failed to create instance", err.message);
    } finally {
        isCreating.value = false;
    }
}

// Sync/update existing instance
async function handleSyncInstance() {
    if (!instance.value) return;

    isSyncing.value = true;
    syncResult.value = null;

    try {
        const result = await syncModpackToInstance(
            instance.value.id,
            props.modpackId,
            {
                clearExisting: clearExistingMods.value,
                configSyncMode: configSyncMode.value
            }
        );

        syncResult.value = result;

        if (result.success) {
            const configMsg = configSyncMode.value === "skip"
                ? ""
                : `, ${result.configsCopied} configs`;
            success(
                "Sync Complete",
                `${result.modsDownloaded} mods updated${configMsg}`
            );

            const instanceStats = await getInstanceStats(instance.value!.id);
            if (instanceStats) {
                stats.value = {
                    modCount: instanceStats.modCount,
                    configCount: instanceStats.configCount,
                    totalSize: instanceStats.totalSize,
                };
            }

            // Refresh sync status after successful sync
            syncStatus.value = await window.api.instances.checkSyncStatus(instance.value!.id, props.modpackId);
        } else {
            showError("Sync had errors", result.errors.join(", "));
        }
    } catch (err: any) {
        showError("Sync failed", err.message);
    } finally {
        isSyncing.value = false;
    }
}

// Save instance settings (RAM, JVM args)
async function saveInstanceSettings() {
    if (!instance.value) return;

    try {
        await updateInstance(instance.value.id, {
            memory: { min: memoryMin.value, max: memoryMax.value },
            javaArgs: customJavaArgs.value || undefined
        });
        success("Settings Saved", "Memory and JVM arguments updated");
        showSettings.value = false;
    } catch (err: any) {
        showError("Failed to save", err.message);
    }
}

// Load instance settings when instance is loaded
function loadInstanceSettings() {
    if (instance.value) {
        memoryMin.value = instance.value.memory?.min || 2048;
        memoryMax.value = instance.value.memory?.max || 4096;
        customJavaArgs.value = instance.value.javaArgs || "";
    }
}

// Launch instance
async function handleLaunch(options?: { forceSync?: boolean; skipSync?: boolean }) {
    if (!instance.value) return;

    isLaunching.value = true;
    loaderProgress.value = null;
    gameLaunched.value = false;
    gameLoadingMessage.value = "";

    // Listen for loader installation progress
    const removeProgressListener = window.api.on("loader:installProgress", (data: any) => {
        loaderProgress.value = {
            stage: data.stage,
            current: data.current,
            total: data.total,
            detail: data.detail || ""
        };
    });

    try {
        // Use smartLaunch instead of direct launchInstance
        const result = await smartLaunch(instance.value.id, props.modpackId, {
            forceSync: options?.forceSync,
            skipSync: options?.skipSync,
            configSyncMode: configSyncMode.value
        });

        // If confirmation is required, show dialog
        if (result.requiresConfirmation && result.syncStatus) {
            pendingLaunchData.value = {
                needsSync: result.syncStatus.needsSync,
                differences: result.syncStatus.differences ?? 0,
                lastSynced: result.syncStatus.lastSynced
            };
            showSyncConfirmDialog.value = true;
            isLaunching.value = false;
            removeProgressListener();
            return;
        }

        if (result.success) {
            // Switch to game tracking mode
            gameLaunched.value = true;
            gameLoadingMessage.value = "Launching Minecraft... Waiting for the game to start.";

            if (result.syncPerformed) {
                success("Synced & Launched", `Instance synced, Minecraft is loading...`);
            } else {
                success("Minecraft Launcher Started", "The game is now loading...");
            }

            // Refresh sync status after launch (in case sync was performed)
            if (result.syncPerformed) {
                syncStatus.value = await window.api.instances.checkSyncStatus(instance.value!.id, props.modpackId);
            }

            emit("launched", instance.value);
        } else {
            showError("Launch failed", result.error || "Unknown error");
        }
    } catch (err: any) {
        showError("Launch failed", err.message);
    } finally {
        removeProgressListener();
        isLaunching.value = false;
        loaderProgress.value = null;
    }
}

// Handle sync confirmation dialog response
function handleSyncConfirmation(action: "sync" | "skip" | "cancel") {
    showSyncConfirmDialog.value = false;
    pendingLaunchData.value = null;

    if (action === "cancel") return;

    // Re-launch with the chosen action
    handleLaunch({
        forceSync: action === "sync",
        skipSync: action === "skip"
    });
}

// Kill running game
async function handleKillGame() {
    if (!instance.value) return;

    try {
        const result = await killGame(instance.value.id);
        if (result) {
            success("Game Stopped", "Minecraft has been terminated.");
            gameLaunched.value = false;
        } else {
            showError("Failed to stop game", "Could not find or terminate the game process.");
        }
    } catch (err: any) {
        showError("Error stopping game", err.message);
    }
}

// Close after game launched
function handleCloseAfterLaunch() {
    gameLaunched.value = false;
    emit("close");
}

// Open folder
async function handleOpenFolder(subfolder?: string) {
    if (!instance.value) return;
    await openInstanceFolder(instance.value.id, subfolder);
}

// Open config file in external editor
async function handleOpenConfigExternal(file: ConfigFile) {
    if (!instance.value) return;
    try {
        await window.api.configs.openExternal(instance.value.id, file.path);
    } catch (err: any) {
        showError("Failed to open config", err.message);
    }
}

// Open config file in structured editor
function handleOpenStructuredEditor(file: ConfigFile) {
    structuredEditorFile.value = file;
    showStructuredEditor.value = true;
}

// Close structured editor
function handleCloseStructuredEditor() {
    showStructuredEditor.value = false;
    structuredEditorFile.value = null;
}

// Format date
function formatDate(dateString?: string): string {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

// Format runtime from start timestamp
function formatRuntime(startTime?: number): string {
    if (!startTime) return "0s";
    const diff = Date.now() - startTime;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

// Get loader badge styles
function getLoaderStyles(loader?: string) {
    switch (loader?.toLowerCase()) {
        case "forge": return { bg: "from-orange-500/20 to-amber-500/20", border: "border-orange-500/30", text: "text-orange-400" };
        case "fabric": return { bg: "from-blue-500/20 to-cyan-500/20", border: "border-blue-500/30", text: "text-blue-400" };
        case "neoforge": return { bg: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/30", text: "text-purple-400" };
        case "quilt": return { bg: "from-pink-500/20 to-rose-500/20", border: "border-pink-500/30", text: "text-pink-400" };
        default: return { bg: "from-gray-500/20 to-gray-500/20", border: "border-gray-500/30", text: "text-gray-400" };
    }
}

// Progress percentage
const progressPercent = computed(() => {
    if (!syncProgress.value || !syncProgress.value.total) return 0;
    return Math.round((syncProgress.value.current / syncProgress.value.total) * 100);
});

// Tabs configuration
const tabs = [
    { id: "play", label: "Play", icon: "Play" },
    { id: "sync", label: "Update", icon: "RefreshCw" },
    { id: "configs", label: "Configs", icon: "Settings" },
    { id: "folders", label: "Folders", icon: "FolderOpen" },
] as const;

// Folder items
const folderItems = computed(() => [
    { id: "mods", label: "Mods", icon: "Package", colorClass: "folder-orange", desc: stats.value ? `${stats.value.modCount} files` : "Mod files" },
    { id: "config", label: "Config", icon: "Settings", colorClass: "folder-blue", desc: stats.value ? `${stats.value.configCount} files` : "Settings" },
    { id: "saves", label: "Saves", icon: "Save", colorClass: "folder-green", desc: "Worlds" },
    { id: "resourcepacks", label: "Resources", icon: "Palette", colorClass: "folder-purple", desc: "Textures" },
    { id: "shaderpacks", label: "Shaders", icon: "Sun", colorClass: "folder-yellow", desc: "Shaders" },
    { id: "screenshots", label: "Screenshots", icon: "Image", colorClass: "folder-pink", desc: "Captures" },
]);

// Watch dialog open state
watch(() => props.open, async (open) => {
    if (open) {
        syncResult.value = null;
        activeTab.value = "play";
        gameLaunched.value = false;
        gameLoadingMessage.value = "";
        gameLogs.value = [];
        logLevelFilter.value = "all";
        try {
            await checkInstance();
        } catch (err) {
            log.error("Failed to check instance on dialog open", { modpackId: props.modpackId, error: String(err) });
        }
    } else {
        // Clear logs when dialog closes
        gameLogs.value = [];
        showLogConsole.value = false;
        logLevelFilter.value = "all";
    }
});

// Log line handler
let unsubscribeLogLine: (() => void) | null = null;

function handleGameLogLine(instanceId: string, logLine: { time: string; level: string; message: string; raw: string }) {
    if (!instance.value || instanceId !== instance.value.id) return;

    // Add log to array, maintaining max lines
    gameLogs.value.push(logLine);
    if (gameLogs.value.length > maxLogLines) {
        gameLogs.value = gameLogs.value.slice(-maxLogLines);
    }

    // Auto-scroll to bottom if enabled
    if (logScrollRef.value) {
        requestAnimationFrame(() => {
            if (logScrollRef.value) {
                logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight;
            }
        });
    }
}

// Initial check
onMounted(() => {
    if (props.open) {
        checkInstance();
    }
    // Listen for config revert events from other components
    window.addEventListener('modex:configReverted', handleConfigReverted);

    // Subscribe to game log lines
    unsubscribeLogLine = onGameLogLine(handleGameLogLine);
});

onUnmounted(() => {
    window.removeEventListener('modex:configReverted', handleConfigReverted);
    unsubscribeLogLine?.();
});

// Handle config revert event (reload the config editor)
function handleConfigReverted(event: Event) {
    const customEvent = event as CustomEvent<{ modpackId: string }>;
    // Only reload if this dialog is for the same modpack
    if (customEvent.detail.modpackId === props.modpackId) {
        configRefreshKey.value++;
    }
}
</script>

<template>
    <div v-if="props.open"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
        <div
            class="bg-background border border-border/50 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <!-- Header -->
            <div class="shrink-0 border-b border-border/50 bg-gradient-to-r from-card/80 to-card/40 px-5 py-3">
                <div class="flex items-center gap-4">
                    <!-- Pack Icon & Info -->
                    <div class="header-modpack-icon">
                        <img v-if="props.modpackIcon" :src="props.modpackIcon" alt=""
                            class="w-full h-full object-cover rounded-lg" />
                        <Icon v-else name="Gamepad2" class="w-6 h-6 text-primary" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <h2 class="text-lg font-semibold text-foreground truncate">{{ props.modpackName }}</h2>
                            <div v-if="instance?.state === 'ready'" class="header-status-badge header-status-ready">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-400" />
                                Ready
                            </div>
                            <div v-else-if="instance?.state === 'installing'"
                                class="header-status-badge header-status-installing">
                                <Icon name="Loader2" class="w-3 h-3 animate-spin" />
                                Installing
                            </div>
                        </div>
                        <div class="flex items-center gap-3 mt-1">
                            <span class="header-tag">
                                <Icon name="Box" class="w-3 h-3" />
                                {{ props.minecraftVersion || "Auto" }}
                            </span>
                            <span
                                :class="['header-tag', getLoaderStyles(props.loader).text, getLoaderStyles(props.loader).border]">
                                {{ props.loader || "Forge" }}
                            </span>
                            <span v-if="stats" class="header-tag">
                                <Icon name="Package" class="w-3 h-3" />
                                {{ stats.modCount }} mods
                            </span>
                            <!-- Sync Status Indicator -->
                            <span v-if="syncStatus?.needsSync"
                                class="header-tag border-amber-500/30 text-amber-400 bg-amber-500/10"
                                :title="`${syncStatus.totalDifferences} difference(s) with modpack`">
                                <Icon name="RefreshCw" class="w-3 h-3" />
                                Needs Sync
                            </span>
                            <span v-else-if="instance && syncStatus && !syncStatus.needsSync"
                                class="header-tag border-green-500/30 text-green-400 bg-green-500/10">
                                <Icon name="Check" class="w-3 h-3" />
                                In Sync
                            </span>
                        </div>
                    </div>
                    <!-- Close Button -->
                    <button @click="emit('close')"
                        class="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-auto p-5">
                <!-- Loading State -->
                <div v-if="isLoading" class="loading-container">
                    <div class="text-center space-y-4">
                        <div class="loading-icon">
                            <Icon name="Loader2" class="w-8 h-8 text-primary animate-spin" />
                        </div>
                        <p class="text-sm text-muted-foreground">Loading instance...</p>
                    </div>
                </div>

                <!-- No Instance - Create Flow -->
                <template v-else-if="!instance">
                    <div class="space-y-6 py-4">
                        <!-- Hero Section -->
                        <div class="text-center space-y-4">
                            <div class="hero-icon-wrapper">
                                <div class="hero-icon">
                                    <Icon name="Rocket" class="w-12 h-12 text-primary" />
                                </div>
                                <Icon name="Sparkles" class="sparkle-icon" />
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-foreground">Create Game Instance</h3>
                                <p class="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                                    Set up an isolated game directory with all mods and configs ready to play.
                                </p>
                            </div>
                        </div>

                        <!-- Info Cards -->
                        <div class="grid grid-cols-3 gap-3">
                            <div class="info-card">
                                <Icon name="Package" class="w-6 h-6 text-orange-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">{{ props.modCount || "?" }}</div>
                                <div class="text-xs text-muted-foreground">Mods</div>
                            </div>
                            <div class="info-card">
                                <Icon name="Box" class="w-6 h-6 text-blue-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">{{ props.minecraftVersion || "Auto" }}
                                </div>
                                <div class="text-xs text-muted-foreground">Version</div>
                            </div>
                            <div class="info-card">
                                <Icon name="Shield" class="w-6 h-6 text-green-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">Isolated</div>
                                <div class="text-xs text-muted-foreground">Safe</div>
                            </div>
                        </div>

                        <!-- Features List -->
                        <div class="features-card">
                            <h4 class="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                                <Icon name="Layers" class="w-4 h-4 text-primary" />
                                What's included
                            </h4>
                            <div class="space-y-2">
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <Icon name="CheckCircle" class="w-3.5 h-3.5 text-green-400" />
                                    </div>
                                    <span class="text-muted-foreground">Complete <span
                                            class="text-foreground font-medium">mods/</span> folder with all modpack
                                        mods</span>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <Icon name="CheckCircle" class="w-3.5 h-3.5 text-green-400" />
                                    </div>
                                    <span class="text-muted-foreground">Pre-configured <span
                                            class="text-foreground font-medium">config/</span> folder</span>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <Icon name="CheckCircle" class="w-3.5 h-3.5 text-green-400" />
                                    </div>
                                    <span class="text-muted-foreground">Separate saves, resourcepacks &
                                        screenshots</span>
                                </div>
                            </div>
                        </div>

                        <!-- Progress -->
                        <div v-if="syncProgress && isCreating" class="progress-card">
                            <div class="flex items-center gap-4 mb-3">
                                <div class="progress-icon">
                                    <Icon name="Loader2" class="w-6 h-6 text-primary animate-spin" />
                                </div>
                                <div class="flex-1">
                                    <div class="flex items-center justify-between mb-1">
                                        <span class="font-medium text-foreground">{{ syncProgress.stage }}</span>
                                        <span class="text-sm font-mono text-primary">{{ progressPercent }}%</span>
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ syncProgress.current }} / {{ syncProgress.total }} items
                                    </div>
                                </div>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
                            </div>
                            <p v-if="syncProgress.item" class="text-xs text-muted-foreground mt-2 truncate">
                                {{ syncProgress.item }}
                            </p>
                        </div>

                        <!-- Create Button -->
                        <Button @click="handleCreateInstance" :disabled="isCreating" size="lg" class="w-full gap-3">
                            <Icon v-if="isCreating" name="Loader2" class="w-5 h-5 animate-spin" />
                            <Icon v-else name="Rocket" class="w-5 h-5" />
                            {{ isCreating ? "Creating Instance..." : "Create & Download" }}
                        </Button>
                    </div>
                </template>

                <!-- Has Instance - Manage Flow -->
                <template v-else>
                    <div class="flex flex-col h-full gap-4">
                        <!-- Quick Stats Bar -->
                        <div class="quick-stats-bar">
                            <div class="quick-stat">
                                <Icon name="HardDrive" class="w-4 h-4 text-muted-foreground" />
                                <span v-if="stats">{{ stats.totalSize }}</span>
                                <span v-else>—</span>
                            </div>
                            <div class="quick-stat">
                                <Icon name="Clock" class="w-4 h-4 text-muted-foreground" />
                                <span v-if="instance.lastPlayed">{{ formatDate(instance.lastPlayed) }}</span>
                                <span v-else>Never played</span>
                            </div>
                            <div class="quick-stat">
                                <Icon name="Settings" class="w-4 h-4 text-muted-foreground" />
                                <span v-if="stats">{{ stats.configCount || 0 }} configs</span>
                                <span v-else>—</span>
                            </div>
                        </div>

                        <!-- Tab Navigation -->
                        <div class="tab-nav">
                            <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                                :class="['tab-btn', activeTab === tab.id && 'tab-active']">
                                <Icon :name="tab.icon" class="w-4 h-4" />
                                <span class="hidden sm:inline">{{ tab.label }}</span>
                            </button>
                        </div>

                        <!-- Tab Content -->
                        <div class="flex-1 flex flex-col min-h-[350px]">
                            <!-- Play Tab -->
                            <div v-if="activeTab === 'play'" class="play-tab-content">
                                <!-- Game Running State (tracked from process/logs) -->
                                <div v-if="gameLaunched || isGameRunning" class="game-running-container">
                                    <!-- Compact Status Bar -->
                                    <div class="game-status-bar" :class="{
                                        'status-launching': runningGame?.status === 'launching',
                                        'status-loading': runningGame?.status === 'loading_mods',
                                        'status-running': runningGame?.status === 'running'
                                    }">
                                        <div class="flex items-center gap-3">
                                            <!-- Status Icon -->
                                            <div class="status-icon-container">
                                                <Icon v-if="runningGame?.status === 'launching'" name="Rocket"
                                                    class="w-5 h-5 animate-bounce" />
                                                <Icon v-else-if="runningGame?.status === 'loading_mods'" name="Loader2"
                                                    class="w-5 h-5 animate-spin" />
                                                <Icon v-else-if="runningGame?.status === 'running'" name="Gamepad2"
                                                    class="w-5 h-5" />
                                                <Icon v-else name="Loader2" class="w-5 h-5 animate-spin" />
                                            </div>

                                            <!-- Status Text -->
                                            <div class="flex flex-col">
                                                <span class="font-semibold text-sm">
                                                    <template v-if="runningGame?.status === 'running'">Game
                                                        Running</template>
                                                    <template v-else-if="runningGame?.status === 'loading_mods'">Loading
                                                        Mods</template>
                                                    <template v-else-if="runningGame?.status === 'launching'">Starting
                                                        Minecraft</template>
                                                    <template v-else>Waiting...</template>
                                                </span>
                                                <span v-if="runningGame?.currentMod"
                                                    class="text-xs opacity-75 truncate max-w-[200px]">
                                                    {{ runningGame.currentMod }}
                                                </span>
                                            </div>
                                        </div>

                                        <!-- Right side: Progress + Actions -->
                                        <div class="flex items-center gap-4">
                                            <!-- Mini Progress -->
                                            <div v-if="runningGame?.status === 'loading_mods'"
                                                class="hidden sm:flex items-center gap-2">
                                                <div class="w-24 h-1.5 bg-black/30 rounded-full overflow-hidden">
                                                    <div class="h-full bg-current rounded-full transition-all duration-300"
                                                        :style="{ width: `${runningGame?.totalMods ? (runningGame.loadedMods / runningGame.totalMods) * 100 : 10}%` }" />
                                                </div>
                                                <span class="text-xs font-mono opacity-75">
                                                    {{ Math.round(runningGame?.totalMods ? (runningGame.loadedMods /
                                                        runningGame.totalMods) * 100 : 0) }}%
                                                </span>
                                            </div>

                                            <!-- Runtime -->
                                            <div v-if="runningGame?.status === 'running'"
                                                class="text-xs opacity-75 font-mono">
                                                {{ formatRuntime(runningGame?.startTime) }}
                                            </div>

                                            <!-- Action Buttons -->
                                            <div class="flex items-center gap-2">
                                                <button @click="showLogConsole = !showLogConsole"
                                                    class="p-1.5 rounded-md hover:bg-black/20 transition-colors"
                                                    :title="showLogConsole ? 'Hide Logs' : 'Show Logs'">
                                                    <Icon name="Terminal" class="w-4 h-4" />
                                                </button>
                                                <button v-if="runningGame?.gamePid" @click="handleKillGame"
                                                    class="p-1.5 rounded-md hover:bg-red-500/30 text-red-300 transition-colors"
                                                    title="Stop Game">
                                                    <Icon name="Square" class="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Log Console -->
                                    <div v-if="showLogConsole" class="log-console">
                                        <div class="log-console-header">
                                            <div class="flex items-center gap-3">
                                                <div class="flex items-center gap-2">
                                                    <Icon name="Terminal" class="w-4 h-4 text-muted-foreground" />
                                                    <span class="text-sm font-medium">Game Logs</span>
                                                </div>
                                                <!-- Log Level Filters -->
                                                <div class="flex items-center gap-1">
                                                    <button @click="logLevelFilter = 'all'"
                                                        class="px-2 py-0.5 text-[10px] rounded transition-colors"
                                                        :class="logLevelFilter === 'all'
                                                            ? 'bg-muted text-foreground'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'">
                                                        All ({{ gameLogs.length }})
                                                    </button>
                                                    <button @click="logLevelFilter = 'info'"
                                                        class="px-2 py-0.5 text-[10px] rounded transition-colors flex items-center gap-1"
                                                        :class="logLevelFilter === 'info'
                                                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'">
                                                        Info
                                                        <span v-if="logLevelCounts.info > 0" class="opacity-70">{{
                                                            logLevelCounts.info }}</span>
                                                    </button>
                                                    <button @click="logLevelFilter = 'warn'"
                                                        class="px-2 py-0.5 text-[10px] rounded transition-colors flex items-center gap-1"
                                                        :class="logLevelFilter === 'warn'
                                                            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'">
                                                        Warn
                                                        <span v-if="logLevelCounts.warn > 0" class="opacity-70">{{
                                                            logLevelCounts.warn }}</span>
                                                    </button>
                                                    <button @click="logLevelFilter = 'error'"
                                                        class="px-2 py-0.5 text-[10px] rounded transition-colors flex items-center gap-1"
                                                        :class="logLevelFilter === 'error'
                                                            ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'">
                                                        Error
                                                        <span v-if="logLevelCounts.error > 0" class="opacity-70">{{
                                                            logLevelCounts.error }}</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <button @click="gameLogs = []; logLevelFilter = 'all'"
                                                class="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                                Clear
                                            </button>
                                        </div>
                                        <div ref="logScrollRef" class="log-console-content">
                                            <div v-if="filteredGameLogs.length === 0" class="log-empty">
                                                <span class="text-muted-foreground text-sm">{{ gameLogs.length === 0 ?
                                                    'Waiting for logs...' : 'No logs match the current filter' }}</span>
                                            </div>
                                            <div v-for="(log, index) in filteredGameLogs" :key="index" class="log-line"
                                                :class="`log-${log.level.toLowerCase()}`">
                                                <span class="log-time">{{ log.time }}</span>
                                                <span class="log-level">{{ log.level }}</span>
                                                <span class="log-message">{{ log.message }}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Quick Info Card -->
                                    <div class="game-info-card">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-4">
                                                <div v-if="runningGame?.status === 'loading_mods'" class="info-stat">
                                                    <Icon name="Package" class="w-4 h-4 text-amber-400" />
                                                    <span>{{ runningGame?.loadedMods || 0 }}/{{ runningGame?.totalMods
                                                        || '?' }} mods</span>
                                                </div>
                                                <div v-else-if="runningGame?.status === 'running'"
                                                    class="info-stat text-green-400">
                                                    <Icon name="CheckCircle" class="w-4 h-4" />
                                                    <span>Ready to play</span>
                                                </div>
                                                <div class="info-stat text-muted-foreground">
                                                    <span>PID: {{ runningGame?.gamePid || 'N/A' }}</span>
                                                </div>
                                            </div>
                                            <button @click="handleCloseAfterLaunch"
                                                class="text-sm text-primary hover:text-primary/80 transition-colors">
                                                Close Dialog
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Normal Play State -->
                                <template v-else>
                                    <div class="play-ready-container">
                                        <!-- Main Play Section -->
                                        <div class="play-main-section">
                                            <!-- Play Button -->
                                            <button @click="handleLaunch()"
                                                :disabled="instance.state !== 'ready' || isLaunching"
                                                class="play-button-new">
                                                <div class="play-button-inner">
                                                    <Icon v-if="isLaunching" name="Loader2"
                                                        class="w-10 h-10 animate-spin" />
                                                    <Icon v-else name="Play" class="w-10 h-10" />
                                                </div>
                                            </button>

                                            <!-- Play Info -->
                                            <div class="play-info">
                                                <h3 class="text-lg font-semibold">
                                                    {{ isLaunching ? "Launching..." : "Ready to Play" }}
                                                </h3>
                                                <p class="text-sm text-muted-foreground">
                                                    {{ stats?.modCount || 0 }} mods • {{ props.loader || 'Forge' }} {{
                                                        props.minecraftVersion }}
                                                </p>
                                            </div>
                                        </div>

                                        <!-- Settings Toggle -->
                                        <button @click="showSettings = !showSettings" class="settings-toggle"
                                            :class="{ 'settings-toggle-active': showSettings }">
                                            <Icon name="Sliders" class="w-4 h-4" />
                                            <span>Settings</span>
                                            <Icon name="ChevronDown" class="w-4 h-4 transition-transform"
                                                :class="{ 'rotate-180': showSettings }" />
                                        </button>

                                        <!-- Settings Panel -->
                                        <div v-if="showSettings" class="settings-panel">
                                            <!-- Memory Settings -->
                                            <div class="settings-group">
                                                <div class="settings-group-header">
                                                    <Icon name="MemoryStick" class="w-4 h-4 text-primary" />
                                                    <span>Memory (RAM)</span>
                                                </div>
                                                <div class="memory-sliders">
                                                    <div class="memory-row">
                                                        <label class="text-xs text-muted-foreground w-12">Min</label>
                                                        <input type="range" v-model.number="memoryMin" min="1024"
                                                            max="16384" step="512" class="flex-1 accent-primary" />
                                                        <span class="text-sm font-mono w-16 text-right">{{ (memoryMin /
                                                            1024).toFixed(1) }}G</span>
                                                    </div>
                                                    <div class="memory-row">
                                                        <label class="text-xs text-muted-foreground w-12">Max</label>
                                                        <input type="range" v-model.number="memoryMax" min="1024"
                                                            max="16384" step="512" class="flex-1 accent-primary" />
                                                        <span class="text-sm font-mono w-16 text-right">{{ (memoryMax /
                                                            1024).toFixed(1) }}G</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- JVM Arguments -->
                                            <div class="settings-group">
                                                <div class="settings-group-header">
                                                    <Icon name="Cpu" class="w-4 h-4 text-primary" />
                                                    <span>JVM Arguments</span>
                                                </div>
                                                <textarea v-model="customJavaArgs"
                                                    placeholder="Additional JVM arguments (e.g., -XX:+UseG1GC)"
                                                    class="settings-textarea" rows="2" />
                                                <p class="text-xs text-muted-foreground mt-1">
                                                    These will be added to the default launcher arguments
                                                </p>
                                            </div>

                                            <!-- Save Button -->
                                            <button @click="saveInstanceSettings" class="settings-save-btn">
                                                <Icon name="Save" class="w-4 h-4" />
                                                Save Settings
                                            </button>
                                        </div>

                                        <!-- Loader Installation Progress -->
                                        <div v-if="loaderProgress" class="loader-progress-card">
                                            <div class="flex items-center gap-3 mb-2">
                                                <Icon name="Download" class="w-5 h-5 text-blue-400 animate-pulse" />
                                                <span class="font-medium text-blue-300">Installing Mod Loader</span>
                                            </div>
                                            <div class="progress-bar-container">
                                                <div class="progress-bar-fill"
                                                    :style="{ width: `${(loaderProgress.current / loaderProgress.total) * 100}%` }" />
                                            </div>
                                            <p class="text-xs text-muted-foreground mt-2">
                                                {{ loaderProgress.detail }}
                                            </p>
                                        </div>

                                        <!-- Instance Info Footer -->
                                        <div class="play-footer">
                                            <div class="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span class="flex items-center gap-1">
                                                    <Icon name="Shield" class="w-3 h-3" />
                                                    Isolated instance
                                                </span>
                                                <span class="flex items-center gap-1">
                                                    <Icon name="HardDrive" class="w-3 h-3" />
                                                    {{ stats?.totalSize || 'N/A' }}
                                                </span>
                                            </div>
                                        </div>

                                        <div v-if="instance.state !== 'ready'" class="warning-card">
                                            <Icon name="AlertCircle" class="w-5 h-5 text-yellow-400" />
                                            <p class="text-sm text-yellow-300">
                                                Instance is currently {{ instance.state }}. Please wait...
                                            </p>
                                        </div>
                                    </div>
                                </template>
                            </div>

                            <!-- Sync Tab -->
                            <div v-if="activeTab === 'sync'" class="space-y-4">
                                <!-- Sync Status Banner -->
                                <div v-if="syncStatus?.needsSync"
                                    class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                                    <div class="flex items-center gap-3 mb-3">
                                        <Icon name="AlertCircle" class="w-5 h-5 text-amber-400" />
                                        <span class="font-medium text-amber-300">Instance is out of sync</span>
                                        <span class="ml-auto text-sm text-amber-400/80">
                                            {{ syncStatus.totalDifferences }} difference(s)
                                        </span>
                                    </div>

                                    <!-- Detailed differences -->
                                    <div class="space-y-3 text-sm">
                                        <!-- Missing in Instance -->
                                        <div v-if="syncStatus.missingInInstance.length" class="space-y-1">
                                            <div class="flex items-center gap-2 text-amber-400">
                                                <Icon name="Download" class="w-4 h-4" />
                                                <span class="font-medium">Missing in instance ({{
                                                    syncStatus.missingInInstance.length }})</span>
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.missingInInstance.slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Icon v-if="item.type === 'mod'" name="Package" class="w-3 h-3" />
                                                    <Icon v-else-if="item.type === 'resourcepack'" name="Palette"
                                                        class="w-3 h-3" />
                                                    <Icon v-else-if="item.type === 'shader'" name="Sun"
                                                        class="w-3 h-3" />
                                                    <span class="truncate">{{ item.filename }}</span>
                                                </div>
                                                <div v-if="syncStatus.missingInInstance.length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{ syncStatus.missingInInstance.length - 5 }} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Updates to Apply -->
                                        <div v-if="syncStatus.updatesToApply?.length" class="space-y-1">
                                            <div class="flex items-center gap-2 text-orange-400">
                                                <Icon name="RefreshCw" class="w-4 h-4" />
                                                <span class="font-medium">Updates available ({{
                                                    syncStatus.updatesToApply.length }})</span>
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.updatesToApply.slice(0, 5)"
                                                    :key="item.newFilename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Icon v-if="item.type === 'resourcepack'" name="Palette"
                                                        class="w-3 h-3" />
                                                    <Icon v-else-if="item.type === 'shader'" name="Sun"
                                                        class="w-3 h-3" />
                                                    <Icon v-else name="Package" class="w-3 h-3" />
                                                    <span class="truncate line-through opacity-60">{{ item.oldFilename
                                                    }}</span>
                                                    <span class="text-orange-400">→</span>
                                                    <span class="truncate text-orange-400">{{ item.newFilename }}</span>
                                                    <span v-if="item.willBeDisabled"
                                                        class="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-semibold uppercase">disabled</span>
                                                </div>
                                                <div v-if="syncStatus.updatesToApply.length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{ syncStatus.updatesToApply.length - 5 }} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Extra Mods in Instance (will be REMOVED) -->
                                        <div v-if="syncStatus.extraInInstance.filter(i => i.type === 'mod').length"
                                            class="space-y-1">
                                            <div class="flex items-center gap-2 text-red-400">
                                                <Icon name="Trash2" class="w-4 h-4" />
                                                <span class="font-medium">Mods to remove ({{
                                                    syncStatus.extraInInstance.filter(i => i.type === 'mod').length
                                                    }})</span>
                                            </div>
                                            <div class="ml-6 text-xs text-muted-foreground/80 mb-1">
                                                These mods are not in the modpack and will be removed during sync.
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.extraInInstance.filter(i => i.type === 'mod').slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Icon name="Package" class="w-3 h-3" />
                                                    <span class="truncate">{{ item.filename }}</span>
                                                </div>
                                                <div v-if="syncStatus.extraInInstance.filter(i => i.type === 'mod').length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{syncStatus.extraInInstance.filter(i => i.type ===
                                                        'mod').length - 5}} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Extra Resourcepacks/Shaders (will be preserved) -->
                                        <div v-if="syncStatus.extraInInstance.filter(i => i.type !== 'mod').length"
                                            class="space-y-1">
                                            <div class="flex items-center gap-2 text-blue-400">
                                                <Icon name="Package" class="w-4 h-4" />
                                                <span class="font-medium">Extra files ({{
                                                    syncStatus.extraInInstance.filter(i => i.type !== 'mod').length
                                                    }})</span>
                                            </div>
                                            <div class="ml-6 text-xs text-muted-foreground/80 mb-1">
                                                These files will be preserved.
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.extraInInstance.filter(i => i.type !== 'mod').slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Icon v-if="item.type === 'resourcepack'" name="Palette"
                                                        class="w-3 h-3" />
                                                    <Icon v-else-if="item.type === 'shader'" name="Sun"
                                                        class="w-3 h-3" />
                                                    <Icon v-else name="Package" class="w-3 h-3" />
                                                    <span class="truncate">{{ item.filename }}</span>
                                                </div>
                                                <div v-if="syncStatus.extraInInstance.filter(i => i.type !== 'mod').length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{syncStatus.extraInInstance.filter(i => i.type !==
                                                        'mod').length - 5}} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Disabled State Mismatch -->
                                        <div v-if="syncStatus.disabledMismatch.length" class="space-y-1">
                                            <div class="flex items-center gap-2 text-orange-400">
                                                <Icon name="Settings" class="w-4 h-4" />
                                                <span class="font-medium">Wrong enabled/disabled state ({{
                                                    syncStatus.disabledMismatch.length }})</span>
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.disabledMismatch.slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <span class="truncate">{{ item.filename }}</span>
                                                    <span class="text-orange-400/80">({{ item.issue }})</span>
                                                </div>
                                                <div v-if="syncStatus.disabledMismatch.length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{ syncStatus.disabledMismatch.length - 5 }} more
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Quick Sync Button -->
                                    <div class="mt-4 pt-3 border-t border-amber-500/20">
                                        <Button @click="handleSyncInstance" :disabled="isSyncing" variant="outline"
                                            class="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/20">
                                            <Icon name="RefreshCw"
                                                :class="['w-4 h-4 mr-2', isSyncing && 'animate-spin']" />
                                            Sync Now to Resolve Differences
                                        </Button>
                                    </div>
                                </div>
                                <div v-else-if="syncStatus && !syncStatus.needsSync"
                                    class="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                                    <div class="flex items-center gap-3">
                                        <Icon name="Check" class="w-5 h-5 text-green-400" />
                                        <span class="font-medium text-green-300">Instance is in sync with modpack</span>
                                    </div>
                                    <p class="text-xs text-muted-foreground mt-2 ml-8">
                                        All mods, resourcepacks, and shaders match the modpack definition.
                                    </p>
                                </div>

                                <!-- Options -->
                                <div class="options-card">
                                    <h4 class="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
                                        <Icon name="Settings" class="w-4 h-4 text-muted-foreground" />
                                        Sync Options
                                    </h4>

                                    <label class="option-item">
                                        <input type="checkbox" v-model="clearExistingMods" class="option-checkbox" />
                                        <div class="flex-1">
                                            <span class="text-sm font-medium text-foreground">Clear existing mods
                                                first</span>
                                            <p class="text-xs text-muted-foreground">Remove all mods before downloading
                                                new ones</p>
                                        </div>
                                    </label>
                                </div>

                                <!-- Config Sync Mode -->
                                <div class="options-card">
                                    <h4 class="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                                        <Icon name="FileCode" class="w-4 h-4 text-muted-foreground" />
                                        Config Handling
                                    </h4>
                                    <p class="text-xs text-muted-foreground mb-3">
                                        Choose how to handle config files from the modpack (your local changes are not
                                        tracked for sync)
                                    </p>

                                    <div class="grid gap-2">
                                        <label
                                            :class="['config-option', configSyncMode === 'new_only' && 'config-option-active config-option-primary']">
                                            <input type="radio" v-model="configSyncMode" value="new_only"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Only add new
                                                    configs</span>
                                                <p class="text-xs text-muted-foreground">Add configs for new mods, keep
                                                    existing</p>
                                            </div>
                                            <Icon v-if="configSyncMode === 'new_only'" name="CheckCircle"
                                                class="w-4 h-4 text-primary" />
                                        </label>

                                        <label
                                            :class="['config-option', configSyncMode === 'overwrite' && 'config-option-active config-option-warning']">
                                            <input type="radio" v-model="configSyncMode" value="overwrite"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Overwrite all
                                                    configs</span>
                                                <p class="text-xs text-muted-foreground">Reset all configs to modpack
                                                    defaults</p>
                                            </div>
                                            <Icon v-if="configSyncMode === 'overwrite'" name="AlertCircle"
                                                class="w-4 h-4 text-orange-400" />
                                        </label>

                                        <label
                                            :class="['config-option', configSyncMode === 'skip' && 'config-option-active']">
                                            <input type="radio" v-model="configSyncMode" value="skip"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Skip configs</span>
                                                <p class="text-xs text-muted-foreground">Only sync mods, ignore configs
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <!-- Sync Progress -->
                                <div v-if="syncProgress && isSyncing" class="progress-card">
                                    <div class="flex items-center gap-4 mb-3">
                                        <div class="progress-icon">
                                            <Icon name="Loader2" class="w-6 h-6 text-primary animate-spin" />
                                        </div>
                                        <div class="flex-1">
                                            <div class="flex items-center justify-between mb-1">
                                                <span class="font-medium text-foreground">{{ syncProgress.stage
                                                }}</span>
                                                <span class="text-sm font-mono text-primary">{{ progressPercent
                                                }}%</span>
                                            </div>
                                            <div class="text-xs text-muted-foreground">
                                                {{ syncProgress.current }} / {{ syncProgress.total }}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="progress-bar">
                                        <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
                                    </div>
                                    <p v-if="syncProgress.item" class="text-xs text-muted-foreground mt-2 truncate">
                                        {{ syncProgress.item }}
                                    </p>
                                </div>

                                <!-- Sync Result -->
                                <div v-if="syncResult"
                                    :class="['result-card', syncResult.success ? 'result-success' : 'result-error']">
                                    <div class="flex items-center gap-3 mb-4">
                                        <div
                                            :class="['result-icon', syncResult.success ? 'result-icon-success' : 'result-icon-error']">
                                            <Icon v-if="syncResult.success" name="CheckCircle"
                                                class="w-5 h-5 text-green-400" />
                                            <Icon v-else name="XCircle" class="w-5 h-5 text-red-400" />
                                        </div>
                                        <span
                                            :class="['font-medium', syncResult.success ? 'text-green-400' : 'text-red-400']">
                                            {{ syncResult.success ? "Sync Complete!" : "Sync Failed" }}
                                        </span>
                                    </div>

                                    <div class="grid grid-cols-4 gap-2">
                                        <div class="stat-box">
                                            <div class="text-lg font-bold text-foreground">{{ syncResult.modsDownloaded
                                            }}</div>
                                            <div class="stat-label">Downloaded</div>
                                        </div>
                                        <div class="stat-box">
                                            <div class="text-lg font-bold text-foreground">{{ syncResult.modsSkipped }}
                                            </div>
                                            <div class="stat-label">Skipped</div>
                                        </div>
                                        <div class="stat-box">
                                            <div class="text-lg font-bold text-foreground">{{ syncResult.configsCopied
                                            }}</div>
                                            <div class="stat-label">Configs</div>
                                        </div>
                                        <div class="stat-box">
                                            <div class="text-lg font-bold text-foreground">{{ syncResult.configsSkipped
                                                || 0 }}</div>
                                            <div class="stat-label">Preserved</div>
                                        </div>
                                    </div>

                                    <div v-if="syncResult.errors.length > 0" class="error-notice">
                                        <Icon name="AlertCircle" class="w-3 h-3 inline mr-1" />
                                        {{ syncResult.errors.length }} errors occurred
                                    </div>

                                    <!-- Warnings -->
                                    <div v-if="syncResult.warnings && syncResult.warnings.length > 0"
                                        class="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                        <div class="flex items-start gap-2">
                                            <Icon name="AlertCircle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                            <div class="space-y-1 text-sm">
                                                <div v-for="(warning, idx) in syncResult.warnings" :key="idx"
                                                    class="text-amber-400">
                                                    {{ warning }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Sync Button -->
                                <Button @click="handleSyncInstance" :disabled="isSyncing" class="w-full gap-2">
                                    <Icon v-if="isSyncing" name="Loader2" class="w-4 h-4 animate-spin" />
                                    <Icon v-else name="RefreshCw" class="w-4 h-4" />
                                    {{ isSyncing ? "Syncing..." : "Sync Now" }}
                                </Button>
                            </div>

                            <!-- Configs Tab -->
                            <div v-if="activeTab === 'configs'" class="config-browser-container">
                                <ConfigBrowser v-if="instance" :instance-id="instance.id" :instance-name="instance.name"
                                    @open-file="handleOpenConfigExternal"
                                    @open-structured="handleOpenStructuredEditor" />
                            </div>

                            <!-- Folders Tab -->
                            <div v-if="activeTab === 'folders'" class="space-y-4">
                                <p class="text-sm text-muted-foreground flex items-center gap-2">
                                    <Icon name="FolderOpen" class="w-4 h-4" />
                                    Quick access to instance folders
                                </p>

                                <div class="grid grid-cols-2 gap-3">
                                    <!-- Root Folder -->
                                    <button @click="handleOpenFolder()" class="folder-button-main group">
                                        <div class="folder-icon-main">
                                            <Icon name="FolderOpen" class="w-6 h-6" />
                                        </div>
                                        <div class="text-left flex-1">
                                            <div class="font-medium text-foreground">Instance Root</div>
                                            <div class="text-xs text-muted-foreground">Open main folder</div>
                                        </div>
                                        <Icon name="ChevronRight"
                                            class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </button>

                                    <!-- Other Folders -->
                                    <button v-for="folder in folderItems" :key="folder.id"
                                        @click="handleOpenFolder(folder.id)"
                                        :class="['folder-button group', folder.colorClass]">
                                        <div class="folder-icon">
                                            <Icon :name="folder.icon" class="w-5 h-5" />
                                        </div>
                                        <div class="text-left flex-1 min-w-0">
                                            <div class="font-medium text-foreground text-sm">{{ folder.label }}</div>
                                            <div class="text-xs text-muted-foreground truncate">{{ folder.desc }}</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>

    <!-- Structured Config Editor Fullscreen -->
    <div v-if="showStructuredEditor"
        class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
        <div
            class="bg-background border border-border/50 rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <!-- Editor Header -->
            <div class="shrink-0 border-b border-border/50 bg-card/50 px-4 py-3 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Icon name="Settings" class="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                        <h3 class="font-semibold text-foreground">Editor Configurazione</h3>
                        <p class="text-xs text-muted-foreground">{{ structuredEditorFile?.name }}</p>
                    </div>
                </div>
                <button @click="handleCloseStructuredEditor"
                    class="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <!-- Editor Content -->
            <div class="flex-1 overflow-hidden">
                <ConfigStructuredEditor v-if="instance && structuredEditorFile" :instance-id="instance.id"
                    :config-path="structuredEditorFile.path" :refresh-key="configRefreshKey"
                    @close="handleCloseStructuredEditor" @saved="handleCloseStructuredEditor" />
            </div>
        </div>
    </div>

    <!-- Sync Confirmation Dialog -->
    <div v-if="showSyncConfirmDialog"
        class="fixed inset-0 z-[70] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div
            class="bg-card border border-border/50 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border/50 bg-gradient-to-r from-amber-500/10 to-transparent">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Icon name="AlertCircle" class="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 class="font-semibold text-foreground">Sync prima di Avviare?</h3>
                        <p class="text-sm text-muted-foreground">L'istanza non è sincronizzata</p>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div class="px-5 py-4 space-y-3">
                <p class="text-sm text-muted-foreground">
                    Sono state rilevate
                    <span class="font-medium text-foreground">{{ pendingLaunchData?.differences || 0 }}
                        differenze</span>
                    tra il modpack e l'istanza di gioco.
                </p>

                <div v-if="pendingLaunchData?.lastSynced"
                    class="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Icon name="Clock" class="w-3.5 h-3.5" />
                    Ultimo sync: {{ formatDate(pendingLaunchData.lastSynced) }}
                </div>

                <div class="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div class="flex items-start gap-2">
                        <Icon name="Download" class="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <div class="text-sm">
                            <span class="text-foreground font-medium">Sincronizza</span>
                            <span class="text-muted-foreground"> - Aggiorna le mod prima di avviare il gioco</span>
                        </div>
                    </div>
                    <div class="flex items-start gap-2">
                        <Icon name="Play" class="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <div class="text-sm">
                            <span class="text-foreground font-medium">Avvia Comunque</span>
                            <span class="text-muted-foreground"> - Gioca con le mod attuali</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="px-5 py-4 border-t border-border/50 bg-muted/20 flex gap-3">
                <button @click="handleSyncConfirmation('cancel')"
                    class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-muted/50 hover:bg-muted text-foreground transition-colors">
                    Annulla
                </button>
                <button @click="handleSyncConfirmation('skip')"
                    class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors flex items-center justify-center gap-2">
                    <Icon name="Play" class="w-4 h-4" />
                    Avvia
                </button>
                <button @click="handleSyncConfirmation('sync')"
                    class="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors flex items-center justify-center gap-2">
                    <Icon name="Download" class="w-4 h-4" />
                    Sync & Avvia
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Dialog Header */
.dialog-header {
    @apply flex items-center gap-3;
}

.header-modpack-icon {
    @apply w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.header-status-badge {
    @apply flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium;
}

.header-status-ready {
    background-color: rgb(34 197 94 / 0.15);
    color: rgb(74 222 128);
    border: 1px solid rgb(34 197 94 / 0.3);
}

.header-status-installing {
    background-color: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.header-tag {
    @apply flex items-center gap-1 px-2 py-0.5 rounded-md text-xs;
    background-color: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border) / 0.5);
}

/* Quick Stats Bar */
.quick-stats-bar {
    @apply flex items-center justify-between p-3 rounded-xl;
    background-color: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.quick-stat {
    @apply flex items-center gap-2 text-sm;
    color: hsl(var(--foreground));
}

/* Loading */
.loading-container {
    @apply flex items-center justify-center py-16;
}

.loading-icon {
    @apply w-16 h-16 rounded-2xl flex items-center justify-center mx-auto;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

/* Hero */
.hero-icon-wrapper {
    @apply relative inline-block;
}

.hero-icon {
    @apply w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-2xl;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.sparkle-icon {
    @apply absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse;
}

/* Cards */
.info-card {
    @apply p-4 rounded-xl text-center;
    background: linear-gradient(135deg, hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.3));
    border: 1px solid hsl(var(--border) / 0.5);
}

.features-card {
    @apply p-4 rounded-xl;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.02));
    border: 1px solid hsl(var(--primary) / 0.2);
}

.feature-item {
    @apply flex items-center gap-3 text-sm;
}

.feature-check {
    @apply w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0;
    background-color: rgb(34 197 94 / 0.2);
}

/* Progress */
.progress-card {
    @apply p-4 rounded-xl;
    background: linear-gradient(90deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.3);
}

.progress-icon {
    @apply w-12 h-12 rounded-xl flex items-center justify-center;
    background-color: hsl(var(--primary) / 0.2);
}

.progress-bar {
    @apply h-2 rounded-full overflow-hidden;
    background-color: hsl(var(--muted) / 0.5);
}

.progress-fill {
    @apply h-full rounded-full transition-all duration-300;
    background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7));
}

/* Tab Navigation */
.tab-nav {
    @apply flex gap-1 p-1 rounded-xl;
    background-color: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.tab-btn {
    @apply flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all;
    color: hsl(var(--muted-foreground));
}

.tab-btn:hover:not(.tab-active) {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted) / 0.5);
}

.tab-active {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    border: 1px solid hsl(var(--border) / 0.5);
}

/* Play Tab Content */
.play-tab-content {
    @apply flex flex-col items-center justify-center py-8;
}

/* Game Running Container - New Design */
.game-running-container {
    @apply w-full flex flex-col gap-3;
}

/* Status Bar */
.game-status-bar {
    @apply flex items-center justify-between px-4 py-3 rounded-xl transition-colors;
}

.game-status-bar.status-launching {
    @apply bg-blue-500/20 text-blue-300;
}

.game-status-bar.status-loading {
    @apply bg-amber-500/20 text-amber-300;
}

.game-status-bar.status-running {
    @apply bg-green-500/20 text-green-300;
}

.status-icon-container {
    @apply w-8 h-8 rounded-lg flex items-center justify-center bg-black/20;
}

/* Log Console */
.log-console {
    @apply rounded-xl overflow-hidden border border-border/50;
    background: hsl(var(--card) / 0.8);
}

.log-console-header {
    @apply flex items-center justify-between px-4 py-2 border-b border-border/50;
    background: hsl(var(--muted) / 0.3);
}

.log-console-content {
    @apply h-48 overflow-y-auto font-mono text-xs p-3 space-y-0.5;
    background: hsl(0 0% 5%);
}

.log-empty {
    @apply h-full flex items-center justify-center;
}

.log-line {
    @apply flex gap-2 py-0.5 hover:bg-muted/30 px-1 rounded;
}

.log-time {
    @apply text-muted-foreground shrink-0;
    min-width: 65px;
}

.log-level {
    @apply font-medium shrink-0;
    min-width: 45px;
}

.log-message {
    @apply text-foreground/90 break-all;
}

.log-info .log-level {
    @apply text-blue-400;
}

.log-warn .log-level {
    @apply text-amber-400;
}

.log-error .log-level,
.log-fatal .log-level {
    @apply text-red-400;
}

.log-debug .log-level,
.log-trace .log-level {
    @apply text-muted-foreground;
}

/* Game Info Card */
.game-info-card {
    @apply px-4 py-3 rounded-xl;
    background: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.info-stat {
    @apply flex items-center gap-2 text-sm;
}

/* Play Ready Container - New Design */
.play-ready-container {
    @apply w-full flex flex-col gap-4;
}

.play-main-section {
    @apply flex items-center gap-6 p-6 rounded-xl;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.2);
}

.play-button-new {
    @apply w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 cursor-pointer;
    background: linear-gradient(145deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
    box-shadow: 0 4px 20px hsl(var(--primary) / 0.3);
    color: hsl(var(--primary-foreground));
}

.play-button-new:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 8px 30px hsl(var(--primary) / 0.4);
}

.play-button-new:active:not(:disabled) {
    transform: scale(0.98);
}

.play-button-new:disabled {
    @apply opacity-50 cursor-not-allowed;
}

.play-button-inner {
    @apply flex items-center justify-center;
    margin-left: 4px;
    /* Visual centering for play icon */
}

.play-info {
    @apply flex-1;
}

/* Settings Toggle */
.settings-toggle {
    @apply flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all;
    background: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
    color: hsl(var(--muted-foreground));
}

.settings-toggle:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
}

.settings-toggle-active {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
    color: hsl(var(--primary));
}

/* Settings Panel */
.settings-panel {
    @apply p-4 rounded-xl space-y-4;
    background: hsl(var(--muted) / 0.2);
    border: 1px solid hsl(var(--border) / 0.5);
}

.settings-group {
    @apply space-y-2;
}

.settings-group-header {
    @apply flex items-center gap-2 text-sm font-medium;
}

.memory-sliders {
    @apply space-y-2;
}

.memory-row {
    @apply flex items-center gap-3;
}

.settings-textarea {
    @apply w-full p-3 rounded-lg text-sm font-mono resize-none;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
}

.settings-textarea:focus {
    outline: none;
    border-color: hsl(var(--primary) / 0.5);
}

.settings-save-btn {
    @apply flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-medium transition-colors;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
}

.settings-save-btn:hover {
    background: hsl(var(--primary) / 0.9);
}

/* Play Footer */
.play-footer {
    @apply pt-3 border-t border-border/30;
}

.play-area {
    @apply flex flex-col items-center gap-4;
}

/* Play Button - Circular Design */
.play-button {
    @apply relative w-28 h-28 rounded-full transition-all duration-300 cursor-pointer;
    background: transparent;
}

.play-button-bg {
    @apply absolute inset-0 rounded-full transition-all duration-300;
    background: linear-gradient(145deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
    box-shadow:
        0 4px 20px hsl(var(--primary) / 0.3),
        inset 0 1px 0 hsl(var(--primary-foreground) / 0.1);
}

.play-button-content {
    @apply absolute inset-0 flex items-center justify-center;
    color: hsl(var(--primary-foreground));
}

.play-icon-wrapper {
    @apply transition-transform duration-200;
    margin-left: 4px;
    /* Visual centering for play icon */
}

.play-button-ring {
    @apply absolute -inset-1.5 rounded-full transition-all duration-300 opacity-0;
    border: 2px solid hsl(var(--primary) / 0.5);
}

.play-button:hover:not(:disabled) .play-button-bg {
    transform: scale(1.02);
    box-shadow:
        0 8px 30px hsl(var(--primary) / 0.4),
        inset 0 1px 0 hsl(var(--primary-foreground) / 0.15);
}

.play-button:hover:not(:disabled) .play-icon-wrapper {
    transform: scale(1.1);
}

.play-button:hover:not(:disabled) .play-button-ring {
    @apply opacity-100;
    animation: pulse-ring 1.5s ease-out infinite;
}

.play-button:active:not(:disabled) .play-button-bg {
    transform: scale(0.98);
}

.play-button:disabled {
    @apply cursor-not-allowed;
}

.play-button:disabled .play-button-bg {
    @apply opacity-40;
    box-shadow: none;
}

.play-label {
    @apply text-center;
}

.play-label-text {
    @apply block text-lg font-semibold;
    color: hsl(var(--foreground));
}

.play-label-hint {
    @apply block text-xs;
    color: hsl(var(--muted-foreground));
}

@keyframes pulse-ring {
    0% {
        transform: scale(1);
        opacity: 0.6;
    }

    100% {
        transform: scale(1.15);
        opacity: 0;
    }
}

/* Loader Progress Card */
.loader-progress-card {
    @apply w-full max-w-sm p-4 rounded-xl mt-6;
    background: linear-gradient(145deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05));
    border: 1px solid hsl(var(--primary) / 0.2);
}

.progress-bar-container {
    @apply w-full h-2 rounded-full overflow-hidden;
    background: hsl(var(--muted) / 0.3);
}

.progress-bar-fill {
    @apply h-full rounded-full transition-all duration-300;
    background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
}

/* Warning */
.warning-card {
    @apply flex items-center gap-3 p-3 rounded-xl mt-6;
    background-color: rgb(234 179 8 / 0.1);
    border: 1px solid rgb(234 179 8 / 0.3);
}

/* Options */
.options-card {
    @apply p-4 rounded-xl;
    background-color: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.option-item {
    @apply flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors;
}

.option-item:hover {
    background-color: hsl(var(--muted) / 0.5);
}

.option-checkbox {
    @apply w-4 h-4 rounded;
    border-color: hsl(var(--border));
    background-color: hsl(var(--muted));
    accent-color: hsl(var(--primary));
}

.option-radio {
    @apply w-4 h-4;
    accent-color: hsl(var(--primary));
}

.config-option {
    @apply flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all;
    border: 1px solid transparent;
}

.config-option:hover {
    background-color: hsl(var(--muted) / 0.5);
}

.config-option-active {
    border-color: hsl(var(--border));
    background-color: hsl(var(--muted) / 0.5);
}

.config-option-primary.config-option-active {
    border-color: hsl(var(--primary) / 0.4);
    background-color: hsl(var(--primary) / 0.1);
}

.config-option-warning.config-option-active {
    border-color: rgb(249 115 22 / 0.4);
    background-color: rgb(249 115 22 / 0.1);
}

/* Results */
.result-card {
    @apply p-4 rounded-xl;
}

.result-success {
    background-color: rgb(34 197 94 / 0.1);
    border: 1px solid rgb(34 197 94 / 0.3);
}

.result-error {
    background-color: rgb(239 68 68 / 0.1);
    border: 1px solid rgb(239 68 68 / 0.3);
}

.result-icon {
    @apply w-10 h-10 rounded-xl flex items-center justify-center;
}

.result-icon-success {
    background-color: rgb(34 197 94 / 0.2);
}

.result-icon-error {
    background-color: rgb(239 68 68 / 0.2);
}

.stat-box {
    @apply p-3 rounded-lg text-center;
    background-color: hsl(var(--background) / 0.5);
}

.stat-label {
    @apply text-[10px] uppercase tracking-wide;
    color: hsl(var(--muted-foreground));
}

.error-notice {
    @apply mt-3 p-2 rounded-lg text-xs;
    background-color: rgb(239 68 68 / 0.1);
    color: rgb(248 113 113);
}

/* Config Browser Container */
.config-browser-container {
    @apply flex-1 -mx-6 -mb-4 min-h-[450px];
    border-top: 1px solid hsl(var(--border) / 0.5);
}

/* Folder Buttons */
.folder-button-main {
    @apply col-span-2 flex items-center gap-4 p-4 rounded-xl transition-all;
    background: linear-gradient(90deg, hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.3));
    border: 1px solid hsl(var(--border) / 0.5);
}

.folder-button-main:hover {
    border-color: hsl(var(--primary) / 0.3);
}

.folder-icon-main {
    @apply w-12 h-12 rounded-xl flex items-center justify-center transition-colors;
    background-color: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
}

.folder-button-main:hover .folder-icon-main {
    background-color: hsl(var(--primary) / 0.2);
    color: hsl(var(--primary));
}

.folder-button {
    @apply flex items-center gap-3 p-3 rounded-xl transition-all;
    background-color: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
}

.folder-icon {
    @apply w-10 h-10 rounded-lg flex items-center justify-center transition-colors;
}

/* Folder Color Variants */
.folder-orange .folder-icon {
    background-color: rgb(249 115 22 / 0.1);
    color: rgb(251 146 60);
}

.folder-orange:hover {
    border-color: rgb(249 115 22 / 0.3);
}

.folder-orange:hover .folder-icon {
    background-color: rgb(249 115 22 / 0.2);
}

.folder-blue .folder-icon {
    background-color: rgb(59 130 246 / 0.1);
    color: rgb(96 165 250);
}

.folder-blue:hover {
    border-color: rgb(59 130 246 / 0.3);
}

.folder-blue:hover .folder-icon {
    background-color: rgb(59 130 246 / 0.2);
}

.folder-green .folder-icon {
    background-color: rgb(34 197 94 / 0.1);
    color: rgb(74 222 128);
}

.folder-green:hover {
    border-color: rgb(34 197 94 / 0.3);
}

.folder-green:hover .folder-icon {
    background-color: rgb(34 197 94 / 0.2);
}

.folder-purple .folder-icon {
    background-color: rgb(168 85 247 / 0.1);
    color: rgb(192 132 252);
}

.folder-purple:hover {
    border-color: rgb(168 85 247 / 0.3);
}

.folder-purple:hover .folder-icon {
    background-color: rgb(168 85 247 / 0.2);
}

.folder-yellow .folder-icon {
    background-color: rgb(234 179 8 / 0.1);
    color: rgb(250 204 21);
}

.folder-yellow:hover {
    border-color: rgb(234 179 8 / 0.3);
}

.folder-yellow:hover .folder-icon {
    background-color: rgb(234 179 8 / 0.2);
}

.folder-pink .folder-icon {
    background-color: rgb(236 72 153 / 0.1);
    color: rgb(244 114 182);
}

.folder-pink:hover {
    border-color: rgb(236 72 153 / 0.3);
}

.folder-pink:hover .folder-icon {
    background-color: rgb(236 72 153 / 0.2);
}

/* Structured Editor Container */
.structured-editor-container {
    @apply min-h-[500px] max-h-[70vh];
}

/* Game Running State */
.game-running-state {
    @apply flex-1 flex flex-col items-center justify-center py-6;
}

.game-status-header {
    @apply flex items-center justify-center;
}

.game-status-icon {
    @apply w-20 h-20 rounded-full flex items-center justify-center;
    border: 2px solid currentColor;
    transition: all 0.3s ease;
}

.game-status-icon.launching {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.05) 100%);
    border-color: rgba(59, 130, 246, 0.5);
    animation: pulse-blue 2s ease-in-out infinite;
}

.game-status-icon.loading {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%);
    border-color: rgba(245, 158, 11, 0.5);
    animation: pulse-amber 2s ease-in-out infinite;
}

.game-status-icon.running {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.05) 100%);
    border-color: rgba(34, 197, 94, 0.5);
    animation: pulse-green 2s ease-in-out infinite;
}

@keyframes pulse-blue {

    0%,
    100% {
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
    }

    50% {
        box-shadow: 0 0 40px rgba(59, 130, 246, 0.5);
    }
}

@keyframes pulse-amber {

    0%,
    100% {
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
    }

    50% {
        box-shadow: 0 0 40px rgba(245, 158, 11, 0.5);
    }
}

@keyframes pulse-green {

    0%,
    100% {
        box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
    }

    50% {
        box-shadow: 0 0 40px rgba(34, 197, 94, 0.5);
    }
}

.mod-loading-progress {
    @apply w-full max-w-sm;
}

.progress-bar-fill.mod-progress {
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.8), rgba(245, 158, 11, 1));
}

.game-running-info {
    @apply text-center;
}

.loading-tips {
    border: 1px solid rgba(251, 191, 36, 0.2);
    max-width: 20rem;
}
</style>
