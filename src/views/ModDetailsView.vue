<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import ModDetailsModal from "@/components/mods/ModDetailsModal.vue";
import type { Mod } from "@/types/electron";

const route = useRoute();
const router = useRouter();

const modId = computed(() => route.params.id as string);
const contextType = computed(() => (route.query.context as "library" | "modpack") || "library");
const modpackId = computed(() => route.query.modpack as string | undefined);

const mod = ref<Mod | null>(null);
const isLoading = ref(true);

// Navigate back
function goBack() {
    if (contextType.value === "modpack" && modpackId.value) {
        router.push(`/modpacks/${modpackId.value}`);
    } else {
        router.push("/library");
    }
}

// Load mod data
async function loadMod() {
    if (!modId.value || !window.api) return;

    isLoading.value = true;
    try {
        const mods = await window.api.mods.getAll();
        mod.value = mods.find((m) => m.id === modId.value) || null;
    } catch (err) {
        console.error("Failed to load mod:", err);
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    loadMod();
});
</script>

<template>
    <div v-if="isLoading" class="h-screen w-screen flex items-center justify-center bg-background">
        <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>
    <ModDetailsModal v-else :open="true" :mod="mod" :full-screen="true" :context="{
        type: contextType,
        modpackId: modpackId,
    }" @close="goBack" />
</template>
