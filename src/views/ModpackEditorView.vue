<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import { createLogger } from "@/utils/logger";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";
import ExportProfileDialog from "@/components/modpacks/ExportProfileDialog.vue";
import type { ExportOptions } from "@/components/modpacks/ExportProfileDialog.vue";
import type { Modpack } from "@/types";

const log = createLogger("ModpackEditorView");

type TabType = "mods" | "discover" | "health" | "versions" | "settings" | "remote" | "configs";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Props from route
const modpackId = computed(() => route.params.id as string);
const initialTab = computed((): TabType => {
    const tab = route.query.tab as string;
    const validTabs: TabType[] = ["mods", "discover", "health", "versions", "settings", "remote", "configs"];
    return validTabs.includes(tab as TabType) ? (tab as TabType) : "mods";
});

// Export dialog state
const showExportDialog = ref(false);
const exportModpackData = ref<Modpack | null>(null);

onMounted(() => {
    log.info("ModpackEditorView mounted", {
        modpackId: modpackId.value,
        initialTab: initialTab.value
    });
});

onUnmounted(() => {
    log.debug("ModpackEditorView unmounted", { modpackId: modpackId.value });
});

// Navigate back to modpacks list
function goBack() {
    log.debug("Navigating back to modpacks list");
    router.push("/modpacks");
}

// Open export dialog
async function handleExport() {
    if (!modpackId.value) return;
    log.info("Opening export dialog", { modpackId: modpackId.value });

    try {
        // Load modpack data for the dialog
        const modpack = await window.api.modpacks.getById(modpackId.value);
        if (modpack) {
            exportModpackData.value = modpack;
            showExportDialog.value = true;
        }
    } catch (err) {
        log.error("Failed to load modpack for export", { error: String(err) });
        toast.error("Export Failed", String(err));
    }
}

// Handle export with options from dialog
async function handleExportWithOptions(options: ExportOptions) {
    if (!modpackId.value) return;

    showExportDialog.value = false;
    log.info("Starting modpack export with options", { modpackId: modpackId.value, options });
    const startTime = Date.now();

    try {
        const result = await window.api.export.curseforge(modpackId.value, {
            profileName: options.profileName,
            version: options.version,
            selectedFolders: options.selectedFolders,
            excludedPaths: options.excludedPaths,
            includeRamRecommendation: options.includeRamRecommendation,
            ramRecommendation: options.ramRecommendation,
            serverModsOnly: options.serverModsOnly,
        });
        if (result) {
            log.info("Modpack exported successfully", {
                modpackId: modpackId.value,
                path: result.path,
                durationMs: Date.now() - startTime
            });
            toast.success("Export ready ✓", `Saved to ${result.path}`);
        }
    } catch (err) {
        log.error("Modpack export failed", {
            modpackId: modpackId.value,
            error: String(err),
            durationMs: Date.now() - startTime
        });
        toast.error("Couldn't export", String(err));
    } finally {
        exportModpackData.value = null;
    }
}

// Handle update event
function handleUpdate() {
    log.debug("Modpack update event received", { modpackId: modpackId.value });
}
</script>

<template>
    <ModpackEditor :modpack-id="modpackId" :is-open="true" :initial-tab="initialTab" :full-screen="true" @close="goBack"
        @update="handleUpdate" @export="handleExport" />

    <!-- Export Profile Dialog -->
    <ExportProfileDialog :open="showExportDialog" :modpack="exportModpackData" @close="showExportDialog = false"
        @export="handleExportWithOptions" />
</template>
