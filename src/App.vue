<script setup lang="ts">
import AppLayout from "@/components/layout/AppLayout.vue";
import DialogProvider from "@/components/ui/DialogProvider.vue";
import GlobalSearch from "@/components/ui/GlobalSearch.vue";
import { useTheme } from "@/composables/useTheme";

const { initializeTheme } = useTheme();
initializeTheme();
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
  <DialogProvider />
  <GlobalSearch />
</template>
