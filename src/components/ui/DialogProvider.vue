<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';
import { useDialog, type DialogVariant, type DialogIcon } from '@/composables/useDialog';
import Dialog from './Dialog.vue';
import Button from './Button.vue';
import {
    Trash2,
    AlertTriangle,
    Info,
    AlertCircle,
    HelpCircle,
    CheckCircle2,
    Edit3,
} from 'lucide-vue-next';

const {
    isOpen,
    dialogType,
    dialogOptions,
    inputValue,
    inputError,
    selectedValue,
    handleConfirm,
    handleCancel,
} = useDialog();

const inputRef = ref<HTMLInputElement | null>(null);

// Focus input when dialog opens
watch(isOpen, async (open) => {
    if (open && dialogType.value === 'input') {
        await nextTick();
        inputRef.value?.focus();
        inputRef.value?.select();
    }
});

const iconComponent = computed(() => {
    const icon = (dialogOptions.value as any).icon as DialogIcon;
    switch (icon) {
        case 'trash': return Trash2;
        case 'warning': return AlertTriangle;
        case 'info': return Info;
        case 'alert': return AlertCircle;
        case 'question': return HelpCircle;
        case 'success': return CheckCircle2;
        case 'edit': return Edit3;
        default: return null;
    }
});

const variantClasses = computed(() => {
    const variant = (dialogOptions.value as any).variant as DialogVariant;
    switch (variant) {
        case 'danger':
            return {
                iconBg: 'bg-red-500/10',
                iconText: 'text-red-500',
                confirmBtn: 'destructive' as const,
            };
        case 'warning':
            return {
                iconBg: 'bg-yellow-500/10',
                iconText: 'text-yellow-500',
                confirmBtn: 'default' as const,
            };
        case 'success':
            return {
                iconBg: 'bg-green-500/10',
                iconText: 'text-green-500',
                confirmBtn: 'default' as const,
            };
        case 'info':
            return {
                iconBg: 'bg-blue-500/10',
                iconText: 'text-blue-500',
                confirmBtn: 'default' as const,
            };
        default:
            return {
                iconBg: 'bg-primary/10',
                iconText: 'text-primary',
                confirmBtn: 'default' as const,
            };
    }
});

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && dialogType.value !== 'input') {
        handleConfirm();
    }
}

function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        handleConfirm();
    }
}
</script>

<template>
    <Dialog :open="isOpen" @close="handleCancel" @keydown="handleKeydown">
        <template #header>
            <div class="flex items-center gap-3">
                <div v-if="iconComponent && (dialogOptions as any).icon !== 'none'"
                    class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    :class="variantClasses.iconBg">
                    <component :is="iconComponent" class="w-5 h-5" :class="variantClasses.iconText" />
                </div>
                <div>
                    <h3 class="text-lg font-semibold">{{ dialogOptions.title }}</h3>
                </div>
            </div>
        </template>

        <div class="space-y-4">
            <p v-if="dialogOptions.message" class="text-sm text-muted-foreground">
                {{ dialogOptions.message }}
            </p>

            <!-- Input field for input dialog -->
            <div v-if="dialogType === 'input'" class="space-y-2">
                <input ref="inputRef" v-model="inputValue" :type="(dialogOptions as any).inputType || 'text'"
                    :placeholder="(dialogOptions as any).placeholder"
                    class="w-full h-10 px-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    :class="{ 'border-red-500': inputError }" @keydown="handleInputKeydown" />
                <p v-if="inputError" class="text-xs text-red-500">{{ inputError }}</p>
            </div>

            <!-- Select field for select dialog -->
            <div v-if="dialogType === 'select'" class="space-y-2">
                <select v-model="selectedValue"
                    class="w-full h-10 px-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                    <option v-for="opt in (dialogOptions as any).options" :key="opt.value" :value="opt.value"
                        :disabled="opt.disabled">
                        {{ opt.label }}
                    </option>
                </select>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-3">
                <!-- Alert only has one button -->
                <template v-if="dialogType === 'alert'">
                    <Button @click="handleConfirm">
                        {{ (dialogOptions as any).buttonText || 'OK' }}
                    </Button>
                </template>

                <!-- Confirm, Input, Select have two buttons -->
                <template v-else>
                    <Button variant="outline" @click="handleCancel">
                        {{ (dialogOptions as any).cancelText || 'Cancel' }}
                    </Button>
                    <Button :variant="variantClasses.confirmBtn" @click="handleConfirm">
                        {{ (dialogOptions as any).confirmText || 'Confirm' }}
                    </Button>
                </template>
            </div>
        </template>
    </Dialog>
</template>
