<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import ModpackEditor from "@/components/modpacks/ModpackEditor.vue";

type TabType = "play" | "mods" | "discover" | "health" | "versions" | "settings" | "remote" | "configs";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Props from route
const modpackId = computed(() => route.params.id as string);
const initialTab = computed((): TabType => {
    const tab = route.query.tab as string;
    const validTabs: TabType[] = ["play", "mods", "discover", "health", "versions", "settings", "remote", "configs"];
    return validTabs.includes(tab as TabType) ? (tab as TabType) : "mods";
});

// Navigate back to modpacks list
function goBack() {
    router.push("/modpacks");
}

// Handle export
async function handleExport() {
    if (!modpackId.value) return;
    try {
        const result = await window.api.export.curseforge(modpackId.value);
        if (result) {
            toast.success("Exported", `Modpack exported to ${result.path}`);
        }
    } catch (err) {
        toast.error("Export Failed", String(err));
    }
}

// Handle update event
function handleUpdate() {
    // Could trigger a refresh or other actions
}
</script>

<template>
    <ModpackEditor :modpack-id="modpackId" :is-open="true" :initial-tab="initialTab" :full-screen="true" @close="goBack"
        @update="handleUpdate" @export="handleExport" />
</template>
