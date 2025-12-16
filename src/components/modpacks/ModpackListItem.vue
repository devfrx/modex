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
    Calendar,
    Flame,
    Globe,
    MoreHorizontal,
} from "lucide-vue-next";
import { ref } from "vue";

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
    cf_project_id?: number;
    cf_file_id?: number;
    cf_slug?: string;
    share_code?: string;
}

defineProps<{
    modpack: ModpackWithCount;
    selected?: boolean;
    favorite?: boolean;
    visibleColumns?: Set<string>;
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

const showActions = ref(false);

function handleImageError(event: Event) {
    const target = event.target as HTMLImageElement;
    target.style.display = "none";
}

function formatDate(dateStr?: string) {
    if (!dateStr) return "Unknown";
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString();
    } catch {
        return "Unknown";
    }
}

function getLoaderColor(loader?: string) {
    const colors: Record<string, string> = {
        forge: "text-orange-400 bg-orange-500/20",
        fabric: "text-yellow-400 bg-yellow-500/20",
        neoforge: "text-red-400 bg-red-500/20",
        quilt: "text-purple-400 bg-purple-500/20",
    };
    return colors[loader?.toLowerCase() || ""] || "text-gray-400 bg-gray-500/20";
}
</script>

<template>
    <div class="group flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-muted/50 border border-transparent"
        :class="{ 'bg-primary/10 border-primary/30': selected }" @click="$emit('toggle-select', modpack.id)">
        <!-- Checkbox -->
        <div class="flex-shrink-0">
            <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer"
                :class="selected ? 'bg-primary border-primary' : 'border-border hover:border-primary'">
                <Check v-if="selected" class="w-3 h-3 text-primary-foreground" />
            </div>
        </div>

        <!-- Image -->
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-muted/50 overflow-hidden border border-border">
            <img v-if="modpack.image_url" :src="modpack.image_url.startsWith('http') || modpack.image_url.startsWith('file:')
                ? modpack.image_url
                : 'atom:///' + modpack.image_url.replace(/\\/g, '/')" class="w-full h-full object-cover" alt=""
                @error="handleImageError" />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package class="w-5 h-5" />
            </div>
        </div>

        <!-- Name & Description -->
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
                <span class="font-medium text-sm truncate">{{ modpack.name }}</span>
                <button v-if="favorite" class="flex-shrink-0" @click.stop="$emit('toggle-favorite', modpack.id)">
                    <Heart class="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                </button>
                <span v-if="modpack.cf_project_id" class="flex-shrink-0">
                    <Flame class="w-3.5 h-3.5 text-orange-500" />
                </span>
            </div>
            <p class="text-xs text-muted-foreground truncate mt-0.5">
                {{ modpack.description || "No description" }}
            </p>
        </div>

        <!-- MC Version -->
        <div class="hidden sm:flex flex-shrink-0 w-20 text-center">
            <span class="text-xs px-2 py-1 rounded bg-muted text-foreground">
                {{ modpack.minecraft_version || "?" }}
            </span>
        </div>

        <!-- Loader -->
        <div class="hidden md:flex flex-shrink-0 w-20 text-center">
            <span class="text-xs px-2 py-1 rounded capitalize" :class="getLoaderColor(modpack.loader)">
                {{ modpack.loader || "?" }}
            </span>
        </div>

        <!-- Mod Count -->
        <div class="hidden lg:flex flex-shrink-0 w-16 text-center">
            <span class="text-xs text-muted-foreground">{{ modpack.modCount }} mods</span>
        </div>

        <!-- Date -->
        <div class="hidden xl:flex flex-shrink-0 w-24 text-xs text-muted-foreground">
            {{ formatDate(modpack.updated_at || modpack.created_at) }}
        </div>

        <!-- Favorite Button (hidden, shows on hover) -->
        <button class="flex-shrink-0 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-muted"
            :class="{ 'opacity-100': favorite }" @click.stop="$emit('toggle-favorite', modpack.id)">
            <Heart class="w-4 h-4"
                :class="favorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-500'" />
        </button>

        <!-- Actions -->
        <div class="flex-shrink-0 relative">
            <button class="p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-muted"
                @click.stop="showActions = !showActions">
                <MoreHorizontal class="w-4 h-4 text-muted-foreground" />
            </button>

            <!-- Dropdown -->
            <Transition name="fade">
                <div v-if="showActions"
                    class="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl z-50 bg-popover border border-border py-1"
                    @mouseleave="showActions = false">
                    <button class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted"
                        @click.stop="$emit('edit', modpack.id); showActions = false">
                        <Edit class="w-4 h-4" /> Edit
                    </button>
                    <button class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted"
                        @click.stop="$emit('clone', modpack.id); showActions = false">
                        <Copy class="w-4 h-4" /> Duplicate
                    </button>
                    <button class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted"
                        @click.stop="$emit('open-folder', modpack.id); showActions = false">
                        <FolderOpen class="w-4 h-4" /> Open Folder
                    </button>
                    <button class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted"
                        @click.stop="$emit('share', modpack.id, modpack.name); showActions = false">
                        <Share2 class="w-4 h-4" /> Share
                    </button>
                    <button class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-muted"
                        @click.stop="$emit('convert', modpack.id); showActions = false">
                        <RefreshCw class="w-4 h-4" /> Convert
                    </button>
                    <hr class="my-1 border-border" />
                    <button
                        class="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-destructive/10 text-destructive"
                        @click.stop="$emit('delete', modpack.id); showActions = false">
                        <Trash2 class="w-4 h-4" /> Delete
                    </button>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
