<script setup lang="ts">
defineProps<{
    keys: string | string[];
    size?: "sm" | "md";
}>();
</script>

<template>
    <span class="inline-flex items-center gap-0.5">
        <template v-if="Array.isArray(keys)">
            <template v-for="(key, index) in keys" :key="index">
                <kbd class="inline-flex items-center justify-center font-mono font-medium rounded border bg-muted border-border text-muted-foreground"
                    :class="size === 'sm' ? 'min-w-[1.25rem] h-5 px-1 text-[10px]' : 'min-w-[1.5rem] h-6 px-1.5 text-xs'">
                    {{ key }}
                </kbd>
                <span v-if="index < keys.length - 1" class="text-muted-foreground text-[10px]">+</span>
            </template>
        </template>
        <kbd v-else
            class="inline-flex items-center justify-center font-mono font-medium rounded border bg-muted border-border text-muted-foreground"
            :class="size === 'sm' ? 'min-w-[1.25rem] h-5 px-1 text-[10px]' : 'min-w-[1.5rem] h-6 px-1.5 text-xs'">
            {{ keys }}
        </kbd>
    </span>
</template>
