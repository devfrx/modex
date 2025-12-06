<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import { AlertTriangle, Check, X, Lock } from "lucide-vue-next";
import type { Modpack, Mod } from "@/types/electron";

const props = defineProps<{
  open: boolean;
  mods: Mod[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", modpackId: string, compatibleModIds: string[]): void;
}>();

const modpacks = ref<Modpack[]>([]);
const selectedModpackId = ref<string | null>(null);
const isLoading = ref(false);

// Calculate compatibility for each modpack
const modpacksWithCompatibility = computed(() => {
  return modpacks.value.map(pack => {
    const compatible: Mod[] = [];
    const incompatible: Mod[] = [];

    for (const mod of props.mods) {
      const versionMatch = mod.game_version === pack.minecraft_version;
      const loaderMatch = (mod.loader || '').toLowerCase() === (pack.loader || '').toLowerCase();

      if (versionMatch && loaderMatch) {
        compatible.push(mod);
      } else {
        incompatible.push(mod);
      }
    }

    return {
      ...pack,
      compatible,
      incompatible,
      allCompatible: incompatible.length === 0,
      noneCompatible: compatible.length === 0,
      isLinked: !!pack.remote_source?.url
    };
  });
});

// Get selected pack with compatibility info
const selectedPack = computed(() => {
  if (!selectedModpackId.value) return null;
  return modpacksWithCompatibility.value.find(p => p.id === selectedModpackId.value) || null;
});

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
  if (!selectedModpackId.value || !selectedPack.value) return;
  if (selectedPack.value.isLinked) return; // Block if linked
  const compatibleIds = selectedPack.value.compatible.map(m => m.id);
  emit("select", selectedModpackId.value, compatibleIds);
}
</script>

<template>
  <Dialog :open="open" title="Add to Modpack">
    <div class="space-y-4 py-4">
      <p class="text-sm text-muted-foreground">
        Select a modpack to add {{ mods.length }} mods to:
      </p>

      <div v-if="isLoading" class="text-center py-4">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
      </div>

      <div v-else-if="modpacks.length === 0" class="text-center py-4 text-muted-foreground">
        No modpacks found. Create one first!
      </div>

      <div v-else class="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
        <div v-for="pack in modpacksWithCompatibility" :key="pack.id"
          class="flex items-center p-2 rounded-md transition-colors" :class="[
            selectedModpackId === pack.id
              ? 'bg-primary/20 border border-primary'
              : 'hover:bg-accent border border-transparent',
            (pack.noneCompatible || pack.isLinked) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          ]" @click="!pack.isLinked && (selectedModpackId = pack.id)">
          <div class="flex-1">
            <div class="font-medium flex items-center gap-2">
              {{ pack.name }}
              <Lock v-if="pack.isLinked" class="w-3 h-3 text-muted-foreground" />
            </div>
            <div class="text-xs text-muted-foreground flex items-center gap-2">
              <span>{{ pack.minecraft_version }}</span>
              <span class="text-muted-foreground/50">•</span>
              <span class="capitalize">{{ pack.loader }}</span>
              <span v-if="pack.isLinked" class="text-purple-500 ml-1">Read-Only</span>
            </div>
          </div>

          <!-- Compatibility indicator -->
          <div class="flex items-center gap-2 text-xs">
            <span v-if="pack.allCompatible" class="flex items-center gap-1 text-green-500">
              <Check class="w-3 h-3" />
              {{ pack.compatible.length }}
            </span>
            <template v-else>
              <span class="flex items-center gap-1 text-green-500">
                <Check class="w-3 h-3" />
                {{ pack.compatible.length }}
              </span>
              <span class="flex items-center gap-1 text-amber-500">
                <X class="w-3 h-3" />
                {{ pack.incompatible.length }}
              </span>
            </template>
          </div>

          <div v-if="selectedModpackId === pack.id" class="text-primary ml-2">✓</div>
        </div>
      </div>

      <!-- Incompatible mods warning -->
      <div v-if="selectedPack && selectedPack.incompatible.length > 0"
        class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
        <div class="flex items-center gap-2 text-amber-500 text-sm font-medium">
          <AlertTriangle class="w-4 h-4" />
          {{ selectedPack.incompatible.length }} mod(s) will be skipped
        </div>
        <p class="text-xs text-muted-foreground">
          These mods have a different game version or loader:
        </p>
        <div class="max-h-24 overflow-y-auto space-y-1">
          <div v-for="mod in selectedPack.incompatible" :key="mod.id"
            class="text-xs flex items-center justify-between py-1 px-2 bg-background/50 rounded">
            <span class="truncate flex-1">{{ mod.name }}</span>
            <span class="text-muted-foreground ml-2 shrink-0">
              {{ mod.game_version }} / {{ mod.loader }}
            </span>
          </div>
        </div>
      </div>

      <!-- All compatible message -->
      <div v-else-if="selectedPack && selectedPack.allCompatible"
        class="rounded-md border border-green-500/30 bg-green-500/10 p-3">
        <div class="flex items-center gap-2 text-green-500 text-sm">
          <Check class="w-4 h-4" />
          All {{ selectedPack.compatible.length }} mods are compatible
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" @click="$emit('close')">Cancel</Button>
      <Button @click="add" :disabled="!selectedModpackId || (selectedPack?.noneCompatible) || (selectedPack?.isLinked)">
        <template v-if="selectedPack?.isLinked">
          <Lock class="w-4 h-4 mr-2" />
          Read-Only Modpack
        </template>
        <template v-else-if="selectedPack">
          Add {{ selectedPack.compatible.length }} Mod(s)
        </template>
        <template v-else>
          Add Mods
        </template>
      </Button>
    </template>
  </Dialog>
</template>
