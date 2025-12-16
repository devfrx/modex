<template>
    <div ref="pixiContainer" class="w-full h-full" @contextmenu.prevent />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, shallowRef, nextTick } from 'vue';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';

// Types
export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    type: 'folder' | 'mod' | 'modpack' | 'resourcepack' | 'shader';
    label: string;
    color: string;
    data: any;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: GraphNode;
    target: GraphNode;
}

interface NodeSprite {
    container: PIXI.Container;
    circle: PIXI.Graphics;
    label: PIXI.Text;
    glow: PIXI.Graphics;
    node: GraphNode;
}

// Props
const props = defineProps<{
    nodes: GraphNode[];
    links: GraphLink[];
    width: number;
    height: number;
    performanceMode: boolean;
    showFolders: boolean;
    showMods: boolean;
    showModpacks: boolean;
    showResourcepacks: boolean;
    showShaders: boolean;
}>();

// Emits
const emit = defineEmits<{
    (e: 'nodeClick', node: GraphNode): void;
    (e: 'nodeRightClick', event: { x: number; y: number }, node: GraphNode): void;
    (e: 'nodeHover', node: GraphNode | null): void;
    (e: 'backgroundClick'): void;
    (e: 'nodeDrag', node: GraphNode, targetNode: GraphNode | null): void;
    (e: 'zoomChange', level: number): void;
    (e: 'positionsChanged', nodes: GraphNode[]): void;
}>();

// Refs
const pixiContainer = ref<HTMLElement | null>(null);
let app: PIXI.Application | null = null;
let viewContainer: PIXI.Container | null = null;
let linksGraphics: PIXI.Graphics | null = null;
let nodesContainer: PIXI.Container | null = null;
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;

const nodeSprites = new Map<string, NodeSprite>();
const isReady = ref(false);
const currentZoom = ref(1);
const hoveredNodeId = shallowRef<string | null>(null);
const isDragging = ref(false);
const draggedNode = shallowRef<GraphNode | null>(null);

// Colors
const NODE_COLORS: Record<string, number> = {
    folder: 0xfbbf24,     // amber
    mod: 0x34d399,        // emerald
    modpack: 0x8b5cf6,    // violet
    resourcepack: 0x3b82f6, // blue
    shader: 0xec4899,     // pink
};

// Computed
const filteredNodes = computed(() => {
    return props.nodes.filter((n) => {
        if (n.type === 'folder' && !props.showFolders) return false;
        if (n.type === 'mod' && !props.showMods) return false;
        if (n.type === 'modpack' && !props.showModpacks) return false;
        if (n.type === 'resourcepack' && !props.showResourcepacks) return false;
        if (n.type === 'shader' && !props.showShaders) return false;
        return true;
    });
});

const filteredLinks = computed(() => {
    const visibleIds = new Set(filteredNodes.value.map((n) => n.id));
    return props.links.filter(
        (l) => visibleIds.has(l.source.id) && visibleIds.has(l.target.id)
    );
});

// Node radius by type
function getNodeRadius(type: string): number {
    switch (type) {
        case 'folder': return 20;
        case 'modpack': return 18;
        default: return 14;
    }
}

// Initialize PixiJS
async function initPixi() {
    if (!pixiContainer.value || app) return;

    app = new PIXI.Application();

    // Detect theme from document
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? 0x0a0a0b : 0xfafafa;

    await app.init({
        width: props.width,
        height: props.height,
        backgroundColor: bgColor,
        antialias: !props.performanceMode,
        resolution: props.performanceMode ? 1 : (window.devicePixelRatio || 1),
        autoDensity: true,
        powerPreference: 'high-performance',
    });

    pixiContainer.value.appendChild(app.canvas);

    // Create main view container for zoom/pan
    viewContainer = new PIXI.Container();
    app.stage.addChild(viewContainer);

    // Create links graphics layer
    linksGraphics = new PIXI.Graphics();
    viewContainer.addChild(linksGraphics);

    // Create nodes container
    nodesContainer = new PIXI.Container();
    viewContainer.addChild(nodesContainer);

    // Set up interactions
    setupPanZoom();
    setupBackgroundClick();

    isReady.value = true;

    // Initial render
    await nextTick();
    createNodeSprites();
    initSimulation();
}

function setupBackgroundClick() {
    if (!app) return;

    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, props.width, props.height);
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.target === app?.stage && e.button === 0) {
            emit('backgroundClick');
        }
    });
}

function setupPanZoom() {
    if (!app || !viewContainer) return;

    let isPanning = false;
    let lastPos = { x: 0, y: 0 };

    // Pan with middle mouse or shift+left
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            isPanning = true;
            lastPos = { x: e.globalX, y: e.globalY };
            e.stopPropagation();
        }
    });

    app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
        if (isPanning && viewContainer) {
            const dx = e.globalX - lastPos.x;
            const dy = e.globalY - lastPos.y;
            viewContainer.x += dx;
            viewContainer.y += dy;
            lastPos = { x: e.globalX, y: e.globalY };
        }
    });

    app.stage.on('pointerup', () => { isPanning = false; });
    app.stage.on('pointerupoutside', () => { isPanning = false; });

    // Wheel zoom
    pixiContainer.value?.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        if (!viewContainer) return;

        const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.min(Math.max(viewContainer.scale.x * scaleFactor, 0.1), 4);

        // Zoom towards mouse position
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;

        const worldPos = {
            x: (mouseX - viewContainer.x) / viewContainer.scale.x,
            y: (mouseY - viewContainer.y) / viewContainer.scale.y,
        };

        viewContainer.scale.set(newScale);
        viewContainer.x = mouseX - worldPos.x * newScale;
        viewContainer.y = mouseY - worldPos.y * newScale;

        currentZoom.value = newScale;
        emit('zoomChange', Math.round(newScale * 100));
    }, { passive: false });
}

function createNodeSprites() {
    if (!nodesContainer) return;

    // Clear existing sprites
    nodeSprites.forEach((sprite) => {
        nodesContainer?.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
    });
    nodeSprites.clear();

    // Create new sprites for filtered nodes
    for (const node of filteredNodes.value) {
        const container = new PIXI.Container();
        container.eventMode = 'static';
        container.cursor = 'grab';

        const radius = getNodeRadius(node.type);
        const color = NODE_COLORS[node.type] || 0x6b7280;

        // Glow effect (for hover/selection)
        const glow = new PIXI.Graphics();
        glow.alpha = 0;
        container.addChild(glow);

        // Main circle
        const circle = new PIXI.Graphics();
        drawNodeCircle(circle, radius, color, false);
        container.addChild(circle);

        // Label
        const label = new PIXI.Text({
            text: node.label.slice(0, 14) + (node.label.length > 14 ? '…' : ''),
            style: {
                fontSize: props.performanceMode ? 9 : 10,
                fill: color,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontWeight: '500',
            },
        });
        label.anchor.set(0.5, 0);
        label.y = radius + 4;
        container.addChild(label);

        // Position
        container.x = node.x ?? props.width / 2;
        container.y = node.y ?? props.height / 2;

        // Events
        setupNodeEvents(container, circle, glow, label, node, radius, color);

        nodesContainer.addChild(container);
        nodeSprites.set(node.id, { container, circle, label, glow, node });
    }
}

function drawNodeCircle(graphics: PIXI.Graphics, radius: number, color: number, hovered: boolean) {
    graphics.clear();
    graphics
        .circle(0, 0, radius)
        .fill({ color, alpha: hovered ? 1 : 0.85 })
        .stroke({ color: 0xffffff, width: hovered ? 2 : 1, alpha: hovered ? 0.9 : 0.3 });
}

function drawNodeGlow(graphics: PIXI.Graphics, radius: number, color: number) {
    graphics.clear();
    graphics
        .circle(0, 0, radius + 8)
        .fill({ color, alpha: 0.15 });
}

function setupNodeEvents(
    container: PIXI.Container,
    circle: PIXI.Graphics,
    glow: PIXI.Graphics,
    _label: PIXI.Text,
    node: GraphNode,
    radius: number,
    color: number
) {
    let isDragActive = false;
    let hasMoved = false;
    let startPos = { x: 0, y: 0 };

    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.button === 2) {
            // Right click
            const rect = pixiContainer.value?.getBoundingClientRect();
            if (rect) {
                emit('nodeRightClick', { x: e.globalX - rect.left, y: e.globalY - rect.top }, node);
            }
            return;
        }

        if (e.button === 0 && !e.shiftKey) {
            isDragActive = true;
            isDragging.value = true;
            draggedNode.value = node;
            hasMoved = false;
            startPos = { x: e.globalX, y: e.globalY };
            container.cursor = 'grabbing';

            // Fix node position during drag
            node.fx = node.x;
            node.fy = node.y;
        }
    });

    container.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
        if (!isDragActive || !viewContainer) return;

        const dx = Math.abs(e.globalX - startPos.x);
        const dy = Math.abs(e.globalY - startPos.y);
        if (dx > 3 || dy > 3) hasMoved = true;

        // Convert screen to world position
        const worldX = (e.globalX - viewContainer.x) / viewContainer.scale.x;
        const worldY = (e.globalY - viewContainer.y) / viewContainer.scale.y;

        node.x = worldX;
        node.y = worldY;
        node.fx = worldX;
        node.fy = worldY;

        container.x = worldX;
        container.y = worldY;

        updateLinks();

        // Check for drop targets
        checkDropTarget(worldX, worldY, node);
    });

    const onPointerUp = () => {
        if (!isDragActive) return;

        isDragActive = false;
        isDragging.value = false;
        container.cursor = 'grab';

        // Release fixed position
        node.fx = null;
        node.fy = null;

        // Find drop target
        const dropTarget = findDropTarget(node);

        if (!hasMoved) {
            // Click
            emit('nodeClick', node);
        } else if (dropTarget) {
            // Dropped on a valid target
            emit('nodeDrag', node, dropTarget);
        }

        draggedNode.value = null;
        clearDropHighlights();

        // Notify positions changed
        emit('positionsChanged', filteredNodes.value);

        // Reheat simulation briefly
        simulation?.alpha(0.3).restart();
    };

    container.on('pointerup', onPointerUp);
    container.on('pointerupoutside', onPointerUp);

    // Hover effects
    container.on('pointerover', () => {
        if (isDragging.value && draggedNode.value?.id !== node.id) return;

        hoveredNodeId.value = node.id;
        emit('nodeHover', node);

        // Show hover effect
        drawNodeCircle(circle, radius, color, true);
        drawNodeGlow(glow, radius, color);
        glow.alpha = 1;
        container.zIndex = 1000;
        nodesContainer!.sortChildren();
    });

    container.on('pointerout', () => {
        if (isDragging.value && draggedNode.value?.id === node.id) return;

        hoveredNodeId.value = null;
        emit('nodeHover', null);

        // Hide hover effect
        drawNodeCircle(circle, radius, color, false);
        glow.alpha = 0;
        container.zIndex = 0;
        nodesContainer!.sortChildren();
    });
}

function checkDropTarget(x: number, y: number, draggedNode: GraphNode) {
    clearDropHighlights();

    // Only mods/resources/shaders can be dropped
    if (!['mod', 'resourcepack', 'shader'].includes(draggedNode.type)) return;

    for (const [id, sprite] of nodeSprites) {
        if (id === draggedNode.id) continue;

        const node = sprite.node;
        const dist = Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y);
        const radius = getNodeRadius(node.type);

        // Check if can be a drop target
        const canDrop =
            (node.type === 'folder') ||
            (node.type === 'modpack' && draggedNode.type === 'mod');

        if (canDrop && dist < radius + 20) {
            // Highlight as drop target
            sprite.glow.alpha = 1;
            drawNodeGlow(sprite.glow, radius, NODE_COLORS[node.type]);
        }
    }
}

function findDropTarget(draggedNode: GraphNode): GraphNode | null {
    const x = draggedNode.x ?? 0;
    const y = draggedNode.y ?? 0;

    for (const [id, sprite] of nodeSprites) {
        if (id === draggedNode.id) continue;

        const node = sprite.node;
        const dist = Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y);
        const radius = getNodeRadius(node.type);

        const canDrop =
            (node.type === 'folder') ||
            (node.type === 'modpack' && draggedNode.type === 'mod');

        if (canDrop && dist < radius + 20) {
            return node;
        }
    }
    return null;
}

function clearDropHighlights() {
    nodeSprites.forEach((sprite) => {
        if (sprite.node.id !== hoveredNodeId.value) {
            sprite.glow.alpha = 0;
        }
    });
}

function updateLinks() {
    if (!linksGraphics) return;

    linksGraphics.clear();

    const nodesToRender = props.performanceMode && filteredNodes.value.length > 300
        ? []
        : filteredLinks.value;

    for (const link of nodesToRender) {
        const sourceNode = typeof link.source === 'object' ? link.source : null;
        const targetNode = typeof link.target === 'object' ? link.target : null;

        if (!sourceNode || !targetNode) continue;

        const x1 = sourceNode.x ?? 0;
        const y1 = sourceNode.y ?? 0;
        const x2 = targetNode.x ?? 0;
        const y2 = targetNode.y ?? 0;

        // Get link color based on types
        let lineColor = 0x4b5563;
        let alpha = 0.25;

        if (sourceNode.type === 'folder') {
            lineColor = 0xfbbf24;
            alpha = 0.2;
        } else if (targetNode.type === 'modpack') {
            lineColor = 0x8b5cf6;
            alpha = 0.2;
        }

        // Highlight links connected to hovered node
        if (hoveredNodeId.value) {
            if (sourceNode.id === hoveredNodeId.value || targetNode.id === hoveredNodeId.value) {
                alpha = 0.8;
            } else {
                alpha = 0.05;
            }
        }

        linksGraphics
            .moveTo(x1, y1)
            .lineTo(x2, y2)
            .stroke({ color: lineColor, width: 1.5, alpha });
    }
}

function updateNodePositions() {
    for (const node of filteredNodes.value) {
        const sprite = nodeSprites.get(node.id);
        if (sprite) {
            sprite.container.x = node.x ?? 0;
            sprite.container.y = node.y ?? 0;

            // Fade non-connected nodes when hovering
            if (hoveredNodeId.value && !isDragging.value) {
                const isHovered = node.id === hoveredNodeId.value;
                const isConnected = filteredLinks.value.some(
                    (l) =>
                        ((l.source as GraphNode).id === hoveredNodeId.value && (l.target as GraphNode).id === node.id) ||
                        ((l.target as GraphNode).id === hoveredNodeId.value && (l.source as GraphNode).id === node.id)
                );
                sprite.container.alpha = isHovered || isConnected ? 1 : 0.15;
            } else {
                sprite.container.alpha = 1;
            }
        }
    }
    updateLinks();
}

function initSimulation() {
    if (simulation) simulation.stop();

    const centerX = props.width / 2;
    const centerY = props.height / 2;
    const nodeCount = filteredNodes.value.length;

    // Adjust parameters based on graph size and performance mode
    const isLarge = nodeCount > 100;
    const isVeryLarge = nodeCount > 200;

    const chargeStrength = isVeryLarge ? -20 : isLarge ? -50 : props.performanceMode ? -80 : -150;
    const linkDistance = isVeryLarge ? 35 : isLarge ? 45 : 80;
    const linkStrength = isVeryLarge ? 0.05 : isLarge ? 0.1 : 0.25;
    const alphaDecay = isVeryLarge ? 0.1 : isLarge ? 0.05 : props.performanceMode ? 0.03 : 0.01;

    simulation = d3
        .forceSimulation<GraphNode>(filteredNodes.value)
        .force(
            'link',
            d3
                .forceLink<GraphNode, GraphLink>(filteredLinks.value)
                .id((d) => d.id)
                .distance(linkDistance)
                .strength(linkStrength)
        )
        .force('charge', d3.forceManyBody().strength(chargeStrength).distanceMax(isVeryLarge ? 150 : 300))
        .force('center', d3.forceCenter(centerX, centerY).strength(0.05))
        .force('collision', isVeryLarge ? null : d3.forceCollide<GraphNode>().radius((d) => getNodeRadius(d.type) + 8))
        .force('x', d3.forceX(centerX).strength(0.02))
        .force('y', d3.forceY(centerY).strength(0.02))
        .alphaDecay(alphaDecay)
        .on('tick', onTick);

    // Stop simulation early for very large graphs
    if (isVeryLarge) {
        setTimeout(() => simulation?.stop(), 1500);
    } else if (isLarge) {
        setTimeout(() => simulation?.stop(), 3000);
    }
}

// Throttled tick
let lastTickTime = 0;
function onTick() {
    const now = Date.now();
    const throttle = props.performanceMode ? 50 : 16;
    if (now - lastTickTime < throttle) return;
    lastTickTime = now;

    updateNodePositions();
}

// Public methods exposed to parent
function zoomIn() {
    if (!viewContainer) return;
    const newScale = Math.min(viewContainer.scale.x * 1.3, 4);
    viewContainer.scale.set(newScale);
    currentZoom.value = newScale;
    emit('zoomChange', Math.round(newScale * 100));
}

function zoomOut() {
    if (!viewContainer) return;
    const newScale = Math.max(viewContainer.scale.x * 0.7, 0.1);
    viewContainer.scale.set(newScale);
    currentZoom.value = newScale;
    emit('zoomChange', Math.round(newScale * 100));
}

function fitToView() {
    if (!viewContainer || filteredNodes.value.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    filteredNodes.value.forEach((node) => {
        minX = Math.min(minX, node.x ?? 0);
        maxX = Math.max(maxX, node.x ?? 0);
        minY = Math.min(minY, node.y ?? 0);
        maxY = Math.max(maxY, node.y ?? 0);
    });

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;

    const scaleX = props.width / graphWidth;
    const scaleY = props.height / graphHeight;
    const scale = Math.min(scaleX, scaleY, 2) * 0.85;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    viewContainer.scale.set(scale);
    viewContainer.x = props.width / 2 - centerX * scale;
    viewContainer.y = props.height / 2 - centerY * scale;
    currentZoom.value = scale;
    emit('zoomChange', Math.round(scale * 100));
}

function resetLayout() {
    const centerX = props.width / 2;
    const centerY = props.height / 2;

    filteredNodes.value.forEach((node, i) => {
        const angle = (i / filteredNodes.value.length) * Math.PI * 2;
        const radius = 200 + Math.random() * 100;
        node.x = centerX + Math.cos(angle) * radius;
        node.y = centerY + Math.sin(angle) * radius;
        node.fx = null;
        node.fy = null;
    });

    createNodeSprites();
    initSimulation();
    emit('positionsChanged', filteredNodes.value);
}

function spreadNodes() {
    simulation?.force('charge', d3.forceManyBody().strength(-300).distanceMax(500));
    simulation?.alpha(1).restart();

    setTimeout(() => {
        simulation?.force('charge', d3.forceManyBody().strength(-150).distanceMax(300));
    }, 2000);
}

function focusOnNode(node: GraphNode) {
    if (!viewContainer) return;

    const x = node.x ?? props.width / 2;
    const y = node.y ?? props.height / 2;

    const scale = 1.5;
    viewContainer.scale.set(scale);
    viewContainer.x = props.width / 2 - x * scale;
    viewContainer.y = props.height / 2 - y * scale;
    currentZoom.value = scale;
    emit('zoomChange', Math.round(scale * 100));
}

function resize(newWidth: number, newHeight: number) {
    if (app) {
        app.renderer.resize(newWidth, newHeight);
        if (app.stage.hitArea) {
            app.stage.hitArea = new PIXI.Rectangle(0, 0, newWidth, newHeight);
        }
    }
}

function destroy() {
    simulation?.stop();
    simulation = null;

    nodeSprites.forEach((sprite) => {
        sprite.container.destroy({ children: true });
    });
    nodeSprites.clear();

    if (app) {
        app.destroy(true, { children: true, texture: true });
        app = null;
    }

    viewContainer = null;
    linksGraphics = null;
    nodesContainer = null;
    isReady.value = false;
}

// Expose methods
defineExpose({
    zoomIn,
    zoomOut,
    fitToView,
    resetLayout,
    spreadNodes,
    focusOnNode,
    resize,
    destroy,
    isReady,
    currentZoom,
});

// Watch for filter/node changes
watch(
    [filteredNodes, filteredLinks],
    () => {
        if (!isReady.value) return;
        createNodeSprites();
        initSimulation();
    },
    { deep: false }
);

// Watch for hover changes
watch(hoveredNodeId, () => {
    updateNodePositions();
});

// Watch for size changes
watch([() => props.width, () => props.height], ([w, h]) => {
    resize(w, h);
});

// Watch for performance mode changes
watch(() => props.performanceMode, () => {
    if (!isReady.value) return;
    // Reinitialize with new settings
    destroy();
    setTimeout(() => initPixi(), 50);
});

// Lifecycle
onMounted(async () => {
    await initPixi();
});

onBeforeUnmount(() => {
    destroy();
});
</script>
