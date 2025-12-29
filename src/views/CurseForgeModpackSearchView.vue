<script setup lang="ts">
import { useRouter } from "vue-router";
import CurseForgeModpackSearch from "@/components/modpacks/CurseForgeModpackSearch.vue";

const router = useRouter();

// Navigate back to modpacks
function goBack() {
    router.push("/modpacks");
}

// Handle modpack imported
function handleImported() {
    router.push("/modpacks");
}
</script>

<template>
    <CurseForgeModpackSearch :open="true" :full-screen="true" @close="goBack" @imported="handleImported" />
</template>
