<script setup lang="ts">
import { cn } from "@/lib/utils";
import { useVModel } from "@vueuse/core";

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: string;
}>();

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});
</script>

<template>
  <input v-model="modelValue" :class="cn(
    'flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm transition-colors duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground hover:border-muted-foreground/30',
    props.class
  )
    " />
</template>
