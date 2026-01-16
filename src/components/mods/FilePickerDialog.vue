<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";

const props = defineProps<{
    open: boolean;
    mod: {
        id: number;
        name: string;
        slug?: string;
        logo?: { thumbnailUrl?: string };
    } | null;
    gameVersion?: string;
    modLoader?: string;
    contentType?: "mod" | "resourcepack" | "shader";
    installedProjectFiles?: Map<number, Set<number>>;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "select", fileId: number): void;
}>();

const files = ref<any[]>([]);
const isLoading = ref(false);
const selectedFileId = ref<number | null>(null);

// Release type filters
const filterRelease = ref(true);
const filterBeta = ref(false);
const filterAlpha = ref(false);

async function loadFiles() {
    if (!props.mod) return;

    isLoading.value = true;
    files.value = [];
    selectedFileId.value = null;

    try {
        const isModContent = props.contentType === "mod" || !props.contentType;
        const result = await window.api.curseforge.getModFiles(props.mod.id, {
            gameVersion: props.gameVersion || undefined,
            modLoader: isModContent ? props.modLoader || undefined : undefined,
        });

        // Sort by date desc
        files.value = result.sort(
            (a: any, b: any) =>
                new Date(b.fileDate).getTime() - new Date(a.fileDate).getTime()
        );

        // Auto-select first compatible file
        const compatible = filteredFiles.value;
        if (compatible.length > 0) {
            selectedFileId.value = compatible[0].id;
        }
    } catch (err) {
        console.error("Failed to load files:", err);
    } finally {
        isLoading.value = false;
    }
}

const filteredFiles = computed(() => {
    const isModContent = props.contentType === "mod" || !props.contentType;

    return files.value.filter((f) => {
        // Filter by release type
        if (f.releaseType === 1 && !filterRelease.value) return false;
        if (f.releaseType === 2 && !filterBeta.value) return false;
        if (f.releaseType === 3 && !filterAlpha.value) return false;

        // Strict loader filter for mods only
        if (isModContent && props.modLoader) {
            const loaderLower = props.modLoader.toLowerCase();
            const fileLoaders = (f.gameVersions || []).map((gv: string) =>
                gv.toLowerCase()
            );
            if (!fileLoaders.includes(loaderLower)) {
                return false;
            }
        }

        // Version filter for non-mods
        if (!isModContent && props.gameVersion) {
            const fileVersions = f.gameVersions || [];
            const hasMatchingVersion = fileVersions.some(
                (gv: string) =>
                    gv === props.gameVersion ||
                    gv.startsWith(props.gameVersion + ".") ||
                    props.gameVersion?.startsWith(gv + ".")
            );
            if (!hasMatchingVersion) {
                return false;
            }
        }

        return true;
    });
});

// Check if a specific file is already installed
function isFileInstalled(fileId: number): boolean {
    if (!props.mod || !props.installedProjectFiles) return false;
    return props.installedProjectFiles.get(props.mod.id)?.has(fileId) || false;
}

function getReleaseTypeClass(type: number) {
    switch (type) {
        case 1:
            return "bg-primary/15 text-primary ring-1 ring-primary/30";
        case 2:
            return "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30";
        case 3:
            return "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30";
        default:
            return "bg-muted text-muted-foreground";
    }
}

function getReleaseTypeName(type: number) {
    switch (type) {
        case 1:
            return "Release";
        case 2:
            return "Beta";
        case 3:
            return "Alpha";
        default:
            return "Unknown";
    }
}

function formatDate(date: string) {
    return new Date(date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getGameVersionsDisplay(gameVersions: string[] | undefined): string {
    if (!gameVersions) return "";
    return gameVersions
        .filter(
            (v) =>
                /^1\.\d+/.test(v) ||
                ["Forge", "Fabric", "NeoForge", "Quilt"].includes(v)
        )
        .slice(0, 4)
        .join(", ");
}

function handleSelect() {
    if (selectedFileId.value) {
        emit("select", selectedFileId.value);
        emit("close");
    }
}

function openCurseForge() {
    if (props.mod?.slug) {
        window.open(
            `https://www.curseforge.com/minecraft/mc-mods/${props.mod.slug}/files`,
            "_blank"
        );
    }
}

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen && props.mod) {
            loadFiles();
        }
    }
);
</script>

<template>
    <Dialog :open="open" @close="emit('close')" maxWidth="3xl">
        <template #header>
            <div class="flex items-center gap-3">
                <img v-if="mod?.logo?.thumbnailUrl" :src="mod.logo.thumbnailUrl"
                    class="w-10 h-10 rounded-lg object-cover" />
                <div v-else class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Icon name="FileText" class="w-5 h-5 text-muted-foreground" />
                </div>
                <div class="min-w-0 flex-1">
                    <h2 class="text-lg font-bold truncate">{{ mod?.name }}</h2>
                    <p class="text-sm text-muted-foreground">
                        Select a file version to add
                    </p>
                </div>
                <Button variant="ghost" size="icon" class="h-8 w-8" @click="openCurseForge" title="View on CurseForge">
                    <Icon name="ExternalLink" class="w-4 h-4" />
                </Button>
            </div>
        </template>

        <div class="space-y-4">
            <!-- Filters -->
            <div class="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/30">
                <span class="text-sm text-muted-foreground font-medium">Channels:</span>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                    :class="filterRelease ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50'">
                    <input type="checkbox" v-model="filterRelease" class="sr-only" />
                    <div class="w-3 h-3 rounded-full bg-primary ring-2 ring-primary/30" />
                    <span class="text-sm font-medium"
                        :class="filterRelease ? 'text-primary' : 'text-muted-foreground'">Release</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                    :class="filterBeta ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'hover:bg-muted/50'">
                    <input type="checkbox" v-model="filterBeta" class="sr-only" />
                    <div class="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
                    <span class="text-sm font-medium"
                        :class="filterBeta ? 'text-blue-400' : 'text-muted-foreground'">Beta</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                    :class="filterAlpha ? 'bg-orange-500/15 ring-1 ring-orange-500/30' : 'hover:bg-muted/50'">
                    <input type="checkbox" v-model="filterAlpha" class="sr-only" />
                    <div class="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-500/30" />
                    <span class="text-sm font-medium"
                        :class="filterAlpha ? 'text-orange-400' : 'text-muted-foreground'">Alpha</span>
                </label>

                <div class="ml-auto text-xs text-muted-foreground">
                    {{ filteredFiles.length }} files
                </div>
            </div>

            <!-- Loading -->
            <div v-if="isLoading" class="flex items-center justify-center py-12">
                <Icon name="Loader2" class="w-6 h-6 animate-spin text-primary mr-2" />
                <span class="text-muted-foreground">Loading files...</span>
            </div>

            <!-- No files -->
            <div v-else-if="filteredFiles.length === 0" class="text-center py-12 text-muted-foreground">
                <Icon name="FileText" class="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No compatible files found</p>
                <p class="text-xs mt-1">Try enabling Beta or Alpha channels</p>
            </div>

            <!-- Files List -->
            <div v-else class="max-h-[400px] overflow-y-auto space-y-2">
                <button v-for="file in filteredFiles" :key="file.id"
                    class="w-full text-left p-3 rounded-lg border transition-all" :class="[
                        isFileInstalled(file.id)
                            ? 'border-border/50 bg-muted/20 opacity-60 cursor-not-allowed'
                            : selectedFileId === file.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    ]" :disabled="isFileInstalled(file.id)"
                    @click="!isFileInstalled(file.id) && (selectedFileId = file.id)">
                    <div class="flex items-start gap-3">
                        <div class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5"
                            :class="isFileInstalled(file.id)
                                ? 'bg-muted border-muted-foreground/30'
                                : selectedFileId === file.id
                                    ? 'bg-primary border-primary'
                                    : 'border-muted-foreground/30'
                                ">
                            <Icon v-if="isFileInstalled(file.id) || selectedFileId === file.id" name="Check"
                                class="w-3 h-3"
                                :class="isFileInstalled(file.id) ? 'text-muted-foreground' : 'text-primary-foreground'" />
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="font-medium truncate">{{ file.displayName }}</span>
                                <span class="px-1.5 py-0.5 text-[10px] font-medium rounded border"
                                    :class="getReleaseTypeClass(file.releaseType)">
                                    {{ getReleaseTypeName(file.releaseType) }}
                                </span>
                                <span v-if="isFileInstalled(file.id)"
                                    class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5">
                                    <Icon name="Check" class="w-3 h-3" /> INSTALLED
                                </span>
                            </div>

                            <div class="flex items-center gap-3 text-xs text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <Icon name="Calendar" class="w-3 h-3" />
                                    {{ formatDate(file.fileDate) }}
                                </span>
                                <span>{{ formatSize(file.fileLength) }}</span>
                                <span class="truncate">
                                    {{ getGameVersionsDisplay(file.gameVersions) }}
                                </span>
                            </div>
                        </div>
                    </div>
                </button>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-3">
                <Button variant="outline" @click="emit('close')">Cancel</Button>
                <Button :disabled="!selectedFileId" @click="handleSelect">
                    <Icon name="Download" class="w-4 h-4 mr-2" />
                    Add Selected File
                </Button>
            </div>
        </template>
    </Dialog>
</template>
