<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { createLogger } from "@/utils/logger";
import Icon from "@/components/ui/Icon.vue";
import ModexLogo from "@/assets/modex_logo_h2_nobg.png";
import { cn } from "@/lib/utils";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useSidebar } from "@/composables/useSidebar";
import { useGameProfile } from "@/composables/useGameProfile";
import GameSelector from "@/components/layout/GameSelector.vue";

const log = createLogger("Sidebar");

const router = useRouter();
const { activeGameType, isLoading: isGameLoading, setActiveGame, initialize: initGameProfile } = useGameProfile();

// Check if in dev mode (must be in script, not template)
const isDev = import.meta.env.DEV;

defineProps<{
  isOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { settings, enabledItems, toggleCollapsed, setActiveGame: setSidebarGame } = useSidebar();

// Handle game change from GameSelector
async function handleGameChange(gameType: "minecraft" | "hytale") {
  await setActiveGame(gameType);
  // Update sidebar to show game-specific items
  setSidebarGame(gameType);
  // Navigate to appropriate view based on game
  if (gameType === "hytale") {
    router.push("/hytale");
  } else {
    router.push("/");
  }
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
    log.error("Failed to load stats", { error: String(err) });
  }
}

function handleNavClick() {
  emit("close");
}

// Interval reference for cleanup
let statsInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  loadStats();
  await initGameProfile();
  // Sync sidebar with active game
  setSidebarGame(activeGameType.value);
  // Refresh stats periodically
  statsInterval = setInterval(loadStats, 5000);
  // Listen for storage changes from other components
  window.addEventListener("storage", loadStats);
});

onUnmounted(() => {
  // Cleanup interval
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  // Cleanup event listener
  window.removeEventListener("storage", loadStats);
});
</script>

<template>
  <div class="h-screen bg-card/60 backdrop-blur-xl flex flex-col transition-all duration-300" :class="[
    settings.collapsed ? 'w-16' : 'w-56 sm:w-64',
    settings.position === 'right' ? 'border-l border-border/30' : 'border-r border-border/30'
  ]">
    <!-- Header with close button on mobile -->
    <div class="p-4 border-b border-border/30 flex items-center"
      :class="settings.collapsed ? 'justify-center' : 'justify-between'">
      <div v-if="!settings.collapsed" class="flex items-center gap-3">
        <img :src="ModexLogo" alt="ModEx" class="w-9 h-9 object-contain" />
        <div>
          <h1 class="text-base font-semibold tracking-tight text-foreground">
            ModEx
          </h1>
          <p class="text-caption text-muted-foreground">
            Mod Manager
          </p>
        </div>
      </div>
      <img v-else :src="ModexLogo" alt="ModEx" class="w-9 h-9 object-contain" />
      <button @click="emit('close')"
        class="sm:hidden p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close menu" v-if="!settings.collapsed">
        <Icon name="X" class="w-4 h-4" />
      </button>
    </div>

    <!-- Game Selector -->
    <div class="px-3 py-2 border-b border-border/30" :class="settings.collapsed ? 'px-2' : ''">
      <GameSelector :current-game="activeGameType" :disabled="isGameLoading" :collapsed="settings.collapsed"
        @change="handleGameChange" />
    </div>

    <nav class="flex-1 p-2 space-y-0.5 overflow-auto" :class="settings.collapsed ? 'px-2' : 'px-3'">
      <RouterLink v-for="item in enabledItems" :key="item.id" :to="item.route"
        class="group flex items-center gap-3 rounded-md transition-colors duration-150 text-sm font-medium" :class="[
          settings.collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        ]" active-class="!bg-primary/10 !text-primary !font-medium !border-l-2 !border-primary !rounded-l-none"
        @click="handleNavClick" :title="settings.collapsed ? item.name : undefined">
        <Icon :name="item.icon" class="w-4 h-4 transition-colors duration-150 shrink-0" />
        <span v-if="!settings.collapsed" class="flex-1">{{ item.name }}</span>
        <span v-if="!settings.collapsed && getItemCount(item.id)"
          class="text-caption bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
          {{ getItemCount(item.id) }}
        </span>
      </RouterLink>
    </nav>

    <!-- Search hint -->
    <div class="px-2 py-2 border-t border-border/30" :class="settings.collapsed ? 'px-2' : 'px-3'">
      <button
        class="w-full flex items-center rounded-md bg-muted/50 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border/60 transition-all duration-150 text-sm"
        :class="settings.collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5'" @click="triggerSearch"
        :title="settings.collapsed ? 'Search (Ctrl+K)' : undefined">
        <Icon name="Search" class="w-3.5 h-3.5 shrink-0" />
        <template v-if="!settings.collapsed">
          <span class="flex-1 text-left text-xs">Search...</span>
          <span class="flex items-center gap-0.5 text-micro text-muted-foreground">
            <kbd class="px-1 py-0.5 bg-background/50 rounded text-micro border border-border/50 font-mono">⌘K</kbd>
          </span>
        </template>
      </button>
    </div>

    <!-- Collapse toggle & Settings -->
    <div class="p-2 border-t border-border/30 space-y-0.5" :class="settings.collapsed ? 'px-2' : 'px-3'">
      <!-- Dev Playground link (only in dev mode) -->
      <RouterLink v-if="isDev" to="/dev"
        class="group flex items-center gap-3 rounded-md transition-colors duration-150 text-sm font-medium" :class="[
          settings.collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2',
          'text-warning hover:bg-warning/10 hover:text-warning',
        ]" active-class="!bg-warning/10 !text-warning" @click="handleNavClick"
        :title="settings.collapsed ? 'Dev Playground' : undefined">
        <Icon name="Zap" class="w-4 h-4 transition-colors duration-150 shrink-0" />
        <span v-if="!settings.collapsed">Dev</span>
      </RouterLink>

      <!-- Collapse toggle -->
      <button @click="toggleCollapsed"
        class="w-full flex items-center gap-3 rounded-md transition-all duration-150 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="settings.collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'"
        :title="settings.collapsed ? 'Expand' : 'Minimize'">
        <Icon :name="settings.collapsed ? 'PanelLeft' : 'PanelLeftClose'" class="w-4 h-4 shrink-0" />
        <span v-if="!settings.collapsed" class="text-sm">Minimize</span>
      </button>

      <RouterLink to="/settings"
        class="group flex items-center gap-3 rounded-md transition-colors duration-150 text-sm font-medium" :class="[
          settings.collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        ]" active-class="!bg-primary/10 !text-primary !font-medium !border-l-2 !border-primary !rounded-l-none"
        @click="handleNavClick" :title="settings.collapsed ? 'Settings' : undefined">
        <Icon name="Settings" class="w-4 h-4 transition-colors duration-150 shrink-0" />
        <span v-if="!settings.collapsed">Settings</span>
      </RouterLink>
    </div>
  </div>
</template>
