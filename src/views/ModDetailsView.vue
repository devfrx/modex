<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createLogger } from "@/utils/logger";
import ModDetailsModal from "@/components/mods/ModDetailsModal.vue";
import type { Mod } from "@/types/electron";

const log = createLogger("ModDetailsView");
const route = useRoute();
const router = useRouter();

const modId = computed(() => route.params.id as string);
const contextType = computed(() => (route.query.context as "library" | "modpack") || "library");
const modpackId = computed(() => route.query.modpack as string | undefined);

const mod = ref<Mod | null>(null);
const isLoading = ref(true);

// Navigate back
function goBack() {
    log.debug("Navigating back", { contextType: contextType.value, modpackId: modpackId.value });
    if (contextType.value === "modpack" && modpackId.value) {
        router.push(`/modpacks/${modpackId.value}`);
    } else {
        router.push("/library");
    }
}

// Load mod data
async function loadMod() {
    if (!modId.value || !window.api) return;

    log.info("Loading mod details", { modId: modId.value });
    isLoading.value = true;
    try {
        const mods = await window.api.mods.getAll();
        mod.value = mods.find((m) => m.id === modId.value) || null;
        if (mod.value) {
            log.debug("Mod loaded", { modId: modId.value, name: mod.value.name });
        } else {
            log.warn("Mod not found", { modId: modId.value });
        }
    } catch (err) {
        log.error("Failed to load mod", { modId: modId.value, error: String(err) });
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    log.info("ModDetailsView mounted", { modId: modId.value });
    loadMod();
});

onUnmounted(() => {
    log.debug("ModDetailsView unmounted");
});
</script>

<template>
    <div class="h-full w-full relative">
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-background">
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
        <ModDetailsModal v-else :open="true" :mod="mod" :full-screen="true" :context="{
            type: contextType,
            modpackId: modpackId,
        }" @close="goBack" />
    </div>
</template>
