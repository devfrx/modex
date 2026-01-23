<script setup lang="ts">
/**
 * GameSelector - Switch between Minecraft and Hytale
 * 
 * Shows in the sidebar header to allow switching between games.
 * Each game has different features:
 * - Minecraft: instances, mod loaders, resource packs, shaders
 * - Hytale: single mods folder, no mod loaders, virtual modpacks
 */

import { ref, onMounted, watch, computed, onUnmounted } from "vue";
import { createLogger } from "@/utils/logger";
import type { GameType, GameConfig } from "@/types";
import Icon from "@/components/ui/Icon.vue";

const log = createLogger("GameSelector");

// Game icons from assets
import minecraftIcon from "@/assets/metro_minecraft.ico";
import hytaleIcon from "@/assets/hytale.ico";

const props = defineProps<{
    currentGame?: GameType;
    disabled?: boolean;
    collapsed?: boolean;
}>();

const emit = defineEmits<{
    (e: "change", gameType: GameType): void;
}>();

// Use prop if provided, otherwise use internal state
const internalGame = ref<GameType>("minecraft");
const activeGame = computed(() => props.currentGame || internalGame.value);
const isOpen = ref(false);
const dropdownRef = ref<HTMLDivElement | null>(null);

const games = ref<Record<GameType, { installed: boolean; config?: GameConfig }>>({
    minecraft: { installed: true },
    hytale: { installed: false },
});
const isLoading = ref(true);

const gameInfo: Record<GameType, { name: string; icon: string; description: string }> = {
    minecraft: {
        name: "Minecraft",
        icon: "⛏️",
        description: "With mod loaders & instances",
    },
    hytale: {
        name: "Hytale",
        icon: "🎮",
        description: "Built-in modding support",
    },
};

async function loadGameData() {
    isLoading.value = true;
    try {
        // Get current active game type if not provided via props
        if (!props.currentGame) {
            internalGame.value = await window.api.game.getActiveGameType();
        }

        // Detect installed games
        const detection = await window.api.game.detectAllGames();

        // Get game configs
        for (const gameType of ["minecraft", "hytale"] as GameType[]) {
            const config = await window.api.game.getGameConfig(gameType);
            games.value[gameType] = {
                installed: detection[gameType]?.installed || false,
                config,
            };
        }
    } catch (error) {
        log.error("Error loading game data", { error: String(error) });
    } finally {
        isLoading.value = false;
    }
}

async function selectGame(gameType: GameType) {
    if (gameType === activeGame.value) {
        isOpen.value = false;
        return;
    }
    if (props.disabled) return;

    internalGame.value = gameType;
    isOpen.value = false;
    emit("change", gameType);
}

// Get icon image based on game type
function getGameIcon(gameType: GameType): string {
    return gameType === "minecraft" ? minecraftIcon : hytaleIcon;
}

// Get list of game types for iteration
const gameTypes = computed<GameType[]>(() => Object.keys(games.value) as GameType[]);

// Close on click outside
function handleClickOutside(event: MouseEvent) {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        isOpen.value = false;
    }
}

onMounted(() => {
    loadGameData();
    document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
    <div ref="dropdownRef" class="relative">
        <!-- Trigger Button -->
        <button :disabled="disabled" @click="isOpen = !isOpen"
            class="flex items-center w-full rounded-lg bg-muted/50 hover:bg-muted/80 border border-border/30 hover:border-border/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="[
                collapsed ? 'justify-center p-2' : 'gap-2 px-2.5 py-2',
                isOpen && 'border-primary/40 bg-muted/70'
            ]" :title="collapsed ? gameInfo[activeGame].name : undefined">
            <img :src="getGameIcon(activeGame)" :alt="gameInfo[activeGame].name" class="w-5 h-5 shrink-0" />
            <template v-if="!collapsed">
                <span class="flex-1 text-left font-medium text-sm text-foreground">
                    {{ gameInfo[activeGame].name }}
                </span>
                <Icon name="ChevronDown" class="w-4 h-4 text-muted-foreground transition-transform duration-200"
                    :class="isOpen && 'rotate-180'" />
            </template>
        </button>

        <!-- Dropdown Content -->
        <Transition name="dropdown">
            <div v-if="isOpen"
                class="absolute left-0 top-full mt-1.5 w-56 z-50 bg-popover border border-border/50 rounded-lg shadow-xl overflow-hidden">
                <div class="p-1">
                    <button v-for="gameType in gameTypes" :key="gameType" :disabled="!games[gameType].installed"
                        @click="selectGame(gameType)"
                        class="flex items-center gap-3 w-full mb-1 px-2.5 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        :class="activeGame === gameType ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/60'">
                        <div class="flex items-center justify-center w-8 h-8 rounded-md bg-muted/60 shrink-0">
                            <img :src="getGameIcon(gameType)" :alt="gameInfo[gameType].name" class="w-5 h-5" />
                        </div>
                        <div class="flex-1 text-left min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-medium text-sm">{{ gameInfo[gameType].name }}</span>
                                <span v-if="!games[gameType].installed"
                                    class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    Not installed
                                </span>
                            </div>
                            <p class="text-[11px] text-muted-foreground truncate">
                                {{ gameInfo[gameType].description }}
                            </p>
                        </div>
                        <Icon v-if="activeGame === gameType" name="Check" class="w-4 h-4 text-primary shrink-0" />
                    </button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.15s ease-out;
}

.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>
