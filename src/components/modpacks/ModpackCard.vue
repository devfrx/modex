<script setup lang="ts">
import {
  Package,
  Trash2,
  Edit,
  Check,
  Image,
  Copy,
  FolderOpen,
  Heart,
  Share2,
  RefreshCw,
  Clock,
  Flame,
  Globe,
  Link2,
  Play,
  MoreHorizontal,
  CircleDot,
} from "lucide-vue-next";
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";

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

defineProps<{
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

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = "none";
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "Unknown";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

function closeMoreActions() {
  showMoreActions.value = false;
}
</script>

<template>
  <div
    class="glass-card relative rounded-xl group transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
    :class="{ 'ring-2 ring-primary bg-primary/5': selected }" @click="$emit('toggle-select', modpack.id)"
    @mouseleave="closeMoreActions">
    <!-- Image Background -->
    <div v-if="modpack.image_url" class="absolute inset-0 z-0 overflow-hidden rounded-xl">
      <img :src="modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
        ? modpack.image_url
        : 'atom:///' + modpack.image_url.replace(/\\/g, '/')"
        class="w-full h-full object-cover opacity-25 group-hover:opacity-35 transition-all duration-500 scale-100 group-hover:scale-105"
        alt="" @error="handleImageError" />
      <div class="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
    </div>

    <!-- Hover Gradient Effect (no image) -->
    <div v-else
      class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />

    <!-- Running Indicator Border -->
    <div v-if="isRunning"
      class="absolute inset-0 rounded-xl ring-2 ring-green-500 ring-offset-2 ring-offset-background animate-pulse pointer-events-none z-30" />

    <!-- Top Bar: Favorite + Selection -->
    <div class="absolute top-3 left-3 right-3 z-20 flex items-center justify-between">
      <!-- Running Badge or Favorite Button -->
      <div v-if="isRunning"
        class="px-2 py-1 rounded-full bg-green-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg">
        <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
        RUNNING
      </div>
      <button v-else
        class="transition-all duration-200 p-2 rounded-full bg-background/60 backdrop-blur-md border border-white/10 hover:bg-background/80 hover:scale-110"
        :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        @click.stop="$emit('toggle-favorite', modpack.id)" title="Toggle favorite">
        <Heart class="w-4 h-4 transition-colors"
          :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-500'" />
      </button>

      <!-- Selection Checkbox -->
      <div class="transition-all duration-200" :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
        <div
          class="w-6 h-6 rounded-md border flex items-center justify-center transition-colors shadow-sm backdrop-blur-md"
          :class="selected ? 'bg-primary border-primary' : 'bg-background/60 border-border hover:border-primary'">
          <Check v-if="selected" class="w-4 h-4 text-primary-foreground" />
        </div>
      </div>
    </div>

    <div class="relative z-10 p-5 flex flex-col h-full">
      <!-- Header with Icon -->
      <div class="flex items-start gap-3 mb-3">
        <div
          class="shrink-0 p-2.5 backdrop-blur-md rounded-xl transition-all duration-300 shadow-sm border border-white/5"
          :class="modpack.image_url ? 'bg-background/50' : 'bg-secondary/50'">
          <Package v-if="!modpack.image_url" class="w-5 h-5 text-muted-foreground" />
          <Image v-else class="w-5 h-5 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0 pt-0.5">
          <h3 class="font-bold text-base line-clamp-1 tracking-tight group-hover:text-primary transition-colors">
            {{ modpack.name }}
          </h3>
          <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            <Clock class="w-3 h-3" />
            <span>{{ formatDate(modpack.updated_at || modpack.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Description -->
      <p class="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed flex-1">
        {{ modpack.description || "No description available" }}
      </p>

      <!-- Tags Row -->
      <div class="flex items-center gap-1.5 flex-wrap mb-4">
        <!-- Mod count -->
        <div class="flex items-center gap-1.5 text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md text-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-primary" />
          <span class="text-foreground font-medium">{{ modpack.modCount }}</span>
          <span class="text-[10px]">mods</span>
        </div>

        <!-- MC Version -->
        <span v-if="modpack.minecraft_version"
          class="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
          {{ modpack.minecraft_version }}
        </span>

        <!-- Loader -->
        <span v-if="modpack.loader"
          class="px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium capitalize border border-blue-500/20">
          {{ modpack.loader }}
        </span>

        <!-- CurseForge source -->
        <span v-if="modpack.cf_project_id"
          class="px-1.5 py-1 rounded-md bg-orange-500/10 text-orange-500 text-[10px] font-medium border border-orange-500/20 flex items-center gap-0.5"
          title="Imported from CurseForge">
          <Flame class="w-3 h-3" />
        </span>

        <!-- Linked with Gist -->
        <span v-if="modpack.remote_source?.url"
          class="px-1.5 py-1 rounded-md bg-purple-500/10 text-purple-500 text-[10px] font-medium border border-purple-500/20 flex items-center gap-0.5"
          title="Linked with remote Gist - receives updates">
          <Link2 class="w-3 h-3" />
        </span>

        <!-- Shareable -->
        <span v-else-if="modpack.share_code"
          class="px-1.5 py-1 rounded-md bg-cyan-500/10 text-cyan-500 text-[10px] font-medium border border-cyan-500/20 flex items-center gap-0.5"
          title="Has share code - can be shared via Gist">
          <Globe class="w-3 h-3" />
        </span>

        <!-- Unsaved Changes -->
        <span v-if="modpack.hasUnsavedChanges"
          class="px-1.5 py-1 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[10px] font-medium border border-yellow-500/20 flex items-center gap-0.5"
          title="Unsaved config changes - commit a new version to save">
          <CircleDot class="w-3 h-3" />
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="pt-3 border-t border-border/30 flex items-center gap-2" @click.stop>
        <!-- Primary: Play Button (disabled/different when running) -->
        <Button v-if="!isRunning" variant="default" size="sm"
          class="gap-1.5 h-9 px-4 flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20 border-0"
          @click.stop="$emit('play', modpack.id)" title="Play Modpack">
          <Play class="w-4 h-4 fill-current" />
          <span class="font-medium">Play</span>
        </Button>
        <!-- Running state: Show running indicator instead of play -->
        <div v-else
          class="gap-1.5 h-9 px-4 flex-1 flex items-center justify-center bg-gradient-to-r from-green-600/80 to-green-500/80 text-white rounded-md cursor-not-allowed">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span class="font-medium text-sm">Running...</span>
        </div>

        <!-- Secondary Actions -->
        <Button variant="ghost" size="icon"
          class="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
          @click.stop="$emit('edit', modpack.id)" title="Edit Modpack">
          <Edit class="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="icon"
          class="h-9 w-9 text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 rounded-lg"
          @click.stop="$emit('share', modpack.id, modpack.name)" title="Share / Export">
          <Share2 class="w-4 h-4" />
        </Button>

        <!-- More Actions Dropdown -->
        <div class="relative">
          <Button variant="ghost" size="icon"
            class="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
            @click.stop="showMoreActions = !showMoreActions" title="More actions">
            <MoreHorizontal class="w-4 h-4" />
          </Button>

          <!-- Dropdown Menu -->
          <Transition enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in" leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0">
            <div v-if="showMoreActions"
              class="absolute right-0 top-full mt-2 w-44 rounded-lg bg-popover border border-border shadow-xl z-[100] py-1 overflow-hidden">
              <button
                class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-accent transition-colors"
                @click.stop="$emit('open-folder', modpack.id); closeMoreActions()">
                <FolderOpen class="w-4 h-4 text-muted-foreground" />
                Open Folder
              </button>
              <button
                class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-accent transition-colors"
                @click.stop="$emit('clone', modpack.id); closeMoreActions()">
                <Copy class="w-4 h-4 text-muted-foreground" />
                Clone
              </button>
              <button
                class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-accent transition-colors"
                @click.stop="$emit('convert', modpack.id); closeMoreActions()">
                <RefreshCw class="w-4 h-4 text-muted-foreground" />
                Convert Version
              </button>
              <div class="h-px bg-border my-1" />
              <button
                class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-destructive/10 text-destructive transition-colors"
                @click.stop="$emit('delete', modpack.id); closeMoreActions()">
                <Trash2 class="w-4 h-4" />
                Delete
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>
