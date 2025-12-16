<script setup lang="ts">
import { Package, Heart, Check, Flame } from "lucide-vue-next";

interface ModpackWithCount {
    id: string;
    name: string;
    version: string;
    minecraft_version?: string;
    loader?: string;
    description?: string;
    image_url?: string;
    modCount: number;
    cf_project_id?: number;
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
    (e: "toggle-favorite", id: string): void;
}>();

function handleImageError(event: Event) {
    const target = event.target as HTMLImageElement;
    target.style.display = "none";
}

function getLoaderColor(loader?: string) {
    const colors: Record<string, string> = {
        forge: "bg-orange-500",
        fabric: "bg-yellow-500",
        neoforge: "bg-red-500",
        quilt: "bg-purple-500",
    };
    return colors[loader?.toLowerCase() || ""] || "bg-gray-500";
}
</script>

<template>
    <div class="group relative p-3 rounded-lg transition-all duration-200 hover:bg-muted/50 border cursor-pointer"
        :class="selected ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:border-border'"
        @click="$emit('toggle-select', modpack.id)" @dblclick.stop="$emit('edit', modpack.id)">
        <!-- Selection Indicator -->
        <div class="absolute top-2 right-2 z-10 transition-all duration-200"
            :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
            <div class="w-5 h-5 rounded border flex items-center justify-center"
                :class="selected ? 'bg-primary border-primary' : 'bg-background/80 border-border'">
                <Check v-if="selected" class="w-3 h-3 text-primary-foreground" />
            </div>
        </div>

        <!-- Favorite Button -->
        <button class="absolute top-2 left-2 z-10 p-1 rounded-full transition-all"
            :class="favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            @click.stop="$emit('toggle-favorite', modpack.id)">
            <Heart class="w-3.5 h-3.5"
                :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-500'" />
        </button>

        <!-- Image / Icon -->
        <div class="w-12 h-12 mx-auto mb-2 rounded-lg bg-muted/50 overflow-hidden border border-border/50">
            <img v-if="modpack.image_url" :src="modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
                ? modpack.image_url
                : 'atom:///' + modpack.image_url.replace(/\\/g, '/')" class="w-full h-full object-cover" alt=""
                @error="handleImageError" />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package class="w-6 h-6" />
            </div>
        </div>

        <!-- Name -->
        <div class="text-center">
            <div class="flex items-center justify-center gap-1 mb-1">
                <span class="text-sm font-medium truncate max-w-[100px]">{{ modpack.name }}</span>
                <Flame v-if="modpack.cf_project_id" class="w-3 h-3 text-orange-500 flex-shrink-0" />
            </div>

            <!-- Info Row -->
            <div class="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <span class="w-1.5 h-1.5 rounded-full" :class="getLoaderColor(modpack.loader)"></span>
                <span>{{ modpack.minecraft_version || "?" }}</span>
                <span class="opacity-50">•</span>
                <span>{{ modpack.modCount }} mods</span>
            </div>
        </div>
    </div>
</template>
