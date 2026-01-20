<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import ModexLogo from "@/assets/modex_logo_h2_nobg.png";
import type { Modpack } from "@/types/electron";
import { createLogger } from "@/utils/logger";

const log = createLogger("HomeView");
const router = useRouter();

// Data
const modpacks = ref<Modpack[]>([]);
const isLoading = ref(true);
const totalMods = ref(0);
const totalSize = ref(0);

async function loadData() {
    log.info("Loading home data");
    isLoading.value = true;
    const startTime = Date.now();
    try {
        const [modsData, modpacksData] = await Promise.all([
            window.api.mods.getAll(),
            window.api.modpacks.getAll(),
        ]);
        totalMods.value = modsData.length;
        totalSize.value = modsData.reduce((sum, mod) => sum + (mod.file_size || 0), 0);
        modpacks.value = modpacksData;
        log.info("Home data loaded", {
            modsCount: modsData.length,
            modpacksCount: modpacksData.length,
            totalSizeBytes: totalSize.value,
            durationMs: Date.now() - startTime
        });
    } catch (err) {
        log.error("Failed to load home data", { error: err });
    } finally {
        isLoading.value = false;
    }
}

const recentModpacks = computed(() => {
    return [...modpacks.value]
        .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 3);
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

onMounted(loadData);
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
                                <h1 class="text-2xl font-bold text-foreground">ModEx</h1>
                                <p class="text-sm text-muted-foreground">Minecraft Mod Manager</p>
                            </div>
                        </div>

                        <!-- Stats Pills -->
                        <div class="hidden sm:flex items-center gap-3">
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Package" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ modpacks.length }} Packs</span>
                            </div>
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Layers" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ totalMods }} Mods</span>
                            </div>
                            <div
                                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50">
                                <Icon name="Download" class="w-3.5 h-3.5 text-primary" />
                                <span class="text-sm font-medium">{{ formatSize(totalSize) }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Main Hero Content -->
                    <div class="grid lg:grid-cols-2 gap-12 items-center">
                        <!-- Left: Text & CTA -->
                        <div>
                            <h2 class="text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
                                Your Mods,<br />
                                <span class="text-primary">Perfectly Organized</span>
                            </h2>
                            <p class="text-lg text-muted-foreground mb-8 max-w-md">
                                Create modpacks, track updates, share with friends.
                                The ultimate Minecraft mod management experience.
                            </p>

                            <!-- CTA Buttons -->
                            <div class="flex flex-wrap gap-3">
                                <Button size="lg" @click="navigate('/modpacks?create=true')" class="gap-2 px-6">
                                    <Icon name="Plus" class="w-4 h-4" />
                                    Create Modpack
                                </Button>
                                <Button variant="outline" size="lg" @click="navigate('/library')" class="gap-2 px-6">
                                    <Icon name="Compass" class="w-4 h-4" />
                                    Browse Mods
                                </Button>
                            </div>
                        </div>

                        <!-- Right: Quick Actions Grid -->
                        <div class="grid grid-cols-2 gap-3">
                            <button @click="navigate('/modpacks')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="Package" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Modpacks</h3>
                                <p class="text-xs text-muted-foreground">Manage your collections</p>
                            </button>

                            <button @click="navigate('/library')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="Folder" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Library</h3>
                                <p class="text-xs text-muted-foreground">All your mods</p>
                            </button>

                            <button @click="navigate('/guide')"
                                class="group p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-card/80 transition-all text-left">
                                <div
                                    class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    <Icon name="BookOpen" class="w-5 h-5 text-primary" />
                                </div>
                                <h3 class="font-semibold text-foreground mb-1">Guide</h3>
                                <p class="text-xs text-muted-foreground">Learn how to use Modex</p>
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Recent Modpacks Section -->
            <section v-if="recentModpacks.length > 0" class="py-12 px-6 border-t border-border/30">
                <div class="max-w-6xl mx-auto">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="text-lg font-semibold text-foreground">Recent Modpacks</h3>
                        <Button variant="ghost" size="sm" @click="navigate('/modpacks')"
                            class="gap-1.5 text-muted-foreground hover:text-foreground">
                            View All
                            <Icon name="ArrowRight" class="w-4 h-4" />
                        </Button>
                    </div>

                    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div v-for="pack in recentModpacks" :key="pack.id"
                            class="group p-4 rounded-xl bg-card border border-border/50 hover:border-primary/40 cursor-pointer transition-all"
                            @click="pack.id && goToModpack(pack.id)">
                            <div class="flex items-start gap-4">
                                <div
                                    class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                    {{ pack.name.substring(0, 2).toUpperCase() }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4
                                        class="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                        {{ pack.name }}
                                    </h4>
                                    <p class="text-sm text-muted-foreground">
                                        {{ pack.minecraft_version }} • {{ pack.loader }}
                                    </p>
                                    <p class="text-xs text-muted-foreground/70 mt-1">
                                        {{ pack.mod_ids?.length || 0 }} mods
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
            <section class="py-12 px-6 bg-card/50 border-t border-border/30">
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
                                <h4 class="font-medium text-foreground text-sm">Cloud Sync</h4>
                                <p class="text-xs text-muted-foreground">Share via Gist</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                <Icon name="Users" class="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <h4 class="font-medium text-foreground text-sm">Collaborate</h4>
                                <p class="text-xs text-muted-foreground">Pub/Sub modpacks</p>
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
                    <p class="text-xs text-muted-foreground/70">
                        ModEx — Your Minecraft Modding Companion
                    </p>
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
