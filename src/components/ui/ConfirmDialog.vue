<script setup lang="ts">
import { computed } from "vue";
import Dialog from "./Dialog.vue";
import Button from "./Button.vue";
import Icon from "@/components/ui/Icon.vue";

const props = withDefaults(
    defineProps<{
        open: boolean;
        title?: string;
        message?: string;
        confirmText?: string;
        cancelText?: string;
        variant?: "danger" | "warning" | "info";
        icon?: "trash" | "warning" | "info" | "alert";
    }>(),
    {
        title: "Confirm Action",
        message: "Are you sure you want to proceed?",
        confirmText: "Confirm",
        cancelText: "Cancel",
        variant: "danger",
        icon: "warning",
    }
);

const emit = defineEmits<{
    (e: "close"): void;
    (e: "confirm"): void;
    (e: "cancel"): void;
}>();

const variantClasses = computed(() => {
    switch (props.variant) {
        case "danger":
            return {
                bg: "bg-destructive/10",
                border: "border-destructive/30",
                text: "text-destructive",
                button: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            };
        case "warning":
            return {
                bg: "bg-warning/10",
                border: "border-warning/30",
                text: "text-warning",
                button: "bg-warning text-warning-foreground hover:bg-warning/90",
            };
        case "info":
            return {
                bg: "bg-info/10",
                border: "border-info/30",
                text: "text-info",
                button: "bg-info text-white hover:bg-info/90",
            };
        default:
            return {
                bg: "bg-destructive/10",
                border: "border-destructive/30",
                text: "text-destructive",
                button: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            };
    }
});

const iconName = computed(() => {
    switch (props.icon) {
        case "trash":
            return "Trash2";
        case "warning":
            return "AlertTriangle";
        case "info":
            return "Info";
        case "alert":
            return "AlertCircle";
        default:
            return "AlertTriangle";
    }
});

function handleCancel() {
    emit("cancel");
    emit("close");
}

function handleConfirm() {
    emit("confirm");
    emit("close");
}
</script>

<template>
    <Dialog :open="open" @close="handleCancel" maxWidth="md">
        <div class="space-y-4">
            <!-- Icon & Title -->
            <div class="flex items-start gap-4">
                <div :class="[variantClasses.bg, variantClasses.border]"
                    class="flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center">
                    <Icon :name="iconName" :class="variantClasses.text" class="w-6 h-6" />
                </div>
                <div class="flex-1 min-w-0 pt-1">
                    <h2 class="text-xl font-bold mb-2">{{ title }}</h2>
                    <p class="text-sm text-muted-foreground leading-relaxed">
                        {{ message }}
                    </p>
                    <slot />
                </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-2">
                <Button variant="outline" @click="handleCancel">
                    {{ cancelText }}
                </Button>
                <Button :class="variantClasses.button" @click="handleConfirm">
                    {{ confirmText }}
                </Button>
            </div>
        </div>
    </Dialog>
</template>
