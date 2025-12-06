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
  <div class="h-screen w-56 sm:w-64 bg-card border-r flex flex-col">
    <!-- Header with close button on mobile -->
    <div class="p-4 sm:p-6 border-b flex items-center justify-between">
      <div>
        <h1
          class="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent"
        >
          ModEx
        </h1>
        <p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
          Mod Manager
        </p>
      </div>
      <button
        @click="emit('close')"
        class="sm:hidden p-1.5 rounded-md hover:bg-accent transition-colors"
        aria-label="Close menu"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    <nav class="flex-1 p-3 sm:p-4 space-y-1.5 sm:space-y-2 overflow-auto">
      <RouterLink
        to="/library"
        class="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        active-class="bg-accent text-accent-foreground"
        @click="handleNavClick"
      >
        <Library class="w-4 h-4 sm:w-5 sm:h-5" />
        <span class="flex-1">Library</span>
        <span
          v-if="modCount > 0"
          class="text-[10px] sm:text-xs bg-muted px-1.5 sm:px-2 py-0.5 rounded-full"
          >{{ modCount }}</span
        >
      </RouterLink>
      <RouterLink
        to="/modpacks"
        class="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        active-class="bg-accent text-accent-foreground"
        @click="handleNavClick"
      >
        <Package class="w-4 h-4 sm:w-5 sm:h-5" />
        <span class="flex-1">Modpacks</span>
        <span
          v-if="modpackCount > 0"
          class="text-[10px] sm:text-xs bg-muted px-1.5 sm:px-2 py-0.5 rounded-full"
          >{{ modpackCount }}</span
        >
      </RouterLink>
      <RouterLink
        to="/organize"
        class="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        active-class="bg-accent text-accent-foreground"
        @click="handleNavClick"
      >
        <FolderTree class="w-4 h-4 sm:w-5 sm:h-5" />
        <span class="flex-1">Organize</span>
      </RouterLink>
      <RouterLink
        to="/sandbox"
        class="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        active-class="bg-accent text-accent-foreground"
        @click="handleNavClick"
      >
        <LayoutGrid class="w-4 h-4 sm:w-5 sm:h-5" />
        <span class="flex-1">Sandbox</span>
      </RouterLink>
    </nav>
    <div class="p-3 sm:p-4 border-t">
      <RouterLink
        to="/settings"
        class="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 w-full rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        active-class="bg-accent text-accent-foreground"
        @click="handleNavClick"
      >
        <Settings class="w-4 h-4 sm:w-5 sm:h-5" />
        Settings
      </RouterLink>
    </div>
  </div>
</template>
