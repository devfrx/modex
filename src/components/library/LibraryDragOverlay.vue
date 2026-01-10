<script setup lang="ts">
import { FilePlus } from "lucide-vue-next";

defineProps<{
  visible: boolean;
}>();
</script>

<template>
  <div
    v-if="visible"
    class="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none"
  >
    <div class="text-center">
      <FilePlus class="w-16 h-16 mx-auto text-primary mb-4" />
      <p class="text-xl font-semibold">Drop .jar files here</p>
      <p class="text-muted-foreground">
        Files will be imported to your library
      </p>
    </div>
  </div>
</template>
