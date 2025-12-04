<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Library, Package, Settings, Star, Clock, FolderTree, LayoutGrid } from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { ref, onMounted, watch } from "vue";

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
    const modIds = new Set(mods.map(m => m.id));
    const packIds = new Set(modpacks.map(p => p.id));
    
    let favMods: string[] = JSON.parse(localStorage.getItem("modex:favorites:mods") || "[]");
    let favPacks: string[] = JSON.parse(localStorage.getItem("modex:favorites:modpacks") || "[]");
    
    // Filter out deleted items and update localStorage
    const validFavMods = favMods.filter(id => modIds.has(id));
    const validFavPacks = favPacks.filter(id => packIds.has(id));
    
    if (validFavMods.length !== favMods.length) {
      localStorage.setItem("modex:favorites:mods", JSON.stringify(validFavMods));
    }
    if (validFavPacks.length !== favPacks.length) {
      localStorage.setItem("modex:favorites:modpacks", JSON.stringify(validFavPacks));
    }
    
    favoriteModCount.value = validFavMods.length;
    favoritePackCount.value = validFavPacks.length;
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
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
  <div class="h-screen w-64 bg-card border-r flex flex-col">
    <div class="p-6 border-b">
      <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">ModEx</h1>
      <p class="text-xs text-muted-foreground mt-1">Mod Manager</p>
    </div>
    <nav class="flex-1 p-4 space-y-2">
      <RouterLink
        to="/library"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Library class="w-5 h-5" />
        <span class="flex-1">Library</span>
        <span v-if="modCount > 0" class="text-xs bg-muted px-2 py-0.5 rounded-full">{{ modCount }}</span>
      </RouterLink>
      <RouterLink
        to="/modpacks"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Package class="w-5 h-5" />
        <span class="flex-1">Modpacks</span>
        <span v-if="modpackCount > 0" class="text-xs bg-muted px-2 py-0.5 rounded-full">{{ modpackCount }}</span>
      </RouterLink>
      <RouterLink
        to="/organize"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <FolderTree class="w-5 h-5" />
        <span class="flex-1">Organize</span>
      </RouterLink>
      <RouterLink
        to="/sandbox"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <LayoutGrid class="w-5 h-5" />
        <span class="flex-1">Sandbox</span>
      </RouterLink>
      
      <div class="pt-4 pb-2">
        <p class="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Access</p>
      </div>
      
      <RouterLink
        to="/library?filter=favorites"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
      >
        <Star class="w-4 h-4 text-yellow-500" />
        <span class="flex-1">Favorite Mods</span>
        <span v-if="favoriteModCount > 0" class="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">{{ favoriteModCount }}</span>
      </RouterLink>
      <RouterLink
        to="/modpacks?filter=favorites"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
      >
        <Star class="w-4 h-4 text-yellow-500" />
        <span class="flex-1">Favorite Packs</span>
        <span v-if="favoritePackCount > 0" class="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">{{ favoritePackCount }}</span>
      </RouterLink>
      <RouterLink
        to="/library?filter=recent"
        class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
      >
        <Clock class="w-4 h-4 text-blue-500" />
        <span>Recently Added</span>
      </RouterLink>
    </nav>
    <div class="p-4 border-t">
      <RouterLink
        to="/settings"
        class="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
        active-class="bg-accent text-accent-foreground"
      >
        <Settings class="w-5 h-5" />
        Settings
      </RouterLink>
    </div>
  </div>
</template>
