<template>
  <div class="h-full flex flex-col" :class="isLightMode ? 'bg-slate-50' : 'bg-[#0c0c0c]'">
    <!-- Header -->
    <div class="px-5 py-3 border-b flex items-center gap-4 flex-wrap" :class="isLightMode ? 'border-black/5' : 'border-white/5'">
      <h2 class="text-sm font-medium" :class="isLightMode ? 'text-black/90' : 'text-white/90'">Sandbox</h2>
      
      <!-- Search -->
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search nodes..."
          class="w-40 px-3 py-1.5 text-xs rounded-md outline-none transition-all"
          :class="isLightMode 
            ? 'bg-black/5 text-black/70 placeholder:text-black/30 focus:bg-black/10' 
            : 'bg-white/5 text-white/70 placeholder:text-white/30 focus:bg-white/10'"
        />
        <div v-if="searchResults.length > 0" class="absolute top-full left-0 mt-1 w-48 rounded-md shadow-lg z-50 max-h-48 overflow-auto"
          :class="isLightMode ? 'bg-white border border-black/10' : 'bg-zinc-900 border border-white/10'">
          <button
            v-for="node in searchResults.slice(0, 8)"
            :key="node.id"
            class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
            :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
            @click="focusOnNode(node)"
          >
            <span :class="node.type === 'folder' ? 'text-amber-500' : node.type === 'mod' ? 'text-emerald-500' : 'text-violet-500'">●</span>
            {{ node.label }}
          </button>
        </div>
      </div>
      
      <!-- Filters -->
      <div class="flex items-center gap-3 text-xs">
        <label class="flex items-center gap-1.5 cursor-pointer" :class="isLightMode ? 'text-black/60' : 'text-white/60'">
          <input type="checkbox" v-model="showFolders" class="accent-amber-500" />
          <span class="text-amber-500">Folders</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer" :class="isLightMode ? 'text-black/60' : 'text-white/60'">
          <input type="checkbox" v-model="showMods" class="accent-emerald-500" />
          <span class="text-emerald-500">Mods</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer" :class="isLightMode ? 'text-black/60' : 'text-white/60'">
          <input type="checkbox" v-model="showModpacks" class="accent-violet-500" />
          <span class="text-violet-500">Modpacks</span>
        </label>
      </div>
      
      <div class="flex gap-2 ml-auto">
        <button
          class="px-3 py-1.5 text-xs rounded-md transition-all"
          :class="isLightMode 
            ? 'bg-black/5 text-black/70 hover:bg-black/10 hover:text-black' 
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'"
          @click="spreadNodes"
        >
          Spread
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded-md transition-all"
          :class="isLightMode 
            ? 'bg-black/5 text-black/70 hover:bg-black/10 hover:text-black' 
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'"
          @click="resetLayout"
        >
          Reset
        </button>
        <button
          v-if="hasSavedPositions"
          class="px-3 py-1.5 text-xs rounded-md bg-red-500/10 text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-all"
          @click="clearSavedPositions"
        >
          Clear Saved
        </button>
      </div>
    </div>

    <!-- Legend -->
    <div class="px-5 py-2 border-b flex items-center gap-6 text-xs" 
      :class="isLightMode ? 'border-black/5 text-black/50' : 'border-white/5 text-white/50'">
      <span class="flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <span>Folder</span>
      </span>
      <span class="flex items-center gap-2">
        <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
        </svg>
        <span>Mod</span>
      </span>
      <span class="flex items-center gap-2">
        <svg class="w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 7.5v9l-4 2.25L12 21l-4-2.25L4 16.5v-9L8 5.25 12 3l4 2.25L20 7.5z"/>
        </svg>
        <span>Modpack</span>
      </span>
      <span class="ml-auto" :class="isLightMode ? 'text-black/30' : 'text-white/30'">{{ filteredNodes.length }} / {{ nodes.length }} nodes</span>
    </div>

    <!-- Canvas -->
    <div class="flex-1 relative overflow-hidden" ref="container" @click="closeContextMenu" @contextmenu.prevent>
      <svg
        ref="svgEl"
        :width="width"
        :height="height"
        class="w-full h-full"
      >
        <defs>
          <!-- Subtle glow -->
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Background -->
        <rect width="100%" height="100%" :fill="bgColor"/>
        
        <!-- Subtle dots pattern -->
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.5" :fill="dotColor"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#dots)"/>

        <g ref="zoomGroup">
          <!-- Links -->
          <g class="links">
            <line
              v-for="link in renderedLinks"
              :key="`${link.source.id}-${link.target.id}`"
              :x1="link.source.x"
              :y1="link.source.y"
              :x2="link.target.x"
              :y2="link.target.y"
              :stroke="linkColor"
              stroke-width="1"
            />
          </g>

          <!-- Nodes -->
          <g class="nodes">
            <g
              v-for="node in filteredNodes"
              :key="node.id"
              :transform="`translate(${node.x ?? 0}, ${node.y ?? 0})`"
              class="node-group"
              :class="{ 'drop-target': dropTarget?.id === node.id }"
              @mousedown="onDragStart($event, node)"
              @touchstart.prevent="onDragStart($event, node)"
              @contextmenu.prevent.stop="openContextMenu($event, node)"
            >
              <!-- Drop target highlight ring -->
              <circle 
                v-if="dropTarget?.id === node.id" 
                :r="nodeRadius(node) + 8" 
                fill="none" 
                stroke="#8b5cf6" 
                stroke-width="2"
                stroke-dasharray="4 2"
                class="animate-pulse"
              />
              
              <!-- Folder icon -->
              <template v-if="node.type === 'folder'">
                <circle r="20" fill="rgba(251, 191, 36, 0.1)" class="node-bg"/>
                <g transform="translate(-10, -10) scale(0.85)">
                  <path 
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    fill="#fbbf24"
                    filter="url(#softGlow)"
                  />
                </g>
              </template>

              <!-- Mod icon (cube) -->
              <template v-else-if="node.type === 'mod'">
                <circle r="14" fill="rgba(52, 211, 153, 0.1)" class="node-bg"/>
                <g transform="translate(-8, -8) scale(0.7)">
                  <path 
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    fill="none"
                    stroke="#34d399"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    filter="url(#softGlow)"
                  />
                </g>
              </template>

              <!-- Modpack icon (package) -->
              <template v-else>
                <circle r="18" fill="rgba(139, 92, 246, 0.1)" class="node-bg"/>
                <g transform="translate(-10, -10) scale(0.85)">
                  <path 
                    d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
                    fill="none"
                    stroke="#8b5cf6"
                    stroke-width="1.5"
                    filter="url(#softGlow)"
                  />
                  <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="#8b5cf6" stroke-width="1.5"/>
                </g>
              </template>

              <!-- Label below -->
              <text
                :y="node.type === 'folder' ? 32 : node.type === 'mod' ? 26 : 30"
                text-anchor="middle"
                :fill="node.type === 'folder' ? 'rgba(251, 191, 36, 0.9)' : node.type === 'mod' ? 'rgba(52, 211, 153, 0.9)' : 'rgba(139, 92, 246, 0.9)'"
                font-size="9"
                font-weight="500"
                pointer-events="none"
                class="select-none"
              >{{ node.label }}</text>
            </g>
          </g>
        </g>
      </svg>

      <!-- Minimap -->
      <div class="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border shadow-lg"
        :class="isLightMode ? 'bg-white/90 border-black/10' : 'bg-zinc-900/90 border-white/10'">
        <svg :viewBox="`0 0 ${width} ${height}`" class="w-full h-full">
          <rect width="100%" height="100%" :fill="isLightMode ? '#f1f5f9' : '#18181b'" />
          <circle
            v-for="node in filteredNodes"
            :key="'mini-' + node.id"
            :cx="node.x ?? 0"
            :cy="node.y ?? 0"
            :r="4"
            :fill="node.type === 'folder' ? '#fbbf24' : node.type === 'mod' ? '#34d399' : '#8b5cf6'"
          />
        </svg>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center" :class="isLightMode ? 'bg-slate-50' : 'bg-[#0c0c0c]'">
        <div class="text-sm" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Loading...</div>
      </div>
      
      <!-- Feedback message -->
      <Transition name="fade">
        <div 
          v-if="feedbackMessage" 
          class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg shadow-lg"
        >
          {{ feedbackMessage }}
        </div>
      </Transition>
      
      <!-- Drag hint -->
      <div 
        v-if="draggedNode?.type === 'mod'" 
        class="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs rounded-md backdrop-blur"
        :class="isLightMode ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/60'"
      >
        Drop on a modpack or folder
      </div>
      
      <!-- Context Menu -->
      <Transition name="fade">
        <div
          v-if="contextMenu.show"
          class="absolute z-50 min-w-[160px] rounded-lg shadow-xl border overflow-hidden"
          :class="isLightMode ? 'bg-white border-black/10' : 'bg-zinc-900 border-white/10'"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        >
          <div class="py-1">
            <div class="px-3 py-1.5 text-xs font-medium border-b" 
              :class="isLightMode ? 'text-black/40 border-black/5' : 'text-white/40 border-white/5'">
              {{ contextMenu.node?.label }}
            </div>
            
            <!-- Mod actions -->
            <template v-if="contextMenu.node?.type === 'mod'">
              <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
                :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
                @click="contextAction('viewMod')">
                <span>📄</span> View Details
              </button>
              <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
                :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
                @click="contextAction('removeFolderAssignment')">
                <span>📁</span> Remove from Folder
              </button>
            </template>
            
            <!-- Folder actions -->
            <template v-if="contextMenu.node?.type === 'folder'">
              <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
                :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
                @click="contextAction('viewFolder')">
                <span>📂</span> View Folder
              </button>
            </template>
            
            <!-- Modpack actions -->
            <template v-if="contextMenu.node?.type === 'modpack'">
              <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
                :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
                @click="contextAction('viewModpack')">
                <span>📦</span> View Modpack
              </button>
              <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
                :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
                @click="contextAction('exportModpack')">
                <span>📤</span> Export
              </button>
            </template>
            
            <!-- Common actions -->
            <div class="border-t my-1" :class="isLightMode ? 'border-black/5' : 'border-white/5'"></div>
            <button class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition-colors"
              :class="isLightMode ? 'hover:bg-black/5 text-black/70' : 'hover:bg-white/5 text-white/70'"
              @click="contextAction('centerOnNode')">
              <span>🎯</span> Center View
            </button>
          </div>
        </div>
      </Transition>
      
      <!-- Detail Panel -->
      <Transition name="slide">
        <div
          v-if="detailNode"
          class="absolute top-4 left-4 w-72 rounded-lg shadow-xl border overflow-hidden z-40"
          :class="isLightMode ? 'bg-white border-black/10' : 'bg-zinc-900 border-white/10'"
        >
          <!-- Header -->
          <div class="px-4 py-3 border-b flex items-center justify-between"
            :class="isLightMode ? 'border-black/5 bg-black/5' : 'border-white/5 bg-white/5'">
            <div class="flex items-center gap-2">
              <span :class="detailNode.type === 'folder' ? 'text-amber-500' : detailNode.type === 'mod' ? 'text-emerald-500' : 'text-violet-500'">
                {{ detailNode.type === 'folder' ? '📁' : detailNode.type === 'mod' ? '📦' : '🎮' }}
              </span>
              <span class="font-medium text-sm" :class="isLightMode ? 'text-black/90' : 'text-white/90'">
                {{ detailNode.type === 'folder' ? 'Folder' : detailNode.type === 'mod' ? 'Mod' : 'Modpack' }} Details
              </span>
            </div>
            <button 
              @click="detailNode = null"
              class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              :class="isLightMode ? 'text-black/50 hover:text-black' : 'text-white/50 hover:text-white'"
            >
              ✕
            </button>
          </div>
          
          <!-- Content -->
          <div class="p-4 space-y-3">
            <!-- Name -->
            <div>
              <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Name</div>
              <div class="text-sm font-medium" :class="isLightMode ? 'text-black/90' : 'text-white/90'">
                {{ detailNode.data?.name || detailNode.label }}
              </div>
            </div>
            
            <!-- Mod-specific info -->
            <template v-if="detailNode.type === 'mod'">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Version</div>
                  <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.version || '-' }}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Loader</div>
                  <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.loader || '-' }}</div>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Author</div>
                <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.author || 'Unknown' }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">File</div>
                <div class="text-xs font-mono truncate" :class="isLightMode ? 'text-black/50' : 'text-white/50'">{{ detailNode.data?.filename }}</div>
              </div>
            </template>
            
            <!-- Modpack-specific info -->
            <template v-if="detailNode.type === 'modpack'">
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Version</div>
                <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.version || '-' }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Description</div>
                <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.description || 'No description' }}</div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Mods</div>
                <div class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.mod_count || 0 }} mods</div>
              </div>
            </template>
            
            <!-- Folder-specific info -->
            <template v-if="detailNode.type === 'folder'">
              <div>
                <div class="text-xs uppercase tracking-wide mb-1" :class="isLightMode ? 'text-black/40' : 'text-white/40'">Color</div>
                <div class="flex items-center gap-2">
                  <span class="w-4 h-4 rounded" :style="{ backgroundColor: detailNode.data?.color || '#6366f1' }"></span>
                  <span class="text-sm" :class="isLightMode ? 'text-black/70' : 'text-white/70'">{{ detailNode.data?.color || 'Default' }}</span>
                </div>
              </div>
            </template>
          </div>
          
          <!-- Actions -->
          <div class="px-4 py-3 border-t flex gap-2"
            :class="isLightMode ? 'border-black/5 bg-black/5' : 'border-white/5 bg-white/5'">
            <button
              v-if="detailNode.type === 'mod'"
              class="flex-1 px-3 py-1.5 text-xs rounded transition-colors"
              :class="isLightMode ? 'bg-black/10 hover:bg-black/20 text-black/70' : 'bg-white/10 hover:bg-white/20 text-white/70'"
              @click="router.push('/library'); detailNode = null"
            >
              Go to Library
            </button>
            <button
              v-if="detailNode.type === 'modpack'"
              class="flex-1 px-3 py-1.5 text-xs rounded transition-colors"
              :class="isLightMode ? 'bg-black/10 hover:bg-black/20 text-black/70' : 'bg-white/10 hover:bg-white/20 text-white/70'"
              @click="router.push('/modpacks'); detailNode = null"
            >
              Go to Modpacks
            </button>
            <button
              v-if="detailNode.type === 'folder'"
              class="flex-1 px-3 py-1.5 text-xs rounded transition-colors"
              :class="isLightMode ? 'bg-black/10 hover:bg-black/20 text-black/70' : 'bg-white/10 hover:bg-white/20 text-white/70'"
              @click="router.push('/organize'); detailNode = null"
            >
              Go to Organize
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded transition-colors"
              :class="isLightMode ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'"
              @click="focusOnNode(detailNode); detailNode = null"
            >
              Focus
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { useFolderTree } from "@/composables/useFolderTree";
import type { Mod, Modpack } from "@/types/electron";
import * as d3 from "d3";

const POSITIONS_KEY = "modex:sandbox:positions";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: "folder" | "mod" | "modpack";
  label: string;
  color: string;
  data: any;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
}

interface SavedPosition {
  x: number;
  y: number;
}

const router = useRouter();
const { folders, getModFolder, moveModToFolder } = useFolderTree();

const width = ref(800);
const height = ref(600);
const container = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const zoomGroup = ref<SVGGElement | null>(null);

// Detail panel
const detailNode = ref<GraphNode | null>(null);

const nodes = shallowRef<GraphNode[]>([]);
const links = shallowRef<GraphLink[]>([]);
const isLoading = ref(true);

// Theme detection
const isLightMode = ref(document.documentElement.classList.contains("light"));

// Observe theme changes
const themeObserver = new MutationObserver(() => {
  isLightMode.value = document.documentElement.classList.contains("light");
});

// Filters
const showFolders = ref(true);
const showMods = ref(true);
const showModpacks = ref(true);

// Search
const searchQuery = ref("");
const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return [];
  const query = searchQuery.value.toLowerCase();
  return nodes.value.filter(n => n.label.toLowerCase().includes(query));
});

// Context menu
const contextMenu = ref<{ show: boolean; x: number; y: number; node: GraphNode | null }>({
  show: false, x: 0, y: 0, node: null
});

// Drag-to-add state
const draggedNode = ref<GraphNode | null>(null);
const dropTarget = ref<GraphNode | null>(null);
const feedbackMessage = ref<string | null>(null);
const hasSavedPositions = ref(false);

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

// Computed for filtered nodes/links
const filteredNodes = computed(() => {
  return nodes.value.filter(n => {
    if (n.type === "folder" && !showFolders.value) return false;
    if (n.type === "mod" && !showMods.value) return false;
    if (n.type === "modpack" && !showModpacks.value) return false;
    return true;
  });
});

const filteredLinks = computed(() => {
  const visibleIds = new Set(filteredNodes.value.map(n => n.id));
  return links.value.filter(l => visibleIds.has(l.source.id) && visibleIds.has(l.target.id));
});

const renderedLinks = computed(() => filteredLinks.value);

// Theme colors
const bgColor = computed(() => isLightMode.value ? "#f8fafc" : "#0c0c0c");
const dotColor = computed(() => isLightMode.value ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)");
const linkColor = computed(() => isLightMode.value ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)");
const textColor = computed(() => isLightMode.value ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)");
const textMuted = computed(() => isLightMode.value ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)");

// Check if there are saved positions
function checkSavedPositions() {
  const saved = localStorage.getItem(POSITIONS_KEY);
  hasSavedPositions.value = !!saved && saved !== "{}";
}

// Load saved positions from localStorage
function loadSavedPositions(): Record<string, SavedPosition> {
  try {
    const saved = localStorage.getItem(POSITIONS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

// Save positions to localStorage
function savePositions() {
  const positions: Record<string, SavedPosition> = {};
  nodes.value.forEach((n) => {
    if (n.x !== undefined && n.y !== undefined) {
      positions[n.id] = { x: n.x, y: n.y };
    }
  });
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

// Debounced save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSavePositions() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    savePositions();
    checkSavedPositions();
  }, 500);
}

// Clear saved positions
function clearSavedPositions() {
  localStorage.removeItem(POSITIONS_KEY);
  hasSavedPositions.value = false;
  resetLayout();
}

function nodeRadius(node: GraphNode) {
  return node.type === "folder" ? 24 : node.type === "modpack" ? 22 : 18;
}

async function loadData() {
  isLoading.value = true;
  checkSavedPositions();

  const mods: Mod[] = (await window.api.mods.getAll()) || [];
  const modpacks: Modpack[] = (await window.api.modpacks.getAll()) || [];
  const savedPositions = loadSavedPositions();

  const nodeList: GraphNode[] = [];
  const linkList: { source: string; target: string }[] = [];
  const nodeById = new Map<string, GraphNode>();

  const centerX = width.value / 2;
  const centerY = height.value / 2;

  // Folders - spread in a circle
  folders.value.forEach((f: any, i: number) => {
    const angle = (i / Math.max(folders.value.length, 1)) * Math.PI * 2;
    const radius = 150;
    const saved = savedPositions[f.id];
    const n: GraphNode = {
      id: f.id,
      type: "folder",
      label: f.name.slice(0, 12),
      color: f.color || "#6366f1",
      data: f,
      x: saved?.x ?? centerX + Math.cos(angle) * radius,
      y: saved?.y ?? centerY + Math.sin(angle) * radius,
    };
    nodeList.push(n);
    nodeById.set(n.id, n);
    if (f.parentId) {
      linkList.push({ source: f.parentId, target: f.id });
    }
  });

  // Mods - spread in outer ring
  mods.forEach((m, i) => {
    const angle = (i / Math.max(mods.length, 1)) * Math.PI * 2;
    const radius = 300;
    const saved = savedPositions[m.id];
    const n: GraphNode = {
      id: m.id,
      type: "mod",
      label: (m.name || "mod").slice(0, 10),
      color: "#10b981",
      data: m,
      x: saved?.x ?? centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
      y: saved?.y ?? centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
    };
    nodeList.push(n);
    nodeById.set(n.id, n);

    const folderId = getModFolder(m.id);
    if (folderId) {
      linkList.push({ source: folderId, target: m.id });
    }
  });

  // Modpacks - place on right side
  for (let i = 0; i < modpacks.length; i++) {
    const pack = modpacks[i];
    const nodeId = `pack_${pack.id}`;
    const saved = savedPositions[nodeId];
    const n: GraphNode = {
      id: nodeId,
      type: "modpack",
      label: (pack.name || "pack").slice(0, 10),
      color: "#f59e0b",
      data: pack,
      x: saved?.x ?? centerX + 400 + (Math.random() - 0.5) * 100,
      y: saved?.y ?? centerY - 150 + i * 80,
    };
    nodeList.push(n);
    nodeById.set(n.id, n);

    try {
      const modsInPack: Mod[] = await window.api.modpacks.getMods(pack.id);
      modsInPack.forEach((m) => {
        linkList.push({ source: m.id, target: n.id });
      });
    } catch (e) {
      console.warn("Failed to load mods for modpack:", pack.id, e);
    }
  }

  const graphLinks: GraphLink[] = [];
  linkList.forEach((l) => {
    const src = nodeById.get(l.source);
    const tgt = nodeById.get(l.target);
    if (src && tgt) {
      graphLinks.push({ source: src, target: tgt });
    }
  });

  nodes.value = nodeList;
  links.value = graphLinks;

  initSimulation();
  isLoading.value = false;
}

function initSimulation() {
  if (simulation) simulation.stop();

  const centerX = width.value / 2;
  const centerY = height.value / 2;

  simulation = d3
    .forceSimulation<GraphNode>(nodes.value)
    .force(
      "link",
      d3
        .forceLink<GraphNode, GraphLink>(links.value)
        .id((d) => d.id)
        .distance(80)
        .strength(0.3)
    )
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(centerX, centerY).strength(0.05))
    .force(
      "collision",
      d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 12)
    )
    .force("x", d3.forceX(centerX).strength(0.02))
    .force("y", d3.forceY(centerY).strength(0.02))
    .alphaDecay(0.01)
    .velocityDecay(0.3)
    .on("tick", onTick);
}

function onTick() {
  nodes.value = [...nodes.value];
  links.value = [...links.value];
  debouncedSavePositions();
}

function initZoom() {
  if (!svgEl.value || !zoomGroup.value) return;

  zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      d3.select(zoomGroup.value).attr("transform", event.transform);
    });

  d3.select(svgEl.value).call(zoom);
}

function spreadNodes() {
  const centerX = width.value / 2;
  const centerY = height.value / 2;
  
  nodes.value.forEach((n, i) => {
    const angle = (i / nodes.value.length) * Math.PI * 2;
    const radius = 200 + Math.random() * 150;
    n.x = centerX + Math.cos(angle) * radius;
    n.y = centerY + Math.sin(angle) * radius;
    n.vx = 0;
    n.vy = 0;
    n.fx = null;
    n.fy = null;
  });

  if (simulation) {
    simulation.alpha(0.8).restart();
  }
  
  nodes.value = [...nodes.value];
}

function resetLayout() {
  const centerX = width.value / 2;
  const centerY = height.value / 2;

  // Give each node a proper starting position
  const folderNodes = nodes.value.filter(n => n.type === 'folder');
  const modNodes = nodes.value.filter(n => n.type === 'mod');
  const packNodes = nodes.value.filter(n => n.type === 'modpack');

  folderNodes.forEach((n, i) => {
    const angle = (i / Math.max(folderNodes.length, 1)) * Math.PI * 2;
    n.x = centerX + Math.cos(angle) * 120;
    n.y = centerY + Math.sin(angle) * 120;
    n.vx = 0;
    n.vy = 0;
    n.fx = null;
    n.fy = null;
  });

  modNodes.forEach((n, i) => {
    const angle = (i / Math.max(modNodes.length, 1)) * Math.PI * 2;
    n.x = centerX + Math.cos(angle) * 280 + (Math.random() - 0.5) * 40;
    n.y = centerY + Math.sin(angle) * 280 + (Math.random() - 0.5) * 40;
    n.vx = 0;
    n.vy = 0;
    n.fx = null;
    n.fy = null;
  });

  packNodes.forEach((n, i) => {
    n.x = centerX + 350;
    n.y = centerY - 100 + i * 70;
    n.vx = 0;
    n.vy = 0;
    n.fx = null;
    n.fy = null;
  });

  if (simulation) {
    simulation.alpha(1).restart();
  }

  // Reset zoom
  if (svgEl.value && zoom) {
    d3.select(svgEl.value)
      .transition()
      .duration(500)
      .call(zoom.transform, d3.zoomIdentity);
  }

  nodes.value = [...nodes.value];
}

function onDragStart(event: MouseEvent | TouchEvent, node: GraphNode) {
  if (!simulation) return;

  const isTouch = event.type === "touchstart";
  const clientX = isTouch ? (event as TouchEvent).touches[0].clientX : (event as MouseEvent).clientX;
  const clientY = isTouch ? (event as TouchEvent).touches[0].clientY : (event as MouseEvent).clientY;

  const transform = d3.zoomTransform(svgEl.value!);
  const startX = (clientX - transform.x) / transform.k;
  const startY = (clientY - transform.y) / transform.k;
  const offsetX = startX - (node.x || 0);
  const offsetY = startY - (node.y || 0);

  // Disable collision and reduce charge during drag to prevent repulsion
  simulation.force("collision", null);
  simulation.force("charge", d3.forceManyBody().strength(-30));
  
  simulation.alphaTarget(0.1).restart();
  node.fx = node.x;
  node.fy = node.y;
  draggedNode.value = node;

  const onMove = (e: MouseEvent | TouchEvent) => {
    const cx = e.type.startsWith("touch") ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const cy = e.type.startsWith("touch") ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const t = d3.zoomTransform(svgEl.value!);
    node.fx = (cx - t.x) / t.k - offsetX;
    node.fy = (cy - t.y) / t.k - offsetY;

    // Check for drop target (mod over modpack OR folder)
    if (node.type === "mod") {
      const nodeX = node.fx!;
      const nodeY = node.fy!;
      let foundTarget: GraphNode | null = null;
      
      for (const other of nodes.value) {
        if ((other.type === "modpack" || other.type === "folder") && other.id !== node.id) {
          const dx = (other.x || 0) - nodeX;
          const dy = (other.y || 0) - nodeY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 40) {
            foundTarget = other;
            break;
          }
        }
      }
      // Fix the target in place during hover
      if (dropTarget.value && dropTarget.value !== foundTarget) {
        dropTarget.value.fx = null;
        dropTarget.value.fy = null;
      }
      if (foundTarget && foundTarget !== dropTarget.value) {
        foundTarget.fx = foundTarget.x;
        foundTarget.fy = foundTarget.y;
      }
      dropTarget.value = foundTarget;
    }
  };

  const onEnd = async () => {
    // Restore forces
    simulation!.force(
      "collision",
      d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 12)
    );
    simulation!.force("charge", d3.forceManyBody().strength(-150));
    simulation!.alphaTarget(0);
    
    // Save references before async operation (they might become null)
    const targetNode = dropTarget.value;
    
    // Handle drop: mod onto modpack
    if (node.type === "mod" && targetNode?.type === "modpack") {
      const modpackId = targetNode.data.id;
      const modId = node.data.id;
      const modLabel = node.label;
      const packLabel = targetNode.label;
      
      try {
        const success = await window.api.modpacks.addMod(modpackId, modId);
        
        if (success) {
          feedbackMessage.value = `Added "${modLabel}" to "${packLabel}"`;
          
          // Check if link already exists
          const linkExists = links.value.some(
            l => l.source.id === node.id && l.target.id === targetNode.id
          );
          
          // Add link visually only if it doesn't exist
          if (!linkExists) {
            links.value = [...links.value, { source: node, target: targetNode }];
          }
        } else {
          feedbackMessage.value = `Failed to add mod`;
        }
        setTimeout(() => { feedbackMessage.value = null; }, 2500);
      } catch (err) {
        const errorMsg = (err as Error).message;
        feedbackMessage.value = errorMsg.includes("Incompatible") ? errorMsg : `Error: ${errorMsg}`;
        console.error("Error adding mod to modpack:", err);
        setTimeout(() => { feedbackMessage.value = null; }, 3000);
      }
    }
    
    // Handle drop: mod onto folder
    if (node.type === "mod" && targetNode?.type === "folder") {
      const folderId = targetNode.data.id;
      const modId = node.data.id;
      const modLabel = node.label;
      const folderLabel = targetNode.label;
      
      try {
        moveModToFolder(modId, folderId);
        feedbackMessage.value = `Moved "${modLabel}" to "${folderLabel}"`;
        
        // Remove old folder link if exists
        links.value = links.value.filter(l => !(l.source.id === node.id && l.target.type === "folder"));
        
        // Add new link
        links.value = [...links.value, { source: node, target: targetNode }];
        
        setTimeout(() => { feedbackMessage.value = null; }, 2500);
      } catch (err) {
        console.error("Error moving mod to folder:", err);
        feedbackMessage.value = `Error moving mod`;
        setTimeout(() => { feedbackMessage.value = null; }, 3000);
      }
    }
    
    // Release all fixed positions
    if (targetNode) {
      targetNode.fx = null;
      targetNode.fy = null;
    }
    node.fx = null;
    node.fy = null;
    draggedNode.value = null;
    dropTarget.value = null;
    
    savePositions();
    
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onEnd);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onEnd);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchmove", onMove);
  window.addEventListener("touchend", onEnd);
}

// Context menu functions
function openContextMenu(event: MouseEvent, node: GraphNode) {
  const containerRect = container.value?.getBoundingClientRect();
  if (!containerRect) return;
  
  contextMenu.value = {
    show: true,
    x: event.clientX - containerRect.left,
    y: event.clientY - containerRect.top,
    node
  };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

async function contextAction(action: string) {
  const node = contextMenu.value.node;
  if (!node) return;
  
  closeContextMenu();
  
  switch (action) {
    case "centerOnNode":
      focusOnNode(node);
      break;
    case "viewMod":
      // Open detail panel
      detailNode.value = node;
      break;
    case "viewFolder":
      // Navigate to organize view
      router.push("/organize");
      break;
    case "viewModpack":
      // Navigate to modpacks view
      router.push("/modpacks");
      break;
    case "removeFolderAssignment":
      if (node.type === "mod") {
        moveModToFolder(node.data.id, null);
        // Remove folder link
        links.value = links.value.filter(l => !(l.source.id === node.id && l.target.type === "folder"));
        feedbackMessage.value = `Removed "${node.label}" from folder`;
        setTimeout(() => { feedbackMessage.value = null; }, 2000);
      }
      break;
    case "exportModpack":
      if (node.type === "modpack") {
        try {
          const exportPath = await window.api.scanner.selectExportPath(`${node.data.name}.zip`);
          if (exportPath) {
            await window.api.scanner.exportModpack(node.data.id, exportPath);
            feedbackMessage.value = `Exported "${node.label}"`;
            setTimeout(() => { feedbackMessage.value = null; }, 2500);
          }
        } catch (err) {
          feedbackMessage.value = `Export failed`;
          setTimeout(() => { feedbackMessage.value = null; }, 2500);
        }
      }
      break;
  }
}

// Search & focus
function focusOnNode(node: GraphNode) {
  if (!svgEl.value || !zoom) return;
  
  searchQuery.value = "";
  
  const x = node.x ?? width.value / 2;
  const y = node.y ?? height.value / 2;
  
  // Animate zoom to center on node
  const transform = d3.zoomIdentity
    .translate(width.value / 2, height.value / 2)
    .scale(1.5)
    .translate(-x, -y);
  
  d3.select(svgEl.value)
    .transition()
    .duration(500)
    .call(zoom.transform, transform);
}

onMounted(async () => {
  // Start observing theme changes
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
  
  if (container.value) {
    width.value = container.value.clientWidth;
    height.value = container.value.clientHeight;
  }

  await loadData();
  initZoom();
});

onBeforeUnmount(() => {
  if (simulation) simulation.stop();
  themeObserver.disconnect();
});
</script>

<style scoped>
.node-group {
  cursor: grab;
}
.node-group:active {
  cursor: grabbing;
}
.node-bg {
  transition: fill-opacity 0.15s ease;
}
.node-group:hover .node-bg {
  fill-opacity: 0.25;
}
.drop-target .node-bg {
  fill-opacity: 0.4;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.animate-pulse {
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
