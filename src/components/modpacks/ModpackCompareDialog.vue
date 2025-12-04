<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { X, ArrowLeftRight, Plus, ArrowRight } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import type { Mod, Modpack } from "@/types/electron";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const modpacks = ref<Modpack[]>([]);
const packAId = ref<string | null>(null);
const packBId = ref<string | null>(null);
const packAMods = ref<Mod[]>([]);
const packBMods = ref<Mod[]>([]);
const isLoading = ref(false);

// Computed comparisons
const onlyInA = computed(() => {
  const bIds = new Set(packBMods.value.map((m) => m.id));
  return packAMods.value.filter((m) => !bIds.has(m.id));
});

const onlyInB = computed(() => {
  const aIds = new Set(packAMods.value.map((m) => m.id));
  return packBMods.value.filter((m) => !aIds.has(m.id));
});

const common = computed(() => {
  const bIds = new Set(packBMods.value.map((m) => m.id));
  return packAMods.value.filter((m) => bIds.has(m.id));
});

async function loadModpacks() {
  if (!window.api) return;
  modpacks.value = await window.api.modpacks.getAll();
}

async function loadComparison() {
  if (!packAId.value || !packBId.value) return;
  isLoading.value = true;
  try {
    const [modsA, modsB] = await Promise.all([
      window.api.modpacks.getMods(packAId.value),
      window.api.modpacks.getMods(packBId.value),
    ]);
    packAMods.value = modsA;
    packBMods.value = modsB;
  } catch (err) {
    console.error("Failed to load mods:", err);
  } finally {
    isLoading.value = false;
  }
}

async function copyToB(modId: string) {
  if (!packBId.value) return;
  await window.api.modpacks.addMod(packBId.value, modId);
  await loadComparison();
}

async function copyToA(modId: string) {
  if (!packAId.value) return;
  await window.api.modpacks.addMod(packAId.value, modId);
  await loadComparison();
}

async function copyAllToB() {
  if (!packBId.value) return;
  for (const mod of onlyInA.value) {
    await window.api.modpacks.addMod(packBId.value, mod.id!);
  }
  await loadComparison();
}

async function copyAllToA() {
  if (!packAId.value) return;
  for (const mod of onlyInB.value) {
    await window.api.modpacks.addMod(packAId.value, mod.id!);
  }
  await loadComparison();
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadModpacks();
      packAId.value = null;
      packBId.value = null;
      packAMods.value = [];
      packBMods.value = [];
    }
  }
);

watch([packAId, packBId], () => {
  if (packAId.value && packBId.value) {
    loadComparison();
  }
});

const packAName = computed(
  () => modpacks.value.find((p) => p.id === packAId.value)?.name || "Pack A"
);
const packBName = computed(
  () => modpacks.value.find((p) => p.id === packBId.value)?.name || "Pack B"
);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
  >
    <div
      class="bg-background border rounded-lg shadow-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <div class="p-4 border-b flex items-center justify-between bg-card/50">
        <div class="flex items-center gap-3">
          <ArrowLeftRight class="w-5 h-5 text-primary" />
          <h2 class="text-xl font-bold">Compare Modpacks</h2>
        </div>
        <Button variant="ghost" size="icon" @click="$emit('close')">
          <X class="w-5 h-5" />
        </Button>
      </div>

      <!-- Pack Selectors -->
      <div class="p-4 border-b flex items-center gap-4">
        <div class="flex-1">
          <label class="text-sm font-medium mb-1 block">Pack A</label>
          <select
            v-model="packAId"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option :value="null" disabled>Select modpack...</option>
            <option
              v-for="pack in modpacks"
              :key="pack.id"
              :value="pack.id"
              :disabled="pack.id === packBId"
            >
              {{ pack.name }}
            </option>
          </select>
        </div>
        <ArrowLeftRight class="w-5 h-5 text-muted-foreground mt-6" />
        <div class="flex-1">
          <label class="text-sm font-medium mb-1 block">Pack B</label>
          <select
            v-model="packBId"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option :value="null" disabled>Select modpack...</option>
            <option
              v-for="pack in modpacks"
              :key="pack.id"
              :value="pack.id"
              :disabled="pack.id === packAId"
            >
              {{ pack.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Comparison Results -->
      <div v-if="packAId && packBId" class="flex-1 flex overflow-hidden">
        <!-- Only in A -->
        <div class="flex-1 border-r flex flex-col">
          <div
            class="p-2 border-b bg-red-500/10 flex items-center justify-between"
          >
            <span class="text-sm font-medium"
              >Only in {{ packAName }} ({{ onlyInA.length }})</span
            >
            <Button
              v-if="onlyInA.length > 0"
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1"
              @click="copyAllToB"
            >
              Copy all to B
              <ArrowRight class="w-3 h-3" />
            </Button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-for="mod in onlyInA"
              :key="mod.id"
              class="flex items-center justify-between p-2 rounded-md border bg-background hover:bg-accent/50 group"
            >
              <div class="min-w-0">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ mod.loader }}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 opacity-0 group-hover:opacity-100"
                @click="copyToB(mod.id)"
              >
                <ArrowRight class="w-4 h-4" />
              </Button>
            </div>
            <div
              v-if="onlyInA.length === 0"
              class="p-4 text-center text-muted-foreground text-sm"
            >
              No unique mods
            </div>
          </div>
        </div>

        <!-- Common -->
        <div class="flex-1 border-r flex flex-col">
          <div class="p-2 border-b bg-green-500/10">
            <span class="text-sm font-medium"
              >Common ({{ common.length }})</span
            >
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-for="mod in common"
              :key="mod.id"
              class="p-2 rounded-md border bg-background"
            >
              <div class="font-medium text-sm truncate">{{ mod.name }}</div>
              <div class="text-xs text-muted-foreground">{{ mod.loader }}</div>
            </div>
            <div
              v-if="common.length === 0"
              class="p-4 text-center text-muted-foreground text-sm"
            >
              No common mods
            </div>
          </div>
        </div>

        <!-- Only in B -->
        <div class="flex-1 flex flex-col">
          <div
            class="p-2 border-b bg-blue-500/10 flex items-center justify-between"
          >
            <span class="text-sm font-medium"
              >Only in {{ packBName }} ({{ onlyInB.length }})</span
            >
            <Button
              v-if="onlyInB.length > 0"
              variant="ghost"
              size="sm"
              class="h-7 text-xs gap-1"
              @click="copyAllToA"
            >
              <ArrowRight class="w-3 h-3 rotate-180" />
              Copy all to A
            </Button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-for="mod in onlyInB"
              :key="mod.id"
              class="flex items-center justify-between p-2 rounded-md border bg-background hover:bg-accent/50 group"
            >
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 opacity-0 group-hover:opacity-100"
                @click="copyToA(mod.id)"
              >
                <ArrowRight class="w-4 h-4 rotate-180" />
              </Button>
              <div class="min-w-0 flex-1 text-right">
                <div class="font-medium text-sm truncate">{{ mod.name }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ mod.loader }}
                </div>
              </div>
            </div>
            <div
              v-if="onlyInB.length === 0"
              class="p-4 text-center text-muted-foreground text-sm"
            >
              No unique mods
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex-1 flex items-center justify-center text-muted-foreground"
      >
        Select two modpacks to compare
      </div>
    </div>
  </div>
</template>
