<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
  open: boolean;
  title?: string;
  description?: string;
  maxWidth?:
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "full";
  contentClass?: string;
}>();

defineEmits<{
  (e: "close"): void;
}>();

const maxWidthClass = computed(() => {
  const widths = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  };
  return widths[props.maxWidth || "lg"];
});
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    @click.self="$emit('close')"
  >
    <div
      :class="
        cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          maxWidthClass,
          props.contentClass
        )
      "
    >
      <div class="flex flex-col space-y-1.5 text-center sm:text-left">
        <h2
          v-if="title || $slots.title"
          class="text-lg font-semibold leading-none tracking-tight"
        >
          <slot name="title">{{ title }}</slot>
        </h2>
        <p v-if="description" class="text-sm text-muted-foreground">
          {{ description }}
        </p>
      </div>
      <slot />
      <div
        v-if="$slots.footer"
        class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
      >
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
