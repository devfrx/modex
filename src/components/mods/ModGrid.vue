<script setup lang="ts">
import ModCard from "./ModCard.vue";
import type { Mod } from "@/types/electron";

defineProps<{
  mods: Mod[];
  selectedIds: Set<string>;
  favoriteIds?: Set<string>;
  duplicateIds?: Set<string>;
  showThumbnails?: boolean;
  modUsageMap?: Map<string, Set<string>>;
}>();

defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
  (e: "toggle-favorite", id: string): void;
}>();
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    <ModCard v-for="mod in mods" :key="mod.id" :mod="mod" :selected="selectedIds.has(mod.id)"
      :favorite="favoriteIds?.has(mod.id)" :is-duplicate="duplicateIds?.has(mod.id)" :show-thumbnail="showThumbnails"
      :usage-count="modUsageMap?.get(mod.id)?.size || 0"
      @delete="$emit('delete', $event)" @edit="$emit('edit', $event)" @toggle-select="$emit('toggle-select', $event)"
      @show-details="$emit('show-details', $event)" @toggle-favorite="$emit('toggle-favorite', $event)" />
  </div>
</template>
