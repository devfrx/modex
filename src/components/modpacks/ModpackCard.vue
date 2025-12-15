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
  Calendar,
  Clock,
  Flame,
  Globe,
  Link2,
} from "lucide-vue-next";
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
}

defineProps<{
  modpack: ModpackWithCount;
  selected?: boolean;
  favorite?: boolean;
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
}>();

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
</script>

<template>
  <div
    class="glass-card relative rounded-xl group transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
    :class="{ 'ring-2 ring-primary bg-primary/5': selected }" @click="$emit('toggle-select', modpack.id)">
    <!-- Image Background -->
    <div v-if="modpack.image_url" class="absolute inset-0 z-0 overflow-hidden rounded-xl">
      <img :src="modpack.image_url.startsWith('http') ||
        modpack.image_url.startsWith('file:')
        ? modpack.image_url
        : 'atom:///' + modpack.image_url.replace(/\\/g, '/')
        "
        class="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-all duration-500 scale-100 group-hover:scale-105"
        alt="" @error="handleImageError" />
      <div class="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
    </div>

    <!-- Hover Gradient Effect (no image) -->
    <div v-else
      class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />

    <!-- Favorite Button -->
    <button
      class="absolute top-3 left-3 z-20 transition-all duration-200 p-2 rounded-full bg-background/40 backdrop-blur-md border border-white/10 hover:bg-background/60 hover:scale-110"
      :class="favorite
        ? 'opacity-100 scale-100'
        : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
        " @click.stop="$emit('toggle-favorite', modpack.id)" title="Toggle favorite">
      <Heart class="w-4 h-4 transition-colors" :class="favorite
        ? 'fill-rose-500 text-rose-500'
        : 'text-muted-foreground hover:text-rose-500'
        " />
    </button>

    <!-- Selection Checkbox -->
    <div class="absolute top-3 right-3 z-20 transition-all duration-200"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
      <div class="w-6 h-6 rounded-md border flex items-center justify-center transition-colors shadow-sm" :class="selected
        ? 'bg-primary border-primary'
        : 'bg-background/50 border-border hover:border-primary'
        ">
        <Check v-if="selected" class="w-4 h-4 text-primary-foreground" />
      </div>
    </div>

    <div class="relative z-10 p-5 flex flex-col h-full">
      <div class="flex items-start justify-between mb-4">
        <div
          class="p-3 backdrop-blur-md rounded-2xl group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300 shadow-sm border border-white/5"
          :class="modpack.image_url ? 'bg-background/40' : 'bg-secondary/40'">
          <Package v-if="!modpack.image_url" class="w-6 h-6" />
          <Image v-else class="w-6 h-6" />
        </div>
      </div>

      <div class="flex-1">
        <h3
          class="font-bold text-lg mb-1.5 line-clamp-1 tracking-tight group-hover:text-primary transition-colors pr-6">
          {{ modpack.name }}
        </h3>

        <p class="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
          {{ modpack.description || "No description available" }}
        </p>

        <!-- Info Row -->
        <div class="flex items-center gap-2 flex-wrap text-xs mb-4">
          <div class="flex items-center gap-2 text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
            <span class="w-1.5 h-1.5 rounded-full bg-primary" />
            <span class="text-foreground font-medium">{{
              modpack.modCount
            }}</span>
            mods
          </div>
          <span v-if="modpack.minecraft_version"
            class="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
            {{ modpack.minecraft_version }}
          </span>
          <span v-if="modpack.loader"
            class="px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium capitalize border border-blue-500/20">
            {{ modpack.loader }}
          </span>
          <!-- Source indicators -->
          <span v-if="modpack.cf_project_id"
            class="px-2 py-1 rounded-md bg-orange-500/10 text-orange-500 text-[10px] font-medium border border-orange-500/20 flex items-center gap-1"
            title="Imported from CurseForge">
            <Flame class="w-3 h-3" />
            CF
          </span>
          <span v-if="modpack.share_code"
            class="px-2 py-1 rounded-md bg-purple-500/10 text-purple-500 text-[10px] font-medium border border-purple-500/20 flex items-center gap-1"
            title="Linked with Gist">
            <Link2 class="w-3 h-3" />
            Gist
          </span>
        </div>
      </div>

      <!-- Footer: Dates & Actions -->
      <div class="pt-4 border-t border-border/50 flex items-center justify-between">
        <div class="flex flex-col gap-0.5 text-[10px] text-muted-foreground opacity-70">
          <div class="flex items-center gap-1.5">
            <Clock class="w-3 h-3" />
            <span>{{
              formatDate(modpack.updated_at || modpack.created_at)
            }}</span>
          </div>
        </div>

        <div class="flex items-center gap-1" @click.stop>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            @click.stop="$emit('open-folder', modpack.id)" title="Open Folder">
            <FolderOpen class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 rounded-lg transition-colors"
            @click.stop="$emit('share', modpack.id, modpack.name)" title="Share / Export">
            <Share2 class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-cyan-500 hover:bg-cyan-500/10 rounded-lg transition-colors"
            @click.stop="$emit('clone', modpack.id)"
            :title="modpack.cf_project_id ? 'Clone (detach from CurseForge)' : 'Clone Modpack'">
            <Copy class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
            @click.stop="$emit('convert', modpack.id)" title="Convert to different version/loader">
            <RefreshCw class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            @click.stop="$emit('edit', modpack.id)" title="Edit">
            <Edit class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            @click.stop="$emit('delete', modpack.id)" title="Delete">
            <Trash2 class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
