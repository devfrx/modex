<script setup lang="ts">
import {
  Box,
  Trash2,
  Check,
  Info,
  Heart,
  AlertTriangle,
  Layers,
  Image,
  Sparkles,
  Globe,
  Package,
  RefreshCw,
  ChevronDown,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import type { Mod } from "@/types/electron";

const props = defineProps<{
  mod: Mod;
  selected?: boolean;
  favorite?: boolean;
  isDuplicate?: boolean;
  showThumbnail?: boolean;
  usageCount?: number;
  // Group related props
  groupVariantCount?: number;
  isGroupExpanded?: boolean;
  isVariant?: boolean;
}>();

const emit = defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "show-details", mod: Mod): void;
  (e: "toggle-favorite", id: string): void;
  (e: "request-update", mod: Mod): void;
  (e: "toggle-group"): void;
}>();

const isHovered = ref(false);

function openCurseForge() {
  if (!props.mod.slug) return;
  const baseUrl = "https://www.curseforge.com/minecraft";
  let path = "mc-mods";
  if (props.mod.content_type === "resourcepack") path = "texture-packs";
  if (props.mod.content_type === "shader") path = "customization";

  window.open(`${baseUrl}/${path}/${props.mod.slug}`, "_blank");
}

function handleImageError(e: Event) {
  const target = e.target as HTMLImageElement;
  target.style.display = 'none';
}

// Content type config
const contentTypeConfig = {
  mod: { label: "Mod", icon: Layers, tagClass: "mod-tag-mod" },
  resourcepack: { label: "Resource", icon: Image, tagClass: "mod-tag-resource" },
  shader: { label: "Shader", icon: Sparkles, tagClass: "mod-tag-shader" },
};

const contentType = props.mod.content_type || "mod";
const typeConfig = contentTypeConfig[contentType] || contentTypeConfig.mod;

// Loader tag class - follows color conventions
const loaderTagClass = computed(() => {
  const loader = props.mod.loader?.toLowerCase() || '';
  if (loader.includes('forge') && !loader.includes('neo')) return 'mod-tag-forge';
  if (loader.includes('fabric')) return 'mod-tag-fabric';
  if (loader.includes('neoforge')) return 'mod-tag-neoforge';
  if (loader.includes('quilt')) return 'mod-tag-quilt';
  return 'mod-tag-default';
});
</script>

<template>
  <div class="mod-card group" :class="{
    'mod-card-selected': selected,
    'mod-card-duplicate': isDuplicate && !selected,
    'mod-card-group-expanded': isGroupExpanded && groupVariantCount,
    'mod-card-variant': isVariant,
  }" @click="$emit('toggle-select', mod.id)" @dblclick.stop="$emit('show-details', mod)" @mouseenter="isHovered = true"
    @mouseleave="isHovered = false">

    <!-- Main Card Container -->
    <div
      class="relative rounded-xl overflow-hidden bg-card border border-border/50 group-hover:border-primary/40 transition-all duration-300 shadow-sm group-hover:shadow-lg group-hover:shadow-primary/5">

      <!-- Hero Image Section -->
      <div class="relative h-24 overflow-hidden bg-muted/30">
        <!-- Background Image -->
        <img v-if="showThumbnail && (mod.thumbnail_url || mod.logo_url)" :src="mod.logo_url || mod.thumbnail_url"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          alt="" @error="handleImageError" />
        <div v-else
          class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted/20">
          <Box class="w-10 h-10 text-muted-foreground/30" />
        </div>

        <!-- Gradient Overlays -->
        <div class="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />

        <!-- Top Bar -->
        <div class="absolute top-2 left-2 right-2 z-20 flex items-center justify-between">
          <!-- Left: Badges -->
          <div class="flex items-center gap-1.5">
            <!-- Duplicate Warning -->
            <div v-if="isDuplicate" class="mod-warning-badge" title="Potential duplicate">
              <AlertTriangle class="w-3 h-3" />
            </div>

            <!-- Favorite Button -->
            <button class="mod-icon-btn" :class="favorite ? 'mod-icon-btn-active' : 'opacity-0 group-hover:opacity-100'"
              @click.stop="$emit('toggle-favorite', mod.id)" title="Toggle favorite">
              <Heart class="w-3.5 h-3.5" :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-white/80'" />
            </button>
          </div>

          <!-- Right: Selection & Usage -->
          <div class="flex items-center gap-1.5">
            <!-- Usage Count -->
            <div v-if="usageCount && usageCount > 0" class="mod-usage-badge" title="Used in modpacks">
              <Package class="w-2.5 h-2.5" />
              <span>{{ usageCount }}</span>
            </div>

            <!-- Checkbox -->
            <div class="transition-all duration-150"
              :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
              <div class="mod-checkbox" :class="selected ? 'mod-checkbox-active' : ''">
                <Check v-if="selected" class="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
          </div>
        </div>

        <!-- Content Type Badge -->
        <div class="absolute bottom-2 right-2 z-10">
          <div class="mod-type-badge" :class="typeConfig.tagClass">
            <component :is="typeConfig.icon" class="w-3 h-3" />
            <span>{{ typeConfig.label }}</span>
          </div>
        </div>
      </div>

      <!-- Content Section -->
      <div class="relative p-3">
        <!-- Title & Author -->
        <div class="mb-1.5">
          <h3
            class="font-semibold text-sm line-clamp-1 text-foreground group-hover:text-primary transition-colors cursor-pointer"
            @click.stop="$emit('show-details', mod)">
            {{ mod.name }}
          </h3>
          <p class="text-[10px] text-muted-foreground/60 mt-0.5">{{ mod.author || "Unknown Author" }}</p>
        </div>

        <!-- Description -->
        <p class="text-[11px] text-muted-foreground/70 line-clamp-1 mb-2.5">
          {{ mod.description || "No description available" }}
        </p>

        <!-- Tags Row -->
        <div class="flex items-center gap-1.5 mb-2.5">
          <!-- Loader -->
          <span v-if="mod.loader" class="mod-tag" :class="loaderTagClass">
            {{ mod.loader }}
          </span>

          <!-- Game Version -->
          <span v-if="mod.game_versions && mod.game_versions.length >= 1" class="mod-tag mod-tag-version"
            :title="mod.game_versions.join(', ')">
            <Sparkles class="w-2.5 h-2.5" />
            {{ mod.game_versions[0] }}{{ mod.game_versions.length > 1 ? ` +${mod.game_versions.length - 1}` : '' }}
          </span>
          <span v-else-if="mod.game_version" class="mod-tag mod-tag-version">
            <Sparkles class="w-2.5 h-2.5" />
            {{ mod.game_version }}
          </span>

          <!-- Group Indicator -->
          <button v-if="groupVariantCount && groupVariantCount > 0" @click.stop="$emit('toggle-group')"
            class="mod-tag ml-auto" :class="isGroupExpanded ? 'mod-tag-group-active' : 'mod-tag-group'">
            <Layers class="w-2.5 h-2.5" />
            <span>{{ groupVariantCount }}</span>
            <ChevronDown class="w-2.5 h-2.5 transition-transform" :class="{ 'rotate-180': isGroupExpanded }" />
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-1.5" @click.stop>
          <!-- Details Button -->
          <button class="mod-action-btn flex-1" @click.stop="$emit('show-details', mod)">
            <Info class="w-4 h-4" />
            <span>Details</span>
          </button>

          <!-- Secondary Actions -->
          <button v-if="mod.cf_project_id" class="mod-secondary-btn" @click.stop="$emit('request-update', mod)"
            title="Check for Update">
            <RefreshCw class="w-4 h-4" />
          </button>

          <button v-if="mod.slug" class="mod-secondary-btn" @click.stop="openCurseForge" title="View on CurseForge">
            <Globe class="w-4 h-4" />
          </button>

          <button class="mod-secondary-btn mod-secondary-btn-danger" @click.stop="$emit('delete', mod.id)"
            title="Delete">
            <Trash2 class="w-4 h-4" />
          </button>
        </div>

        <!-- Variant Indicator -->
        <div v-if="isVariant" class="mt-2 pt-2 border-t border-border/30">
          <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
            {{ mod.game_version }} • {{ mod.loader }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mod-card {
  @apply relative cursor-pointer;
  transition: transform 0.2s ease;
}

.mod-card:hover {
  transform: translateY(-3px);
}

.mod-card-selected>div {
  @apply ring-2 ring-primary ring-offset-2 ring-offset-background;
}

.mod-card-duplicate>div {
  @apply ring-1 ring-orange-500/50;
}

.mod-card-group-expanded>div {
  @apply ring-2 ring-primary/50;
}

.mod-card-variant>div {
  @apply ring-1 ring-primary/20 bg-muted/20;
}

/* Icon Button */
.mod-icon-btn {
  @apply p-1.5 rounded-lg backdrop-blur-sm border transition-all duration-200;
  @apply bg-black/40 border-white/20 hover:bg-black/60 hover:border-white/30;
}

.mod-icon-btn-active {
  @apply opacity-100 bg-rose-500/20 border-rose-500/40;
}

/* Warning Badge */
.mod-warning-badge {
  @apply p-1.5 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 animate-pulse;
}

/* Usage Badge */
.mod-usage-badge {
  @apply flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-medium;
  @apply bg-primary/20 text-primary border border-primary/30 backdrop-blur-sm;
}

/* Checkbox */
.mod-checkbox {
  @apply w-5 h-5 rounded-md border-2 flex items-center justify-center backdrop-blur-sm transition-all;
  @apply bg-black/40 border-white/30;
}

.mod-checkbox-active {
  @apply bg-primary border-primary;
}

/* Type Badge */
.mod-type-badge {
  @apply flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold;
  @apply bg-black/60 backdrop-blur-sm text-white border border-white/10;
}

/* Tags */
.mod-tag {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize;
}

.mod-tag-version {
  @apply bg-primary/10 text-primary border-primary/20;
}

.mod-tag-forge {
  @apply bg-orange-500/15 text-orange-400 border-orange-500/30;
}

.mod-tag-fabric {
  @apply bg-yellow-500/15 text-yellow-400 border-yellow-500/30;
}

.mod-tag-neoforge {
  @apply bg-red-500/15 text-red-400 border-red-500/30;
}

.mod-tag-quilt {
  @apply bg-purple-500/15 text-purple-400 border-purple-500/30;
}

.mod-tag-default {
  @apply bg-muted/50 text-muted-foreground border-border;
}

.mod-tag-mod {
  @apply bg-primary/15 text-primary border-primary/30;
}

.mod-tag-resource {
  @apply bg-blue-500/15 text-blue-400 border-blue-500/30;
}

.mod-tag-shader {
  @apply bg-pink-500/15 text-pink-400 border-pink-500/30;
}

.mod-tag-group {
  @apply bg-muted/80 text-muted-foreground border-border/50 hover:bg-primary hover:text-primary-foreground hover:border-primary;
}

.mod-tag-group-active {
  @apply bg-primary text-primary-foreground border-primary;
}

/* Action Button */
.mod-action-btn {
  @apply h-8 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all;
  @apply bg-primary text-primary-foreground hover:bg-primary/90;
}

/* Secondary Button */
.mod-secondary-btn {
  @apply h-8 w-8 rounded-lg flex items-center justify-center transition-all;
  @apply text-muted-foreground hover:text-foreground hover:bg-muted;
}

.mod-secondary-btn-danger {
  @apply hover:text-destructive hover:bg-destructive/10;
}
</style>
