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
    History,
    Filter,
    ArrowDownToLine,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ChangelogDialog from "@/components/mods/ChangelogDialog.vue";
import { useToast } from "@/composables/useToast";

const toast = useToast();

const props = defineProps<{
    open: boolean;
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

// Import State
const isImporting = ref<number | null>(null);
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
    return modpackFiles.value.filter((file) => {
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
    if (isImporting.value) return;

    isImporting.value = modpack.id;
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
        isImporting.value = null;
        importProgress.value = { show: false, phase: "", message: "", current: 0, total: 0 };
    }
}

// Quick import (latest release)
async function quickImport(modpack: any) {
    if (isImporting.value) return;

    isImporting.value = modpack.id;

    try {
        // Find latest release file
        const files = await window.api.curseforge.getModFiles(modpack.id, {
            gameVersion: selectedVersion.value || undefined,
            modLoader: selectedLoader.value || undefined,
        });

        const releaseFile = files.find((f: any) => f.releaseType === 1) || files[0];

        if (!releaseFile) {
            toast.error("No Files", "No compatible files found for this modpack");
            return;
        }

        await importModpack(modpack, releaseFile);
    } catch (err) {
        console.error("Quick import failed:", err);
        toast.error("Import Failed", (err as Error).message);
        isImporting.value = null;
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
        1: "bg-green-500/20 text-green-400",
        2: "bg-yellow-500/20 text-yellow-400",
        3: "bg-red-500/20 text-red-400",
    };
    return classes[type] || "bg-gray-500/20 text-gray-400";
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
    <Dialog :open="open" @close="emit('close')" size="full" title="Browse CurseForge Modpacks">
        <div class="flex flex-col h-[calc(100vh-8rem)] max-h-[900px]">
            <!-- Header / Search Bar -->
            <div class="shrink-0 p-4 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div class="flex flex-wrap gap-3 items-center">
                    <!-- Search Input -->
                    <div class="relative flex-1 min-w-[200px]">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input v-model="searchQuery" type="text" placeholder="Search modpacks..."
                            class="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                            @keyup.enter="search()" />
                    </div>

                    <!-- Version Filter -->
                    <select v-model="selectedVersion"
                        class="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">All Versions</option>
                        <option v-for="v in gameVersions" :key="v" :value="v">{{ v }}</option>
                    </select>

                    <!-- Loader Filter -->
                    <select v-model="selectedLoader"
                        class="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option value="">All Loaders</option>
                        <option v-for="l in loaders" :key="l" :value="l">{{ l.charAt(0).toUpperCase() + l.slice(1) }}
                        </option>
                    </select>

                    <!-- Sort -->
                    <select v-model="sortBy"
                        class="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>

                    <!-- Search Button -->
                    <Button @click="search()" :disabled="isSearching" size="sm" class="gap-2">
                        <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin" />
                        <Search v-else class="w-4 h-4" />
                        Search
                    </Button>

                    <!-- Filter Toggle -->
                    <Button variant="ghost" size="icon" @click="showFilters = !showFilters"
                        :class="showFilters ? 'bg-primary/20' : ''">
                        <Filter class="w-4 h-4" />
                    </Button>
                </div>

                <!-- Advanced Filters -->
                <div v-if="showFilters" class="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-4">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" v-model="filterRelease" class="rounded bg-white/10 border-white/20" />
                        <span class="text-sm text-green-400">Release</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" v-model="filterBeta" class="rounded bg-white/10 border-white/20" />
                        <span class="text-sm text-yellow-400">Beta</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" v-model="filterAlpha" class="rounded bg-white/10 border-white/20" />
                        <span class="text-sm text-red-400">Alpha</span>
                    </label>
                </div>
            </div>

            <!-- No API Key Warning -->
            <div v-if="!hasApiKey" class="flex-1 flex items-center justify-center">
                <div class="text-center p-8">
                    <Package class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 class="text-lg font-semibold mb-2">CurseForge API Key Required</h3>
                    <p class="text-muted-foreground mb-4">
                        Please configure your CurseForge API key in Settings to browse modpacks.
                    </p>
                </div>
            </div>

            <!-- Results -->
            <div v-else class="flex-1 overflow-y-auto custom-scrollbar p-4">
                <!-- Loading -->
                <div v-if="isSearching && searchResults.length === 0" class="flex items-center justify-center h-full">
                    <div class="flex flex-col items-center gap-3">
                        <Loader2 class="w-8 h-8 animate-spin text-primary" />
                        <p class="text-muted-foreground">Searching modpacks...</p>
                    </div>
                </div>

                <!-- No Results -->
                <div v-else-if="!isSearching && searchResults.length === 0"
                    class="flex items-center justify-center h-full">
                    <div class="text-center">
                        <Package class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 class="text-lg font-semibold mb-2">No modpacks found</h3>
                        <p class="text-muted-foreground">Try adjusting your search or filters</p>
                    </div>
                </div>

                <!-- Modpack List -->
                <div v-else class="space-y-3">
                    <div v-for="modpack in searchResults" :key="modpack.id"
                        class="bg-card/40 border border-white/5 rounded-xl overflow-hidden hover:border-white/20 transition-all">
                        <!-- Modpack Header -->
                        <div class="flex items-start gap-4 p-4">
                            <!-- Logo -->
                            <div class="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-black/40">
                                <img v-if="modpack.logo?.thumbnailUrl" :src="modpack.logo.thumbnailUrl"
                                    :alt="modpack.name" class="w-full h-full object-cover" />
                                <div v-else class="w-full h-full flex items-center justify-center">
                                    <Package class="w-8 h-8 text-muted-foreground/50" />
                                </div>
                            </div>

                            <!-- Info -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 class="font-semibold text-white truncate">{{ modpack.name }}</h3>
                                        <p class="text-sm text-muted-foreground line-clamp-2 mt-1">{{ modpack.summary }}
                                        </p>
                                    </div>

                                    <div class="flex items-center gap-2 shrink-0">
                                        <!-- Quick Import -->
                                        <Button @click.stop="quickImport(modpack)"
                                            :disabled="isImporting === modpack.id" size="sm" class="gap-2">
                                            <Loader2 v-if="isImporting === modpack.id" class="w-4 h-4 animate-spin" />
                                            <Download v-else class="w-4 h-4" />
                                            Import
                                        </Button>

                                        <!-- Expand -->
                                        <Button variant="ghost" size="icon" @click="toggleExpand(modpack.id)">
                                            <ChevronUp v-if="expandedModpackId === modpack.id" class="w-4 h-4" />
                                            <ChevronDown v-else class="w-4 h-4" />
                                        </Button>

                                        <!-- External Link -->
                                        <Button variant="ghost" size="icon" @click="openCurseForgePage(modpack.slug)">
                                            <ExternalLink class="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <!-- Stats -->
                                <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                    <span class="flex items-center gap-1">
                                        <Download class="w-3.5 h-3.5" />
                                        {{ formatNumber(modpack.downloadCount) }}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Users class="w-3.5 h-3.5" />
                                        {{ getAuthorNames(modpack) }}
                                    </span>
                                    <span class="flex items-center gap-1">
                                        <Calendar class="w-3.5 h-3.5" />
                                        {{ formatDate(modpack.dateModified) }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Expanded Files Section -->
                        <div v-if="expandedModpackId === modpack.id" class="border-t border-white/10 bg-black/20">
                            <div v-if="isLoadingFiles" class="p-4 flex items-center justify-center">
                                <Loader2 class="w-5 h-5 animate-spin text-primary" />
                            </div>

                            <div v-else-if="filteredFiles.length === 0" class="p-4 text-center text-muted-foreground">
                                No files match your filters
                            </div>

                            <div v-else class="max-h-64 overflow-y-auto custom-scrollbar">
                                <div v-for="file in filteredFiles.slice(0, 10)" :key="file.id"
                                    class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium text-sm truncate">{{ file.displayName }}</span>
                                            <span
                                                :class="[getReleaseClass(file.releaseType), 'px-1.5 py-0.5 rounded text-xs']">
                                                {{ getReleaseLabel(file.releaseType) }}
                                            </span>
                                        </div>
                                        <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                            <span>{{ getMinecraftVersions(file) }}</span>
                                            <span>{{ formatDate(file.fileDate) }}</span>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" @click="viewChangelog(modpack, file)"
                                            title="View Changelog">
                                            <History class="w-4 h-4" />
                                        </Button>
                                        <Button @click="importModpack(modpack, file)"
                                            :disabled="isImporting === modpack.id" size="sm" variant="secondary"
                                            class="gap-1.5">
                                            <Loader2 v-if="isImporting === modpack.id"
                                                class="w-3.5 h-3.5 animate-spin" />
                                            <ArrowDownToLine v-else class="w-3.5 h-3.5" />
                                            Import
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Load More -->
                    <div v-if="hasMoreResults" class="flex justify-center pt-4">
                        <Button @click="loadMore" :disabled="isSearching" variant="secondary" class="gap-2">
                            <Loader2 v-if="isSearching" class="w-4 h-4 animate-spin" />
                            <RefreshCw v-else class="w-4 h-4" />
                            Load More
                        </Button>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="shrink-0 px-4 py-3 border-t border-white/10 bg-background/80 backdrop-blur-md">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-muted-foreground">
                        {{ searchResults.length }} of {{ totalResults.toLocaleString() }} modpacks
                    </span>
                    <Button @click="emit('close')" variant="secondary">Close</Button>
                </div>
            </div>
        </div>

        <!-- Import Progress Overlay -->
        <div v-if="importProgress.show"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div class="bg-card border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 text-center">
                <Loader2 class="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
                <h3 class="font-semibold text-lg mb-2">Importing Modpack</h3>

                <!-- Phase indicators -->
                <div class="flex items-center justify-center gap-6 mb-4 text-xs">
                    <div class="flex items-center gap-2"
                        :class="importProgress.phase === 'download' ? 'text-primary' : 'text-muted-foreground'">
                        <div class="w-2 h-2 rounded-full"
                            :class="importProgress.phase === 'download' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                        Download
                    </div>
                    <div class="flex items-center gap-2"
                        :class="importProgress.phase === 'extract' ? 'text-primary' : 'text-muted-foreground'">
                        <div class="w-2 h-2 rounded-full"
                            :class="importProgress.phase === 'extract' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                        Extract
                    </div>
                    <div class="flex items-center gap-2"
                        :class="importProgress.phase === 'import' ? 'text-primary' : 'text-muted-foreground'">
                        <div class="w-2 h-2 rounded-full"
                            :class="importProgress.phase === 'import' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'" />
                        Import Mods
                    </div>
                </div>

                <p class="text-muted-foreground text-sm mb-4">{{ importProgress.message }}</p>
                <div v-if="importProgress.total > 0 && importProgress.phase === 'import'"
                    class="w-full bg-white/10 rounded-full h-2 mb-2">
                    <div class="bg-primary h-2 rounded-full transition-all"
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

        <!-- Changelog Dialog -->
        <ChangelogDialog v-if="selectedChangelogModpack" :open="changelogOpen" :mod-id="selectedChangelogModpack.id"
            :file-id="selectedChangelogModpack.fileId" :mod-name="selectedChangelogModpack.name"
            :version="selectedChangelogModpack.version" :slug="selectedChangelogModpack.slug"
            @close="changelogOpen = false" />
    </Dialog>
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
