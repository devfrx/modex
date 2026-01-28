<script setup lang="ts">
import { RouterLink, useRouter, useRoute } from "vue-router";
import { createLogger } from "@/utils/logger";
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import ModexLogo from "@/assets/modex_logo_h2_nobg.png";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useSidebar } from "@/composables/useSidebar";
import { useGameProfile } from "@/composables/useGameProfile";
import GameSelector from "@/components/layout/GameSelector.vue";

// Detect platform for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
const modKey = isMac ? "⌘" : "Ctrl";

const log = createLogger("Sidebar");

const router = useRouter();
const route = useRoute();
const { activeGameType, isLoading: isGameLoading, setActiveGame, initialize: initGameProfile } = useGameProfile();

const isDev = import.meta.env.DEV;

defineProps<{
  isOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { settings, enabledItems, toggleCollapsed, setActiveGame: setSidebarGame } = useSidebar();

// Edge hover state
const isEdgeHovered = ref(false);

async function handleGameChange(gameType: "minecraft" | "hytale") {
  await setActiveGame(gameType);
  setSidebarGame(gameType);
  if (gameType === "hytale") {
    router.push("/hytale");
  } else {
    router.push("/");
  }
}

// Fixed route matching - exact match for known routes
function isRouteActive(itemRoute: string): boolean {
  const currentPath = route.path;
  if (currentPath === itemRoute) return true;

  // Routes that should be treated as distinct (not highlight parent)
  const knownSubRoutes = ['/modpacks/browse', '/library/search', '/library/mod', '/hytale/mods', '/hytale/modpacks', '/hytale/browse', '/hytale/worlds', '/hytale/modpack'];
  for (const subRoute of knownSubRoutes) {
    if (currentPath.startsWith(subRoute)) {
      return itemRoute === subRoute || itemRoute.startsWith(subRoute + '/');
    }
  }

  if (currentPath.startsWith(itemRoute + '/')) return true;
  return false;
}

function triggerSearch() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
}

const modCount = ref(0);
const modpackCount = ref(0);

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
  } catch (err) {
    log.error("Failed to load stats", { error: String(err) });
  }
}

function handleNavClick() {
  emit("close");
}

let statsInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  loadStats();
  await initGameProfile();
  setSidebarGame(activeGameType.value);
  statsInterval = setInterval(loadStats, 5000);
  window.addEventListener("storage", loadStats);
});

onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval);
  window.removeEventListener("storage", loadStats);
});

// Group items for visual separation
const groupedItems = computed(() => {
  const items = enabledItems.value;
  const myItems = items.filter(i => ['home', 'library', 'modpacks', 'hytale-home', 'hytale-mods', 'hytale-modpacks'].includes(i.id));
  const browseItems = items.filter(i => ['browse-mods', 'browse-modpacks', 'hytale-browse'].includes(i.id));
  const otherItems = items.filter(i => !myItems.includes(i) && !browseItems.includes(i));
  return { myItems, browseItems, otherItems };
});
</script>

<template>
  <div class="sidebar-wrapper"
    :class="{ 'sidebar-wrapper--collapsed': settings.collapsed, 'sidebar-wrapper--hovered': isEdgeHovered }">
    <aside class="nav-rail"
      :class="{ 'nav-rail--collapsed': settings.collapsed, 'nav-rail--right': settings.position === 'right' }">

      <!-- Brand -->
      <div class="nav-rail__brand">
        <div class="brand-logo">
          <img :src="ModexLogo" alt="ModEx" />
          <div class="brand-logo__glow" />
        </div>
        <template v-if="!settings.collapsed">
          <div class="brand-info">
            <span class="brand-info__name">ModEx</span>
            <span class="brand-info__tag">v0.2</span>
          </div>
        </template>
        <button v-if="!settings.collapsed" @click="emit('close')" class="nav-rail__close sm:hidden">
          <Icon name="X" class="w-4 h-4" />
        </button>
      </div>

      <!-- Game Switcher -->
      <div class="nav-rail__game" :class="{ 'nav-rail__game--collapsed': settings.collapsed }">
        <GameSelector :current-game="activeGameType" :disabled="isGameLoading" :collapsed="settings.collapsed"
          @change="handleGameChange" />
      </div>

      <!-- Navigation -->
      <nav class="nav-rail__menu">
        <!-- My Content Group -->
        <div class="nav-group" v-if="groupedItems.myItems.length">
          <span v-if="!settings.collapsed" class="nav-group__label">Your Content</span>
          <div class="nav-group__items">
            <Tooltip v-for="item in groupedItems.myItems" :key="item.id" :content="item.name" position="right"
              :disabled="!settings.collapsed">
              <RouterLink :to="item.route" class="nav-item"
                :class="{ 'nav-item--active': isRouteActive(item.route), 'nav-item--collapsed': settings.collapsed }"
                @click="handleNavClick">
                <div class="nav-item__icon-wrap">
                  <Icon :name="item.icon" class="nav-item__icon" />
                </div>
                <span v-if="!settings.collapsed" class="nav-item__text">{{ item.name }}</span>
                <span v-if="!settings.collapsed && getItemCount(item.id)" class="nav-item__count">{{
                  getItemCount(item.id)
                  }}</span>
              </RouterLink>
            </Tooltip>
          </div>
        </div>

        <!-- Browse Group -->
        <div class="nav-group" v-if="groupedItems.browseItems.length">
          <span v-if="!settings.collapsed" class="nav-group__label">Discover</span>
          <div class="nav-group__items">
            <Tooltip v-for="item in groupedItems.browseItems" :key="item.id" :content="item.name" position="right"
              :disabled="!settings.collapsed">
              <RouterLink :to="item.route" class="nav-item"
                :class="{ 'nav-item--active': isRouteActive(item.route), 'nav-item--collapsed': settings.collapsed }"
                @click="handleNavClick">
                <div class="nav-item__icon-wrap">
                  <Icon :name="item.icon" class="nav-item__icon" />
                </div>
                <span v-if="!settings.collapsed" class="nav-item__text">{{ item.name }}</span>
              </RouterLink>
            </Tooltip>
          </div>
        </div>

        <!-- Other Items -->
        <div class="nav-group" v-if="groupedItems.otherItems.length">
          <span v-if="!settings.collapsed" class="nav-group__label">More</span>
          <div class="nav-group__items">
            <Tooltip v-for="item in groupedItems.otherItems" :key="item.id" :content="item.name" position="right"
              :disabled="!settings.collapsed">
              <RouterLink :to="item.route" class="nav-item"
                :class="{ 'nav-item--active': isRouteActive(item.route), 'nav-item--collapsed': settings.collapsed }"
                @click="handleNavClick">
                <div class="nav-item__icon-wrap">
                  <Icon :name="item.icon" class="nav-item__icon" />
                </div>
                <span v-if="!settings.collapsed" class="nav-item__text">{{ item.name }}</span>
              </RouterLink>
            </Tooltip>
          </div>
        </div>
      </nav>

      <!-- Search Trigger -->
      <Tooltip :content="`Search ${modKey}+K`" position="right" :disabled="!settings.collapsed">
        <button class="search-trigger" :class="{ 'search-trigger--collapsed': settings.collapsed }"
          @click="triggerSearch">
          <Icon name="Search" class="search-trigger__icon" />
          <template v-if="!settings.collapsed">
            <span class="search-trigger__text">Search</span>
            <div class="search-trigger__shortcut">
              <kbd class="search-trigger__key">{{ modKey }}</kbd>
              <kbd class="search-trigger__key">K</kbd>
            </div>
          </template>
        </button>
      </Tooltip>

      <!-- Bottom Actions -->
      <div class="nav-rail__bottom">
        <!-- Dev -->
        <Tooltip v-if="isDev" content="Dev" position="right" :disabled="!settings.collapsed">
          <RouterLink to="/dev" class="bottom-action bottom-action--dev"
            :class="{ 'bottom-action--collapsed': settings.collapsed }" @click="handleNavClick">
            <Icon name="Zap" class="bottom-action__icon" />
            <span v-if="!settings.collapsed" class="bottom-action__text">Dev</span>
          </RouterLink>
        </Tooltip>

        <!-- Settings -->
        <Tooltip content="Settings" position="right" :disabled="!settings.collapsed">
          <RouterLink to="/settings" class="bottom-action bottom-action--settings"
            :class="{ 'bottom-action--collapsed': settings.collapsed, 'bottom-action--active': isRouteActive('/settings') }"
            @click="handleNavClick">
            <Icon name="Settings" class="bottom-action__icon bottom-action__icon--spin" />
            <span v-if="!settings.collapsed" class="bottom-action__text">Settings</span>
          </RouterLink>
        </Tooltip>
      </div>
    </aside>

    <!-- Edge Collapse Handle - Now outside aside, takes real space -->
    <div class="collapse-edge" :class="{ 'collapse-edge--hovered': isEdgeHovered }" @mouseenter="isEdgeHovered = true"
      @mouseleave="isEdgeHovered = false" @click="toggleCollapsed">
      <div class="collapse-edge__bar">
        <Icon :name="settings.collapsed ? 'ChevronRight' : 'ChevronLeft'" class="collapse-edge__icon" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =============================================
   SIDEBAR WRAPPER - Contains sidebar + handle
   ============================================= */

.sidebar-wrapper {
  display: flex;
  height: 100vh;
  flex-shrink: 0;
}

/* =============================================
   NAVIGATION RAIL - Modern Floating Design
   ============================================= */

.nav-rail {
  --rail-bg: hsl(var(--card));
  --rail-border: hsl(var(--border) / 0.6);
  --rail-width: 14.5rem;
  --rail-width-collapsed: 4.5rem;
  --item-radius: 0.75rem;
  --accent: hsl(var(--primary));
  --accent-soft: hsl(var(--primary) / 0.12);

  position: relative;
  display: flex;
  flex-direction: column;
  width: var(--rail-width);
  height: 100vh;
  background: var(--rail-bg);
  border-right: 1px solid var(--rail-border);
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;
}

.nav-rail--collapsed {
  width: var(--rail-width-collapsed);
  overflow: visible;
}

.nav-rail--right {
  border-right: none;
  border-left: 1px solid var(--rail-border);
}

/* =============================================
   BRAND HEADER
   ============================================= */

.nav-rail__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  min-height: 4rem;
}

.nav-rail--collapsed .nav-rail__brand {
  justify-content: center;
  padding: 1rem 0.5rem;
}

.brand-logo {
  position: relative;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
}

.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 1;
}

.brand-logo__glow {
  position: absolute;
  inset: -4px;
  background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
  opacity: 0;
  filter: blur(8px);
  transition: opacity 300ms ease;
  z-index: 0;
}

.brand-logo:hover .brand-logo__glow {
  opacity: 0.4;
}

.brand-info {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.brand-info__name {
  font-size: 1rem;
  font-weight: 700;
  color: hsl(var(--foreground));
  letter-spacing: -0.02em;
}

.brand-info__tag {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--accent-soft);
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.nav-rail__close {
  margin-left: auto;
  padding: 0.375rem;
  border-radius: 0.5rem;
  color: hsl(var(--muted-foreground));
  transition: all 150ms ease;
}

.nav-rail__close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

/* =============================================
   GAME SELECTOR
   ============================================= */

.nav-rail__game {
  padding: 0 0.75rem 0.75rem;
  position: relative;
  z-index: 150;
  /* Above collapse handle */
}

.nav-rail__game--collapsed {
  padding: 0 0.5rem 0.75rem;
  overflow: visible;
}

/* =============================================
   NAVIGATION MENU
   ============================================= */

.nav-rail__menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.25rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.nav-rail__menu::-webkit-scrollbar {
  width: 3px;
}

.nav-rail__menu::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.15);
  border-radius: 3px;
}

/* Navigation Groups */
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-group__label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: hsl(var(--muted-foreground) / 0.6);
  padding: 0.5rem 0.75rem 0.25rem;
}

.nav-group__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Navigation Items */
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--item-radius);
  text-decoration: none;
  color: hsl(var(--muted-foreground));
  font-size: 0.8125rem;
  font-weight: 500;
  transition: all 150ms ease;
}

.nav-item--collapsed {
  justify-content: center;
  padding: 0.75rem;
}

.nav-item:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

.nav-item--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav-item--active:hover {
  background: hsl(var(--primary) / 0.18);
}

/* Icon wrapper with dot indicator */
.nav-item__icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.nav-item__icon {
  width: 1.125rem;
  height: 1.125rem;
  transition: transform 150ms ease;
}

.nav-item:hover .nav-item__icon {
  transform: scale(1.1);
}

.nav-item--active .nav-item__icon {
  transform: scale(1.05);
}

@keyframes dot-pulse {

  0%,
  100% {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }

  50% {
    opacity: 0.7;
    transform: translateX(-50%) scale(0.85);
  }
}

.nav-item__text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item__count {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.nav-item--active .nav-item__count {
  background: hsl(var(--primary) / 0.2);
  color: var(--accent);
}

/* =============================================
   SEARCH TRIGGER
   ============================================= */

.search-trigger {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--item-radius);
  background: hsl(var(--muted) / 0.3);
  border: 1px dashed hsl(var(--border) / 0.5);
  color: hsl(var(--muted-foreground));
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 180ms ease;
}

.search-trigger--collapsed {
  justify-content: center;
  padding: 0.75rem;
}

.search-trigger:hover {
  background: hsl(var(--muted) / 0.5);
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}

.search-trigger__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.search-trigger__text {
  flex: 1;
  text-align: left;
}

.search-trigger__shortcut {
  display: flex;
  align-items: center;
  gap: 2px;
}

.search-trigger__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  font-size: 0.6875rem;
  font-family: inherit;
  font-weight: 500;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  background: var(--background);
  border: 1px solid hsl(var(--border) / 0.6);
  box-shadow: 0 1px 0 hsl(var(--border) / 0.3), inset 0 1px 0 hsl(var(--background) / 0.5);
  color: hsl(var(--muted-foreground) / 0.8);
  text-transform: uppercase;
}

/* =============================================
   BOTTOM ACTIONS
   ============================================= */

.nav-rail__bottom {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem;
  border-top: 1px solid hsl(var(--border) / 0.4);
}

.bottom-action {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--item-radius);
  color: hsl(var(--muted-foreground));
  font-size: 0.8125rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 150ms ease;
  width: 100%;
  cursor: pointer;
  background: transparent;
  border: none;
}

.bottom-action--collapsed {
  justify-content: center;
  padding: 0.625rem;
}

.bottom-action:hover {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
}

.bottom-action--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.bottom-action--dev {
  color: hsl(var(--warning));
}

.bottom-action--dev:hover {
  background: hsl(var(--warning) / 0.1);
  color: hsl(var(--warning));
}

.bottom-action__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.bottom-action__icon--spin {
  transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
}

.bottom-action--settings:hover .bottom-action__icon--spin {
  transform: rotate(180deg);
}

.bottom-action__text {
  flex: 1;
  text-align: left;
}

/* =============================================
   COLLAPSE EDGE HANDLE - Takes real space
   ============================================= */

.collapse-edge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6px;
  height: 100vh;
  cursor: pointer;
  flex-shrink: 0;
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.collapse-edge:hover,
.collapse-edge--hovered {
  width: 20px;
}

.collapse-edge__bar {
  width: 100%;
  height: 100%;
  background: hsl(var(--muted) / 0.3);
  border-right: 1px solid hsl(var(--border) / 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.collapse-edge:hover .collapse-edge__bar,
.collapse-edge--hovered .collapse-edge__bar {
  background: hsl(var(--muted) / 0.6);
  border-color: hsl(var(--border) / 0.5);
}

.collapse-edge:active .collapse-edge__bar {
  background: hsl(var(--primary) / 0.15);
  border-color: hsl(var(--primary) / 0.4);
}

.collapse-edge__icon {
  width: 12px;
  height: 12px;
  color: hsl(var(--muted-foreground) / 0.5);
  flex-shrink: 0;
  opacity: 0;
  transition: all 200ms ease;
}

.collapse-edge:hover .collapse-edge__icon,
.collapse-edge--hovered .collapse-edge__icon {
  opacity: 1;
  color: hsl(var(--muted-foreground));
}

.collapse-edge:active .collapse-edge__icon {
  color: hsl(var(--primary));
}
</style>
