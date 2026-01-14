<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppLayout from "@/components/layout/AppLayout.vue";
import DialogProvider from "@/components/ui/DialogProvider.vue";
import GlobalSearch from "@/components/ui/GlobalSearch.vue";
import WalkthroughModal from "@/components/ui/WalkthroughModal.vue";
import { useTheme } from "@/composables/useTheme";

const { initializeTheme } = useTheme();
initializeTheme();

// Walkthrough modal state
const showWalkthrough = ref(false);

const WALKTHROUGH_STORAGE_KEY = "modex:walkthrough:dismissed";

onMounted(() => {
  // Show walkthrough on first launch or if not dismissed
  const isDismissed = localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === "true";
  if (!isDismissed) {
    // Small delay to let the app render first
    setTimeout(() => {
      showWalkthrough.value = true;
    }, 500);
  }
});

function closeWalkthrough() {
  showWalkthrough.value = false;
}
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
  <DialogProvider />
  <GlobalSearch />
  <WalkthroughModal :open="showWalkthrough" @close="closeWalkthrough" />
</template>
