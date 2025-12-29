<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
    Search,
    Download,
    ChevronDown,
    ChevronUp,
    Loader2,
    ExternalLink,
    Star,
    X,
    Package,
    Users,
    Calendar,
    FileText,
    RefreshCw,
    Filter,
    ArrowDownToLine,
    ArrowLeft,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ChangelogDialog from "@/components/mods/ChangelogDialog.vue";
import { useToast } from "@/composables/useToast";

const toast = useToast();

const props = defineProps<{
    open: boolean;
    // Full screen mode - when used as a view
    fullScreen?: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "imported"): void;
}>();

// State
const searchQuery = ref("");
const selectedVersion = ref("");
const selectedLoader = ref("");
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const hasApiKey = ref(false);
const currentPage = ref(0);
const totalResults = ref(0);
const pageSize = 20;

// Expanded modpack state
const expandedModpackId = ref<number | null>(null);
const modpackFiles = ref<any[]>([]);
const isLoadingFiles = ref(false);

// Changelog State
const changelogOpen = ref(false);
const selectedChangelogModpack = ref<{
    id: number;
    name: string;
    fileId: number;
    version: string;
    slug: string;
} | null>(null);

// Import State - track both modpack ID and file ID to avoid duplicate loading indicators
const importingModpackId = ref<number | null>(null);
const importingFileId = ref<number | null>(null);
const importProgress = ref({
    show: false,
    phase: "" as "download" | "extract" | "import" | "",
    message: "",
    current: 0,
    total: 0,
});

// Filters
const showFilters = ref(false);
const filterRelease = ref(true);
const filterBeta = ref(false);
const filterAlpha = ref(false);
const sortBy = ref<"popularity" | "updated" | "created" | "name">("popularity");

// Game versions
const gameVersions = [
    "1.21.4",
    "1.21.3",
    "1.21.1",
    "1.21",
    "1.20.6",
    "1.20.4",
    "1.20.2",
    "1.20.1",
    "1.20",
    "1.19.4",
    "1.19.2",
    "1.18.2",
    "1.17.1",
    "1.16.5",
];

const loaders = ["forge", "fabric", "neoforge", "quilt"];

const sortOptions = [
    { value: "popularity", label: "Popularity", field: 2 },
    { value: "updated", label: "Recently Updated", field: 3 },
    { value: "created", label: "Newest", field: 1 },
    { value: "name", label: "Name", field: 4 },
];

const sortField = computed(() => {
    return sortOptions.find((s) => s.value === sortBy.value)?.field || 2;
});

// Computed
const hasMoreResults = computed(() => {
    return (currentPage.value + 1) * pageSize < totalResults.value;
});

const filteredFiles = computed(() => {
    // If no filters are selected, show all files
    if (!filterRelease.value && !filterBeta.value && !filterAlpha.value) {
        return modpackFiles.value;
    }

    return modpackFiles.value.filter((file) => {
        // Include file if its release type is selected
        if (file.releaseType === 1 && filterRelease.value) return true;
        if (file.releaseType === 2 && filterBeta.value) return true;
        if (file.releaseType === 3 && filterAlpha.value) return true;
        return false;
    });
});

// Search
async function search(reset = true) {
    if (!hasApiKey.value) return;

    isSearching.value = true;
    if (reset) {
        currentPage.value = 0;
        searchResults.value = [];
    }

    try {
        const result = await window.api.curseforge.search({
            query: searchQuery.value || undefined,
            gameVersion: selectedVersion.value || undefined,
            modLoader: selectedLoader.value || undefined,
            contentType: "modpacks",
            pageSize,
            index: currentPage.value * pageSize,
            sortField: sortField.value,
            sortOrder: "desc",
        });

        if (reset) {
            searchResults.value = result.mods;
        } else {
            searchResults.value = [...searchResults.value, ...result.mods];
        }
        totalResults.value = result.pagination.totalCount;
    } catch (err) {
        console.error("Search failed:", err);
        toast.error("Search failed", (err as Error).message);
    } finally {
        isSearching.value = false;
    }
}

function loadMore() {
    currentPage.value++;
    search(false);
}

// Expand modpack to show files
async function toggleExpand(modpackId: number) {
    if (expandedModpackId.value === modpackId) {
        expandedModpackId.value = null;
        modpackFiles.value = [];
        return;
    }

    expandedModpackId.value = modpackId;
    isLoadingFiles.value = true;
    modpackFiles.value = [];

    try {
        const files = await window.api.curseforge.getModFiles(modpackId, {
            gameVersion: selectedVersion.value || undefined,
            modLoader: selectedLoader.value || undefined,
        });
        modpackFiles.value = files;
    } catch (err) {
        console.error("Failed to load files:", err);
        toast.error("Error", "Failed to load modpack files");
    } finally {
        isLoadingFiles.value = false;
    }
}

// View changelog
function viewChangelog(modpack: any, file: any) {
    selectedChangelogModpack.value = {
        id: modpack.id,
        name: modpack.name,
        fileId: file.id,
        version: file.displayName,
        slug: modpack.slug,
    };
    changelogOpen.value = true;
}

// Import modpack
async function importModpack(modpack: any, file: any) {
    if (importingModpackId.value || importingFileId.value) return;

    importingModpackId.value = modpack.id;
    importingFileId.value = file.id;
    importProgress.value = {
        show: true,
        phase: "download",
        message: `Downloading ${modpack.name}...`,
        current: 0,
        total: 0,
    };

    try {
        // Download the modpack file
        const downloadUrl = file.downloadUrl;
        if (!downloadUrl) {
            // Some modpacks require browser download
            toast.warning(
                "Manual Download Required",
                "This modpack requires downloading from CurseForge website"
            );
            window.open(
                `https://www.curseforge.com/minecraft/modpacks/${modpack.slug}/files/${file.id}`,
                "_blank"
            );
            return;
        }

        // Import via the existing CF import system with CF source tracking
        const result = await window.api.modpacks.importFromCurseForgeUrl(
            downloadUrl,
            modpack.name,
            modpack.id,       // CF project ID
            file.id,          // CF file ID
            modpack.slug,     // CF slug for URL building
            (current: number, total: number, modName: string) => {
                // Detect phase from modName message
                let phase: "download" | "extract" | "import" = "import";
                if (modName.includes("Downloading")) phase = "download";
                else if (modName.includes("Extracting")) phase = "extract";

                importProgress.value = {
                    show: true,
                    phase,
                    message: modName,
                    current,
                    total,
                };
            }
        );

        if (result && result.success) {
            toast.success("Modpack Imported", `${modpack.name} has been imported successfully`);
            emit("imported");
        }
    } catch (err) {
        console.error("Import failed:", err);
        toast.error("Import Failed", (err as Error).message);
    } finally {
        importingModpackId.value = null;
        importingFileId.value = null;
        importProgress.value = { show: false, phase: "", message: "", current: 0, total: 0 };
    }
}

// Quick import (latest release)
async function quickImport(modpack: any) {
    if (importingModpackId.value) return;

    // Set a temporary state to show loading on the header button
    importingModpackId.value = modpack.id;
    importingFileId.value = -1; // Use -1 to indicate "quick import" loading state

    try {
        // Find latest release file
        const files = await window.api.curseforge.getModFiles(modpack.id, {
            gameVersion: selectedVersion.value || undefined,
            modLoader: selectedLoader.value || undefined,
        });

        const releaseFile = files.find((f: any) => f.releaseType === 1) || files[0];

        if (!releaseFile) {
            toast.error("No Files", "No compatible files found for this modpack");
            importingModpackId.value = null;
            importingFileId.value = null;
            return;
        }

        // Reset the temp state before calling importModpack which sets its own state
        importingModpackId.value = null;
        importingFileId.value = null;

        await importModpack(modpack, releaseFile);
    } catch (err) {
        console.error("Quick import failed:", err);
        toast.error("Import Failed", (err as Error).message);
        importingModpackId.value = null;
        importingFileId.value = null;
    }
}

// Open CurseForge page
function openCurseForgePage(slug: string) {
    window.open(`https://www.curseforge.com/minecraft/modpacks/${slug}`, "_blank");
}

// Format number
function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
}

// Format date
function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// Get author names from modpack
function getAuthorNames(modpack: any): string {
    if (!modpack.authors || !Array.isArray(modpack.authors)) return "Unknown";
    return modpack.authors.map((a: any) => a.name).join(", ") || "Unknown";
}

// Get Minecraft versions from file
function getMinecraftVersions(file: any): string {
    if (!file.gameVersions || !Array.isArray(file.gameVersions)) return "";
    return file.gameVersions.filter((v: string) => /^1\.\d+/.test(v)).join(", ");
}

// Get release type label
function getReleaseLabel(type: number): string {
    const labels: Record<number, string> = {
        1: "Release",
        2: "Beta",
        3: "Alpha",
    };
    return labels[type] || "Unknown";
}

function getReleaseClass(type: number): string {
    const classes: Record<number, string> = {
        1: "bg-primary/10 text-primary border-primary/20",
        2: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        3: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    };
    return classes[type] || "bg-muted/30 text-muted-foreground";
}

// Watch for dialog open
watch(
    () => props.open,
    async (isOpen) => {
        if (isOpen) {
            hasApiKey.value = await window.api.curseforge.hasApiKey();
            if (hasApiKey.value && searchResults.value.length === 0) {
                search();
            }
        }
    }
);

// Watch filters and re-search
watch([selectedVersion, selectedLoader, sortBy], () => {
    if (hasApiKey.value) {
        search();
    }
});

onMounted(async () => {
    hasApiKey.value = await window.api.curseforge.hasApiKey();
});
</script>

<template>
    <component :is="fullScreen ? 'div' : Dialog" v-if="!fullScreen || open" :open="open" @close="emit('close')"
        maxWidth="6xl" contentClass="p-0 border-none bg-transparent shadow-none">
        <div :class="[
            'flex flex-col overflow-hidden bg-background relative',
            fullScreen ? 'h-screen w-full' : 'h-[90vh] md:h-[80vh] rounded-xl border border-border shadow-2xl'
        ]">

            <!-- Fullscreen Header with Back Button -->
            <div v-if="fullScreen" class="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <Button variant="ghost" size="sm" @click="emit('close')" class="gap-2">
                    <ArrowLeft class="w-4 h-4" />
                    Back
                </Button>
                <div class="h-4 w-px bg-border"></div>
                <h1 class="text-lg font-semibold">Browse Modpacks</h1>
            </div>

            <div class="flex flex-1 md:flex-row flex-col overflow-hidden">
                <!-- Mobile Filter Toggle -->
                <button @click="showFilters = !showFilters"
                    class="md:hidden flex items-center justify-between w-full p-3 border-b border-border bg-muted/30">
                    <span class="flex items-center gap-2 text-sm font-medium">
                        <Filter class="w-4 h-4 text-primary" />
                        Filters
                        <span v-if="selectedVersion || selectedLoader"
                            class="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                            {{ [selectedVersion, selectedLoader].filter(Boolean).length }}
                        </span>
                    </span>
                    <ChevronDown class="w-4 h-4 transition-transform" :class="showFilters ? 'rotate-180' : ''" />
                </button>

                <!-- Sidebar Filters -->
                <div class="flex-shrink-0 border-r border-border bg-muted/10 flex flex-col overflow-hidden transition-all duration-200"
                    :class="[
                        showFilters ? 'max-h-[50vh] md:max-h-none' : 'max-h-0 md:max-h-none',
                        'md:w-64 w-full'
                    ]">
                    <div class="hidden md:block p-4 border-b border-border">
                        <h3 class="font-semibold flex items-center gap-2">
                            <Filter class="w-4 h-4 text-primary" />
                            Filters
                        </h3>
                    </div>

                    <div class="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 custom-scrollbar">
                        <!-- Game Version -->
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Game Version
                            </label>
                            <div class="relative">
                                <select v-model="selectedVersion"
                                    class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none">
                                    <option value="" class="bg-popover text-popover-foreground">All Versions</option>
                                    <option v-for="v in gameVersions" :key="v" :value="v"
                                        class="bg-popover text-popover-foreground">
                                        {{ v }}
                                    </option>
                                </select>
                                <ChevronDown
                                    class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
                            </div>
                        </div>

                        <!-- Mod Loader -->
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Mod Loader
                            </label>
                            <div class="relative">
                                <select v-model="selectedLoader"
                                    class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none">
                                    <option value="" class="bg-popover text-popover-foreground">All Loaders</option>
                                    <option v-for="l in loaders" :key="l" :value="l"
                                        class="bg-popover text-popover-foreground">
                                        {{ l.charAt(0).toUpperCase() + l.slice(1) }}
                                    </option>
                                </select>
                                <ChevronDown
                                    class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
                            </div>
                        </div>

                        <!-- Sort By -->
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Sort By
                            </label>
                            <div class="relative">
                                <select v-model="sortBy"
                                    class="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background/50 text-sm focus:ring-1 focus:ring-primary appearance-none">
                                    <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value"
                                        class="bg-popover text-popover-foreground">
                                        {{ opt.label }}
                                    </option>
                                </select>
                                <ChevronDown
                                    class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
                            </div>
                        </div>

                        <!-- Release Channels -->
                        <div class="space-y-2">
                            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Release Channels
                            </label>
                            <div class="flex flex-wrap gap-1.5">
                                <label
                                    class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all select-none"
                                    :class="filterRelease ? 'bg-primary/15 ring-1 ring-primary/30' : 'bg-muted/30 hover:bg-muted/50'">
                                    <input type="checkbox" v-model="filterRelease" class="sr-only" />
                                    <div class="w-3 h-3 rounded-full bg-primary ring-2 ring-primary/30" />
                                    <span class="text-xs font-medium"
                                        :class="filterRelease ? 'text-primary' : 'text-muted-foreground'">Release</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all select-none"
                                    :class="filterBeta ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'bg-muted/30 hover:bg-muted/50'">
                                    <input type="checkbox" v-model="filterBeta" class="sr-only" />
                                    <div class="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
                                    <span class="text-xs font-medium"
                                        :class="filterBeta ? 'text-blue-400' : 'text-muted-foreground'">Beta</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all select-none"
                                    :class="filterAlpha ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'bg-muted/30 hover:bg-muted/50'">
                                    <input type="checkbox" v-model="filterAlpha" class="sr-only" />
                                    <div class="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-500/30" />
                                    <span class="text-xs font-medium"
                                        :class="filterAlpha ? 'text-orange-400' : 'text-muted-foreground'">Alpha</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
                    <!-- Search Header -->
                    <div
                        class="p-3 md:p-4 border-b border-border flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                        <div class="relative flex-1">
                            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input v-model="searchQuery" type="text" placeholder="Search modpacks..."
                                class="w-full h-9 sm:h-10 pl-10 pr-4 rounded-lg border bg-input/50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all text-sm"
                                @keyup.enter="search()" />
                        </div>

                        <Button @click="search()" :disabled="isSearching" size="sm" class="gap-2">
                            <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin" />
                            <Search v-else class="w-4 h-4" />
                            Search
                        </Button>

                        <template v-if="!fullScreen">
                            <div class="h-8 w-px bg-border mx-1 hidden sm:block"></div>

                            <Button variant="ghost" size="icon" @click="emit('close')" title="Close">
                                <X class="w-5 h-5" />
                            </Button>
                        </template>
                    </div>

                    <!-- No API Key Warning -->
                    <div v-if="!hasApiKey" class="flex-1 flex items-center justify-center">
                        <div class="text-center p-8">
                            <div
                                class="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                                <Package class="w-6 h-6 text-primary" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2">CurseForge API Key Required</h3>
                            <p class="text-muted-foreground text-sm mb-4">
                                Please configure your CurseForge API key in Settings to browse modpacks.
                            </p>
                        </div>
                    </div>

                    <!-- Results Area -->
                    <div v-else class="flex-1 overflow-y-auto custom-scrollbar">
                        <!-- Loading -->
                        <div v-if="isSearching && searchResults.length === 0"
                            class="flex items-center justify-center h-full">
                            <div class="flex flex-col items-center gap-3">
                                <Loader2 class="w-6 h-6 animate-spin text-primary" />
                                <p class="text-muted-foreground text-sm">Searching modpacks...</p>
                            </div>
                        </div>

                        <!-- No Results -->
                        <div v-else-if="!isSearching && searchResults.length === 0"
                            class="flex items-center justify-center h-full">
                            <div class="text-center">
                                <div
                                    class="w-12 h-12 mx-auto rounded-lg bg-muted/30 flex items-center justify-center mb-4">
                                    <Package class="w-6 h-6 text-muted-foreground" />
                                </div>
                                <h3 class="text-lg font-semibold mb-2">No modpacks found</h3>
                                <p class="text-muted-foreground text-sm">Try adjusting your search or filters</p>
                            </div>
                        </div>

                        <!-- Modpack List -->
                        <div v-else class="p-3 md:p-4 space-y-2">
                            <div v-for="modpack in searchResults" :key="modpack.id"
                                class="bg-card/50 border border-border/40 rounded-lg overflow-hidden hover:border-border/70 hover:bg-card/70 transition-all duration-150">
                                <!-- Modpack Header -->
                                <div class="flex items-start gap-3 p-3">
                                    <!-- Logo -->
                                    <div
                                        class="shrink-0 w-14 h-14 rounded-md overflow-hidden bg-background/50 border border-border/30">
                                        <img v-if="modpack.logo?.thumbnailUrl" :src="modpack.logo.thumbnailUrl"
                                            :alt="modpack.name" class="w-full h-full object-cover" />
                                        <div v-else class="w-full h-full flex items-center justify-center">
                                            <Package class="w-6 h-6 text-muted-foreground/50" />
                                        </div>
                                    </div>

                                    <!-- Info -->
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-start justify-between gap-2">
                                            <div>
                                                <h3 class="font-medium text-foreground truncate">{{ modpack.name }}</h3>
                                                <p class="text-xs text-muted-foreground line-clamp-2 mt-0.5">{{
                                                    modpack.summary
                                                    }}
                                                </p>
                                            </div>

                                            <div class="flex items-center gap-1.5 shrink-0">
                                                <!-- Quick Import -->
                                                <Button @click.stop="quickImport(modpack)"
                                                    :disabled="importingModpackId === modpack.id" size="sm"
                                                    class="gap-1.5 h-8">
                                                    <Loader2
                                                        v-if="importingModpackId === modpack.id && importingFileId === -1"
                                                        class="w-3.5 h-3.5 animate-spin" />
                                                    <Download v-else class="w-3.5 h-3.5" />
                                                    Import
                                                </Button>

                                                <!-- Expand -->
                                                <Button variant="ghost" size="icon" class="h-8 w-8"
                                                    @click="toggleExpand(modpack.id)">
                                                    <ChevronUp v-if="expandedModpackId === modpack.id"
                                                        class="w-3.5 h-3.5" />
                                                    <ChevronDown v-else class="w-3.5 h-3.5" />
                                                </Button>

                                                <!-- External Link -->
                                                <Button variant="ghost" size="icon" class="h-8 w-8"
                                                    @click="openCurseForgePage(modpack.slug)">
                                                    <ExternalLink class="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        <!-- Stats -->
                                        <div class="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                            <span class="flex items-center gap-1">
                                                <Download class="w-3 h-3" />
                                                {{ formatNumber(modpack.downloadCount) }}
                                            </span>
                                            <span class="flex items-center gap-1">
                                                <Users class="w-3 h-3" />
                                                {{ getAuthorNames(modpack) }}
                                            </span>
                                            <span class="flex items-center gap-1">
                                                <Calendar class="w-3 h-3" />
                                                {{ formatDate(modpack.dateModified) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Expanded Files Section -->
                                <div v-if="expandedModpackId === modpack.id"
                                    class="border-t border-border/30 bg-background/30">
                                    <div v-if="isLoadingFiles" class="p-4 flex items-center justify-center">
                                        <Loader2 class="w-4 h-4 animate-spin text-primary" />
                                    </div>

                                    <div v-else-if="filteredFiles.length === 0"
                                        class="p-4 text-center text-muted-foreground text-sm">
                                        No files match your filters
                                    </div>

                                    <div v-else class="p-2 space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                                        <div v-for="file in filteredFiles.slice(0, 10)" :key="file.id"
                                            class="flex items-center gap-3 p-2 rounded-lg hover:bg-background border border-transparent hover:border-border transition-all group/file">
                                            <div class="flex-1 grid grid-cols-12 gap-4 items-center text-sm">
                                                <div class="col-span-5 font-medium truncate" :title="file.displayName">
                                                    {{ file.displayName }}
                                                </div>
                                                <div class="col-span-2">
                                                    <span
                                                        class="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded"
                                                        :title="getMinecraftVersions(file)">
                                                        {{ getMinecraftVersions(file) }}
                                                    </span>
                                                </div>
                                                <div class="col-span-2 text-xs text-muted-foreground">
                                                    {{ formatDate(file.fileDate) }}
                                                </div>
                                                <div class="col-span-2">
                                                    <span
                                                        class="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border"
                                                        :class="getReleaseClass(file.releaseType)">
                                                        {{ getReleaseLabel(file.releaseType) }}
                                                    </span>
                                                </div>
                                                <div class="col-span-1 text-xs text-muted-foreground text-right">
                                                    {{ file.fileLength ? (file.fileLength / 1024 / 1024).toFixed(1) +
                                                        'MB' : '' }}
                                                </div>
                                            </div>

                                            <div class="flex items-center">
                                                <Button variant="ghost" size="icon"
                                                    class="h-8 w-8 text-muted-foreground mr-1" title="View Changelog"
                                                    @click.stop="viewChangelog(modpack, file)">
                                                    <FileText class="w-4 h-4" />
                                                </Button>
                                                <Button @click="importModpack(modpack, file)"
                                                    :disabled="importingModpackId === modpack.id" size="sm"
                                                    variant="ghost" class="h-8 w-24 ml-2 text-xs">
                                                    <Loader2 v-if="importingFileId === file.id"
                                                        class="w-3 h-3 animate-spin mr-1.5" />
                                                    <ArrowDownToLine v-else class="w-3 h-3 mr-1.5" />
                                                    Import
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Load More -->
                            <div v-if="hasMoreResults" class="flex justify-center py-4">
                                <Button @click="loadMore" :disabled="isSearching" variant="secondary" class="gap-1.5">
                                    <Loader2 v-if="isSearching" class="w-3.5 h-3.5 animate-spin" />
                                    <RefreshCw v-else class="w-3.5 h-3.5" />
                                    Load More
                                </Button>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="shrink-0 px-4 py-3 border-t border-border bg-muted/30">
                        <div class="flex items-center justify-between">
                            <span class="text-xs text-muted-foreground">
                                {{ searchResults.length }} of {{ totalResults.toLocaleString() }} modpacks
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Import Progress Overlay -->
            <div v-if="importProgress.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div
                    class="bg-card/95 border border-border/50 rounded-lg p-6 max-w-md w-full mx-4 text-center shadow-2xl shadow-black/20">
                    <div class="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <Loader2 class="w-6 h-6 animate-spin text-primary" />
                    </div>
                    <h3 class="font-semibold text-lg mb-2">Importing Modpack</h3>

                    <!-- Phase indicators -->
                    <div class="flex items-center justify-center gap-6 mb-4 text-xs">
                        <div class="flex items-center gap-2"
                            :class="importProgress.phase === 'download' ? 'text-primary' : 'text-muted-foreground'">
                            <div class="w-1.5 h-1.5 rounded-full"
                                :class="importProgress.phase === 'download' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                            Download
                        </div>
                        <div class="flex items-center gap-2"
                            :class="importProgress.phase === 'extract' ? 'text-primary' : 'text-muted-foreground'">
                            <div class="w-1.5 h-1.5 rounded-full"
                                :class="importProgress.phase === 'extract' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                            Extract
                        </div>
                        <div class="flex items-center gap-2"
                            :class="importProgress.phase === 'import' ? 'text-primary' : 'text-muted-foreground'">
                            <div class="w-1.5 h-1.5 rounded-full"
                                :class="importProgress.phase === 'import' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                            Import Mods
                        </div>
                    </div>

                    <p class="text-muted-foreground text-sm mb-4">{{ importProgress.message }}</p>
                    <div v-if="importProgress.total > 0 && importProgress.phase === 'import'"
                        class="w-full bg-muted/30 rounded-full h-1.5 mb-2 overflow-hidden">
                        <div class="bg-primary h-1.5 rounded-full transition-all duration-300"
                            :style="{ width: `${(importProgress.current / importProgress.total) * 100}%` }"></div>
                    </div>
                    <p v-if="importProgress.total > 0 && importProgress.phase === 'import'"
                        class="text-xs text-muted-foreground">
                        Processing mod {{ importProgress.current }} / {{ importProgress.total }}
                    </p>
                    <p v-else-if="importProgress.phase === 'download'" class="text-xs text-muted-foreground">
                        Please wait while the modpack is being downloaded...
                    </p>
                </div>
            </div>
        </div>

        <!-- Changelog Dialog -->
        <ChangelogDialog v-if="selectedChangelogModpack" :open="changelogOpen" :mod-id="selectedChangelogModpack.id"
            :file-id="selectedChangelogModpack.fileId" :mod-name="selectedChangelogModpack.name"
            :version="selectedChangelogModpack.version" :slug="selectedChangelogModpack.slug"
            @close="changelogOpen = false" />
    </component>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}
</style>
