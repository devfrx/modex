<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";

defineProps<{
    currentVersion: string;
    newVersion: string;
    isChecking?: boolean;
}>();

defineEmits<{
    (e: "update"): void;
}>();
</script>

<template>
    <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Icon name="RefreshCw" class="w-5 h-5" />
            </div>
            <div>
                <h3 class="font-medium text-primary">Update Available</h3>
                <p class="text-sm text-muted-foreground">
                    Version {{ newVersion }} is available (Current: {{ currentVersion }})
                </p>
            </div>
        </div>
        <Button @click="$emit('update')" :disabled="isChecking">
            Review & Update
        </Button>
    </div>
</template>
