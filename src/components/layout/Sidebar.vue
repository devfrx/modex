<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
  Home,
  Library,
  Package,
  Settings,
  Star,
  Clock,
  FolderTree,
  LayoutGrid,
  X,
  BookOpen,
  BarChart3,
  Search,
  PanelLeftClose,
  PanelLeft,
} from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { ref, onMounted, computed } from "vue";
import { useSidebar } from "@/composables/useSidebar";

defineProps<{
  isOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { settings, enabledItems, toggleCollapsed } = useSidebar();

// Icon mapping
const iconMap: Record<string, any> = {
  Home,
  Library,
  Package,
  FolderTree,
  BarChart3,
  LayoutGrid,
  BookOpen,
};

// Get icon component for an item
function getIcon(iconName: string) {
  return iconMap[iconName] || Package;
}

// Trigger global search by dispatching Ctrl+K event
function triggerSearch() {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    bubbles: true,
  });
  window.dispatchEvent(event);
}

// Stats counters
const modCount = ref(0);
const modpackCount = ref(0);
const favoriteModCount = ref(0);
const favoritePackCount = ref(0);

// Get count for specific items
function getItemCount(itemId: string): number | null {
  if (itemId === "library") return modCount.value > 0 ? modCount.value : null;
  if (itemId === "modpacks") return modpackCount.value > 0 ? modpackCount.value : null;
  return null;
}

async function loadStats() {
  if (!window.api) return;
  try {
    const mods = await window.api.mods.getAll();
    const modpacks = await window.api.modpacks.getAll();
    modCount.value = mods.length;
    modpackCount.value = modpacks.length;

    // Load favorites from localStorage and filter to only existing items
    const modIds = new Set(mods.map((m) => m.id));
    const packIds = new Set(modpacks.map((p) => p.id));

    let favMods: string[] = JSON.parse(
      localStorage.getItem("modex:favorites:mods") || "[]"
    );
    let favPacks: string[] = JSON.parse(
      localStorage.getItem("modex:favorites:modpacks") || "[]"
    );

    // Filter out deleted items and update localStorage
    const validFavMods = favMods.filter((id) => modIds.has(id));
    const validFavPacks = favPacks.filter((id) => packIds.has(id));

    if (validFavMods.length !== favMods.length) {
      localStorage.setItem(
        "modex:favorites:mods",
        JSON.stringify(validFavMods)
      );
    }
    if (validFavPacks.length !== favPacks.length) {
      localStorage.setItem(
        "modex:favorites:modpacks",
        JSON.stringify(validFavPacks)
      );
    }

    favoriteModCount.value = validFavMods.length;
    favoritePackCount.value = validFavPacks.length;
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

function handleNavClick() {
  emit("close");
}

onMounted(() => {
  loadStats();
  // Refresh stats periodically
  setInterval(loadStats, 5000);
});

// Listen for storage changes from other components
window.addEventListener("storage", loadStats);
</script>

<template>
  <div class="h-screen bg-card/40 backdrop-blur-md flex flex-col transition-all duration-300" :class="[
    settings.collapsed ? 'w-16' : 'w-56 sm:w-64',
    settings.position === 'right' ? 'border-l border-border/50' : 'border-r border-border/50'
  ]">
    <!-- Header with close button on mobile -->
    <div class="p-4 border-b border-border/50 flex items-center"
      :class="settings.collapsed ? 'justify-center' : 'justify-between'">
      <div v-if="!settings.collapsed">
        <h1
          class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent filter drop-shadow-sm">
          ModEx
        </h1>
        <p class="text-xs text-muted-foreground mt-1 font-medium bg-primary/10 px-2 py-0.5 rounded-full inline-block">
          Mod Manager
        </p>
      </div>
      <div v-else class="text-xl font-bold text-primary">M</div>
      <button @click="emit('close')"
        class="sm:hidden p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close menu" v-if="!settings.collapsed">
        <X class="w-5 h-5" />
      </button>
    </div>

    <nav class="flex-1 p-2 space-y-1 overflow-auto" :class="settings.collapsed ? 'px-2' : 'px-4'">
      <RouterLink v-for="item in enabledItems" :key="item.id" :to="item.route"
        class="group flex items-center gap-3 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        :class="[
          settings.collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]" active-class="bg-primary/10 text-primary border-primary/20 shadow-sm" @click="handleNavClick"
        :title="settings.collapsed ? item.name : undefined">
        <component :is="getIcon(item.icon)"
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200 shrink-0" />
        <span v-if="!settings.collapsed" class="flex-1">{{ item.name }}</span>
        <span v-if="!settings.collapsed && getItemCount(item.id)"
          class="text-[10px] bg-background/50 border border-border/50 px-2 py-0.5 rounded-full font-mono transition-colors group-hover:border-primary/30">
          {{ getItemCount(item.id) }}
        </span>
      </RouterLink>
    </nav>

    <!-- Search hint -->
    <div class="px-2 py-3 border-t border-border/50" :class="settings.collapsed ? 'px-2' : 'px-4'">
      <button
        class="w-full flex items-center rounded-lg bg-muted/50 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border transition-all text-sm"
        :class="settings.collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'" @click="triggerSearch"
        :title="settings.collapsed ? 'Search (Ctrl+K)' : undefined">
        <Search class="w-4 h-4 shrink-0" />
        <template v-if="!settings.collapsed">
          <span class="flex-1 text-left">Search...</span>
          <span class="flex items-center gap-0.5 text-[10px]">
            <kbd class="px-1 py-0.5 bg-background rounded border border-border/70 font-mono">Ctrl</kbd>
            <kbd class="px-1 py-0.5 bg-background rounded border border-border/70 font-mono">K</kbd>
          </span>
        </template>
      </button>
    </div>

    <!-- Collapse toggle & Settings -->
    <div class="p-2 border-t border-border/50 space-y-1" :class="settings.collapsed ? 'px-2' : 'px-4'">
      <!-- Collapse toggle -->
      <button @click="toggleCollapsed"
        class="w-full flex items-center gap-3 rounded-xl transition-all duration-200 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        :class="settings.collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2'"
        :title="settings.collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
        <component :is="settings.collapsed ? PanelLeft : PanelLeftClose" class="w-5 h-5 shrink-0" />
        <span v-if="!settings.collapsed">Collapse</span>
      </button>

      <RouterLink to="/settings"
        class="group flex items-center gap-3 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        :class="[
          settings.collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5',
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]" active-class="bg-primary/10 text-primary border-primary/20 shadow-sm" @click="handleNavClick"
        :title="settings.collapsed ? 'Settings' : undefined">
        <Settings class="w-5 h-5 transition-transform group-hover:scale-110 duration-200 shrink-0" />
        <span v-if="!settings.collapsed">Settings</span>
      </RouterLink>
    </div>
  </div>
</template>
