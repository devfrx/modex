<script setup lang="ts">
import { computed } from "vue";

interface Props {
    title: string;
    subtitle?: string;
    icon?: object;
    iconClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
    iconClass: "text-primary",
});
</script>

<template>
    <header class="page-header">
        <div class="page-header-content">
            <!-- Left: Icon + Title -->
            <div class="page-header-title">
                <div v-if="icon" class="page-header-icon" :class="iconClass">
                    <component :is="icon" class="w-5 h-5" />
                </div>
                <div class="page-header-text">
                    <h1>{{ title }}</h1>
                    <p v-if="subtitle">{{ subtitle }}</p>
                </div>
            </div>

            <!-- Center: Slot for filters/tabs -->
            <div class="page-header-center">
                <slot name="center" />
            </div>

            <!-- Right: Slot for actions -->
            <div class="page-header-actions">
                <slot name="actions" />
            </div>
        </div>

        <!-- Optional second row for extended content -->
        <div v-if="$slots.extended" class="page-header-extended">
            <slot name="extended" />
        </div>
    </header>
</template>

<style scoped>
.page-header {
    @apply shrink-0 border-b border-border/50;
    background: linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 100%);
    backdrop-filter: blur(8px);
}

.page-header-content {
    @apply flex items-center gap-4 px-4 py-3;
    @apply sm:px-6;
}

.page-header-title {
    @apply flex items-center gap-3 shrink-0;
}

.page-header-icon {
    @apply w-9 h-9 rounded-xl flex items-center justify-center;
    @apply bg-current/10;
}

.page-header-text h1 {
    @apply text-base font-semibold tracking-tight;
    @apply sm:text-lg;
}

.page-header-text p {
    @apply text-xs text-muted-foreground mt-0.5;
}

.page-header-center {
    @apply flex-1 flex items-center justify-center gap-2;
    @apply max-w-2xl mx-auto;
}

.page-header-actions {
    @apply flex items-center gap-2 shrink-0;
}

.page-header-extended {
    @apply px-4 pb-3 border-t border-border/30 pt-3;
    @apply sm:px-6;
}

/* Responsive adjustments */
@media (max-width: 640px) {
    .page-header-content {
        @apply flex-wrap;
    }

    .page-header-center {
        @apply order-last w-full justify-start mt-2;
    }

    .page-header-actions {
        @apply ml-auto;
    }
}
</style>
