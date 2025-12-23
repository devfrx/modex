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
    class="relative rounded-lg bg-card border border-border/40 group transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
    :class="{ 'ring-2 ring-primary bg-primary/5': selected }" @click="$emit('toggle-select', modpack.id)"
    @mouseleave="closeMoreActions">
    <!-- Image Background -->
    <div v-if="modpack.image_url" class="absolute inset-0 z-0 overflow-hidden rounded-lg">
      <img :src="modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
        ? modpack.image_url
        : 'atom:///' + modpack.image_url.replace(/\\/g, '/')"
        class="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-all duration-300" alt=""
        @error="handleImageError" />
      <div class="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/50" />
    </div>

    <!-- Running Indicator Border -->
    <div v-if="isRunning"
      class="absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse pointer-events-none z-30" />

    <!-- Top Bar: Favorite + Selection -->
    <div class="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between">
      <!-- Running Badge or Favorite Button -->
      <div v-if="isRunning"
        class="px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold flex items-center gap-1 shadow-md">
        <span class="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse"></span>
        RUNNING
      </div>
      <button v-else
        class="transition-all duration-150 p-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border/40 hover:bg-card hover:border-border"
        :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        @click.stop="$emit('toggle-favorite', modpack.id)" title="Toggle favorite">
        <Heart class="w-3.5 h-3.5 transition-colors"
          :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-500'" />
      </button>

      <!-- Selection Checkbox -->
      <div class="transition-all duration-150" :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
        <div class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors backdrop-blur-sm"
          :class="selected ? 'bg-primary border-primary' : 'bg-card/80 border-border/50 hover:border-primary/50'">
          <Check v-if="selected" class="w-3 h-3 text-primary-foreground" />
        </div>
      </div>
    </div>

    <div class="relative z-10 p-4 flex flex-col h-full">
      <!-- Header with Icon -->
      <div class="flex items-start gap-2.5 mb-2 mt-6">
        <div class="shrink-0 p-2 rounded-md transition-all duration-200 border border-border/30"
          :class="modpack.image_url ? 'bg-card/60' : 'bg-muted/50'">
          <Package v-if="!modpack.image_url" class="w-4 h-4 text-muted-foreground" />
          <Image v-else class="w-4 h-4 text-muted-foreground" />
        </div>
        <div class="flex-1 min-w-0 pt-0.5">
          <h3 class="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {{ modpack.name }}
          </h3>
          <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            <Clock class="w-3 h-3" />
            <span>{{ formatDate(modpack.updated_at || modpack.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Description -->
      <p class="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed flex-1">
        {{ modpack.description || "No description available" }}
      </p>

      <!-- Tags Row -->
      <div class="flex items-center gap-1 flex-wrap mb-3">
        <!-- Mod count -->
        <div class="flex items-center gap-1 text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
          <span class="w-1 h-1 rounded-full bg-primary" />
          <span class="text-foreground font-medium">{{ modpack.modCount }}</span>
          <span>mods</span>
        </div>

        <!-- MC Version -->
        <span v-if="modpack.minecraft_version"
          class="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
          {{ modpack.minecraft_version }}
        </span>

        <!-- Loader -->
        <span v-if="modpack.loader"
          class="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground text-[10px] font-medium capitalize">
          {{ modpack.loader }}
        </span>

        <!-- CurseForge source -->
        <span v-if="modpack.cf_project_id"
          class="px-1 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[10px] flex items-center gap-0.5"
          title="Imported from CurseForge">
          <Flame class="w-2.5 h-2.5" />
        </span>

        <!-- Linked with Gist -->
        <span v-if="modpack.remote_source?.url"
          class="px-1 py-0.5 rounded bg-purple-500/10 text-purple-500 text-[10px] flex items-center gap-0.5"
          title="Linked with remote Gist - receives updates">
          <Link2 class="w-2.5 h-2.5" />
        </span>

        <!-- Shareable -->
        <span v-else-if="modpack.share_code"
          class="px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-500 text-[10px] flex items-center gap-0.5"
          title="Has share code - can be shared via Gist">
          <Globe class="w-2.5 h-2.5" />
        </span>

        <!-- Unsaved Changes -->
        <span v-if="modpack.hasUnsavedChanges"
          class="px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-[10px] flex items-center gap-0.5"
          title="Unsaved config changes - commit a new version to save">
          <CircleDot class="w-2.5 h-2.5" />
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="pt-3 border-t border-border/30 flex items-center gap-1.5" @click.stop>
        <!-- Primary: Play Button (disabled/different when running) -->
        <Button v-if="!isRunning" variant="default" size="sm" class="gap-1.5 h-8 px-3 flex-1 text-xs"
          @click.stop="$emit('play', modpack.id)" title="Play Modpack">
          <Play class="w-3.5 h-3.5 fill-current" />
          <span class="font-medium">Play</span>
        </Button>
        <!-- Running state: Show running indicator instead of play -->
        <div v-else
          class="gap-1.5 h-8 px-3 flex-1 flex items-center justify-center bg-primary/20 text-primary rounded-md cursor-not-allowed text-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span class="font-medium">Running...</span>
        </div>

        <!-- Secondary Actions -->
        <Button variant="ghost" size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
          @click.stop="$emit('edit', modpack.id)" title="Edit Modpack">
          <Edit class="w-3.5 h-3.5" />
        </Button>

        <Button variant="ghost" size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
          @click.stop="$emit('share', modpack.id, modpack.name)" title="Share / Export">
          <Share2 class="w-3.5 h-3.5" />
        </Button>

        <!-- More Actions Dropdown -->
        <div class="relative">
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
            @click.stop="showMoreActions = !showMoreActions" title="More actions">
            <MoreHorizontal class="w-3.5 h-3.5" />
          </Button>

          <!-- Dropdown Menu -->
          <Transition enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in" leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0">
            <div v-if="showMoreActions"
              class="absolute right-0 top-full mt-1 w-40 rounded-lg bg-card/95 backdrop-blur-xl border border-border/50 shadow-xl shadow-black/20 z-[100] py-1 overflow-hidden">
              <button
                class="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
                @click.stop="$emit('open-folder', modpack.id); closeMoreActions()">
                <FolderOpen class="w-3.5 h-3.5 text-muted-foreground" />
                Open Folder
              </button>
              <button
                class="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
                @click.stop="$emit('clone', modpack.id); closeMoreActions()">
                <Copy class="w-3.5 h-3.5 text-muted-foreground" />
                Clone
              </button>
              <button
                class="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors"
                @click.stop="$emit('convert', modpack.id); closeMoreActions()">
                <RefreshCw class="w-3.5 h-3.5 text-muted-foreground" />
                Convert Version
              </button>
              <div class="h-px bg-border/50 my-1" />
              <button
                class="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-destructive/10 text-destructive transition-colors"
                @click.stop="$emit('delete', modpack.id); closeMoreActions()">
                <Trash2 class="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>
