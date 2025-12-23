<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

defineProps<{
  open: boolean;
  title?: string;
  message?: string;
  progress?: number; // 0-100
  fullscreen?: boolean;
}>();
</script>

<template>
  <!-- Fullscreen Overlay -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100"
      leave-to-class="opacity-0">
      <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center" :class="fullscreen ? 'bg-background' : 'bg-background/80 backdrop-blur-sm'
        ">
        <div class="flex flex-col items-center justify-center space-y-4 p-6 rounded-lg max-w-sm text-center">
          <!-- Spinner -->
          <div class="relative">
            <div class="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
            <Loader2 class="w-12 h-12 text-primary animate-spin relative z-10" />
          </div>

          <!-- Title -->
          <h3 v-if="title" class="text-lg font-semibold">{{ title }}</h3>

          <!-- Message -->
          <p v-if="message" class="text-muted-foreground text-sm">
            {{ message }}
          </p>

          <!-- Progress Bar -->
          <div v-if="progress !== undefined" class="w-full space-y-2">
            <div class="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div class="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }" />
            </div>
            <p class="text-xs text-muted-foreground">
              {{ Math.round(progress) }}%
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
