<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import { ref, computed } from "vue";
import DefaultModpackImage from "@/assets/modpack-placeholder.png";

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
  remote_source?: { url?: string };
  gist_config?: { gist_id?: string; raw_url?: string };
  cloudStatus?: "published" | "subscribed" | "error" | null;
  hasUnsavedChanges?: boolean;
}

const props = defineProps<{
  modpack: ModpackWithCount;
  selected?: boolean;
  favorite?: boolean;
  isRunning?: boolean;
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
  (e: "play", id: string): void;
  (e: "export", id: string): void;
}>();

const showMenu = ref(false);

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.style.display = "none";
}

const loaderClass = computed(() => {
  const loader = props.modpack.loader?.toLowerCase();
  switch (loader) {
    case 'forge': return 'loader-forge';
    case 'fabric': return 'loader-fabric';
    case 'neoforge': return 'loader-neoforge';
    case 'quilt': return 'loader-quilt';
    default: return 'loader-default';
  }
});

const imageUrl = computed(() => {
  if (!props.modpack.image_url) return DefaultModpackImage;
  if (props.modpack.image_url.startsWith('http') || props.modpack.image_url.startsWith('file:')) {
    return props.modpack.image_url;
  }
  return 'atom:///' + props.modpack.image_url.replace(/\\/g, '/');
});
</script>

<template>
  <div class="modpack-card" :class="{
    'is-selected': selected,
    'is-running': isRunning,
    'is-favorite': favorite,
    'menu-open': showMenu
  }" @click="$emit('toggle-select', modpack.id)" @mouseleave="showMenu = false">
    <!-- ═══════════════════════════════════════════════════════════
         RESTING STATE - Elegant minimal design
         ═══════════════════════════════════════════════════════════ -->
    <div class="card-rest">
      <!-- Image area with elegant mask -->
      <div class="rest-image">
        <img :src="imageUrl" alt="" @error="handleImageError" />
        <div class="rest-image-fade" />

        <!-- Floating status indicators -->
        <div class="rest-badges">
          <span v-if="isRunning" class="badge-live">
            <span class="live-dot" />
          </span>
          <span v-if="modpack.cf_project_id" class="badge-source">
            <Icon name="Flame" class="w-3 h-3" />
          </span>
          <template v-if="modpack.cloudStatus === 'error'">
            <span class="badge-error">
              <Icon name="CloudOff" class="w-3 h-3" />
            </span>
          </template>
          <span v-else-if="modpack.cloudStatus === 'published'" class="badge-cloud">
            <Icon name="Cloud" class="w-3 h-3" />
          </span>
          <span v-else-if="modpack.cloudStatus === 'subscribed' || modpack.remote_source?.url" class="badge-sync">
            <Icon name="Link2" class="w-3 h-3" />
          </span>
        </div>
      </div>

      <!-- Info section -->
      <div class="rest-info">
        <h3 class="rest-title">{{ modpack.name }}</h3>

        <div class="rest-meta">
          <span class="rest-loader" :class="loaderClass">{{ modpack.loader || 'Vanilla' }}</span>
          <span class="rest-version">{{ modpack.minecraft_version }}</span>
        </div>

        <div class="rest-footer">
          <span class="rest-mods">
            <Icon name="Package" class="w-3.5 h-3.5" />
            {{ modpack.modCount }}
          </span>
          <span v-if="modpack.hasUnsavedChanges" class="rest-unsaved">
            <Icon name="CircleDot" class="w-3 h-3" />
            <span>Unsaved</span>
          </span>
        </div>
      </div>

      <!-- Selection indicator -->
      <div class="rest-select" :class="{ 'is-checked': selected }">
        <Icon v-if="selected" name="Check" class="w-3.5 h-3.5" />
      </div>

      <!-- Favorite heart -->
      <button class="rest-fav" :class="{ 'is-active': favorite }" @click.stop="$emit('toggle-favorite', modpack.id)">
        <Icon name="Heart" class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════
         HOVER STATE - Full immersive experience
         ═══════════════════════════════════════════════════════════ -->
    <div class="card-hover">
      <!-- Full bleed cinematic image -->
      <div class="hover-backdrop">
        <img :src="imageUrl" alt="" @error="handleImageError" />
        <div class="hover-overlay" />
      </div>

      <!-- Favorite (same position as rest state) -->
      <button class="hover-fav" :class="{ 'is-active': favorite }" @click.stop="$emit('toggle-favorite', modpack.id)">
        <Icon name="Heart" class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
      </button>

      <!-- Selection (same position as rest state) -->
      <div class="hover-select" :class="{ 'is-checked': selected }" @click.stop="$emit('toggle-select', modpack.id)">
        <Icon v-if="selected" name="Check" class="w-3.5 h-3.5" />
      </div>

      <!-- Live indicator -->
      <div v-if="isRunning" class="hover-live">
        <span class="live-pulse" />
        <span>PLAYING</span>
      </div>

      <!-- Cloud/Sync Status (visible in hover) -->
      <div class="hover-cloud-status">
        <Tooltip v-if="modpack.cf_project_id" content="CurseForge" position="left">
          <span class="status-badge status-cf">
            <Icon name="Flame" class="w-3.5 h-3.5" />
          </span>
        </Tooltip>
        <template v-if="modpack.cloudStatus === 'error'">
          <Tooltip v-if="modpack.remote_source?.url" content="Sync Error" position="left">
            <span class="status-badge status-error">
              <Icon name="Link2Off" class="w-3.5 h-3.5" />
            </span>
          </Tooltip>
          <Tooltip v-else content="Cloud Error" position="left">
            <span class="status-badge status-error">
              <Icon name="CloudOff" class="w-3.5 h-3.5" />
            </span>
          </Tooltip>
        </template>
        <Tooltip v-else-if="modpack.cloudStatus === 'published'" content="Published to Cloud" position="left">
          <span class="status-badge status-published">
            <Icon name="Cloud" class="w-3.5 h-3.5" />
          </span>
        </Tooltip>
        <Tooltip v-else-if="modpack.cloudStatus === 'subscribed' || modpack.remote_source?.url"
          content="Synced from Remote" position="left">
          <span class="status-badge status-synced">
            <Icon name="Link2" class="w-3.5 h-3.5" />
          </span>
        </Tooltip>
        <Tooltip v-if="modpack.hasUnsavedChanges" content="Unsaved Changes" position="left">
          <span class="status-badge status-unsaved">
            <Icon name="CircleDot" class="w-3.5 h-3.5" />
          </span>
        </Tooltip>
      </div>

      <!-- Central hero section -->
      <div class="hover-hero">
        <h2 class="hover-title">{{ modpack.name }}</h2>
        <p class="hover-subtitle">
          {{ modpack.minecraft_version }} · {{ modpack.loader }} · {{ modpack.modCount }} mods
        </p>
      </div>

      <!-- Action dock -->
      <div class="hover-dock" @click.stop>
        <button v-if="!isRunning" class="dock-play" @click.stop="$emit('play', modpack.id)">
          <Icon name="Play" class="w-5 h-5 fill-current" />
        </button>
        <div v-else class="dock-running">
          <span class="running-pulse" />
        </div>

        <div class="dock-divider" />

        <Tooltip content="Edit" position="top">
          <button class="dock-btn" @click.stop="$emit('edit', modpack.id)">
            <Icon name="Edit" class="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content="Share" position="top">
          <button class="dock-btn" @click.stop="$emit('share', modpack.id, modpack.name)">
            <Icon name="Share2" class="w-4 h-4" />
          </button>
        </Tooltip>
        <Tooltip content="Open Folder" position="top">
          <button class="dock-btn" @click.stop="$emit('open-folder', modpack.id)">
            <Icon name="FolderOpen" class="w-4 h-4" />
          </button>
        </Tooltip>

        <!-- More menu -->
        <div class="dock-more">
          <button class="dock-btn" @click.stop="showMenu = !showMenu">
            <Icon name="MoreVertical" class="w-4 h-4" />
          </button>

          <Transition enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2 scale-95" enter-to-class="opacity-100 translate-y-0 scale-100"
            leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 translate-y-0 scale-100"
            leave-to-class="opacity-0 translate-y-2 scale-95">
            <div v-if="showMenu" class="dock-menu">
              <button class="menu-item" @click.stop="$emit('export', modpack.id); showMenu = false;">
                <Icon name="Download" class="w-4 h-4" />
                <span>Export</span>
              </button>
              <button class="menu-item" @click.stop="$emit('clone', modpack.id); showMenu = false;">
                <Icon name="Copy" class="w-4 h-4" />
                <span>Duplicate</span>
              </button>
              <button class="menu-item" @click.stop="$emit('convert', modpack.id); showMenu = false;">
                <Icon name="RefreshCw" class="w-4 h-4" />
                <span>Convert Loader</span>
              </button>
              <div class="menu-sep" />
              <button class="menu-item menu-danger" @click.stop="$emit('delete', modpack.id); showMenu = false;">
                <Icon name="Trash2" class="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Animated glow border -->
      <div class="hover-glow-border" />
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
   CARD CONTAINER
   ═══════════════════════════════════════════════════════════════════ */
.modpack-card {
  position: relative;
  width: 100%;
  height: 280px;
  cursor: pointer;
  perspective: 1200px;
}

.modpack-card.menu-open {
  z-index: 100;
}

/* ═══════════════════════════════════════════════════════════════════
   RESTING STATE
   ═══════════════════════════════════════════════════════════════════ */
.card-rest {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--radius) + 8px);
  overflow: hidden;
  background: hsl(var(--card));
  border: var(--border-width) solid hsl(var(--border) / 0.5);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.modpack-card:hover .card-rest {
  opacity: 0;
  transform: scale(0.92) translateY(10px);
  pointer-events: none;
}

.modpack-card.is-selected .card-rest {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.3);
}

/* Rest - Image */
.rest-image {
  position: relative;
  height: 140px;
  overflow: hidden;
}

.rest-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.rest-image-fade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom,
      transparent 40%,
      hsl(var(--card)) 100%);
}

/* Rest - Badges */
.rest-badges {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 6px;
}

.rest-badges>span {
  width: 24px;
  height: 24px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  border: var(--border-width) solid hsl(var(--foreground) / 0.1);
}

.badge-live {
  background: hsl(var(--primary) / 0.9);
  color: hsl(var(--primary-foreground));
  box-shadow: 0 0 12px hsl(var(--primary) / 0.6);
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

.badge-source {
  background: hsl(var(--warning) / 0.2);
  color: hsl(var(--warning));
}

.badge-cloud {
  background: hsl(var(--success) / 0.2);
  color: hsl(var(--success));
}

.badge-sync {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
}

.badge-error {
  background: hsl(var(--destructive) / 0.2);
  color: hsl(var(--destructive));
}

/* Rest - Info */
.rest-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
}

.rest-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  line-height: 1.3;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rest-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: auto;
}

.rest-loader {
  padding: 3px 8px;
  border-radius: calc(var(--radius) - 2px);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.loader-forge {
  background: hsl(var(--warning) / 0.15);
  color: hsl(var(--warning));
}

.loader-fabric {
  background: hsl(var(--warning) / 0.12);
  color: hsl(var(--warning));
}

.loader-neoforge {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.loader-quilt {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.loader-default {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.rest-version {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.rest-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.rest-mods {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.rest-unsaved {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: calc(var(--radius) - 2px);
  font-size: 10px;
  font-weight: 600;
  background: hsl(var(--warning) / 0.15);
  color: hsl(var(--warning));
  border: var(--border-width) solid hsl(var(--warning) / 0.3);
  animation: pulse-subtle 2s ease-in-out infinite;
}

/* Rest - Selection */
.rest-select {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: calc(var(--radius) - 2px);
  border: 2px solid hsl(var(--foreground) / 0.3);
  background: hsl(var(--background) / 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--foreground));
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
}

.modpack-card:hover .rest-select,
.rest-select.is-checked {
  opacity: 1;
  transform: scale(1);
}

.rest-select.is-checked {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 0.3), 0 2px 8px hsl(var(--primary) / 0.4);
  color: hsl(var(--primary-foreground));
}

/* Rest - Favorite */
.rest-fav {
  position: absolute;
  bottom: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: calc(var(--radius) + 2px);
  background: hsl(var(--muted) / 0.8);
  border: var(--border-width) solid hsl(var(--border) / 0.5);
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.9);
  transition: all 0.2s ease;
}

.modpack-card:hover .rest-fav,
.rest-fav.is-active {
  opacity: 1;
  transform: scale(1);
}

.rest-fav:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.rest-fav.is-active {
  background: hsl(var(--destructive) / 0.15);
  border-color: hsl(var(--destructive) / 0.3);
  color: hsl(var(--destructive));
}

/* ═══════════════════════════════════════════════════════════════════
   HOVER STATE
   ═══════════════════════════════════════════════════════════════════ */
.card-hover {
  position: absolute;
  inset: 0;
  border-radius: calc(var(--radius) + 8px);
  overflow: hidden;
  opacity: 0;
  transform: scale(1.02);
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow:
    0 25px 50px -12px hsl(var(--background) / 0.5),
    inset 0 1px 0 hsl(var(--foreground) / 0.1);
}

.modpack-card:hover .card-hover {
  opacity: 1;
  transform: scale(1.02) translateY(-4px);
  pointer-events: auto;
}

/* Hover - Backdrop */
.hover-backdrop {
  position: absolute;
  inset: 0;
}

.hover-backdrop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.15);
  filter: brightness(0.35) saturate(1.2);
}

.hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top,
      hsl(var(--background) / 0.95) 0%,
      hsl(var(--background) / 0.5) 50%,
      hsl(var(--background) / 0.3) 100%);
}

/* Hover - Favorite (matches rest position) - ENTERS FROM RIGHT */
.hover-fav {
  position: absolute;
  bottom: 70px;
  right: 14px;
  width: 36px;
  height: 36px;
  border-radius: calc(var(--radius) + 2px);
  background: hsl(var(--foreground) / 0.1);
  backdrop-filter: blur(12px);
  border: var(--border-width) solid hsl(var(--foreground) / 0.15);
  color: hsl(var(--foreground) / 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateX(20px);
  transition:
    opacity 0.3s ease 0.15s,
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.15s,
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.modpack-card:hover .hover-fav {
  opacity: 1;
  transform: translateX(0);
}

.hover-fav:hover {
  background: hsl(var(--foreground) / 0.2);
  color: hsl(var(--foreground));
  transform: scale(1.05);
}

.hover-fav.is-active {
  background: hsl(var(--destructive) / 0.25);
  border-color: hsl(var(--destructive) / 0.4);
  color: hsl(var(--destructive));
}

/* Hover - Selection (matches rest position) - ENTERS FROM TOP-RIGHT */
.hover-select {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 26px;
  height: 26px;
  border-radius: var(--radius);
  border: 2px solid hsl(var(--foreground) / 0.35);
  background: hsl(var(--foreground) / 0.1);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--foreground));
  cursor: pointer;
  opacity: 0;
  transform: translate(15px, -15px) scale(0.8);
  transition:
    opacity 0.3s ease 0.1s,
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s,
    background 0.2s ease,
    border-color 0.2s ease;
}

.modpack-card:hover .hover-select {
  opacity: 1;
  transform: translate(0, 0) scale(1);
}

.hover-select:hover {
  border-color: hsl(var(--foreground) / 0.5);
  background: hsl(var(--foreground) / 0.15);
}

.hover-select.is-checked {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 0.3), 0 2px 8px hsl(var(--primary) / 0.4);
  color: hsl(var(--primary-foreground));
}

/* Hover - Live badge - ENTERS FROM TOP-LEFT */
.hover-live {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  box-shadow: 0 0 20px hsl(var(--primary) / 0.5);
  opacity: 0;
  transform: translate(-15px, -15px) scale(0.8);
  transition:
    opacity 0.3s ease 0.1s,
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}

.modpack-card:hover .hover-live {
  opacity: 1;
  transform: translate(0, 0) scale(1);
}

.live-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

/* Hover - Hero section - ENTERS FROM LEFT */
.hover-hero {
  position: absolute;
  left: 16px;
  right: 60px;
  bottom: 70px;
}

.hover-title {
  font-size: 18px;
  font-weight: 700;
  color: hsl(var(--foreground));
  line-height: 1.2;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 8px hsl(var(--background) / 0.3);
  opacity: 0;
  transform: translateX(-25px);
  transition:
    opacity 0.35s ease 0.08s,
    transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.08s;
}

.modpack-card:hover .hover-title {
  opacity: 1;
  transform: translateX(0);
}

.hover-subtitle {
  font-size: 12px;
  color: hsl(var(--foreground) / 0.6);
  opacity: 0;
  transform: translateX(-20px);
  transition:
    opacity 0.35s ease 0.14s,
    transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.14s;
}

.modpack-card:hover .hover-subtitle {
  opacity: 1;
  transform: translateX(0);
}

/* Hover - Action Dock - ENTERS FROM BOTTOM */
.hover-dock {
  position: absolute;
  bottom: 14px;
  left: 14px;
  right: 14px;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  border-radius: calc(var(--radius) + 6px);
  background: hsl(var(--foreground) / 0.08);
  backdrop-filter: blur(20px);
  border: var(--border-width) solid hsl(var(--foreground) / 0.12);
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.35s ease 0.12s,
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s;
}

.modpack-card:hover .hover-dock {
  opacity: 1;
  transform: translateY(0);
}

.dock-play {
  width: 36px;
  height: 36px;
  border-radius: calc(var(--radius) + 2px);
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px hsl(var(--background) / 0.2);
}

.dock-play:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 16px hsl(var(--foreground) / 0.25);
}

.dock-running {
  width: 36px;
  height: 36px;
  border-radius: calc(var(--radius) + 2px);
  background: hsl(var(--primary) / 0.2);
  border: var(--border-width) solid hsl(var(--primary) / 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.running-pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: hsl(var(--primary));
  animation: pulse-glow 1.5s ease-in-out infinite;
}

.dock-divider {
  width: 1px;
  height: 24px;
  background: hsl(var(--foreground) / 0.15);
  margin: 0 4px;
}

.dock-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: transparent;
  color: hsl(var(--foreground) / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.dock-btn:hover {
  background: hsl(var(--foreground) / 0.1);
  color: hsl(var(--foreground));
}

/* Dock - More menu */
.dock-more {
  position: relative;
  margin-left: auto;
}

.dock-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  width: 180px;
  padding: 6px;
  border-radius: calc(var(--radius) + 4px);
  background: hsl(var(--popover) / 0.95);
  backdrop-filter: blur(20px);
  border: var(--border-width) solid hsl(var(--border));
  box-shadow: 0 20px 40px hsl(var(--background) / 0.4);
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 13px;
  color: hsl(var(--foreground) / 0.8);
  transition: all 0.15s ease;
}

.menu-item:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.menu-danger {
  color: hsl(var(--destructive));
}

.menu-danger:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.menu-sep {
  height: 1px;
  background: hsl(var(--border));
  margin: 4px 8px;
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════════════════════════════ */
@keyframes pulse-glow {

  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 currentColor;
  }

  50% {
    opacity: 0.6;
    box-shadow: 0 0 8px 2px currentColor;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SPECIAL STATES
   ═══════════════════════════════════════════════════════════════════ */
.modpack-card.is-running .card-rest {
  box-shadow: 0 0 20px -4px hsl(var(--primary) / 0.4);
}

.modpack-card.is-running .card-hover {
  box-shadow:
    0 25px 50px -12px hsl(var(--background) / 0.5),
    0 0 30px -5px hsl(var(--primary) / 0.4),
    inset 0 1px 0 hsl(var(--foreground) / 0.1);
}

.modpack-card.is-favorite .rest-fav {
  opacity: 1;
  transform: scale(1);
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED BORDER
   ═══════════════════════════════════════════════════════════════════ */
.hover-glow-border {
  position: absolute;
  inset: 0;
  border-radius: calc(var(--radius) + 8px);
  pointer-events: none;
  border: 1.4px solid transparent;
  opacity: 0;
  transition: all 0.3s ease;
}

.modpack-card:hover .hover-glow-border {
  opacity: .3;
  border-color: hsl(var(--primary));
  box-shadow: 0 0 20px -5px hsl(var(--primary) / 0.4);
}

@keyframes pulse-subtle {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

/* Hover - Cloud Status - ENTERS FROM LEFT */
.hover-cloud-status {
  position: absolute;
  top: 50px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  opacity: 0;
  transform: translateX(-20px);
  transition:
    opacity 0.3s ease 0.18s,
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.18s;
}

.modpack-card:hover .hover-cloud-status {
  opacity: 1;
  transform: translateX(0);
}

.status-badge {
  width: 30px;
  height: 30px;
  border-radius: calc(var(--radius) + 2px);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px);
  border: var(--border-width) solid hsl(var(--foreground) / 0.15);
  transition: transform 0.2s ease;
}

.status-badge:hover {
  transform: scale(1.1);
}

.status-cf {
  background: hsl(var(--warning) / 0.25);
  color: hsl(var(--warning));
  border-color: hsl(var(--warning) / 0.4);
}

.status-published {
  background: hsl(var(--success) / 0.25);
  color: hsl(var(--success));
  border-color: hsl(var(--success) / 0.4);
}

.status-synced {
  background: hsl(var(--primary) / 0.25);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}

.status-error {
  background: hsl(var(--destructive) / 0.25);
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.4);
}

.status-unsaved {
  background: hsl(var(--warning) / 0.25);
  color: hsl(var(--warning));
  border-color: hsl(var(--warning) / 0.4);
  animation: pulse-subtle 2s ease-in-out infinite;
}
</style>
