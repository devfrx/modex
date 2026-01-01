<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';
import { useDialog, type DialogVariant, type DialogIcon, type ConfirmOptions, type AlertOptions, type InputOptions, type SelectOptions } from '@/composables/useDialog';
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

// Type-safe computed properties for dialog options
const dialogIcon = computed(() => (dialogOptions.value as ConfirmOptions | AlertOptions).icon);
const inputType = computed(() => (dialogOptions.value as InputOptions).inputType || 'text');
const placeholder = computed(() => (dialogOptions.value as InputOptions).placeholder);
const selectOptions = computed(() => (dialogOptions.value as SelectOptions).options || []);
const buttonText = computed(() => (dialogOptions.value as AlertOptions).buttonText || 'OK');
const cancelText = computed(() => (dialogOptions.value as ConfirmOptions | InputOptions).cancelText || 'Cancel');
const confirmText = computed(() => (dialogOptions.value as ConfirmOptions | InputOptions).confirmText || 'Confirm');

const iconComponent = computed(() => {
    switch (dialogIcon.value) {
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
    const opts = dialogOptions.value as ConfirmOptions | AlertOptions;
    const variant = opts.variant;
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
                <div v-if="iconComponent && dialogIcon !== 'none'"
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
                <input ref="inputRef" v-model="inputValue" :type="inputType" :placeholder="placeholder"
                    class="w-full h-10 px-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    :class="{ 'border-red-500': inputError }" @keydown="handleInputKeydown" />
                <p v-if="inputError" class="text-xs text-red-500">{{ inputError }}</p>
            </div>

            <!-- Select field for select dialog -->
            <div v-if="dialogType === 'select'" class="space-y-2">
                <select v-model="selectedValue"
                    class="w-full h-10 px-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                    <option v-for="opt in selectOptions" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
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
                        {{ buttonText }}
                    </Button>
                </template>

                <!-- Confirm, Input, Select have two buttons -->
                <template v-else>
                    <Button variant="outline" @click="handleCancel">
                        {{ cancelText }}
                    </Button>
                    <Button :variant="variantClasses.confirmBtn" @click="handleConfirm">
                        {{ confirmText }}
                    </Button>
                </template>
            </div>
        </template>
    </Dialog>
</template>
