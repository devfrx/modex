<script setup lang="ts">
/**
 * HytaleBrowseView - Browse CurseForge mods for Hytale
 * 
 * Hytale content types on CurseForge (gameId: 70216):
 * - Mods (classId: 9137)
 * - Prefabs (classId: 9185)
 * - Worlds (classId: 9184)
 * - Bootstrap (classId: 9281)
 * 
 * Currently this view focuses on Mods only.
 */

import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import HytaleCFModDetailsModal from "@/components/hytale/HytaleCFModDetailsModal.vue";
import { useHytale } from "@/composables/useHytale";
import { useToast } from "@/composables/useToast";
import { createLogger } from "@/utils/logger";

const log = createLogger("HytaleBrowseView");
const router = useRouter();
const toast = useToast();
const {
    isInstalled,
    installFromCurseForge,
    isModInstalledByCfId,
    getInstalledModByCfId,
    getInstalledFileIdByCfId,
    refreshMods,
    initialize,
} = useHytale();

interface CFMod {
    id: number;
    name: string;
    slug: string;
    summary: string;
    downloadCount: number;
    dateModified: string;
    dateCreated: string;
    logo?: { thumbnailUrl: string; url?: string };
    authors: { name: string }[];
    categories: { id: number; name: string }[];
    classId?: number;
}

interface CFCategory {
    id: number;
    name: string;
    slug: string;
}

// Search state
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref<CFMod[]>([]);
const pagination = ref({ index: 0, pageSize: 20, totalCount: 0 });

// Pagination computed
const currentPage = computed(() => Math.floor(pagination.value.index / pagination.value.pageSize) + 1);
const totalPages = computed(() => Math.ceil(pagination.value.totalCount / pagination.value.pageSize));
const canGoPrev = computed(() => currentPage.value > 1);
const canGoNext = computed(() => currentPage.value < totalPages.value);

// Pagination navigation
function goToPage(page: number) {
    if (page < 1 || page > totalPages.value) return;
    pagination.value.index = (page - 1) * pagination.value.pageSize;
    search(false);
}

function prevPage() {
    if (canGoPrev.value) goToPage(currentPage.value - 1);
}

function nextPage() {
    if (canGoNext.value) goToPage(currentPage.value + 1);
}

// Mod details modal
const showModDetailsModal = ref(false);
const selectedMod = ref<CFMod | null>(null);

function handleShowDetails(mod: CFMod) {
    selectedMod.value = mod;
    showModDetailsModal.value = true;
}

// Filters - Hytale only has categories, no versions or loaders
const categories = ref<CFCategory[]>([]);
const selectedCategory = ref<number | null>(null);

// Error state
const error = ref<string | null>(null);

// Installing state
const installingMods = ref<Set<number>>(new Set());

async function search(resetPagination = true) {
    if (resetPagination) {
        pagination.value.index = 0;
    }

    isSearching.value = true;
    error.value = null;

    try {
        const result = await window.api.curseforge.search({
            query: searchQuery.value || undefined,
            gameType: "hytale",
            contentType: "mods", // Hytale only has mods
            categoryId: selectedCategory.value || undefined,
            pageSize: pagination.value.pageSize,
            index: pagination.value.index,
        });

        searchResults.value = result.mods;
        pagination.value = result.pagination;
    } catch (err: any) {
        log.error("[HytaleBrowse] Search error:", err);
        error.value = err.message || "Failed to search mods";
    } finally {
        isSearching.value = false;
    }
}

async function loadCategories() {
    try {
        // Pass gameType="hytale" to get Hytale categories
        const cats = await window.api.curseforge.getCategories("mods", "hytale");
        categories.value = cats;
    } catch (err) {
        log.error("[HytaleBrowse] Error loading categories:", err);
    }
}

async function handleInstall(mod: CFMod, fileId?: number) {
    const existingMod = getInstalledModByCfId(mod.id);
    const existingFileId = getInstalledFileIdByCfId(mod.id);

    // Check if same version is already installed (unless changing version)
    if (existingMod && existingFileId === fileId) {
        toast.info("Already Installed", `${mod.name} is already in your mods folder`);
        return;
    }

    installingMods.value.add(mod.id);

    // Close modal if open (when installing from modal)
    if (showModDetailsModal.value) {
        showModDetailsModal.value = false;
        selectedMod.value = null;
    }

    try {
        let targetFileId = fileId;

        // If no specific file ID, get the latest file
        if (!targetFileId) {
            const files = await window.api.curseforge.getModFiles(mod.id);
            if (!files || files.length === 0) {
                throw new Error("No files available for this mod");
            }
            targetFileId = files[0].id;
        }

        // If changing version, delete the old one first
        if (existingMod) {
            await window.api.hytale.removeMod(existingMod.id);
        }

        const result = await installFromCurseForge(mod.id, targetFileId);
        if (result.success) {
            const message = existingMod
                ? "Mod version updated successfully"
                : "Mod added to your Hytale mods folder";
            toast.success(`${existingMod ? 'Updated' : 'Installed'} ${mod.name}`, message);
            // Refresh mods list to update installed state
            await refreshMods();
        } else {
            throw new Error(result.error || "Failed to install mod");
        }
    } catch (err: any) {
        log.error("[HytaleBrowse] Install error:", err);
        toast.error("Install failed", err.message);
    } finally {
        installingMods.value.delete(mod.id);
    }
}

function formatDownloads(count: number): string {
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
        return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Load on mount
onMounted(async () => {
    await initialize(); // Load installed mods for tracking
    loadCategories();
    search();
});
</script>

<template>
    <div class="h-full flex flex-col relative">
        <!-- Header -->
        <div class="border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 py-4">
            <div class="flex items-center gap-4">
                <button @click="router.push('/hytale')" class="p-2 hover:bg-muted rounded-lg transition-colors">
                    <Icon name="ArrowLeft" class="w-5 h-5" />
                </button>
                <div>
                    <h1 class="text-xl font-semibold">Browse Hytale Mods</h1>
                    <p class="text-sm text-muted-foreground">
                        Discover and install mods for Hytale from CurseForge
                    </p>
                </div>
            </div>
        </div>

        <!-- Search & Filters - No version/loader filters for Hytale -->
        <div class="px-6 py-4 border-b border-border/30 flex flex-col sm:flex-row gap-4">
            <div class="flex-1 flex gap-2">
                <Input v-model="searchQuery" placeholder="Search for Hytale mods..." class="flex-1"
                    @keyup.enter="search()" />
                <Button @click="search()" :disabled="isSearching">
                    <Icon v-if="!isSearching" name="Search" class="w-4 h-4 mr-2" />
                    <Icon v-else name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
                    Search
                </Button>
            </div>

            <!-- Category Filter -->
            <div class="relative">
                <select v-model="selectedCategory" @change="search()"
                    class="appearance-none bg-muted border border-border rounded-lg px-4 py-2 pr-10 text-sm">
                    <option :value="null">All Categories</option>
                    <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                        {{ cat.name }}
                    </option>
                </select>
                <Icon name="ChevronDown"
                    class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto p-6">
            <!-- Error State -->
            <div v-if="error" class="flex flex-col items-center justify-center py-12 gap-4">
                <Icon name="AlertCircle" class="w-12 h-12 text-destructive" />
                <p class="text-muted-foreground">{{ error }}</p>
                <Button variant="outline" @click="search()">
                    <Icon name="RefreshCw" class="w-4 h-4 mr-2" />
                    Try Again
                </Button>
            </div>

            <!-- Loading State -->
            <div v-else-if="isSearching && searchResults.length === 0"
                class="flex flex-col items-center justify-center py-12 gap-4">
                <Icon name="Loader2" class="w-12 h-12 text-primary animate-spin" />
                <p class="text-muted-foreground">Searching...</p>
            </div>

            <!-- Empty State -->
            <div v-else-if="!isSearching && searchResults.length === 0"
                class="flex flex-col items-center justify-center py-12 gap-4">
                <Icon name="Package" class="w-12 h-12 text-muted-foreground" />
                <p class="text-muted-foreground">No mods found</p>
            </div>

            <!-- Results Grid -->
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div v-for="mod in searchResults" :key="mod.id"
                    class="bg-card border border-border/50 rounded-lg overflow-hidden hover:border-primary/30 transition-colors cursor-pointer group"
                    @click="handleShowDetails(mod)">
                    <!-- Mod Card -->
                    <div class="p-4 space-y-3">
                        <div class="flex gap-3">
                            <img v-if="mod.logo?.thumbnailUrl" :src="mod.logo.thumbnailUrl" :alt="mod.name"
                                class="w-12 h-12 rounded-lg object-cover bg-muted group-hover:scale-105 transition-transform" />
                            <div v-else class="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                <Icon name="Package" class="w-6 h-6 text-muted-foreground" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="font-medium text-sm truncate group-hover:text-primary transition-colors">{{
                                    mod.name }}</h3>
                                <p class="text-xs text-muted-foreground">
                                    by {{mod.authors.map(a => a.name).join(', ')}}
                                </p>
                            </div>
                        </div>

                        <p class="text-xs text-muted-foreground line-clamp-2">
                            {{ mod.summary }}
                        </p>

                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span class="flex items-center gap-1">
                                <Icon name="Download" class="w-3 h-3" />
                                {{ formatDownloads(mod.downloadCount) }}
                            </span>
                            <span>Updated {{ formatDate(mod.dateModified) }}</span>
                        </div>

                        <div class="flex gap-2">
                            <Button v-if="isModInstalledByCfId(mod.id)" size="sm" variant="outline" class="flex-1"
                                disabled>
                                <Icon name="Check" class="w-4 h-4 mr-2 text-emerald-500" />
                                Installed
                            </Button>
                            <Button v-else size="sm" class="flex-1" :disabled="installingMods.has(mod.id)"
                                @click.stop="handleInstall(mod)">
                                <Icon v-if="installingMods.has(mod.id)" name="Loader2"
                                    class="w-4 h-4 mr-2 animate-spin" />
                                <Icon v-else name="Download" class="w-4 h-4 mr-2" />
                                {{ installingMods.has(mod.id) ? 'Installing...' : 'Install' }}
                            </Button>
                            <Button size="sm" variant="outline" @click.stop="handleShowDetails(mod)">
                                <Tooltip content="View details" position="top">
                                    <Icon name="Info" class="w-4 h-4" />
                                </Tooltip>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Pagination Controls -->
            <div v-if="totalPages > 1 && !isSearching" class="browse-pagination">
                <Button variant="outline" size="sm" :disabled="!canGoPrev" @click="goToPage(1)">
                    <Icon name="ChevronsLeft" class="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" :disabled="!canGoPrev" @click="prevPage">
                    <Icon name="ChevronLeft" class="w-4 h-4" />
                </Button>

                <div class="pagination-pages">
                    <template v-for="page in totalPages" :key="page">
                        <Button
                            v-if="page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)"
                            :variant="page === currentPage ? 'default' : 'outline'" size="sm"
                            class="pagination-page-btn" @click="goToPage(page)">
                            {{ page }}
                        </Button>
                        <span v-else-if="page === currentPage - 2 || page === currentPage + 2" class="pagination-dots">
                            ...
                        </span>
                    </template>
                </div>

                <Button variant="outline" size="sm" :disabled="!canGoNext" @click="nextPage">
                    <Icon name="ChevronRight" class="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" :disabled="!canGoNext" @click="goToPage(totalPages)">
                    <Icon name="ChevronsRight" class="w-4 h-4" />
                </Button>
            </div>

            <!-- Loading Indicator -->
            <div v-if="isSearching && searchResults.length > 0" class="flex justify-center mt-6">
                <Icon name="Loader2" class="w-6 h-6 text-primary animate-spin" />
            </div>

            <!-- Results Count -->
            <div v-if="pagination.totalCount > 0" class="text-center mt-4 text-sm text-muted-foreground">
                Showing {{ (currentPage - 1) * pagination.pageSize + 1 }} - {{ Math.min(currentPage *
                    pagination.pageSize,
                    pagination.totalCount) }} of {{
                    pagination.totalCount }} results
            </div>
        </div>

        <!-- CF Mod Details Modal -->
        <HytaleCFModDetailsModal :mod="selectedMod" :open="showModDetailsModal"
            :installed-mod="selectedMod ? getInstalledModByCfId(selectedMod.id) : null"
            :installed-file-id="selectedMod ? getInstalledFileIdByCfId(selectedMod.id) : null"
            @close="showModDetailsModal = false" @install="handleInstall" />
    </div>
</template>

<style scoped>
.browse-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 1rem 0;
}

.pagination-pages {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.pagination-page-btn {
    min-width: 2rem;
}

.pagination-dots {
    padding: 0 0.5rem;
    color: var(--muted-foreground);
    user-select: none;
}
</style>
