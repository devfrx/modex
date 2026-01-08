<script setup lang="ts">
import {
  Package,
  Trash2,
  Edit,
  Check,
  Copy,
  FolderOpen,
  Heart,
  Share2,
  RefreshCw,
  Flame,
  Globe,
  Link2,
  Gamepad2,
  MoreHorizontal,
  CircleDot,
  Layers,
  Sparkles,
} from "lucide-vue-next";
import { ref, computed } from "vue";
import DefaultModpackImage from "@/assets/modpack-placeholder.png";

interface ModpackWithCount {
  id: string;
  name: string;
  version: string;
  minecraft_version?: string;
  loader?: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
  modCount: number;
  // Source tracking
  cf_project_id?: number;
  cf_file_id?: number;
  cf_slug?: string;
  share_code?: string;
  // Remote sync
  remote_source?: {
    url?: string;
  };
  // Unsaved changes flag
  hasUnsavedChanges?: boolean;
}

const props = defineProps<{
  modpack: ModpackWithCount;
  selected?: boolean;
  favorite?: boolean;
  isRunning?: boolean;
}>();

defineEmits<{
  (e: "delete", id: string): void;
  (e: "edit", id: string): void;
  (e: "toggle-select", id: string): void;
  (e: "clone", id: string): void;
  (e: "open-folder", id: string): void;
  (e: "toggle-favorite", id: string): void;
  (e: "share", id: string, name: string): void;
  (e: "convert", id: string): void;
  (e: "play", id: string): void;
}>();

const showMoreActions = ref(false);
const isHovered = ref(false);

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = "none";
}

// Loader colors with gradients
const loaderStyle = computed(() => {
  const loader = props.modpack.loader?.toLowerCase();
  switch (loader) {
    case 'forge':
      return { bg: 'bg-gradient-to-r from-orange-500/20 to-amber-500/20', text: 'text-orange-400', border: 'border-orange-500/30' };
    case 'fabric':
      return { bg: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'neoforge':
      return { bg: 'bg-gradient-to-r from-red-500/20 to-orange-500/20', text: 'text-red-400', border: 'border-red-500/30' };
    case 'quilt':
      return { bg: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20', text: 'text-purple-400', border: 'border-purple-500/30' };
    default:
      return { bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border/30' };
  }
});

// Loader tag class for simpler styling
const loaderTagClass = computed(() => {
  const loader = props.modpack.loader?.toLowerCase();
  switch (loader) {
    case 'forge': return 'card-tag-forge';
    case 'fabric': return 'card-tag-fabric';
    case 'neoforge': return 'card-tag-neoforge';
    case 'quilt': return 'card-tag-quilt';
    default: return 'card-tag-default';
  }
});

function closeMoreActions() {
  showMoreActions.value = false;
}
</script>

<template>
  <div class="modpack-card group" :class="{
    'modpack-card-selected': selected,
    'modpack-card-running': isRunning,
    'z-50': showMoreActions,
  }" @click="$emit('toggle-select', modpack.id)" @mouseleave="closeMoreActions(); isHovered = false"
    @mouseenter="isHovered = true">

    <!-- Main Card Container -->
    <div
      class="relative rounded-xl overflow-hidden bg-card border border-border/50 group-hover:border-primary/40 transition-all duration-300 shadow-sm group-hover:shadow-lg group-hover:shadow-primary/5">

      <!-- Hero Image Section -->
      <div class="relative h-32 overflow-hidden bg-muted/30">
        <!-- Background Image -->
        <img :src="modpack.image_url
          ? modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
            ? modpack.image_url
            : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
          : DefaultModpackImage"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          alt="" @error="handleImageError" />

        <!-- Gradient Overlays -->
        <div class="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />

        <!-- Running Pulse Overlay -->
        <div v-if="isRunning"
          class="absolute inset-0 bg-gradient-to-t from-primary/20 via-primary/5 to-transparent animate-pulse" />

        <!-- Top Bar -->
        <div class="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between">
          <!-- Left: Badges -->
          <div class="flex items-center gap-1.5">
            <!-- Running Badge -->
            <div v-if="isRunning" class="live-badge">
              <span class="live-dot"></span>
              <span>LIVE</span>
            </div>

            <!-- Favorite Button -->
            <button v-else class="card-icon-btn"
              :class="favorite ? 'card-icon-btn-active' : 'opacity-0 group-hover:opacity-100'"
              @click.stop="$emit('toggle-favorite', modpack.id)" title="Toggle favorite">
              <Heart class="w-3.5 h-3.5" :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-white/80'" />
            </button>
          </div>

          <!-- Right: Selection -->
          <div class="transition-all duration-150"
            :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
            <div class="card-checkbox" :class="selected ? 'card-checkbox-active' : ''">
              <Check v-if="selected" class="w-3 h-3 text-primary-foreground" />
            </div>
          </div>
        </div>

        <!-- Mod Count Badge -->
        <div class="absolute bottom-2.5 right-2.5 z-10">
          <div class="card-badge">
            <Layers class="w-3 h-3" />
            <span>{{ modpack.modCount }}</span>
          </div>
        </div>
      </div>

      <!-- Content Section -->
      <div class="relative p-3.5">
        <!-- Title & Version -->
        <div class="mb-2">
          <h3 class="font-semibold text-sm line-clamp-1 text-foreground group-hover:text-primary transition-colors">
            {{ modpack.name }}
          </h3>
          <p class="text-[11px] text-muted-foreground/70 mt-0.5">v{{ modpack.version }}</p>
        </div>

        <!-- Description -->
        <p class="text-xs text-muted-foreground/80 line-clamp-1 mb-3">
          {{ modpack.description || "Imported from CurseForge. Author: Unknown" }}
        </p>

        <!-- Tags Row -->
        <div class="flex items-center gap-1.5 mb-3">
          <!-- MC Version -->
          <span v-if="modpack.minecraft_version" class="card-tag card-tag-primary">
            <Sparkles class="w-2.5 h-2.5" />
            {{ modpack.minecraft_version }}
          </span>

          <!-- Loader -->
          <span v-if="modpack.loader" class="card-tag" :class="loaderTagClass">
            {{ modpack.loader }}
          </span>

          <!-- Source Indicators -->
          <div class="flex items-center gap-1 ml-auto">
            <span v-if="modpack.cf_project_id" class="card-source card-source-cf" title="From CurseForge">
              <Flame class="w-3 h-3" />
            </span>
            <span v-if="modpack.remote_source?.url" class="card-source card-source-linked" title="Cloud Synced">
              <Link2 class="w-3 h-3" />
            </span>
            <span v-else-if="modpack.share_code" class="card-source card-source-shareable" title="Shareable">
              <Globe class="w-3 h-3" />
            </span>
            <span v-if="modpack.hasUnsavedChanges" class="card-source card-source-unsaved" title="Unsaved changes">
              <CircleDot class="w-3 h-3" />
            </span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2" @click.stop>
          <!-- Launch Button -->
          <button v-if="!isRunning" class="card-launch-btn flex-1" @click.stop="$emit('play', modpack.id)">
            <Gamepad2 class="w-4 h-4" />
            <span>Launch</span>
          </button>

          <!-- Running State -->
          <div v-else class="card-running-btn flex-1">
            <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>Running</span>
          </div>

          <!-- Secondary Actions -->
          <button class="card-action-btn" @click.stop="$emit('edit', modpack.id)" title="Edit">
            <Edit class="w-4 h-4" />
          </button>

          <button class="card-action-btn" @click.stop="$emit('share', modpack.id, modpack.name)" title="Share">
            <Share2 class="w-4 h-4" />
          </button>

          <!-- More Actions -->
          <div class="relative">
            <button class="card-action-btn" @click.stop="showMoreActions = !showMoreActions" title="More">
              <MoreHorizontal class="w-4 h-4" />
            </button>

            <!-- Dropdown -->
            <Transition enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95 -translate-y-1" enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 scale-100 translate-y-0" leave-to-class="opacity-0 scale-95 -translate-y-1">
              <div v-if="showMoreActions" class="card-dropdown">
                <button class="card-dropdown-item" @click.stop="$emit('open-folder', modpack.id); closeMoreActions();">
                  <FolderOpen class="w-4 h-4" />
                  Open Folder
                </button>
                <button class="card-dropdown-item" @click.stop="$emit('clone', modpack.id); closeMoreActions();">
                  <Copy class="w-4 h-4" />
                  Duplicate
                </button>
                <button class="card-dropdown-item" @click.stop="$emit('convert', modpack.id); closeMoreActions();">
                  <RefreshCw class="w-4 h-4" />
                  Convert
                </button>
                <div class="card-dropdown-divider" />
                <button class="card-dropdown-item card-dropdown-danger"
                  @click.stop="$emit('delete', modpack.id); closeMoreActions();">
                  <Trash2 class="w-4 h-4" />
                  Delete
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modpack-card {
  @apply relative cursor-pointer;
  transition: transform 0.2s ease;
}

.modpack-card:hover {
  transform: translateY(-3px);
}

.modpack-card-selected>div {
  @apply ring-2 ring-primary ring-offset-2 ring-offset-background;
}

.modpack-card-running>div {
  @apply ring-2 ring-primary/50;
}

/* Live Badge */
.live-badge {
  @apply px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5;
  @apply bg-primary text-primary-foreground shadow-lg;
}

.live-dot {
  @apply w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse;
}

/* Card Icon Button */
.card-icon-btn {
  @apply p-1.5 rounded-lg backdrop-blur-sm border transition-all duration-200;
  @apply bg-black/40 border-white/20 hover:bg-black/60 hover:border-white/30;
}

.card-icon-btn-active {
  @apply opacity-100 bg-rose-500/20 border-rose-500/40;
}

/* Card Checkbox */
.card-checkbox {
  @apply w-5 h-5 rounded-md border-2 flex items-center justify-center backdrop-blur-sm transition-all;
  @apply bg-black/40 border-white/30;
}

.card-checkbox-active {
  @apply bg-primary border-primary;
}

/* Card Badge */
.card-badge {
  @apply flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold;
  @apply bg-black/60 backdrop-blur-sm text-white border border-white/10;
}

/* Card Tags */
.card-tag {
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize;
}

.card-tag-primary {
  @apply bg-primary/10 text-primary border-primary/20;
}

.card-tag-forge {
  @apply bg-orange-500/15 text-orange-400 border-orange-500/30;
}

.card-tag-fabric {
  @apply bg-amber-500/15 text-amber-400 border-amber-500/30;
}

.card-tag-neoforge {
  @apply bg-red-500/15 text-red-400 border-red-500/30;
}

.card-tag-quilt {
  @apply bg-purple-500/15 text-purple-400 border-purple-500/30;
}

.card-tag-default {
  @apply bg-muted/50 text-muted-foreground border-border;
}

/* Source Icons */
.card-source {
  @apply w-6 h-6 rounded-lg flex items-center justify-center transition-colors;
}

.card-source-cf {
  @apply bg-orange-500/15 text-orange-400;
}

.card-source-linked {
  @apply bg-purple-500/15 text-purple-400;
}

.card-source-shareable {
  @apply bg-cyan-500/15 text-cyan-400;
}

.card-source-unsaved {
  @apply bg-amber-500/15 text-amber-400 animate-pulse;
}

/* Launch Button */
.card-launch-btn {
  @apply h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all;
  @apply bg-primary text-primary-foreground hover:bg-primary/90;
}

/* Running Button */
.card-running-btn {
  @apply h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold;
  @apply bg-primary/15 text-primary;
}

/* Action Button */
.card-action-btn {
  @apply h-9 w-9 rounded-lg flex items-center justify-center transition-all;
  @apply text-muted-foreground hover:text-foreground hover:bg-muted;
}

/* Dropdown */
.card-dropdown {
  @apply absolute right-0 bottom-full mb-1 w-40 rounded-lg py-1 z-[100];
  @apply bg-popover border border-border shadow-xl;
}

.card-dropdown-item {
  @apply w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors;
  @apply text-foreground/80 hover:text-foreground hover:bg-muted;
}

.card-dropdown-danger {
  @apply text-destructive hover:text-destructive hover:bg-destructive/10;
}

.card-dropdown-divider {
  @apply h-px bg-border my-1 mx-2;
}
</style>
