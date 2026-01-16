<script setup lang="ts">
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "vue";
import Icon from "@/components/ui/Icon.vue";

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
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed',
    {
      'bg-primary text-primary-foreground hover:bg-primary/90':
        variant === 'default',
      'bg-muted text-secondary-foreground hover:bg-muted/80':
        variant === 'secondary',
      'bg-destructive text-destructive-foreground hover:bg-destructive/90':
        variant === 'destructive',
      'border-2 border-border bg-transparent hover:border-muted-foreground/50 hover:bg-muted/20':
        variant === 'outline',
      'hover:bg-muted/50 hover:text-foreground': variant === 'ghost',
      'text-primary underline-offset-4 hover:underline': variant === 'link',
      'h-9 px-4 py-2': size === 'default',
      'h-8 rounded-md px-3 text-caption': size === 'sm',
      'h-11 rounded-md px-6': size === 'lg',
      'h-9 w-9': size === 'icon',
    },
    props.class
  )
    " :disabled="loading || !!$attrs.disabled" v-bind="$attrs">
    <Icon v-if="loading" name="Loader2" class="w-4 h-4 mr-2 animate-spin" />
    <slot />
  </button>
</template>
