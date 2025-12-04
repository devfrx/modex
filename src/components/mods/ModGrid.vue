<script setup lang="ts">
import ModCard from "./ModCard.vue";
import type { Mod } from "@/types/electron";

defineProps<{
  mods: Mod[];
  selectedIds: Set<string>;
}>();

defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
}>();
</script>

<template>
  <div
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
  >
    <ModCard
      v-for="mod in mods"
      :key="mod.id"
      :mod="mod"
      :selected="selectedIds.has(mod.id!)"
      @delete="$emit('delete', $event)"
      @edit="$emit('edit', $event)"
      @toggle-select="$emit('toggle-select', $event)"
      @show-details="$emit('show-details', $event)"
    />
  </div>
</template>
