import { ref, watch, onMounted, onBeforeUnmount, type Ref, shallowRef } from 'vue';
import * as PIXI from 'pixi.js';
import * as d3 from 'd3';

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
  node: GraphNode;
}

interface UsePixiGraphOptions {
  container: Ref<HTMLElement | null>;
  nodes: Ref<GraphNode[]>;
  links: Ref<GraphLink[]>;
  width: Ref<number>;
  height: Ref<number>;
  onNodeClick?: (node: GraphNode) => void;
  onNodeRightClick?: (event: MouseEvent, node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onBackgroundClick?: () => void;
}

export function usePixiGraph(options: UsePixiGraphOptions) {
  const {
    container,
    nodes,
    links,
    width,
    height,
    onNodeClick,
    onNodeRightClick,
    onNodeHover,
    onBackgroundClick,
  } = options;

  let app: PIXI.Application | null = null;
  let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
  let viewContainer: PIXI.Container | null = null;
  let linksGraphics: PIXI.Graphics | null = null;
  let nodesContainer: PIXI.Container | null = null;

  const nodeSprites = new Map<string, NodeSprite>();
  const isReady = ref(false);
  const currentZoom = ref(1);
  const hoveredNodeId = shallowRef<string | null>(null);
  const isDragging = ref(false);

  // Node colors by type
  const NODE_COLORS: Record<string, number> = {
    folder: 0xfbbf24,   // amber
    mod: 0x34d399,      // emerald
    modpack: 0x8b5cf6,  // violet
    resourcepack: 0x3b82f6, // blue
    shader: 0xec4899,   // pink
  };

  // Node radius by type
  function getNodeRadius(type: string): number {
    switch (type) {
      case 'folder': return 20;
      case 'modpack': return 18;
      default: return 14;
    }
  }

  async function init() {
    if (!container.value || app) return;

    // Create PIXI Application
    app = new PIXI.Application();
    await app.init({
      width: width.value,
      height: height.value,
      backgroundColor: 0x0a0a0b, // dark background
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.value.appendChild(app.canvas);

    // Create main view container for zoom/pan
    viewContainer = new PIXI.Container();
    app.stage.addChild(viewContainer);

    // Create links graphics layer
    linksGraphics = new PIXI.Graphics();
    viewContainer.addChild(linksGraphics);

    // Create nodes container
    nodesContainer = new PIXI.Container();
    viewContainer.addChild(nodesContainer);

    // Set up pan and zoom
    setupPanZoom();

    // Set up background click
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, width.value, height.value);
    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (e.target === app?.stage) {
        onBackgroundClick?.();
      }
    });

    isReady.value = true;
    
    // Initial render
    createNodeSprites();
    initSimulation();
  }

  function setupPanZoom() {
    if (!app || !viewContainer) return;

    let isDraggingView = false;
    let lastPosition = { x: 0, y: 0 };

    app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      // Middle mouse button or right for panning
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isDraggingView = true;
        lastPosition = { x: e.globalX, y: e.globalY };
      }
    });

    app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (isDraggingView && viewContainer) {
        const dx = e.globalX - lastPosition.x;
        const dy = e.globalY - lastPosition.y;
        viewContainer.x += dx;
        viewContainer.y += dy;
        lastPosition = { x: e.globalX, y: e.globalY };
      }
    });

    app.stage.on('pointerup', () => {
      isDraggingView = false;
    });

    app.stage.on('pointerupoutside', () => {
      isDraggingView = false;
    });

    // Wheel zoom
    container.value?.addEventListener('wheel', (e: WheelEvent) => {
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

    // Create new sprites
    for (const node of nodes.value) {
      const container = new PIXI.Container();
      container.eventMode = 'static';
      container.cursor = 'pointer';

      // Circle
      const circle = new PIXI.Graphics();
      const radius = getNodeRadius(node.type);
      const color = NODE_COLORS[node.type] || 0x6b7280;
      
      circle
        .circle(0, 0, radius)
        .fill({ color, alpha: 0.8 })
        .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });

      container.addChild(circle);

      // Label
      const label = new PIXI.Text({
        text: node.label.slice(0, 12),
        style: {
          fontSize: 10,
          fill: color,
          fontFamily: 'system-ui, sans-serif',
          fontWeight: '500',
        },
      });
      label.anchor.set(0.5, 0);
      label.y = radius + 4;
      container.addChild(label);

      // Position
      container.x = node.x ?? width.value / 2;
      container.y = node.y ?? height.value / 2;

      // Events
      container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        if (e.button === 2) {
          // Right click
          onNodeRightClick?.(e.nativeEvent as MouseEvent, node);
        } else if (e.button === 0) {
          // Left click - start drag or click
          startNodeDrag(node, e);
        }
      });

      container.on('pointerover', () => {
        hoveredNodeId.value = node.id;
        onNodeHover?.(node);
        // Highlight on hover
        circle.clear()
          .circle(0, 0, radius)
          .fill({ color, alpha: 1 })
          .stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
      });

      container.on('pointerout', () => {
        if (!isDragging.value) {
          hoveredNodeId.value = null;
          onNodeHover?.(null);
        }
        circle.clear()
          .circle(0, 0, radius)
          .fill({ color, alpha: 0.8 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
      });

      nodesContainer.addChild(container);
      nodeSprites.set(node.id, { container, circle, label, node });
    }
  }

  function startNodeDrag(node: GraphNode, e: PIXI.FederatedPointerEvent) {
    isDragging.value = true;
    const sprite = nodeSprites.get(node.id);
    if (!sprite || !app) return;

    let hasMoved = false;

    const onMove = (moveEvent: PIXI.FederatedPointerEvent) => {
      hasMoved = true;
      if (!viewContainer) return;
      
      // Convert screen position to world position
      const worldX = (moveEvent.globalX - viewContainer.x) / viewContainer.scale.x;
      const worldY = (moveEvent.globalY - viewContainer.y) / viewContainer.scale.y;

      node.x = worldX;
      node.y = worldY;
      node.fx = worldX; // Fix position during drag
      node.fy = worldY;

      sprite.container.x = worldX;
      sprite.container.y = worldY;
      
      updateLinks();
    };

    const onUp = () => {
      isDragging.value = false;
      app?.stage.off('pointermove', onMove);
      app?.stage.off('pointerup', onUp);
      app?.stage.off('pointerupoutside', onUp);

      // Release fixed position
      node.fx = null;
      node.fy = null;

      // If didn't move much, treat as click
      if (!hasMoved) {
        onNodeClick?.(node);
      }

      // Reheat simulation
      simulation?.alpha(0.3).restart();
    };

    app.stage.on('pointermove', onMove);
    app.stage.on('pointerup', onUp);
    app.stage.on('pointerupoutside', onUp);
  }

  function updateLinks() {
    if (!linksGraphics) return;

    linksGraphics.clear();

    for (const link of links.value) {
      const sourceNode = typeof link.source === 'object' ? link.source : null;
      const targetNode = typeof link.target === 'object' ? link.target : null;

      if (!sourceNode || !targetNode) continue;

      const x1 = sourceNode.x ?? 0;
      const y1 = sourceNode.y ?? 0;
      const x2 = targetNode.x ?? 0;
      const y2 = targetNode.y ?? 0;

      // Get link color based on types
      let lineColor = 0x4b5563; // gray default
      let alpha = 0.3;

      if (sourceNode.type === 'folder') {
        lineColor = 0xfbbf24; // amber
        alpha = 0.25;
      } else if (targetNode.type === 'modpack') {
        lineColor = 0x8b5cf6; // violet
        alpha = 0.25;
      }

      // Highlight links connected to hovered node
      if (hoveredNodeId.value) {
        if (sourceNode.id === hoveredNodeId.value || targetNode.id === hoveredNodeId.value) {
          alpha = 0.8;
        } else {
          alpha = 0.1;
        }
      }

      linksGraphics
        .moveTo(x1, y1)
        .lineTo(x2, y2)
        .stroke({ color: lineColor, width: 1.5, alpha });
    }
  }

  function updateNodePositions() {
    for (const node of nodes.value) {
      const sprite = nodeSprites.get(node.id);
      if (sprite) {
        sprite.container.x = node.x ?? 0;
        sprite.container.y = node.y ?? 0;

        // Fade non-connected nodes when hovering
        if (hoveredNodeId.value) {
          const isHovered = node.id === hoveredNodeId.value;
          const isConnected = links.value.some(
            (l) =>
              (l.source as GraphNode).id === hoveredNodeId.value && (l.target as GraphNode).id === node.id ||
              (l.target as GraphNode).id === hoveredNodeId.value && (l.source as GraphNode).id === node.id
          );
          sprite.container.alpha = isHovered || isConnected ? 1 : 0.2;
        } else {
          sprite.container.alpha = 1;
        }
      }
    }
    updateLinks();
  }

  function initSimulation() {
    if (simulation) simulation.stop();

    const centerX = width.value / 2;
    const centerY = height.value / 2;
    const nodeCount = nodes.value.length;

    // Adjust parameters based on graph size
    const chargeStrength = nodeCount > 200 ? -30 : nodeCount > 100 ? -80 : -150;
    const linkDistance = nodeCount > 200 ? 40 : nodeCount > 100 ? 50 : 80;

    simulation = d3
      .forceSimulation<GraphNode>(nodes.value)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links.value)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(0.2)
      )
      .force('charge', d3.forceManyBody().strength(chargeStrength).distanceMax(300))
      .force('center', d3.forceCenter(centerX, centerY).strength(0.05))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => getNodeRadius(d.type) + 10))
      .force('x', d3.forceX(centerX).strength(0.02))
      .force('y', d3.forceY(centerY).strength(0.02))
      .alphaDecay(0.02)
      .on('tick', updateNodePositions);
  }

  function zoomIn() {
    if (!viewContainer) return;
    const newScale = Math.min(viewContainer.scale.x * 1.3, 4);
    viewContainer.scale.set(newScale);
    currentZoom.value = newScale;
  }

  function zoomOut() {
    if (!viewContainer) return;
    const newScale = Math.max(viewContainer.scale.x * 0.7, 0.1);
    viewContainer.scale.set(newScale);
    currentZoom.value = newScale;
  }

  function fitToView() {
    if (!viewContainer || nodes.value.length === 0) return;

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.value.forEach((node) => {
      minX = Math.min(minX, node.x ?? 0);
      maxX = Math.max(maxX, node.x ?? 0);
      minY = Math.min(minY, node.y ?? 0);
      maxY = Math.max(maxY, node.y ?? 0);
    });

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;

    const scaleX = width.value / graphWidth;
    const scaleY = height.value / graphHeight;
    const scale = Math.min(scaleX, scaleY, 2) * 0.9;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    viewContainer.scale.set(scale);
    viewContainer.x = width.value / 2 - centerX * scale;
    viewContainer.y = height.value / 2 - centerY * scale;
    currentZoom.value = scale;
  }

  function resetLayout() {
    const centerX = width.value / 2;
    const centerY = height.value / 2;

    nodes.value.forEach((node, i) => {
      const angle = (i / nodes.value.length) * Math.PI * 2;
      const radius = 200 + Math.random() * 100;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
      node.fx = null;
      node.fy = null;
    });

    simulation?.alpha(1).restart();
    createNodeSprites();
  }

  function spreadNodes() {
    simulation?.force('charge', d3.forceManyBody().strength(-300).distanceMax(500));
    simulation?.alpha(1).restart();

    setTimeout(() => {
      simulation?.force('charge', d3.forceManyBody().strength(-150).distanceMax(300));
    }, 2000);
  }

  function resize(newWidth: number, newHeight: number) {
    if (app) {
      app.renderer.resize(newWidth, newHeight);
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
  }

  // Watch for node/link changes
  watch([nodes, links], () => {
    if (!isReady.value) return;
    createNodeSprites();
    initSimulation();
  }, { deep: true });

  // Watch for hover changes to update opacity
  watch(hoveredNodeId, () => {
    updateNodePositions();
  });

  // Watch for resize
  watch([width, height], ([w, h]) => {
    resize(w, h);
  });

  return {
    init,
    destroy,
    isReady,
    currentZoom,
    hoveredNodeId,
    zoomIn,
    zoomOut,
    fitToView,
    resetLayout,
    spreadNodes,
    updateNodePositions,
    createNodeSprites,
    initSimulation,
  };
}
