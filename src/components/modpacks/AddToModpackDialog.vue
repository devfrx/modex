<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import type { Modpack } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  modsCount: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", modpackId: string): void;
}>();

const modpacks = ref<Modpack[]>([]);
const selectedModpackId = ref<string | null>(null);
const isLoading = ref(false);

async function loadModpacks() {
  if (!window.api) return;
  isLoading.value = true;
  try {
    modpacks.value = await window.api.modpacks.getAll();
  } catch (err) {
    console.error("Failed to load modpacks", err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadModpacks();
      selectedModpackId.value = null;
    }
  }
);

function add() {
  if (!selectedModpackId.value) return;
  emit("select", selectedModpackId.value);
}
</script>

<template>
  <Dialog :open="open" title="Add to Modpack">
    <div class="space-y-4 py-4">
      <p class="text-sm text-muted-foreground">
        Select a modpack to add {{ modsCount }} mods to:
      </p>

      <div v-if="isLoading" class="text-center py-4">
        <div
          class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"
        ></div>
      </div>

      <div
        v-else-if="modpacks.length === 0"
        class="text-center py-4 text-muted-foreground"
      >
        No modpacks found. Create one first!
      </div>

      <div
        v-else
        class="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-2"
      >
        <div
          v-for="pack in modpacks"
          :key="pack.id"
          class="flex items-center p-2 rounded-md cursor-pointer transition-colors"
          :class="
            selectedModpackId === pack.id
              ? 'bg-primary/20 border-primary'
              : 'hover:bg-accent'
          "
          @click="selectedModpackId = pack.id"
        >
          <div class="flex-1">
            <div class="font-medium">{{ pack.name }}</div>
            <div class="text-xs text-muted-foreground">{{ pack.version }}</div>
          </div>
          <div v-if="selectedModpackId === pack.id" class="text-primary">✓</div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Cancel</Button>
      <Button @click="add" :disabled="!selectedModpackId">Add Mods</Button>
    </template>
  </Dialog>
</template>
