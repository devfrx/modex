<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { createLogger } from "@/utils/logger";
import { useToast } from "@/composables/useToast";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import type { Modpack } from "@/types/electron";

const log = createLogger("ConvertModpackDialog");

const props = defineProps<{
    open: boolean;
    modpack: Modpack | null;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "success"): void;
}>();

const toast = useToast();

// Form state
const newName = ref("");
const targetVersion = ref("");
const targetLoader = ref("");
const isConverting = ref(false);
const conversionProgress = ref({ current: 0, total: 0, modName: "" });
const conversionResult = ref<{
    success: number;
    failed: number;
    skipped: number;
    details: Array<{ modName: string; status: "success" | "failed" | "skipped"; reason?: string }>;
} | null>(null);

// Summary filter for results
const summaryFilter = ref<"all" | "success" | "failed" | "skipped">("all");

const filteredDetails = computed(() => {
    if (!conversionResult.value) return [];
    if (summaryFilter.value === "all") return conversionResult.value.details;
    return conversionResult.value.details.filter(d => d.status === summaryFilter.value);
});

// Group failed mods by reason category
const failedByReason = computed(() => {
    if (!conversionResult.value) return {};
    const failed = conversionResult.value.details.filter(d => d.status === "failed");
    const groups: Record<string, typeof failed> = {
        "Wrong Loader": [],
        "Wrong Version": [],
        "Not Available": [],
        "Other": []
    };

    for (const item of failed) {
        const reason = item.reason?.toLowerCase() || "";
        if (reason.includes("not for") || reason.includes("requires")) {
            groups["Wrong Loader"].push(item);
        } else if (reason.includes("version") && reason.includes("available for")) {
            groups["Wrong Version"].push(item);
        } else if (reason.includes("no files found") || reason.includes("no compatible")) {
            groups["Not Available"].push(item);
        } else {
            groups["Other"].push(item);
        }
    }

    // Remove empty groups
    return Object.fromEntries(Object.entries(groups).filter(([_, v]) => v.length > 0));
});

const gameVersions = [
    "1.21.4",
    "1.21.3",
    "1.21.1",
    "1.21",
    "1.20.6",
    "1.20.4",
    "1.20.2",
    "1.20.1",
    "1.20",
    "1.19.4",
    "1.19.2",
    "1.19",
    "1.18.2",
    "1.17.1",
    "1.16.5",
];

const loaders = ["forge", "fabric", "neoforge", "quilt"];

// Watch for dialog open/close to reset form
watch(() => props.open, (isOpen) => {
    if (isOpen && props.modpack) {
        newName.value = `${props.modpack.name} (Converted)`;
        targetVersion.value = props.modpack.minecraft_version || "";
        targetLoader.value = props.modpack.loader || "";
        conversionResult.value = null;
        conversionProgress.value = { current: 0, total: 0, modName: "" };
    }
});

const canConvert = computed(() => {
    return newName.value.trim() && targetVersion.value && targetLoader.value;
});

const hasChanges = computed(() => {
    if (!props.modpack) return false;
    return (
        targetVersion.value !== props.modpack.minecraft_version ||
        targetLoader.value !== props.modpack.loader
    );
});

async function convertModpack() {
    if (!props.modpack || !canConvert.value || !hasChanges.value) return;

    isConverting.value = true;
    conversionResult.value = null;

    try {
        // Get current mods
        const currentMods = await window.api.modpacks.getMods(props.modpack.id);
        conversionProgress.value = { current: 0, total: currentMods.length, modName: "" };

        // Create new modpack
        const newModpackId = await window.api.modpacks.create({
            name: newName.value.trim(),
            version: props.modpack.version || "1.0.0",
            minecraft_version: targetVersion.value,
            loader: targetLoader.value,
            description: `Converted from ${props.modpack.name} (${props.modpack.minecraft_version} ${props.modpack.loader})`,
        });

        if (!newModpackId) {
            throw new Error("Failed to create new modpack");
        }

        // Try to find compatible versions for each mod
        const results: Array<{ modName: string; status: "success" | "failed" | "skipped"; reason?: string }> = [];
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const mod of currentMods) {
            conversionProgress.value = {
                current: conversionProgress.value.current + 1,
                total: currentMods.length,
                modName: mod.name
            };

            // Check if this is a mod or resourcepack/shader
            const isModContent = !mod.content_type || mod.content_type === "mod";

            try {
                // Skip if not from CurseForge
                if (mod.source !== "curseforge" || !mod.cf_project_id) {
                    results.push({
                        modName: mod.name,
                        status: "skipped",
                        reason: "Not from CurseForge",
                    });
                    skippedCount++;
                    continue;
                }

                // Search for compatible file
                // For shaders/resourcepacks, don't filter by loader
                const files = await window.api.curseforge.getModFiles(mod.cf_project_id, {
                    gameVersion: targetVersion.value,
                    modLoader: isModContent ? targetLoader.value : undefined,
                });

                if (files.length === 0) {
                    const reasonSuffix = isModContent ? ` ${targetLoader.value}` : "";
                    results.push({
                        modName: mod.name,
                        status: "failed",
                        reason: `No files found for ${targetVersion.value}${reasonSuffix}`,
                    });
                    failedCount++;
                    continue;
                }

                // Find compatible file
                // For mods: must match EXACTLY the target version AND loader in gameVersions array
                // For shaders/resourcepacks: only check version compatibility
                const targetLoaderLower = targetLoader.value.toLowerCase();
                let file;

                if (isModContent) {
                    // STRICT: The file must explicitly list the target loader - no cross-loader compatibility
                    file = files.find(f => {
                        const gameVersions = (f.gameVersions || []).map((v: string) => v.toLowerCase());
                        // Must have the exact MC version
                        const hasVersion = gameVersions.includes(targetVersion.value.toLowerCase());
                        // Must have the EXACT loader - strict match only
                        const hasLoader = gameVersions.includes(targetLoaderLower);
                        return hasVersion && hasLoader;
                    });
                } else {
                    // For shaders/resourcepacks: only check if version is in gameVersions list
                    file = files.find(f => {
                        const gameVersions = f.gameVersions || [];
                        return gameVersions.some((gv: string) =>
                            gv === targetVersion.value ||
                            gv.startsWith(targetVersion.value + ".") ||
                            targetVersion.value.startsWith(gv + ".")
                        );
                    });
                    // If no exact match, try first release file
                    if (!file) {
                        file = files.find((f: any) => f.releaseType === 1) || files[0];
                    }
                }

                if (!file) {
                    // Check if any file has the loader but wrong version, or version but wrong loader
                    if (isModContent) {
                        const filesWithLoader = files.filter(f =>
                            (f.gameVersions || []).some((v: string) => v.toLowerCase() === targetLoaderLower)
                        );
                        const filesWithVersion = files.filter(f =>
                            (f.gameVersions || []).includes(targetVersion.value)
                        );

                        let reason = `No compatible file for ${targetVersion.value} ${targetLoader.value}`;
                        if (filesWithVersion.length > 0 && filesWithLoader.length === 0) {
                            reason = `Version ${targetVersion.value} available but not for ${targetLoader.value}`;
                        } else if (filesWithLoader.length > 0 && filesWithVersion.length === 0) {
                            const availableVersions = filesWithLoader
                                .flatMap(f => f.gameVersions || [])
                                .filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v))
                                .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
                                .slice(0, 3)
                                .join(', ');
                            reason = `${targetLoader.value} available for: ${availableVersions || 'unknown versions'}`;
                        }

                        results.push({
                            modName: mod.name,
                            status: "failed",
                            reason,
                        });
                    } else {
                        // For shaders/resourcepacks - version mismatch
                        const availableVersions = files
                            .flatMap(f => f.gameVersions || [])
                            .filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v))
                            .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
                            .slice(0, 5)
                            .join(', ');
                        results.push({
                            modName: mod.name,
                            status: "failed",
                            reason: `Not available for ${targetVersion.value}. Available: ${availableVersions || 'unknown'}`,
                        });
                    }
                    failedCount++;
                    continue;
                }

                log.debug("Found file for mod", { fileId: file.id, modName: mod.name, gameVersions: file.gameVersions });

                // Map content_type to API format
                const contentTypeMap: Record<string, "mods" | "resourcepacks" | "shaders"> = {
                    mod: "mods",
                    resourcepack: "resourcepacks",
                    shader: "shaders",
                };
                const apiContentType = mod.content_type ? contentTypeMap[mod.content_type] : "mods";

                const addedMod = await window.api.curseforge.addToLibrary(
                    mod.cf_project_id,
                    file.id,
                    isModContent ? targetLoader.value : undefined,
                    apiContentType
                );

                if (addedMod) {
                    // Add to new modpack
                    await window.api.modpacks.addMod(newModpackId, addedMod.id);
                    results.push({
                        modName: mod.name,
                        status: "success",
                    });
                    successCount++;
                } else {
                    results.push({
                        modName: mod.name,
                        status: "failed",
                        reason: "Failed to add to library",
                    });
                    failedCount++;
                }
            } catch (err) {
                log.error("Failed to convert mod", { modName: mod.name, error: String(err) });
                results.push({
                    modName: mod.name,
                    status: "failed",
                    reason: (err as Error).message,
                });
                failedCount++;
            }
        }

        conversionResult.value = {
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            details: results,
        };

        toast.success(
            "Conversion Complete",
            `${successCount} mods converted, ${failedCount} failed, ${skippedCount} skipped`
        );

        // Don't emit success here - let user review results and close manually
        // emit("success") is called when user clicks "Done" after reviewing
    } catch (err) {
        log.error("Conversion failed", { modpackId: props.modpack?.id, error: String(err) });
        toast.error("Conversion Failed", (err as Error).message);
    } finally {
        isConverting.value = false;
    }
}

function handleClose() {
    if (!isConverting.value) {
        emit("close");
    }
}
</script>

<template>
    <Dialog :open="open" @close="handleClose" maxWidth="2xl">
        <template #header>
            <div v-if="conversionResult" class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Icon name="CheckCircle2" class="w-5 h-5 text-green-500" />
                </div>
                <div>
                    <h2 class="text-lg font-semibold text-green-500">Conversion Complete!</h2>
                    <p class="text-sm text-muted-foreground">Your modpack has been converted successfully</p>
                </div>
            </div>
            <div v-else class="flex items-center gap-2">
                <Icon name="RefreshCw" class="w-5 h-5" />
                Convert Modpack
            </div>
        </template>

        <div class="space-y-4">
            <div v-if="modpack" class="p-3 bg-muted/30 rounded-lg border text-sm">
                <div class="font-medium mb-1">Converting: {{ modpack.name }}</div>
                <div class="text-xs text-muted-foreground">
                    Current: {{ modpack.minecraft_version }} {{ modpack.loader }}
                </div>
            </div>

            <!-- Conversion Form -->
            <div v-if="!conversionResult" class="space-y-4">
                <div>
                    <label class="text-sm font-medium mb-2 block">New Modpack Name</label>
                    <input v-model="newName" type="text" class="w-full h-10 px-3 rounded-lg border bg-background"
                        placeholder="Enter new modpack name" :disabled="isConverting" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-sm font-medium mb-2 block">Target Minecraft Version</label>
                        <select v-model="targetVersion" class="w-full h-10 px-3 rounded-lg border bg-background"
                            :disabled="isConverting">
                            <option value="">Select version...</option>
                            <option v-for="v in gameVersions" :key="v" :value="v">
                                {{ v }}
                            </option>
                        </select>
                    </div>

                    <div>
                        <label class="text-sm font-medium mb-2 block">Target Mod Loader</label>
                        <select v-model="targetLoader"
                            class="w-full h-10 px-3 rounded-lg border bg-background capitalize"
                            :disabled="isConverting">
                            <option value="">Select loader...</option>
                            <option v-for="l in loaders" :key="l" :value="l" class="capitalize">
                                {{ l }}
                            </option>
                        </select>
                    </div>
                </div>

                <div v-if="!hasChanges && canConvert"
                    class="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-600 text-sm">
                    <Icon name="AlertTriangle" class="w-4 h-4 inline mr-1.5" />
                    No changes detected. Please select a different version or loader.
                </div>

                <div
                    class="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-600 dark:text-blue-400 text-sm">
                    <strong>Note:</strong> This will create a copy of your modpack and attempt to find compatible
                    versions of
                    all mods for the target version/loader. Mods without a file for the exact target loader will be
                    skipped.
                </div>

                <!-- Progress indicator during conversion -->
                <div v-if="isConverting" class="space-y-3">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-muted-foreground">Converting mods...</span>
                        <span class="font-medium">{{ conversionProgress.current }} / {{ conversionProgress.total
                            }}</span>
                    </div>
                    <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div class="bg-primary h-full transition-all duration-300"
                            :style="{ width: `${(conversionProgress.current / conversionProgress.total) * 100}%` }">
                        </div>
                    </div>
                    <div v-if="conversionProgress.modName" class="text-xs text-muted-foreground truncate">
                        {{ conversionProgress.modName }}
                    </div>
                </div>
            </div>

            <!-- Conversion Results -->
            <div v-if="conversionResult" class="space-y-4">
                <!-- Success Banner -->
                <div
                    class="p-4 bg-gradient-to-r from-green-500/10 via-green-500/5 to-transparent border border-green-500/20 rounded-xl">
                    <div class="flex items-center gap-3">
                        <div class="flex-1">
                            <p class="text-sm text-foreground">
                                Created <strong class="text-green-400">"{{ newName }}"</strong> with
                                <strong class="text-green-400">{{ conversionResult.success }}</strong> mods.
                            </p>
                            <p class="text-xs text-muted-foreground mt-1">
                                Target: {{ targetVersion }} {{ targetLoader }}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Summary Cards -->
                <div class="grid grid-cols-3 gap-3">
                    <button @click="summaryFilter = summaryFilter === 'success' ? 'all' : 'success'"
                        class="p-3 rounded-lg text-center transition-all" :class="summaryFilter === 'success'
                            ? 'bg-green-500/20 border-2 border-green-500'
                            : 'bg-green-500/10 border border-green-500/30 hover:bg-green-500/15'">
                        <div class="text-2xl font-bold text-green-500">{{ conversionResult.success }}</div>
                        <div class="text-xs text-green-600 dark:text-green-400">Converted</div>
                    </button>
                    <button @click="summaryFilter = summaryFilter === 'failed' ? 'all' : 'failed'"
                        class="p-3 rounded-lg text-center transition-all" :class="summaryFilter === 'failed'
                            ? 'bg-red-500/20 border-2 border-red-500'
                            : 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/15'">
                        <div class="text-2xl font-bold text-red-500">{{ conversionResult.failed }}</div>
                        <div class="text-xs text-red-600 dark:text-red-400">Failed</div>
                    </button>
                    <button @click="summaryFilter = summaryFilter === 'skipped' ? 'all' : 'skipped'"
                        class="p-3 rounded-lg text-center transition-all" :class="summaryFilter === 'skipped'
                            ? 'bg-yellow-500/20 border-2 border-yellow-500'
                            : 'bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/15'">
                        <div class="text-2xl font-bold text-yellow-500">{{ conversionResult.skipped }}</div>
                        <div class="text-xs text-yellow-600 dark:text-yellow-400">Skipped</div>
                    </button>
                </div>

                <!-- Failure Categories (only shown when filtering failed) -->
                <div v-if="summaryFilter === 'failed' && Object.keys(failedByReason).length > 0"
                    class="flex flex-wrap gap-2 text-xs">
                    <span v-for="(items, category) in failedByReason" :key="category"
                        class="px-2 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                        {{ category }}: {{ items.length }}
                    </span>
                </div>

                <!-- Filter indicator -->
                <div v-if="summaryFilter !== 'all'" class="flex items-center justify-between text-sm">
                    <span class="text-muted-foreground">
                        Showing {{ filteredDetails.length }} {{ summaryFilter }} mods
                    </span>
                    <button @click="summaryFilter = 'all'" class="text-primary hover:underline text-xs">
                        Show all
                    </button>
                </div>

                <!-- Details List -->
                <div class="max-h-64 overflow-y-auto space-y-1">
                    <div v-for="(detail, idx) in filteredDetails" :key="idx"
                        class="flex items-start gap-2 p-2 rounded text-sm" :class="{
                            'bg-green-500/10': detail.status === 'success',
                            'bg-red-500/10': detail.status === 'failed',
                            'bg-yellow-500/10': detail.status === 'skipped',
                        }">
                        <Icon v-if="detail.status === 'success'" name="CheckCircle2"
                            class="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <Icon v-else-if="detail.status === 'failed'" name="XCircle"
                            class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <Icon v-else name="AlertTriangle" class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />

                        <div class="flex-1 min-w-0">
                            <div class="font-medium truncate">{{ detail.modName }}</div>
                            <div v-if="detail.reason" class="text-xs opacity-70 truncate">{{ detail.reason }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-3">
                <Button v-if="conversionResult" variant="outline" @click="handleClose">
                    Close
                </Button>
                <Button v-if="conversionResult" @click="() => { emit('success'); emit('close'); }">
                    <Icon name="CheckCircle2" class="w-4 h-4 mr-2" />
                    Done
                </Button>
                <Button v-if="!conversionResult" variant="outline" @click="handleClose" :disabled="isConverting">
                    Cancel
                </Button>
                <Button v-if="!conversionResult" @click="convertModpack"
                    :disabled="!canConvert || !hasChanges || isConverting">
                    <Icon v-if="isConverting" name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
                    <Icon v-else name="RefreshCw" class="w-4 h-4 mr-2" />
                    {{ isConverting ? "Converting..." : "Convert Modpack" }}
                </Button>
            </div>
        </template>
    </Dialog>
</template>
