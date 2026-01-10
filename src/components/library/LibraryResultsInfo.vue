<script setup lang="ts">
defineProps<{
  enableGrouping: boolean;
  paginatedGroupsLength: number;
  groupedModsLength: number;
  filteredModsLength: number;
  hasExpandedGroups: boolean;
  hasActiveFilters: boolean;
}>();

const emit = defineEmits<{
  (e: "clearFilters"): void;
}>();
</script>

<template>
  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    <span>
      Showing
      <template v-if="enableGrouping">
        {{ paginatedGroupsLength }} of {{ groupedModsLength }} groups
      </template>
      <template v-else>
        {{ paginatedGroupsLength }} of {{ filteredModsLength }} items
      </template>
      <span
        v-if="enableGrouping && hasExpandedGroups"
        class="text-muted-foreground/70"
      >
        ({{ filteredModsLength }} total mods)
      </span>
    </span>
    <button
      v-if="hasActiveFilters"
      @click="emit('clearFilters')"
      class="text-primary hover:underline"
    >
      Clear filters
    </button>
  </div>
</template>
