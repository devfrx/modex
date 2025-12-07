<script setup lang="ts">
import Button from "@/components/ui/Button.vue";
import { X, CheckSquare } from "lucide-vue-next";

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
    class="fixed bottom-6 left-1/2 sm:left-[calc(50%+8rem)] -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-10 fade-in duration-300">
    <div
      class="bg-popover/80 border border-border backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
      <!-- Selection count badge -->
      <div class="flex items-center gap-2.5 pr-4 border-r border-border">
        <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20">
          <CheckSquare class="w-4 h-4 text-primary" />
        </div>
        <div>
          <div class="text-lg font-bold text-foreground leading-tight">{{ count }}</div>
          <div class="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{{ label }}</div>
        </div>
      </div>

      <!-- Action buttons slot -->
      <div class="flex items-center gap-2">
        <slot />
      </div>

      <!-- Close button -->
      <div class="pl-2 border-l border-border">
        <button
          class="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
          @click="$emit('clear')" title="Clear selection">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
