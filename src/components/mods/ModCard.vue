<script setup lang="ts">
import {
  Box,
  Trash2,
  Edit,
  Check,
  Info,
  Star,
  AlertTriangle,
} from "lucide-vue-next";
import type { Mod } from "@/types/electron";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
  mod: Mod;
  selected?: boolean;
  favorite?: boolean;
  isDuplicate?: boolean;
  showThumbnail?: boolean;
}>();

const emit = defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
  (e: "toggle-favorite", id: string): void;
}>();

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}
</script>

<template>
  <div
    class="relative rounded-xl border border-border bg-card overflow-hidden group transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    :class="{
      'ring-1 ring-primary bg-primary/5': selected,
      'ring-1 ring-orange-500/50': isDuplicate && !selected,
    }" @click="$emit('toggle-select', mod.id)" @dblclick.stop="$emit('show-details', mod)">
    <!-- Background Gradient on Hover -->
    <div
      class="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

    <!-- Top Actions (Favorite, Checkbox) -->
    <div class="absolute top-3 left-3 z-20 flex gap-2">
      <!-- Favorite -->
      <button class="transition-all duration-200" :class="favorite
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
        " @click.stop="$emit('toggle-favorite', mod.id)" title="Toggle favorite">
        <Star class="w-5 h-5 transition-colors" :class="favorite
            ? 'fill-amber-400 text-amber-400'
            : 'text-muted-foreground hover:text-amber-400'
          " />
      </button>

      <!-- Duplicate Indicator -->
      <div v-if="isDuplicate" title="Potential duplicate mod" class="animate-pulse">
        <AlertTriangle class="w-4 h-4 text-orange-500" />
      </div>
    </div>

    <div class="absolute top-3 right-3 z-20 transition-all duration-200" :class="selected
        ? 'opacity-100 scale-100'
        : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
      ">
      <div class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors shadow-sm" :class="selected
          ? 'bg-primary border-primary'
          : 'bg-muted/40 border-border hover:border-primary/50'
        ">
        <Check v-if="selected" class="w-3.5 h-3.5 text-primary-foreground" />
      </div>
    </div>

    <div class="p-4 relative z-10 flex flex-col h-full">
      <!-- Header with Icon -->
      <div class="flex items-start gap-4 mb-3">
        <div
          class="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/5 group-hover:border-primary/20 transition-colors">
          <img v-if="showThumbnail && (mod.thumbnail_url || mod.logo_url)" :src="mod.logo_url || mod.thumbnail_url"
            :alt="mod.name" class="w-full h-full object-cover"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')" />
          <div v-else class="w-full h-full flex items-center justify-center">
            <Box class="w-6 h-6 text-muted-foreground/50 group-hover:text-primary/50 transition-colors" />
          </div>
        </div>

        <div class="min-w-0 flex-1 pt-0.5">
          <h3
            class="font-semibold text-base leading-tight truncate pr-2 text-foreground/90 group-hover:text-primary transition-colors">
            {{ mod.name }}
          </h3>
          <p class="text-xs text-muted-foreground truncate mt-1">
            {{ mod.author || "Unknown Author" }}
          </p>
        </div>
      </div>

      <!-- Description -->
      <p class="text-sm text-muted-foreground/80 line-clamp-2 mb-4 flex-1 h-[2.5rem] leading-relaxed">
        {{ mod.description || "No description available" }}
      </p>

      <!-- Tags & Meta -->
      <div class="space-y-3 mt-auto">
        <!-- Categories -->
        <div v-if="mod.categories && mod.categories.length" class="flex flex-wrap gap-1.5 h-5 overflow-hidden">
          <span v-for="category in mod.categories.slice(0, 3)" :key="category"
            class="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-secondary/50 text-secondary-foreground/70">
            {{ category }}
          </span>
        </div>

        <!-- Meta Footer -->
        <div class="flex items-center justify-between pt-3 border-t border-white/5">
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="mod.loader?.toLowerCase().includes('forge')
                ? 'bg-orange-500/10 text-orange-400'
                : 'bg-blue-500/10 text-blue-400'
              ">
              {{ mod.loader }}
            </span>
            <span class="text-[10px] font-medium text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
              {{ mod.game_version }}
            </span>
          </div>

          <!-- Actions Row -->
          <div class="flex items-center gap-1" @click.stop>
            <Button variant="ghost" size="icon"
              class="h-7 w-7 text-muted-foreground/70 hover:text-foreground hover:bg-white/10"
              @click.stop="$emit('show-details', mod)" title="Details">
              <Info class="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon"
              class="h-7 w-7 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
              @click.stop="$emit('delete', mod.id)" title="Delete">
              <Trash2 class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
