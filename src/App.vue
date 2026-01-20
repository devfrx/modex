<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppLayout from "@/components/layout/AppLayout.vue";
import DialogProvider from "@/components/ui/DialogProvider.vue";
import GlobalSearch from "@/components/ui/GlobalSearch.vue";
import WalkthroughModal from "@/components/ui/WalkthroughModal.vue";
import { useTheme } from "@/composables/useTheme";
import { createLogger } from "@/utils/logger";

const log = createLogger("App");

const { initializeTheme } = useTheme();

log.info("Application starting", { timestamp: new Date().toISOString() });
initializeTheme();

// Walkthrough modal state
const showWalkthrough = ref(false);

const WALKTHROUGH_STORAGE_KEY = "modex:walkthrough:dismissed";

onMounted(() => {
  log.debug("App mounted, checking walkthrough state");
  // Show walkthrough on first launch or if not dismissed
  const isDismissed = localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === "true";
  log.debug("Walkthrough dismissed status", { isDismissed });
  if (!isDismissed) {
    // Small delay to let the app render first
    log.info("First launch detected, showing walkthrough");
    setTimeout(() => {
      showWalkthrough.value = true;
    }, 500);
  }
});

function closeWalkthrough() {
  log.debug("Closing walkthrough modal");
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
