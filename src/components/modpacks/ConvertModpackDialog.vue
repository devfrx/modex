<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import { RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-vue-next";
import type { Modpack } from "@/types/electron";

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
const conversionResult = ref<{
    success: number;
    failed: number;
    skipped: number;
    details: Array<{ modName: string; status: "success" | "failed" | "skipped"; reason?: string }>;
} | null>(null);

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
                const files = await window.api.curseforge.getModFiles(mod.cf_project_id, {
                    gameVersion: targetVersion.value,
                    modLoader: targetLoader.value,
                });

                if (files.length === 0) {
                    results.push({
                        modName: mod.name,
                        status: "failed",
                        reason: `No files found for ${targetVersion.value} ${targetLoader.value}`,
                    });
                    failedCount++;
                    continue;
                }

                // Find file that EXACTLY matches the target version in gameVersions array
                // CurseForge API may return files that support multiple versions
                const file = files.find(f => {
                    const gameVersions = f.gameVersions || [];
                    return gameVersions.includes(targetVersion.value);
                });

                if (!file) {
                    // Show what versions were available
                    const availableVersions = files
                        .flatMap(f => f.gameVersions || [])
                        .filter((v: string) => /^1\.\d+(\.\d+)?$/.test(v))
                        .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
                        .slice(0, 5)
                        .join(', ');

                    results.push({
                        modName: mod.name,
                        status: "failed",
                        reason: `No exact match for ${targetVersion.value}. Available: ${availableVersions || 'none'}`,
                    });
                    failedCount++;
                    continue;
                }

                console.log(`[Convert] Found file ${file.id} for ${mod.name} - gameVersions: ${file.gameVersions?.join(', ')}`);

                const addedMod = await window.api.curseforge.addToLibrary(
                    mod.cf_project_id,
                    file.id,
                    targetLoader.value
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
                console.error(`Failed to convert mod ${mod.name}:`, err);
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

        emit("success");
    } catch (err) {
        console.error("Conversion failed:", err);
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
            <div class="flex items-center gap-2">
                <RefreshCw class="w-5 h-5" />
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
                    <AlertTriangle class="w-4 h-4 inline mr-1.5" />
                    No changes detected. Please select a different version or loader.
                </div>

                <div
                    class="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-600 dark:text-blue-400 text-sm">
                    <strong>Note:</strong> This will create a copy of your modpack and attempt to find compatible
                    versions of
                    all mods for the target version/loader. Mods that don't have compatible versions will be skipped.
                </div>
            </div>

            <!-- Conversion Results -->
            <div v-if="conversionResult" class="space-y-3">
                <div class="grid grid-cols-3 gap-3">
                    <div class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                        <div class="text-2xl font-bold text-green-500">{{ conversionResult.success }}</div>
                        <div class="text-xs text-green-600 dark:text-green-400">Converted</div>
                    </div>
                    <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                        <div class="text-2xl font-bold text-red-500">{{ conversionResult.failed }}</div>
                        <div class="text-xs text-red-600 dark:text-red-400">Failed</div>
                    </div>
                    <div class="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                        <div class="text-2xl font-bold text-yellow-500">{{ conversionResult.skipped }}</div>
                        <div class="text-xs text-yellow-600 dark:text-yellow-400">Skipped</div>
                    </div>
                </div>

                <!-- Details -->
                <div class="max-h-64 overflow-y-auto space-y-1">
                    <div v-for="(detail, idx) in conversionResult.details" :key="idx"
                        class="flex items-start gap-2 p-2 rounded text-sm" :class="{
                            'bg-green-500/10': detail.status === 'success',
                            'bg-red-500/10': detail.status === 'failed',
                            'bg-yellow-500/10': detail.status === 'skipped',
                        }">
                        <CheckCircle2 v-if="detail.status === 'success'"
                            class="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        <XCircle v-else-if="detail.status === 'failed'"
                            class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <AlertTriangle v-else class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />

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
                <Button variant="outline" @click="handleClose" :disabled="isConverting">
                    {{ conversionResult ? "Close" : "Cancel" }}
                </Button>
                <Button v-if="!conversionResult" @click="convertModpack"
                    :disabled="!canConvert || !hasChanges || isConverting">
                    <Loader2 v-if="isConverting" class="w-4 h-4 mr-2 animate-spin" />
                    <RefreshCw v-else class="w-4 h-4 mr-2" />
                    {{ isConverting ? "Converting..." : "Convert Modpack" }}
                </Button>
            </div>
        </template>
    </Dialog>
</template>
