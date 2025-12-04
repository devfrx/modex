<script setup lang="ts">
import { ref, watch } from 'vue';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-vue-next';

export interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
}

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
    success: 'bg-green-500/10 border-green-500/20 text-green-500',
    error: 'bg-red-500/10 border-red-500/20 text-red-500',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
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
    <div class="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-md">
        <TransitionGroup enter-active-class="transition-all duration-300" enter-from-class="opacity-0 translate-x-full"
            enter-to-class="opacity-100 translate-x-0" leave-active-class="transition-all duration-200"
            leave-from-class="opacity-100 translate-x-0" leave-to-class="opacity-0 translate-x-full">
            <div v-for="msg in messages" :key="msg.id" :class="[
                'flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm shadow-lg',
                colors[msg.type]
            ]">
                <component :is="icons[msg.type]" class="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm">{{ msg.title }}</p>
                    <p v-if="msg.message" class="text-sm opacity-90 mt-1 whitespace-pre-wrap">
                        {{ msg.message }}
                    </p>
                </div>
                <button @click="emit('remove', msg.id)"
                    class="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0">
                    <X class="w-4 h-4" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>
