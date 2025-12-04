<script setup lang="ts">
import { Box, Trash2, Edit, Check, Info, Star, AlertTriangle } from "lucide-vue-next";
import type { Mod } from "@/types/electron";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
  mod: Mod;
  selected?: boolean;
  favorite?: boolean;
  isDuplicate?: boolean;
}>();

const emit = defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
  (e: "toggle-favorite", id: string): void;
}>();
</script>

<template>
  <div
    class="glass-card relative rounded-lg p-4 group overflow-hidden transition-all duration-200"
    :class="{ 
      'ring-2 ring-primary bg-primary/5': selected,
      'ring-1 ring-orange-500/50': isDuplicate && !selected
    }"
    @click="$emit('toggle-select', mod.id)"
    @dblclick.stop="$emit('show-details', mod)"
  >
    <!-- Hover Gradient Effect -->
    <div
      class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
    />

    <!-- Favorite Button -->
    <button
      class="absolute top-3 left-3 z-20 transition-all duration-200"
      :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      @click.stop="$emit('toggle-favorite', mod.id)"
      title="Toggle favorite"
    >
      <Star 
        class="w-5 h-5 transition-colors" 
        :class="favorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'"
      />
    </button>

    <!-- Duplicate Warning -->
    <div 
      v-if="isDuplicate"
      class="absolute top-3 left-10 z-20"
      title="Potential duplicate mod"
    >
      <AlertTriangle class="w-4 h-4 text-orange-500" />
    </div>

    <!-- Selection Checkbox -->
    <div
      class="absolute top-3 right-3 z-20 transition-all duration-200"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
    >
      <div
        class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
        :class="
          selected
            ? 'bg-primary border-primary'
            : 'bg-background/50 border-white/20 hover:border-primary'
        "
      >
        <Check v-if="selected" class="w-3.5 h-3.5 text-primary-foreground" />
      </div>
    </div>

    <div class="relative z-10">
      <div class="flex items-start justify-between mb-3">
        <div
          class="p-2.5 bg-secondary/50 backdrop-blur-sm rounded-xl group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300"
        >
          <Box class="w-6 h-6" />
        </div>
      </div>

      <h3
        class="font-semibold text-lg mb-1 line-clamp-1 tracking-tight group-hover:text-primary transition-colors pr-6"
      >
        {{ mod.name }}
      </h3>

      <p class="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
        {{ mod.description || "No description available" }}
      </p>

      <div
        class="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-white/5"
      >
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-primary/50" />
          <span>{{ mod.loader }}</span>
        </div>

        <!-- Actions -->
        <div
          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop
        >
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 text-muted-foreground hover:text-blue-400"
            @click.stop="$emit('show-details', mod)"
            title="Details"
          >
            <Info class="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 text-muted-foreground hover:text-primary"
            @click.stop="$emit('edit', mod.id)"
          >
            <Edit class="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 text-muted-foreground hover:text-destructive"
            @click.stop="$emit('delete', mod.id)"
          >
            <Trash2 class="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
