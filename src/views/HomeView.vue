<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import {
    Home,
    Package,
    Layers,
    ArrowUpCircle,
    Clock,
    TrendingUp,
    Sparkles,
    Settings,
    Plus,
    ChevronRight,
    Folder,
    BarChart3,
    RefreshCw,
    GripVertical,
    X,
    Eye,
    EyeOff,
    LayoutGrid,
} from "lucide-vue-next";
import type { Mod, Modpack } from "@/types/electron";

const router = useRouter();
const toast = useToast();

// Data
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);
const isLoading = ref(true);
const modsWithUpdates = ref<Mod[]>([]);

// Widget configuration (stored in localStorage)
const defaultWidgets = [
    { id: "quick-stats", name: "Quick Stats", enabled: true, order: 0 },
    { id: "recent-modpacks", name: "Recent Modpacks", enabled: true, order: 1 },
    { id: "updates-available", name: "Updates Available", enabled: true, order: 2 },
    { id: "quick-actions", name: "Quick Actions", enabled: true, order: 3 },
    { id: "recent-mods", name: "Recently Added", enabled: true, order: 4 },
    { id: "tips", name: "Tips & Tricks", enabled: true, order: 5 },
];

const widgets = ref(loadWidgets());
const editMode = ref(false);

function loadWidgets() {
    const saved = localStorage.getItem("modex-home-widgets");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Ensure we have all default widgets (in case new ones were added)
            const mergedWidgets = defaultWidgets.map(defaultWidget => {
                const savedWidget = parsed.find((w: any) => w.id === defaultWidget.id);
                return savedWidget || defaultWidget;
            });
            return mergedWidgets;
        } catch {
            return [...defaultWidgets];
        }
    }
    return [...defaultWidgets];
}

function saveWidgets() {
    try {
        localStorage.setItem("modex-home-widgets", JSON.stringify(widgets.value));
    } catch (e) {
        console.error("Failed to save home widgets:", e);
    }
}

// Watch for widget changes and save
watch(widgets, saveWidgets, { deep: true });

function toggleWidget(id: string) {
    const widget = widgets.value.find((w: any) => w.id === id);
    if (widget) {
        widget.enabled = !widget.enabled;
        saveWidgets();
    }
}

function resetWidgets() {
    widgets.value = [...defaultWidgets];
    saveWidgets();
}

const enabledWidgets = computed(() =>
    widgets.value
        .filter((w: any) => w.enabled)
        .sort((a: any, b: any) => a.order - b.order)
);

// Helper to check if a widget is enabled
function isWidgetEnabled(id: string): boolean {
    return enabledWidgets.value.some((w: any) => w.id === id);
}

// Stats computed
const totalMods = computed(() => mods.value.length);
const totalModpacks = computed(() => modpacks.value.length);
const totalSize = computed(() => {
    return mods.value.reduce((sum, mod) => sum + (mod.file_size || 0), 0);
});

const recentModpacks = computed(() => {
    return [...modpacks.value]
        .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 4);
});

const recentMods = computed(() => {
    return [...mods.value]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 5);
});

// Tips rotation
const tips = [
    { icon: "💡", text: "Use profiles to quickly switch between mod configurations" },
    { icon: "🔗", text: "Link modpacks to remote sources for automatic updates" },
    { icon: "📦", text: "Drag & drop .jar files to quickly add mods" },
    { icon: "🎨", text: "Customize themes in Settings > Appearance" },
    { icon: "🔍", text: "Use the Discovery tab to find new mods based on your taste" },
    { icon: "⚡", text: "Press Ctrl+K for quick search across all content" },
    { icon: "📊", text: "Check Statistics to see your library insights" },
    { icon: "🔄", text: "Convert modpacks between different loaders easily" },
];
const currentTipIndex = ref(Math.floor(Math.random() * tips.length));

function nextTip() {
    currentTipIndex.value = (currentTipIndex.value + 1) % tips.length;
}

const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024)
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
};

function formatDate(date: string | number | undefined) {
    if (!date) return "Unknown";
    return new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

// Helper functions for type-unsafe property access in templates
function getPackColor(pack: Modpack): string {
    return (pack as any).color || '#6366f1';
}

function getPackIcon(pack: Modpack): string {
    return (pack as any).icon || '📦';
}

function getModAddedDate(mod: Mod): string | number | undefined {
    return mod.created_at;
}

async function loadData() {
    isLoading.value = true;
    try {
        const [modsData, modpacksData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
        ]);
        mods.value = modsData;
        modpacks.value = modpacksData;

        // Check for updates
        modsWithUpdates.value = modsData.filter((m) => (m as any).update_available);
    } catch (err) {
        console.error("Failed to load data:", err);
    } finally {
        isLoading.value = false;
    }
}

function goToModpack(id: string) {
    router.push(`/modpacks?id=${id}`);
}

function goToLibrary() {
    router.push("/library");
}

function goToModpacks() {
    router.push("/modpacks");
}

function goToStats() {
    router.push("/stats");
}

function goToSettings() {
    router.push("/settings");
}

onMounted(loadData);
</script>

<template>
    <div class="h-full flex flex-col bg-background">
        <!-- Header -->
        <div class="shrink-0 border-b border-border bg-card/50 p-4 sm:p-6">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 bg-primary/10 rounded-xl">
                        <Home class="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 class="text-xl sm:text-2xl font-bold">Welcome to ModEx</h1>
                        <p class="text-sm text-muted-foreground">
                            Your Minecraft mod management hub
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" @click="editMode = !editMode"
                        :class="editMode ? 'bg-primary/10 border-primary' : ''">
                        <LayoutGrid class="w-4 h-4 mr-2" />
                        {{ editMode ? "Done" : "Customize" }}
                    </Button>
                    <Button variant="outline" size="sm" @click="loadData" :disabled="isLoading">
                        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
                    </Button>
                </div>
            </div>
        </div>

        <!-- Edit Mode Panel -->
        <div v-if="editMode" class="shrink-0 border-b border-border bg-muted/30 p-4">
            <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium">Toggle Widgets</span>
                <Button variant="ghost" size="sm" @click="resetWidgets">
                    Reset to Default
                </Button>
            </div>
            <div class="flex flex-wrap gap-2">
                <button v-for="widget in widgets" :key="widget.id" @click="toggleWidget(widget.id)"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors" :class="widget.enabled
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-muted/50 border-border text-muted-foreground'
                        ">
                    <component :is="widget.enabled ? Eye : EyeOff" class="w-3.5 h-3.5" />
                    {{ widget.name }}
                </button>
            </div>
        </div>

        <!-- Content -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <RefreshCw class="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                <p class="text-muted-foreground">Loading dashboard...</p>
            </div>
        </div>

        <div v-else class="flex-1 overflow-auto p-4 sm:p-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                <!-- Quick Stats Widget -->
                <div v-if="isWidgetEnabled('quick-stats')"
                    class="lg:col-span-2 xl:col-span-3 rounded-xl border border-border bg-card p-4">
                    <h3 class="font-semibold flex items-center gap-2 mb-4">
                        <BarChart3 class="w-4 h-4 text-primary" />
                        Quick Stats
                    </h3>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div class="p-4 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 cursor-pointer hover:border-emerald-500/40 transition-colors"
                            @click="goToLibrary">
                            <Layers class="w-5 h-5 text-emerald-500 mb-2" />
                            <p class="text-2xl font-bold">{{ totalMods }}</p>
                            <p class="text-xs text-muted-foreground">Total Items</p>
                        </div>
                        <div class="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 cursor-pointer hover:border-blue-500/40 transition-colors"
                            @click="goToModpacks">
                            <Package class="w-5 h-5 text-blue-500 mb-2" />
                            <p class="text-2xl font-bold">{{ totalModpacks }}</p>
                            <p class="text-xs text-muted-foreground">Modpacks</p>
                        </div>
                        <div class="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 cursor-pointer hover:border-purple-500/40 transition-colors"
                            @click="goToStats">
                            <TrendingUp class="w-5 h-5 text-purple-500 mb-2" />
                            <p class="text-2xl font-bold">{{ formatSize(totalSize) }}</p>
                            <p class="text-xs text-muted-foreground">Library Size</p>
                        </div>
                        <div class="p-4 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20"
                            :class="modsWithUpdates.length > 0 ? 'cursor-pointer hover:border-orange-500/40' : ''">
                            <ArrowUpCircle class="w-5 h-5 text-orange-500 mb-2" />
                            <p class="text-2xl font-bold">{{ modsWithUpdates.length }}</p>
                            <p class="text-xs text-muted-foreground">Updates Available</p>
                        </div>
                    </div>
                </div>

                <!-- Recent Modpacks Widget -->
                <div v-if="isWidgetEnabled('recent-modpacks')" class="rounded-xl border border-border bg-card p-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold flex items-center gap-2">
                            <Clock class="w-4 h-4 text-primary" />
                            Recent Modpacks
                        </h3>
                        <Button variant="ghost" size="sm" @click="goToModpacks">
                            View All
                            <ChevronRight class="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                    <div class="space-y-2">
                        <div v-for="pack in recentModpacks" :key="pack.id"
                            class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                            @click="goToModpack(pack.id)">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                                :style="{ backgroundColor: getPackColor(pack) }">
                                {{ getPackIcon(pack) }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-medium truncate">{{ pack.name }}</p>
                                <p class="text-xs text-muted-foreground">
                                    {{ pack.minecraft_version }} · {{ pack.loader }}
                                </p>
                            </div>
                            <ChevronRight class="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div v-if="recentModpacks.length === 0" class="text-center py-6 text-muted-foreground text-sm">
                            No modpacks yet. Create your first one!
                        </div>
                    </div>
                </div>

                <!-- Updates Available Widget -->
                <div v-if="isWidgetEnabled('updates-available')" class="rounded-xl border border-border bg-card p-4">
                    <h3 class="font-semibold flex items-center gap-2 mb-4">
                        <ArrowUpCircle class="w-4 h-4 text-primary" />
                        Updates Available
                    </h3>
                    <div class="space-y-2">
                        <div v-for="mod in modsWithUpdates.slice(0, 5)" :key="mod.id"
                            class="flex items-center gap-3 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/20">
                            <ArrowUpCircle class="w-4 h-4 text-orange-500 shrink-0" />
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">{{ mod.name }}</p>
                                <p class="text-xs text-muted-foreground">
                                    {{ mod.version }} → New version available
                                </p>
                            </div>
                        </div>
                        <div v-if="modsWithUpdates.length === 0" class="text-center py-6 text-muted-foreground text-sm">
                            <ArrowUpCircle class="w-8 h-8 mx-auto mb-2 opacity-30" />
                            All mods are up to date!
                        </div>
                        <div v-else-if="modsWithUpdates.length > 5"
                            class="text-center text-xs text-muted-foreground pt-2">
                            And {{ modsWithUpdates.length - 5 }} more...
                        </div>
                    </div>
                </div>

                <!-- Quick Actions Widget -->
                <div v-if="isWidgetEnabled('quick-actions')" class="rounded-xl border border-border bg-card p-4">
                    <h3 class="font-semibold flex items-center gap-2 mb-4">
                        <Sparkles class="w-4 h-4 text-primary" />
                        Quick Actions
                    </h3>
                    <div class="grid grid-cols-2 gap-2">
                        <Button variant="outline" class="h-auto py-3 flex-col gap-1"
                            @click="router.push('/modpacks?create=true')">
                            <Plus class="w-5 h-5" />
                            <span class="text-xs">New Modpack</span>
                        </Button>
                        <Button variant="outline" class="h-auto py-3 flex-col gap-1" @click="goToLibrary">
                            <Folder class="w-5 h-5" />
                            <span class="text-xs">Browse Library</span>
                        </Button>
                        <Button variant="outline" class="h-auto py-3 flex-col gap-1" @click="goToStats">
                            <BarChart3 class="w-5 h-5" />
                            <span class="text-xs">Statistics</span>
                        </Button>
                        <Button variant="outline" class="h-auto py-3 flex-col gap-1" @click="goToSettings">
                            <Settings class="w-5 h-5" />
                            <span class="text-xs">Settings</span>
                        </Button>
                    </div>
                </div>

                <!-- Recently Added Widget -->
                <div v-if="isWidgetEnabled('recent-mods')" class="rounded-xl border border-border bg-card p-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold flex items-center gap-2">
                            <Layers class="w-4 h-4 text-primary" />
                            Recently Added
                        </h3>
                        <Button variant="ghost" size="sm" @click="goToLibrary">
                            View All
                            <ChevronRight class="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                    <div class="space-y-2">
                        <div v-for="mod in recentMods" :key="mod.id"
                            class="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                            <div class="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                <Layers class="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">{{ mod.name }}</p>
                                <p class="text-xs text-muted-foreground">
                                    {{ formatDate(getModAddedDate(mod)) }}
                                </p>
                            </div>
                        </div>
                        <div v-if="recentMods.length === 0" class="text-center py-6 text-muted-foreground text-sm">
                            No mods added yet
                        </div>
                    </div>
                </div>

                <!-- Tips Widget -->
                <div v-if="isWidgetEnabled('tips')"
                    class="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-purple-500/5 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold flex items-center gap-2">
                            <Sparkles class="w-4 h-4 text-primary" />
                            Tips & Tricks
                        </h3>
                        <Button variant="ghost" size="sm" @click="nextTip">
                            Next Tip
                        </Button>
                    </div>
                    <div class="p-4 rounded-lg bg-background/50 border border-border">
                        <div class="flex items-start gap-3">
                            <span class="text-2xl">{{ tips[currentTipIndex].icon }}</span>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                {{ tips[currentTipIndex].text }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
