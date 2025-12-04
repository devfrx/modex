<script setup lang="ts">
import Dialog from "@/components/ui/Dialog.vue";
import { Loader2 } from "lucide-vue-next";

defineProps<{
  open: boolean;
  title: string;
  message: string;
  progress?: number; // 0-100
}>();
</script>

<template>
  <Dialog :open="open" :title="title">
    <div class="flex flex-col items-center justify-center py-6 space-y-4">
      <Loader2 class="w-10 h-10 text-primary animate-spin" />
      <p class="text-center text-muted-foreground">{{ message }}</p>

      <div
        v-if="progress !== undefined"
        class="w-full bg-secondary rounded-full h-2.5 overflow-hidden"
      >
        <div
          class="bg-primary h-2.5 rounded-full transition-all duration-300"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
      <p v-if="progress !== undefined" class="text-xs text-muted-foreground">
        {{ progress }}%
      </p>
    </div>
  </Dialog>
</template>
