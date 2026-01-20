<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { createLogger } from "@/utils/logger";
import CurseForgeModpackSearch from "@/components/modpacks/CurseForgeModpackSearch.vue";

const log = createLogger("CurseForgeModpackSearchView");
const router = useRouter();

onMounted(() => {
    log.info("CurseForgeModpackSearchView mounted");
});

onUnmounted(() => {
    log.debug("CurseForgeModpackSearchView unmounted");
});

// Navigate back to modpacks
function goBack() {
    log.debug("Navigating back to modpacks");
    router.push("/modpacks");
}

// Handle modpack imported
function handleImported() {
    log.info("Modpack imported, navigating to modpacks");
    router.push("/modpacks");
}
</script>

<template>
    <CurseForgeModpackSearch :open="true" :full-screen="true" @close="goBack" @imported="handleImported" />
</template>
