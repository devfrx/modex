<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
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
} from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { ref, onMounted, watch } from "vue";

defineProps<{
  isOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// Stats counters
const modCount = ref(0);
const modpackCount = ref(0);
const favoriteModCount = ref(0);
const favoritePackCount = ref(0);

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
  <div
    class="h-screen w-56 sm:w-64 bg-card/40 backdrop-blur-md border-r border-border/50 flex flex-col transition-all duration-300"
  >
    <!-- Header with close button on mobile -->
    <div
      class="p-6 border-b border-border/50 flex items-center justify-between"
    >
      <div>
        <h1
          class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent filter drop-shadow-sm"
        >
          ModEx
        </h1>
        <p
          class="text-xs text-muted-foreground mt-1 font-medium bg-primary/10 px-2 py-0.5 rounded-full inline-block"
        >
          Mod Manager
        </p>
      </div>
      <button
        @click="emit('close')"
        class="sm:hidden p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close menu"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <nav class="flex-1 p-4 space-y-2 overflow-auto">
      <RouterLink
        to="/library"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <Library
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Library</span>
        <span
          v-if="modCount > 0"
          class="text-[10px] bg-background/50 border border-border/50 px-2 py-0.5 rounded-full font-mono transition-colors group-hover:border-primary/30"
          >{{ modCount }}</span
        >
      </RouterLink>
      <RouterLink
        to="/modpacks"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <Package
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Modpacks</span>
        <span
          v-if="modpackCount > 0"
          class="text-[10px] bg-background/50 border border-border/50 px-2 py-0.5 rounded-full font-mono transition-colors group-hover:border-primary/30"
          >{{ modpackCount }}</span
        >
      </RouterLink>
      <RouterLink
        to="/organize"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <FolderTree
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Organize</span>
      </RouterLink>
      <RouterLink
        to="/stats"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <BarChart3
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Statistics</span>
      </RouterLink>
      <RouterLink
        to="/sandbox"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <LayoutGrid
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Sandbox</span>
      </RouterLink>
      <RouterLink
        to="/guide"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <BookOpen
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        <span class="flex-1">Guide</span>
      </RouterLink>
    </nav>
    <div class="p-4 border-t border-border/50">
      <RouterLink
        to="/settings"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium border border-transparent"
        active-class="bg-primary/10 text-primary border-primary/20 shadow-sm"
        :class="[
          'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        ]"
        @click="handleNavClick"
      >
        <Settings
          class="w-5 h-5 transition-transform group-hover:scale-110 duration-200"
        />
        Settings
      </RouterLink>
    </div>
  </div>
</template>
