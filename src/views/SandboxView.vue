<template>
  <div class="h-full flex flex-col bg-[#0c0c0c]">
    <!-- Header -->
    <div class="px-5 py-3 border-b border-white/5 flex items-center gap-4 flex-wrap">
      <h2 class="text-sm font-medium text-white/90">Sandbox</h2>
      <div class="flex gap-2 ml-auto">
        <button
          class="px-3 py-1.5 text-xs rounded-md bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
          @click="spreadNodes"
        >
          Spread
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded-md bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
          @click="resetLayout"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Legend -->
    <div class="px-5 py-2 border-b border-white/5 flex items-center gap-6 text-xs text-white/50">
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
      <span class="ml-auto text-white/30">{{ nodes.length }} nodes</span>
    </div>

    <!-- Canvas -->
    <div class="flex-1 relative overflow-hidden" ref="container">
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
        <rect width="100%" height="100%" fill="#0c0c0c"/>
        
        <!-- Subtle dots pattern -->
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.5" fill="rgba(255,255,255,0.05)"/>
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
              stroke="rgba(255,255,255,0.08)"
              stroke-width="1"
            />
          </g>

          <!-- Nodes -->
          <g class="nodes">
            <g
              v-for="node in nodes"
              :key="node.id"
              :transform="`translate(${node.x ?? 0}, ${node.y ?? 0})`"
              class="node-group"
              @mousedown="onDragStart($event, node)"
              @touchstart.prevent="onDragStart($event, node)"
            >
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

      <!-- Loading -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-[#0c0c0c]">
        <div class="text-white/40 text-sm">Loading...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, shallowRef } from "vue";
import { useFolderTree } from "@/composables/useFolderTree";
import type { Mod, Modpack } from "@/types/electron";
import * as d3 from "d3";

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

const { folders, getModFolder } = useFolderTree();

const width = ref(800);
const height = ref(600);
const container = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
const zoomGroup = ref<SVGGElement | null>(null);

const nodes = shallowRef<GraphNode[]>([]);
const links = shallowRef<GraphLink[]>([]);
const isLoading = ref(true);

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

const renderedLinks = computed(() => links.value);

function nodeRadius(node: GraphNode) {
  return node.type === "folder" ? 24 : node.type === "modpack" ? 22 : 18;
}

async function loadData() {
  isLoading.value = true;

  const mods: Mod[] = (await window.api.mods.getAll()) || [];
  const modpacks: Modpack[] = (await window.api.modpacks.getAll()) || [];

  const nodeList: GraphNode[] = [];
  const linkList: { source: string; target: string }[] = [];
  const nodeById = new Map<string, GraphNode>();

  const centerX = width.value / 2;
  const centerY = height.value / 2;

  // Folders - spread in a circle
  folders.value.forEach((f: any, i: number) => {
    const angle = (i / Math.max(folders.value.length, 1)) * Math.PI * 2;
    const radius = 150;
    const n: GraphNode = {
      id: f.id,
      type: "folder",
      label: f.name.slice(0, 12),
      color: f.color || "#6366f1",
      data: f,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
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
    const n: GraphNode = {
      id: m.id,
      type: "mod",
      label: (m.name || "mod").slice(0, 10),
      color: "#10b981",
      data: m,
      x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
      y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
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
    const n: GraphNode = {
      id: `pack_${pack.id}`,
      type: "modpack",
      label: (pack.name || "pack").slice(0, 10),
      color: "#f59e0b",
      data: pack,
      x: centerX + 400 + (Math.random() - 0.5) * 100,
      y: centerY - 150 + i * 80,
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

  simulation.alphaTarget(0.3).restart();
  node.fx = node.x;
  node.fy = node.y;

  const onMove = (e: MouseEvent | TouchEvent) => {
    const cx = e.type.startsWith("touch") ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const cy = e.type.startsWith("touch") ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const t = d3.zoomTransform(svgEl.value!);
    node.fx = (cx - t.x) / t.k - offsetX;
    node.fy = (cy - t.y) / t.k - offsetY;
  };

  const onEnd = () => {
    simulation!.alphaTarget(0);
    node.fx = null;
    node.fy = null;
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

onMounted(async () => {
  if (container.value) {
    width.value = container.value.clientWidth;
    height.value = container.value.clientHeight;
  }

  await loadData();
  initZoom();
});

onBeforeUnmount(() => {
  if (simulation) simulation.stop();
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
</style>
