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

import { ref, computed, watch, onMounted } from "vue";
import {
    Play,
    Loader2,
    CheckCircle,
    XCircle,
    Package,
    FolderOpen,
    Download,
    RefreshCw,
    Settings,
    AlertCircle,
    Clock,
    HardDrive,
    FileCode,
    Box,
    Gamepad2,
    Palette,
    Sun,
    Save,
    Image,
    Sparkles,
    Layers,
    Rocket,
    ChevronRight,
    Shield,
    Check,
} from "lucide-vue-next";
import { useInstances } from "@/composables/useInstances";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import ConfigBrowser from "@/components/configs/ConfigBrowser.vue";
import ConfigStructuredEditor from "@/components/configs/ConfigStructuredEditor.vue";
import type { ModexInstance, InstanceSyncResult, ConfigFile } from "@/types";

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
    getInstanceByModpack,
    createFromModpack,
    syncModpackToInstance,
    launchInstance,
    openInstanceFolder,
    getInstanceStats,
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
    configDifferences: number;
    totalDifferences: number;
} | null>(null);

// Structured Config Editor State
const showStructuredEditor = ref(false);
const structuredEditorFile = ref<ConfigFile | null>(null);

// Sync Options
const clearExistingMods = ref(false);
const configSyncMode = ref<"overwrite" | "new_only" | "skip">("new_only");

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

            // Check sync status
            try {
                syncStatus.value = await window.api.instances.checkSyncStatus(instance.value.id, props.modpackId);
            } catch (err) {
                console.error("Failed to check sync status:", err);
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
                ? "(configs skipped)"
                : `${result.configsCopied} configs (${result.configsSkipped} preserved)`;
            success(
                "Sync Complete",
                `${result.modsDownloaded} mods updated, ${configMsg}`
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

// Launch instance
async function handleLaunch() {
    if (!instance.value) return;

    isLaunching.value = true;
    try {
        const result = await launchInstance(instance.value.id);

        if (result.success) {
            success("Launching Minecraft", `Starting ${instance.value.name}...`);
            emit("launched", instance.value);
            emit("close");
        } else {
            showError("Launch failed", result.error || "Unknown error");
        }
    } catch (err: any) {
        showError("Launch failed", err.message);
    } finally {
        isLaunching.value = false;
    }
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
    { id: "play", label: "Play", icon: Play },
    { id: "sync", label: "Update", icon: RefreshCw },
    { id: "configs", label: "Configs", icon: Settings },
    { id: "folders", label: "Folders", icon: FolderOpen },
] as const;

// Folder items
const folderItems = computed(() => [
    { id: "mods", label: "Mods", icon: Package, colorClass: "folder-orange", desc: stats.value ? `${stats.value.modCount} files` : "Mod files" },
    { id: "config", label: "Config", icon: Settings, colorClass: "folder-blue", desc: stats.value ? `${stats.value.configCount} files` : "Settings" },
    { id: "saves", label: "Saves", icon: Save, colorClass: "folder-green", desc: "Worlds" },
    { id: "resourcepacks", label: "Resources", icon: Palette, colorClass: "folder-purple", desc: "Textures" },
    { id: "shaderpacks", label: "Shaders", icon: Sun, colorClass: "folder-yellow", desc: "Shaders" },
    { id: "screenshots", label: "Screenshots", icon: Image, colorClass: "folder-pink", desc: "Captures" },
]);

// Watch dialog open state
watch(() => props.open, async (open) => {
    if (open) {
        syncResult.value = null;
        activeTab.value = "play";
        await checkInstance();
    }
});

// Initial check
onMounted(() => {
    if (props.open) {
        checkInstance();
    }
});
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
                        <Gamepad2 v-else class="w-6 h-6 text-primary" />
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
                                <Loader2 class="w-3 h-3 animate-spin" />
                                Installing
                            </div>
                        </div>
                        <div class="flex items-center gap-3 mt-1">
                            <span class="header-tag">
                                <Box class="w-3 h-3" />
                                {{ props.minecraftVersion || "Auto" }}
                            </span>
                            <span
                                :class="['header-tag', getLoaderStyles(props.loader).text, getLoaderStyles(props.loader).border]">
                                {{ props.loader || "Forge" }}
                            </span>
                            <span v-if="stats" class="header-tag">
                                <Package class="w-3 h-3" />
                                {{ stats.modCount }} mods
                            </span>
                            <!-- Sync Status Indicator -->
                            <span v-if="syncStatus?.needsSync"
                                class="header-tag border-amber-500/30 text-amber-400 bg-amber-500/10"
                                :title="`${syncStatus.totalDifferences} difference(s) with modpack`">
                                <RefreshCw class="w-3 h-3" />
                                Needs Sync
                            </span>
                            <span v-else-if="instance && syncStatus && !syncStatus.needsSync"
                                class="header-tag border-green-500/30 text-green-400 bg-green-500/10">
                                <Check class="w-3 h-3" />
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
                            <Loader2 class="w-8 h-8 text-primary animate-spin" />
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
                                    <Rocket class="w-12 h-12 text-primary" />
                                </div>
                                <Sparkles class="sparkle-icon" />
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
                                <Package class="w-6 h-6 text-orange-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">{{ props.modCount || "?" }}</div>
                                <div class="text-xs text-muted-foreground">Mods</div>
                            </div>
                            <div class="info-card">
                                <Box class="w-6 h-6 text-blue-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">{{ props.minecraftVersion || "Auto" }}
                                </div>
                                <div class="text-xs text-muted-foreground">Version</div>
                            </div>
                            <div class="info-card">
                                <Shield class="w-6 h-6 text-green-400 mx-auto mb-2" />
                                <div class="text-lg font-bold text-foreground">Isolated</div>
                                <div class="text-xs text-muted-foreground">Safe</div>
                            </div>
                        </div>

                        <!-- Features List -->
                        <div class="features-card">
                            <h4 class="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                                <Layers class="w-4 h-4 text-primary" />
                                What's included
                            </h4>
                            <div class="space-y-2">
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <CheckCircle class="w-3.5 h-3.5 text-green-400" />
                                    </div>
                                    <span class="text-muted-foreground">Complete <span
                                            class="text-foreground font-medium">mods/</span> folder with all modpack
                                        mods</span>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <CheckCircle class="w-3.5 h-3.5 text-green-400" />
                                    </div>
                                    <span class="text-muted-foreground">Pre-configured <span
                                            class="text-foreground font-medium">config/</span> folder</span>
                                </div>
                                <div class="feature-item">
                                    <div class="feature-check">
                                        <CheckCircle class="w-3.5 h-3.5 text-green-400" />
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
                                    <Loader2 class="w-6 h-6 text-primary animate-spin" />
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
                            <Loader2 v-if="isCreating" class="w-5 h-5 animate-spin" />
                            <Rocket v-else class="w-5 h-5" />
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
                                <HardDrive class="w-4 h-4 text-muted-foreground" />
                                <span v-if="stats">{{ stats.totalSize }}</span>
                                <span v-else>—</span>
                            </div>
                            <div class="quick-stat">
                                <Clock class="w-4 h-4 text-muted-foreground" />
                                <span v-if="instance.lastPlayed">{{ formatDate(instance.lastPlayed) }}</span>
                                <span v-else>Never played</span>
                            </div>
                            <div class="quick-stat">
                                <Settings class="w-4 h-4 text-muted-foreground" />
                                <span v-if="stats">{{ stats.configCount || 0 }} configs</span>
                                <span v-else>—</span>
                            </div>
                        </div>

                        <!-- Tab Navigation -->
                        <div class="tab-nav">
                            <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                                :class="['tab-btn', activeTab === tab.id && 'tab-active']">
                                <component :is="tab.icon" class="w-4 h-4" />
                                <span class="hidden sm:inline">{{ tab.label }}</span>
                            </button>
                        </div>

                        <!-- Tab Content -->
                        <div class="flex-1 flex flex-col min-h-[350px]">
                            <!-- Play Tab -->
                            <div v-if="activeTab === 'play'" class="play-tab-content">
                                <!-- Play Button Area -->
                                <div class="play-area">
                                    <button @click="handleLaunch" :disabled="instance.state !== 'ready' || isLaunching"
                                        class="play-button">
                                        <div class="play-button-bg" />
                                        <div class="play-button-content">
                                            <div class="play-icon-wrapper">
                                                <Loader2 v-if="isLaunching" class="w-8 h-8 animate-spin" />
                                                <Play v-else class="w-8 h-8" />
                                            </div>
                                        </div>
                                        <div class="play-button-ring" />
                                    </button>
                                    <div class="play-label">
                                        <span class="play-label-text">{{ isLaunching ? "Launching..." : "Play" }}</span>
                                        <span class="play-label-hint">Click to start Minecraft</span>
                                    </div>
                                </div>

                                <!-- Info Text -->
                                <p class="text-xs text-muted-foreground text-center mt-6">
                                    Isolated instance • Your vanilla installation stays untouched
                                </p>

                                <div v-if="instance.state !== 'ready'" class="warning-card">
                                    <AlertCircle class="w-5 h-5 text-yellow-400" />
                                    <p class="text-sm text-yellow-300">
                                        Instance is currently {{ instance.state }}. Please wait...
                                    </p>
                                </div>
                            </div>

                            <!-- Sync Tab -->
                            <div v-if="activeTab === 'sync'" class="space-y-4">
                                <!-- Sync Status Banner -->
                                <div v-if="syncStatus?.needsSync"
                                    class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                                    <div class="flex items-center gap-3 mb-3">
                                        <AlertCircle class="w-5 h-5 text-amber-400" />
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
                                                <Download class="w-4 h-4" />
                                                <span class="font-medium">Missing in instance ({{
                                                    syncStatus.missingInInstance.length }})</span>
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.missingInInstance.slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Package v-if="item.type === 'mod'" class="w-3 h-3" />
                                                    <Palette v-else-if="item.type === 'resourcepack'" class="w-3 h-3" />
                                                    <Sun v-else-if="item.type === 'shader'" class="w-3 h-3" />
                                                    <span class="truncate">{{ item.filename }}</span>
                                                </div>
                                                <div v-if="syncStatus.missingInInstance.length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{ syncStatus.missingInInstance.length - 5 }} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Extra in Instance -->
                                        <div v-if="syncStatus.extraInInstance.length" class="space-y-1">
                                            <div class="flex items-center gap-2 text-blue-400">
                                                <Package class="w-4 h-4" />
                                                <span class="font-medium">Extra in instance ({{
                                                    syncStatus.extraInInstance.length }})</span>
                                            </div>
                                            <div class="ml-6 space-y-1 max-h-24 overflow-y-auto">
                                                <div v-for="item in syncStatus.extraInInstance.slice(0, 5)"
                                                    :key="item.filename"
                                                    class="flex items-center gap-2 text-muted-foreground text-xs">
                                                    <Package v-if="item.type === 'mod'" class="w-3 h-3" />
                                                    <Palette v-else-if="item.type === 'resourcepack'" class="w-3 h-3" />
                                                    <Sun v-else-if="item.type === 'shader'" class="w-3 h-3" />
                                                    <span class="truncate">{{ item.filename }}</span>
                                                </div>
                                                <div v-if="syncStatus.extraInInstance.length > 5"
                                                    class="text-xs text-muted-foreground/70">
                                                    ... and {{ syncStatus.extraInInstance.length - 5 }} more
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Disabled State Mismatch -->
                                        <div v-if="syncStatus.disabledMismatch.length" class="space-y-1">
                                            <div class="flex items-center gap-2 text-orange-400">
                                                <Settings class="w-4 h-4" />
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

                                        <!-- Config Differences -->
                                        <div v-if="syncStatus.configDifferences > 0" class="space-y-1">
                                            <div class="flex items-center gap-2 text-purple-400">
                                                <FileCode class="w-4 h-4" />
                                                <span class="font-medium">Config file differences ({{
                                                    syncStatus.configDifferences }})</span>
                                            </div>
                                            <div class="ml-6 text-muted-foreground text-xs">
                                                Some config files differ from modpack defaults
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Quick Sync Button -->
                                    <div class="mt-4 pt-3 border-t border-amber-500/20">
                                        <Button @click="handleSyncInstance" :disabled="isSyncing" variant="outline"
                                            class="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/20">
                                            <RefreshCw :class="['w-4 h-4 mr-2', isSyncing && 'animate-spin']" />
                                            Sync Now to Resolve Differences
                                        </Button>
                                    </div>
                                </div>
                                <div v-else-if="syncStatus && !syncStatus.needsSync"
                                    class="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                                    <div class="flex items-center gap-3">
                                        <Check class="w-5 h-5 text-green-400" />
                                        <span class="font-medium text-green-300">Instance is in sync with modpack</span>
                                    </div>
                                    <p class="text-xs text-muted-foreground mt-2 ml-8">
                                        All mods, resourcepacks, shaders, and configs match the modpack definition.
                                    </p>
                                </div>

                                <!-- Options -->
                                <div class="options-card">
                                    <h4 class="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
                                        <Settings class="w-4 h-4 text-muted-foreground" />
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
                                        <FileCode class="w-4 h-4 text-muted-foreground" />
                                        Config Handling
                                    </h4>

                                    <div class="grid gap-2">
                                        <label
                                            :class="['config-option', configSyncMode === 'new_only' && 'config-option-active config-option-primary']">
                                            <input type="radio" v-model="configSyncMode" value="new_only"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Only add new
                                                    configs</span>
                                                <p class="text-xs text-muted-foreground">Keeps your modifications</p>
                                            </div>
                                            <CheckCircle v-if="configSyncMode === 'new_only'"
                                                class="w-4 h-4 text-primary" />
                                        </label>

                                        <label
                                            :class="['config-option', configSyncMode === 'overwrite' && 'config-option-active config-option-warning']">
                                            <input type="radio" v-model="configSyncMode" value="overwrite"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Overwrite all
                                                    configs</span>
                                                <p class="text-xs text-muted-foreground">Reset to modpack defaults</p>
                                            </div>
                                            <AlertCircle v-if="configSyncMode === 'overwrite'"
                                                class="w-4 h-4 text-orange-400" />
                                        </label>

                                        <label
                                            :class="['config-option', configSyncMode === 'skip' && 'config-option-active']">
                                            <input type="radio" v-model="configSyncMode" value="skip"
                                                class="option-radio" />
                                            <div class="flex-1">
                                                <span class="text-sm font-medium text-foreground">Skip configs</span>
                                                <p class="text-xs text-muted-foreground">Only update mods</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <!-- Sync Progress -->
                                <div v-if="syncProgress && isSyncing" class="progress-card">
                                    <div class="flex items-center gap-4 mb-3">
                                        <div class="progress-icon">
                                            <Loader2 class="w-6 h-6 text-primary animate-spin" />
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
                                            <CheckCircle v-if="syncResult.success" class="w-5 h-5 text-green-400" />
                                            <XCircle v-else class="w-5 h-5 text-red-400" />
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
                                        <AlertCircle class="w-3 h-3 inline mr-1" />
                                        {{ syncResult.errors.length }} errors occurred
                                    </div>
                                </div>

                                <!-- Sync Button -->
                                <Button @click="handleSyncInstance" :disabled="isSyncing" class="w-full gap-2">
                                    <Loader2 v-if="isSyncing" class="w-4 h-4 animate-spin" />
                                    <RefreshCw v-else class="w-4 h-4" />
                                    {{ isSyncing ? "Syncing..." : "Sync Now" }}
                                </Button>
                            </div>

                            <!-- Configs Tab -->
                            <div v-if="activeTab === 'configs'" class="config-browser-container">
                                <ConfigBrowser v-if="instance" :instance-id="instance.id" :instance-name="instance.name"
                                    @open-file="(file: ConfigFile) => handleOpenConfigExternal(file)"
                                    @open-structured="(file: ConfigFile) => handleOpenStructuredEditor(file)" />
                            </div>

                            <!-- Folders Tab -->
                            <div v-if="activeTab === 'folders'" class="space-y-4">
                                <p class="text-sm text-muted-foreground flex items-center gap-2">
                                    <FolderOpen class="w-4 h-4" />
                                    Quick access to instance folders
                                </p>

                                <div class="grid grid-cols-2 gap-3">
                                    <!-- Root Folder -->
                                    <button @click="handleOpenFolder()" class="folder-button-main group">
                                        <div class="folder-icon-main">
                                            <FolderOpen class="w-6 h-6" />
                                        </div>
                                        <div class="text-left flex-1">
                                            <div class="font-medium text-foreground">Instance Root</div>
                                            <div class="text-xs text-muted-foreground">Open main folder</div>
                                        </div>
                                        <ChevronRight
                                            class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </button>

                                    <!-- Other Folders -->
                                    <button v-for="folder in folderItems" :key="folder.id"
                                        @click="handleOpenFolder(folder.id)"
                                        :class="['folder-button group', folder.colorClass]">
                                        <div class="folder-icon">
                                            <component :is="folder.icon" class="w-5 h-5" />
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
                        <Settings class="w-4 h-4 text-purple-400" />
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
                    :config-path="structuredEditorFile.path" @close="handleCloseStructuredEditor"
                    @saved="handleCloseStructuredEditor" />
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
</style>
