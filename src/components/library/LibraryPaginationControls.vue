<script setup lang="ts">
defineProps<{
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  itemsPerPageOptions: readonly number[];
  canGoPrev: boolean;
  canGoNext: boolean;
}>();

const emit = defineEmits<{
  (e: "update:itemsPerPage", value: number): void;
  (e: "goToPage", page: number): void;
  (e: "prevPage"): void;
  (e: "nextPage"): void;
}>();

function onItemsPerPageChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  emit("update:itemsPerPage", Number(target.value));
}
</script>

<template>
  <div v-if="totalPages > 1" class="flex items-center gap-2">
    <!-- Items per page selector -->
    <div class="flex items-center gap-1.5">
      <span class="text-xs text-muted-foreground hidden sm:inline">Show:</span>
      <select
        :value="itemsPerPage"
        @change="onItemsPerPageChange"
        class="h-7 rounded-md border border-border bg-muted/50 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option v-for="opt in itemsPerPageOptions" :key="opt" :value="opt">
          {{ opt }}
        </option>
      </select>
    </div>

    <div class="h-4 w-px bg-border mx-1" />

    <!-- Page navigation -->
    <div class="flex items-center gap-1">
      <button
        @click="emit('goToPage', 1)"
        :disabled="!canGoPrev"
        class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ««
      </button>
      <button
        @click="emit('prevPage')"
        :disabled="!canGoPrev"
        class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ‹
      </button>

      <span class="px-2 text-xs text-muted-foreground tabular-nums">
        {{ currentPage }} / {{ totalPages }}
      </span>

      <button
        @click="emit('nextPage')"
        :disabled="!canGoNext"
        class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ›
      </button>
      <button
        @click="emit('goToPage', totalPages)"
        :disabled="!canGoNext"
        class="h-7 w-7 flex items-center justify-center rounded-md border border-border text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        »»
      </button>
    </div>
  </div>
</template>
