<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/ui/Icon.vue";

const router = useRouter();

const hasApiKey = ref(true);
const isLoading = ref(true);
const isDismissed = ref(false);

async function checkApiKey() {
  try {
    hasApiKey.value = await window.api.curseforge.hasApiKey();
  } catch (error) {
    console.error("Failed to check API key:", error);
    hasApiKey.value = false;
  } finally {
    isLoading.value = false;
  }
}

function goToSettings() {
  router.push("/settings");
}

function dismiss() {
  // Only dismiss for this session - will show again on app restart
  isDismissed.value = true;
}

onMounted(() => {
  checkApiKey();

  // Re-check periodically in case user adds the key
  const interval = setInterval(async () => {
    try {
      const newHasApiKey = await window.api.curseforge.hasApiKey();
      if (newHasApiKey !== hasApiKey.value) {
        hasApiKey.value = newHasApiKey;
        if (newHasApiKey) {
          isDismissed.value = false; // Reset dismiss when key is added
        }
      }
    } catch (err) {
      console.error("Failed to check API key:", err);
    }
  }, 5000);

  // Cleanup interval on unmount
  return () => clearInterval(interval);
});
</script>

<template>
  <!-- API Key Warning Banner - Fixed at top of main content area -->
  <div v-if="!isLoading && !hasApiKey && !isDismissed"
    class="sticky top-0 z-30 w-full bg-gradient-to-r from-amber-500/95 via-orange-500/95 to-amber-500/95 backdrop-blur-sm shadow-lg">
    <div class="px-4 py-2.5 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="flex-shrink-0 p-1.5 rounded-full bg-white/20">
          <Icon name="AlertTriangle" class="w-4 h-4 text-white" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate">
            <span class="font-semibold">Connect to CurseForge</span>
            <span class="hidden sm:inline"> — Unlock mod browsing, updates, and more</span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <button @click="goToSettings"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 bg-white rounded-md hover:bg-orange-50 transition-colors shadow-sm">
          <Icon name="Key" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Connect Now</span>
          <span class="sm:hidden">Connect</span>
        </button>

        <button @click="dismiss"
          class="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-md transition-colors"
          aria-label="Dismiss banner">
          <Icon name="X" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Subtle bottom border -->
    <div class="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
  </div>
</template>
