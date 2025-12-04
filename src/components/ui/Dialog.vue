<script setup lang="ts">
import { cn } from "@/lib/utils";

defineProps<{
  open: boolean;
  title?: string;
  description?: string;
}>();

defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
  >
    <div
      class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
    >
      <div class="flex flex-col space-y-1.5 text-center sm:text-left">
        <h2
          v-if="title"
          class="text-lg font-semibold leading-none tracking-tight"
        >
          {{ title }}
        </h2>
        <p v-if="description" class="text-sm text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <slot />
      <div
        class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
      >
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
