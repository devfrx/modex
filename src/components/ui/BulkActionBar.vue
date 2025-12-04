<script setup lang="ts">
import Button from "@/components/ui/Button.vue";
import { X } from "lucide-vue-next";

defineProps<{
  count: number;
  label: string; // "mods" or "modpacks"
}>();

defineEmits<{
  (e: "clear"): void;
}>();
</script>

<template>
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-foreground/90 text-background backdrop-blur-md px-4 py-3 rounded-lg shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300"
  >
    <div class="flex items-center gap-3 border-r border-background/20 pr-4">
      <div class="font-bold text-lg">{{ count }}</div>
      <div class="text-sm font-medium">{{ label }} selected</div>
    </div>

    <div class="flex items-center gap-2">
      <slot />
    </div>

    <Button
      variant="ghost"
      size="icon"
      class="ml-2 h-8 w-8 text-background/70 hover:text-background hover:bg-background/20"
      @click="$emit('clear')"
    >
      <X class="w-4 h-4" />
    </Button>
  </div>
</template>
