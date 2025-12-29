<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import CurseForgeSearch from "@/components/mods/CurseForgeSearch.vue";
import type { Mod } from "@/types";

const route = useRoute();
const router = useRouter();

// Library mods for tracking installed files
const libraryMods = ref<Mod[]>([]);

// Get content type from query params
const contentType = computed((): "mods" | "resourcepacks" | "shaders" => {
    const type = route.query.type as string;
    if (type === "resourcepacks" || type === "shaders") return type;
    return "mods";
});

// Build installed project files map from library mods
const installedProjectFiles = computed(() => {
    const map = new Map<number, Set<number>>();
    for (const mod of libraryMods.value) {
        if (mod.cf_project_id && mod.cf_file_id) {
            if (!map.has(mod.cf_project_id)) {
                map.set(mod.cf_project_id, new Set());
            }
            map.get(mod.cf_project_id)!.add(mod.cf_file_id);
        }
    }
    return map;
});

// Load library mods on mount
onMounted(async () => {
    try {
        libraryMods.value = await window.api.mods.getAll();
    } catch (err) {
        console.error("Failed to load library mods:", err);
    }
});

// Navigate back to library
function goBack() {
    router.push("/library");
}

// Handle mod added - reload library mods to update installed state
async function handleAdded() {
    try {
        libraryMods.value = await window.api.mods.getAll();
    } catch (err) {
        console.error("Failed to reload library mods:", err);
    }
}
</script>

<template>
    <CurseForgeSearch :open="true" :full-screen="true" :initial-content-type="contentType"
        :installed-project-files="installedProjectFiles" @close="goBack" @added="handleAdded" />
</template>
