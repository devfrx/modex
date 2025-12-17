<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import Button from "@/components/ui/Button.vue";
import {
    Package,
    Layers,
    ArrowUpCircle,
    TrendingUp,
    Sparkles,
    Settings,
    Plus,
    ChevronRight,
    Folder,
    BarChart3,
    RefreshCw,
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
    Play,
    Download,
    ArrowRight,
    CheckCircle2,
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
    if (currentHour < 12) return { text: "Good morning", icon: Coffee, color: "text-amber-400" };
    if (currentHour < 18) return { text: "Good afternoon", icon: Sun, color: "text-yellow-400" };
    return { text: "Good evening", icon: Moon, color: "text-indigo-400" };
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
        .slice(0, 3);
});

const recentMods = computed(() => {
    return [...mods.value]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 6);
});

// Tips carousel
const tips = [
    { icon: Zap, title: "Quick Search", text: "Press Ctrl+K anywhere to search across all your mods and modpacks" },
    { icon: Settings, title: "Customize", text: "Head to Settings to personalize your ModEx experience" },
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

async function loadData() {
    isLoading.value = true;
    try {
        const [modsData, modpacksData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
        ]);
        mods.value = modsData;
        modpacks.value = modpacksData;

        modsWithUpdates.value = modsData.filter((m) => (m as any).update_available);

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

onMounted(() => {
    loadData();
    tipInterval = setInterval(nextTip, 8000);
});

onUnmounted(() => {
    if (tipInterval) clearInterval(tipInterval);
});
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <div class="relative">
                    <div
                        class="w-20 h-20 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 animate-pulse" />
                    <RefreshCw
                        class="w-10 h-10 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                </div>
                <p class="text-muted-foreground mt-6 text-lg">Loading your workspace...</p>
            </div>
        </div>

        <!-- Main Content -->
        <div v-else class="flex-1 overflow-auto">
            <!-- Hero Section -->
            <section class="relative overflow-hidden">
                <!-- Background Effects -->
                <div class="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-blue-500/5" />
                <div class="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
                <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

                <!-- Grid Pattern -->
                <div
                    class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

                <div class="relative px-6 py-12 sm:px-8 lg:px-12">
                    <div class="max-w-7xl mx-auto">
                        <!-- Greeting & Refresh -->
                        <div class="flex items-center justify-between mb-8">
                            <div class="flex items-center gap-4">
                                <div
                                    class="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20">
                                    <component :is="greeting.icon" class="w-7 h-7" :class="greeting.color" />
                                </div>
                                <div>
                                    <h1
                                        class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                        {{ greeting.text }}
                                    </h1>
                                    <p class="text-muted-foreground mt-1">Welcome back to ModEx</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" @click="loadData" class="gap-2">
                                <RefreshCw class="w-4 h-4" />
                                <span class="hidden sm:inline">Refresh</span>
                            </Button>
                        </div>

                        <!-- Stats Cards -->
                        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <!-- Total Items -->
                            <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 p-6 cursor-pointer hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300"
                                @click="navigate('/library')">
                                <div
                                    class="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                                <div class="relative">
                                    <div class="flex items-center justify-between mb-4">
                                        <div class="p-2.5 bg-emerald-500/20 rounded-xl">
                                            <Layers class="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <ChevronRight
                                            class="w-5 h-5 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                                    </div>
                                    <p class="text-4xl font-bold text-emerald-400">{{ animatedTotalMods }}</p>
                                    <p class="text-sm text-muted-foreground mt-1">Total Items</p>
                                </div>
                            </div>

                            <!-- Modpacks -->
                            <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 p-6 cursor-pointer hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300"
                                @click="navigate('/modpacks')">
                                <div
                                    class="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                                <div class="relative">
                                    <div class="flex items-center justify-between mb-4">
                                        <div class="p-2.5 bg-blue-500/20 rounded-xl">
                                            <Package class="w-5 h-5 text-blue-400" />
                                        </div>
                                        <ChevronRight
                                            class="w-5 h-5 text-blue-500/50 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                                    </div>
                                    <p class="text-4xl font-bold text-blue-400">{{ animatedTotalModpacks }}</p>
                                    <p class="text-sm text-muted-foreground mt-1">Modpacks</p>
                                </div>
                            </div>

                            <!-- Library Size -->
                            <div class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 p-6 cursor-pointer hover:border-purple-500/40 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300"
                                @click="navigate('/stats')">
                                <div
                                    class="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                                <div class="relative">
                                    <div class="flex items-center justify-between mb-4">
                                        <div class="p-2.5 bg-purple-500/20 rounded-xl">
                                            <TrendingUp class="w-5 h-5 text-purple-400" />
                                        </div>
                                        <ChevronRight
                                            class="w-5 h-5 text-purple-500/50 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                                    </div>
                                    <p class="text-4xl font-bold text-purple-400">{{ formatSize(totalSize) }}</p>
                                    <p class="text-sm text-muted-foreground mt-1">Library Size</p>
                                </div>
                            </div>

                            <!-- Updates -->
                            <div class="group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300"
                                :class="modsWithUpdates.length > 0
                                    ? 'bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20 cursor-pointer hover:border-orange-500/40 hover:shadow-xl hover:shadow-orange-500/10'
                                    : 'bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20'">
                                <div class="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"
                                    :class="modsWithUpdates.length > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'" />
                                <div class="relative">
                                    <div class="flex items-center justify-between mb-4">
                                        <div class="p-2.5 rounded-xl"
                                            :class="modsWithUpdates.length > 0 ? 'bg-orange-500/20' : 'bg-green-500/20'">
                                            <ArrowUpCircle class="w-5 h-5"
                                                :class="modsWithUpdates.length > 0 ? 'text-orange-400' : 'text-green-400'" />
                                        </div>
                                        <span v-if="modsWithUpdates.length > 0" class="flex h-2.5 w-2.5">
                                            <span
                                                class="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-orange-400 opacity-75"></span>
                                            <span
                                                class="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                                        </span>
                                        <CheckCircle2 v-else class="w-5 h-5 text-green-400" />
                                    </div>
                                    <p class="text-4xl font-bold"
                                        :class="modsWithUpdates.length > 0 ? 'text-orange-400' : 'text-green-400'">
                                        {{ animatedUpdates }}
                                    </p>
                                    <p class="text-sm text-muted-foreground mt-1">
                                        {{ modsWithUpdates.length > 0 ? "Updates Ready" : "All Up to Date" }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Actions -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <button @click="navigate('/modpacks?create=true')"
                                class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-left transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-violet-500/25">
                                <div
                                    class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Plus class="w-7 h-7 text-white mb-3" />
                                <p class="font-semibold text-white">New Modpack</p>
                                <p class="text-xs text-white/70 mt-1">Create a new collection</p>
                            </button>

                            <button @click="navigate('/library')"
                                class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-left transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-emerald-500/25">
                                <div
                                    class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Folder class="w-7 h-7 text-white mb-3" />
                                <p class="font-semibold text-white">Library</p>
                                <p class="text-xs text-white/70 mt-1">Browse your mods</p>
                            </button>

                            <button @click="navigate('/sandbox')"
                                class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-5 text-left transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/25">
                                <div
                                    class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Compass class="w-7 h-7 text-white mb-3" />
                                <p class="font-semibold text-white">Sandbox</p>
                                <p class="text-xs text-white/70 mt-1">Visualize relations</p>
                            </button>

                            <button @click="navigate('/stats')"
                                class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 p-5 text-left transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25">
                                <div
                                    class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <BarChart3 class="w-7 h-7 text-white mb-3" />
                                <p class="font-semibold text-white">Statistics</p>
                                <p class="text-xs text-white/70 mt-1">View insights</p>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Content Section -->
            <section class="px-6 py-8 sm:px-8 lg:px-12">
                <div class="max-w-7xl mx-auto">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Left Column -->
                        <div class="lg:col-span-2 space-y-6">
                            <!-- Featured Modpack -->
                            <div v-if="spotlightModpack"
                                class="rounded-2xl border border-border bg-card overflow-hidden">
                                <div class="p-5 border-b border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <Crown class="w-5 h-5 text-yellow-500" />
                                        Featured Modpack
                                    </h3>
                                </div>
                                <div class="p-5">
                                    <div class="group flex items-start gap-5 p-4 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border/50 cursor-pointer hover:border-primary/30 hover:shadow-lg transition-all"
                                        @click="goToModpack(spotlightModpack.id)">
                                        <div class="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0 shadow-lg"
                                            :style="{ backgroundColor: getPackColor(spotlightModpack) }">
                                            {{ getPackIcon(spotlightModpack) }}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-start justify-between gap-4">
                                                <div>
                                                    <h4
                                                        class="font-semibold text-lg group-hover:text-primary transition-colors">
                                                        {{ spotlightModpack.name }}
                                                    </h4>
                                                    <p class="text-sm text-muted-foreground mt-1">
                                                        {{ spotlightModpack.minecraft_version }} • {{
                                                        spotlightModpack.loader }}
                                                    </p>
                                                </div>
                                                <Button variant="outline" size="sm"
                                                    class="shrink-0 gap-2 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
                                                    <Play class="w-4 h-4" />
                                                    Open
                                                </Button>
                                            </div>
                                            <div class="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                                                <span class="flex items-center gap-1.5">
                                                    <Calendar class="w-3.5 h-3.5" />
                                                    {{ formatDate(spotlightModpack.updated_at ||
                                                    spotlightModpack.created_at) }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Recent Activity -->
                            <div class="rounded-2xl border border-border bg-card overflow-hidden">
                                <div class="p-5 border-b border-border/50 flex items-center justify-between">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <Activity class="w-5 h-5 text-primary" />
                                        Recent Activity
                                    </h3>
                                    <Button variant="ghost" size="sm" @click="navigate('/library')"
                                        class="gap-1.5 text-xs">
                                        View All
                                        <ArrowRight class="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div class="p-5">
                                    <div v-if="recentMods.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        <div v-for="mod in recentMods" :key="mod.id"
                                            class="group p-3 rounded-xl border border-border/50 bg-muted/20 hover:border-primary/30 hover:bg-muted/40 transition-all cursor-pointer">
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
                                                    <p class="text-xs text-muted-foreground mt-0.5">{{
                                                        formatDate(mod.created_at) }}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else class="text-center py-12">
                                        <Layers class="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p class="text-muted-foreground">No mods added yet</p>
                                        <Button variant="outline" size="sm" @click="navigate('/library')"
                                            class="mt-4 gap-2">
                                            <Plus class="w-4 h-4" />
                                            Add Your First Mod
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right Column -->
                        <div class="space-y-6">
                            <!-- Updates Feed -->
                            <div class="rounded-2xl border border-border bg-card overflow-hidden">
                                <div class="p-5 border-b border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <ArrowUpCircle class="w-5 h-5 text-orange-500" />
                                        Updates
                                    </h3>
                                </div>
                                <div class="p-5">
                                    <div v-if="modsWithUpdates.length > 0" class="space-y-2">
                                        <div v-for="mod in modsWithUpdates.slice(0, 4)" :key="mod.id"
                                            class="flex items-center gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/30 transition-colors">
                                            <div
                                                class="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                                                <Download class="w-4 h-4 text-orange-400" />
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium truncate">{{ mod.name }}</p>
                                                <p class="text-xs text-muted-foreground">{{ mod.version }}</p>
                                            </div>
                                        </div>
                                        <div v-if="modsWithUpdates.length > 4" class="text-center pt-2">
                                            <Button variant="ghost" size="sm"
                                                class="text-xs text-orange-500 hover:text-orange-400">
                                                +{{ modsWithUpdates.length - 4 }} more updates
                                            </Button>
                                        </div>
                                    </div>
                                    <div v-else class="text-center py-8">
                                        <div
                                            class="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                                            <Shield class="w-7 h-7 text-green-400" />
                                        </div>
                                        <p class="font-medium text-green-400">All Up to Date!</p>
                                        <p class="text-xs text-muted-foreground mt-1">Your mods are current</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Recent Modpacks -->
                            <div v-if="recentModpacks.length > 0"
                                class="rounded-2xl border border-border bg-card overflow-hidden">
                                <div class="p-5 border-b border-border/50 flex items-center justify-between">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <Package class="w-5 h-5 text-primary" />
                                        Modpacks
                                    </h3>
                                    <Button variant="ghost" size="sm" @click="navigate('/modpacks')"
                                        class="gap-1.5 text-xs">
                                        All
                                        <ArrowRight class="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div class="p-3">
                                    <div class="space-y-1">
                                        <div v-for="pack in recentModpacks" :key="pack.id"
                                            class="group flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors"
                                            @click="goToModpack(pack.id)">
                                            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-base font-semibold shrink-0"
                                                :style="{ backgroundColor: getPackColor(pack) }">
                                                {{ getPackIcon(pack) }}
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <p
                                                    class="font-medium truncate group-hover:text-primary transition-colors">
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

                            <!-- Pro Tips -->
                            <div
                                class="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-purple-500/5 to-blue-500/5 overflow-hidden">
                                <div class="p-5 border-b border-border/50 flex items-center justify-between">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <Sparkles class="w-5 h-5 text-primary" />
                                        Pro Tips
                                    </h3>
                                    <Button variant="ghost" size="sm" @click="nextTip" class="text-xs gap-1">
                                        Next
                                        <ChevronRight class="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div class="p-5">
                                    <Transition name="fade" mode="out-in">
                                        <div :key="currentTipIndex" class="flex items-start gap-3">
                                            <div class="p-2.5 bg-primary/10 rounded-xl shrink-0">
                                                <component :is="tips[currentTipIndex].icon"
                                                    class="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <h4 class="font-medium">{{ tips[currentTipIndex].title }}</h4>
                                                <p class="text-sm text-muted-foreground mt-1 leading-relaxed">
                                                    {{ tips[currentTipIndex].text }}
                                                </p>
                                            </div>
                                        </div>
                                    </Transition>
                                    <div class="flex justify-center gap-1.5 mt-5">
                                        <button v-for="(_, index) in tips" :key="index" @click="currentTipIndex = index"
                                            class="w-2 h-2 rounded-full transition-all duration-300"
                                            :class="currentTipIndex === index ? 'bg-primary w-6' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'" />
                                    </div>
                                </div>
                            </div>

                            <!-- Loader Distribution -->
                            <div v-if="loaderBreakdown.length > 0"
                                class="rounded-2xl border border-border bg-card overflow-hidden">
                                <div class="p-5 border-b border-border/50">
                                    <h3 class="font-semibold flex items-center gap-2">
                                        <Target class="w-5 h-5 text-primary" />
                                        Loader Distribution
                                    </h3>
                                </div>
                                <div class="p-5 space-y-3">
                                    <div v-for="loader in loaderBreakdown" :key="loader.name"
                                        class="flex items-center gap-3">
                                        <div class="w-2.5 h-2.5 rounded-full" :class="getLoaderColor(loader.name)" />
                                        <span class="text-sm flex-1 capitalize">{{ loader.name }}</span>
                                        <span class="text-sm text-muted-foreground font-mono">{{ loader.count }}</span>
                                        <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                            <div class="h-full rounded-full transition-all duration-700"
                                                :class="getLoaderColor(loader.name)"
                                                :style="{ width: `${loader.percent}%` }" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
