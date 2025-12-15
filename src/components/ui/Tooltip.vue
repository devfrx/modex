<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";

const props = withDefaults(
    defineProps<{
        content: string;
        position?: "top" | "bottom" | "left" | "right";
        delay?: number;
        disabled?: boolean;
    }>(),
    {
        position: "top",
        delay: 300,
        disabled: false,
    }
);

const isVisible = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
let timeout: ReturnType<typeof setTimeout> | null = null;

const positionClasses = computed(() => {
    switch (props.position) {
        case "top":
            return "bottom-full left-1/2 -translate-x-1/2 mb-2";
        case "bottom":
            return "top-full left-1/2 -translate-x-1/2 mt-2";
        case "left":
            return "right-full top-1/2 -translate-y-1/2 mr-2";
        case "right":
            return "left-full top-1/2 -translate-y-1/2 ml-2";
        default:
            return "bottom-full left-1/2 -translate-x-1/2 mb-2";
    }
});

const arrowClasses = computed(() => {
    switch (props.position) {
        case "top":
            return "top-full left-1/2 -translate-x-1/2 border-t-popover border-x-transparent border-b-transparent";
        case "bottom":
            return "bottom-full left-1/2 -translate-x-1/2 border-b-popover border-x-transparent border-t-transparent";
        case "left":
            return "left-full top-1/2 -translate-y-1/2 border-l-popover border-y-transparent border-r-transparent";
        case "right":
            return "right-full top-1/2 -translate-y-1/2 border-r-popover border-y-transparent border-l-transparent";
        default:
            return "top-full left-1/2 -translate-x-1/2 border-t-popover border-x-transparent border-b-transparent";
    }
});

function showTooltip() {
    if (props.disabled) return;
    timeout = setTimeout(() => {
        isVisible.value = true;
    }, props.delay);
}

function hideTooltip() {
    if (timeout) {
        clearTimeout(timeout);
        timeout = null;
    }
    isVisible.value = false;
}

onUnmounted(() => {
    if (timeout) clearTimeout(timeout);
});
</script>

<template>
    <div ref="triggerRef" class="relative inline-flex" @mouseenter="showTooltip" @mouseleave="hideTooltip"
        @focus="showTooltip" @blur="hideTooltip">
        <slot />
        <Transition name="fade">
            <div v-if="isVisible && content" class="absolute z-50 pointer-events-none" :class="positionClasses">
                <div
                    class="px-2.5 py-1.5 text-xs font-medium rounded-lg shadow-lg bg-popover text-popover-foreground border border-border whitespace-nowrap">
                    {{ content }}
                </div>
                <div class="absolute border-4" :class="arrowClasses" />
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}
</style>
