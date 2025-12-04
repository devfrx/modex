<script setup lang="ts">
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "vue";
import { Loader2 } from "lucide-vue-next";

interface Props extends /* @vue-ignore */ ButtonHTMLAttributes {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  class?: string;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
  size: "default",
  class: "",
  loading: false,
});
</script>

<template>
  <button
    :class="
      cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90':
            variant === 'default',
          'bg-secondary text-secondary-foreground hover:bg-secondary/80':
            variant === 'secondary',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90':
            variant === 'destructive',
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground':
            variant === 'outline',
          'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
          'text-primary underline-offset-4 hover:underline': variant === 'link',
          'h-10 px-4 py-2': size === 'default',
          'h-9 rounded-md px-3': size === 'sm',
          'h-11 rounded-md px-8': size === 'lg',
          'h-10 w-10': size === 'icon',
        },
        props.class
      )
    "
    :disabled="loading || !!$attrs.disabled"
    v-bind="$attrs"
  >
    <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
    <slot />
  </button>
</template>
