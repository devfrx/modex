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
    class="fixed bottom-3 sm:bottom-6 left-1/2 sm:left-[calc(50%+8rem)] -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-10 fade-in duration-300 w-[calc(100%-1.5rem)] sm:w-auto max-w-full">
    <div
      class="bg-card/95 border border-border/50 backdrop-blur-xl px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg shadow-lg shadow-black/10 flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
      <!-- Selection count badge -->
      <div class="flex items-center gap-2 sm:gap-2.5 pr-2 sm:pr-4 border-r border-border flex-shrink-0">
        <div class="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20">
          <CheckSquare class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
        </div>
        <div>
          <div class="text-base sm:text-lg font-bold text-foreground leading-tight">{{ count }}</div>
          <div class="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{{ label }}
          </div>
        </div>
      </div>

      <!-- Action buttons slot -->
      <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <slot />
      </div>

      <!-- Close button -->
      <div class="pl-2 border-l border-border flex-shrink-0">
        <button
          class="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
          @click="$emit('clear')" title="Clear selection">
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
