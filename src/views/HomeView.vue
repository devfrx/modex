<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from "vue";
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
    Eye,
    EyeOff,
    LayoutGrid,
    Compass,
    Zap,
    Crown,
    Calendar,
    Activity,
    Target,
    Shield,
    Coffee,
    Moon,
    Sun,
} from "lucide-vue-next";
import type { Mod, Modpack } from "@/types/electron";

const router = useRouter();
const toast = useToast();

// Data
const mods = ref<Mod[]>([]);
const modpacks = ref<Modpack[]>([]);
const isLoading = ref(true);
const modsWithUpdates = ref<Mod[]>([]);

// Time-based greeting
const currentHour = new Date().getHours();
const greeting = computed(() => {
    if (currentHour < 12) return { text: "Good morning", icon: Coffee, color: "text-purple-500" };
    if (currentHour < 18) return { text: "Good afternoon", icon: Sun, color: "text-purple-500" };
    return { text: "Good evening", icon: Moon, color: "text-purple-400" };
});

// Animated stats
const animatedTotalMods = ref(0);
const animatedTotalModpacks = ref(0);
const animatedUpdates = ref(0);

function animateValue(start: number, end: number, setter: (val: number) => void, duration = 1000) {
    const startTime = performance.now();
    const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setter(Math.floor(start + (end - start) * eased));
        if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
}

// Widget configuration (stored in localStorage)
const defaultWidgets = [
    { id: "hero-stats", name: "Hero Stats", enabled: true, order: 0 },
    { id: "quick-actions", name: "Quick Actions", enabled: true, order: 1 },
    { id: "modpack-spotlight", name: "Modpack Spotlight", enabled: true, order: 2 },
    { id: "recent-activity", name: "Recent Activity", enabled: true, order: 3 },
    { id: "updates-feed", name: "Updates Feed", enabled: true, order: 4 },
    { id: "loader-stats", name: "Loader Distribution", enabled: true, order: 5 },
    { id: "tips", name: "Pro Tips", enabled: true, order: 6 },
];

const widgets = ref(loadWidgets());
const editMode = ref(false);

function loadWidgets() {
    const saved = localStorage.getItem("modex-home-widgets-v3");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
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
        localStorage.setItem("modex-home-widgets-v3", JSON.stringify(widgets.value));
    } catch (e) {
        console.error("Failed to save home widgets:", e);
    }
}

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

function isWidgetEnabled(id: string): boolean {
    return enabledWidgets.value.some((w: any) => w.id === id);
}

// Stats computed
const totalMods = computed(() => mods.value.length);
const totalModpacks = computed(() => modpacks.value.length);
const totalSize = computed(() => {
    return mods.value.reduce((sum, mod) => sum + (mod.file_size || 0), 0);
});

// Loader breakdown for mini chart
const loaderBreakdown = computed(() => {
    const counts: Record<string, number> = {};
    mods.value.forEach((mod) => {
        const loader = mod.loader || "Other";
        counts[loader] = (counts[loader] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([name, count]) => ({ name, count, percent: mods.value.length > 0 ? (count / mods.value.length) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);
});

const spotlightModpack = computed(() => {
    if (modpacks.value.length === 0) return null;
    return [...modpacks.value].sort(
        (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
    )[0];
});

const recentModpacks = computed(() => {
    return [...modpacks.value]
        .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 4);
});

const recentMods = computed(() => {
    return [...mods.value]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 6);
});

// Tips with more variety - using component references
const tips = [
    { icon: Zap, title: "Quick Search", text: "Press Ctrl+K anywhere to search across all your mods and modpacks" },
    { icon: Settings, title: "Customize", text: "Head to Settings > Appearance to personalize your ModEx experience" },
    { icon: Package, title: "Drag & Drop", text: "Simply drag .jar files into the library to add mods instantly" },
    { icon: RefreshCw, title: "Auto Updates", text: "ModEx can check for mod updates automatically in the background" },
    { icon: BarChart3, title: "Analytics", text: "Check the Statistics page for insights about your mod collection" },
    { icon: Layers, title: "Profiles", text: "Create profiles to quickly switch between different mod configurations" },
    { icon: Target, title: "Smart Discovery", text: "The Sandbox page lets you visualize your mod relationships" },
    { icon: Activity, title: "Export", text: "Share your modpacks by exporting them as portable archives" },
];
const currentTipIndex = ref(Math.floor(Math.random() * tips.length));
let tipInterval: ReturnType<typeof setInterval> | null = null;

function nextTip() {
    currentTipIndex.value = (currentTipIndex.value + 1) % tips.length;
}

// Quick action shortcuts
const quickActions = [
    { id: "new-modpack", icon: Plus, label: "New Modpack", color: "from-violet-500 to-purple-600", route: "/modpacks?create=true" },
    { id: "browse-library", icon: Folder, label: "Library", color: "from-emerald-500 to-teal-600", route: "/library" },
    { id: "sandbox", icon: Compass, label: "Sandbox", color: "from-blue-500 to-cyan-600", route: "/sandbox" },
    { id: "stats", icon: BarChart3, label: "Statistics", color: "from-orange-500 to-amber-600", route: "/stats" },
];

const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024)
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
};

function formatDate(date: string | number | undefined) {
    if (!date) return "Unknown";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getPackColor(pack: Modpack): string {
    const colors = ["#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308", "#06b6d4", "#ec4899"];
    const hash = pack.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

function getPackIcon(pack: Modpack): string {
    // Return initials instead of emojis
    const words = pack.name.split(/[\s-_]+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return pack.name.substring(0, 2).toUpperCase();
}

function getLoaderColor(loader: string): string {
    const l = loader.toLowerCase();
    if (l.includes("forge")) return "bg-orange-500";
    if (l.includes("fabric")) return "bg-blue-500";
    if (l.includes("quilt")) return "bg-purple-500";
    if (l.includes("neoforge")) return "bg-red-500";
    return "bg-gray-500";
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

        // Animate numbers
        animateValue(0, modsData.length, (v) => (animatedTotalMods.value = v));
        animateValue(0, modpacksData.length, (v) => (animatedTotalModpacks.value = v));
        animateValue(0, modsWithUpdates.value.length, (v) => (animatedUpdates.value = v));
    } catch (err) {
        console.error("Failed to load data:", err);
    } finally {
        isLoading.value = false;
    }
}

function goToModpack(id: string) {
    router.push(`/modpacks?id=${id}`);
}

function navigate(route: string) {
    router.push(route);
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

onMounted(() => {
    loadData();
    tipInterval = setInterval(nextTip, 10000);
});

onUnmounted(() => {
    if (tipInterval) clearInterval(tipInterval);
});
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Compact Header -->
        <div class="shrink-0 relative border-b border-border z-20">
            <div class="relative px-3 sm:px-6 py-3 sm:py-4 bg-background/80 backdrop-blur-sm">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
                    <div class="flex items-center gap-3 sm:gap-4">
                        <div class="flex items-center gap-2 sm:gap-3">
                            <div class="p-2 sm:p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                                <component :is="greeting.icon" class="w-4 h-4 sm:w-5 sm:h-5" :class="greeting.color" />
                            </div>
                            <div>
                                <h1 class="text-base sm:text-lg font-semibold tracking-tight">
                                    {{ greeting.text }}
                                </h1>
                                <p class="text-[10px] sm:text-xs text-muted-foreground">
                                    {{ totalMods }} mods • {{ totalModpacks }} modpacks
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <Button variant="outline" size="sm" @click="editMode = !editMode"
                            class="h-7 sm:h-8 px-2 sm:px-3 text-xs"
                            :class="editMode ? 'bg-primary/20 border-primary' : ''">
                            <LayoutGrid class="w-3.5 h-3.5 mr-1.5" />
                            {{ editMode ? "Done" : "Customize" }}
                        </Button>
                        <Button variant="outline" size="sm" @click="loadData" :disabled="isLoading"
                            class="h-7 sm:h-8 px-2 sm:px-3">
                            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoading }" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Edit Mode Panel -->
        <Transition name="slide">
            <div v-if="editMode" class="shrink-0 border-b border-border bg-muted/50 backdrop-blur-sm px-6 py-4">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-medium">Toggle Widgets</span>
                    <Button variant="ghost" size="sm" @click="resetWidgets">Reset to Default</Button>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button v-for="widget in widgets" :key="widget.id" @click="toggleWidget(widget.id)"
                        class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all" :class="widget.enabled
                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                            : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'">
                        <component :is="widget.enabled ? Eye : EyeOff" class="w-3.5 h-3.5" />
                        {{ widget.name }}
                    </button>
                </div>
            </div>
        </Transition>

        <!-- Loading State -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <div class="relative">
                    <div class="w-16 h-16 rounded-full border-4 border-muted animate-pulse" />
                    <RefreshCw
                        class="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                </div>
                <p class="text-muted-foreground mt-4">Loading your dashboard...</p>
            </div>
        </div>

        <!-- Main Content -->
        <div v-else class="flex-1 overflow-auto px-6 py-6 sm:px-8">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">

                <!-- Hero Stats - Full Width -->
                <div v-if="isWidgetEnabled('hero-stats')" class="lg:col-span-12">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <!-- Total Items -->
                        <div class="group relative p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 cursor-pointer hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
                            @click="goToLibrary">
                            <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight class="w-4 h-4 text-emerald-500" />
                            </div>
                            <div class="p-2 bg-emerald-500/20 rounded-xl w-fit mb-3">
                                <Layers class="w-5 h-5 text-emerald-500" />
                            </div>
                            <p class="text-3xl font-bold text-emerald-500">{{ animatedTotalMods }}</p>
                            <p class="text-sm text-muted-foreground mt-1">Total Items</p>
                        </div>

                        <!-- Modpacks -->
                        <div class="group relative p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 cursor-pointer hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300"
                            @click="goToModpacks">
                            <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight class="w-4 h-4 text-blue-500" />
                            </div>
                            <div class="p-2 bg-blue-500/20 rounded-xl w-fit mb-3">
                                <Package class="w-5 h-5 text-blue-500" />
                            </div>
                            <p class="text-3xl font-bold text-blue-500">{{ animatedTotalModpacks }}</p>
                            <p class="text-sm text-muted-foreground mt-1">Modpacks</p>
                        </div>

                        <!-- Library Size -->
                        <div class="group relative p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 cursor-pointer hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300"
                            @click="goToStats">
                            <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight class="w-4 h-4 text-purple-500" />
                            </div>
                            <div class="p-2 bg-purple-500/20 rounded-xl w-fit mb-3">
                                <TrendingUp class="w-5 h-5 text-purple-500" />
                            </div>
                            <p class="text-3xl font-bold text-purple-500">{{ formatSize(totalSize) }}</p>
                            <p class="text-sm text-muted-foreground mt-1">Library Size</p>
                        </div>

                        <!-- Updates Available -->
                        <div class="group relative p-5 rounded-2xl border transition-all duration-300" :class="modsWithUpdates.length > 0
                            ? 'bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20 cursor-pointer hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/10'
                            : 'bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20'">
                            <div v-if="modsWithUpdates.length > 0" class="absolute top-3 right-3">
                                <span class="flex h-2 w-2">
                                    <span
                                        class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                    <span class="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                </span>
                            </div>
                            <div class="p-2 rounded-xl w-fit mb-3"
                                :class="modsWithUpdates.length > 0 ? 'bg-orange-500/20' : 'bg-green-500/20'">
                                <ArrowUpCircle class="w-5 h-5"
                                    :class="modsWithUpdates.length > 0 ? 'text-orange-500' : 'text-green-500'" />
                            </div>
                            <p class="text-3xl font-bold"
                                :class="modsWithUpdates.length > 0 ? 'text-orange-500' : 'text-green-500'">
                                {{ animatedUpdates }}
                            </p>
                            <p class="text-sm text-muted-foreground mt-1">
                                {{ modsWithUpdates.length > 0 ? "Updates Ready" : "All Up to Date" }}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div v-if="isWidgetEnabled('quick-actions')" class="lg:col-span-4">
                    <div class="rounded-2xl border border-border bg-card p-5 h-full">
                        <h3 class="font-semibold flex items-center gap-2 mb-4">
                            <Zap class="w-4 h-4 text-primary" />
                            Quick Actions
                        </h3>
                        <div class="grid grid-cols-2 gap-3">
                            <button v-for="action in quickActions" :key="action.id" @click="navigate(action.route)"
                                class="group relative p-4 rounded-xl bg-gradient-to-br transition-all duration-300 hover:scale-105 hover:shadow-lg overflow-hidden"
                                :class="action.color">
                                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                <component :is="action.icon" class="w-6 h-6 text-white mb-2 relative z-10" />
                                <p class="text-sm font-medium text-white relative z-10">{{ action.label }}</p>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Modpack Spotlight -->
                <div v-if="isWidgetEnabled('modpack-spotlight') && spotlightModpack" class="lg:col-span-4">
                    <div class="rounded-2xl border border-border bg-card p-5 h-full">
                        <h3 class="font-semibold flex items-center gap-2 mb-4">
                            <Crown class="w-4 h-4 text-yellow-500" />
                            Featured Modpack
                        </h3>
                        <div class="group p-4 rounded-xl border border-border bg-gradient-to-br from-muted/50 to-transparent cursor-pointer hover:border-primary/30 transition-all"
                            @click="goToModpack(spotlightModpack.id)">
                            <div class="flex items-start gap-4">
                                <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                    :style="{ backgroundColor: getPackColor(spotlightModpack) }">
                                    {{ getPackIcon(spotlightModpack) }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold truncate group-hover:text-primary transition-colors">
                                        {{ spotlightModpack.name }}
                                    </h4>
                                    <p class="text-sm text-muted-foreground mt-1">
                                        {{ spotlightModpack.minecraft_version }} • {{ spotlightModpack.loader }}
                                    </p>
                                    <div class="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                                        <span class="flex items-center gap-1">
                                            <Calendar class="w-3 h-3" />
                                            {{ formatDate(spotlightModpack.updated_at || spotlightModpack.created_at) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4 pt-4 border-t border-border flex items-center justify-between">
                                <span class="text-xs text-muted-foreground">Click to open</span>
                                <ChevronRight
                                    class="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Pro Tips -->
                <div v-if="isWidgetEnabled('tips')" class="lg:col-span-4">
                    <div
                        class="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-purple-500/5 to-blue-500/5 p-5 h-full">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Sparkles class="w-4 h-4 text-primary" />
                                Pro Tips
                            </h3>
                            <Button variant="ghost" size="sm" @click="nextTip" class="text-xs">
                                Next
                                <ChevronRight class="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                        <Transition name="fade" mode="out-in">
                            <div :key="currentTipIndex" class="p-4 rounded-xl bg-background/50 border border-border">
                                <div class="flex items-start gap-3">
                                    <div class="p-2 bg-primary/10 rounded-lg shrink-0">
                                        <component :is="tips[currentTipIndex].icon" class="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h4 class="font-medium text-sm">{{ tips[currentTipIndex].title }}</h4>
                                        <p class="text-sm text-muted-foreground mt-1 leading-relaxed">
                                            {{ tips[currentTipIndex].text }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Transition>
                        <div class="flex justify-center gap-1 mt-4">
                            <button v-for="(_, index) in tips" :key="index" @click="currentTipIndex = index"
                                class="w-1.5 h-1.5 rounded-full transition-colors"
                                :class="currentTipIndex === index ? 'bg-primary' : 'bg-muted-foreground/30'" />
                        </div>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div v-if="isWidgetEnabled('recent-activity')" class="lg:col-span-8">
                    <div class="rounded-2xl border border-border bg-card p-5">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Activity class="w-4 h-4 text-primary" />
                                Recent Activity
                            </h3>
                            <Button variant="ghost" size="sm" @click="goToLibrary">
                                View All
                                <ChevronRight class="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div v-for="mod in recentMods" :key="mod.id"
                                class="group p-3 rounded-xl border border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50 transition-all cursor-pointer">
                                <div class="flex items-start gap-3">
                                    <div
                                        class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                        <img v-if="mod.thumbnail_url || mod.logo_url"
                                            :src="mod.logo_url || mod.thumbnail_url"
                                            class="w-full h-full object-cover" />
                                        <Layers v-else class="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                            {{ mod.name }}
                                        </p>
                                        <p class="text-xs text-muted-foreground mt-0.5">{{ formatDate(mod.created_at) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div v-if="recentMods.length === 0"
                                class="col-span-full text-center py-8 text-muted-foreground text-sm">
                                <Layers class="w-8 h-8 mx-auto mb-2 opacity-30" />
                                No mods added yet
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Updates Feed -->
                <div v-if="isWidgetEnabled('updates-feed')" class="lg:col-span-4">
                    <div class="rounded-2xl border border-border bg-card p-5 h-full">
                        <h3 class="font-semibold flex items-center gap-2 mb-4">
                            <ArrowUpCircle class="w-4 h-4 text-orange-500" />
                            Updates Feed
                        </h3>
                        <div class="space-y-2">
                            <div v-for="mod in modsWithUpdates.slice(0, 4)" :key="mod.id"
                                class="flex items-center gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/30 transition-colors">
                                <div
                                    class="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                                    <ArrowUpCircle class="w-4 h-4 text-orange-500" />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium truncate">{{ mod.name }}</p>
                                    <p class="text-xs text-muted-foreground">{{ mod.version }}</p>
                                </div>
                            </div>
                            <div v-if="modsWithUpdates.length === 0" class="text-center py-8">
                                <div
                                    class="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                                    <Shield class="w-6 h-6 text-green-500" />
                                </div>
                                <p class="text-sm font-medium text-green-500">All Up to Date!</p>
                                <p class="text-xs text-muted-foreground mt-1">Your mods are current</p>
                            </div>
                            <div v-else-if="modsWithUpdates.length > 4" class="text-center pt-2">
                                <Button variant="ghost" size="sm" class="text-xs text-orange-500">
                                    +{{ modsWithUpdates.length - 4 }} more updates
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Loader Distribution -->
                <div v-if="isWidgetEnabled('loader-stats') && loaderBreakdown.length > 0" class="lg:col-span-4">
                    <div class="rounded-2xl border border-border bg-card p-5">
                        <h3 class="font-semibold flex items-center gap-2 mb-4">
                            <Target class="w-4 h-4 text-primary" />
                            Loader Distribution
                        </h3>
                        <div class="space-y-3">
                            <div v-for="loader in loaderBreakdown" :key="loader.name" class="flex items-center gap-3">
                                <div class="w-2 h-2 rounded-full" :class="getLoaderColor(loader.name)" />
                                <span class="text-sm flex-1">{{ loader.name }}</span>
                                <span class="text-sm text-muted-foreground">{{ loader.count }}</span>
                                <div class="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-500"
                                        :class="getLoaderColor(loader.name)" :style="{ width: `${loader.percent}%` }" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Modpacks -->
                <div v-if="recentModpacks.length > 0" class="lg:col-span-4">
                    <div class="rounded-2xl border border-border bg-card p-5">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold flex items-center gap-2">
                                <Package class="w-4 h-4 text-primary" />
                                Recent Modpacks
                            </h3>
                            <Button variant="ghost" size="sm" @click="goToModpacks">
                                All
                                <ChevronRight class="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                        <div class="space-y-2">
                            <div v-for="pack in recentModpacks" :key="pack.id"
                                class="group flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors"
                                @click="goToModpack(pack.id)">
                                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                                    :style="{ backgroundColor: getPackColor(pack) }">
                                    {{ getPackIcon(pack) }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="font-medium truncate group-hover:text-primary transition-colors">
                                        {{ pack.name }}
                                    </p>
                                    <p class="text-xs text-muted-foreground">
                                        {{ pack.minecraft_version }} • {{ pack.loader }}
                                    </p>
                                </div>
                                <ChevronRight
                                    class="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
    transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
