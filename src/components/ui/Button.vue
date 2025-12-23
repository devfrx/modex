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
  <button :class="cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
    {
      'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20':
        variant === 'default',
      'bg-secondary text-secondary-foreground hover:bg-secondary/80':
        variant === 'secondary',
      'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20':
        variant === 'destructive',
      'border border-border bg-transparent hover:bg-muted hover:text-foreground':
        variant === 'outline',
      'hover:bg-muted hover:text-foreground': variant === 'ghost',
      'text-primary underline-offset-4 hover:underline': variant === 'link',
      'h-9 px-4 py-2': size === 'default',
      'h-8 rounded-md px-3 text-xs': size === 'sm',
      'h-10 rounded-md px-6': size === 'lg',
      'h-9 w-9': size === 'icon',
    },
    props.class
  )
    " :disabled="loading || !!$attrs.disabled" v-bind="$attrs">
    <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
    <slot />
  </button>
</template>
