<script setup lang="ts">
import {
  Box,
  Trash2,
  Edit,
  Check,
  Info,
  Heart,
  AlertTriangle,
  Layers,
  Image,
  Sparkles,
  Globe,
  Package,
} from "lucide-vue-next";
import type { Mod } from "@/types/electron";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
  mod: Mod;
  selected?: boolean;
  favorite?: boolean;
  isDuplicate?: boolean;
  showThumbnail?: boolean;
  usageCount?: number;
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

function openCurseForge() {
  if (!props.mod.slug) return;
  const baseUrl = "https://www.curseforge.com/minecraft";
  let path = "mc-mods";
  if (props.mod.content_type === "resourcepack") path = "texture-packs";
  if (props.mod.content_type === "shader") path = "customization";

  window.open(`${baseUrl}/${path}/${props.mod.slug}`, "_blank");
}

// Content type helpers
const contentTypeConfig = {
  mod: {
    label: "Mod",
    icon: Layers,
    class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  resourcepack: {
    label: "Resource",
    icon: Image,
    class: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  shader: {
    label: "Shader",
    icon: Sparkles,
    class: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  },
};

const contentType = props.mod.content_type || "mod";
const typeConfig = contentTypeConfig[contentType] || contentTypeConfig.mod;
</script>

<template>
  <div
    class="relative rounded-xl border border-border bg-card overflow-hidden group transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    :class="{
      'ring-1 ring-primary bg-primary/5': selected,
      'ring-1 ring-orange-500/50': isDuplicate && !selected,
    }"
    @click="$emit('toggle-select', mod.id)"
    @dblclick.stop="$emit('show-details', mod)"
  >
    <!-- Background Gradient on Hover -->
    <div
      class="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
    />

    <!-- Top Actions (Favorite, Checkbox) -->
    <div class="absolute top-3 left-3 z-20 flex gap-2">
      <!-- Favorite -->
      <button
        class="p-1.5 rounded-full bg-background/20 backdrop-blur-sm border border-white/10 hover:bg-background/40 transition-all duration-200"
        :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        @click.stop="$emit('toggle-favorite', mod.id)"
        title="Toggle favorite"
      >
        <Heart
          class="w-4 h-4 transition-colors"
          :class="
            favorite
              ? 'fill-rose-500 text-rose-500'
              : 'text-muted-foreground hover:text-rose-500'
          "
        />
      </button>

      <!-- Duplicate Indicator -->
      <div
        v-if="isDuplicate"
        title="Potential duplicate mod"
        class="animate-pulse"
      >
        <AlertTriangle class="w-4 h-4 text-orange-500" />
      </div>
    </div>

    <!-- Usage Indicator -->
    <div
      v-if="usageCount && usageCount > 0"
      class="absolute top-3 right-10 z-20 transition-all duration-200"
      :class="selected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'"
      title="Used in modpacks"
    >
      <div
        class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-medium border border-primary/30 backdrop-blur-sm"
      >
        <Package class="w-3 h-3" />
        <span>{{ usageCount }}</span>
      </div>
    </div>

    <div
      class="absolute top-3 right-3 z-20 transition-all duration-200"
      :class="
        selected
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
      "
    >
      <div
        class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors shadow-sm"
        :class="
          selected
            ? 'bg-primary border-primary'
            : 'bg-muted/40 border-border hover:border-primary/50'
        "
      >
        <Check v-if="selected" class="w-3.5 h-3.5 text-primary-foreground" />
      </div>
    </div>

    <div class="p-4 relative z-10 flex flex-col h-full">
      <!-- Header with Icon -->
      <div class="flex items-start gap-4 mb-3">
        <div
          class="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/5 group-hover:border-primary/20 transition-colors"
        >
          <img
            v-if="showThumbnail && (mod.thumbnail_url || mod.logo_url)"
            :src="mod.logo_url || mod.thumbnail_url"
            :alt="mod.name"
            class="w-full h-full object-cover"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <Box
              class="w-6 h-6 text-muted-foreground/50 group-hover:text-primary/50 transition-colors"
            />
          </div>
        </div>

        <div class="min-w-0 flex-1 pt-0.5">
          <h3
            class="font-semibold text-base leading-tight truncate pr-2 text-foreground/90 group-hover:text-primary transition-colors"
          >
            {{ mod.name }}
          </h3>
          <p class="text-xs text-muted-foreground truncate mt-1">
            {{ mod.author || "Unknown Author" }}
          </p>
        </div>
      </div>

      <!-- Description -->
      <p
        class="text-sm text-muted-foreground/80 line-clamp-2 mb-4 flex-1 h-[2.5rem] leading-relaxed"
      >
        {{ mod.description || "No description available" }}
      </p>

      <!-- Tags & Meta -->
      <div class="space-y-3 mt-auto">
        <!-- Categories -->
        <div
          v-if="mod.categories && mod.categories.length"
          class="flex flex-wrap gap-1.5 h-5 overflow-hidden"
        >
          <span
            v-for="category in mod.categories.slice(0, 3)"
            :key="category"
            class="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-secondary/50 text-secondary-foreground/70"
          >
            {{ category }}
          </span>
        </div>

        <!-- Meta Footer -->
        <div
          class="flex items-center justify-between pt-3 border-t border-white/5"
        >
          <div class="flex items-center gap-2">
            <!-- Content Type Badge -->
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1"
              :class="typeConfig.class"
            >
              <component :is="typeConfig.icon" class="w-3 h-3" />
              {{ typeConfig.label }}
            </span>
            <!-- Loader (only for mods) -->
            <span
              v-if="contentType === 'mod'"
              class="px-1.5 py-0.5 rounded text-[10px] font-medium"
              :class="
                mod.loader?.toLowerCase().includes('forge')
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'bg-blue-500/10 text-blue-400'
              "
            >
              {{ mod.loader }}
            </span>
            <!-- Game versions (show list for shaders/resourcepacks if available) -->
            <span
              v-if="
                contentType !== 'mod' &&
                mod.game_versions &&
                mod.game_versions.length >= 1
              "
              class="text-[10px] font-medium text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded"
              :title="mod.game_versions.join(', ')"
            >
              {{ mod.game_versions.slice(0, 2).join(", ")
              }}{{
                mod.game_versions.length > 2
                  ? ` +${mod.game_versions.length - 2}`
                  : ""
              }}
            </span>
            <span
              v-else
              class="text-[10px] font-medium text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded"
            >
              {{ mod.game_version }}
            </span>
          </div>

          <!-- Actions Row -->
          <div class="flex items-center gap-1" @click.stop>
            <Button
              v-if="mod.slug"
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground/70 hover:text-primary hover:bg-primary/10"
              @click.stop="openCurseForge"
              title="View on CurseForge"
            >
              <Globe class="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground/70 hover:text-foreground hover:bg-white/10"
              @click.stop="$emit('show-details', mod)"
              title="Details"
            >
              <Info class="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
              @click.stop="$emit('delete', mod.id)"
              title="Delete"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
