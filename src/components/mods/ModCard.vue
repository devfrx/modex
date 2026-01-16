<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import { computed, ref } from "vue";
import type { Mod } from "@/types/electron";

const props = defineProps<{
    mod: Mod;
    selected?: boolean;
    favorite?: boolean;
    isDuplicate?: boolean;
    showThumbnail?: boolean;
    usageCount?: number;
    groupVariantCount?: number;
    isGroupExpanded?: boolean;
    isVariant?: boolean;
}>();

const emit = defineEmits<{
    (e: "delete", id: string): void;
    (e: "edit", id: string): void;
    (e: "toggle-select", id: string): void;
    (e: "show-details", mod: Mod): void;
    (e: "toggle-favorite", id: string): void;
    (e: "request-update", mod: Mod): void;
    (e: "toggle-group"): void;
}>();

const showMenu = ref(false);

function openCurseForge() {
    if (!props.mod.slug) return;
    const baseUrl = "https://www.curseforge.com/minecraft";
    let path = "mc-mods";
    if (props.mod.content_type === "resourcepack") path = "texture-packs";
    if (props.mod.content_type === "shader") path = "customization";
    window.open(`${baseUrl}/${path}/${props.mod.slug}`, "_blank");
}

function handleImageError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
}

// Content type config
const contentTypeConfig = {
    mod: { label: "Mod", icon: "Layers", class: "type-mod" },
    resourcepack: { label: "Resource", icon: "Image", class: "type-resource" },
    shader: { label: "Shader", icon: "Sparkles", class: "type-shader" },
};

const contentType = props.mod.content_type || "mod";
const typeConfig = contentTypeConfig[contentType] || contentTypeConfig.mod;

const loaderClass = computed(() => {
    const loader = props.mod.loader?.toLowerCase() || '';
    if (loader.includes('forge') && !loader.includes('neo')) return 'loader-forge';
    if (loader.includes('fabric')) return 'loader-fabric';
    if (loader.includes('neoforge')) return 'loader-neoforge';
    if (loader.includes('quilt')) return 'loader-quilt';
    return 'loader-default';
});

const imageUrl = computed(() => {
    return props.mod.logo_url || props.mod.thumbnail_url || null;
});
</script>

<template>
    <div class="mod-card" :class="{
        'is-selected': selected,
        'is-favorite': favorite,
        'is-duplicate': isDuplicate,
        'is-variant': isVariant,
        'menu-open': showMenu
    }" @click="$emit('toggle-select', mod.id)" @dblclick.stop="$emit('show-details', mod)"
        @mouseleave="showMenu = false">
        <!-- ═══════════════════════════════════════════════════════════
         RESTING STATE
         ═══════════════════════════════════════════════════════════ -->
        <div class="card-rest">
            <!-- Image area -->
            <div class="rest-image">
                <img v-if="showThumbnail && imageUrl" :src="imageUrl" alt="" @error="handleImageError" />
                <div v-else class="rest-image-placeholder">
                    <Icon name="Box" class="w-8 h-8 text-muted-foreground/30" />
                </div>
                <div class="rest-image-fade" />

                <!-- Status badges -->
                <div class="rest-badges">
                    <span v-if="isDuplicate" class="badge-warning" title="Potential duplicate">
                        <Icon name="AlertTriangle" class="w-3 h-3" />
                    </span>
                    <span v-if="usageCount && usageCount > 0" class="badge-usage" title="Used in modpacks">
                        <Icon name="Package" class="w-2.5 h-2.5" />
                        <span>{{ usageCount }}</span>
                    </span>
                </div>

                <!-- Type badge -->
                <div class="rest-type" :class="typeConfig.class">
                    <Icon :name="typeConfig.icon" class="w-3 h-3" />
                    <span>{{ typeConfig.label }}</span>
                </div>
            </div>

            <!-- Info section -->
            <div class="rest-info">
                <h3 class="rest-title">{{ mod.name }}</h3>
                <p class="rest-author">{{ mod.author || "Unknown Author" }}</p>

                <div class="rest-meta">
                    <span v-if="mod.loader" class="rest-loader" :class="loaderClass">{{ mod.loader }}</span>
                    <span v-if="mod.game_versions?.length || mod.game_version" class="rest-version">
                        {{ mod.game_versions?.[0] || mod.game_version }}
                        <span v-if="mod.game_versions && mod.game_versions.length > 1" class="rest-version-more">
                            +{{ mod.game_versions.length - 1 }}
                        </span>
                    </span>
                </div>

                <!-- Group indicator -->
                <button v-if="groupVariantCount && groupVariantCount > 0" class="rest-group-btn"
                    :class="{ 'is-expanded': isGroupExpanded }" @click.stop="$emit('toggle-group')">
                    <Icon name="Layers" class="w-3 h-3" />
                    <span>{{ groupVariantCount }} versions</span>
                    <Icon name="ChevronDown" class="w-3 h-3 chevron" />
                </button>
            </div>

            <!-- Selection checkbox -->
            <div class="rest-select" :class="{ 'is-checked': selected }">
                <Icon v-if="selected" name="Check" class="w-3.5 h-3.5" />
            </div>

            <!-- Favorite button -->
            <button class="rest-fav" :class="{ 'is-active': favorite }" @click.stop="$emit('toggle-favorite', mod.id)">
                <Icon name="Heart" class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
            </button>
        </div>

        <!-- ═══════════════════════════════════════════════════════════
         HOVER STATE
         ═══════════════════════════════════════════════════════════ -->
        <div class="card-hover">
            <!-- Backdrop -->
            <div class="hover-backdrop">
                <img v-if="showThumbnail && imageUrl" :src="imageUrl" alt="" @error="handleImageError" />
                <div v-else class="hover-backdrop-placeholder">
                    <Icon name="Box" class="w-12 h-12 text-white/10" />
                </div>
                <div class="hover-overlay" />
            </div>

            <!-- Favorite -->
            <button class="hover-fav" :class="{ 'is-active': favorite }" @click.stop="$emit('toggle-favorite', mod.id)">
                <Icon name="Heart" class="w-4 h-4" :fill="favorite ? 'currentColor' : 'none'" />
            </button>

            <!-- Selection -->
            <div class="hover-select" :class="{ 'is-checked': selected }" @click.stop="$emit('toggle-select', mod.id)">
                <Icon v-if="selected" name="Check" class="w-3.5 h-3.5" />
            </div>

            <!-- Duplicate warning -->
            <div v-if="isDuplicate" class="hover-warning">
                <Icon name="AlertTriangle" class="w-3.5 h-3.5" />
                <span>Duplicate</span>
            </div>

            <!-- Hero section -->
            <div class="hover-hero">
                <h2 class="hover-title">{{ mod.name }}</h2>
                <p class="hover-author">by {{ mod.author || "Unknown" }}</p>
                <div class="hover-tags">
                    <span class="hover-tag" :class="typeConfig.class">{{ typeConfig.label }}</span>
                    <span v-if="mod.loader" class="hover-tag" :class="loaderClass">{{ mod.loader }}</span>
                    <span v-if="mod.game_versions?.length" class="hover-tag">
                        {{ mod.game_versions[0] }}
                    </span>
                </div>
            </div>

            <!-- Action dock -->
            <div class="hover-dock" @click.stop>
                <button class="dock-primary" @click.stop="$emit('show-details', mod)">
                    <Icon name="Info" class="w-4 h-4" />
                    <span>Details</span>
                </button>

                <div class="dock-divider" />

                <button v-if="mod.cf_project_id" class="dock-btn" @click.stop="$emit('request-update', mod)"
                    title="Check Update">
                    <Icon name="RefreshCw" class="w-4 h-4" />
                </button>
                <button v-if="mod.slug" class="dock-btn" @click.stop="openCurseForge" title="CurseForge">
                    <Icon name="Globe" class="w-4 h-4" />
                </button>

                <!-- More menu -->
                <div class="dock-more">
                    <button class="dock-btn" @click.stop="showMenu = !showMenu">
                        <Icon name="MoreVertical" class="w-4 h-4" />
                    </button>

                    <Transition enter-active-class="transition duration-200 ease-out"
                        enter-from-class="opacity-0 translate-y-2 scale-95"
                        enter-to-class="opacity-100 translate-y-0 scale-100"
                        leave-active-class="transition duration-150 ease-in"
                        leave-from-class="opacity-100 translate-y-0 scale-100"
                        leave-to-class="opacity-0 translate-y-2 scale-95">
                        <div v-if="showMenu" class="dock-menu">
                            <button class="menu-item menu-danger"
                                @click.stop="$emit('delete', mod.id); showMenu = false;">
                                <Icon name="Trash2" class="w-4 h-4" />
                                <span>Delete from Library</span>
                            </button>
                        </div>
                    </Transition>
                </div>
            </div>

            <!-- Variant indicator -->
            <div v-if="isVariant" class="hover-variant">
                <span class="variant-dot" />
                {{ mod.game_version }} • {{ mod.loader }}
            </div>

            <!-- Group expand button (visible on hover when group has variants) -->
            <button v-if="groupVariantCount && groupVariantCount > 0" class="hover-group-btn"
                :class="{ 'is-expanded': isGroupExpanded }" @click.stop="$emit('toggle-group')">
                <Icon name="Layers" class="w-3.5 h-3.5" />
                <span>{{ groupVariantCount }} versions</span>
                <Icon name="ChevronDown" class="w-3.5 h-3.5 chevron" />
            </button>

            <!-- Animated border -->
            <div class="hover-glow-border" />
        </div>
    </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
   CARD CONTAINER
   ═══════════════════════════════════════════════════════════════════ */
.mod-card {
    position: relative;
    width: 100%;
    height: 240px;
    cursor: pointer;
    perspective: 1200px;
}

.mod-card.menu-open {
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
    border-radius: 14px;
    overflow: hidden;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border) / 0.5);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.mod-card:hover .card-rest {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
    pointer-events: none;
}

.mod-card.is-selected .card-rest {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.3);
}

.mod-card.is-duplicate .card-rest {
    border-color: rgb(249, 115, 22);
    box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.3);
}

/* Rest - Image */
.rest-image {
    position: relative;
    height: 100px;
    overflow: hidden;
    background: hsl(var(--muted) / 0.3);
}

.rest-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
}

.rest-image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.2));
}

.rest-image-fade {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 40%, hsl(var(--card)) 100%);
}

/* Rest - Badges */
.rest-badges {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 4px;
}

.rest-badges>span {
    padding: 4px 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.badge-warning {
    background: rgba(249, 115, 22, 0.8);
    color: white;
    animation: pulse-subtle 2s ease-in-out infinite;
}

.badge-usage {
    background: hsl(var(--primary) / 0.9);
    color: hsl(var(--primary-foreground));
}

/* Rest - Type badge */
.rest-type {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.type-mod {
    background: hsl(var(--primary) / 0.8);
    color: hsl(var(--primary-foreground));
}

.type-resource {
    background: rgba(59, 130, 246, 0.8);
    color: white;
}

.type-shader {
    background: rgba(236, 72, 153, 0.8);
    color: white;
}

/* Rest - Info */
.rest-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px 12px 12px;
}

.rest-title {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    line-height: 1.3;
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.rest-author {
    font-size: 10px;
    color: hsl(var(--muted-foreground) / 0.7);
    margin-bottom: 8px;
}

.rest-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
}

.rest-loader {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
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
    font-size: 10px;
    color: hsl(var(--muted-foreground));
}

.rest-version-more {
    opacity: 0.6;
}

/* Rest - Group button */
.rest-group-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 500;
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border) / 0.5);
    transition: all 0.2s ease;
}

.rest-group-btn:hover {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
}

.rest-group-btn.is-expanded {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
}

.rest-group-btn .chevron {
    transition: transform 0.2s ease;
}

.rest-group-btn.is-expanded .chevron {
    transform: rotate(180deg);
}

/* Rest - Selection */
.rest-select {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.2s ease;
}

.mod-card:hover .rest-select,
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
    bottom: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border-radius: 8px;
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

.mod-card:hover .rest-fav,
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
    border-radius: 14px;
    overflow: hidden;
    opacity: 0;
    transform: scale(1.02);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow:
        0 20px 40px -10px rgba(0, 0, 0, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.mod-card:hover .card-hover {
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

.hover-backdrop-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)));
}

.hover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top,
            rgba(0, 0, 0, 0.95) 0%,
            rgba(0, 0, 0, 0.5) 50%,
            rgba(0, 0, 0, 0.3) 100%);
}

/* Hover - Favorite - ENTERS FROM RIGHT */
.hover-fav {
    position: absolute;
    bottom: 60px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: translateX(15px);
    transition:
        opacity 0.3s ease 0.15s,
        transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.15s,
        background 0.2s ease,
        color 0.2s ease;
}

.mod-card:hover .hover-fav {
    opacity: 1;
    transform: translateX(0);
}

.hover-fav:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
}

.hover-fav.is-active {
    background: rgba(244, 63, 94, 0.25);
    border-color: rgba(244, 63, 94, 0.4);
    color: rgb(251, 113, 133);
}

/* Hover - Selection - ENTERS FROM TOP-RIGHT */
.hover-select {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    cursor: pointer;
    opacity: 0;
    transform: translate(12px, -12px) scale(0.8);
    transition:
        opacity 0.3s ease 0.1s,
        transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s,
        background 0.2s ease,
        border-color 0.2s ease;
}

.mod-card:hover .hover-select {
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

/* Hover - Warning - ENTERS FROM TOP-LEFT */
.hover-warning {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border-radius: 8px;
    background: rgba(249, 115, 22, 0.9);
    color: white;
    font-size: 10px;
    font-weight: 600;
    opacity: 0;
    transform: translate(-12px, -12px) scale(0.8);
    transition:
        opacity 0.3s ease 0.1s,
        transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}

.mod-card:hover .hover-warning {
    opacity: 1;
    transform: translate(0, 0) scale(1);
}

/* Hover - Hero - ENTERS FROM LEFT */
.hover-hero {
    position: absolute;
    left: 12px;
    right: 50px;
    bottom: 58px;
}

.hover-title {
    font-size: 15px;
    font-weight: 700;
    color: white;
    line-height: 1.2;
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transform: translateX(-20px);
    transition:
        opacity 0.35s ease 0.08s,
        transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.08s;
}

.mod-card:hover .hover-title {
    opacity: 1;
    transform: translateX(0);
}

.hover-author {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 6px;
    opacity: 0;
    transform: translateX(-15px);
    transition:
        opacity 0.35s ease 0.12s,
        transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.12s;
}

.mod-card:hover .hover-author {
    opacity: 1;
    transform: translateX(0);
}

.hover-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    opacity: 0;
    transform: translateX(-15px);
    transition:
        opacity 0.35s ease 0.16s,
        transform 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.16s;
}

.mod-card:hover .hover-tags {
    opacity: 1;
    transform: translateX(0);
}

.hover-tag {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.3px;
}

/* Hover - Action Dock - ENTERS FROM BOTTOM */
.hover-dock {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    opacity: 0;
    transform: translateY(20px);
    transition:
        opacity 0.35s ease 0.12s,
        transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s;
}

.mod-card:hover .hover-dock {
    opacity: 1;
    transform: translateY(0);
}

.dock-primary {
    flex: 1;
    height: 30px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    background: white;
    color: black;
    transition: all 0.2s ease;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.dock-primary:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
}

.dock-divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 2px;
}

.dock-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
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
    margin-bottom: 6px;
    width: 160px;
    padding: 4px;
    border-radius: 10px;
    background: hsl(var(--popover) / 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4);
}

.menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 12px;
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

/* Hover - Variant indicator */
.hover-variant {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    background: hsl(var(--primary) / 0.9);
    color: hsl(var(--primary-foreground));
    font-size: 10px;
    font-weight: 600;
}

.variant-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

/* Hover - Group expand button */
.hover-group-btn {
    position: absolute;
    bottom: 60px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    background: hsl(var(--muted) / 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--border) / 0.5);
    color: hsl(var(--foreground));
    font-size: 11px;
    font-weight: 600;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
    z-index: 10;
}

.mod-card:hover .hover-group-btn {
    opacity: 1;
    transform: translateY(0);
}

.hover-group-btn:hover {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
}

.hover-group-btn.is-expanded {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
}

.hover-group-btn .chevron {
    transition: transform 0.2s ease;
}

.hover-group-btn.is-expanded .chevron {
    transform: rotate(180deg);
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED BORDER
   ═══════════════════════════════════════════════════════════════════ */
.hover-glow-border {
    position: absolute;
    inset: 0;
    border-radius: 14px;
    pointer-events: none;
    border: 1.4px solid transparent;
    opacity: 0;
    transition: all 0.3s ease;
}

.mod-card:hover .hover-glow-border {
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

/* ═══════════════════════════════════════════════════════════════════
   SPECIAL STATES
   ═══════════════════════════════════════════════════════════════════ */
.mod-card.is-favorite .rest-fav {
    opacity: 1;
    transform: scale(1);
}
</style>
