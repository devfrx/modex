<script setup lang="ts">
import {
  Trash2,
  Edit,
  Check,
  Copy,
  FolderOpen,
  Heart,
  Share2,
  RefreshCw,
  Flame,
  Link2,
  Link2Off,
  Play,
  MoreVertical,
  CircleDot,
  Package,
  CloudOff,
  Cloud,
} from "lucide-vue-next";
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
            <Flame class="w-3 h-3" />
          </span>
          <template v-if="modpack.cloudStatus === 'error'">
            <span class="badge-error">
              <CloudOff class="w-3 h-3" />
            </span>
          </template>
          <span v-else-if="modpack.cloudStatus === 'published'" class="badge-cloud">
            <Cloud class="w-3 h-3" />
          </span>
          <span v-else-if="modpack.cloudStatus === 'subscribed' || modpack.remote_source?.url" class="badge-sync">
            <Link2 class="w-3 h-3" />
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
            <Package class="w-3.5 h-3.5" />
            {{ modpack.modCount }}
          </span>
          <span v-if="modpack.hasUnsavedChanges" class="rest-unsaved">
            <CircleDot class="w-3 h-3" />
            <span>Unsaved</span>
          </span>
        </div>
      </div>

      <!-- Selection indicator -->
      <div class="rest-select" :class="{ 'is-checked': selected }">
        <Check v-if="selected" class="w-3.5 h-3.5" />
      </div>

      <!-- Favorite heart -->
      <button class="rest-fav" :class="{ 'is-active': favorite }" @click.stop="$emit('toggle-favorite', modpack.id)">
        <Heart class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
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
        <Heart class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
      </button>

      <!-- Selection (same position as rest state) -->
      <div class="hover-select" :class="{ 'is-checked': selected }" @click.stop="$emit('toggle-select', modpack.id)">
        <Check v-if="selected" class="w-3.5 h-3.5" />
      </div>

      <!-- Live indicator -->
      <div v-if="isRunning" class="hover-live">
        <span class="live-pulse" />
        <span>PLAYING</span>
      </div>

      <!-- Cloud/Sync Status (visible in hover) -->
      <div class="hover-cloud-status">
        <span v-if="modpack.cf_project_id" class="status-badge status-cf" title="CurseForge">
          <Flame class="w-3.5 h-3.5" />
        </span>
        <template v-if="modpack.cloudStatus === 'error'">
          <span v-if="modpack.remote_source?.url" class="status-badge status-error" title="Sync Error">
            <Link2Off class="w-3.5 h-3.5" />
          </span>
          <span v-else class="status-badge status-error" title="Cloud Error">
            <CloudOff class="w-3.5 h-3.5" />
          </span>
        </template>
        <span v-else-if="modpack.cloudStatus === 'published'" class="status-badge status-published"
          title="Published to Cloud">
          <Cloud class="w-3.5 h-3.5" />
        </span>
        <span v-else-if="modpack.cloudStatus === 'subscribed' || modpack.remote_source?.url"
          class="status-badge status-synced" title="Synced from Remote">
          <Link2 class="w-3.5 h-3.5" />
        </span>
        <span v-if="modpack.hasUnsavedChanges" class="status-badge status-unsaved" title="Unsaved Changes">
          <CircleDot class="w-3.5 h-3.5" />
        </span>
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
          <Play class="w-5 h-5 fill-current" />
        </button>
        <div v-else class="dock-running">
          <span class="running-pulse" />
        </div>

        <div class="dock-divider" />

        <button class="dock-btn" @click.stop="$emit('edit', modpack.id)" title="Edit">
          <Edit class="w-4 h-4" />
        </button>
        <button class="dock-btn" @click.stop="$emit('share', modpack.id, modpack.name)" title="Share">
          <Share2 class="w-4 h-4" />
        </button>
        <button class="dock-btn" @click.stop="$emit('open-folder', modpack.id)" title="Open Folder">
          <FolderOpen class="w-4 h-4" />
        </button>

        <!-- More menu -->
        <div class="dock-more">
          <button class="dock-btn" @click.stop="showMenu = !showMenu">
            <MoreVertical class="w-4 h-4" />
          </button>

          <Transition enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2 scale-95" enter-to-class="opacity-100 translate-y-0 scale-100"
            leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100 translate-y-0 scale-100"
            leave-to-class="opacity-0 translate-y-2 scale-95">
            <div v-if="showMenu" class="dock-menu">
              <button class="menu-item" @click.stop="$emit('clone', modpack.id); showMenu = false;">
                <Copy class="w-4 h-4" />
                <span>Duplicate</span>
              </button>
              <button class="menu-item" @click.stop="$emit('convert', modpack.id); showMenu = false;">
                <RefreshCw class="w-4 h-4" />
                <span>Convert Loader</span>
              </button>
              <div class="menu-sep" />
              <button class="menu-item menu-danger" @click.stop="$emit('delete', modpack.id); showMenu = false;">
                <Trash2 class="w-4 h-4" />
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
  border-radius: 16px;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border) / 0.5);
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
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  background: rgba(249, 115, 22, 0.2);
  color: rgb(251, 146, 60);
}

.badge-cloud {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.badge-sync {
  background: rgba(168, 85, 247, 0.2);
  color: rgb(192, 132, 252);
}

.badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
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
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.loader-forge {
  background: rgba(249, 115, 22, 0.15);
  color: rgb(251, 146, 60);
}

.loader-fabric {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(252, 211, 77);
}

.loader-neoforge {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

.loader-quilt {
  background: rgba(168, 85, 247, 0.15);
  color: rgb(192, 132, 252);
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
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(251, 191, 36, 0.15);
  color: rgb(251, 191, 36);
  border: 1px solid rgba(251, 191, 36, 0.3);
  animation: pulse-subtle 2s ease-in-out infinite;
}

/* Rest - Selection */
.rest-select {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
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
}

/* Rest - Favorite */
.rest-fav {
  position: absolute;
  bottom: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: hsl(var(--muted) / 0.8);
  border: 1px solid hsl(var(--border) / 0.5);
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
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.3);
  color: rgb(251, 113, 133);
}

/* ═══════════════════════════════════════════════════════════════════
   HOVER STATE
   ═══════════════════════════════════════════════════════════════════ */
.card-hover {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  overflow: hidden;
  opacity: 0;
  transform: scale(1.02);
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
      rgba(0, 0, 0, 0.95) 0%,
      rgba(0, 0, 0, 0.5) 50%,
      rgba(0, 0, 0, 0.3) 100%);
}

/* Hover - Favorite (matches rest position) - ENTERS FROM RIGHT */
.hover-fav {
  position: absolute;
  bottom: 70px;
  right: 14px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
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
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: scale(1.05);
}

.hover-fav.is-active {
  background: rgba(244, 63, 94, 0.25);
  border-color: rgba(244, 63, 94, 0.4);
  color: rgb(251, 113, 133);
}

/* Hover - Selection (matches rest position) - ENTERS FROM TOP-RIGHT */
.hover-select {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
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
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.15);
}

.hover-select.is-checked {
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
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
  border-radius: 20px;
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
  color: white;
  line-height: 1.2;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
  color: rgba(255, 255, 255, 0.6);
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
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
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
  border-radius: 10px;
  background: white;
  color: black;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.dock-play:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25);
}

.dock-running {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: hsl(var(--primary) / 0.2);
  border: 1px solid hsl(var(--primary) / 0.4);
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
  background: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

.dock-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.dock-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
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
  border-radius: 12px;
  background: hsl(var(--popover) / 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid hsl(var(--border));
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
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
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 30px -5px hsl(var(--primary) / 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
  border-radius: 16px;
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
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: transform 0.2s ease;
}

.status-badge:hover {
  transform: scale(1.1);
}

.status-cf {
  background: rgba(249, 115, 22, 0.25);
  color: rgb(251, 146, 60);
  border-color: rgba(249, 115, 22, 0.4);
}

.status-published {
  background: rgba(34, 197, 94, 0.25);
  color: rgb(74, 222, 128);
  border-color: rgba(34, 197, 94, 0.4);
}

.status-synced {
  background: rgba(168, 85, 247, 0.25);
  color: rgb(192, 132, 252);
  border-color: rgba(168, 85, 247, 0.4);
}

.status-error {
  background: rgba(239, 68, 68, 0.25);
  color: rgb(248, 113, 113);
  border-color: rgba(239, 68, 68, 0.4);
}

.status-unsaved {
  background: rgba(251, 191, 36, 0.25);
  color: rgb(252, 211, 77);
  border-color: rgba(251, 191, 36, 0.4);
  animation: pulse-subtle 2s ease-in-out infinite;
}
</style>
