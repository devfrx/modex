<script setup lang="ts">
import { Package } from "lucide-vue-next";

withDefaults(
    defineProps<{
        title?: string;
        description?: string;
        icon?: any;
    }>(),
    {
        title: "Nothing here yet",
        description: "Get started by adding your first item.",
        icon: Package,
    }
);
</script>

<template>
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div class="p-3 rounded-full bg-muted/50 mb-4">
            <component :is="icon" class="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 class="text-h3 text-foreground mb-2">{{ title }}</h3>
        <p class="text-body text-muted-foreground max-w-sm">{{ description }}</p>
        <div class="mt-6">
            <slot name="action" />
        </div>
    </div>
</template>
