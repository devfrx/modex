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
    router.push(`/modpacks/${id}`);
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
                <!-- Simplified Background -->
                <div class="absolute inset-0">
                    <!-- Base gradient -->
                    <div class="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />

                    <!-- Subtle grid -->
                    <div
                        class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

                    <!-- Single primary glow - simplified -->
                    <div
                        class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/8 rounded-full blur-[100px]" />
                </div>

                <!-- Hero Content -->
                <div class="relative z-10 text-center px-4 sm:px-6 max-w-4xl mx-auto">
                    <!-- Logo/Brand -->
                    <div class="mb-8 flex justify-center">
                        <div class="relative group">
                            <div class="relative p-4 rounded-2xl bg-card/80 border border-primary/20 backdrop-blur-xl">
                                <Box class="w-10 h-10 text-primary" />
                            </div>
                        </div>
                    </div>

                    <!-- Headline -->
                    <h1 class="text-display sm:text-5xl lg:text-6xl tracking-tight mb-5">
                        <span class="text-foreground">
                            Your Mods,
                        </span>
                        <br />
                        <span class="text-primary">
                            Organized
                        </span>
                    </h1>

                    <!-- Subtitle -->
                    <p class="text-body sm:text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
                        Build modpacks, track updates, play instantly.
                    </p>

                    <!-- CTA Buttons -->
                    <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14 px-4">
                        <Button size="lg" @click="navigate('/modpacks?create=true')"
                            class="gap-2 px-6 h-11 text-sm w-full sm:w-auto">
                            <Plus class="w-4 h-4" />
                            Create Your First Pack
                        </Button>
                        <Button variant="outline" size="lg" @click="navigate('/library')"
                            class="gap-2 px-6 h-11 text-sm w-full sm:w-auto">
                            <Compass class="w-4 h-4" />
                            Browse Mods
                        </Button>
                    </div>

                    <!-- Stats Row -->
                    <div class="flex items-center justify-center gap-8 md:gap-12">
                        <div class="text-center">
                            <p class="text-h1 text-foreground">{{ modpacks.length }}</p>
                            <p class="text-caption text-muted-foreground mt-1">Packs</p>
                        </div>
                        <div class="w-px h-10 bg-border/50" />
                        <div class="text-center">
                            <p class="text-h1 text-foreground">{{ totalMods }}</p>
                            <p class="text-caption text-muted-foreground mt-1">Mods</p>
                        </div>
                        <div class="w-px h-10 bg-border/50" />
                        <div class="text-center">
                            <p class="text-h1 text-foreground">{{ formatSize(totalSize) }}
                            </p>
                            <p class="text-caption text-muted-foreground mt-1">Saved</p>
                        </div>
                    </div>
                </div>

                <!-- Scroll Indicator -->
                <div class="absolute bottom-8 left-1/2 -translate-x-1/2">
                    <div
                        class="w-5 h-8 rounded-full border border-muted-foreground/20 flex items-start justify-center p-1">
                        <div class="w-1 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                    </div>
                </div>
            </section>

            <!-- Features Section -->
            <section class="py-20 px-6 bg-card/30">
                <div class="max-w-5xl mx-auto">
                    <!-- Section Header -->
                    <div class="text-center mb-14">
                        <div
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
                            <Sparkles class="w-3 h-3" />
                            Features
                        </div>
                        <h2 class="text-2xl sm:text-3xl font-semibold mb-3">Everything you need</h2>
                        <p class="text-sm text-muted-foreground max-w-md mx-auto">
                            Powerful tools to manage your Minecraft modding experience
                        </p>
                    </div>

                    <!-- Features Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <!-- Feature 1 -->
                        <div class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
                            @click="navigate('/modpacks')">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <Package class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">Modpack
                                Management</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                Create, organize, and manage your modpacks with an intuitive interface.
                            </p>
                        </div>

                        <!-- Feature 2 -->
                        <div class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
                            @click="navigate('/library')">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <Folder class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">My
                                Mods</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                All your mods in one place. Search, filter, organize.
                            </p>
                        </div>

                        <!-- Feature 3 -->
                        <div class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
                            @click="navigate('/sandbox')">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <Compass class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">
                                Visualize</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                See how your mods connect. Spot conflicts instantly.
                            </p>
                        </div>

                        <!-- Feature 4 -->
                        <div class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
                            @click="navigate('/stats')">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <BarChart3 class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">
                                Insights</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                Understand your collection with beautiful charts.
                            </p>
                        </div>

                        <!-- Feature 5 -->
                        <div
                            class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <Globe class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">Cloud
                                Sync</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                Share modpacks via Gist. Collaborate with friends seamlessly.
                            </p>
                        </div>

                        <!-- Feature 6 -->
                        <div
                            class="group p-5 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                                <Shield class="w-5 h-5 text-primary" />
                            </div>
                            <h3 class="text-sm font-semibold mb-1.5 group-hover:text-primary transition-colors">Health
                                Analysis</h3>
                            <p class="text-xs text-muted-foreground leading-relaxed">
                                Detect conflicts and compatibility issues automatically.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Recent Modpacks Section -->
            <section v-if="recentModpacks.length > 0" class="py-16 px-6 bg-background">
                <div class="max-w-5xl mx-auto">
                    <!-- Section Header -->
                    <div class="flex items-center justify-between mb-8">
                        <div>
                            <h2 class="text-xl font-semibold mb-1">Your Modpacks</h2>
                            <p class="text-sm text-muted-foreground">Jump back into your recent projects</p>
                        </div>
                        <Button variant="ghost" size="sm" @click="navigate('/modpacks')"
                            class="gap-1.5 text-muted-foreground hover:text-foreground">
                            View All
                            <ArrowRight class="w-3.5 h-3.5" />
                        </Button>
                    </div>

                    <!-- Modpack Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div v-for="pack in recentModpacks" :key="pack.id"
                            class="group relative rounded-lg bg-card border border-border/50 overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-200"
                            @click="pack.id && goToModpack(pack.id)">
                            <div class="p-4">
                                <div class="flex items-start gap-3 mb-3">
                                    <!-- Icon -->
                                    <div
                                        class="w-10 h-10 rounded-md flex items-center justify-center text-sm font-semibold shrink-0 bg-primary/10 text-primary">
                                        {{ pack.name.substring(0, 2).toUpperCase() }}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h4
                                            class="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                            {{ pack.name }}
                                        </h4>
                                        <p class="text-micro text-muted-foreground mt-0.5">
                                            {{ pack.minecraft_version }} • {{ pack.loader }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Play Button -->
                                <Button variant="ghost" size="sm"
                                    class="w-full gap-1.5 h-8 text-xs text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-all">
                                    <Play class="w-3.5 h-3.5" />
                                    Open
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Quick Actions Footer -->
            <section class="py-12 px-6 border-t border-border/30 bg-card/30">
                <div class="max-w-4xl mx-auto">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button @click="navigate('/modpacks?create=true')"
                            class="group flex flex-col items-center gap-2.5 p-5 rounded-lg bg-background/50 hover:bg-primary/5 border border-border/40 hover:border-primary/30 transition-all duration-200">
                            <div class="p-2.5 rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
                                <Plus class="w-4 h-4 text-primary" />
                            </div>
                            <span class="text-xs font-medium">New Modpack</span>
                        </button>

                        <button @click="navigate('/library')"
                            class="group flex flex-col items-center gap-2.5 p-5 rounded-lg bg-background/50 hover:bg-primary/5 border border-border/40 hover:border-primary/30 transition-all duration-200">
                            <div class="p-2.5 rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
                                <Layers class="w-4 h-4 text-primary" />
                            </div>
                            <span class="text-xs font-medium">Library</span>
                        </button>

                        <button @click="navigate('/stats')"
                            class="group flex flex-col items-center gap-2.5 p-5 rounded-lg bg-background/50 hover:bg-primary/5 border border-border/40 hover:border-primary/30 transition-all duration-200">
                            <div class="p-2.5 rounded-md bg-primary/10 group-hover:bg-primary/15 transition-colors">
                                <BarChart3 class="w-4 h-4 text-primary" />
                            </div>
                            <span class="text-xs font-medium">Statistics</span>
                        </button>

                        <button @click="navigate('/settings')"
                            class="group flex flex-col items-center gap-2.5 p-5 rounded-lg bg-background/50 hover:bg-muted/50 border border-border/40 hover:border-border transition-all duration-200">
                            <div class="p-2.5 rounded-md bg-muted group-hover:bg-muted/80 transition-colors">
                                <Settings class="w-4 h-4 text-muted-foreground" />
                            </div>
                            <span class="text-xs font-medium">Settings</span>
                        </button>
                    </div>
                </div>
            </section>

            <!-- Footer -->
            <footer class="py-6 px-6 border-t border-border/20 text-center bg-background">
                <p class="text-micro text-muted-foreground/70">
                    ModEx — Your Minecraft Modding Companion
                </p>
            </footer>
        </div>
    </div>
</template>
