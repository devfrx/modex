<script setup lang="ts">
import { Package } from "lucide-vue-next";

withDefaults(
    defineProps<{
        title?: string;
        description?: string;
        icon?: any;
    }>(),
    {
        title: "No items found",
        description: "There's nothing here yet.",
        icon: Package,
    }
);
</script>

<template>
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div class="p-4 rounded-full bg-muted/50 mb-4">
            <component :is="icon" class="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-medium text-foreground mb-1">{{ title }}</h3>
        <p class="text-sm text-muted-foreground max-w-sm">{{ description }}</p>
        <div class="mt-6">
            <slot name="action" />
        </div>
    </div>
</template>
