<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from "vue";

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
const wrapperRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
let timeout: ReturnType<typeof setTimeout> | null = null;

// Position calculated dynamically based on trigger element
const tooltipStyle = ref<{ top: string; left: string }>({ top: "0px", left: "0px" });

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

function getTriggerElement(): HTMLElement | null {
    // With display:contents, we need to get the first actual child element
    if (!wrapperRef.value) return null;
    const firstChild = wrapperRef.value.firstElementChild as HTMLElement | null;
    return firstChild;
}

function updatePosition() {
    const trigger = getTriggerElement();
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 8; // spacing between trigger and tooltip

    let top = 0;
    let left = 0;

    switch (props.position) {
        case "top":
            top = rect.top - gap;
            left = rect.left + rect.width / 2;
            break;
        case "bottom":
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2;
            break;
        case "left":
            top = rect.top + rect.height / 2;
            left = rect.left - gap;
            break;
        case "right":
            top = rect.top + rect.height / 2;
            left = rect.right + gap;
            break;
    }

    tooltipStyle.value = {
        top: `${top}px`,
        left: `${left}px`,
    };
}

function showTooltip() {
    if (props.disabled) return;
    timeout = setTimeout(() => {
        updatePosition();
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
    <div ref="wrapperRef" class="contents" @mouseenter="showTooltip" @mouseleave="hideTooltip" @focus="showTooltip"
        @blur="hideTooltip">
        <slot />
        <Teleport to="body">
            <Transition name="tooltip-fade">
                <div v-if="isVisible && content" ref="tooltipRef" class="fixed z-[9999] pointer-events-none" :class="{
                    '-translate-x-1/2 -translate-y-full': position === 'top',
                    '-translate-x-1/2': position === 'bottom',
                    '-translate-x-full -translate-y-1/2': position === 'left',
                    '-translate-y-1/2': position === 'right',
                }" :style="tooltipStyle">
                    <div
                        class="px-2.5 py-1.5 text-xs font-medium rounded-lg shadow-lg bg-popover text-popover-foreground border border-border whitespace-nowrap">
                        {{ content }}
                    </div>
                    <div class="absolute border-4" :class="arrowClasses" />
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
    opacity: 0;
}
</style>
