<script setup lang="ts">
import {
  Heart,
  AlertTriangle,
  Layers,
  Image,
  Sparkles,
  Globe,
  Package,
  Trash2,
  Info,
  Check,
  RefreshCw,
} from "lucide-vue-next";
import type { Mod } from "@/types/electron";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
  mod: Mod;
  selected?: boolean;
  favorite?: boolean;
  isDuplicate?: boolean;
  usageCount?: number;
}>();

const emit = defineEmits<{
  (e: "delete", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
  (e: "toggle-favorite", id: string): void;
  (e: "request-update", mod: Mod): void;
}>();

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
    class: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  resourcepack: {
    label: "Resource",
    icon: Image,
    class: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  shader: {
    label: "Shader",
    icon: Sparkles,
    class: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  },
};

const contentType = props.mod.content_type || "mod";
const typeConfig = contentTypeConfig[contentType] || contentTypeConfig.mod;

// Determine if we have a thumbnail to show
const hasThumbnail = props.mod.thumbnail_url || props.mod.logo_url;
</script>

<template>
  <div
    class="gallery-card relative rounded-xl overflow-hidden cursor-pointer group break-inside-avoid mb-4 transition-all duration-300"
    :class="{
      'ring-2 ring-primary ring-offset-2 ring-offset-background': selected,
      'ring-2 ring-orange-500/50': isDuplicate && !selected,
    }"
    @click="$emit('toggle-select', mod.id)"
    @dblclick.stop="$emit('show-details', mod)"
  >
    <!-- Image Container - Hero Style -->
    <div
      class="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-muted to-muted/50"
    >
      <!-- Background Image -->
      <img
        v-if="hasThumbnail"
        :src="mod.logo_url || mod.thumbnail_url"
        :alt="mod.name"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
      />

      <!-- Fallback Icon when no image -->
      <div
        v-if="!hasThumbnail"
        class="absolute inset-0 flex items-center justify-center"
      >
        <component
          :is="typeConfig.icon"
          class="w-16 h-16 text-muted-foreground/30 group-hover:text-primary/40 transition-colors duration-300"
        />
      </div>

      <!-- Gradient Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity"
      />

      <!-- Top Left: Favorite Button -->
      <button
        class="absolute top-3 left-3 z-20 p-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 hover:bg-black/50 transition-all duration-200"
        :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        @click.stop="$emit('toggle-favorite', mod.id)"
        title="Toggle favorite"
      >
        <Heart
          class="w-4 h-4 transition-colors"
          :class="
            favorite
              ? 'fill-rose-500 text-rose-500'
              : 'text-white/70 hover:text-rose-500'
          "
        />
      </button>

      <!-- Top Right: Selection Checkbox & Badges -->
      <div class="absolute top-3 right-3 z-20 flex items-center gap-2">
        <!-- Duplicate Warning -->
        <div
          v-if="isDuplicate"
          class="p-1.5 rounded-full bg-orange-500/20 backdrop-blur-sm"
          title="Potential duplicate"
        >
          <AlertTriangle class="w-3.5 h-3.5 text-orange-400" />
        </div>

        <!-- Usage Badge -->
        <div
          v-if="usageCount && usageCount > 0"
          class="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 backdrop-blur-sm text-primary text-[10px] font-medium border border-primary/30"
          title="Used in modpacks"
        >
          <Package class="w-3 h-3" />
          <span>{{ usageCount }}</span>
        </div>

        <!-- Selection Checkbox -->
        <div
          class="transition-all duration-200"
          :class="
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          "
        >
          <div
            class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors backdrop-blur-sm"
            :class="
              selected
                ? 'bg-primary border-primary'
                : 'bg-black/30 border-white/30 hover:border-primary/50'
            "
          >
            <Check
              v-if="selected"
              class="w-3.5 h-3.5 text-primary-foreground"
            />
          </div>
        </div>
      </div>

      <!-- Content Type Badge (Top) -->
      <div
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <span
          class="px-2 py-0.5 rounded-full text-[10px] font-medium border backdrop-blur-sm flex items-center gap-1"
          :class="typeConfig.class"
        >
          <component :is="typeConfig.icon" class="w-3 h-3" />
          {{ typeConfig.label }}
        </span>
      </div>

      <!-- Bottom Content Overlay -->
      <div class="absolute bottom-0 left-0 right-0 p-4 z-10">
        <!-- Mod Name & Author -->
        <h3
          class="font-semibold text-base text-white leading-tight mb-1 line-clamp-2 group-hover:text-primary transition-colors"
        >
          {{ mod.name }}
        </h3>
        <p class="text-xs text-white/60 mb-3">
          {{ mod.author || "Unknown Author" }}
        </p>

        <!-- Tags Row -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Loader Badge (mods only) -->
          <span
            v-if="contentType === 'mod'"
            class="px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm"
            :class="
              mod.loader?.toLowerCase().includes('forge')
                ? 'bg-orange-500/30 text-orange-300'
                : 'bg-blue-500/30 text-blue-300'
            "
          >
            {{ mod.loader }}
          </span>

          <!-- Game Version -->
          <span
            v-if="
              contentType !== 'mod' &&
              mod.game_versions &&
              mod.game_versions.length > 1
            "
            class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/80 backdrop-blur-sm"
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
            class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white/80 backdrop-blur-sm"
          >
            {{ mod.game_version }}
          </span>
        </div>

        <!-- Action Row (Hidden until hover) -->
        <div
          class="flex items-center gap-1 mt-3 pt-3 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0"
          @click.stop
        >
          <Button
            v-if="mod.cf_project_id"
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/60 hover:text-green-400 hover:bg-green-500/10"
            @click.stop="$emit('request-update', mod)"
            title="Check for Update"
          >
            <RefreshCw class="w-3.5 h-3.5" />
          </Button>
          <Button
            v-if="mod.slug"
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
            @click.stop="openCurseForge"
            title="View on CurseForge"
          >
            <Globe class="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
            @click.stop="$emit('show-details', mod)"
            title="Details"
          >
            <Info class="w-3.5 h-3.5" />
          </Button>
          <div class="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/60 hover:text-destructive hover:bg-destructive/10"
            @click.stop="$emit('delete', mod.id)"
            title="Delete"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-card {
  box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.3);
}

.gallery-card:hover {
  box-shadow: 0 8px 30px -4px rgba(0, 0, 0, 0.5);
}
</style>
