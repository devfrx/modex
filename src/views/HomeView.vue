<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import {
    Package,
    Layers,
    ArrowRight,
    Sparkles,
    Plus,
    Folder,
    BarChart3,
    Compass,
    Shield,
    Settings,
    Play,
    Box,
    Globe,
    RefreshCw,
} from "lucide-vue-next";
import type { Modpack } from "@/types/electron";

const router = useRouter();

// Data
const modpacks = ref<Modpack[]>([]);
const isLoading = ref(true);
const totalMods = ref(0);
const totalSize = ref(0);

async function loadData() {
    isLoading.value = true;
    try {
        const [modsData, modpacksData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
        ]);
        totalMods.value = modsData.length;
        totalSize.value = modsData.reduce((sum, mod) => sum + (mod.file_size || 0), 0);
        modpacks.value = modpacksData;
    } catch (err) {
        console.error("Failed to load data:", err);
    } finally {
        isLoading.value = false;
    }
}

const recentModpacks = computed(() => {
    return [...modpacks.value]
        .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 4);
});

function formatSize(bytes: number) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(0) + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
}

function navigate(route: string) {
    router.push(route);
}

function goToModpack(id: string) {
    router.push(`/modpacks?id=${id}`);
}

function getPackColor(pack: Modpack): string {
    const colors = ["#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308", "#06b6d4", "#ec4899"];
    const hash = pack.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

onMounted(loadData);
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
            <div class="text-center">
                <div class="relative">
                    <div
                        class="w-16 h-16 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 animate-pulse" />
                    <RefreshCw
                        class="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                </div>
                <p class="text-muted-foreground mt-4">Loading...</p>
            </div>
        </div>

        <!-- Main Content - Landing Page Style -->
        <div v-else class="flex-1 overflow-auto">
            <!-- Hero Section -->
            <section class="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
                <!-- Animated Background -->
                <div class="absolute inset-0">
                    <!-- Gradient Mesh -->
                    <div class="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-purple-900/10" />

                    <!-- Floating Orbs -->
                    <div
                        class="absolute top-20 left-[10%] w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
                    <div class="absolute bottom-20 right-[10%] w-96 h-96 bg-purple-500/15 rounded-full blur-[120px] animate-pulse"
                        style="animation-delay: 1s;" />
                    <div
                        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px]" />

                    <!-- Grid Pattern -->
                    <div
                        class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:60px_60px]" />

                    <!-- Radial Fade -->
                    <div
                        class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
                </div>

                <!-- Hero Content -->
                <div class="relative z-10 text-center px-4 sm:px-6 max-w-5xl mx-auto">
                    <!-- Logo/Brand -->
                    <div class="mb-6 sm:mb-8 flex justify-center">
                        <div class="relative">
                            <div
                                class="absolute inset-0 bg-gradient-to-r from-primary to-purple-500 rounded-2xl sm:rounded-3xl blur-xl opacity-50 animate-pulse" />
                            <div
                                class="relative p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-white/10 backdrop-blur-xl">
                                <Box class="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
                            </div>
                        </div>
                    </div>

                    <!-- Headline -->
                    <h1 class="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-4 sm:mb-6">
                        <span class="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                            Welcome to
                        </span>
                        <br />
                        <span
                            class="bg-gradient-to-r from-primary via-purple-400 to-blue-400 bg-clip-text text-transparent">
                            ModEx
                        </span>
                    </h1>

                    <!-- Subtitle -->
                    <p
                        class="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
                        The ultimate Minecraft mod manager. Organize, discover, and play with your modpacks like never
                        before.
                    </p>

                    <!-- CTA Buttons -->
                    <div
                        class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-12 sm:mb-16 px-4">
                        <Button size="lg" @click="navigate('/modpacks')"
                            class="gap-2 px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base w-full sm:w-auto bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 border-0 shadow-xl shadow-primary/25">
                            <Play class="w-5 h-5" />
                            Get Started
                        </Button>
                        <Button variant="outline" size="lg" @click="navigate('/modpacks?create=true')"
                            class="gap-2 px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base w-full sm:w-auto border-white/20 hover:bg-white/5">
                            <Plus class="w-5 h-5" />
                            Create Modpack
                        </Button>
                    </div>

                    <!-- Stats Row -->
                    <div class="flex items-center justify-center gap-4 sm:gap-8 md:gap-16">
                        <div class="text-center">
                            <p class="text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{{ modpacks.length }}</p>
                            <p class="text-xs sm:text-sm text-muted-foreground mt-1">Modpacks</p>
                        </div>
                        <div class="w-px h-8 sm:h-12 bg-border" />
                        <div class="text-center">
                            <p class="text-2xl sm:text-3xl md:text-4xl font-bold text-purple-400">{{ totalMods }}</p>
                            <p class="text-xs sm:text-sm text-muted-foreground mt-1">Total Mods</p>
                        </div>
                        <div class="w-px h-8 sm:h-12 bg-border" />
                        <div class="text-center">
                            <p class="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-400">{{ formatSize(totalSize)
                                }}</p>
                            <p class="text-xs sm:text-sm text-muted-foreground mt-1">Library</p>
                        </div>
                    </div>
                </div>

                <!-- Scroll Indicator -->
                <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
                    <div
                        class="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1.5">
                        <div class="w-1.5 h-2.5 bg-muted-foreground/50 rounded-full animate-pulse" />
                    </div>
                </div>
            </section>

            <!-- Features Section -->
            <section class="py-24 px-6 bg-gradient-to-b from-background to-muted/20">
                <div class="max-w-6xl mx-auto">
                    <!-- Section Header -->
                    <div class="text-center mb-16">
                        <div
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
                            <Sparkles class="w-4 h-4" />
                            Features
                        </div>
                        <h2 class="text-3xl sm:text-4xl font-bold mb-4">Everything you need</h2>
                        <p class="text-muted-foreground max-w-xl mx-auto">
                            Powerful tools to manage your Minecraft modding experience
                        </p>
                    </div>

                    <!-- Features Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <!-- Feature 1 -->
                        <div class="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 cursor-pointer"
                            @click="navigate('/modpacks')">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Package class="w-6 h-6 text-violet-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">Modpack
                                Management</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Create, organize, and manage your modpacks with an intuitive interface. Import from
                                CurseForge or build from scratch.
                            </p>
                        </div>

                        <!-- Feature 2 -->
                        <div class="group p-6 rounded-2xl bg-card border border-border hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 cursor-pointer"
                            @click="navigate('/library')">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Folder class="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-emerald-400 transition-colors">Mod
                                Library</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Your central hub for all mods. Search, filter, and organize your collection with
                                powerful tools.
                            </p>
                        </div>

                        <!-- Feature 3 -->
                        <div class="group p-6 rounded-2xl bg-card border border-border hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer"
                            @click="navigate('/sandbox')">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Compass class="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                                Dependency Sandbox</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Visualize mod relationships and dependencies. Understand how your mods connect and
                                interact.
                            </p>
                        </div>

                        <!-- Feature 4 -->
                        <div class="group p-6 rounded-2xl bg-card border border-border hover:border-orange-500/30 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 cursor-pointer"
                            @click="navigate('/stats')">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <BarChart3 class="w-6 h-6 text-orange-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-orange-400 transition-colors">
                                Statistics</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Deep insights into your mod collection. Track downloads, sizes, and loader
                                distributions.
                            </p>
                        </div>

                        <!-- Feature 5 -->
                        <div
                            class="group p-6 rounded-2xl bg-card border border-border hover:border-pink-500/30 hover:shadow-xl hover:shadow-pink-500/5 transition-all duration-300">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Globe class="w-6 h-6 text-pink-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-pink-400 transition-colors">Cloud
                                Sync</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Share modpacks via Gist integration. Collaborate with friends and sync across devices.
                            </p>
                        </div>

                        <!-- Feature 6 -->
                        <div
                            class="group p-6 rounded-2xl bg-card border border-border hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300">
                            <div
                                class="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                                <Shield class="w-6 h-6 text-cyan-400" />
                            </div>
                            <h3 class="text-lg font-semibold mb-2 group-hover:text-cyan-400 transition-colors">Health
                                Analysis</h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                Detect conflicts, missing dependencies, and compatibility issues before they cause
                                problems.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Recent Modpacks Section -->
            <section v-if="recentModpacks.length > 0" class="py-20 px-6">
                <div class="max-w-6xl mx-auto">
                    <!-- Section Header -->
                    <div class="flex items-center justify-between mb-10">
                        <div>
                            <h2 class="text-2xl font-bold mb-2">Your Modpacks</h2>
                            <p class="text-muted-foreground">Jump back into your recent projects</p>
                        </div>
                        <Button variant="outline" @click="navigate('/modpacks')" class="gap-2">
                            View All
                            <ArrowRight class="w-4 h-4" />
                        </Button>
                    </div>

                    <!-- Modpack Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        <div v-for="pack in recentModpacks" :key="pack.id"
                            class="group relative rounded-2xl bg-card border border-border overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-xl transition-all duration-300"
                            @click="goToModpack(pack.id!)">
                            <!-- Color Bar -->
                            <div class="h-1.5" :style="{ backgroundColor: getPackColor(pack) }" />

                            <div class="p-5">
                                <div class="flex items-start gap-4 mb-4">
                                    <!-- Icon -->
                                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 text-white"
                                        :style="{ backgroundColor: getPackColor(pack) }">
                                        {{ pack.name.substring(0, 2).toUpperCase() }}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4 class="font-semibold truncate group-hover:text-primary transition-colors">
                                            {{ pack.name }}
                                        </h4>
                                        <p class="text-xs text-muted-foreground mt-1">
                                            {{ pack.minecraft_version }} • {{ pack.loader }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Play Button -->
                                <Button variant="outline" size="sm"
                                    class="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all">
                                    <Play class="w-4 h-4" />
                                    Open
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Quick Actions Footer -->
            <section class="py-16 px-6 border-t border-border">
                <div class="max-w-4xl mx-auto">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <button @click="navigate('/modpacks?create=true')"
                            class="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/30 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all">
                            <div class="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                <Plus class="w-5 h-5 text-primary" />
                            </div>
                            <span class="text-sm font-medium">New Modpack</span>
                        </button>

                        <button @click="navigate('/library')"
                            class="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/30 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all">
                            <div
                                class="p-3 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                                <Layers class="w-5 h-5 text-emerald-400" />
                            </div>
                            <span class="text-sm font-medium">Library</span>
                        </button>

                        <button @click="navigate('/stats')"
                            class="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/30 hover:bg-orange-500/10 border border-transparent hover:border-orange-500/20 transition-all">
                            <div class="p-3 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                                <BarChart3 class="w-5 h-5 text-orange-400" />
                            </div>
                            <span class="text-sm font-medium">Statistics</span>
                        </button>

                        <button @click="navigate('/settings')"
                            class="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border transition-all">
                            <div class="p-3 rounded-xl bg-muted group-hover:bg-muted/80 transition-colors">
                                <Settings class="w-5 h-5 text-muted-foreground" />
                            </div>
                            <span class="text-sm font-medium">Settings</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- Footer -->
            <footer class="py-8 px-6 border-t border-border/50 text-center">
                <p class="text-xs text-muted-foreground">
                    ModEx — Your Minecraft Modding Companion
                </p>
            </footer>
        </div>
    </div>
</template>
