<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Palette, RotateCcw, Plus, Trash2, Check } from "lucide-vue-next";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
    modelValue: string[];
    presets?: Record<string, { name: string; colors: string[] }>;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string[]): void;
}>();

const showDialog = ref(false);
const localColors = ref<string[]>([...props.modelValue]);
const selectedPreset = ref<string | null>(null);

const defaultPresets: Record<string, { name: string; colors: string[] }> = {
    vibrant: {
        name: "Vibrant",
        colors: ["#f97316", "#3b82f6", "#a855f7", "#ef4444", "#22c55e", "#eab308", "#06b6d4", "#ec4899"],
    },
    ocean: {
        name: "Ocean",
        colors: ["#0891b2", "#0284c7", "#0369a1", "#1e40af", "#3730a3", "#4f46e5", "#6366f1", "#818cf8"],
    },
    forest: {
        name: "Forest",
        colors: ["#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac", "#84cc16", "#a3e635", "#65a30d"],
    },
    sunset: {
        name: "Sunset",
        colors: ["#dc2626", "#ea580c", "#f97316", "#fb923c", "#fbbf24", "#facc15", "#fde047", "#fef08a"],
    },
    neon: {
        name: "Neon",
        colors: ["#00ff87", "#ff00ff", "#00ffff", "#ffff00", "#ff6600", "#ff0066", "#00ff00", "#9900ff"],
    },
    pastel: {
        name: "Pastel",
        colors: ["#fca5a5", "#fdba74", "#fcd34d", "#86efac", "#67e8f9", "#a5b4fc", "#d8b4fe", "#f9a8d4"],
    },
    monochrome: {
        name: "Monochrome",
        colors: ["#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6"],
    },
    earth: {
        name: "Earth",
        colors: ["#78350f", "#92400e", "#b45309", "#d97706", "#ca8a04", "#65a30d", "#16a34a", "#0d9488"],
    },
};

const presets = computed(() => props.presets || defaultPresets);

watch(() => props.modelValue, (newVal) => {
    localColors.value = [...newVal];
}, { deep: true });

function applyPreset(presetId: string) {
    const preset = presets.value[presetId];
    if (preset) {
        localColors.value = [...preset.colors];
        selectedPreset.value = presetId;
    }
}

function updateColor(index: number, color: string) {
    localColors.value[index] = color;
    selectedPreset.value = null;
}

function addColor() {
    const randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    localColors.value.push(randomColor);
    selectedPreset.value = null;
}

function removeColor(index: number) {
    if (localColors.value.length > 1) {
        localColors.value.splice(index, 1);
        selectedPreset.value = null;
    }
}

function applyColors() {
    emit("update:modelValue", [...localColors.value]);
    showDialog.value = false;
}

function resetToDefault() {
    localColors.value = [...props.modelValue];
    selectedPreset.value = null;
}
</script>

<template>
    <div>
        <button @click="showDialog = true"
            class="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-muted/50 border border-border hover:bg-muted transition-all">
            <Palette class="w-4 h-4" />
            <span>Customize Colors</span>
            <div class="flex -space-x-1">
                <span v-for="(color, idx) in modelValue.slice(0, 5)" :key="idx"
                    class="w-3 h-3 rounded-full border border-background" :style="{ backgroundColor: color }"></span>
                <span v-if="modelValue.length > 5"
                    class="w-3 h-3 rounded-full bg-muted text-[8px] flex items-center justify-center border border-background">
                    +{{ modelValue.length - 5 }}
                </span>
            </div>
        </button>

        <Dialog :open="showDialog" @close="showDialog = false" maxWidth="2xl">
            <template #header>
                <div class="flex items-center gap-2">
                    <Palette class="w-5 h-5 text-primary" />
                    <span>Chart Color Customization</span>
                </div>
            </template>

            <div class="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                <!-- Preset Palettes -->
                <div>
                    <h4 class="text-sm font-medium mb-3">Preset Palettes</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button v-for="(preset, id) in presets" :key="id" @click="applyPreset(id)"
                            class="p-3 rounded-lg border transition-all text-left" :class="selectedPreset === id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'">
                            <div class="text-xs font-medium mb-2 flex items-center justify-between">
                                {{ preset.name }}
                                <Check v-if="selectedPreset === id" class="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div class="flex gap-1">
                                <span v-for="(color, idx) in preset.colors.slice(0, 6)" :key="idx"
                                    class="w-4 h-4 rounded-full border border-white/10"
                                    :style="{ backgroundColor: color }"></span>
                            </div>
                        </button>
                    </div>
                </div>

                <!-- Custom Colors -->
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-medium">Custom Colors</h4>
                        <button @click="addColor" class="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Plus class="w-3.5 h-3.5" />
                            Add Color
                        </button>
                    </div>

                    <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        <div v-for="(color, idx) in localColors" :key="idx" class="relative group">
                            <label class="block">
                                <input type="color" :value="color"
                                    @input="(e) => updateColor(idx, (e.target as HTMLInputElement).value)"
                                    class="sr-only" />
                                <div class="w-full aspect-square rounded-lg border-2 border-transparent cursor-pointer transition-all hover:border-primary hover:scale-105"
                                    :style="{ backgroundColor: color }"></div>
                            </label>
                            <button v-if="localColors.length > 1" @click="removeColor(idx)"
                                class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 class="w-2.5 h-2.5" />
                            </button>
                            <span class="block text-[9px] text-muted-foreground text-center mt-1 uppercase">
                                {{ color }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Preview -->
                <div>
                    <h4 class="text-sm font-medium mb-3">Preview</h4>
                    <div class="p-4 rounded-lg bg-muted/30 border border-border">
                        <div class="flex items-center gap-3 flex-wrap">
                            <div v-for="(color, idx) in localColors" :key="idx" class="flex items-center gap-2">
                                <span class="w-4 h-4 rounded-full" :style="{ backgroundColor: color }"></span>
                                <span class="text-xs text-muted-foreground">Item {{ idx + 1 }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <template #footer>
                <div class="flex justify-between w-full">
                    <Button variant="ghost" size="sm" @click="resetToDefault">
                        <RotateCcw class="w-4 h-4 mr-2" />
                        Reset
                    </Button>
                    <div class="flex gap-2">
                        <Button variant="outline" @click="showDialog = false">Cancel</Button>
                        <Button @click="applyColors">Apply Colors</Button>
                    </div>
                </div>
            </template>
        </Dialog>
    </div>
</template>
