<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
    Search,
    X,
    Package,
    Folder,
    Box,
    BarChart3,
    Home,
    Settings,
    BookOpen,
    LayoutGrid,
    FolderTree,
    ArrowRight,
    Command,
} from "lucide-vue-next";
import type { Mod, Modpack } from "@/types/electron";

const router = useRouter();
const isOpen = ref(false);
const searchQuery = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);

// Data
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);

// Quick navigation items
const quickNav = [
    { id: "home", name: "Home", icon: Home, route: "/home", type: "nav" },
    { id: "library", name: "Library", icon: Folder, route: "/library", type: "nav" },
    { id: "modpacks", name: "Modpacks", icon: Package, route: "/modpacks", type: "nav" },
    { id: "organize", name: "Organize", icon: FolderTree, route: "/organize", type: "nav" },
    { id: "stats", name: "Statistics", icon: BarChart3, route: "/stats", type: "nav" },
    { id: "sandbox", name: "Sandbox", icon: LayoutGrid, route: "/sandbox", type: "nav" },
    { id: "guide", name: "Guide", icon: BookOpen, route: "/guide", type: "nav" },
    { id: "settings", name: "Settings", icon: Settings, route: "/settings", type: "nav" },
];

// Search results
const searchResults = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();
    const results: Array<{
        id: string;
        name: string;
        type: "mod" | "modpack" | "nav";
        icon: any;
        route: string;
        subtitle?: string;
    }> = [];

    if (!query) {
        // Show quick nav when empty
        return quickNav.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type as "nav",
            icon: item.icon,
            route: item.route,
            subtitle: undefined as string | undefined,
        }));
    }

    // Search mods
    const matchingMods = mods.value
        .filter(
            (mod) =>
                mod.name.toLowerCase().includes(query) ||
                mod.slug?.toLowerCase().includes(query)
        )
        .slice(0, 5);

    for (const mod of matchingMods) {
        results.push({
            id: `mod-${mod.id}`,
            name: mod.name,
            type: "mod",
            icon: Box,
            route: `/library?mod=${mod.id}`,
            subtitle: `${mod.loader} • ${mod.game_version || "Unknown version"}`,
        });
    }

    // Search modpacks
    const matchingModpacks = modpacks.value
        .filter((pack) => pack.name.toLowerCase().includes(query))
        .slice(0, 5);

    for (const pack of matchingModpacks) {
        results.push({
            id: `pack-${pack.id}`,
            name: pack.name,
            type: "modpack",
            icon: Package,
            route: `/modpacks?id=${pack.id}`,
            subtitle: `${pack.loader || "Unknown"} • ${pack.minecraft_version || "Unknown"}`,
        });
    }

    // Search quick nav
    const matchingNav = quickNav.filter((item) =>
        item.name.toLowerCase().includes(query)
    );

    for (const item of matchingNav) {
        results.push({
            id: item.id,
            name: item.name,
            type: "nav",
            icon: item.icon,
            route: item.route,
        });
    }

    return results;
});

// Reset selection when results change
watch(searchResults, () => {
    selectedIndex.value = 0;
});

// Load data
async function loadData() {
    if (!window.api) return;
    try {
        const [modsData, modpacksData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
        ]);
        mods.value = modsData;
        modpacks.value = modpacksData;
    } catch (err) {
        console.error("Failed to load data for search:", err);
    }
}

function open() {
    isOpen.value = true;
    loadData();
    nextTick(() => {
        inputRef.value?.focus();
    });
}

function close() {
    isOpen.value = false;
    searchQuery.value = "";
    selectedIndex.value = 0;
}

function handleSelect(result: (typeof searchResults.value)[0]) {
    router.push(result.route);
    close();
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex.value = Math.min(
            selectedIndex.value + 1,
            searchResults.value.length - 1
        );
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    } else if (event.key === "Enter") {
        event.preventDefault();
        const result = searchResults.value[selectedIndex.value];
        if (result) {
            handleSelect(result);
        }
    } else if (event.key === "Escape") {
        close();
    }
}

// Global keyboard shortcut
function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (isOpen.value) {
            close();
        } else {
            open();
        }
    }
}

onMounted(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
    window.removeEventListener("keydown", handleGlobalKeydown);
});

// Expose open method for external triggers
defineExpose({ open, close });
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-background/80 backdrop-blur-sm" @click="close" />

                <!-- Modal -->
                <div
                    class="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                    <!-- Search Input -->
                    <div class="flex items-center px-4 border-b border-border">
                        <Search class="w-5 h-5 text-muted-foreground shrink-0" />
                        <input ref="inputRef" v-model="searchQuery" type="text"
                            placeholder="Search mods, modpacks, or navigate..."
                            class="flex-1 px-3 py-4 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                            @keydown="handleKeydown" />
                        <div class="flex items-center gap-1 text-xs text-muted-foreground">
                            <kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">ESC</kbd>
                        </div>
                        <button @click="close"
                            class="ml-2 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <X class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- Results -->
                    <div class="max-h-[50vh] overflow-auto">
                        <div v-if="searchResults.length === 0"
                            class="px-4 py-8 text-center text-muted-foreground text-sm">
                            No results found
                        </div>

                        <div v-else class="py-2">
                            <!-- Group by type -->
                            <template v-if="!searchQuery">
                                <div
                                    class="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                    Quick Navigation
                                </div>
                            </template>

                            <button v-for="(result, index) in searchResults" :key="result.id"
                                class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors" :class="selectedIndex === index
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'
                                    " @click="handleSelect(result)" @mouseenter="selectedIndex = index">
                                <div class="p-1.5 rounded-lg shrink-0" :class="result.type === 'mod'
                                        ? 'bg-emerald-500/10 text-emerald-500'
                                        : result.type === 'modpack'
                                            ? 'bg-blue-500/10 text-blue-500'
                                            : 'bg-muted text-muted-foreground'
                                    ">
                                    <component :is="result.icon" class="w-4 h-4" />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium truncate">{{ result.name }}</div>
                                    <div v-if="result.subtitle" class="text-xs text-muted-foreground truncate">
                                        {{ result.subtitle }}
                                    </div>
                                </div>
                                <ArrowRight v-if="selectedIndex === index" class="w-4 h-4 text-primary shrink-0" />
                            </button>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div
                        class="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
                        <div class="flex items-center gap-3">
                            <span class="flex items-center gap-1">
                                <kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑</kbd>
                                <kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↓</kbd>
                                navigate
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd class="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd>
                                select
                            </span>
                        </div>
                        <div class="flex items-center gap-1">
                            <Command class="w-3 h-3" />
                            <span>K to toggle</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
