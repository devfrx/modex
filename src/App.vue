<script setup lang="ts">
import AppLayout from "@/components/layout/AppLayout.vue";
import DialogProvider from "@/components/ui/DialogProvider.vue";
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
  <DialogProvider />
</template>
