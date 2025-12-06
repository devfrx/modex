<script setup lang="ts">
import {
  Package,
  Trash2,
  Edit,
  Check,
  Image,
  Copy,
  FolderOpen,
  Star,
  Share2,
  RefreshCw,
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
  modCount: number;
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
</script>

<template>
  <div
    class="glass-card relative rounded-lg group transition-all duration-200"
    :class="{ 'ring-2 ring-primary bg-primary/5': selected }"
    @click="$emit('toggle-select', modpack.id)"
  >
    <!-- Image Background -->
    <div
      v-if="modpack.image_url"
      class="absolute inset-0 z-0 overflow-hidden rounded-lg"
    >
      <img
        :src="'atom:///' + modpack.image_url.replace(/\\\\/g, '/')"
        class="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity"
        alt=""
        @error="handleImageError"
      />
      <div
        class="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent"
      />
    </div>

    <!-- Hover Gradient Effect (no image) -->
    <div
      v-else
      class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
    />

    <!-- Favorite Button -->
    <button
      class="absolute top-3 left-3 z-20 transition-all duration-200"
      :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      @click.stop="$emit('toggle-favorite', modpack.id)"
      title="Toggle favorite"
    >
      <Star
        class="w-5 h-5 transition-colors"
        :class="
          favorite
            ? 'fill-yellow-500 text-yellow-500'
            : 'text-muted-foreground hover:text-yellow-500'
        "
      />
    </button>

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

    <div class="relative z-10 p-4">
      <div class="flex items-start justify-between mb-3">
        <div
          class="p-2.5 backdrop-blur-sm rounded-xl group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300"
          :class="modpack.image_url ? 'bg-background/50' : 'bg-secondary/50'"
        >
          <Package v-if="!modpack.image_url" class="w-6 h-6" />
          <Image v-else class="w-6 h-6" />
        </div>
      </div>

      <h3
        class="font-semibold text-lg mb-1 line-clamp-1 tracking-tight group-hover:text-primary transition-colors pr-6"
      >
        {{ modpack.name }}
      </h3>

      <p class="text-sm text-muted-foreground line-clamp-2 mb-3 min-h-[2.5rem]">
        {{ modpack.description || "No description available" }}
      </p>

      <!-- Info Row: Mod count + Version/Loader badges -->
      <div class="flex items-center gap-2 flex-wrap text-xs mb-3">
        <div class="flex items-center gap-1.5 text-muted-foreground">
          <span class="w-1.5 h-1.5 rounded-full bg-primary/50" />
          <span class="text-foreground font-medium">{{
            modpack.modCount
          }}</span>
          mods
        </div>
        <span
          v-if="modpack.minecraft_version"
          class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-medium"
        >
          {{ modpack.minecraft_version }}
        </span>
        <span
          v-if="modpack.loader"
          class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium capitalize"
        >
          {{ modpack.loader }}
        </span>
      </div>

      <!-- Actions Row -->
      <div
        class="flex items-center justify-end gap-1 pt-3 border-t border-white/5"
        @click.stop
      >
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-primary"
          @click.stop="$emit('edit', modpack.id)"
          title="Edit"
        >
          <Edit class="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-blue-400"
          @click.stop="$emit('clone', modpack.id)"
          title="Clone"
        >
          <Copy class="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-purple-500"
          @click.stop="$emit('convert', modpack.id)"
          title="Convert to different version"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-green-500"
          @click.stop="$emit('share', modpack.id, modpack.name)"
          title="Share (.modex)"
        >
          <Share2 class="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-yellow-500"
          @click.stop="$emit('open-folder', modpack.id)"
          title="Open in Explorer"
        >
          <FolderOpen class="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-destructive"
          @click.stop="$emit('delete', modpack.id)"
          title="Delete"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
