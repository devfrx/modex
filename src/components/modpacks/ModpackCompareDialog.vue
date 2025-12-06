<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  X,
  ArrowLeftRight,
  Plus,
  ArrowRight,
  ChevronDown,
  AlertTriangle,
  Check,
  Lock,
} from "lucide-vue-next";
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

// Get selected modpacks
const packA = computed(() =>
  modpacks.value.find((p) => p.id === packAId.value)
);
const packB = computed(() =>
  modpacks.value.find((p) => p.id === packBId.value)
);

// Check if versions/loaders are compatible
const areCompatible = computed(() => {
  if (!packA.value || !packB.value) return true;
  return (
    packA.value.minecraft_version === packB.value.minecraft_version &&
    packA.value.loader === packB.value.loader
  );
});

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
  if (!packBId.value || !areCompatible.value) return;
  if (packB.value?.remote_source?.url) return; // Block if linked
  await window.api.modpacks.addMod(packBId.value, modId);
  await loadComparison();
}

async function copyToA(modId: string) {
  if (!packAId.value || !areCompatible.value) return;
  if (packA.value?.remote_source?.url) return; // Block if linked
  await window.api.modpacks.addMod(packAId.value, modId);
  await loadComparison();
}

async function copyAllToB() {
  if (!packBId.value || !areCompatible.value) return;
  if (packB.value?.remote_source?.url) return; // Block if linked
  for (const mod of onlyInA.value) {
    await window.api.modpacks.addMod(packBId.value, mod.id!);
  }
  await loadComparison();
}

async function copyAllToA() {
  if (!packAId.value || !areCompatible.value) return;
  if (packA.value?.remote_source?.url) return; // Block if linked
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
  <Dialog :open="open" @close="emit('close')" maxWidth="6xl" contentClass="max-h-[85vh] flex flex-col p-0">
    <!-- Header -->
    <div class="px-6 py-4 border-b flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-primary/10 rounded-lg">
          <ArrowLeftRight class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 class="text-lg font-bold">Compare Modpacks</h2>
          <p class="text-xs text-muted-foreground">
            Analyze differences and transfer mods between packs
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon" @click="$emit('close')">
        <X class="w-5 h-5" />
      </Button>
    </div>

    <!-- Comparison Controls -->
    <div class="px-6 py-4 border-b bg-muted/5 grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
      <!-- Pack A Selector -->
      <div class="space-y-1.5">
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Pack (A)</label>
        <div class="relative">
          <select v-model="packAId"
            class="w-full h-10 pl-3 pr-8 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary appearance-none truncate">
            <option :value="null" disabled class="bg-popover text-popover-foreground">
              Select modpack...
            </option>
            <option v-for="pack in modpacks" :key="pack.id" :value="pack.id" :disabled="pack.id === packBId"
              class="bg-popover text-popover-foreground">
              {{ pack.name }}
            </option>
          </select>
          <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
        </div>
        <div v-if="packA" class="flex gap-2 text-xs text-muted-foreground">
          <span class="bg-secondary px-1.5 rounded">{{
            packA.minecraft_version
          }}</span>
          <span class="bg-secondary px-1.5 rounded capitalize">{{
            packA.loader
          }}</span>
        </div>
      </div>

      <!-- Arrow -->
      <div class="px-2 pt-6">
        <ArrowLeftRight class="w-5 h-5 text-muted-foreground" />
      </div>

      <!-- Pack B Selector -->
      <div class="space-y-1.5">
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Pack (B)</label>
        <div class="relative">
          <select v-model="packBId"
            class="w-full h-10 pl-3 pr-8 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary appearance-none truncate">
            <option :value="null" disabled class="bg-popover text-popover-foreground">
              Select modpack...
            </option>
            <option v-for="pack in modpacks" :key="pack.id" :value="pack.id" :disabled="pack.id === packAId"
              class="bg-popover text-popover-foreground">
              {{ pack.name }}
            </option>
          </select>
          <ChevronDown class="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" />
        </div>
        <div v-if="packB" class="flex gap-2 text-xs text-muted-foreground justify-end">
          <span class="bg-secondary px-1.5 rounded">{{
            packB.minecraft_version
          }}</span>
          <span class="bg-secondary px-1.5 rounded capitalize">{{
            packB.loader
          }}</span>
        </div>
      </div>
    </div>

    <!-- Incompatibility Warning -->
    <div v-if="packAId && packBId && !areCompatible" class="px-6 py-3 border-b bg-yellow-500/10 border-yellow-500/20">
      <div class="flex items-center gap-3 text-sm text-yellow-600 dark:text-yellow-400">
        <div class="p-1 rounded-full bg-yellow-500/20">
          <AlertTriangle class="w-4 h-4" />
        </div>
        <div class="flex-1 font-medium">
          Incompatible Game Versions or Loaders. Mod transfer is disabled.
        </div>
      </div>
    </div>

    <!-- Comparison Columns -->
    <div v-if="packAId && packBId" class="flex-1 flex overflow-hidden bg-background">
      <!-- Unique to A -->
      <div class="flex-1 flex flex-col border-r border-border/50 min-w-0">
        <div class="p-3 border-b border-border/50 bg-muted/20 flex items-center justify-between sticky top-0">
          <span class="text-sm font-semibold flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-orange-500"></span>
            Only in A ({{ onlyInA.length }})
          </span>
          <Button v-if="onlyInA.length > 0" variant="outline" size="sm"
            class="h-7 text-xs gap-1.5 hover:bg-orange-500/10 hover:text-orange-500 hover:border-orange-500/50"
            :disabled="!areCompatible || !!packB?.remote_source?.url" @click="copyAllToB">
            <Lock v-if="packB?.remote_source?.url" class="w-3 h-3" />
            <template v-else>
              Copy All
              <ArrowRight class="w-3 h-3" />
            </template>
          </Button>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="onlyInA.length === 0"
            class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm opacity-60">
            <Check class="w-8 h-8 mb-2 opacity-20" />
            <p>No unique mods in {{ packAName }}</p>
          </div>
          <div v-for="mod in onlyInA" :key="mod.id"
            class="group flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition-all text-sm">
            <div class="min-w-0 pr-3">
              <div class="font-medium truncate">{{ mod.name }}</div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span v-if="mod.version" class="truncate opacity-70" :title="mod.version">{{ mod.version }}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon"
              class="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0 hover:bg-background hover:text-primary shadow-sm border border-transparent hover:border-input"
              :class="(!areCompatible || !!packB?.remote_source?.url) ? 'cursor-not-allowed' : ''"
              :disabled="!areCompatible || !!packB?.remote_source?.url"
              :title="packB?.remote_source?.url ? 'Target pack is read-only' : (areCompatible ? 'Copy to Pack B' : 'Incompatible')"
              @click="copyToB(mod.id)">
              <Lock v-if="packB?.remote_source?.url" class="w-3.5 h-3.5 text-muted-foreground" />
              <ArrowRight v-else class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Common -->
      <div class="w-[28%] flex flex-col border-r border-border/50 min-w-0 bg-muted/5">
        <div class="p-3 border-b border-border/50 bg-muted/20 sticky top-0">
          <span class="text-sm font-semibold flex items-center gap-2 opacity-70">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            Common ({{ common.length }})
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="common.length === 0" class="p-8 text-center text-muted-foreground text-sm opacity-60">
            No common mods found.
          </div>
          <div v-for="mod in common" :key="mod.id"
            class="p-2.5 rounded-lg border border-border/40 bg-background/50 text-sm opacity-70 hover:opacity-100 transition-opacity">
            <div class="truncate">{{ mod.name }}</div>
          </div>
        </div>
      </div>

      <!-- Unique to B -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="p-3 border-b border-border/50 bg-muted/20 flex items-center justify-between sticky top-0">
          <Button v-if="onlyInB.length > 0" variant="outline" size="sm"
            class="h-7 text-xs gap-1.5 hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/50"
            :disabled="!areCompatible || !!packA?.remote_source?.url" @click="copyAllToA">
            <Lock v-if="packA?.remote_source?.url" class="w-3 h-3" />
            <template v-else>
              <ArrowLeftRight class="w-3 h-3" /> Copy All
            </template>
          </Button>
          <span class="text-sm font-semibold flex items-center gap-2">
            Only in B ({{ onlyInB.length }})
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          </span>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <div v-if="onlyInB.length === 0"
            class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm opacity-60">
            <Check class="w-8 h-8 mb-2 opacity-20" />
            <p>No unique mods in {{ packBName }}</p>
          </div>
          <div v-for="mod in onlyInB" :key="mod.id"
            class="group flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition-all text-sm">
            <Button variant="ghost" size="icon"
              class="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0 hover:bg-background hover:text-primary shadow-sm border border-transparent hover:border-input rotate-180"
              :class="(!areCompatible || !!packA?.remote_source?.url) ? 'cursor-not-allowed' : ''"
              :disabled="!areCompatible || !!packA?.remote_source?.url"
              :title="packA?.remote_source?.url ? 'Target pack is read-only' : (areCompatible ? 'Copy to Pack A' : 'Incompatible')"
              @click="copyToA(mod.id)">
              <Lock v-if="packA?.remote_source?.url" class="w-3.5 h-3.5 text-muted-foreground -rotate-180" />
              <ArrowRight v-else class="w-3.5 h-3.5" />
            </Button>
            <div class="min-w-0 pl-3 text-right">
              <div class="font-medium truncate">{{ mod.name }}</div>
              <div class="flex items-center justify-end gap-2 text-xs text-muted-foreground mt-0.5">
                <span v-if="mod.version" class="truncate opacity-70" :title="mod.version">{{ mod.version }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex-1 flex flex-col items-center justify-center text-muted-foreground pb-12">
      <div class="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <ArrowLeftRight class="w-8 h-8 opacity-40" />
      </div>
      <p class="font-medium">Select modpacks to begin comparison</p>
    </div>
  </Dialog>
</template>
