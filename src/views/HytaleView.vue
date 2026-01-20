<script setup lang="ts">
/**
 * HytaleView - Home/Dashboard view for Hytale game profile
 * 
 * Dashboard-style view matching Minecraft HomeView design
 * Uses dynamic theme colors (primary) instead of fixed colors
 */

import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useHytale } from "@/composables/useHytale";
import { useToast } from "@/composables/useToast";
import type { HytaleModpack } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import ModexLogo from "@/assets/modex_logo_h2_nobg.png";
import { createLogger } from "@/utils/logger";

const log = createLogger("HytaleView");
const router = useRouter();
const toast = useToast();

const {
    modpacks,
    activeModpack,
    isLoading,
    isInstalled,
    isInitialized,
    enabledMods,
    modCount,
    modpackCount,
    initialize,
    refreshMods,
    launch,
    openModsFolder,
} = useHytale();

// Local state
const isLaunching = ref(false);
const isRefreshing = ref(false);

// Recent modpacks (last 3)
const recentModpacks = computed(() => {
    return [...modpacks.value]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
        .slice(0, 3);
});

// Initialize on mount
onMounted(async () => {
    await initialize();
});

// Launch handler
async function handleLaunch() {
    isLaunching.value = true;
    try {
        const result = await launch();
        if (!result.success && result.error) {
            toast.error("Launch Failed", result.error);
        }
    } finally {
        isLaunching.value = false;
    }
}

// Refresh handler
async function handleRefresh() {
    isRefreshing.value = true;
    try {
        await refreshMods();
        toast.success("Refreshed", "Data has been updated");
    } finally {
        isRefreshing.value = false;
    }
}

// Navigation helpers
function navigate(route: string) {
    router.push(route);
}

function goToModpack(modpack: HytaleModpack) {
    router.push(`/hytale/modpack/${modpack.id}`);
}
</script>

<template>
    <div class="h-full flex flex-col bg-background overflow-hidden">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex-1 flex items-center justify-center">
            <Icon name="Loader2" class="w-8 h-8 text-primary animate-spin" />
        </div>

        <!-- Main Content -->
        <div v-else class="flex-1 overflow-auto">
            <!-- Hero Section - Compact & Bold -->
            <section class="relative py-16 px-6">
                <!-- Background Glow -->
                <div class="absolute inset-0 overflow-hidden pointer-events-none">
                    <div
                        class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[120px]" />
                </div>

                <div class="relative max-w-6xl mx-auto">
                    <!-- Top Row: Logo + Stats -->
                    <div class="flex items-center justify-between mb-12">
                        <div class="flex items-center gap-4">
                            <img :src="ModexLogo" alt="ModEx" class="w-14 h-14 object-contain" />
                            <div>
                                <h1 class="text-2xl font-bold text-foreground">Hytale</h1>
                                <p class="text-sm text-muted-foreground">Mod Manager</p>
                            </div>
                        </div>

                        <!-- Stats Pills -->
                        <div class="hidden sm:flex items-center gap-3">
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Package" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ modpackCount }} Packs</span>
                            </div>
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Layers" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ modCount }} Mods</span>
                            </div>
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Zap" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ enabledMods.length }} Active</span>
                            </div>
                        </div>
                    </div>

                    <!-- Not Installed Warning -->
                    <div v-if="!isInstalled && isInitialized"
                        class="mb-8 flex items-center gap-4 p-4 rounded-xl border border-warning/30 bg-warning/10">
                        <Icon name="AlertCircle" class="w-8 h-8 text-warning shrink-0" />
                        <div class="flex-1">
                            <p class="font-medium text-foreground">Hytale Not Detected</p>
                            <p class="text-sm text-muted-foreground">
                                Please install Hytale or configure the paths in Settings.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" @click="navigate('/settings')">
                            <Icon name="Settings" class="w-4 h-4 mr-2" />
                            Settings
                        </Button>
                    </div>

                    <!-- Main Hero Content -->
                    <div class="grid lg:grid-cols-2 gap-12 items-center" v-if="isInstalled">
                        <!-- Left: Text & CTA -->
                        <div>
                            <h2 class="text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
                                Your Mods,<br />
                                <span class="text-primary">Ready to Play</span>
                            </h2>
                            <p class="text-lg text-muted-foreground mb-8 max-w-md">
                                Manage mods, create modpacks, explore the world of Hytale modding.
                            </p>

                            <!-- CTA Buttons -->
                            <div class="flex flex-wrap gap-3">
                                <Button size="lg" @click="handleLaunch" :disabled="isLaunching" class="gap-2 px-6">
                                    <Icon name="Play" class="w-4 h-4" :class="isLaunching && 'animate-pulse'" />
                                    {{ isLaunching ? 'Launching...' : 'Play Hytale' }}
                                </Button>
                                <Button variant="outline" size="lg" @click="navigate('/hytale/browse')"
                                    class="gap-2 px-6">
                                    <Icon name="Compass" class="w-4 h-4" />
                                    Browse Mods
                                </Button>
                            </div>
                        </div>

                        <!-- Right: Quick Actions Grid -->
                        <div class="grid grid-cols-2 gap-3">
                            <button @click="navigate('/hytale/modpacks')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="Package" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Modpacks</h3>
                                <p class="text-xs text-muted-foreground">{{ modpackCount }} collections</p>
                            </button>

                            <button @click="navigate('/hytale/mods')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="Layers" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">My Mods</h3>
                                <p class="text-xs text-muted-foreground">{{ modCount }} installed</p>
                            </button>

                            <button @click="navigate('/hytale/worlds')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="Map" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Worlds</h3>
                                <p class="text-xs text-muted-foreground">Manage saves</p>
                            </button>

                            <button @click="openModsFolder"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="FolderOpen" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Mods Folder</h3>
                                <p class="text-xs text-muted-foreground">Open directory</p>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Recent Modpacks Section -->
            <section v-if="isInstalled && recentModpacks.length > 0" class="py-12 px-6 border-t border-border/30">
                <div class="max-w-6xl mx-auto">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="text-lg font-semibold text-foreground">Recent Modpacks</h3>
                        <Button variant="ghost" size="sm" @click="navigate('/hytale/modpacks')"
                            class="gap-1.5 text-muted-foreground hover:text-foreground">
                            View All
                            <Icon name="ArrowRight" class="w-4 h-4" />
                        </Button>
                    </div>

                    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div v-for="modpack in recentModpacks" :key="modpack.id"
                            class="group p-4 rounded-xl bg-card border border-border/50 hover:border-primary/40 cursor-pointer transition-all"
                            @click="goToModpack(modpack)">
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                    {{ modpack.name.substring(0, 2).toUpperCase() }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4
                                        class="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                        {{ modpack.name }}
                                    </h4>
                                    <p class="text-sm text-muted-foreground">
                                        {{ modpack.modIds?.length || 0 }} mods
                                    </p>
                                    <p v-if="modpack.id === activeModpack?.id" class="text-xs text-emerald-500 mt-1">
                                        Active
                                    </p>
                                </div>
                                <Button variant="ghost" size="sm"
                                    class="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="Play" class="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Features Banner -->
            <section class="py-12 px-6 bg-card/50 border-t border-border/30" v-if="isInstalled">
                <div class="max-w-6xl mx-auto">
                    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                                <Icon name="Zap" class="w-5 h-5 text-green-500" />
                            </div>
                            <div>
                                <h4 class="font-medium text-foreground text-sm">Fast & Light</h4>
                                <p class="text-xs text-muted-foreground">Instant loading</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                <Icon name="Globe" class="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h4 class="font-medium text-foreground text-sm">CurseForge</h4>
                                <p class="text-xs text-muted-foreground">Browse & install</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                <Icon name="Users" class="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <h4 class="font-medium text-foreground text-sm">Virtual Packs</h4>
                                <p class="text-xs text-muted-foreground">Toggle mod sets</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                                <Icon name="Download" class="w-5 h-5 text-orange-500" />
                            </div>
                            <div>
                                <h4 class="font-medium text-foreground text-sm">Auto Updates</h4>
                                <p class="text-xs text-muted-foreground">Stay current</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Footer -->
            <footer class="py-6 px-6 border-t border-border/20">
                <div class="max-w-6xl mx-auto flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <p class="text-xs text-muted-foreground/70">
                            ModEx — Your Hytale Modding Companion
                        </p>
                        <Button v-if="isInstalled" variant="ghost" size="sm" @click="handleRefresh"
                            :disabled="isRefreshing" class="gap-1.5 text-muted-foreground h-7">
                            <Icon name="RefreshCw" class="w-3.5 h-3.5" :class="isRefreshing && 'animate-spin'" />
                            Refresh
                        </Button>
                    </div>
                    <Button variant="ghost" size="sm" @click="navigate('/settings')"
                        class="gap-1.5 text-muted-foreground">
                        <Icon name="Settings" class="w-4 h-4" />
                        Settings
                    </Button>
                </div>
            </footer>
        </div>
    </div>
</template>
