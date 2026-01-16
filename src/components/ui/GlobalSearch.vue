<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import type { Mod, Modpack, ModexInstance } from "@/types";
import { useToast } from "@/composables/useToast";
import { useInstances } from "@/composables/useInstances";

const router = useRouter();
const toast = useToast();
const { launchInstance, smartLaunch, openInstanceFolder } = useInstances();

const isOpen = ref(false);
const searchQuery = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);

// Context menu state
const contextMenuTarget = ref<{ id: string; type: string; x: number; y: number; data?: any } | null>(null);
const showContextMenu = ref(false);

// Data
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);
const instances = ref<ModexInstance[]>([]);

// Result type union
type ResultType = "mod" | "modpack" | "instance" | "resourcepack" | "shader" | "nav" | "action";

// Quick navigation items
const quickNav = [
    { id: "home", name: "Home", icon: "Home", route: "/home", type: "nav" },
    { id: "library", name: "Library", icon: "Folder", route: "/library", type: "nav" },
    { id: "modpacks", name: "Modpacks", icon: "Package", route: "/modpacks", type: "nav" },
    { id: "guide", name: "Guide", icon: "BookOpen", route: "/guide", type: "nav" },
    { id: "settings", name: "Settings", icon: "Settings", route: "/settings", type: "nav" },
];

// Quick actions
const quickActions = [
    { id: "create-modpack", name: "Create New Modpack", icon: "Plus", action: "create-modpack", type: "action" },
    { id: "browse-mods", name: "Browse CurseForge Mods", icon: "Globe", route: "/library?action=browse", type: "action" },
    { id: "browse-modpacks", name: "Browse CurseForge Modpacks", icon: "Package", route: "/modpacks?action=browse", type: "action" },
    { id: "import-modpack", name: "Import Modpack", icon: "Download", action: "import-modpack", type: "action" },
];

// Icon map for different content types
function getIconForType(type: ResultType, contentType?: string): string {
    if (type === "mod") {
        if (contentType === "resourcepack") return "Image";
        if (contentType === "shader") return "Sparkles";
        return "Box";
    }
    if (type === "resourcepack") return "Image";
    if (type === "shader") return "Sparkles";
    if (type === "modpack") return "Package";
    if (type === "instance") return "Gamepad2";
    return "Layers";
}

// Color class for different content types
function getColorClassForType(type: ResultType, contentType?: string) {
    if (type === "mod" && contentType === "resourcepack") return "bg-blue-500/10 text-blue-400";
    if (type === "mod" && contentType === "shader") return "bg-pink-500/10 text-pink-400";
    if (type === "resourcepack") return "bg-blue-500/10 text-blue-400";
    if (type === "shader") return "bg-pink-500/10 text-pink-400";
    if (type === "mod") return "bg-primary/10 text-primary";
    if (type === "modpack") return "bg-primary/10 text-primary";
    if (type === "instance") return "bg-green-500/10 text-green-400";
    if (type === "action") return "bg-amber-500/10 text-amber-400";
    return "bg-muted/50 text-muted-foreground";
}

// Search results
const searchResults = computed(() => {
    const query = searchQuery.value.toLowerCase().trim();
    const results: Array<{
        id: string;
        name: string;
        type: ResultType;
        icon: string;
        route?: string;
        action?: string;
        subtitle?: string;
        contentType?: string;
        data?: any;
    }> = [];

    if (!query) {
        // Show quick actions first, then nav
        for (const item of quickActions) {
            results.push({
                id: item.id,
                name: item.name,
                type: item.type as ResultType,
                icon: item.icon,
                route: item.route,
                action: item.action,
            });
        }
        for (const item of quickNav) {
            results.push({
                id: item.id,
                name: item.name,
                type: item.type as ResultType,
                icon: item.icon,
                route: item.route,
            });
        }
        return results;
    }

    // Search mods (including resourcepacks and shaders)
    const matchingMods = mods.value
        .filter(
            (mod) =>
                mod.name.toLowerCase().includes(query) ||
                mod.slug?.toLowerCase().includes(query)
        )
        .slice(0, 8);

    for (const mod of matchingMods) {
        const contentType = mod.content_type || "mod";
        let typeLabel = "Mod";
        if (contentType === "resourcepack") typeLabel = "Resource Pack";
        else if (contentType === "shader") typeLabel = "Shader";

        results.push({
            id: `mod-${mod.id}`,
            name: mod.name,
            type: "mod",
            icon: getIconForType("mod", contentType),
            route: `/library?mod=${mod.id}`,
            subtitle: `${typeLabel} • ${mod.loader || "Unknown"} • ${mod.game_version || "Unknown version"}`,
            contentType,
            data: mod,
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
            icon: "Package",
            route: `/modpacks?id=${pack.id}`,
            subtitle: `${pack.loader || "Unknown"} • ${pack.minecraft_version || "Unknown"}`,
            data: pack,
        });
    }

    // Search instances
    const matchingInstances = instances.value
        .filter((inst) => inst.name.toLowerCase().includes(query))
        .slice(0, 3);

    for (const inst of matchingInstances) {
        results.push({
            id: `instance-${inst.id}`,
            name: inst.name,
            type: "instance",
            icon: "Gamepad2",
            subtitle: `Instance • ${inst.loader || "Unknown"} ${inst.loaderVersion || ""} • ${inst.minecraftVersion || "Unknown"}`,
            data: inst,
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

    // Search quick actions
    const matchingActions = quickActions.filter((item) =>
        item.name.toLowerCase().includes(query)
    );

    for (const item of matchingActions) {
        results.push({
            id: item.id,
            name: item.name,
            type: "action",
            icon: item.icon,
            route: item.route,
            action: item.action,
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
        const [modsData, modpacksData, instancesData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
            window.api.instances.getAll(),
        ]);
        mods.value = modsData;
        modpacks.value = modpacksData;
        instances.value = instancesData || [];
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
    closeContextMenu();
}

// Context menu functions
function openContextMenu(event: MouseEvent, result: (typeof searchResults.value)[0]) {
    event.preventDefault();
    event.stopPropagation();

    if (result.type === "nav" || result.type === "action") return; // No context menu for nav/action items

    contextMenuTarget.value = {
        id: result.id,
        type: result.type,
        x: event.clientX,
        y: event.clientY,
        data: result.data,
    };
    showContextMenu.value = true;
}

function closeContextMenu() {
    showContextMenu.value = false;
    contextMenuTarget.value = null;
}

// Context menu actions
async function handleContextAction(action: string) {
    if (!contextMenuTarget.value) return;

    const { id, type, data } = contextMenuTarget.value;
    const actualId = id.replace(/^(mod-|pack-|instance-)/, "");

    closeContextMenu();

    switch (action) {
        case "view":
            if (type === "mod") {
                router.push(`/library?mod=${actualId}`);
            } else if (type === "modpack") {
                router.push(`/modpacks?id=${actualId}`);
            }
            close();
            break;

        case "edit":
            if (type === "modpack") {
                // Navigate to modpack detail page for editing
                router.push(`/modpacks/${actualId}`);
                close();
            }
            break;

        case "play":
            if (type === "modpack" && window.api) {
                try {
                    // Use smart launch for modpacks
                    const pack = modpacks.value.find(p => p.id === actualId);
                    if (pack) {
                        toast.info("Starting...", `Launching ${pack.name}`);
                        close();
                        // Navigate to modpack (floating bar handles play)
                        router.push(`/modpacks/${actualId}?autolaunch=true`);
                    }
                } catch (err) {
                    toast.error("Couldn't launch");
                }
            } else if (type === "instance" && data) {
                try {
                    toast.info("Starting...", `Launching ${data.name}`);
                    close();
                    await launchInstance(data.id);
                } catch (err) {
                    toast.error("Couldn't launch instance");
                }
            }
            break;

        case "add-to-modpack":
            if (type === "mod") {
                router.push(`/library?mod=${actualId}&action=add`);
                close();
            }
            break;

        case "favorite":
            if (type === "mod") {
                const favorites = JSON.parse(localStorage.getItem("modex:favorites:mods") || "[]");
                const favSet = new Set(favorites);
                if (favSet.has(actualId)) {
                    favSet.delete(actualId);
                    toast.success("Unfavorited");
                } else {
                    favSet.add(actualId);
                    toast.success("Favorited ✓");
                }
                localStorage.setItem("modex:favorites:mods", JSON.stringify([...favSet]));
            }
            break;

        case "copy-name":
            const result = searchResults.value.find((r) => r.id === id);
            if (result) {
                await navigator.clipboard.writeText(result.name);
                toast.success("Copied ✓");
            }
            break;

        case "open-source":
            if (type === "mod" && data) {
                if (data.website_url) {
                    window.open(data.website_url, "_blank");
                } else if (data.cf_project_id) {
                    window.open(`https://www.curseforge.com/minecraft/mc-mods/${data.slug || data.cf_project_id}`, "_blank");
                } else if (data.mr_project_id) {
                    window.open(`https://modrinth.com/mod/${data.slug || data.mr_project_id}`, "_blank");
                } else {
                    toast.error("No source URL", "This mod doesn't have a linked website.");
                }
            }
            break;

        case "open-folder":
            if (type === "modpack" && window.api) {
                try {
                    await window.api.modpacks.openFolder(actualId);
                } catch (err) {
                    toast.error("Couldn't open folder");
                }
            } else if (type === "instance") {
                try {
                    await openInstanceFolder(actualId);
                } catch (err) {
                    toast.error("Couldn't open folder");
                }
            }
            break;

        case "clone":
            if (type === "modpack" && window.api) {
                try {
                    const pack = modpacks.value.find((p) => p.id === actualId);
                    if (pack) {
                        await window.api.modpacks.clone(actualId, `${pack.name} (Copy)`);
                        toast.success("Duplicated ✓");
                        loadData();
                    }
                } catch (err) {
                    toast.error("Couldn't duplicate pack");
                }
            }
            break;

        case "export":
            if (type === "modpack" && window.api) {
                // Navigate to modpack with export action
                close();
                router.push(`/modpacks?id=${actualId}&action=export`);
            }
            break;

        case "delete":
            if (type === "mod" && window.api) {
                try {
                    await window.api.mods.delete(actualId);
                    toast.success("Deleted ✓");
                    loadData();
                } catch (err) {
                    toast.error("Couldn't delete mod");
                }
            } else if (type === "modpack" && window.api) {
                try {
                    await window.api.modpacks.delete(actualId);
                    toast.success("Deleted ✓");
                    loadData();
                } catch (err) {
                    toast.error("Couldn't delete pack");
                }
            } else if (type === "instance" && window.api) {
                try {
                    await window.api.instances.delete(actualId);
                    toast.success("Deleted ✓");
                    loadData();
                } catch (err) {
                    toast.error("Couldn't delete instance");
                }
            }
            break;
    }
}

async function handleSelect(result: (typeof searchResults.value)[0]) {
    // Handle actions
    if (result.action) {
        switch (result.action) {
            case "create-modpack":
                router.push("/modpacks?action=create");
                break;
            case "import-modpack":
                router.push("/modpacks?action=import");
                break;
            default:
                if (result.route) {
                    router.push(result.route);
                }
        }
        close();
        return;
    }

    // Handle instances (no route, need to launch or show)
    if (result.type === "instance" && result.data) {
        // Navigate to the linked modpack if exists
        if (result.data.modpackId) {
            router.push(`/modpacks/${result.data.modpackId}`);
        } else {
            toast.info("No linked pack", "This instance isn't connected to a modpack.");
        }
        close();
        return;
    }

    // Handle routes
    if (result.route) {
        router.push(result.route);
        close();
    }
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
            <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-background/60 backdrop-blur-md" @click="close" />

                <!-- Modal -->
                <div
                    class="relative w-full max-w-lg bg-card/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-2xl shadow-black/30 overflow-hidden">
                    <!-- Search Input -->
                    <div class="flex items-center px-4 border-b border-border/50">
                        <Icon name="Search" class="w-4 h-4 text-muted-foreground shrink-0" />
                        <input ref="inputRef" v-model="searchQuery" type="text"
                            placeholder="Search mods, modpacks, or navigate..."
                            class="flex-1 px-3 py-3 bg-transparent outline-none ring-0 border-0 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                            @keydown="handleKeydown" />
                        <div class="flex items-center gap-1 text-xs text-muted-foreground">
                            <kbd
                                class="px-1.5 py-0.5 bg-muted/50 rounded text-caption font-mono border border-border/50">ESC</kbd>
                        </div>
                        <button @click="close"
                            class="ml-2 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Icon name="X" class="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <!-- Results -->
                    <div class="max-h-[50vh] overflow-auto">
                        <div v-if="searchResults.length === 0"
                            class="px-4 py-8 text-center text-muted-foreground text-sm">
                            No results found
                        </div>

                        <div v-else class="py-1.5">
                            <!-- Section headers when no search query -->
                            <template v-if="!searchQuery">
                                <div
                                    class="px-3 py-1.5 text-caption uppercase tracking-wider text-muted-foreground/70 font-medium">
                                    Quick Actions
                                </div>

                                <!-- Quick actions -->
                                <div v-for="(result, index) in searchResults.slice(0, quickActions.length)"
                                    :key="result.id"
                                    class="group w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-md text-left transition-colors cursor-pointer"
                                    :class="selectedIndex === index
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'" @click="handleSelect(result)"
                                    @mouseenter="selectedIndex = index" style="width: calc(100% - 12px)">
                                    <div class="p-1.5 rounded-md shrink-0 bg-amber-500/10 text-amber-400">
                                        <Icon :name="result.icon" class="w-3.5 h-3.5" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium truncate">{{ result.name }}</div>
                                    </div>
                                    <Icon v-if="selectedIndex === index" name="ArrowRight"
                                        class="w-3.5 h-3.5 text-primary shrink-0" />
                                </div>

                                <div
                                    class="px-3 py-1.5 mt-2 text-caption uppercase tracking-wider text-muted-foreground/70 font-medium">
                                    Navigation
                                </div>

                                <!-- Navigation items -->
                                <div v-for="(result, index) in searchResults.slice(quickActions.length)"
                                    :key="result.id"
                                    class="group w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-md text-left transition-colors cursor-pointer"
                                    :class="selectedIndex === (index + quickActions.length)
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'" @click="handleSelect(result)"
                                    @mouseenter="selectedIndex = index + quickActions.length"
                                    style="width: calc(100% - 12px)">
                                    <div class="p-1.5 rounded-md shrink-0 bg-muted/50 text-muted-foreground">
                                        <Icon :name="result.icon" class="w-3.5 h-3.5" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium truncate">{{ result.name }}</div>
                                    </div>
                                    <Icon v-if="selectedIndex === (index + quickActions.length)" name="ArrowRight"
                                        class="w-3.5 h-3.5 text-primary shrink-0" />
                                </div>
                            </template>

                            <!-- Search results with mixed content -->
                            <template v-else>

                                <div v-for="(result, index) in searchResults" :key="result.id"
                                    class="group w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-md text-left transition-colors cursor-pointer"
                                    :class="selectedIndex === index
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-foreground'" @click="handleSelect(result)"
                                    @mouseenter="selectedIndex = index" @contextmenu="openContextMenu($event, result)"
                                    style="width: calc(100% - 12px)">
                                    <div class="p-1.5 rounded-md shrink-0"
                                        :class="getColorClassForType(result.type as ResultType, result.contentType)">
                                        <Icon :name="result.icon" class="w-3.5 h-3.5" />
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium truncate">{{ result.name }}</div>
                                        <div v-if="result.subtitle" class="text-micro text-muted-foreground truncate">
                                            {{ result.subtitle }}
                                        </div>
                                    </div>
                                    <!-- Type badge -->
                                    <span v-if="result.type === 'instance'"
                                        class="px-1.5 py-0.5 rounded text-micro font-medium uppercase bg-green-500/10 text-green-400">
                                        Instance
                                    </span>
                                    <!-- Action button for contextual items -->
                                    <button v-if="result.type !== 'nav' && result.type !== 'action'"
                                        @click.stop="openContextMenu($event, result)"
                                        class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
                                        :class="{ 'opacity-100': selectedIndex === index }">
                                        <Icon name="MoreHorizontal" class="w-3.5 h-3.5" />
                                    </button>
                                    <Icon v-else-if="selectedIndex === index" name="ArrowRight"
                                        class="w-3.5 h-3.5 text-primary shrink-0" />
                                </div>
                            </template>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div
                        class="px-4 py-2 border-t border-border/50 bg-muted/20 flex items-center justify-between text-micro text-muted-foreground/70">
                        <div class="flex items-center gap-3">
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="px-1 py-0.5 bg-muted/50 rounded text-micro font-mono border border-border/30">↑↓</kbd>
                                navigate
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="px-1 py-0.5 bg-muted/50 rounded text-micro font-mono border border-border/30">↵</kbd>
                                select
                            </span>
                        </div>
                        <div class="flex items-center gap-1">
                            <Icon name="Command" class="w-3 h-3" />
                            <span>K to toggle</span>
                        </div>
                    </div>
                </div>

                <!-- Context Menu -->
                <Transition name="fade">
                    <div v-if="showContextMenu && contextMenuTarget"
                        class="fixed z-[110] min-w-[180px] bg-card/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-xl shadow-black/20 py-1"
                        :style="{ left: contextMenuTarget.x + 'px', top: contextMenuTarget.y + 'px' }">
                        <!-- Mod actions -->
                        <template v-if="contextMenuTarget.type === 'mod'">
                            <button @click="handleContextAction('view')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Eye" class="w-3.5 h-3.5 text-muted-foreground" />
                                View Details
                            </button>
                            <button @click="handleContextAction('add-to-modpack')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="PlusCircle" class="w-3.5 h-3.5 text-muted-foreground" />
                                Add to Modpack
                            </button>
                            <button @click="handleContextAction('favorite')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Heart" class="w-3.5 h-3.5 text-muted-foreground" />
                                Toggle Favorite
                            </button>
                            <button @click="handleContextAction('open-source')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="ExternalLink" class="w-3.5 h-3.5 text-muted-foreground" />
                                Open Source Page
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('copy-name')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Copy" class="w-3.5 h-3.5 text-muted-foreground" />
                                Copy Name
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('delete')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Icon name="Trash2" class="w-3.5 h-3.5" />
                                Delete from Library
                            </button>
                        </template>

                        <!-- Modpack actions -->
                        <template v-else-if="contextMenuTarget.type === 'modpack'">
                            <button @click="handleContextAction('play')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary/10 text-primary transition-colors font-medium">
                                <Icon name="Play" class="w-3.5 h-3.5" />
                                Play
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('edit')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Edit" class="w-3.5 h-3.5 text-muted-foreground" />
                                Edit Modpack
                            </button>
                            <button @click="handleContextAction('export')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Download" class="w-3.5 h-3.5 text-muted-foreground" />
                                Export
                            </button>
                            <button @click="handleContextAction('open-folder')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="FolderOpen" class="w-3.5 h-3.5 text-muted-foreground" />
                                Open Folder
                            </button>
                            <button @click="handleContextAction('clone')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Copy" class="w-3.5 h-3.5 text-muted-foreground" />
                                Clone
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('copy-name')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Copy" class="w-3.5 h-3.5 text-muted-foreground" />
                                Copy Name
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('delete')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Icon name="Trash2" class="w-3.5 h-3.5" />
                                Delete
                            </button>
                        </template>

                        <!-- Instance actions -->
                        <template v-else-if="contextMenuTarget.type === 'instance'">
                            <button @click="handleContextAction('play')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary/10 text-primary transition-colors font-medium">
                                <Icon name="Play" class="w-3.5 h-3.5" />
                                Launch
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('open-folder')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="FolderOpen" class="w-3.5 h-3.5 text-muted-foreground" />
                                Open Folder
                            </button>
                            <button @click="handleContextAction('copy-name')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                                <Icon name="Copy" class="w-3.5 h-3.5 text-muted-foreground" />
                                Copy Name
                            </button>
                            <div class="my-1 border-t border-border/50"></div>
                            <button @click="handleContextAction('delete')"
                                class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                                <Icon name="Trash2" class="w-3.5 h-3.5" />
                                Delete Instance
                            </button>
                        </template>
                    </div>
                </Transition>

                <!-- Context menu backdrop -->
                <div v-if="showContextMenu" class="fixed inset-0 z-[105]" @click="closeContextMenu"></div>
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
