<script setup lang="ts">
import { ref, watch } from 'vue';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-vue-next';
import type { ToastMessage } from '@/composables/useToast';

const props = defineProps<{
    messages: ToastMessage[];
}>();

const emit = defineEmits<{
    (e: 'remove', id: number): void;
}>();

const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
};

const colors = {
    success: 'bg-card border-primary/30 text-primary',
    error: 'bg-card border-destructive/30 text-destructive',
    warning: 'bg-card border-yellow-500/30 text-yellow-500',
    info: 'bg-card border-blue-500/30 text-blue-500',
};

watch(() => props.messages, (newMessages) => {
    newMessages.forEach(msg => {
        if (msg.duration !== 0) {
            setTimeout(() => emit('remove', msg.id), msg.duration || 5000);
        }
    });
}, { deep: true });
</script>

<template>
    <div class="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
        <TransitionGroup enter-active-class="transition-all duration-200"
            enter-from-class="opacity-0 translate-x-full scale-95" enter-to-class="opacity-100 translate-x-0 scale-100"
            leave-active-class="transition-all duration-150" leave-from-class="opacity-100 translate-x-0 scale-100"
            leave-to-class="opacity-0 translate-x-full scale-95">
            <div v-for="msg in messages" :key="msg.id" :class="[
                'flex items-start gap-3 p-3 rounded-lg border backdrop-blur-xl shadow-xl shadow-black/20',
                colors[msg.type]
            ]">
                <component :is="icons[msg.type]" class="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm text-foreground">{{ msg.title }}</p>
                    <p v-if="msg.message" class="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                        {{ msg.message }}
                    </p>
                </div>
                <button @click="emit('remove', msg.id)"
                    class="p-1 hover:bg-muted rounded transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                    <X class="w-3.5 h-3.5" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>
