<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import { createLogger } from "@/utils/logger";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";

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

// Handle export
async function handleExport() {
    if (!modpackId.value) return;
    log.info("Starting modpack export", { modpackId: modpackId.value });
    const startTime = Date.now();
    try {
        const result = await window.api.export.curseforge(modpackId.value);
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
</template>
